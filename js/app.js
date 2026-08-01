/* ═══════════════════════════════════════════════════════════
   md2img — app.js
   主逻辑：状态管理、UI 绑定、导出动作、快捷键、PWA
   （Bento Grid 重构版：设置平铺为模块卡片，无侧边栏与抽屉）
   ═══════════════════════════════════════════════════════════ */
'use strict';

/* ─────────── 常量与状态 ─────────── */
const LS_KEY = 'md2img_settings_v2';

const FONT_MAP = {
  hei:   '"Geist", "PingFang SC", "Noto Sans SC", -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif',
  serif: '"Newsreader", "Noto Serif SC", "Source Han Serif SC", Georgia, "Times New Roman", serif',
  mono:  '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, "Courier New", monospace',
  round: '"ZCOOL XiaoWei", "LXGW WenKai", KaiTi, "Comic Sans MS", sans-serif',
};

/* meta theme-color：浏览器标签栏颜色（hex，与 tokens.css 各主题纸色一致） */
const THEME_META = { light: '#f6f0e5', dark: '#1d1a16', warm: '#f9eedb', green: '#edf3e6' };

const DEFAULTS = {
  theme: 'light', font: 'hei', width: 780, size: 16, padding: 32,
  format: 'png', scale: 2, quality: 90,
};

let state = { ...DEFAULTS, text: '' };

/* ─────────── DOM refs ─────────── */
const editor      = $('#editor');
const preview     = $('#preview');
const previewWrap = $('#preview-wrap');
const btnDownload = $('#btn-download');
const btnCopy     = $('#btn-copy');

/* ─────────── 渲染 ─────────── */
function render() {
  preview.innerHTML = Renderer.render(editor.value);
  $('#editor-stats').textContent = editor.value.length + ' 字符';
  updatePreviewStats();
}
function updatePreviewStats() {
  const r = preview.getBoundingClientRect();
  $('#preview-stats').textContent = Math.round(r.width) + '×' + Math.round(r.height) + 'px';
}

/* ─────────── 应用设置到预览卡片 ─────────── */
function applySettings() {
  document.body.dataset.theme = state.theme;
  $('#meta-theme-color').content = THEME_META[state.theme] || THEME_META.light;
  preview.style.fontFamily = FONT_MAP[state.font] || FONT_MAP.hei;
  preview.style.width      = state.width + 'px';
  preview.style.fontSize   = state.size + 'px';
  preview.style.padding    = state.padding + 'px ' + Math.round(state.padding * 1.1) + 'px';
  syncQualityRow();
  updatePreviewStats();
}

/* JPEG 质量行只在 JPEG 格式时出现 */
function syncQualityRow() {
  const row = $('#quality-row');
  if (row) row.hidden = state.format !== 'jpeg';
}

/* ─────────── 持久化 ─────────── */
function collectState() {
  return {
    ...state,
    text: editor.value,
    format: $('#export-format .chip[aria-pressed="true"]')?.dataset.format || 'png',
    scale:  parseInt($('#export-scale .chip[aria-pressed="true"]')?.dataset.scale || '2'),
    quality: parseInt($('#slider-quality').value),
  };
}
function saveSettings() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(collectState())); } catch (e) { /* 隐私模式等 */ }
}
function loadSettings() {
  let raw = null;
  try { raw = localStorage.getItem(LS_KEY); } catch (e) { return false; }
  if (!raw) return false;
  try {
    const s = JSON.parse(raw);
    state = { ...DEFAULTS, ...s };
    return true;
  } catch (e) { return false; }
}

/* ─────────── chips 绑定（通用：aria-pressed 即选中态） ─────────── */
function bindChips(containerId, key, syncUI) {
  $$('#' + containerId + ' .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      if (chip.getAttribute('aria-pressed') === 'true') return;
      $$('#' + containerId + ' .chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
      chip.setAttribute('aria-pressed', 'true');
      state[key] = chip.dataset[key] !== undefined
        ? (isNaN(chip.dataset[key]) ? chip.dataset[key] : parseInt(chip.dataset[key]))
        : chip.dataset[key];
      if (syncUI) syncUI();
      saveSettings();
    });
  });
}

function syncChipsFromState() {
  const map = {
    theme:   ['#theme-chips',   'data-theme'],
    font:    ['#font-chips',    'data-font'],
    width:   ['#width-chips',   'data-width'],
    size:    ['#fontsize-chips','data-size'],
    padding: ['#padding-chips', 'data-padding'],
  };
  Object.entries(map).forEach(([key, [sel, attr]]) => {
    $$(sel + ' .chip').forEach(c => c.setAttribute('aria-pressed', String(c.getAttribute(attr) == state[key])));
  });
  $$('#export-format .chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.format === state.format)));
  $$('#export-scale .chip').forEach(c => c.setAttribute('aria-pressed', String(parseInt(c.dataset.scale) === state.scale)));
  $('#slider-quality').value = state.quality;
  $('#val-quality').textContent = state.quality + '%';
}

/* ─────────── toast（失败与不可见反馈才用；成功走按钮自身状态） ─────────── */
function toast(msg, tone) {
  const el = $('#toast');
  if (tone) el.dataset.tone = tone; else delete el.dataset.tone;
  Toast.show(msg);
}

/* ─────────── 导出动作 ─────────── */
async function doExport() {
  if (!editor.value.trim()) { toast('内容为空，先输入 Markdown', 'error'); return null; }
  const { canvas, usedScale } = await Exporter.captureSmart(state.scale);
  const blob = await Exporter.canvasToBlob(canvas, state.format, state.quality / 100);
  return { blob, bytes: blob.size, usedScale };
}

function bindDownload() {
  btnDownload.addEventListener('click', () => withBusy(btnDownload, '生成中…', async () => {
    const r = await doExport();
    if (!r) return;
    Exporter.downloadBlob(r.blob, state.format);
    // 降级是用户看不到的信息，值得提示；正常下载静默成功
    if (r.usedScale !== state.scale) {
      toast('图片已下载，清晰度已自动降级 ' + state.scale + 'x→' + r.usedScale + 'x（内容较长）');
    }
  }));
}

/* 返回是否复制成功；成功由按钮自身状态反馈（label 换“已复制”，2.5s 恢复） */
async function copyImage() {
  const r = await doExport();
  if (!r) return false;
  try {
    await Exporter.copyBlob(r.blob);
    return true;
  } catch (e) {
    // 降级：blob → dataURL 文本复制
    try {
      const dataUrl = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(r.blob);
      });
      await navigator.clipboard.writeText(dataUrl);
      toast('已复制 data URL（部分应用不支持直接粘贴图片）');
      return true;
    } catch (e2) {
      toast('复制失败，请尝试下载图片', 'error');
      return false;
    }
  }
}

function flashCopied(btn) {
  const original = btn.innerHTML;
  btn.innerHTML =
    '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>' +
    '<span class="btn-label">已复制</span>';
  btn.dataset.state = 'copied';
  setTimeout(() => {
    btn.innerHTML = original;
    delete btn.dataset.state;
  }, 2500);
}

function bindCopy() {
  btnCopy.addEventListener('click', async () => {
    if (btnCopy.dataset.state === 'copied') return;
    let ok = false;
    await withBusy(btnCopy, '生成中…', async () => { ok = await copyImage(); });
    if (ok) flashCopied(btnCopy);
  });
}

/* ─────────── 示例内容 ─────────── */
const SAMPLE = `# 把 Markdown 变成一张图

> 写点什么，右侧就是成品。导出前把样式调好，下载的图片和预览完全一致。

---

## 支持的内容

- **粗体**、*斜体*、~~删除线~~ 与 [链接](https://example.com)
- 无序列表、有序列表、任务清单
- 引用、分隔线、行内代码与代码块
- GFM 表格与图片

## 一张表格

| 项目 | 默认值 | 说明 |
|------|:------:|------|
| 输出宽度 | 780px | 图文混排的均衡宽度 |
| 正文字号 | 16px | 多数屏幕的阅读舒适区 |
| 内边距 | 32px | 不挤不空，留白适中 |
| 导出格式 | PNG | 无损，适合分享 |

## 一段代码

\`\`\`python
def greeting(name: str) -> str:
    """生成一句问候。"""
    return f"你好，{name}！"

print(greeting("md2img"))
\`\`\`

> 桌面端快捷键：Ctrl+Enter 下载，Ctrl+Shift+C 复制。全部处理在本机完成，内容不会上传。`;

/* ─────────── 清空 / 示例 / 重置（效果可见，静默成功） ─────────── */
$('#btn-clear').addEventListener('click', () => {
  editor.value = '';
  render();
});
$('#btn-sample').addEventListener('click', () => {
  editor.value = SAMPLE;
  render();
});
$('#btn-reset').addEventListener('click', () => {
  localStorage.removeItem(LS_KEY);
  state = { ...DEFAULTS, text: '' };
  syncChipsFromState();
  applySettings();
  editor.value = '';
  render();
});

/* ─────────── 快捷键 ─────────── */
editor.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    btnDownload.click();
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
    e.preventDefault();
    btnCopy.click();
  }
});

/* ─────────── 初始化 ─────────── */
function init() {
  bindChips('theme-chips', 'theme', applySettings);
  bindChips('font-chips', 'font', applySettings);
  bindChips('width-chips', 'width', applySettings);
  bindChips('fontsize-chips', 'size', applySettings);
  bindChips('padding-chips', 'padding', applySettings);
  bindChips('export-format', 'format', applySettings);
  bindChips('export-scale', 'scale', null);
  $('#slider-quality').addEventListener('input', function () {
    state.quality = parseInt(this.value);
    $('#val-quality').textContent = this.value + '%';
    saveSettings();
  });

  bindDownload();
  bindCopy();

  editor.addEventListener('input', () => {
    render();
    clearTimeout(editor._saveTimer);
    editor._saveTimer = setTimeout(saveSettings, 500);
  });

  // 恢复设置 / 示例
  const restored = loadSettings();
  syncChipsFromState();
  applySettings();
  editor.value = (restored && state.text) ? state.text : SAMPLE;
  render();

  window.addEventListener('resize', updatePreviewStats);

  // PWA（https / localhost / 内网 才注册）
  const host = location.hostname;
  const okHost = location.protocol === 'https:' || host === 'localhost' || host === '127.0.0.1'
    || /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  if ('serviceWorker' in navigator && okHost) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 注册失败不影响使用 */ });
  }
}

document.addEventListener('DOMContentLoaded', init);
