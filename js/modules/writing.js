/* ============================================================
 * writing.js — 写作：练习记录 + 写作题库（Task1/Task2）
 * ============================================================ */
import * as store from "../store.js";
import { h, panel, badge, icon, esc, emptyState, toast } from "../ui.js";
import WRITING_BANK from "../data/writing-bank.js";

const TASK_LABEL = { 1: "Task 1", 2: "Task 2" };
const TASK_KIND = { 1: "acc", 2: "warn" };

export function render(root, app) {
  root.innerHTML = "";
  const page = h("div", { class: "page" });
  page.append(
    h("div", { class: "page-head" },
      h("h1", { class: "page-title" }, "写作", h("span", { class: "t-sub" }, `写作题库（Task1/Task2 样题整理，非官方出版物）· 已练 ${store.writingPracticedCount()} 题`)),
      h("div", { class: "page-actions" }, h("button", { class: "btn btn-primary btn-sm", onclick: () => openBank("random") }, icon("spark"), "随机抽题"))
    )
  );

  /* 标签页 */
  const tabBar = h("div", { class: "tabbar", role: "tablist" },
    h("button", { class: "tab is-active", role: "tab", "aria-selected": "true", onclick: () => setTab("record") }, "练习记录"),
    h("button", { class: "tab", role: "tab", "aria-selected": "false", onclick: () => setTab("bank") }, `写作题库 (${WRITING_BANK.length})`)
  );
  page.append(tabBar);
  const content = h("div", {});
  page.append(content);

  /* ============ 记录标签 ============ */
  let topicInput = null;
  const formPanel = panel({
    title: "新增写作记录",
    body: addForm((rec) => { store.addWriting(rec); toast("写作记录已保存", "ok"); renderRecords(); app.refreshChrome(); }, (el) => { topicInput = el; }),
  });
  const listWrap = h("div", {});
  const recordsTab = h("div", { class: "tab-pane" }, formPanel, listWrap);

  const renderRecords = () => {
    const list = store.writingList();
    listWrap.innerHTML = "";
    if (list.length === 0) {
      listWrap.append(panel({ title: "写作记录", body: emptyState("writing", "还没有写作记录", "去「写作题库」抽一道题，或用下方表单记录。") }));
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
              h("button", { class: "icon-btn danger", title: "删除", onclick: () => { store.deleteWriting(w.id); renderRecords(); app.refreshChrome(); } }, icon("trash"))
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

  /* ============ 题库标签 ============ */
  const randPanel = h("div", { id: "wrand-panel" });
  const q = h("input", { class: "input", placeholder: "搜索题目关键词…", "aria-label": "搜索写作题" });
  const taskFilter = h("select", { class: "select", "aria-label": "按 Task 筛选" },
    h("option", { value: "all" }, "全部 Task"),
    h("option", { value: "1" }, "Task 1 图表"),
    h("option", { value: "2" }, "Task 2 议论文")
  );
  const catFilter = h("select", { class: "select", "aria-label": "按话题筛选" }, h("option", { value: "all" }, "全部话题"));
  const bankListWrap = h("div", {});

  const bankTab = h("div", { class: "tab-pane" },
    randPanel,
    panel({ title: "题库浏览", body:
      h("div", null,
        h("div", { class: "toolbar" },
          h("div", { class: "toolbar-search" }, icon("search"), q),
          taskFilter, catFilter,
          h("button", { class: "btn btn-ghost btn-sm", onclick: () => pickRandom() }, icon("spark"), "换一题")
        ),
        bankListWrap
      )
    })
  );

  const buildCatOptions = () => {
    const cats = [...new Set(WRITING_BANK.map((x) => x.category))];
    catFilter.innerHTML = "";
    catFilter.append(h("option", { value: "all" }, "全部话题"));
    for (const c of cats) catFilter.append(h("option", { value: c }, c));
  };
  buildCatOptions();

  const renderBank = () => {
    const t = taskFilter.value;
    const c = catFilter.value;
    const query = q.value.trim().toLowerCase();
    const list = WRITING_BANK.filter((x) =>
      (t === "all" || String(x.task) === t) &&
      (c === "all" || x.category === c) &&
      (!query || x.question.toLowerCase().includes(query))
    );
    bankListWrap.innerHTML = "";
    if (list.length === 0) {
      bankListWrap.append(emptyState("writing", "没有符合条件的题目", "换个筛选条件试试。"));
      return;
    }
    bankListWrap.append(h("div", { class: "bank-list" }, list.map((x) => {
      const practiced = store.isWritingPracticed(x.id);
      return h("div", { class: `bank-item${practiced ? " practiced" : ""}` },
        h("div", { class: "bank-main" },
          h("div", { class: "bank-head" },
            badge(TASK_LABEL[x.task], TASK_KIND[x.task]),
            badge(x.category, "acc"),
            practiced ? badge("已练", "ok") : null
          ),
          h("div", { class: "bank-question" }, esc(x.question))
        ),
        h("div", { class: "bank-actions" },
          h("button", { class: "btn btn-ghost btn-sm", onclick: () => { store.toggleWritingPracticed(x.id); renderBank(); app.refreshChrome(); } },
            icon("check"), practiced ? "取消" : "标记已练"),
          h("button", { class: "btn btn-primary btn-sm", onclick: () => useInRecord(x) }, icon("edit"), "记录练习")
        )
      );
    })));
  };

  const pickRandom = () => {
    const t = taskFilter.value;
    const pool = WRITING_BANK.filter((x) => t === "all" || String(x.task) === t);
    if (!pool.length) { toast("当前筛选下没有题目", "warn"); return; }
    const x = pool[Math.floor(Math.random() * pool.length)];
    const practiced = store.isWritingPracticed(x.id);
    randPanel.innerHTML = "";
    randPanel.append(h("div", { class: "rand-card" },
      h("div", { class: "bank-head" },
        badge("随机抽题", "warn"),
        badge(TASK_LABEL[x.task], TASK_KIND[x.task]),
        badge(x.category, "acc"),
        practiced ? badge("已练", "ok") : null
      ),
      h("div", { class: "rand-question" }, esc(x.question)),
      h("div", { class: "btn-row" },
        h("button", { class: "btn btn-primary btn-sm", onclick: () => useInRecord(x) }, icon("edit"), "用此题记录练习"),
        h("button", { class: "btn btn-ghost btn-sm", onclick: () => { store.toggleWritingPracticed(x.id); pickRandom(); app.refreshChrome(); } }, icon("check"), practiced ? "取消已练" : "标记已练"),
        h("button", { class: "btn btn-ghost btn-sm", onclick: pickRandom }, icon("spark"), "换一题")
      )
    ));
  };

  const useInRecord = (x) => {
    setTab("record");
    if (topicInput) {
      topicInput.value = `[${TASK_LABEL[x.task]}] ${x.question}`;
      topicInput.focus();
      toast("已填入题目，写完后保存", "ok");
    }
  };

  /* ============ 标签切换 ============ */
  const setTab = (name) => {
    document.querySelectorAll(".tab").forEach((t, i) => {
      t.classList.toggle("is-active", (i === 0) === (name === "record"));
      t.setAttribute("aria-selected", String((i === 0) === (name === "record")));
    });
    content.innerHTML = "";
    if (name === "record") { content.append(recordsTab); renderRecords(); }
    else { content.append(bankTab); renderBank(); }
  };

  q.addEventListener("input", renderBank);
  taskFilter.addEventListener("change", () => { buildCatOptions(); renderBank(); });
  catFilter.addEventListener("change", renderBank);

  setTab("record");
  root.append(page);

  function openBank(mode) {
    setTab("bank");
    if (mode === "random") setTimeout(pickRandom, 50);
  }
}

function addForm(onsubmit, onMount) {
  const taskType = h("select", { class: "select" }, h("option", { value: "task1" }, "Task 1 · 图表作文"), h("option", { value: "task2" }, "Task 2 · 议论文"));
  const topic = h("input", { class: "input", placeholder: "题目 / 话题 *", required: true });
  const score = h("input", { class: "input", type: "number", min: "0", max: "9", step: "0.5", placeholder: "自评分数（可选）" });
  const essay = h("textarea", { class: "textarea", placeholder: "粘贴你的作文正文（可选）", rows: 6 });
  const notes = h("input", { class: "input", placeholder: "复盘备注（可选），如：结构、词汇、语法问题" });
  onMount?.(topic);
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
