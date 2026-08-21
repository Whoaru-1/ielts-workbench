/* ============================================================
 * speaking.js — 口语：Part 话题 / 记录 / 自评
 * ============================================================ */
import * as store from "../store.js";
import { h, panel, badge, icon, esc, emptyState, toast } from "../ui.js";

export function render(root, app) {
  root.innerHTML = "";
  const page = h("div", { class: "page" });
  page.append(
    h("div", { class: "page-head" },
      h("h1", { class: "page-title" }, "口语", h("span", { class: "t-sub" }, "记录练习话题、表现与自评")),
      h("div", { class: "page-actions" }, h("button", { class: "btn btn-primary btn-sm", onclick: toggleForm }, icon("plus"), "新增记录"))
    )
  );

  const formPanel = panel({
    title: "新增口语记录",
    body: addForm((rec) => { store.addSpeaking(rec); toast("口语记录已保存", "ok"); renderList(); app.refreshChrome(); }),
  });
  formPanel.style.display = "none";
  page.append(formPanel);

  const listWrap = h("div", {});
  page.append(listWrap);

  const renderList = () => {
    const list = store.speakingList();
    listWrap.innerHTML = "";
    if (list.length === 0) {
      listWrap.append(panel({ title: "口语记录", body: emptyState("speaking", "还没有口语记录", "练完一个 Part 话题后记录下来，积累题库素材。") }));
      return;
    }
    listWrap.append(panel({
      title: `口语记录 · ${list.length} 条`,
      body: h("div", { class: "writing-list" }, list.map((s) =>
        h("article", { class: "writing-item" },
          h("div", { class: "writing-head" },
            h("div", null,
              h("div", { class: "writing-title" }, badge(`Part ${s.part}`, s.part === 2 ? "warn" : "acc"), h("strong", null, esc(s.topic))),
              h("div", { class: "writing-meta" }, `日期 ${store.fmtDate(s.date)}`)
            ),
            h("div", { class: "writing-right" },
              s.score != null ? badge(`自评 ${s.score}`, s.score >= 6.5 ? "ok" : "warn") : null,
              h("button", { class: "icon-btn danger", title: "删除", onclick: () => { store.deleteSpeaking(s.id); renderList(); app.refreshChrome(); } }, icon("trash"))
            )
          ),
          s.notes ? h("div", { class: "writing-notes" }, esc(s.notes)) : null
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
  const part = h("select", { class: "select" }, h("option", { value: "1" }, "Part 1 · 日常问答"), h("option", { value: "2" }, "Part 2 · 个人陈述"), h("option", { value: "3" }, "Part 3 · 深入讨论"));
  const topic = h("input", { class: "input", placeholder: "话题 / 题目 *", required: true });
  const score = h("input", { class: "input", type: "number", min: "0", max: "9", step: "0.5", placeholder: "自评分数（可选）" });
  const notes = h("textarea", { class: "textarea", placeholder: "表现记录（可选）：流畅度、词汇、发音问题等", rows: 4 });
  const form = h("form", { class: "form-grid", onsubmit: (e) => {
    e.preventDefault();
    if (!topic.value.trim()) { toast("请填写话题", "warn"); return; }
    onsubmit({ part: part.value, topic: topic.value, score: score.value, notes: notes.value });
    topic.value = ""; score.value = ""; notes.value = "";
  } },
    h("div", { class: "field" }, h("label", null, "Part"), part),
    h("div", { class: "field" }, h("label", null, "话题"), topic),
    h("div", { class: "field" }, h("label", null, "自评分数"), score),
    h("div", { class: "field", style: "grid-column:1/-1" }, h("label", null, "表现记录"), notes),
    h("div", { class: "form-actions" }, h("button", { class: "btn btn-primary", type: "submit" }, icon("plus"), "保存记录"))
  );
  return form;
}
