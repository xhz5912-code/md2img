/* ═══════════════════════════════════════════════════════════
   md2img — exporter.js
   图片导出核心：html2canvas 捕获预览卡片 → 下载 / 复制剪贴板
   依赖：html2canvas（CDN 全局）
   ═══════════════════════════════════════════════════════════ */
'use strict';

const Exporter = (() => {
  const previewWrap = $('#preview-wrap');
  const preview     = $('#preview');

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

  function canvasToDataUrl(canvas, format, quality) {
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    return canvas.toDataURL(mime, format === 'jpeg' ? quality : undefined);
  }

  /** base64 dataURL 估算字节数（base64 每 4 字符 ≈ 3 字节） */
  function estimateBytes(dataUrl) {
    const b64 = dataUrl.split(',')[1] || '';
    return Math.round(b64.length * 0.75);
  }

  function humanSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function download(dataUrl, format) {
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    const link = document.createElement('a');
    link.download = 'md2img_' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.' + ext;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  /** dataURL → Blob → 剪贴板（image/png，兼容性最好） */
  async function copy(dataUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
  }

  return { capture, canvasToDataUrl, download, copy, estimateBytes, humanSize };
})();
