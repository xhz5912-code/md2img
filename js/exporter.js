/* ═══════════════════════════════════════════════════════════
   md2img — exporter.js
   图片导出核心：html2canvas 捕获预览卡片 → 下载 / 复制剪贴板
   - Blob 下载（避免超大 dataURL 触发浏览器下载限制）
   - canvas 超限自动降级 scale（长文本导出不失败）
   依赖：html2canvas（CDN 全局）
   ═══════════════════════════════════════════════════════════ */
'use strict';

const Exporter = (() => {
  const previewWrap = $('#preview-wrap');
  const preview     = $('#preview');

  /* 浏览器 canvas 面积上限（Chrome: 16384×16384 ≈ 2.68 亿像素），
     以及单边 32767px 上限。任一超限 canvas 编码都会失败/截断。 */
  const MAX_CANVAS_AREA = 268435456;
  const MAX_CANVAS_SIDE = 32767;

  function isCanvasOk(canvas) {
    return canvas.width <= MAX_CANVAS_SIDE && canvas.height <= MAX_CANVAS_SIDE
      && canvas.width * canvas.height <= MAX_CANVAS_AREA;
  }

  /**
   * 捕获预览卡片为 canvas。
   * 导出前需解除父容器 overflow/maxHeight 限制，否则长内容会被截断；
   * 用 try/finally 保证无论成功失败都恢复容器样式。
   * onclone：html2canvas 克隆整个文档解析样式，而 UI 层用 OKLCH token
   * （html2canvas 1.4.1 不支持）。在克隆文档里把 UI 变量替换为视觉等价的
   * hex，保证解析不抛错、渲染不受影响（预览卡片本身用 --pv-* hex）。
   */
  async function capture(scale, backgroundColor) {
    const saved = {
      overflow:  previewWrap.style.overflow,
      maxHeight: previewWrap.style.maxHeight,
    };
    previewWrap.style.overflow = 'visible';
    previewWrap.style.maxHeight = 'none';
    try {
      return await html2canvas(preview, {
        backgroundColor: backgroundColor || getComputedStyle(preview).backgroundColor || '#fbf7f0',
        scale,
        useCORS: true,
        logging: false,
        onclone: (doc) => {
          const UI_HEX = {
            '--color-paper':        '#fbf8f3',
            '--color-paper-2':      '#f4f0e9',
            '--color-paper-3':      '#ede8df',
            '--color-rule':         '#e2ddd2',
            '--color-rule-strong':  '#cfc9bc',
            '--color-neutral':      '#8a8174',
            '--color-muted':        '#6b6257',
            '--color-ink':          '#2a2622',
            '--color-ink-2':        '#4a443c',
            '--color-accent':       '#c0551e',
            '--color-accent-hover': '#a94a1a',
            '--color-accent-soft':  '#f5e7d8',
            '--color-accent-ink':   '#fdf9f2',
            '--color-focus':        '#c96a2b',
            '--color-danger':       '#b33a2a',
            '--shadow-hairline':    '0 0 0 1px rgba(43,38,30,0.08)',
            '--shadow-whisper':     '0 1px 2px rgba(43,38,30,0.06)',
          };
          // 变量定义在 :root 与 body[data-theme] 两处，必须都内联覆盖，
          // 否则 body 自身的规则声明优先于 html 继承值，oklch 仍会残留
          const targets = [doc.documentElement, doc.body];
          for (const el of targets) {
            for (const [k, v] of Object.entries(UI_HEX)) el.style.setProperty(k, v);
          }
          const overlay = doc.querySelector('.drawer-overlay');
          if (overlay) overlay.style.background = 'rgba(30,26,22,0.45)';
        },
      });
    } finally {
      previewWrap.style.overflow  = saved.overflow;
      previewWrap.style.maxHeight = saved.maxHeight;
    }
  }

  /**
   * 智能捕获：优先用用户指定 scale；若 canvas 超浏览器上限
   * （面积或单边，含 html2canvas 内部抛错），自动降级重试：
   * requested → 1x → 0.5x → 0.25x。
   * 返回 { canvas, usedScale }；仍超限则抛错提示。
   */
  async function captureSmart(requestedScale) {
    const candidates = [...new Set(
      [requestedScale, 1, 0.5, 0.25].filter((s) => s <= requestedScale)
    )];
    let firstError = null;
    for (const scale of candidates) {
      try {
        const canvas = await capture(scale, null);
        if (isCanvasOk(canvas)) return { canvas, usedScale: scale };
        firstError = firstError || new Error(`canvas ${canvas.width}×${canvas.height} 超浏览器上限`);
      } catch (e) {
        // html2canvas 因 canvas 过大抛错：继续降级；保留首个错误便于诊断
        firstError = firstError || e;
      }
    }
    if (firstError && !/内容过长/.test(firstError.message)) {
      throw new Error('导出失败：' + firstError.message);
    }
    throw new Error('内容过长（超出浏览器单张图片上限 32767px），已自动尝试降低清晰度仍无法导出，请分段导出或精简内容');
  }

  /** canvas → Blob（下载/剪贴板统一走 Blob，规避 dataURL 大小限制） */
  function canvasToBlob(canvas, format, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('图片生成失败（内容可能过长）')),
        format === 'jpeg' ? 'image/jpeg' : 'image/png',
        format === 'jpeg' ? quality : undefined
      );
    });
  }

  function humanSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  /** Blob 下载（URL.createObjectURL，无 dataURL 2MB 限制） */
  function downloadBlob(blob, format) {
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'md2img_' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.' + ext;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // 延迟回收，确保浏览器已开始读取 blob
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /** Blob → 剪贴板（image/png） */
  async function copyBlob(blob) {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
  }

  return { capture, captureSmart, canvasToBlob, downloadBlob, copyBlob, humanSize };
})();
