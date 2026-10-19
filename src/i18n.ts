// 双语字典：英文为默认（面向海外 SEO），可一键切换中文
export type Lang = 'en' | 'zh';

const dict: Record<string, { en: string; zh: string }> = {
  // 品牌与导航
  'brand.tagline': {
    en: 'Draco + WebP compression for real-time 3D',
    zh: 'Draco + WebP 压缩，专为实时 3D 场景优化',
  },
  'tab.compress': { en: 'Compress', zh: '单模型压缩' },
  'tab.compare': { en: 'Compare', zh: '双模型对比' },
  'tab.batch': { en: 'Batch', zh: '批量压缩' },

  // 单模型压缩
  'drop.title': { en: 'Drop your GLB model here', zh: '把 GLB 模型拖到这里' },
  'drop.hint': {
    en: 'or click to choose · up to 200 MB',
    zh: '或点击选择文件 · 最大支持 200 MB',
  },
  'quality.question': {
    en: 'How much do you want to compress?',
    zh: '希望压缩到什么程度？',
  },
  'preset.min': { en: 'Smallest', zh: '最小体积' },
  'preset.minHint': {
    en: 'For background props',
    zh: '适合远景背景物',
  },
  'preset.balanced': { en: 'Balanced', zh: '均衡模式' },
  'preset.balancedHint': {
    en: 'Best for most projects',
    zh: '适合大多数场景',
  },
  'preset.max': { en: 'Max detail', zh: '高保真' },
  'preset.maxHint': {
    en: 'For close-up viewing',
    zh: '适合近距离特写',
  },
  'tune.left': { en: 'Smaller file', zh: '更小体积' },
  'tune.right': { en: 'More detail', zh: '更清晰细节' },
  'btn.compress': { en: 'Compress model', zh: '开始压缩' },
  'btn.compressing': { en: 'Compressing…', zh: '正在压缩…' },
  'btn.download': {
    en: 'Download compressed GLB',
    zh: '下载压缩后的 GLB 模型',
  },

  // 顶部对比条
  'hero.labelSize': { en: 'File size', zh: '文件大小对比' },
  'hero.labelModels': { en: 'Model size', zh: '模型大小对比' },
  'hero.ready': { en: 'Ready to compress', zh: '可以开始压缩' },
  'hero.pickQuality': {
    en: 'Choose quality and hit Compress',
    zh: '选择质量后点击开始压缩',
  },
  'hero.pipeline': {
    en: 'Draco geometry + WebP textures',
    zh: 'Draco 几何 + WebP 贴图',
  },
  'savings': { en: '{pct}% smaller', zh: '体积减少 {pct}%' },

  // 预览区标签
  'tag.before': { en: 'Before', zh: '压缩前' },
  'tag.after': { en: 'After', zh: '压缩后' },
  'tag.modelA': { en: 'Model A', zh: '模型 A' },
  'tag.modelB': { en: 'Model B', zh: '模型 B' },
  'empty.before': { en: 'Original model', zh: '原始模型' },
  'empty.after': { en: 'Compressed preview', zh: '压缩后预览' },
  'viewer.hint': {
    en: 'Drag to rotate · Ctrl + scroll to zoom',
    zh: '拖动旋转 · Ctrl+滚轮缩放',
  },

  // 对比模式
  'compare.intro': {
    en: 'Drop two models below. Drag either viewer — the other follows with the same angle and scale, so you can compare quality side by side.',
    zh: '把两个模型分别拖进来。拖动任意一侧旋转，另一侧会同步跟随、保持相同角度和比例，方便逐角度对比质量。',
  },
  'compare.dropA': { en: 'Model A', zh: '模型 A' },
  'compare.dropB': { en: 'Model B', zh: '模型 B' },
  'compare.stat.size': { en: 'File size', zh: '文件大小' },
  'compare.stat.tris': { en: 'Triangles', zh: '三角形' },
  'compare.stat.verts': { en: 'Vertices', zh: '顶点' },
  'compare.stat.textures': { en: 'Textures', zh: '贴图数量' },
  'compare.reset': {
    en: 'Reset view',
    zh: '重置视角（回到初始角度）',
  },
  'compare.aSmaller': {
    en: 'Model A is {pct}% smaller than B',
    zh: '模型 A 比 B 小 {pct}%',
  },
  'compare.aLarger': {
    en: 'Model A is {pct}% larger than B',
    zh: '模型 A 比 B 大 {pct}%',
  },
  'compare.equal': { en: 'Both models are the same size', zh: '两个模型大小相同' },
  'compare.waitingA': { en: 'Model A not uploaded', zh: '模型 A 待上传' },
  'compare.waitingB': { en: 'Model B not uploaded', zh: '模型 B 待上传' },
  'compare.waitingA2': {
    en: 'A: {tris} · waiting for Model B',
    zh: 'A: {tris} · 等待模型 B',
  },
  'compare.waitingB2': {
    en: 'B: {tris} · waiting for Model A',
    zh: 'B: {tris} · 等待模型 A',
  },
  'compare.trisVs': { en: 'A: {a} vs B: {b}', zh: 'A: {a} vs B: {b}' },

  // 批量模式
  'batch.dropTitle': {
    en: 'Drop multiple GLB models here',
    zh: '把多个 GLB 模型拖到这里',
  },
  'batch.dropHint': {
    en: 'or click to select · up to 20 files · 200 MB each',
    zh: '或点击选择 · 可多选 · 最多 20 个 · 每个最大 200 MB',
  },
  'batch.start': { en: 'Start batch compression', zh: '开始批量压缩' },
  'batch.starting': { en: 'Compressing…', zh: '正在批量压缩…' },
  'batch.download': { en: 'Download all (ZIP)', zh: '打包下载全部（zip）' },
  'batch.status.pending': { en: 'Waiting', zh: '等待中' },
  'batch.status.working': { en: 'Compressing…', zh: '压缩中…' },
  'batch.status.done': { en: 'Done', zh: '完成' },
  'batch.status.failed': { en: 'Failed', zh: '失败' },
  'batch.limit': {
    en: 'Up to 20 models at a time — extras were ignored.',
    zh: '一次最多上传 20 个模型，多余的已忽略。',
  },
  'batch.summary': {
    en: 'Done: {done}, failed: {failed}. Failed items are marked in red.',
    zh: '完成 {done} 个，失败 {failed} 个（失败的已标红）。',
  },

  // 质量提示
  'hint.min': {
    en: 'Smallest file — best for background props you barely notice.',
    zh: '体积最小 — 适合几乎注意不到的远景背景物。',
  },
  'hint.small': {
    en: 'Small file — good for distant scene objects.',
    zh: '小体积 — 适合较远的场景物体。',
  },
  'hint.balanced': {
    en: 'Balanced — the sweet spot for most projects.',
    zh: '均衡模式 — 大多数项目的最佳选择。',
  },
  'hint.more': {
    en: 'More detail — edges and textures stay sharper.',
    zh: '更多细节 — 边缘和贴图更清晰。',
  },
  'hint.max': {
    en: 'Maximum detail — for close-up viewing, larger file size.',
    zh: '细节最多 — 适合近距离特写，文件体积较大。',
  },

  // 单位
  'unit.tris': { en: '{n} triangles', zh: '{n} 三角形' },

  // 提示与错误
  'alert.notGlb': {
    en: 'Please choose a .glb file.',
    zh: '请选择 .glb 格式的模型文件。',
  },
  'alert.noService': {
    en: 'Cannot reach the compression service. Make sure the server is running.',
    zh: '无法连接压缩服务，请确认启动脚本正在运行。',
  },
  'alert.modelFail': {
    en: 'Model failed to load: {msg}',
    zh: '模型处理失败：{msg}',
  },
  'alert.parseFail': {
    en: 'Failed to parse the model. Please make sure it is a valid GLB file.',
    zh: '模型解析失败，请确认是有效的 GLB 文件。',
  },
  'alert.noMesh': {
    en: 'This model has no visible geometry to preview.',
    zh: '这个模型里没有可显示的几何体，无法预览。',
  },
  'alert.badSize': {
    en: 'The model has an invalid bounding size and cannot be framed.',
    zh: '模型尺寸异常，无法自动取景预览。',
  },
  'alert.webgl': {
    en: 'Your browser cannot enable WebGL, so 3D preview is unavailable. Try another browser or enable hardware acceleration.',
    zh: '当前浏览器无法启用 WebGL，无法显示 3D 预览。请更换浏览器或开启硬件加速。',
  },
  'alert.compressFail': { en: 'Compression failed', zh: '压缩失败' },
  'alert.inspectFail': { en: 'Model analysis failed', zh: '模型分析失败' },
  'alert.serviceDownBatch': {
    en: 'Cannot reach the compression service — please make sure it is running',
    zh: '无法连接压缩服务，请确认启动脚本正在运行',
  },

  // 页脚
  'footer.supports': {
    en: 'Works with Three.js · Unity · Unreal · Godot',
    zh: '兼容 Three.js / Unity / Unreal / Godot',
  },

  // 底部 SEO 文案区
  'seo.what.title': {
    en: 'What is GLB Shrink?',
    zh: 'GLB Shrink 是什么？',
  },
  'seo.what.body': {
    en: 'GLB Shrink is a free online GLB compressor. Drag in a .glb 3D model and it applies Draco mesh compression plus WebP texture conversion, typically shrinking files by 80–99% while keeping the model looking great in Three.js, Unity, Unreal Engine, Godot, and AR/VR viewers.',
    zh: 'GLB Shrink 是一款免费在线 GLB 压缩工具。拖入 .glb 三维模型后，自动应用 Draco 网格压缩和 WebP 贴图转换，通常可将文件体积减少 80–99%，同时在 Three.js、Unity、Unreal、Godot 和 AR/VR 场景中保持出色画质。',
  },
  'seo.how.title': { en: 'How to compress a GLB file', zh: '如何压缩 GLB 文件' },
  'seo.step1': {
    en: 'Drop your .glb model into the compressor.',
    zh: '把 .glb 模型拖进压缩工具。',
  },
  'seo.step2': {
    en: 'Pick a quality level — smallest, balanced, or maximum detail.',
    zh: '选择压缩程度 — 最小体积、均衡或高保真。',
  },
  'seo.step3': {
    en: 'Compare before / after side by side, then download the optimized GLB.',
    zh: '左右对比压缩前后效果，然后下载优化后的 GLB。',
  },
  'seo.feat.title': { en: 'Features', zh: '功能特性' },
  'seo.feat1': {
    en: 'Draco geometry compression — fewer triangles, tiny files',
    zh: 'Draco 网格压缩 — 三角形精简，体积骤减',
  },
  'seo.feat2': {
    en: 'WebP texture conversion — sharper images at a fraction of the size',
    zh: 'WebP 贴图转换 — 更小体积更清晰贴图',
  },
  'seo.feat3': {
    en: 'Side-by-side 3D preview with synced camera to verify quality',
    zh: '同步视角 3D 对比预览，质量眼见为实',
  },
  'seo.feat4': {
    en: 'Batch compression — process up to 20 models and download a ZIP',
    zh: '批量压缩 — 一次处理 20 个模型，打包 ZIP 下载',
  },
  'seo.faq.title': { en: 'FAQ', zh: '常见问题' },
  'seo.faq1.q': {
    en: 'Is GLB Shrink free to use?',
    zh: 'GLB Shrink 是免费的吗？',
  },
  'seo.faq1.a': {
    en: 'Yes — GLB Shrink is completely free right now. All three tools (compress, compare, batch) are open to everyone. In the future we may introduce optional credit packs to help cover server costs, but core compression will always have a free tier.',
    zh: '是的 — GLB Shrink 目前完全免费，压缩、对比、批量三个功能所有人都可以免费使用。未来为了覆盖服务器成本，可能会推出可选的次数包，但核心的压缩功能会一直保留免费额度。',
  },
  'seo.faq2.q': {
    en: 'Does compression reduce 3D model quality?',
    zh: '压缩会降低模型画质吗？',
  },
  'seo.faq2.a': {
    en: 'You choose the trade-off. The Balanced preset keeps models visually identical for most scenes; Max detail preserves edges and textures for close-ups. Use the Compare mode to inspect quality before you download.',
    zh: '由你决定取舍。均衡档位适合大多数场景、视觉几乎无损；高保真保留边缘和贴图细节。下载前可以用对比模式逐角度检查质量。',
  },
  'seo.faq3.q': {
    en: 'Are my 3D files uploaded to a server?',
    zh: '我的模型文件会被上传吗？',
  },
  'seo.faq3.a': {
    en: 'Files are processed for compression and are not stored, shared, or used for any other purpose. Large scenes stay private.',
    zh: '文件仅用于压缩处理，不会被存储、分享或用于任何其他用途，项目隐私有保障。',
  },
  'seo.faq4.q': {
    en: 'What formats does GLB Shrink support?',
    zh: 'GLB Shrink 支持什么格式？',
  },
  'seo.faq4.a': {
    en: 'Input: .glb (binary glTF). Output: optimized .glb with Draco-compressed geometry and WebP textures — fully compatible with Three.js, Unity, Unreal Engine, Godot, Blender, and most glTF runtimes.',
    zh: '输入：.glb（二进制 glTF）。输出：Draco 网格 + WebP 贴图的优化 .glb — 完全兼容 Three.js、Unity、Unreal、Godot、Blender 及主流 glTF 运行环境。',
  },
  'seo.faq5.q': {
    en: 'Can I compress multiple GLB files at once?',
    zh: '可以一次压缩多个 GLB 文件吗？',
  },
  'seo.faq5.a': {
    en: 'Yes. The Batch tab handles up to 20 GLB files in one run and gives you a single ZIP download of all compressed models.',
    zh: '可以。批量模式一次最多处理 20 个 GLB 文件，完成后打包成一个 ZIP 下载。',
  },
};

let current: Lang = 'en';

export function getLang(): Lang {
  return current;
}

export function t(key: string, params?: Record<string, string | number>): string {
  const entry = dict[key];
  let text = entry ? entry[current] : key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

export function setLang(lang: Lang) {
  current = lang;
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  applyStatic();
}

// 不做持久化：每次打开都固定英文默认，需要中文由用户当场手动切换
export function initLang(): Lang {
  current = 'en';
  document.documentElement.lang = 'en';
  return 'en';
}

/** 把所有 [data-i18n] 元素的文案更新为当前语言 */
export function applyStatic() {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (key) el.setAttribute('placeholder', t(key));
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    const key = el.dataset.i18nAria;
    if (key) el.setAttribute('aria-label', t(key));
  });
}
