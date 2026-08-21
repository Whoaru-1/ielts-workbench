/* ============================================================
 * speaking.js — 口语：练习记录 + 口语题库（P1/P2/P3 真题库）
 * ============================================================ */
import * as store from "../store.js";
import { h, panel, badge, icon, esc, emptyState, toast } from "../ui.js";
import part1 from "../data/speaking-part1.js";
import part2 from "../data/speaking-part2.js";
import part3 from "../data/speaking-part3.js";
import aP1 from "../data/answers-speaking-p1.js";
import aP2 from "../data/answers-speaking-p2.js";
import aP3 from "../data/answers-speaking-p3.js";

const ANSWERS = { ...aP1, ...aP2, ...aP3 };
const BANK = [
  ...part1.map((q) => ({ ...q, part: 1 })),
  ...part2.map((q) => ({ ...q, part: 2 })),
  ...part3.map((q) => ({ ...q, part: 3 })),
];
const PART_LABEL = { 1: "Part 1", 2: "Part 2", 3: "Part 3" };
const PART_KIND = { 1: "acc", 2: "warn", 3: "ok" };

export function render(root, app) {
  root.innerHTML = "";
  const page = h("div", { class: "page" });
  page.append(
    h("div", { class: "page-head" },
      h("h1", { class: "page-title" }, "口语", h("span", { class: "t-sub" }, `口语题库（P1/P2/P3 高频真题整理，非官方出版物）· 已练 ${store.speakingPracticedCount()} 题`)),
      h("div", { class: "page-actions" }, h("button", { class: "btn btn-primary btn-sm", onclick: () => openBank("random") }, icon("spark"), "随机抽题"))
    )
  );

  /* 标签页 */
  const tabBar = h("div", { class: "tabbar", role: "tablist" },
    h("button", { class: "tab is-active", role: "tab", "aria-selected": "true", onclick: () => setTab("record") }, "练习记录"),
    h("button", { class: "tab", role: "tab", "aria-selected": "false", onclick: () => setTab("bank") }, `口语题库 (${BANK.length})`)
  );
  page.append(tabBar);

  const content = h("div", {});
  page.append(content);

  /* ============ 记录标签 ============ */
  let topicInput = null;
  const recordFormPanel = panel({
    title: "新增口语记录",
    body: addForm((rec) => { store.addSpeaking(rec); toast("口语记录已保存", "ok"); renderRecords(); app.refreshChrome(); }, (el) => { topicInput = el; }),
  });
  const recordListWrap = h("div", {});
  const recordsTab = h("div", { class: "tab-pane" }, recordFormPanel, recordListWrap);

  const renderRecords = () => {
    const list = store.speakingList();
    recordListWrap.innerHTML = "";
    if (list.length === 0) {
      recordListWrap.append(panel({ title: "口语记录", body: emptyState("speaking", "还没有口语记录", "去「口语题库」挑一道题练习，或用下方表单手动记录。") }));
      return;
    }
    recordListWrap.append(panel({
      title: `口语记录 · ${list.length} 条`,
      body: h("div", { class: "writing-list" }, list.map((s) =>
        h("article", { class: "writing-item" },
          h("div", { class: "writing-head" },
            h("div", null,
              h("div", { class: "writing-title" }, badge(`Part ${s.part}`, PART_KIND[s.part] || "acc"), h("strong", null, esc(s.topic))),
              h("div", { class: "writing-meta" }, `日期 ${store.fmtDate(s.date)}`)
            ),
            h("div", { class: "writing-right" },
              s.score != null ? badge(`自评 ${s.score}`, s.score >= 6.5 ? "ok" : "warn") : null,
              h("button", { class: "icon-btn danger", title: "删除", onclick: () => { store.deleteSpeaking(s.id); renderRecords(); app.refreshChrome(); } }, icon("trash"))
            )
          ),
          s.notes ? h("div", { class: "writing-notes" }, esc(s.notes)) : null
        )
      ))
    }));
  };

  /* ============ 题库标签 ============ */
  const randPanel = h("div", { id: "rand-panel" });
  const q = h("input", { class: "input", placeholder: "搜索题目关键词…", "aria-label": "搜索口语题" });
  const partFilter = h("select", { class: "select", "aria-label": "按 Part 筛选" },
    h("option", { value: "all" }, "全部 Part"),
    h("option", { value: "1" }, "Part 1 问答"),
    h("option", { value: "2" }, "Part 2 话题卡"),
    h("option", { value: "3" }, "Part 3 讨论")
  );
  const catFilter = h("select", { class: "select", "aria-label": "按话题筛选" }, h("option", { value: "all" }, "全部话题"));
  const bankListWrap = h("div", {});

  const bankTab = h("div", { class: "tab-pane" },
    randPanel,
    panel({ title: "题库浏览", body:
      h("div", null,
        h("div", { class: "toolbar" },
          h("div", { class: "toolbar-search" }, icon("search"), q),
          partFilter, catFilter,
          h("button", { class: "btn btn-ghost btn-sm", onclick: () => pickRandom() }, icon("spark"), "换一题")
        ),
        bankListWrap
      )
    })
  );

  const buildCatOptions = () => {
    const cats = [...new Set(BANK.map((x) => x.category))];
    catFilter.innerHTML = "";
    catFilter.append(h("option", { value: "all" }, "全部话题"));
    for (const c of cats) catFilter.append(h("option", { value: c }, c));
  };
  buildCatOptions();

  const renderBank = () => {
    const p = partFilter.value;
    const c = catFilter.value;
    const query = q.value.trim().toLowerCase();
    const list = BANK.filter((x) =>
      (p === "all" || String(x.part) === p) &&
      (c === "all" || x.category === c) &&
      (!query || x.question.toLowerCase().includes(query))
    );
    bankListWrap.innerHTML = "";
    if (list.length === 0) {
      bankListWrap.append(emptyState("speaking", "没有符合条件的题目", "换个筛选条件试试。"));
      return;
    }
    bankListWrap.append(h("div", { class: "bank-list" }, list.map((x) => {
      const practiced = store.isSpeakingPracticed(x.id);
      const answer = ANSWERS[x.id];
      return h("div", { class: `bank-item${practiced ? " practiced" : ""}` },
        h("div", { class: "bank-main" },
          h("div", { class: "bank-head" },
            badge(PART_LABEL[x.part], PART_KIND[x.part]),
            badge(x.category, "acc"),
            answer ? badge("有范文", "ok") : null,
            practiced ? badge("已练", "ok") : null
          ),
          h("div", { class: "bank-question" }, esc(x.question)),
          answer ? h("details", { class: "bank-answer" },
            h("summary", null, "参考答案（高分示范）"),
            h("div", { class: "bank-answer-body" }, esc(answer))
          ) : null
        ),
        h("div", { class: "bank-actions" },
          h("button", { class: "btn btn-ghost btn-sm", title: practiced ? "取消已练标记" : "标记为已练", onclick: () => { store.toggleSpeakingPracticed(x.id); renderBank(); app.refreshChrome(); } },
            icon("check"), practiced ? "取消" : "标记已练"),
          h("button", { class: "btn btn-primary btn-sm", onclick: () => useInRecord(x) }, icon("edit"), "记录练习")
        )
      );
    })));
  };

  /* 随机抽题 */
  const pickRandom = () => {
    const p = partFilter.value;
    const pool = BANK.filter((x) => p === "all" || String(x.part) === p);
    if (!pool.length) { toast("当前筛选下没有题目", "warn"); return; }
    const x = pool[Math.floor(Math.random() * pool.length)];
    const practiced = store.isSpeakingPracticed(x.id);
    const answer = ANSWERS[x.id];
    randPanel.innerHTML = "";
    randPanel.append(h("div", { class: "rand-card" },
      h("div", { class: "bank-head" },
        badge("随机抽题", "warn"),
        badge(PART_LABEL[x.part], PART_KIND[x.part]),
        badge(x.category, "acc"),
        practiced ? badge("已练", "ok") : null
      ),
      h("div", { class: "rand-question" }, esc(x.question)),
      answer ? h("details", { class: "bank-answer" },
        h("summary", null, "参考答案（高分示范）"),
        h("div", { class: "bank-answer-body" }, esc(answer))
      ) : null,
      h("div", { class: "btn-row" },
        h("button", { class: "btn btn-primary btn-sm", onclick: () => useInRecord(x) }, icon("edit"), "用此题记录练习"),
        h("button", { class: "btn btn-ghost btn-sm", onclick: () => { store.toggleSpeakingPracticed(x.id); pickRandom(); app.refreshChrome(); } }, icon("check"), practiced ? "取消已练" : "标记已练"),
        h("button", { class: "btn btn-ghost btn-sm", onclick: pickRandom }, icon("spark"), "换一题")
      )
    ));
  };

  /* 用题库题目开始记录：切到记录标签并预填话题 */
  const useInRecord = (x) => {
    setTab("record");
    if (topicInput) {
      topicInput.value = `[${PART_LABEL[x.part]}] ${x.question}`;
      topicInput.focus();
      toast("已填入话题，补充记录后保存", "ok");
    }
  };

  /* ============ 标签切换 ============ */
  const setTab = (name) => {
    document.querySelectorAll(".tab").forEach((t, i) => {
      t.classList.toggle("is-active", (i === 0) === (name === "record"));
      t.setAttribute("aria-selected", String((i === 0) === (name === "record")));
    });
    content.innerHTML = "";
    if (name === "record") {
      content.append(recordsTab);
      renderRecords();
    } else {
      content.append(bankTab);
      renderBank();
    }
  };

  q.addEventListener("input", renderBank);
  partFilter.addEventListener("change", () => { buildCatOptions(); renderBank(); });
  catFilter.addEventListener("change", renderBank);

  setTab("record");
  root.append(page);

  /* 顶部"随机抽题"入口 */
  function openBank(mode) {
    setTab("bank");
    if (mode === "random") setTimeout(pickRandom, 50);
  }
}

function addForm(onsubmit, onMount) {
  const part = h("select", { class: "select" }, h("option", { value: "1" }, "Part 1 · 日常问答"), h("option", { value: "2" }, "Part 2 · 个人陈述"), h("option", { value: "3" }, "Part 3 · 深入讨论"));
  const topic = h("input", { class: "input", placeholder: "话题 / 题目 *", required: true });
  const score = h("input", { class: "input", type: "number", min: "0", max: "9", step: "0.5", placeholder: "自评分数（可选）" });
  const notes = h("textarea", { class: "textarea", placeholder: "表现记录（可选）：流畅度、词汇、发音问题等", rows: 4 });
  onMount?.(topic);
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
