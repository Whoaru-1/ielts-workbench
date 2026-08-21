/* ============================================================
 * ui.js — DOM 工具 + 手绘 SVG 图标系统（统一 1.4 笔画）
 * ============================================================ */

const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS = {
  dashboard: `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.8" y="1.8" width="5.2" height="5.2" rx="1" ${STROKE}/><rect x="9" y="1.8" width="5.2" height="3.6" rx="1" ${STROKE}/><rect x="9" y="7.4" width="5.2" height="6.8" rx="1" ${STROKE}/><rect x="1.8" y="9" width="5.2" height="5.2" rx="1" ${STROKE}/></svg>`,
  vocab: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.2c-1.2-1-2.7-1.5-4.6-1.4v10.6c1.9-.1 3.4.4 4.6 1.4 1.2-1 2.7-1.5 4.6-1.4V1.8c-1.9-.1-3.4.4-4.6 1.4z" ${STROKE}/><path d="M8 3.2v10.6" ${STROKE}/></svg>`,
  practice: `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" ${STROKE}/><path d="M8 4.4V8l2.6 1.8" ${STROKE}/></svg>`,
  writing: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12.2l.8-2.6L11.5 2.9a1.1 1.1 0 0 1 1.6 0l.9.9a1.1 1.1 0 0 1 0 1.6L7.3 11.7l-2.6.8z" ${STROKE}/><path d="M10.4 4l1.6 1.6" ${STROKE}/><path d="M3 13.6h10" ${STROKE}/></svg>`,
  speaking: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.8 6.4v3.2h2.4l3.2 2.8V3.6L5.2 6.4z" ${STROKE}/><path d="M10.6 6a3 3 0 0 1 0 4M12.2 4.4a5 5 0 0 1 0 7.2" ${STROKE}/></svg>`,
  plan: `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.2" y="2.6" width="11.6" height="10.8" rx="1.4" ${STROKE}/><path d="M2.2 6h11.6M5.4 1.8v2M10.6 1.8v2" ${STROKE}/><path d="M5.4 9.6l1.8 1.8 3.4-3.4" ${STROKE}/></svg>`,
  settings: `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.4" ${STROKE}/><path d="M8 1.6v1.8M8 12.6v1.8M1.6 8h1.8M12.6 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3" ${STROKE}/></svg>`,
  plus: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" ${STROKE}/></svg>`,
  edit: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.6 12.4l.6-2.1 6-6a1 1 0 0 1 1.4 0l.8.8a1 1 0 0 1 0 1.4l-6 6-2.1.6z" ${STROKE}/></svg>`,
  trash: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.6 4.4h10.8M6.2 4.4V3.2a1 1 0 0 1 1-1h1.6a1 1 0 0 1 1 1v1.2M4.4 4.4l.6 8.4a1 1 0 0 0 1 .9h4a1 1 0 0 0 1-.9l.6-8.4" ${STROKE}/><path d="M6.6 7.2v3.6M9.4 7.2v3.6" ${STROKE}/></svg>`,
  check: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.6l3.2 3.2L13 5" ${STROKE}/></svg>`,
  search: `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.4" ${STROKE}/><path d="M10.4 10.4L13.4 13.4" ${STROKE}/></svg>`,
  close: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" ${STROKE}/></svg>`,
  download: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v7m0 0l-2.6-2.6M8 10l2.6-2.6M3.5 12.5h9" ${STROKE}/></svg>`,
  upload: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 12V5m0 0L5.4 7.6M8 5l2.6 2.6M3.5 3.5h9" ${STROKE}/></svg>`,
  target: `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" ${STROKE}/><circle cx="8" cy="8" r="3.4" ${STROKE}/><circle cx="8" cy="8" r=".9" ${STROKE}/></svg>`,
  calendar: `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.2" y="2.6" width="11.6" height="10.8" rx="1.4" ${STROKE}/><path d="M2.2 6h11.6M5.4 1.8v2M10.6 1.8v2" ${STROKE}/></svg>`,
  clock: `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" ${STROKE}/><path d="M8 4.4V8l2.6 1.8" ${STROKE}/></svg>`,
  flame: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14s4-2.8 4-6A4 4 0 0 0 8 4a4 4 0 0 0-4 4c0 3.2 4 6 4 6z" ${STROKE}/><path d="M8 9.5c1 0 1.8-.5 1.8-1.4" ${STROKE}/></svg>`,
  spark: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2l1.8 4.2L14 8l-4.2 1.8L8 14l-1.8-4.2L2 8l4.2-1.8z" ${STROKE}/></svg>`,
  arrowUp: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 12V4m0 0L4.6 7.4M8 4l3.4 3.4" ${STROKE}/></svg>`,
  box: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.6 5.2L8 2.4l5.4 2.8v5.6L8 13.6l-5.4-2.8z" ${STROKE}/><path d="M2.6 5.2L8 8l5.4-2.8M8 8v5.6" ${STROKE}/></svg>`,
};

export function icon(name, cls = "") {
  const span = document.createElement("span");
  span.className = `icon ${cls}`.trim();
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = ICONS[name] || "";
  return span;
}

/** 创建元素：h('div', {class:'x', onclick}, ...children) */
export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k in node && k !== "list") node[k] = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** 简单的 HTML 转义，用于把用户内容安全地放进模板字符串 */
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

export function toast(msg, kind = "") {
  const region = document.getElementById("toast-region");
  const node = h("div", { class: `toast ${kind}`, role: "status" }, msg);
  region.append(node);
  setTimeout(() => node.remove(), 3200);
}

export function panel({ title, dot = true, actions = "", body, flush = false }) {
  return h("section", { class: "panel" },
    h("div", { class: "panel-head" },
      h("h2", { class: "panel-title" }, dot ? h("span", { class: "dot" }) : "", title),
      h("div", { class: "panel-actions" }, actions ? actions : "")
    ),
    h("div", { class: `panel-body${flush ? " flush" : ""}` }, body)
  );
}

export function emptyState(iconName, title, body) {
  return h("div", { class: "empty" }, icon(iconName), h("div", { class: "empty-title" }, title), h("div", { class: "empty-body" }, body));
}

export function badge(text, kind = "") {
  return h("span", { class: `badge ${kind}` }, text);
}

export function statCard(k, v, d = "", dKind = "") {
  return h("div", { class: "stat" },
    h("div", { class: "k" }, k),
    h("div", { class: "v" }, v),
    d ? h("div", { class: `d ${dKind}` }, d) : null
  );
}

export function download(filename, text, mime = "application/json") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function confirmInline(root, message, onConfirm, confirmLabel = "确认删除") {
  root.innerHTML = "";
  const box = h("div", { class: "panel", style: "padding:16px" },
    h("p", { style: "margin-bottom:12px" }, message),
    h("div", { class: "btn-row" },
      h("button", { class: "btn btn-danger", onclick: () => { onConfirm(); } }, confirmLabel),
      h("button", { class: "btn btn-ghost", onclick: () => { root.innerHTML = ""; } }, "取消")
    )
  );
  root.append(box);
}
