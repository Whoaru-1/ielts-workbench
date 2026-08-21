/* ============================================================
 * practice.js — 真题模考：练习记录 / 模考计时 / 题型攻略 / 错题本
 * ============================================================ */
import * as store from "../store.js";
import { h, panel, badge, icon, esc, emptyState, toast } from "../ui.js";
import GUIDES from "../data/practice-guides.js";

const MODULES = [
  ["listening", "听力"],
  ["reading", "阅读"],
  ["writing", "写作"],
  ["speaking", "口语"],
];

export function render(root, app) {
  root.innerHTML = "";
  const page = h("div", { class: "page" });
  page.append(
    h("div", { class: "page-head" },
      h("h1", { class: "page-title" }, "真题模考", h("span", { class: "t-sub" }, "计时模考 · 题型攻略 · 错题本 · 成绩记录")),
      h("div", { class: "page-actions" }, h("button", { class: "btn btn-primary btn-sm", onclick: () => setTab("timer") }, icon("clock"), "开始模考"))
    )
  );

  /* 概览 */
  const ps = store.practiceStats();
  page.append(h("div", { class: "stat-grid" },
    h("div", { class: "stat" }, h("div", { class: "k" }, "练习次数"), h("div", { class: "v" }, ps.total)),
    h("div", { class: "stat" }, h("div", { class: "k" }, "平均估分"), h("div", { class: "v" }, ps.avgBand ?? "—")),
    h("div", { class: "stat" }, h("div", { class: "k" }, "错题数"), h("div", { class: "v" }, store.mistakesList().length), h("div", { class: "d warn" }, "错题本中待复盘")),
    h("div", { class: "stat" }, h("div", { class: "k" }, "写作已练"), h("div", { class: "v" }, store.writingPracticedCount()))
  ));

  /* 标签页 */
  const tabBar = h("div", { class: "tabbar", role: "tablist" },
    h("button", { class: "tab is-active", role: "tab", "aria-selected": "true", onclick: () => setTab("record") }, "练习记录"),
    h("button", { class: "tab", role: "tab", "aria-selected": "false", onclick: () => setTab("timer") }, "模考计时"),
    h("button", { class: "tab", role: "tab", "aria-selected": "false", onclick: () => setTab("guide") }, "题型攻略"),
    h("button", { class: "tab", role: "tab", "aria-selected": "false", onclick: () => setTab("mistake") }, "错题本")
  );
  page.append(tabBar);
  const content = h("div", {});
  page.append(content);

  /* ============ 记录标签 ============ */
  let titleInput = null;
  const formPanel = panel({
    title: "记录一次练习",
    body: addForm((rec) => { store.addPractice(rec); toast("练习已记录", "ok"); renderRecords(); app.refreshChrome(); }, (el) => { titleInput = el; }),
  });
  const filter = h("select", { class: "select" },
    h("option", { value: "all" }, "全部模块"),
    ...MODULES.map(([m, label]) => h("option", { value: m }, label))
  );
  const listWrap = h("div", {});
  const recordsTab = h("div", { class: "tab-pane" }, formPanel, h("div", { class: "toolbar" }, filter), listWrap);

  const renderRecords = () => {
    const list = store.practiceList(filter.value);
    listWrap.innerHTML = "";
    if (list.length === 0) {
      listWrap.append(panel({ title: "练习历史", body: emptyState("practice", "还没有练习记录", "用「模考计时」完成一次练习，或直接记录成绩。") }));
      return;
    }
    listWrap.append(panel({
      title: `练习历史 · ${list.length} 条`,
      body: h("div", { class: "tbl-wrap" },
        h("table", { class: "tbl" },
          h("thead", null, h("tr", null, h("th", null, "日期"), h("th", null, "模块"), h("th", null, "标题"), h("th", { class: "num" }, "得分"), h("th", { class: "num" }, "估分"), h("th", { class: "num" }, "用时"), h("th", null, ""))),
          h("tbody", null, list.map((p) =>
            h("tr", null,
              h("td", { class: "num" }, store.fmtDate(p.date)),
              h("td", null, badge(store.moduleLabel(p.module), "acc")),
              h("td", null, h("span", { class: "truncate", title: p.title }, esc(p.title))),
              h("td", { class: "num" }, p.total ? `${p.correct}/${p.total}` : `${p.correct} 题`),
              h("td", { class: "num" }, p.band != null ? p.band : "—"),
              h("td", { class: "num" }, p.minutes ? `${p.minutes}′` : "—"),
              h("td", null, h("div", { class: "row-actions" },
                h("button", { class: "icon-btn danger", title: "删除", onclick: () => { store.deletePractice(p.id); renderRecords(); app.refreshChrome(); } }, icon("trash"))
              ))
            )
          ))
        )
      )
    }));
  };
  filter.addEventListener("change", renderRecords);

  /* ============ 模考计时标签 ============ */
  const timerPanel = h("div", {});
  const TIMER_PRESETS = [
    ["listening", "听力模考", 30],
    ["reading", "阅读模考", 60],
    ["writing", "写作模考", 60],
  ];
  let timerLeft = 0, timerTimer = null;

  const renderTimer = () => {
    const sel = h("select", { class: "select" },
      TIMER_PRESETS.map(([m, label, min]) => h("option", { value: `${m}:${min}` }, `${label}（${min} 分钟）`))
    );
    const display = h("div", { class: "timer-display", id: "timer-display" }, "30:00");
    const startBtn = h("button", { class: "btn btn-primary", id: "timer-start", onclick: () => {
      if (timerTimer) return;
      if (timerLeft <= 0) {
        const [, min] = sel.value.split(":");
        timerLeft = Number(min) * 60;
      }
      timerTimer = setInterval(() => {
        timerLeft--;
        if (timerLeft <= 0) { clearInterval(timerTimer); timerTimer = null; display.textContent = "00:00"; toast("时间到！模考结束", "warn"); }
        else display.textContent = fmt(timerLeft);
      }, 1000);
      startBtn.textContent = "计时中…";
      startBtn.disabled = true;
      pauseBtn.disabled = false;
    } }, icon("clock"), "开始计时");
    const pauseBtn = h("button", { class: "btn btn-ghost", disabled: true, onclick: () => {
      if (timerTimer) { clearInterval(timerTimer); timerTimer = null; startBtn.textContent = "继续"; startBtn.disabled = false; }
    } }, "暂停");
    const resetBtn = h("button", { class: "btn btn-ghost", onclick: () => {
      if (timerTimer) { clearInterval(timerTimer); timerTimer = null; }
      const [, min] = sel.value.split(":");
      timerLeft = Number(min) * 60;
      display.textContent = fmt(timerLeft);
      startBtn.textContent = "开始计时"; startBtn.disabled = false; pauseBtn.disabled = true;
    } }, icon("close"), "重置");
    const doneBtn = h("button", { class: "btn btn-danger", onclick: () => {
      if (timerTimer) { clearInterval(timerTimer); timerTimer = null; }
      const [m, min] = sel.value.split(":");
      const label = TIMER_PRESETS.find((x) => x[0] === m)[1];
      const used = Number(min) * 60 - Math.max(0, timerLeft);
      setTab("record");
      if (titleInput) { titleInput.value = `[${label}] ${store.todayKey()}`; titleInput.focus(); }
      toast(`本次练习 ${Math.round(used / 60)} 分钟，补充成绩后保存`, "ok");
    } }, "结束并记录");
    const hint = h("div", { class: "timer-hint" }, "听力约 30 分钟（含誊写），阅读 60 分钟无额外誊写时间，写作 60 分钟（Task1 约 20 分钟 + Task2 约 40 分钟）。建议用手机/纸质卷做真题，用本计时器掐时间。");
    timerPanel.innerHTML = "";
    timerPanel.append(panel({
      title: "模考计时器",
      body: h("div", { class: "timer-box" },
        sel,
        display,
        h("div", { class: "btn-row" }, startBtn, pauseBtn, resetBtn, doneBtn),
        hint
      )
    }));
  };
  function fmt(s) {
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${m}:${ss}`;
  }
  const timersTab = h("div", { class: "tab-pane" }, timerPanel);

  /* ============ 题型攻略标签 ============ */
  const guideTab = h("div", { class: "tab-pane" }, renderGuides());

  /* ============ 错题本标签 ============ */
  const mFilter = h("select", { class: "select" },
    h("option", { value: "all" }, "全部模块"),
    h("option", { value: "listening" }, "听力"),
    h("option", { value: "reading" }, "阅读")
  );
  const mListWrap = h("div", {});
  let mModule, mQtype, mNote;
  const mForm = h("form", { class: "form-grid", onsubmit: (e) => {
    e.preventDefault();
    if (!mNote.value.trim()) { toast("请填写错题说明", "warn"); return; }
    store.addMistake({ module: mModule.value, qtype: mQtype.value, note: mNote.value });
    mNote.value = ""; renderMistakes(); app.refreshChrome();
  } },
    h("div", { class: "field" }, h("label", null, "模块"), mModule = h("select", { class: "select" }, h("option", { value: "listening" }, "听力"), h("option", { value: "reading" }, "阅读"))),
    h("div", { class: "field" }, h("label", null, "题型/原因"), mQtype = h("input", { class: "input", placeholder: "如：T/F/NG、地图题、同义替换" })),
    h("div", { class: "field", style: "grid-column:1/-1" }, h("label", null, "错因记录"), mNote = h("input", { class: "input", placeholder: "这题为什么错？下次怎么避免？", required: true })),
    h("div", { class: "form-actions" }, h("button", { class: "btn btn-primary", type: "submit" }, icon("plus"), "记入错题本"))
  );
  const mistakesTab = h("div", { class: "tab-pane" },
    panel({ title: "记录一条错题", body: mForm }),
    h("div", { class: "toolbar" }, mFilter),
    mListWrap
  );

  const renderMistakes = () => {
    const list = store.mistakesList(mFilter.value);
    mListWrap.innerHTML = "";
    if (list.length === 0) {
      mListWrap.append(panel({ title: "错题本", body: emptyState("practice", "还没有错题记录", "做完题把错题记下来，考前重点复盘，比盲目刷题更有效。") }));
      return;
    }
    mListWrap.append(panel({
      title: `错题本 · ${list.length} 条`,
      body: h("div", { class: "writing-list" }, list.map((m) =>
        h("article", { class: "writing-item" },
          h("div", { class: "writing-head" },
            h("div", null,
              h("div", { class: "writing-title" }, badge(store.moduleLabel(m.module), "acc"), badge(m.qtype, "warn"), h("strong", null, esc(m.note))),
              h("div", { class: "writing-meta" }, `日期 ${store.fmtDate(m.date)}`)
            ),
            h("div", { class: "writing-right" },
              h("button", { class: "icon-btn danger", title: "删除", onclick: () => { store.deleteMistake(m.id); renderMistakes(); app.refreshChrome(); } }, icon("trash"))
            )
          )
        )
      ))
    }));
  };
  mFilter.addEventListener("change", renderMistakes);

  /* ============ 标签切换 ============ */
  const setTab = (name) => {
    const order = ["record", "timer", "guide", "mistake"];
    document.querySelectorAll(".tab").forEach((t, i) => {
      t.classList.toggle("is-active", order[i] === name);
      t.setAttribute("aria-selected", String(order[i] === name));
    });
    content.innerHTML = "";
    if (name === "record") { content.append(recordsTab); renderRecords(); }
    else if (name === "timer") { content.append(timersTab); renderTimer(); }
    else if (name === "guide") { content.append(guideTab); }
    else { content.append(mistakesTab); renderMistakes(); }
  };

  setTab("record");
  root.append(page);
}

function renderGuides() {
  return Object.entries(GUIDES).map(([key, g]) =>
    panel({
      title: `${g.module} · ${g.duration} 分钟 · ${g.types.length} 种题型`,
      body: h("div", null,
        h("p", { class: "guide-desc" }, g.description),
        h("p", { class: "guide-strategy" }, h("strong", null, "总体策略："), g.strategy),
        h("div", { class: "guide-types" }, g.types.map((t) =>
          h("details", { class: "guide-type" },
            h("summary", null, t.name),
            h("ul", null, t.tips.map((tip) => h("li", null, tip)))
          )
        ))
      )
    })
  );
}

function addForm(onsubmit, onMount) {
  const module = h("select", { class: "select" }, ...MODULES.map(([m, label]) => h("option", { value: m }, label)));
  const title = h("input", { class: "input", placeholder: "练习标题，如 Cambridge 17 Test 2" });
  const date = h("input", { class: "input", type: "date", value: store.todayKey() });
  const correct = h("input", { class: "input", type: "number", min: "0", max: "40", placeholder: "答对题数", value: "0" });
  const total = h("input", { class: "input", type: "number", min: "0", max: "40", placeholder: "总题数（听力/阅读 40 题）", value: "40" });
  const band = h("input", { class: "input", type: "number", min: "0", max: "9", step: "0.5", placeholder: "写作/口语自评（可选）" });
  const minutes = h("input", { class: "input", type: "number", min: "0", placeholder: "用时（分钟）" });
  const notes = h("input", { class: "input", placeholder: "备注（可选）" });
  onMount?.(title);
  const form = h("form", { class: "form-grid", onsubmit: (e) => {
    e.preventDefault();
    onsubmit({
      module: module.value,
      title: title.value,
      date: date.value || store.todayKey(),
      correct: Number(correct.value) || 0,
      total: Number(total.value) || 0,
      band: band.value === "" ? null : Number(band.value),
      minutes: Number(minutes.value) || 0,
      notes: notes.value,
    });
    title.value = ""; correct.value = "0"; total.value = "40"; band.value = ""; minutes.value = ""; notes.value = "";
  } },
    h("div", { class: "field" }, h("label", null, "模块"), module),
    h("div", { class: "field" }, h("label", null, "标题"), title),
    h("div", { class: "field" }, h("label", null, "日期"), date),
    h("div", { class: "field" }, h("label", null, "答对题数"), correct),
    h("div", { class: "field" }, h("label", null, "总题数"), total),
    h("div", { class: "field" }, h("label", null, "自评 band"), band),
    h("div", { class: "field" }, h("label", null, "用时"), minutes),
    h("div", { class: "field", style: "grid-column:1/-1" }, h("label", null, "备注"), notes),
    h("div", { class: "form-actions" }, h("button", { class: "btn btn-primary", type: "submit" }, icon("plus"), "保存记录"))
  );
  return form;
}
