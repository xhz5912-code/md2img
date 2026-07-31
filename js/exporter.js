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
        backgroundColor: backgroundColor || getComputedStyle(preview).backgroundColor || '#ffffff',
        scale,
        useCORS: true,
        logging: false,
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
    for (const scale of candidates) {
      try {
        const canvas = await capture(scale, null);
        if (isCanvasOk(canvas)) return { canvas, usedScale: scale };
      } catch (e) {
        // html2canvas 因 canvas 过大抛错：继续降级
      }
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
