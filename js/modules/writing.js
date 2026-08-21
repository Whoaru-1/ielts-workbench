/* ============================================================
 * writing.js — 写作：题目 / 作文 / 自评
 * ============================================================ */
import * as store from "../store.js";
import { h, panel, badge, icon, esc, emptyState, toast } from "../ui.js";

export function render(root, app) {
  root.innerHTML = "";
  const page = h("div", { class: "page" });
  page.append(
    h("div", { class: "page-head" },
      h("h1", { class: "page-title" }, "写作", h("span", { class: "t-sub" }, "记录题目、作文与自评，方便复盘")),
      h("div", { class: "page-actions" }, h("button", { class: "btn btn-primary btn-sm", onclick: toggleForm }, icon("plus"), "新增记录"))
    )
  );

  const formPanel = panel({
    title: "新增写作记录",
    body: addForm((rec) => { store.addWriting(rec); toast("写作记录已保存", "ok"); renderList(); app.refreshChrome(); }),
  });
  formPanel.style.display = "none";
  page.append(formPanel);

  const listWrap = h("div", {});
  page.append(listWrap);

  const renderList = () => {
    const list = store.writingList();
    listWrap.innerHTML = "";
    if (list.length === 0) {
      listWrap.append(panel({ title: "写作记录", body: emptyState("writing", "还没有写作记录", "写一篇 Task 1 或 Task 2，记录题目、正文和自评分数。") }));
      return;
    }
    listWrap.append(panel({
      title: `写作记录 · ${list.length} 篇`,
      body: h("div", { class: "writing-list" }, list.map((w) =>
        h("article", { class: "writing-item" },
          h("div", { class: "writing-head" },
            h("div", null,
              h("div", { class: "writing-title" }, badge(w.taskType === "task1" ? "Task 1" : "Task 2", w.taskType === "task1" ? "acc" : "warn"), h("strong", null, esc(w.topic))),
              h("div", { class: "writing-meta" }, `日期 ${store.fmtDate(w.date)} · 字数 ${w.essay ? w.essay.trim().split(/\s+/).length : 0}`)
            ),
            h("div", { class: "writing-right" },
              w.score != null ? badge(`自评 ${w.score}`, "ok") : null,
              h("button", { class: "icon-btn danger", title: "删除", onclick: () => { store.deleteWriting(w.id); renderList(); app.refreshChrome(); } }, icon("trash"))
            )
          ),
          w.essay ? h("details", { class: "writing-details" },
            h("summary", null, "查看作文"),
            h("div", { class: "writing-essay" }, esc(w.essay))
          ) : null,
          w.notes ? h("div", { class: "writing-notes" }, "备注：" + esc(w.notes)) : null
        )
      ))
    }));
  };

  function toggleForm() {
    formPanel.style.display = formPanel.style.display === "none" ? "" : "none";
  }
  renderList();
  root.append(page);
}

function addForm(onsubmit) {
  const taskType = h("select", { class: "select" }, h("option", { value: "task1" }, "Task 1 · 图表作文"), h("option", { value: "task2" }, "Task 2 · 议论文"));
  const topic = h("input", { class: "input", placeholder: "题目 / 话题 *", required: true });
  const score = h("input", { class: "input", type: "number", min: "0", max: "9", step: "0.5", placeholder: "自评分数（可选）" });
  const essay = h("textarea", { class: "textarea", placeholder: "粘贴你的作文正文（可选）", rows: 6 });
  const notes = h("input", { class: "input", placeholder: "复盘备注（可选），如：结构、词汇、语法问题" });
  const form = h("form", { class: "form-grid", onsubmit: (e) => {
    e.preventDefault();
    if (!topic.value.trim()) { toast("请填写题目", "warn"); return; }
    onsubmit({ taskType: taskType.value, topic: topic.value, essay: essay.value, score: score.value, notes: notes.value });
    topic.value = ""; essay.value = ""; score.value = ""; notes.value = "";
  } },
    h("div", { class: "field" }, h("label", null, "题型"), taskType),
    h("div", { class: "field" }, h("label", null, "题目"), topic),
    h("div", { class: "field" }, h("label", null, "自评分数"), score),
    h("div", { class: "field", style: "grid-column:1/-1" }, h("label", null, "作文正文"), essay),
    h("div", { class: "field", style: "grid-column:1/-1" }, h("label", null, "复盘备注"), notes),
    h("div", { class: "form-actions" }, h("button", { class: "btn btn-primary", type: "submit" }, icon("plus"), "保存记录"))
  );
  return form;
}
