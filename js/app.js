/* ═══════════════════════════════════════════════════════════
   md2img — app.js
   主逻辑：状态管理、UI 绑定、导出动作、快捷键、PWA
   ═══════════════════════════════════════════════════════════ */
'use strict';

/* ─────────── 常量与状态 ─────────── */
const LS_KEY = 'md2img_settings_v2';

const FONT_MAP = {
  hei:   '"PingFang SC", "Noto Sans SC", -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif',
  serif: '"Noto Serif SC", "Source Han Serif SC", Georgia, "Times New Roman", serif',
  mono:  '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, "Courier New", monospace',
  round: '"ZCOOL XiaoWei", "LXGW WenKai", KaiTi, "Comic Sans MS", sans-serif',
};

const DEFAULTS = {
  theme: 'light', font: 'hei', width: 780, size: 16, padding: 32,
  format: 'png', scale: 2, quality: 90,
};

let state = { ...DEFAULTS, text: '' };

/* ─────────── DOM refs ─────────── */
const editor    = $('#editor');
const preview   = $('#preview');
const previewWrap = $('#preview-wrap');
const sidebar   = $('#sidebar');
const overlay   = $('#drawer-overlay');
const isMobile  = () => window.matchMedia('(max-width: 899px)').matches;

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
  $('#meta-theme-color').content = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#f8f9fa';
  preview.style.fontFamily  = FONT_MAP[state.font] || FONT_MAP.hei;
  preview.style.width       = state.width + 'px';
  preview.style.fontSize    = state.size + 'px';
  preview.style.padding     = state.padding + 'px ' + Math.round(state.padding * 1.1) + 'px';
  updatePreviewStats();
}

/* ─────────── 持久化 ─────────── */
function collectState() {
  return {
    ...state,
    text: editor.value,
    format: $('#tab-export .export-format.active')?.dataset.format || 'png',
    scale:  parseInt($('#tab-export .export-scale.active')?.dataset.scale || '2'),
    quality: parseInt($('#slider-quality').value),
  };
}
function saveSettings() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(collectState())); } catch (e) { /* 隐私模式等 */ }
}
function loadSettings() {
  let raw = null;
  try { raw = localStorage.getItem(LS_KEY); } catch (e) { return; }
  if (!raw) return false;
  try {
    const s = JSON.parse(raw);
    state = { ...DEFAULTS, ...s };
    return true;
  } catch (e) { return false; }
}

/* ─────────── chips 绑定（通用） ─────────── */
function bindChips(containerId, key, syncUI) {
  $$('#' + containerId + ' .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('#' + containerId + ' .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
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
    theme:  ['#theme-chips', 'data-theme'],
    font:   ['#font-chips', 'data-font'],
    width:  ['#width-chips', 'data-width'],
    size:   ['#fontsize-chips', 'data-size'],
    padding:['#padding-chips', 'data-padding'],
  };
  Object.entries(map).forEach(([key, [sel, attr]]) => {
    $$(sel + ' .chip').forEach(c => c.classList.toggle('active', c.getAttribute(attr) == state[key]));
  });
  $$('#tab-export .export-format').forEach(c => c.classList.toggle('active', c.dataset.format === state.format));
  $$('#tab-export .export-scale').forEach(c => c.classList.toggle('active', parseInt(c.dataset.scale) === state.scale));
  $('#slider-quality').value = state.quality;
  $('#val-quality').textContent = state.quality + '%';
}

/* ─────────── 导出动作 ─────────── */
async function doExport() {
  if (!editor.value.trim()) { Toast.show('⚠️ 内容为空，先输入 Markdown'); return null; }
  const { canvas, usedScale } = await Exporter.captureSmart(state.scale);
  const blob = await Exporter.canvasToBlob(canvas, state.format, state.quality / 100);
  return { blob, bytes: blob.size, usedScale };
}

function bindDownload(btnId, label) {
  $(btnId).addEventListener('click', () => withBusy($(btnId), '⏳ 生成中…', async () => {
    const r = await doExport();
    if (!r) return;
    Exporter.downloadBlob(r.blob, state.format);
    const degraded = r.usedScale !== state.scale ? `（已自动降级 ${state.scale}x→${r.usedScale}x）` : '';
    Toast.show(`✅ 已下载 (${r.usedScale}x 倍率 · ${Exporter.humanSize(r.bytes)})${degraded}`);
  }));
}

async function copyImage() {
  const r = await doExport();
  if (!r) return;
  try {
    await Exporter.copyBlob(r.blob);
    Toast.show(`✅ 已复制到剪贴板 (${Exporter.humanSize(r.bytes)})`);
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
      Toast.show('⚠️ 已复制 data URL（部分应用不支持图片粘贴）');
    } catch (e2) {
      Toast.show('❌ 复制失败，请尝试下载');
    }
  }
}

/* ─────────── 示例内容 ─────────── */
const SAMPLE = `# Hi，这是一个纯净工作台

> 这是一个在线工具，可以把 **Markdown** 转化为精美的图片分享给好友。所有的设置都已经收纳到左侧菜单中，尽情沉浸在书写中吧。

---

## 🎯 核心体验

- ✍️ **左侧专注编辑** — 去除多余干扰，让写作更纯粹
- 🖼️ **右侧实时所见** — 即刻渲染，像素级还原导出效果
- ⚡️ **双端运行** — 桌面侧边栏 + 移动端抽屉，适配所有屏幕

## 📊 功能一览

| 模块 | 功能 | 状态 |
|------|------|:--:|
| 外观 | 亮色 / 暗色 / 暖色 / 护眼绿 | ✅ |
| 字体 | 黑体 / 衬线 / 等宽 / 圆体 | ✅ |
| 排版 | 宽度 · 字号 · 边距可调 | ✅ |
| 导出 | PNG / JPEG · 1x~3x 清晰度 | ✅ |
| 分享 | 复制到剪贴板 / 下载文件 | ✅ |

---

\`\`\`python
def greet(name: str) -> str:
    """生成问候语"""
    return f"Hello, {name}! 👋"

print(greet("md2img"))
\`\`\`

> 💡 **快捷键提示**：桌面端 \`Ctrl+Enter\` 可快速下载图片，\`Ctrl+Shift+C\` 复制图片。`;

/* ─────────── 侧栏（桌面/移动端抽屉） ─────────── */
function setupSidebar() {
  if (isMobile()) {
    sidebar.classList.add('drawer');
  } else {
    sidebar.classList.remove('drawer', 'open');
    overlay.classList.remove('open');
  }
}
$('#btn-menu').addEventListener('click', () => {
  if (isMobile()) {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
  } else {
    sidebar.classList.toggle('hidden');
  }
});
overlay.addEventListener('click', closeDrawer);
$$('.drawer-close').forEach(b => b.addEventListener('click', closeDrawer));
function closeDrawer() {
  sidebar.classList.remove('open');
  overlay.classList.remove('open');
}
window.addEventListener('resize', () => { setupSidebar(); updatePreviewStats(); });

/* ─────────── tab 切换 ─────────── */
$$('.sidebar-tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.sidebar-tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $$('.tab-panel').forEach(p => p.classList.remove('active'));
    $('#' + btn.dataset.tab).classList.add('active');
  });
});

/* ─────────── 清空 / 示例 / 重置 ─────────── */
$('#btn-clear').addEventListener('click', () => {
  editor.value = '';
  render();
  closeDrawer();
  Toast.show('已清空');
});
$('#btn-sample').addEventListener('click', () => {
  editor.value = SAMPLE;
  render();
  closeDrawer();
  Toast.show('已加载示例');
});
$('#btn-reset').addEventListener('click', () => {
  localStorage.removeItem(LS_KEY);
  state = { ...DEFAULTS, text: '' };
  syncChipsFromState();
  applySettings();
  editor.value = '';
  render();
  closeDrawer();
  Toast.show('✅ 已恢复默认设置');
});

/* ─────────── 快捷键 ─────────── */
editor.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    $('#' + (isMobile() ? 'btn-download-mobile' : 'btn-download')).click();
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
    e.preventDefault();
    copyImage();
  }
});

/* ─────────── 初始化 ─────────── */
function init() {
  // chips 绑定
  bindChips('theme-chips', 'theme', applySettings);
  bindChips('font-chips', 'font', applySettings);
  bindChips('width-chips', 'width', applySettings);
  bindChips('fontsize-chips', 'size', applySettings);
  bindChips('padding-chips', 'padding', applySettings);
  bindChips('export-format', 'format', null);
  bindChips('export-scale', 'scale', null);
  $('#slider-quality').addEventListener('input', function () {
    state.quality = parseInt(this.value);
    $('#val-quality').textContent = this.value + '%';
    saveSettings();
  });

  // 导出按钮
  bindDownload('#btn-download', '下载');
  bindDownload('#btn-download-mobile', '下载');
  $('#btn-copy').addEventListener('click', () => withBusy($('#btn-copy'), '⏳', copyImage));
  $('#btn-copy-mobile').addEventListener('click', () => withBusy($('#btn-copy-mobile'), '⏳', copyImage));

  // 编辑器输入 → 渲染 + 防抖保存
  editor.addEventListener('input', () => {
    render();
    clearTimeout(editor._saveTimer);
    editor._saveTimer = setTimeout(saveSettings, 500);
  });

  // 恢复设置 / 示例
  const restored = loadSettings();
  syncChipsFromState();
  applySettings();
  if (restored && state.text) {
    editor.value = state.text;
  } else {
    editor.value = SAMPLE;
    if (restored) { /* 有设置但无正文：仍展示示例 */ }
  }
  render();
  setupSidebar();

  // PWA（https / localhost / 内网 才注册）
  const host = location.hostname;
  const okHost = location.protocol === 'https:' || host === 'localhost' || host === '127.0.0.1'
    || /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  if ('serviceWorker' in navigator && okHost) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 注册失败不影响使用 */ });
  }
}

document.addEventListener('DOMContentLoaded', init);
