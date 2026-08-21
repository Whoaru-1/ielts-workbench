/* ============================================================
 * vocab.js — 词汇：词表 / 筛选 / 新增 / 自测
 * ============================================================ */
import * as store from "../store.js";
import { h, panel, badge, icon, esc, emptyState, toast } from "../ui.js";

const STATUS_LABEL = { new: "陌生", learning: "学习中", mastered: "已掌握" };
const STATUS_KIND = { new: "", learning: "warn", mastered: "ok" };

export function render(root, app) {
  root.innerHTML = "";
  const page = h("div", { class: "page" });
  page.append(
    h("div", { class: "page-head" },
      h("h1", { class: "page-title" }, "词汇", h("span", { class: "t-sub" }, "生词本 · 内置约 100 个入门词，可自由增删")),
      h("div", { class: "page-actions" },
        h("button", { class: "btn btn-primary btn-sm", onclick: () => startQuiz() }, icon("spark"), "开始自测")
      )
    )
  );

  /* 状态统计条 */
  const v = store.vocabStats();
  page.append(h("div", { class: "stat-grid" },
    statOf("全部", v.total, ""),
    statOf("陌生", v.new, ""),
    statOf("学习中", v.learning, "warn"),
    statOf("已掌握", v.mastered, "ok")
  ));

  /* 工具条 */
  const q = h("input", { class: "input", placeholder: "搜索单词 / 释义…", "aria-label": "搜索词表" });
  const filter = h("select", { class: "select" },
    h("option", { value: "all" }, "全部状态"),
    h("option", { value: "new" }, "陌生"),
    h("option", { value: "learning" }, "学习中"),
    h("option", { value: "mastered" }, "已掌握")
  );
  page.append(h("div", { class: "toolbar" },
    h("div", { class: "toolbar-search" }, icon("search"), q),
    filter
  ));

  const listWrap = h("div", {});
  page.append(listWrap);

  const renderList = () => {
    const words = store.vocabList(filter.value, q.value);
    listWrap.innerHTML = "";
    if (words.length === 0) {
      listWrap.append(panel({ title: "词表", body: emptyState("vocab", "词表为空", "点击右上角「新增单词」添加，或先导入进度文件。") }));
      return;
    }
    listWrap.append(panel({
      title: `词表 · ${words.length} 词`,
      body: h("div", { class: "vocab-list" }, words.map((w) =>
        h("div", { class: "vocab-item" },
          h("div", null,
            h("div", { class: "vocab-word" }, esc(w.word), w.phonetic ? h("span", { class: "phonetic" }, esc(w.phonetic)) : null),
            w.example ? h("div", { class: "vocab-example" }, `"${esc(w.example)}"`) : null
          ),
          h("div", { class: "vocab-meaning" }, esc(w.meaning || "—")),
          h("div", { class: "vocab-right" },
            badge(STATUS_LABEL[w.status] || w.status, STATUS_KIND[w.status]),
            h("div", { class: "row-actions" },
              cycleBtn(w, renderList),
              h("button", { class: "icon-btn danger", title: "删除", onclick: () => { store.deleteWord(w.id); renderList(); app.refreshChrome(); } }, icon("trash"))
            )
          )
        )
      ))
    }));
  };

  /* 新增面板（内联展开，不用弹窗） */
  const form = addForm((rec) => {
    store.addWord(rec);
    toast(`已添加「${rec.word}」`, "ok");
    renderList();
    app.refreshChrome();
  });
  page.append(panel({ title: "新增单词", body: form }));

  q.addEventListener("input", renderList);
  filter.addEventListener("change", renderList);
  renderList();
  root.append(page);

  /* ---- 自测 ---- */
  function startQuiz() {
    const pool = store.vocabList("all").filter((w) => w.status !== "mastered");
    if (pool.length < 4) {
      toast("至少需要 4 个未掌握的单词才能自测", "warn");
      return;
    }
    const quiz = buildQuiz(pool);
    renderQuiz(quiz, pool);
  }

  function buildQuiz(pool) {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const take = shuffled.slice(0, 10);
    return take.map((w) => {
      const others = pool.filter((x) => x.id !== w.id).sort(() => Math.random() - 0.5).slice(0, 3);
      const options = [w, ...others].sort(() => Math.random() - 0.5);
      return { word: w, options };
    });
  }

  function renderQuiz(quiz, pool) {
    page.innerHTML = "";
    const qz = quiz[0];
    if (!qz) { finishQuiz(); return; }
    page.append(h("div", { class: "page" },
      h("div", { class: "page-head" },
        h("h1", { class: "page-title" }, "词汇自测", h("span", { class: "t-sub" }, `剩余 ${quiz.length} 题 · 从 ${pool.length} 个未掌握单词中抽取`)),
        h("div", { class: "page-actions" }, h("button", { class: "btn btn-ghost btn-sm", onclick: () => render(root, app) }, icon("close"), "退出自测"))
      ),
      h("section", { class: "panel" },
        h("div", { class: "panel-body" },
          h("div", { class: "quiz-prompt" }, esc(qz.word.word)),
          qz.word.phonetic ? h("div", { class: "quiz-sub" }, esc(qz.word.phonetic)) : null,
          h("div", { class: "quiz-options" }, qz.options.map((o, i) =>
            h("button", { class: "quiz-option", id: `opt-${i}`, onclick: (e) => answer(quiz, e.currentTarget, o, qz) }, esc(o.meaning))
          )),
          h("div", { id: "quiz-feedback" })
        )
      )
    ));

    function answer(qzList, btn, chosen, q) {
      const right = chosen.id === q.word.id;
      store.recordQuiz(q.word.id, right);
      const feedback = document.getElementById("quiz-feedback");
      const options = [...document.querySelectorAll(".quiz-option")];
      options.forEach((b) => (b.disabled = true));
      btn.classList.add(right ? "correct" : "wrong");
      const rightBtn = options[q.options.findIndex((o) => o.id === q.word.id)];
      if (rightBtn && !rightBtn.classList.contains("wrong")) rightBtn.classList.add("correct");
      feedback.replaceChildren(h("div", { class: `quiz-result ${right ? "ok" : "bad"}` },
        right ? `答对了！${esc(q.word.word)} = ${esc(q.word.meaning)}` : `正确答案：${esc(q.word.word)} = ${esc(q.word.meaning)}`
      ));
      app.refreshChrome();
      setTimeout(() => { qzList.shift(); renderQuiz(qzList, pool); }, 1400);
    }
  }

  function finishQuiz() {
    const v2 = store.vocabStats();
    page.innerHTML = "";
    page.append(h("div", { class: "page" },
      h("div", { class: "page-head" }, h("h1", { class: "page-title" }, "自测完成", h("span", { class: "t-sub" }, "本轮自测结束"))),
      h("div", { class: "stat-grid" },
        statOf("已掌握", v2.mastered, "ok"),
        statOf("学习中", v2.learning, "warn"),
        statOf("陌生", v2.new, "")
      ),
      h("div", { class: "btn-row" },
        h("button", { class: "btn btn-primary", onclick: () => startQuiz() }, icon("spark"), "再来一轮"),
        h("button", { class: "btn btn-ghost", onclick: () => render(root, app) }, "返回词表")
      )
    ));
  }
}

function statOf(k, val, kind) {
  return h("div", { class: "stat" },
    h("div", { class: "k" }, k),
    h("div", { class: `v ${kind ? "d " + kind : ""}` }, val)
  );
}

function cycleBtn(w, rerender) {
  const next = { new: "learning", learning: "mastered", mastered: "new" };
  return h("button", {
    class: "icon-btn", title: "切换掌握状态",
    onclick: () => { store.updateWord(w.id, { status: next[w.status] || "new" }); rerender(); }
  }, icon("arrowUp"));
}

function addForm(onsubmit) {
  const word = h("input", { class: "input", placeholder: "英文单词 *", required: true });
  const phonetic = h("input", { class: "input", placeholder: "音标，如 /əˈbʌndənt/" });
  const meaning = h("input", { class: "input", placeholder: "中文释义 *", required: true });
  const example = h("input", { class: "input", placeholder: "例句（可选）" });
  const form = h("form", { class: "form-grid", onsubmit: (e) => {
    e.preventDefault();
    if (!word.value.trim() || !meaning.value.trim()) { toast("单词和释义不能为空", "warn"); return; }
    onsubmit({ word: word.value, phonetic: phonetic.value, meaning: meaning.value, example: example.value });
    word.value = ""; phonetic.value = ""; meaning.value = ""; example.value = "";
    word.focus();
  } },
    h("div", { class: "field" }, h("label", null, "单词"), word),
    h("div", { class: "field" }, h("label", null, "音标"), phonetic),
    h("div", { class: "field" }, h("label", null, "释义"), meaning),
    h("div", { class: "field" }, h("label", null, "例句"), example),
    h("div", { class: "form-actions" }, h("button", { class: "btn btn-primary", type: "submit" }, icon("plus"), "加入词表"))
  );
  return form;
}
