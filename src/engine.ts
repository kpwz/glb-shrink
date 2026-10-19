// 浏览器端 GLB 压缩引擎：完整移植自 server/compress.mjs 管线，
// 压缩全程在用户浏览器本地完成，无需任何后端服务。
import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup, draco } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

// ── 质量预设（与后端 presets.mjs 完全一致）──
const SMALLEST = { simplifyRatio: 0.004, simplifyError: 0.02, textureEdge: 256 };
const BALANCED = { simplifyRatio: 0.008, simplifyError: 0.02, textureEdge: 384 };
const SHARPEST = { simplifyRatio: 0.035, simplifyError: 0.01, textureEdge: 512 };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPreset(
  from: { simplifyRatio: number; simplifyError: number; textureEdge: number },
  to: { simplifyRatio: number; simplifyError: number; textureEdge: number },
  t: number
) {
  return {
    simplifyRatio: lerp(from.simplifyRatio, to.simplifyRatio, t),
    simplifyError: lerp(from.simplifyError, to.simplifyError, t),
    textureEdge: Math.round(lerp(from.textureEdge, to.textureEdge, t)),
  };
}

export interface CompressProfile {
  quality: number;
  simplifyRatio: number;
  simplifyError: number;
  textureEdge: number;
}

export function resolveSettings(qualityInput: number): CompressProfile {
  const quality = Math.max(0, Math.min(100, Number(qualityInput) || 50));
  const t = quality / 100;
  if (t <= 0.5) return { quality, ...lerpPreset(SMALLEST, BALANCED, t * 2) };
  return { quality, ...lerpPreset(BALANCED, SHARPEST, (t - 0.5) * 2) };
}

// ── WebP 编码能力检测（Safari 旧版等不支持时降级保留原图）──
let webpSupport: boolean | null = null;
export function isWebPSupported(): boolean {
  if (webpSupport !== null) return webpSupport;
  try {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    webpSupport = c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    webpSupport = false;
  }
  return webpSupport;
}

// ── Draco 模块：复用 public/draco 的浏览器版 wasm（script 注入）──
// three 版 draco 文件的全局名是 DracoDecoderModule / DracoEncoderModule（注意大小写）
declare global {
  interface Window {
    DracoEncoderModule?: () => Promise<any>;
    DracoDecoderModule?: () => Promise<any>;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-engine-src="${src}"]`
    );
    if (existing) {
      if (existing.dataset.loaded === '1') return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load ' + src)));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.dataset.engineSrc = src;
    s.onload = () => {
      s.dataset.loaded = '1';
      resolve();
    };
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

let ioPromise: Promise<WebIO> | null = null;

async function getIO(): Promise<WebIO> {
  if (!ioPromise) {
    ioPromise = (async () => {
      await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
      await Promise.all([
        loadScript('/draco/draco_decoder_gltf.js'),
        loadScript('/draco/draco_encoder_gltf.js'),
      ]);
      const decoderFactory = window.DracoDecoderModule;
      const encoderFactory = window.DracoEncoderModule;
      if (!decoderFactory || !encoderFactory) {
        throw new Error('Draco modules unavailable');
      }
      const io = new WebIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({
          'draco3d.decoder': await decoderFactory(),
          'draco3d.encoder': await encoderFactory(),
          'meshopt.decoder': MeshoptDecoder,
          'meshopt.encoder': MeshoptEncoder,
        });
      return io;
    })().catch((err) => {
      ioPromise = null;
      throw err;
    });
  }
  return ioPromise;
}

// 让出主线程，保证压缩过程中页面 UI（spinner、状态）不卡死
function yieldUI(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function countTris(root: any): number {
  let tris = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      if (indices) tris += Math.floor(indices.getCount() / 3);
    }
  }
  return tris;
}

function collectMeshStats(root: any) {
  let verts = 0;
  let tris = 0;
  const bbox = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute('POSITION');
      const indices = prim.getIndices();
      if (position) {
        verts += position.getCount();
        const arr = position.getArray();
        if (arr) {
          for (let i = 0; i < arr.length; i += 3) {
            bbox.min[0] = Math.min(bbox.min[0], arr[i]);
            bbox.min[1] = Math.min(bbox.min[1], arr[i + 1]);
            bbox.min[2] = Math.min(bbox.min[2], arr[i + 2]);
            bbox.max[0] = Math.max(bbox.max[0], arr[i]);
            bbox.max[1] = Math.max(bbox.max[1], arr[i + 1]);
            bbox.max[2] = Math.max(bbox.max[2], arr[i + 2]);
          }
        }
      }
      if (indices) {
        tris += Math.floor(indices.getCount() / 3);
      } else if (position) {
        tris += Math.floor(position.getCount() / 3);
      }
    }
  }
  return { verts, tris, bbox };
}

export interface LocalStats {
  meshCount: number;
  verts: number;
  tris: number;
  bbox: { min: number[]; max: number[]; size: number[] };
  textures: { name: string; mimeType: string; bytes: number }[];
  extensions: string[];
}

// ── 纹理转换：canvas 版 WebP 编码 + 缩放（替代 Node 的 sharp）──
async function convertTextures(doc: any, edge: number, quality = 75): Promise<void> {
  const webp = isWebPSupported();
  for (const tex of doc.getRoot().listTextures()) {
    const mime: string = tex.getMimeType();
    const image: Uint8Array | null = tex.getImage();
    if (!image) continue;
    // KTX2 等 GPU 压缩纹理 canvas 解不了，原样保留
    if (mime === 'image/ktx2') continue;
    try {
      const blob = new Blob([image], { type: mime });
      const bmp = await createImageBitmap(blob);
      const maxSide = Math.max(bmp.width, bmp.height);
      const scale = Math.min(1, edge / maxSide);
      // 尺寸无需缩小、且已是 webp（或浏览器不支持 webp 编码）→ 跳过
      if (scale === 1 && (webp ? mime === 'image/webp' : true)) {
        bmp.close();
        continue;
      }
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bmp.close();
        continue;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, w, h);
      bmp.close();
      const outMime = webp ? 'image/webp' : mime === 'image/jpeg' ? 'image/jpeg' : 'image/png';
      const outBlob: Blob | null = await new Promise((r) =>
        canvas.toBlob(r, outMime, quality / 100)
      );
      if (!outBlob) continue;
      const buf = new Uint8Array(await outBlob.arrayBuffer());
      // 只有确实变小才替换，避免负优化
      if (buf.byteLength < image.byteLength) {
        tex.setImage(buf).setMimeType(outMime);
      }
    } catch (err) {
      // 解码失败（罕见格式）：保留原图，不影响整体压缩
      console.warn('Texture conversion skipped:', tex.getName(), err);
    }
  }
}

// ── 重算平滑法线（与后端 rebakeSmoothNormals 一致）──
function rebakeSmoothNormals(doc: any, root: any): void {
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute('POSITION');
      const indices = prim.getIndices();
      if (!position || !indices) continue;

      const posArr = position.getArray() as ArrayLike<number>;
      const idxArr = indices.getArray() as ArrayLike<number>;
      if (!posArr || !idxArr) continue;

      const vCount = position.getCount();
      const normals = new Float32Array(vCount * 3);

      for (let t = 0; t < idxArr.length; t += 3) {
        const a = idxArr[t];
        const b = idxArr[t + 1];
        const c = idxArr[t + 2];

        const ax = posArr[a * 3], ay = posArr[a * 3 + 1], az = posArr[a * 3 + 2];
        const bx = posArr[b * 3], by = posArr[b * 3 + 1], bz = posArr[b * 3 + 2];
        const cx = posArr[c * 3], cy = posArr[c * 3 + 1], cz = posArr[c * 3 + 2];

        const abx = bx - ax, aby = by - ay, abz = bz - az;
        const acx = cx - ax, acy = cy - ay, acz = cz - az;

        const nx = aby * acz - abz * acy;
        const ny = abz * acx - abx * acz;
        const nz = abx * acy - aby * acx;

        normals[a * 3] += nx; normals[a * 3 + 1] += ny; normals[a * 3 + 2] += nz;
        normals[b * 3] += nx; normals[b * 3 + 1] += ny; normals[b * 3 + 2] += nz;
        normals[c * 3] += nx; normals[c * 3 + 1] += ny; normals[c * 3 + 2] += nz;
      }

      for (let i = 0; i < vCount; i++) {
        const nx = normals[i * 3];
        const ny = normals[i * 3 + 1];
        const nz = normals[i * 3 + 2];
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len > 1e-8) {
          normals[i * 3] = nx / len;
          normals[i * 3 + 1] = ny / len;
          normals[i * 3 + 2] = nz / len;
        } else {
          normals[i * 3] = 0;
          normals[i * 3 + 1] = 1;
          normals[i * 3 + 2] = 0;
        }
      }

      const existingNormal = prim.getAttribute('NORMAL');
      if (existingNormal) {
        existingNormal.setArray(normals).setType('VEC3').setNormalized(false);
      } else {
        const accessor = doc.createAccessor().setArray(normals).setType('VEC3');
        prim.setAttribute('NORMAL', accessor);
      }
    }
  }
}

// ── 分析（本地版 inspect）──
export async function inspectBufferLocal(buffer: ArrayBuffer): Promise<LocalStats & { fileSize: number }> {
  const io = await getIO();
  const doc = await io.readBinary(new Uint8Array(buffer));
  const root = doc.getRoot();
  const { verts, tris, bbox } = collectMeshStats(root);
  const textures = root
    .listTextures()
    .map((tex: any) => ({
      name: tex.getName() || '(unnamed)',
      mimeType: tex.getMimeType(),
      bytes: tex.getImage()?.byteLength ?? 0,
    }));
  const extensions = root
    .listExtensionsUsed()
    .map((ext: any) => ext.extensionName);
  return {
    fileSize: buffer.byteLength,
    meshCount: root.listMeshes().length,
    verts,
    tris,
    bbox: {
      min: bbox.min.map((v: number) => (Number.isFinite(v) ? v : 0)),
      max: bbox.max.map((v: number) => (Number.isFinite(v) ? v : 0)),
      size: bbox.max.map((v: number, i: number) =>
        Number.isFinite(v) && Number.isFinite(bbox.min[i]) ? v - bbox.min[i] : 0
      ),
    },
    textures,
    extensions,
  };
}

// ── 压缩（完整管线，与后端一致）──
export interface LocalCompressResult {
  output: Uint8Array;
  outputSize: number;
  sourceTris: number;
  stats: LocalStats;
}

export async function compressBufferLocal(
  buffer: ArrayBuffer,
  profile: CompressProfile
): Promise<LocalCompressResult> {
  const io = await getIO();
  const doc = await io.readBinary(new Uint8Array(buffer));
  const root = doc.getRoot();

  // 先移除已有的压缩扩展（Draco/quantization/meshopt），拿到原始网格
  for (const ext of root.listExtensionsUsed()) {
    const name = ext.extensionName;
    if (
      name === 'KHR_draco_mesh_compression' ||
      name === 'KHR_mesh_quantization' ||
      name === 'EXT_meshopt_compression'
    ) {
      ext.dispose();
    }
  }

  const sourceTris = countTris(root);
  await yieldUI();

  // 焊接顶点 → 网格精简 → 去重 → 清理
  await doc.transform(
    weld({}),
    simplify({
      simplifier: MeshoptSimplifier,
      ratio: profile.simplifyRatio,
      error: profile.simplifyError,
      lockBorder: false,
    }),
    dedup(),
    prune({ keepAttributes: false })
  );
  await yieldUI();

  rebakeSmoothNormals(doc, root);
  await yieldUI();

  await convertTextures(doc, profile.textureEdge);
  await yieldUI();

  // 最终清理 + Draco 压缩
  await doc.transform(
    prune(),
    dedup(),
    draco({
      method: 'edgebreaker',
      quantizePosition: 14,
      quantizeNormal: 10,
      quantizeTexcoord: 12,
      quantizeGeneric: 12,
    })
  );
  await yieldUI();

  const output = await io.writeBinary(doc);
  const stats = await inspectBufferLocal(
    output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer
  );

  return {
    output,
    outputSize: output.byteLength,
    sourceTris,
    stats,
  };
}
