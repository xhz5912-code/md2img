/* ═══════════════════════════════════════════════════════════
   md2img — utils.js
   通用工具：toast 提示、DOM 查询简写
   ═══════════════════════════════════════════════════════════ */
'use strict';

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const Toast = (() => {
  const el = $('#toast');
  let timer = null;
  function show(msg, ms = 2200) {
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('show'), ms);
  }
  return { show };
})();

/* 带 loading 状态的按钮执行器 */
async function withBusy(button, busyText, fn) {
  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = busyText;
  try {
    await fn();
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}
