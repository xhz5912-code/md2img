# md2img — Markdown 转图片

将 Markdown 文本导出为精美图片，纯前端、零后端、离线可用（PWA）。

在线地址：<https://xhz5912-code.github.io/md2img>

## ✨ 功能

**核心**
- Markdown → 实时渲染预览（GFM：表格 / 删除线 / 任务列表 / 代码块）
- 导出图片：PNG（无损）/ JPEG（可调质量）
- 下载图片文件 / 一键复制到剪贴板
- 1x / 2x / 3x 清晰度倍率

**用户友好**
- 4 套主题：亮色 / 暗色 / 暖色 / 护眼绿（界面与预览卡片同步换肤）
- 4 种字体：黑体 / 衬线 / 等宽 / 圆体（系统字体自动回退）
- 排版：输出宽度（600–1200px）、正文字号（14–20px）、内边距（20–64px）
- 设置与正文草稿自动保存（localStorage），刷新不丢失
- 快捷键：`Ctrl+Enter` 下载、`Ctrl+Shift+C` 复制
- 移动端抽屉式设置面板
- PWA：可安装、离线可用

## 🛠 技术架构

纯静态站点，无构建步骤，可直接部署到任意静态托管（GitHub Pages / Vercel / Nginx）：

```
md2img/
├── index.html        # 页面骨架
├── css/styles.css    # 样式 + CSS 变量主题体系
├── js/
│   ├── utils.js      # toast、按钮 busy 状态等工具
│   ├── renderer.js   # marked 解析 + DOMPurify 消毒
│   ├── exporter.js   # html2canvas 捕获 → 下载 / 剪贴板
│   └── app.js        # 主逻辑：状态、持久化、UI 绑定
├── manifest.json     # PWA 清单
├── sw.js             # Service Worker 离线缓存
└── README.md
```

| 依赖 | 用途 | 版本 |
|---|---|---|
| [marked](https://github.com/markedjs/marked) | Markdown 解析 | 11.x（jsdelivr CDN） |
| [DOMPurify](https://github.com/cure53/DOMPurify) | HTML 消毒（XSS 防护） | 3.x（jsdelivr CDN） |
| [html2canvas](https://github.com/niklasvh/html2canvas) | DOM → Canvas 截图 | 1.4.1（jsdelivr CDN） |

> 安全说明：`renderer.js` 对所有 marked 输出做 `DOMPurify.sanitize`，防止外部粘贴的 Markdown 注入任意 HTML/脚本（该内容最终会进入导出图片）。

## 🚀 本地运行

无需安装，任意静态服务器即可（`file://` 打开也可用，但 PWA/剪贴板 API 需 http(s)）：

```bash
# Python
python3 -m http.server 8000
# 或 Node
npx serve .
```

浏览器访问 <http://localhost:8000>。

## 🧪 测试

```bash
# 语法检查（Node）
node --check js/utils.js && node --check js/renderer.js \
  && node --check js/exporter.js && node --check js/app.js
# 或 Python
python3 -m py_compile js/*.js  # 不适用，JS 用 node --check
```

手工测试清单见 `docs/TESTING.md`（可选）。

## 📦 部署（GitHub Pages）

1. 推送仓库到 GitHub（Pages 已启用，分支 `main`，根目录）
2. 若修改过文件，记得 **bump `sw.js` 里的 `CACHE` 版本号**，否则旧 Service Worker 缓存会挡住更新

## ⚠️ 已知限制

- 导出基于 html2canvas（DOM 重绘），不支持部分过于现代的 CSS 特性（如 `oklch()` 颜色）；本工具主题刻意规避此类特性
- 代码块高亮未内置（保持导出体积最小）；如需高亮可接入 highlight.js 并扩展 `renderer.js`
