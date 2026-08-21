/* ============================================================
 * settings.js — 设置与数据：目标 / 考试日 / 导入导出 / 清空
 * ============================================================ */
import * as store from "../store.js";
import { h, panel, icon, toast, download, confirmInline } from "../ui.js";

export function render(root, app) {
  root.innerHTML = "";
  const s = store.settings();
  const page = h("div", { class: "page" });

  page.append(
    h("div", { class: "page-head" },
      h("h1", { class: "page-title" }, "设置与数据", h("span", { class: "t-sub" }, "目标设定 · 进度导入导出 · 数据归你所有"))
    )
  );

  /* 目标设置 */
  const band = h("select", { class: "select" },
    ["5.0", "5.5", "6.0", "6.5", "7.0", "7.5", "8.0", "8.5", "9.0"].map((b) => h("option", { value: b, selected: s.targetBand == b }, `目标 ${b}`))
  );
  const examDate = h("input", { class: "input", type: "date", value: s.examDate || "" });
  const dailyMin = h("input", { class: "input", type: "number", min: "10", max: "480", step: "10", value: s.dailyGoalMin });
  const dailyTasks = h("input", { class: "input", type: "number", min: "1", max: "20", value: s.dailyGoalTasks });

  const goalPanel = panel({
    title: "目标设定",
    body: h("div", null,
      h("div", { class: "form-grid" },
        field("目标分数", band),
        field("考试日期", examDate),
        field("每日学习目标（分钟）", dailyMin),
        field("每日任务目标（个）", dailyTasks)
      ),
      h("div", { class: "form-actions" },
        h("button", { class: "btn btn-primary", onclick: () => {
          store.updateSettings({
            targetBand: Number(band.value),
            examDate: examDate.value,
            dailyGoalMin: Number(dailyMin.value) || 30,
            dailyGoalTasks: Number(dailyTasks.value) || 3,
          });
          toast("设置已保存", "ok");
          app.refreshChrome();
        } }, "保存设置")
      )
    ),
  });
  page.append(goalPanel);

  /* 数据管理 */
  const dataPanel = panel({
    title: "数据管理",
    body: h("div", null,
      h("div", { class: "setting-row" },
        h("div", null, h("div", { class: "s-label" }, "导出进度"), h("div", { class: "s-desc" }, "把全部学习进度保存为 JSON 文件，可随时导入到任何浏览器。")),
        h("div", { class: "s-ctl" }, h("button", { class: "btn", onclick: () => {
          const name = `ielts-progress-${store.todayKey()}.json`;
          download(name, store.exportJSON());
          toast("进度已导出", "ok");
        } }, icon("download"), "导出 JSON"))
      ),
      h("div", { class: "setting-row" },
        h("div", null, h("div", { class: "s-label" }, "导入进度"), h("div", { class: "s-desc" }, "从 JSON 文件恢复进度，可选择合并或覆盖。")),
        h("div", { class: "s-ctl" }, h("button", { class: "btn", id: "import-btn", onclick: () => importPicker() }, icon("upload"), "选择文件"))
      ),
      h("div", { id: "import-box" }),
      h("div", { class: "setting-row" },
        h("div", null, h("div", { class: "s-label" }, "清空所有数据"), h("div", { class: "s-desc" }, "删除本浏览器里的全部学习进度，操作不可撤销。")),
        h("div", { class: "s-ctl" }, h("button", { class: "btn btn-danger", id: "reset-btn", onclick: () => resetBox() }, icon("trash"), "清空数据"))
      ),
      h("div", { id: "reset-box" }),
    ),
  });
  page.append(dataPanel);

  /* 关于 */
  page.append(panel({
    title: "关于",
    body: h("div", { class: "about" },
      h("p", null, "IELTS 工作台 · 本地优先的雅思备考控制台。数据保存在当前浏览器的 localStorage，不经过任何服务器；换设备请使用「导出 / 导入」。"),
      h("p", { class: "about-sub" }, "内置 2000+ 分话题词库（12 大雅思话题，非官方词表，可自由修改）；真题练习为自记录模式，估分映射仅供参考。")
    ),
  }));

  root.append(page);

  /* ---- 导入流程 ---- */
  function importPicker() {
    const fileInput = document.getElementById("import-file");
    fileInput.value = "";
    fileInput.onchange = () => {
      const f = fileInput.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const res = store.validateImport(String(reader.result));
        if (!res.ok) { toast(res.error, "bad"); return; }
        showImportChoice(res.data, f.name);
      };
      reader.readAsText(f);
    };
    fileInput.click();
  }

  function showImportChoice(data, fileName) {
    const box = document.getElementById("import-box");
    box.innerHTML = "";
    const summary = `${data.vocab.length} 词 · ${data.practices.length} 条练习 · ${data.writing.length} 篇写作 · ${data.speaking.length} 条口语`;
    box.append(h("div", { class: "import-card" },
      h("p", { class: "import-title" }, `文件「${fileName}」包含：${summary}`),
      h("div", { class: "btn-row" },
        h("button", { class: "btn btn-primary", onclick: () => {
          store.importMerge(data);
          box.innerHTML = "";
          toast("已合并导入", "ok");
          app.refreshChrome();
        } }, "合并导入"),
        h("button", { class: "btn btn-danger", onclick: () => {
          store.importReplace(data);
          box.innerHTML = "";
          toast("已覆盖导入", "ok");
          app.refreshChrome();
        } }, "覆盖当前数据"),
        h("button", { class: "btn btn-ghost", onclick: () => { box.innerHTML = ""; } }, "取消")
      ),
      h("p", { class: "import-hint" }, "合并：保留现有数据并去重追加；覆盖：用文件内容完全替换当前数据（先导出备份更稳妥）。")
    ));
  }

  function resetBox() {
    const box = document.getElementById("reset-box");
    confirmInline(box, "确定要清空当前浏览器里的全部学习进度吗？此操作无法撤销。", () => {
      store.resetAll();
      box.innerHTML = "";
      toast("所有数据已清空", "warn");
      app.refreshChrome();
    }, "确认清空");
  }
}

function field(labelText, input) {
  return h("div", { class: "field" }, h("label", null, labelText), input);
}
