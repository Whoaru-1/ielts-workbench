/* ============================================================
 * practice.js — 真题模考与练习：记录成绩 / 估分 / 历史
 * ============================================================ */
import * as store from "../store.js";
import { h, panel, badge, icon, esc, emptyState, toast } from "../ui.js";

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
      h("h1", { class: "page-title" }, "真题模考", h("span", { class: "t-sub" }, "记录每次练习与估分 · 估分仅供参考，不同试卷难度有差异")),
      h("div", { class: "page-actions" }, h("button", { class: "btn btn-primary btn-sm", onclick: toggleForm }, icon("plus"), "记录练习"))
    )
  );

  /* 概览 */
  const ps = store.practiceStats();
  page.append(h("div", { class: "stat-grid" },
    h("div", { class: "stat" }, h("div", { class: "k" }, "练习次数"), h("div", { class: "v" }, ps.total)),
    h("div", { class: "stat" }, h("div", { class: "k" }, "平均估分"), h("div", { class: "v" }, ps.avgBand ?? "—")),
    ...MODULES.map(([m, label]) =>
      h("div", { class: "stat" },
        h("div", { class: "k" }, `${label}平均`),
        h("div", { class: "v" }, ps.byModule[m]?.avgBand ?? "—"),
        h("div", { class: "d" }, `${ps.byModule[m]?.count ?? 0} 次`)
      )
    )
  ));

  /* 新增表单（内联） */
  const formPanel = panel({
    title: "记录一次练习",
    body: addForm((rec) => { store.addPractice(rec); toast("练习已记录", "ok"); rerenderAll(); app.refreshChrome(); }),
  });
  formPanel.style.display = "none";
  page.append(formPanel);

  /* 筛选 + 列表 */
  const filter = h("select", { class: "select" },
    h("option", { value: "all" }, "全部模块"),
    ...MODULES.map(([m, label]) => h("option", { value: m }, label))
  );
  const listWrap = h("div", {});
  page.append(h("div", { class: "toolbar" }, filter), listWrap);

  const renderList = () => {
    const list = store.practiceList(filter.value);
    listWrap.innerHTML = "";
    if (list.length === 0) {
      listWrap.append(panel({ title: "练习历史", body: emptyState("practice", "还没有练习记录", "完成一次听力或阅读练习后，点击右上角「记录练习」保存成绩。") }));
      return;
    }
    listWrap.append(panel({
      title: `练习历史 · ${list.length} 条`,
      body: h("div", { class: "tbl-wrap" },
        h("table", { class: "tbl" },
          h("thead", null, h("tr", null, h("th", null, "日期"), h("th", null, "模块"), h("th", null, "标题"), h("th", { class: "num" }, "得分"), h("th", { class: "num" }, "估分"), h("th", { class: "num" }, "用时"), h("th", null, "备注"), h("th", null, ""))),
          h("tbody", null, list.map((p) =>
            h("tr", null,
              h("td", { class: "num" }, store.fmtDate(p.date)),
              h("td", null, badge(store.moduleLabel(p.module), "acc")),
              h("td", null, esc(p.title)),
              h("td", { class: "num" }, p.total ? `${p.correct}/${p.total}` : `${p.correct} 题`),
              h("td", { class: "num" }, p.band != null ? p.band : "—"),
              h("td", { class: "num" }, p.minutes ? `${p.minutes}′` : "—"),
              h("td", null, h("span", { class: "truncate", title: p.notes }, esc(p.notes))),
              h("td", null, h("div", { class: "row-actions" },
                h("button", { class: "icon-btn danger", title: "删除", onclick: () => { store.deletePractice(p.id); renderList(); app.refreshChrome(); } }, icon("trash"))
              ))
            )
          ))
        )
      )
    }));
  };

  function toggleForm() {
    formPanel.style.display = formPanel.style.display === "none" ? "" : "none";
  }

  function rerenderAll() { renderList(); }
  filter.addEventListener("change", renderList);
  renderList();
  root.append(page);
}

function addForm(onsubmit) {
  const module = h("select", { class: "select" }, ...MODULES.map(([m, label]) => h("option", { value: m }, label)));
  const title = h("input", { class: "input", placeholder: "练习标题，如 Cambridge 17 Test 2" });
  const date = h("input", { class: "input", type: "date", value: store.todayKey() });
  const correct = h("input", { class: "input", type: "number", min: "0", max: "40", placeholder: "答对题数", value: "0" });
  const total = h("input", { class: "input", type: "number", min: "0", max: "40", placeholder: "总题数（听力/阅读 40 题）", value: "40" });
  const band = h("input", { class: "input", type: "number", min: "0", max: "9", step: "0.5", placeholder: "写作/口语自评（可选）" });
  const minutes = h("input", { class: "input", type: "number", min: "0", placeholder: "用时（分钟）" });
  const notes = h("input", { class: "input", placeholder: "备注（可选）" });
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
