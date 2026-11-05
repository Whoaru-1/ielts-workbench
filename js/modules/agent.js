/* ============================================================
 * agent.js — 站内 AI 助手：对话 / 工具轨迹 / 模型设置
 * 依赖：js/agent/agent-core.js（runAgent、配置与对话持久化、测试连接）
 *       js/agent/tools.js（toolLabel）
 * 只负责 UI；模型请求、工具调用与错误映射都在 agent-core。
 * ============================================================ */
import { h, panel, badge, icon, esc, toast, emptyState } from "../ui.js";
import {
  runAgent,
  normalizeAgentConfig,
  DEFAULT_AGENT_CONFIG,
  loadAgentConfig,
  saveAgentConfig,
  clearAgentConfig,
  loadChatHistory,
  saveChatHistory,
  testAgentConnection,
  MAX_CHAT_MESSAGES,
} from "../agent/agent-core.js";
import { toolLabel } from "../agent/tools.js";

const WRITE_TOOLS = new Set(["add_vocab", "create_material", "add_task", "log_practice"]);
const INPUT_MAX_HEIGHT = 132;
const TEST_TIMEOUT_MS = 15000;

const QUICK_PROMPTS = [
  { label: "今天该练什么？", text: "今天该练什么？" },
  { label: "帮我制定本周计划", text: "帮我制定本周计划" },
  { label: "给我 3 个 Part 2 素材", text: "给我 3 个 Part 2 素材" },
  { label: "检查我的词汇进度", text: "检查我的词汇进度" },
  { label: "批改这段作文：", text: "批改这段作文：", prefill: true },
];

let sessionSeq = 0;
let currentController = null;

function uid() {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function safeLabel(name) {
  try {
    return toolLabel(name) || String(name || "工具");
  } catch (err) {
    return String(name || "工具");
  }
}

function argsSummary(args) {
  if (!args || typeof args !== "object") return "";
  try {
    const text = JSON.stringify(args);
    if (!text || text === "{}") return "";
    return text.length > 96 ? `${text.slice(0, 96)}…` : text;
  } catch (err) {
    return "";
  }
}

function shortNumber(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US");
}

function usageTitle(usage) {
  if (!usage) return "";
  const prompt = Number(usage.prompt_tokens) || 0;
  const completion = Number(usage.completion_tokens) || 0;
  const total = Number(usage.total_tokens) || prompt + completion;
  return `提示 ${shortNumber(prompt)} · 生成 ${shortNumber(completion)} · 合计 ${shortNumber(total)} tokens`;
}

function usageLabel(usage) {
  if (!usage) return "";
  const prompt = Number(usage.prompt_tokens) || 0;
  const completion = Number(usage.completion_tokens) || 0;
  const total = Number(usage.total_tokens) || prompt + completion;
  return `${shortNumber(total)} tokens`;
}

/* ---------- 轻量 Markdown（先 esc，再加粗/代码/列表/换行） ---------- */

function inlineMarkdown(escaped) {
  const codes = [];
  let text = escaped.replace(/`([^`]+)`/g, (match, code) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\u0000(\d+)\u0000/g, (match, index) => codes[Number(index)] || "");
  return text;
}

function markdownHtml(raw) {
  const source = String(raw ?? "").replace(/\r\n?/g, "\n");
  const safe = esc(source);
  const lines = safe.split("\n");
  const out = [];
  let paragraphOpen = false;
  let paragraphHasContent = false;
  let listType = "";
  let inCode = false;
  let codeLines = [];

  const closeParagraph = () => {
    if (paragraphOpen) {
      out.push("</p>");
      paragraphOpen = false;
      paragraphHasContent = false;
    }
  };
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = "";
    }
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (inCode) {
        out.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        closeParagraph();
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (!line.trim()) {
      closeParagraph();
      closeList();
      continue;
    }

    const unordered = line.match(/^\s*[-*]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (unordered || ordered) {
      closeParagraph();
      const type = unordered ? "ul" : "ol";
      if (listType !== type) {
        closeList();
        out.push(`<${type}>`);
        listType = type;
      }
      out.push(`<li>${inlineMarkdown((unordered || ordered)[1])}</li>`);
      continue;
    }

    closeList();
    if (!paragraphOpen) {
      out.push("<p>");
      paragraphOpen = true;
      paragraphHasContent = false;
    } else if (paragraphHasContent) {
      out.push("<br>");
    }
    out.push(inlineMarkdown(line));
    paragraphHasContent = true;
  }

  if (inCode) out.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
  closeParagraph();
  closeList();
  return out.join("");
}

function markdownNode(text) {
  return h("div", { class: "agent-md", html: markdownHtml(text) });
}

/* ============================================================
 * 页面
 * ============================================================ */

export function render(root, app) {
  root.innerHTML = "";
  const seq = ++sessionSeq;

  if (currentController) {
    try { currentController.abort(); } catch (err) { /* ignore */ }
    currentController = null;
  }

  let config = loadAgentConfig();
  let messages = loadMessages();
  let running = false;
  let controller = null;
  let runState = null;
  let testing = false;
  let settingsOpen = false;

  const page = h("div", { class: "page agent-page", id: "agent-page" });
  root.append(page);

  /* ---------- 页头 ---------- */

  const modelBadge = badge(config.model || DEFAULT_AGENT_CONFIG.model, "acc");
  const settingsBtn = h("button", {
    class: "btn btn-ghost btn-sm", type: "button",
    "aria-label": "打开模型设置", "aria-expanded": "false", "aria-controls": "agent-settings",
    onclick: () => toggleSettings(),
  }, icon("settings"), "设置");

  const noKey = h("section", { class: "agent-nokey", "aria-live": "polite" },
    icon("agent"),
    h("div", { class: "agent-nokey-text" },
      h("strong", null, "还没有连接模型。"),
      " 填写 DeepSeek API Key 后就能开始；Key 只存在本浏览器，不会进入导出 JSON。"
    ),
    h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => openSettings(true) }, "填写 Key"),
    h("a", {
      class: "agent-key-link", href: "https://platform.deepseek.com/api_keys",
      target: "_blank", rel: "noopener noreferrer",
    }, "获取 Key")
  );

  page.append(
    h("div", { class: "page-head agent-head" },
      h("h1", { class: "page-title" }, "AI 助手",
        h("span", { class: "t-sub" }, "会读写你的工作台数据：查进度、搜题库、加单词、建素材、排任务、记练习。")
      ),
      h("div", { class: "page-actions agent-head-actions" },
        h("span", { class: "agent-model" }, h("span", { class: "agent-model-label" }, "模型"), modelBadge),
        settingsBtn
      )
    ),
    noKey
  );

  /* ---------- 聊天区 ---------- */

  const messagesEl = h("div", {
    class: "agent-chat-body", role: "log", "aria-live": "polite", "aria-label": "对话消息",
  });

  const clearBtn = h("button", {
    class: "btn btn-ghost btn-sm", type: "button", "aria-label": "清空对话",
    onclick: () => showClearConfirm(true),
  }, icon("trash"), "清空对话");

  const clearConfirm = h("div", { class: "agent-clear-bar", hidden: true, role: "alert" },
    h("span", { class: "agent-clear-text" }, "清空后本浏览器里的对话会被删除，无法恢复。"),
    h("button", {
      class: "btn btn-danger btn-sm", type: "button",
      onclick: () => clearChat(),
    }, "确认清空"),
    h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => showClearConfirm(false) }, "取消")
  );

  const chatHead = h("div", { class: "agent-chat-head" },
    h("div", { class: "agent-chat-title" },
      h("strong", null, "对话"),
      h("span", { class: "agent-chat-sub" }, `本地保存 · 最近 ${MAX_CHAT_MESSAGES} 条`)
    ),
    h("div", { class: "agent-chat-actions" }, clearBtn)
  );

  const runText = h("span", { class: "agent-run-text" }, "正在思考…");
  const stopBtn = h("button", {
    class: "btn btn-danger btn-sm", type: "button", "aria-label": "停止本轮回复",
    onclick: () => stopRun(),
  }, icon("close"), "停止");
  const runbar = h("div", { class: "agent-runbar", hidden: true, role: "status", "aria-live": "polite" },
    h("span", { class: "agent-run-dot", "aria-hidden": "true" }),
    runText,
    stopBtn
  );

  const input = h("textarea", {
    class: "textarea agent-input", rows: 1, "aria-label": "输入给 AI 助手的问题",
    placeholder: "问点什么，或让我直接改数据…",
    oninput: () => { autoResize(); updateSendState(); },
    onkeydown: (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      sendInput();
    },
  });

  const sendBtn = h("button", {
    class: "btn btn-primary agent-send", type: "button", "aria-label": "发送消息",
    onclick: () => sendInput(),
  }, icon("arrowUp"));

  const composer = h("div", { class: "agent-composer" },
    h("div", { class: "agent-input-row" }, input, sendBtn),
    h("div", { class: "agent-composer-hint" },
      h("span", null, "Enter 发送 · Shift + Enter 换行"),
      h("span", null, "写操作会同步更新左侧计数")
    )
  );

  const chatPanel = h("section", { class: "agent-chat", "aria-label": "AI 对话" },
    chatHead, clearConfirm, messagesEl, runbar, composer
  );

  /* ---------- 设置面板 ---------- */

  const baseInput = h("input", {
    class: "input", type: "text", value: config.baseUrl,
    placeholder: DEFAULT_AGENT_CONFIG.baseUrl, "aria-label": "Base URL", spellcheck: false,
  });
  const modelInput = h("input", {
    class: "input", type: "text", value: config.model,
    placeholder: DEFAULT_AGENT_CONFIG.model, "aria-label": "模型名称", spellcheck: false,
  });
  const keyInput = h("input", {
    class: "input", type: "password", value: config.apiKey,
    placeholder: "sk-…", "aria-label": "API Key", autocomplete: "off", spellcheck: false,
  });
  const tempRange = h("input", {
    class: "agent-range", type: "range", min: "0", max: "1.5", step: "0.1",
    value: String(config.temperature), "aria-label": "温度",
  });
  const tempValue = h("span", { class: "agent-temp-val" }, Number(config.temperature).toFixed(1));
  tempRange.addEventListener("input", () => { tempValue.textContent = Number(tempRange.value).toFixed(1); });

  const settingsStatus = h("div", { class: "agent-settings-status", role: "status", "aria-live": "polite" });
  const testBtn = h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => testConnection() }, "测试连接");
  const saveBtn = h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => saveSettings() }, "保存");
  const clearKeyBtn = h("button", { class: "btn btn-danger btn-sm", type: "button", onclick: () => showClearKeyConfirm(true) }, icon("trash"), "清除 Key");

  const clearKeyConfirm = h("div", { class: "agent-clear-key", hidden: true, role: "alert" },
    h("span", null, "确定清除本浏览器里的 API Key 吗？Base URL / 模型 / 温度会保留。"),
    h("div", { class: "btn-row" },
      h("button", { class: "btn btn-danger btn-sm", type: "button", onclick: () => clearKey() }, "确认清除"),
      h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => showClearKeyConfirm(false) }, "取消")
    )
  );

  const settingsPanel = panel({
    className: "agent-settings",
    title: "模型设置",
    actions: h("button", {
      class: "icon-btn agent-settings-close", type: "button", "aria-label": "关闭设置",
      onclick: () => closeSettings(),
    }, icon("close")),
    body: h("div", { class: "agent-settings-form" },
      h("div", { class: "field" },
        h("label", { for: "agent-base-url" }, "Base URL"),
        baseInput,
        h("span", { class: "hint" }, "任意 OpenAI 兼容端点；本地 Ollama 可填 http://localhost:11434/v1")
      ),
      h("div", { class: "field" },
        h("label", { for: "agent-model" }, "模型"),
        modelInput,
        h("span", { class: "hint" }, "如 deepseek-chat / deepseek-reasoner")
      ),
      h("div", { class: "field" },
        h("label", { for: "agent-api-key" }, "API Key"),
        keyInput,
        h("span", { class: "hint" }, "只保存在当前浏览器；不进入导出 JSON，也不会发送到本项目服务器。")
      ),
      h("div", { class: "field" },
        h("label", null, "温度"),
        h("div", { class: "agent-temp-row" }, tempRange, tempValue),
        h("span", { class: "hint" }, "0 更稳定，1.5 更发散；默认 0.7")
      ),
      h("div", { class: "agent-settings-actions" }, saveBtn, testBtn, clearKeyBtn),
      clearKeyConfirm,
      settingsStatus,
      h("p", { class: "agent-settings-note" },
        "隐私：API Key 只存在本浏览器的 localStorage，不会写进活动日志、对话或导出 JSON；请求只发往你填写的 Base URL。"
      ),
      h("p", { class: "agent-settings-note" },
        "还没有 Key？去 ",
        h("a", {
          class: "agent-key-link", href: "https://platform.deepseek.com/api_keys",
          target: "_blank", rel: "noopener noreferrer",
        }, "platform.deepseek.com/api_keys"),
        " 获取（需自行注册 DeepSeek 账号）。"
      )
    ),
  });
  settingsPanel.id = "agent-settings";

  baseInput.id = "agent-base-url";
  modelInput.id = "agent-model";
  keyInput.id = "agent-api-key";

  const backdrop = h("div", {
    class: "agent-settings-backdrop", "aria-hidden": "true",
    onclick: () => closeSettings(),
  });

  const layout = h("div", { class: "agent-layout" }, chatPanel, settingsPanel, backdrop);
  page.append(layout);

  page.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && settingsOpen) closeSettings();
  });

  /* ---------- 初始化渲染 ---------- */

  renderMessages(true);
  refreshKeyUi();
  updateRunning();
  updateSendState();
  updateClearButton();
  requestAnimationFrame(() => {
    autoResize();
    if (config.apiKey) input.focus({ preventScroll: true });
  });

  /* ============================================================
   * 对话状态与持久化
   * ============================================================ */

  function loadMessages() {
    try {
      return loadChatHistory().map((message, index) => ({
        id: `h_${index}_${message.role}`,
        role: message.role,
        content: String(message.content || ""),
        tools: [],
        usage: null,
        steps: 0,
        pending: false,
      }));
    } catch (err) {
      console.warn("[agent] 对话读取失败", err);
      return [];
    }
  }

  function persistMessages() {
    try {
      saveChatHistory(messages);
    } catch (err) {
      console.warn("[agent] 对话保存失败", err);
    }
  }

  function updateClearButton() {
    clearBtn.disabled = running || messages.length === 0;
  }

  /* ============================================================
   * 发送 / 运行
   * ============================================================ */

  function sendInput() {
    if (running) return;
    const text = input.value.trim();
    if (!text) { input.focus(); return; }
    if (!config.apiKey) {
      toast("请先在设置里填写 API Key", "warn");
      openSettings(true);
      return;
    }
    messages.push({
      id: uid(), role: "user", content: text,
      tools: [], usage: null, steps: 0, pending: false,
    });
    input.value = "";
    autoResize();
    updateSendState();
    persistMessages();
    renderMessages(true);
    startRun();
  }

  function startRun() {
    if (running) return;
    const history = messages
      .filter((message) => message.role === "user" || (message.role === "assistant" && !message.pending && message.content.trim()))
      .map((message) => ({ role: message.role, content: message.content }));
    if (!history.some((message) => message.role === "user")) return;

    const assistant = {
      id: uid(), role: "assistant", content: "",
      tools: [], usage: null, steps: 0, pending: true,
    };
    messages.push(assistant);
    runState = { status: "正在思考…", tools: assistant.tools, usage: null };
    running = true;
    controller = new AbortController();
    currentController = controller;

    updateRunning();
    updateClearButton();
    renderMessages(true);

    const mySeq = seq;
    runAgent({
      config,
      history,
      signal: controller.signal,
      onEvent: (event) => {
        if (mySeq !== sessionSeq) return;
        handleEvent(event, assistant);
      },
    })
      .then((result) => {
        if (mySeq !== sessionSeq) return;
        const content = String((result && result.content) || "").trim();
        assistant.pending = false;
        assistant.content = content || "（模型没有返回内容）";
        assistant.tools = Array.isArray(result && result.toolCalls) && result.toolCalls.length
          ? result.toolCalls
          : assistant.tools.slice();
        assistant.usage = (result && result.usage) || assistant.usage || (runState && runState.usage) || null;
        assistant.steps = Number(result && result.steps) || 0;
        running = false;
        controller = null;
        currentController = null;
        if (assistant.tools.some((tool) => tool && tool.ok && WRITE_TOOLS.has(tool.name))) {
          app?.refreshChrome?.();
        }
        persistMessages();
        updateRunning();
        updateClearButton();
        renderMessages(true);
        requestAnimationFrame(() => input.focus({ preventScroll: true }));
      })
      .catch((error) => {
        if (mySeq !== sessionSeq) return;
        const aborted = Boolean(error && error.name === "AbortError");
        messages = messages.filter((message) => message.id !== assistant.id);
        if (aborted) {
          messages.push({
            id: uid(), role: "system", kind: "info",
            content: "已停止生成，可以继续输入。", tools: [], usage: null, steps: 0, pending: false,
          });
          toast("已停止", "warn");
        } else {
          const text = safeErrorMessage(error);
          messages.push({
            id: uid(), role: "system", kind: "error",
            content: text, tools: [], usage: null, steps: 0, pending: false,
          });
          toast("本轮请求失败，详见对话中的系统提示", "bad");
        }
        running = false;
        controller = null;
        currentController = null;
        persistMessages();
        updateRunning();
        updateClearButton();
        renderMessages(true);
        requestAnimationFrame(() => input.focus({ preventScroll: true }));
      })
      .finally(() => {
        if (mySeq !== sessionSeq) return;
        if (running) {
          running = false;
          controller = null;
          currentController = null;
          updateRunning();
          updateClearButton();
        }
      });
  }

  function handleEvent(event, assistant) {
    if (!event || typeof event !== "object") return;
    if (event.type === "status") {
      runState.status = String(event.text || "正在思考…");
      assistant.status = runState.status;
      runText.textContent = runState.status;
      return;
    }
    if (event.type === "tool-start") {
      const name = String(event.name || "工具");
      const label = safeLabel(name);
      assistant.tools.push({ name, label, args: event.args || {}, summary: "", ok: null, pending: true });
      runState.status = `正在调用 ${label}…`;
      runText.textContent = runState.status;
      renderMessages();
      return;
    }
    if (event.type === "tool-end") {
      const name = String(event.name || "工具");
      let tool = null;
      for (let i = assistant.tools.length - 1; i >= 0; i -= 1) {
        if (assistant.tools[i].name === name && assistant.tools[i].pending) { tool = assistant.tools[i]; break; }
      }
      if (!tool) {
        tool = { name, label: safeLabel(name), args: {}, summary: "", ok: null, pending: true };
        assistant.tools.push(tool);
      }
      tool.pending = false;
      tool.ok = Boolean(event.ok);
      tool.summary = String(event.summary || (event.ok ? "完成" : "执行失败"));
      runState.status = event.ok ? "正在整理工具结果…" : "工具执行失败，正在整理…";
      runText.textContent = runState.status;
      if (event.ok && WRITE_TOOLS.has(name)) app?.refreshChrome?.();
      renderMessages();
      return;
    }
    if (event.type === "usage" && event.usage) {
      assistant.usage = event.usage;
      runState.usage = event.usage;
      renderMessages();
    }
  }

  function stopRun() {
    if (!running || !controller) return;
    runState.status = "正在停止…";
    runText.textContent = runState.status;
    stopBtn.disabled = true;
    try { controller.abort(); } catch (err) { /* ignore */ }
  }

  function safeErrorMessage(error) {
    let text = String((error && error.message) || "请求失败，请稍后重试");
    const key = config.apiKey;
    if (key) text = text.split(key).join("[已隐藏]");
    return text;
  }

  /* ============================================================
   * 消息渲染
   * ============================================================ */

  function renderMessages(stickToBottom) {
    const nearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120;
    const shouldStick = stickToBottom === true || (stickToBottom !== false && nearBottom);
    messagesEl.replaceChildren();

    if (!messages.length) {
      messagesEl.append(emptyNode());
    } else {
      messages.forEach((message) => messagesEl.append(messageNode(message)));
    }

    if (shouldStick) {
      requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
    }
  }

  function emptyNode() {
    const node = emptyState(
      "agent",
      "跟工作台说句话，让助手直接动手",
      config.apiKey
        ? "可以查进度、搜题库、加单词、建素材、排任务、记练习。试试下面的快捷提示。"
        : "先在设置里填写 API Key；也可以点下面的提示，看看助手能做什么。"
    );
    node.classList.add("agent-empty");
    node.append(
      h("div", { class: "agent-prompts" },
        QUICK_PROMPTS.map((prompt) => h("button", {
          class: "agent-prompt", type: "button", onclick: () => quickPrompt(prompt),
        }, prompt.label))
      ),
      h("p", { class: "agent-empty-note" }, "回答可能有误；涉及数据写入时会调用工具并显示调用轨迹。")
    );
    return node;
  }

  function quickPrompt(prompt) {
    input.value = prompt.text;
    autoResize();
    updateSendState();
    if (prompt.prefill) {
      input.focus({ preventScroll: true });
      toast("把作文贴在冒号后面，再按 Enter 发送", "warn");
      return;
    }
    sendInput();
  }

  function messageNode(message) {
    if (message.role === "system") return systemNode(message);
    const isUser = message.role === "user";
    const bubble = h("div", { class: "agent-bubble" },
      message.pending
        ? h("span", { class: "agent-typing", "aria-label": "正在思考" },
          h("span", null), h("span", null), h("span", null))
        : markdownNode(message.content || "（没有内容）")
    );

    const wrap = h("div", { class: "agent-bubble-wrap" }, bubble);
    if (!isUser) {
      if (message.tools && message.tools.length) wrap.append(toolTrace(message));
      if (message.usage && !message.pending) {
        wrap.append(h("div", {
          class: "agent-usage", title: usageTitle(message.usage),
        }, usageLabel(message.usage)));
      }
    }

    return h("div", { class: `agent-msg agent-msg-${isUser ? "user" : "assistant"}` },
      !isUser ? h("span", { class: "agent-avatar", "aria-hidden": "true" }, icon("agent")) : null,
      wrap
    );
  }

  function toolTrace(message) {
    const tools = message.tools || [];
    return h("details", { class: "agent-tools", open: Boolean(message.pending && tools.length) },
      h("summary", null, `调用了 ${tools.length} 个工具`),
      h("div", { class: "agent-tool-list" },
        tools.map((tool) => h("div", { class: "agent-tool" },
          h("span", { class: "agent-tool-name" }, tool.label || safeLabel(tool.name)),
          argsSummary(tool.args)
            ? h("span", { class: "agent-tool-args" }, argsSummary(tool.args))
            : null,
          h("span", {
            class: `agent-tool-result${tool.pending ? " agent-pending" : tool.ok === false ? " agent-bad" : " agent-ok"}`,
          }, tool.pending ? "执行中…" : (tool.summary || (tool.ok ? "完成" : "执行失败")))
        ))
      )
    );
  }

  function systemNode(message) {
    const isError = message.kind === "error";
    return h("div", {
      class: `agent-msg agent-msg-system ${isError ? "agent-error" : "agent-info"}`,
      role: isError ? "alert" : "status",
    },
      icon(isError ? "close" : "clock"),
      h("div", { class: "agent-system-body" },
        h("div", { class: "agent-system-text" }, message.content),
        isError
          ? h("div", { class: "agent-system-actions" },
            h("button", {
              class: "btn btn-sm", type: "button",
              onclick: () => retryMessage(message.id),
            }, "重试")
          )
          : null
      )
    );
  }

  function retryMessage(messageId) {
    if (running) return;
    const index = messages.findIndex((message) => message.id === messageId);
    if (index < 0) return;
    messages.splice(index, 1);
    if (!messages.some((message) => message.role === "user")) {
      persistMessages();
      renderMessages();
      return;
    }
    if (!config.apiKey) {
      toast("请先在设置里填写 API Key", "warn");
      openSettings(true);
      return;
    }
    persistMessages();
    renderMessages();
    startRun();
  }

  /* ============================================================
   * 运行状态 / 输入
   * ============================================================ */

  function updateRunning() {
    runbar.hidden = !running;
    if (running) {
      runText.textContent = (runState && runState.status) || "正在思考…";
      stopBtn.disabled = false;
    } else {
      stopBtn.disabled = true;
    }
    input.disabled = running;
    updateSendState();
    updateClearButton();
  }

  function updateSendState() {
    sendBtn.disabled = running || !input.value.trim();
  }

  function autoResize() {
    input.style.height = "auto";
    if (!input.value) {
      input.style.height = "44px";
      input.style.overflowY = "hidden";
      return;
    }
    input.style.height = `${Math.min(input.scrollHeight || 44, INPUT_MAX_HEIGHT)}px`;
    input.style.overflowY = (input.scrollHeight || 0) > INPUT_MAX_HEIGHT ? "auto" : "hidden";
  }

  function showClearConfirm(open) {
    const expanded = Boolean(open);
    clearConfirm.hidden = !expanded;
    if (expanded) {
      clearBtn.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => clearConfirm.querySelector("button")?.focus());
    } else {
      clearBtn.removeAttribute("aria-expanded");
    }
  }

  function clearChat() {
    if (running) return;
    messages = [];
    showClearConfirm(false);
    persistMessages();
    renderMessages(true);
    updateClearButton();
    toast("对话已清空", "ok");
    input.focus({ preventScroll: true });
  }

  /* ============================================================
   * 设置
   * ============================================================ */

  function readFormConfig() {
    return normalizeAgentConfig({
      baseUrl: baseInput.value,
      model: modelInput.value,
      apiKey: keyInput.value,
      temperature: tempRange.value,
      maxToolRounds: config.maxToolRounds,
    });
  }

  function writeFormConfig(next) {
    baseInput.value = next.baseUrl;
    modelInput.value = next.model;
    keyInput.value = next.apiKey;
    tempRange.value = String(next.temperature);
    tempValue.textContent = Number(next.temperature).toFixed(1);
  }

  function setStatus(text, kind = "") {
    settingsStatus.textContent = text;
    settingsStatus.className = `agent-settings-status${kind ? ` agent-${kind}` : ""}`;
  }

  function refreshKeyUi() {
    noKey.hidden = Boolean(config.apiKey);
    modelBadge.textContent = config.model || DEFAULT_AGENT_CONFIG.model;
    settingsBtn.title = config.apiKey ? "模型已配置" : "尚未配置 API Key";
    if (isNarrow()) settingsBtn.setAttribute("aria-expanded", String(settingsOpen));
    else settingsBtn.removeAttribute("aria-expanded");
  }

  function saveSettings() {
    const rawBase = baseInput.value.trim();
    const before = readFormConfig();
    config = saveAgentConfig({ ...before, maxToolRounds: config.maxToolRounds });
    writeFormConfig(config);
    const normalizedRaw = rawBase.replace(/\/+$/g, "");
    const baseUrlAdjusted = Boolean(rawBase) && config.baseUrl !== normalizedRaw;
    setStatus(
      baseUrlAdjusted
        ? "已保存；Base URL 格式不合法，已回退默认地址。"
        : "设置已保存。Key 只存在本浏览器。",
      baseUrlAdjusted ? "warn" : "ok"
    );
    refreshKeyUi();
    renderMessages();
    toast("设置已保存", "ok");
  }

  async function testConnection() {
    if (testing) return;
    const candidate = readFormConfig();
    if (!candidate.apiKey) {
      setStatus("请先填写 API Key，再测试连接。", "warn");
      keyInput.focus();
      toast("请先填写 API Key", "warn");
      return;
    }
    testing = true;
    testBtn.disabled = true;
    testBtn.textContent = "测试中…";
    setStatus("正在连接模型服务…", "");
    const testController = new AbortController();
    const timer = setTimeout(() => { try { testController.abort(); } catch (err) { /* ignore */ } }, TEST_TIMEOUT_MS);
    try {
      const result = await testAgentConnection(candidate, testController.signal);
      const count = Array.isArray(result && result.models) ? result.models.length : 0;
      setStatus(`连接成功 · 模型可用${count ? `（${count} 个模型）` : ""}`, "ok");
      toast("连接成功 · 模型可用", "ok");
    } catch (error) {
      const aborted = Boolean(error && error.name === "AbortError");
      setStatus(aborted ? "连接超时，请检查 Base URL 与网络。" : safeErrorMessage(error), "bad");
    } finally {
      clearTimeout(timer);
      testing = false;
      testBtn.disabled = false;
      testBtn.textContent = "测试连接";
    }
  }

  function showClearKeyConfirm(open) {
    clearKeyConfirm.hidden = !open;
  }

  function clearKey() {
    const current = readFormConfig();
    clearAgentConfig();
    config = saveAgentConfig({ ...current, apiKey: "" });
    writeFormConfig(config);
    showClearKeyConfirm(false);
    setStatus("API Key 已清除；Base URL / 模型 / 温度已保留。", "ok");
    refreshKeyUi();
    renderMessages();
    toast("API Key 已清除", "ok");
  }

  function openSettings(focusKey) {
    settingsOpen = true;
    page.classList.add("agent-settings-open");
    settingsBtn.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => {
      if (focusKey) keyInput.focus({ preventScroll: false });
      else baseInput.focus({ preventScroll: false });
    });
  }

  function closeSettings() {
    settingsOpen = false;
    page.classList.remove("agent-settings-open");
    settingsBtn.setAttribute("aria-expanded", "false");
    showClearKeyConfirm(false);
    settingsBtn.focus({ preventScroll: true });
  }

  function isNarrow() {
    return typeof window.matchMedia === "function" && window.matchMedia("(max-width: 1099px)").matches;
  }

  function toggleSettings() {
    if (isNarrow()) {
      if (settingsOpen) closeSettings();
      else openSettings(false);
    } else {
      baseInput.focus({ preventScroll: true });
    }
  }

}
