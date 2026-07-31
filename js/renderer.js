/* ═══════════════════════════════════════════════════════════
   md2img — renderer.js
   Markdown → 安全 HTML（marked 解析 + DOMPurify 消毒）
   依赖：marked、DOMPurify（CDN 全局）
   ═══════════════════════════════════════════════════════════ */
'use strict';

const Renderer = (() => {
  marked.setOptions({
    gfm: true,          // GitHub Flavored Markdown（表格/删除线/任务列表）
    breaks: true,       // 单换行 = <br>
    async: false,
  });

  /**
   * 渲染 Markdown 为安全的 HTML 字符串。
   * DOMPurify 消毒是必需的——否则外部粘贴内容可注入任意 DOM/脚本，
   * 既危害页面，也会被 html2canvas 带入导出图片。
   */
  function render(src) {
    const raw = marked.parse(src || '');
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  }

  return { render };
})();
