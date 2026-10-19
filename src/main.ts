import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import JSZip from 'jszip';
import { applyStatic, getLang, initLang, setLang, t, type Lang } from './i18n';
import { compressBufferLocal, inspectBufferLocal, resolveSettings } from './engine';

initLang();

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTris(n: number): string {
  if (n >= 1_000_000) return t('unit.tris', { n: `${(n / 1_000_000).toFixed(2)}M` });
  if (n >= 1_000) return t('unit.tris', { n: `${(n / 1_000).toFixed(1)}k` });
  return t('unit.tris', { n });
}

function formatVerts(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

function savingsPercent(before: number, after: number): string {
  if (before <= 0) return '0%';
  const pct = ((before - after) / before) * 100;
  return t('savings', { pct: pct.toFixed(0) });
}

class ModelViewer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private loader: GLTFLoader;
  private ktx2Ready: Promise<void>;
  private model: THREE.Object3D | null = null;
  private animId = 0;
  private cssWidth = 0;
  private cssHeight = 0;
  // 对比模式：同步视角相关
  private viewDist = 1;
  private syncTarget: ModelViewer | null = null;
  private syncing = false;
  private savedPosition: THREE.Vector3 | null = null;
  private savedTarget: THREE.Vector3 | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    // WebGL 上下文创建失败时给出明确提示，而不是整页静默空白
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
      });
    } catch (err) {
      console.error('WebGL init error:', err);
      throw new Error(t('alert.webgl'));
    }
    this.renderer = renderer;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf2f5f9);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 200);
    this.camera.position.set(1.8, 1.2, 1.8);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 1.2;
    // 释放滚轮给页面滚动；缩放模型改为 Ctrl + 滚轮。
    // 注意：canvas 的 touch-action:none 会让 Chrome 合成器跳过该区域的默认滚动，
    // 因此普通滚轮要手动转发为页面 scrollBy。
    this.controls.enableZoom = false;
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.dolly(e.deltaY > 0 ? 1.12 : 0.89);
          return;
        }
        const px =
          e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
        window.scrollBy(0, px);
      },
      { passive: false }
    );

    // 对比模式：拖动一侧时，另一侧以相同角度、相同屏幕占比跟随
    this.controls.addEventListener('change', () => {
      if (this.syncTarget && !this.syncing) this.syncTo(this.syncTarget);
    });

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // 防御1：WebGL 上下文丢失（显存紧张/驱动重置时发生，表现为预览区突然全白）。
    // preventDefault 让浏览器尝试恢复；恢复后重建环境贴图与尺寸。
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('WebGL context lost, waiting for restore…');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      console.warn('WebGL context restored, rebuilding…');
      this.buildEnvironment();
      if (this.cssWidth > 0 && this.cssHeight > 0) {
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(this.cssWidth, this.cssHeight, false);
        this.camera.aspect = this.cssWidth / this.cssHeight;
        this.camera.updateProjectionMatrix();
      }
    });

    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(3, 5, 2);
    this.scene.add(key);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));

    const draco = new DRACOLoader();
    draco.setDecoderPath('/draco/');
    this.loader = new GLTFLoader();
    this.loader.setDRACOLoader(draco);

    // 支持 KTX2 / Basis 压缩贴图（AI 生成模型和部分网上下载的模型常用）。
    // detectSupport(renderer) 是异步的：必须等 transcoder 就绪后再加载，
    // 否则含 KTX2 贴图的模型会报 "Missing initialization" 导致预览空白。
    this.ktx2Ready = (async () => {
      const ktx2 = new KTX2Loader()
        .setTranscoderPath('/basis/')
        .detectSupport(this.renderer);
      await ktx2.ready;
      this.loader.setKTX2Loader(ktx2);
    })().catch((err) => {
      console.warn('KTX2Loader init failed:', err);
    });

    this.animate = this.animate.bind(this);
    this.animate();
  }

  resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    this.cssWidth = width;
    this.cssHeight = height;
    // 防御2：窗口在不同 DPI 屏幕间移动或浏览器缩放时，同步最新 devicePixelRatio
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (this.renderer.getPixelRatio() !== ratio) {
      this.renderer.setPixelRatio(ratio);
    }
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private buildEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }

  clear() {
    if (this.model) {
      this.scene.remove(this.model);
      this.model.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => m.dispose());
        }
      });
      this.model = null;
    }
  }

  async loadUrl(url: string) {
    this.clear();
    // KTX2 transcoder 未就绪就加载贴图会直接失败（表现为预览空白）
    await this.ktx2Ready;
    let gltf: { scene: THREE.Object3D };
    try {
      gltf = await this.loader.loadAsync(url);
    } catch (err) {
      console.error('GLTF load error:', err);
      throw new Error(t('alert.parseFail'));
    }

    // 检查模型里是否有可显示的几何体，避免"加载成功但一片空白"
    let meshCount = 0;
    let indexedTris = 0;
    gltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        meshCount++;
        const geo = obj.geometry as THREE.BufferGeometry;
        const pos = geo?.getAttribute?.('position');
        if (pos) {
          indexedTris += geo.index
            ? Math.floor(geo.index.count / 3)
            : Math.floor(pos.count / 3);
        }
      }
    });
    if (meshCount === 0 || indexedTris === 0) {
      throw new Error(t('alert.noMesh'));
    }

    this.model = gltf.scene;
    try {
      this.frameModel(this.model);
      this.scene.add(this.model);
    } catch (err) {
      // 取景失败必须移除场景对象，否则半渲染的模型会卡在画面里
      this.clear();
      throw err;
    }
  }

  private frameModel(object: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // 尺寸异常（为 0 或 NaN）时无法取景，给出明确错误
    if (!Number.isFinite(maxDim) || maxDim <= 0) {
      throw new Error(t('alert.badSize'));
    }

    const dist = maxDim * 1.8;
    this.viewDist = dist;

    object.position.sub(center);
    this.camera.position.set(dist * 0.7, dist * 0.55, dist * 0.7);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    // 记录初始视角，供"重置视角"恢复
    this.savedPosition = this.camera.position.clone();
    this.savedTarget = this.controls.target.clone();
  }

  // 沿视线方向推拉相机（Ctrl+滚轮缩放），并限制在合理距离内
  private dolly(factor: number) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    let d = offset.length() * factor;
    d = Math.min(Math.max(d, this.viewDist * 0.15), this.viewDist * 8);
    offset.setLength(d);
    this.camera.position.copy(this.controls.target.clone().add(offset));
    this.controls.update();
  }

  // 把本视图的观察姿态（方向 + 按模型尺寸归一化的距离）同步给另一个预览
  syncTo(target: ModelViewer) {
    if (!target || this.syncing || target.syncing) return;
    this.syncing = true;
    target.syncing = true;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const dir = offset.clone().normalize();
    const d = offset.length();
    const scale = (d / this.viewDist) * target.viewDist;
    target.camera.position.copy(target.controls.target.clone().add(dir.multiplyScalar(scale)));
    target.controls.update();
    target.syncing = false;
    this.syncing = false;
  }

  setSyncTarget(target: ModelViewer | null) {
    this.syncTarget = target;
    // 同步期间关闭自动旋转，避免两侧旋转不同步
    if (target) {
      this.controls.autoRotate = false;
      target.controls.autoRotate = false;
    } else {
      this.controls.autoRotate = true;
    }
  }

  resetView() {
    if (!this.savedPosition || !this.savedTarget) return;
    this.camera.position.copy(this.savedPosition);
    this.controls.target.copy(this.savedTarget);
    this.controls.update();
  }

  private animate() {
    this.animId = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.animId);
    this.clear();
    this.renderer.dispose();
  }
}

// ── DOM refs ──
const dropzone = document.getElementById('dropzone')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const hero = document.getElementById('hero')!;
const sizeBefore = document.getElementById('size-before')!;
const sizeAfter = document.getElementById('size-after')!;
const savingsBadge = document.getElementById('savings-badge')!;
const heroSub = document.getElementById('hero-sub')!;
const fileMeta = document.getElementById('file-meta')!;
const fileNameEl = document.getElementById('file-name')!;
const fileTrisEl = document.getElementById('file-tris')!;
const controls = document.getElementById('controls')!;
const presetCards = document.getElementById('preset-cards')!;
const qualityInput = document.getElementById('quality') as HTMLInputElement;
const qualityHint = document.getElementById('quality-hint')!;
const compressBtn = document.getElementById('compress-btn')!;
const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;
const beforeStat = document.getElementById('before-stat')!;
const afterStat = document.getElementById('after-stat')!;
const emptyBefore = document.getElementById('empty-before')!;
const emptyAfter = document.getElementById('empty-after')!;
const emptyBeforeText = document.getElementById('empty-before-text')!;
const emptyAfterText = document.getElementById('empty-after-text')!;

// 对比模式相关
const modeTabs = document.querySelectorAll<HTMLButtonElement>('.mode-tab');
const compressPanel = document.getElementById('compress-panel')!;
const comparePanel = document.getElementById('compare-panel')!;
const tagBefore = document.getElementById('tag-before')!;
const tagAfter = document.getElementById('tag-after')!;
const heroLabel = document.getElementById('hero-label')!;
const dropzoneA = document.getElementById('dropzone-a')!;
const dropzoneB = document.getElementById('dropzone-b')!;
const fileAInput = document.getElementById('file-a') as HTMLInputElement;
const fileBInput = document.getElementById('file-b') as HTMLInputElement;
const statNameA = document.getElementById('stat-name-a')!;
const statNameB = document.getElementById('stat-name-b')!;
const statRowsA = document.getElementById('stat-rows-a')!;
const statRowsB = document.getElementById('stat-rows-b')!;
const resetViewBtn = document.getElementById('reset-view-btn') as HTMLButtonElement;

// 批量模式相关
const batchPanel = document.getElementById('batch-panel')!;
const batchDropzone = document.getElementById('batch-dropzone')!;
const batchInput = document.getElementById('batch-input') as HTMLInputElement;
const batchQuality = document.getElementById('batch-quality') as HTMLInputElement;
const batchQualityHint = document.getElementById('batch-quality-hint')!;
const batchPresetCards = document.getElementById('batch-preset-cards')!;
const batchStartBtn = document.getElementById('batch-start-btn') as HTMLButtonElement;
const batchList = document.getElementById('batch-list')!;
const batchDownloadBtn = document.getElementById('batch-download-btn') as HTMLButtonElement;

const workspaceEl = document.querySelector('.workspace') as HTMLElement;

const canvasBefore = document.getElementById('canvas-before') as HTMLCanvasElement;
const canvasAfter = document.getElementById('canvas-after') as HTMLCanvasElement;

const viewerBefore = new ModelViewer(canvasBefore);
const viewerAfter = new ModelViewer(canvasAfter);

let currentFile: File | null = null;
let sourceBlobUrl: string | null = null;
let outputBlobUrl: string | null = null;
let outputFileName = 'model-draco.glb';
let lastCompressInfo: { sourceSize: number; outputSize: number; sourceTris: number; tris: number } | null = null;
let lastInspectData: { tris: number; fileSize: number } | null = null;

// 对比模式状态
type Mode = 'compress' | 'compare' | 'batch';
let mode: Mode = 'compress';
interface CompareStats {
  fileSize: number;
  tris: number;
  verts: number;
  textures?: { mimeType: string }[];
}
interface CompareModel {
  file: File;
  blobUrl: string;
  stats: CompareStats;
}
const compareData: { a: CompareModel | null; b: CompareModel | null } = { a: null, b: null };

function hintForQuality(q: number): string {
  if (q <= 20) return t('hint.min');
  if (q <= 40) return t('hint.small');
  if (q <= 60) return t('hint.balanced');
  if (q <= 80) return t('hint.more');
  return t('hint.max');
}

function syncPresetCards(quality: number) {
  presetCards.querySelectorAll('.preset-card').forEach((card) => {
    const q = Number((card as HTMLElement).dataset.quality);
    card.classList.toggle('active', Math.abs(q - quality) < 1);
  });
  qualityHint.textContent = hintForQuality(quality);
}

function setQuality(quality: number) {
  qualityInput.value = String(quality);
  syncPresetCards(quality);
}

presetCards.addEventListener('click', (e) => {
  const card = (e.target as HTMLElement).closest('.preset-card') as HTMLElement | null;
  if (!card) return;
  setQuality(Number(card.dataset.quality));
});

qualityInput.addEventListener('input', () => {
  syncPresetCards(Number(qualityInput.value));
});

let resizeScheduled = false;
function doResizeViewers() {
  resizeScheduled = false;
  const cards = document.querySelectorAll('.viewer-card');
  cards.forEach((card, i) => {
    const viewer = i === 0 ? viewerBefore : viewerAfter;
    const rect = card.getBoundingClientRect();
    viewer.resize(rect.width, rect.height);
  });
}
function resizeViewers() {
  if (resizeScheduled) return;
  resizeScheduled = true;
  requestAnimationFrame(doResizeViewers);
}

window.addEventListener('resize', resizeViewers);
new ResizeObserver(resizeViewers).observe(document.querySelector('.viewers')!);
// 防御3：从后台标签页 / 最小化恢复时，强制重新测量一次
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') resizeViewers();
});

function updateHero(beforeBytes: number, afterBytes: number, beforeTris: number, afterTris: number) {
  hero.hidden = false;
  sizeBefore.textContent = formatBytes(beforeBytes);
  sizeAfter.textContent = formatBytes(afterBytes);
  savingsBadge.textContent = savingsPercent(beforeBytes, afterBytes);
  heroSub.textContent = `${formatTris(beforeTris)} → ${formatTris(afterTris)} · ${t('hero.pipeline')}`;
}

async function handleFile(file: File) {
  if (!file.name.toLowerCase().endsWith('.glb')) {
    alert(t('alert.notGlb'));
    return;
  }

  currentFile = file;
  try {
    if (sourceBlobUrl) URL.revokeObjectURL(sourceBlobUrl);
    if (outputBlobUrl) URL.revokeObjectURL(outputBlobUrl);
    outputBlobUrl = null;
    downloadBtn.hidden = true;
    viewerAfter.clear();
    emptyAfter.classList.remove('hidden');
    afterStat.textContent = '—';

    sourceBlobUrl = URL.createObjectURL(file);
    await viewerBefore.loadUrl(sourceBlobUrl);
    emptyBefore.classList.add('hidden');

    // 预览渲染成功才显示文件名与控件，避免"界面说已加载但画面空白"
    fileMeta.hidden = false;
    fileNameEl.textContent = file.name;
    controls.hidden = false;

    const data = await inspectBufferLocal(await file.arrayBuffer());
    lastInspectData = { tris: data.tris, fileSize: data.fileSize };
    fileTrisEl.textContent = `${formatTris(data.tris)} · ${formatBytes(data.fileSize)}`;
    beforeStat.textContent = formatBytes(data.fileSize);
    hero.hidden = false;
    sizeBefore.textContent = formatBytes(data.fileSize);
    sizeAfter.textContent = '—';
    savingsBadge.textContent = t('hero.ready');
    heroSub.textContent = `${formatTris(data.tris)} · ${t('hero.pickQuality')}`;
  } catch (err) {
    // 加载或分析失败：恢复空状态，并给出明确提示，避免界面卡死
    if (currentFile === file) currentFile = null;
    viewerBefore.clear();
    emptyBefore.classList.remove('hidden');
    emptyAfter.classList.remove('hidden');
    afterStat.textContent = '—';
    beforeStat.textContent = '—';
    fileMeta.hidden = true;
    controls.hidden = true;
    downloadBtn.hidden = true;
    hero.hidden = true;
    alert(err instanceof Error ? t('alert.modelFail', { msg: err.message }) : t('alert.modelFail', { msg: '' }));
  }
}

dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) void handleFile(file);
  fileInput.value = '';
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const file = e.dataTransfer?.files[0];
  if (file) void handleFile(file);
});

compressBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  const btnLabel = compressBtn.querySelector('.btn-label')!;
  const spinner = compressBtn.querySelector('.btn-spinner')!;
  compressBtn.setAttribute('disabled', 'true');
  btnLabel.textContent = t('btn.compressing');
  spinner.hidden = false;

  try {
    const profile = resolveSettings(Number(qualityInput.value));
    const result = await compressBufferLocal(await currentFile.arrayBuffer(), profile);
    outputFileName = currentFile.name.replace(/\.glb$/i, '-draco.glb');

    if (outputBlobUrl) URL.revokeObjectURL(outputBlobUrl);
    outputBlobUrl = URL.createObjectURL(
      new Blob([result.output.slice().buffer], { type: 'model/gltf-binary' })
    );

    // 先渲染成功再隐藏占位，避免"空状态消失但画面也是空白"
    await viewerAfter.loadUrl(outputBlobUrl);
    emptyAfter.classList.add('hidden');

    afterStat.textContent = formatBytes(result.outputSize);
    lastCompressInfo = {
      sourceSize: currentFile.size,
      outputSize: result.outputSize,
      sourceTris: result.sourceTris,
      tris: result.stats.tris,
    };
    updateHero(currentFile.size, result.outputSize, result.sourceTris, result.stats.tris);
    downloadBtn.hidden = false;
  } catch (err) {
    // 压缩结果预览失败：恢复空状态提示，不留下半渲染界面
    viewerAfter.clear();
    emptyAfter.classList.remove('hidden');
    afterStat.textContent = '—';
    alert(err instanceof Error ? err.message : t('alert.compressFail'));
  } finally {
    compressBtn.removeAttribute('disabled');
    btnLabel.textContent = t('btn.compress');
    spinner.hidden = true;
  }
});

downloadBtn.addEventListener('click', () => {
  if (!outputBlobUrl) return;
  const a = document.createElement('a');
  a.href = outputBlobUrl;
  a.download = outputFileName;
  a.click();
});

void resizeViewers();
syncPresetCards(50);

// ── 对比模式 ──

function updateCompareHero() {
  const a = compareData.a;
  const b = compareData.b;
  if (!a && !b) {
    hero.hidden = true;
    return;
  }
  hero.hidden = false;
  sizeBefore.textContent = a ? formatBytes(a.stats.fileSize) : '—';
  sizeAfter.textContent = b ? formatBytes(b.stats.fileSize) : '—';
  if (a && b) {
    const aSize = a.stats.fileSize;
    const bSize = b.stats.fileSize;
    if (aSize < bSize) {
      savingsBadge.textContent = t('compare.aSmaller', { pct: (((bSize - aSize) / bSize) * 100).toFixed(0) });
    } else if (aSize > bSize) {
      savingsBadge.textContent = t('compare.aLarger', { pct: (((aSize - bSize) / aSize) * 100).toFixed(0) });
    } else {
      savingsBadge.textContent = t('compare.equal');
    }
    heroSub.textContent = t('compare.trisVs', { a: formatTris(a.stats.tris), b: formatTris(b.stats.tris) });
  } else if (a) {
    savingsBadge.textContent = t('compare.waitingB');
    heroSub.textContent = t('compare.waitingA2', { tris: formatTris(a.stats.tris) });
  } else {
    savingsBadge.textContent = t('compare.waitingA');
    heroSub.textContent = t('compare.waitingB2', { tris: formatTris(b!.stats.tris) });
  }
}

function renderStatCard(side: 'a' | 'b') {
  const data = compareData[side];
  const nameEl = side === 'a' ? statNameA : statNameB;
  const rowsEl = side === 'a' ? statRowsA : statRowsB;
  const statEl = side === 'a' ? beforeStat : afterStat;
  if (!data) {
    nameEl.textContent = '—';
    rowsEl.innerHTML = '';
    statEl.textContent = '—';
    return;
  }
  nameEl.textContent = data.file.name;
  const s = data.stats;
  rowsEl.innerHTML = [
    [t('compare.stat.size'), formatBytes(s.fileSize)],
    [t('compare.stat.tris'), formatTris(s.tris)],
    [t('compare.stat.verts'), formatVerts(s.verts)],
    [t('compare.stat.textures'), `${s.textures?.length ?? 0}`],
  ]
    .map(
      ([k, v]) =>
        `<div class="stat-row"><span>${k}</span><b>${v}</b></div>`
    )
    .join('');
  statEl.textContent = formatBytes(s.fileSize);
}

async function loadCompareModel(side: 'a' | 'b', file: File) {
  if (!file.name.toLowerCase().endsWith('.glb')) {
    alert(t('alert.notGlb'));
    return;
  }
  const viewer = side === 'a' ? viewerBefore : viewerAfter;
  const empty = side === 'a' ? emptyBefore : emptyAfter;
  try {
    const blobUrl = URL.createObjectURL(file);
    if (compareData[side]) URL.revokeObjectURL(compareData[side]!.blobUrl);
    // 先渲染成功再隐藏占位，避免"界面显示已加载但画面空白"
    await viewer.loadUrl(blobUrl);
    empty.classList.add('hidden');

    const stats: CompareStats = await inspectBufferLocal(await file.arrayBuffer());
    compareData[side] = { file, blobUrl, stats };
    renderStatCard(side);
    updateCompareHero();
    resetViewBtn.hidden = !(compareData.a && compareData.b);

    // 两个模型都就位后，用模型 A 的视角对齐模型 B，保证起始一致
    if (compareData.a && compareData.b && side === 'b') {
      viewerBefore.syncTo(viewerAfter);
    }
  } catch (err) {
    viewer.clear();
    empty.classList.remove('hidden');
    renderStatCard(side);
    alert(err instanceof Error ? t('alert.modelFail', { msg: err.message }) : t('alert.modelFail', { msg: '' }));
  }
}

function bindCompareUpload(dropEl: HTMLElement, input: HTMLInputElement, side: 'a' | 'b') {
  dropEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    if (f) void loadCompareModel(side, f);
    input.value = '';
  });
  dropEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropEl.classList.add('dragover');
  });
  dropEl.addEventListener('dragleave', () => dropEl.classList.remove('dragover'));
  dropEl.addEventListener('drop', (e) => {
    e.preventDefault();
    dropEl.classList.remove('dragover');
    const f = e.dataTransfer?.files[0];
    if (f) void loadCompareModel(side, f);
  });
}
bindCompareUpload(dropzoneA, fileAInput, 'a');
bindCompareUpload(dropzoneB, fileBInput, 'b');

resetViewBtn.addEventListener('click', () => {
  viewerBefore.resetView();
  viewerAfter.resetView();
});

function switchMode(next: Mode) {
  if (mode === next) return;
  mode = next;
  modeTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.mode === next);
  });
  compressPanel.hidden = next !== 'compress';
  comparePanel.hidden = next !== 'compare';
  batchPanel.hidden = next !== 'batch';

  if (next === 'batch') {
    // 批量模式：关闭对比同步，隐藏 hero，单列布局（隐藏预览区）
    workspaceEl.classList.add('single-col');
    viewerBefore.setSyncTarget(null);
    viewerAfter.setSyncTarget(null);
    tagBefore.textContent = t('tag.before');
    tagAfter.textContent = t('tag.after');
    emptyBeforeText.textContent = t('empty.before');
    emptyAfterText.textContent = t('empty.after');
    heroLabel.textContent = t('hero.labelSize');
    hero.hidden = true;
  } else if (next === 'compare') {
    // 进入对比模式：开启双向视角同步、关闭自动旋转
    workspaceEl.classList.remove('single-col');
    viewerAfter.setSyncTarget(viewerBefore);
    tagBefore.textContent = t('tag.modelA');
    tagAfter.textContent = t('tag.modelB');
    emptyBeforeText.textContent = t('tag.modelA');
    emptyAfterText.textContent = t('tag.modelB');
    heroLabel.textContent = t('hero.labelModels');
    resetViewBtn.hidden = !(compareData.a && compareData.b);
    updateCompareHero();
  } else {
    // 回到压缩模式：关闭同步、恢复自动旋转
    workspaceEl.classList.remove('single-col');
    viewerBefore.setSyncTarget(null);
    viewerAfter.setSyncTarget(null);
    tagBefore.textContent = t('tag.before');
    tagAfter.textContent = t('tag.after');
    emptyBeforeText.textContent = t('empty.before');
    emptyAfterText.textContent = t('empty.after');
    heroLabel.textContent = t('hero.labelSize');
    if (lastCompressInfo) {
      updateHero(
        lastCompressInfo.sourceSize,
        lastCompressInfo.outputSize,
        lastCompressInfo.sourceTris,
        lastCompressInfo.tris
      );
    } else if (currentFile && sourceBlobUrl) {
      hero.hidden = false;
      sizeBefore.textContent = formatBytes(currentFile.size);
      sizeAfter.textContent = '—';
      savingsBadge.textContent = t('hero.ready');
      heroSub.textContent = t('hero.pickQuality');
    } else {
      hero.hidden = true;
    }
  }
}

modeTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const m = tab.dataset.mode;
    if (m === 'compress' || m === 'compare' || m === 'batch') switchMode(m);
  });
});

// ── 批量压缩 ──

interface BatchItem {
  file: File;
  status: 'pending' | 'working' | 'done' | 'failed';
  error?: string;
  outputSize?: number;
  outputName?: string;
  outputBytes?: Uint8Array;
  tris?: number;
}
let batchItems: BatchItem[] = [];
const BATCH_MAX = 20;

function syncBatchPresets(quality: number) {
  batchPresetCards.querySelectorAll('.preset-card').forEach((card) => {
    const q = Number((card as HTMLElement).dataset.quality);
    card.classList.toggle('active', Math.abs(q - quality) < 1);
  });
  batchQualityHint.textContent = hintForQuality(quality);
}

function addBatchFiles(fileList: FileList | File[]) {
  const files = Array.from(fileList);
  let added = 0;
  for (const f of files) {
    if (!f.name.toLowerCase().endsWith('.glb')) continue;
    if (batchItems.some((it) => it.file.name === f.name && it.file.size === f.size)) continue;
    if (batchItems.length >= BATCH_MAX) {
      alert(t('batch.limit'));
      break;
    }
    batchItems.push({ file: f, status: 'pending' });
    added++;
  }
  if (added > 0) renderBatchList();
  batchStartBtn.disabled = batchItems.length === 0;
}

function batchStatusText(s: BatchItem['status']): string {
  return t(`batch.status.${s}`);
}

function renderBatchList() {
  batchList.innerHTML = '';
  batchItems.forEach((item) => {
    const el = document.createElement('div');
    el.className = `batch-item ${
      item.status === 'done' ? 'done' : item.status === 'failed' ? 'failed' : ''
    }`;
    let info: string;
    if (item.status === 'done' && item.outputSize != null) {
      info = `<span>${formatBytes(item.file.size)} → <b>${formatBytes(item.outputSize)}</b> <span class="saved">(${savingsPercent(item.file.size, item.outputSize)})</span> · ${formatTris(item.tris ?? 0)}</span>`;
    } else if (item.status === 'failed') {
      info = `<span style="color:var(--before)">${item.error ?? t('alert.compressFail')}</span>`;
    } else {
      info = `<span>${formatBytes(item.file.size)} → —</span>`;
    }
    el.innerHTML = `
      <div class="batch-item-main">
        <span class="batch-item-name">${item.file.name}</span>
        <span class="batch-item-status" data-state="${item.status}">${batchStatusText(item.status)}</span>
      </div>
      <div class="batch-item-info">${info}</div>`;
    batchList.appendChild(el);
  });
}

async function startBatch() {
  const quality = batchQuality.value;
  const btnLabel = batchStartBtn.querySelector('.btn-label')!;
  const spinner = batchStartBtn.querySelector('.btn-spinner')!;
  batchStartBtn.setAttribute('disabled', 'true');
  btnLabel.textContent = t('batch.starting');
  spinner.hidden = false;
  batchDownloadBtn.hidden = true;

  // 串行处理，逐个压缩并刷新列表状态
  const profile = resolveSettings(Number(quality));
  for (const item of batchItems) {
    if (item.status === 'done' || item.status === 'failed') continue;
    item.status = 'working';
    renderBatchList();
    try {
      const result = await compressBufferLocal(await item.file.arrayBuffer(), profile);
      item.status = 'done';
      item.outputSize = result.outputSize;
      item.outputName = item.file.name.replace(/\.glb$/i, '-draco.glb');
      item.outputBytes = result.output;
      item.tris = result.stats.tris;
    } catch (err) {
      item.status = 'failed';
      item.error = err instanceof Error ? err.message : t('alert.compressFail');
    }
    renderBatchList();
  }

  batchStartBtn.removeAttribute('disabled');
  btnLabel.textContent = t('batch.start');
  spinner.hidden = true;
  const done = batchItems.filter((i) => i.status === 'done').length;
  const failed = batchItems.filter((i) => i.status === 'failed').length;
  batchDownloadBtn.hidden = done === 0;
  if (failed > 0) alert(t('batch.summary', { done, failed }));
}

async function batchDownloadZip() {
  const doneItems = batchItems.filter((i) => i.status === 'done' && i.outputBytes);
  if (doneItems.length === 0) return;
  const zip = new JSZip();
  const folder = zip.folder('compressed')!;
  for (const item of doneItems) {
    folder.file(item.outputName ?? item.file.name.replace(/\.glb$/i, '-draco.glb'), item.outputBytes!);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `glb-compressed-${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

batchDropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    batchInput.click();
  }
});
batchInput.addEventListener('change', () => {
  if (batchInput.files) addBatchFiles(batchInput.files);
  batchInput.value = '';
});
batchDropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  batchDropzone.classList.add('dragover');
});
batchDropzone.addEventListener('dragleave', () => batchDropzone.classList.remove('dragover'));
batchDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  batchDropzone.classList.remove('dragover');
  if (e.dataTransfer?.files) addBatchFiles(e.dataTransfer.files);
});
batchQuality.addEventListener('input', () => {
  syncBatchPresets(Number(batchQuality.value));
});
batchPresetCards.addEventListener('click', (e) => {
  const card = (e.target as HTMLElement).closest('.preset-card') as HTMLElement | null;
  if (!card) return;
  batchQuality.value = String(Number(card.dataset.quality));
  syncBatchPresets(Number(batchQuality.value));
});
syncBatchPresets(50);
batchStartBtn.addEventListener('click', () => void startBatch());
batchDownloadBtn.addEventListener('click', () => void batchDownloadZip());

// ── 语言切换 ──

const TITLES: Record<Lang, string> = {
  en: 'GLB Shrink — Free Online GLB Compressor | Compress 3D Models',
  zh: 'GLB Shrink — 免费在线 GLB 模型压缩工具',
};

/** 语言切换后，把当前可见的动态文案重新渲染一遍 */
function refreshDynamicTexts() {
  document.title = TITLES[getLang()];

  if (mode === 'compare') {
    tagBefore.textContent = t('tag.modelA');
    tagAfter.textContent = t('tag.modelB');
    emptyBeforeText.textContent = t('tag.modelA');
    emptyAfterText.textContent = t('tag.modelB');
    heroLabel.textContent = t('hero.labelModels');
    updateCompareHero();
  } else {
    tagBefore.textContent = t('tag.before');
    tagAfter.textContent = t('tag.after');
    emptyBeforeText.textContent = t('empty.before');
    emptyAfterText.textContent = t('empty.after');
    heroLabel.textContent = t('hero.labelSize');
    if (mode === 'compress') {
      if (lastCompressInfo) {
        updateHero(
          lastCompressInfo.sourceSize,
          lastCompressInfo.outputSize,
          lastCompressInfo.sourceTris,
          lastCompressInfo.tris
        );
      } else if (lastInspectData) {
        savingsBadge.textContent = t('hero.ready');
        heroSub.textContent = `${formatTris(lastInspectData.tris)} · ${t('hero.pickQuality')}`;
      }
    }
  }

  syncPresetCards(Number(qualityInput.value));
  syncBatchPresets(Number(batchQuality.value));
  if (!compressBtn.hasAttribute('disabled')) {
    compressBtn.querySelector('.btn-label')!.textContent = t('btn.compress');
  }
  if (!batchStartBtn.hasAttribute('disabled')) {
    batchStartBtn.querySelector('.btn-label')!.textContent = t('batch.start');
  }
  if (lastInspectData) {
    fileTrisEl.textContent = `${formatTris(lastInspectData.tris)} · ${formatBytes(lastInspectData.fileSize)}`;
  }
  renderStatCard('a');
  renderStatCard('b');
  renderBatchList();
}

const langBtns = document.querySelectorAll<HTMLButtonElement>('.lang-btn');
function updateLangBtns() {
  langBtns.forEach((b) => b.classList.toggle('active', b.dataset.lang === getLang()));
}
langBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    setLang(btn.dataset.lang === 'zh' ? 'zh' : 'en');
    updateLangBtns();
    refreshDynamicTexts();
  });
});

const seoYear = document.getElementById('seo-year');
if (seoYear) seoYear.textContent = String(new Date().getFullYear());

applyStatic();
updateLangBtns();
