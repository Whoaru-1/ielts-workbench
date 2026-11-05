/* ============================================================
 * agent-core.js — 站内 AI Agent 的配置、模型客户端与工具循环
 *
 * 数据流向：
 *   设置面板 → normalizeAgentConfig → localStorage(agent-config-v1)
 *   用户输入 → runAgent({config,history})
 *     → buildSystemPrompt() + tools(TOOL_DEFINITIONS)
 *     → POST {baseUrl}/chat/completions（非流式）
 *     → 模型返回 tool_calls → executeTool → role:"tool" 回填
 *     → 最多 6 轮 → 最终中文回答 + 事件流
 *
 * 安全：apiKey 只放在 Authorization 请求头，不进入 messages、
 *       不进入返回 history、不写入任何日志。
 * ============================================================ */

import { buildSystemPrompt } from "./prompts.js";
import { TOOL_DEFINITIONS, executeTool, toolSummary } from "./tools.js";

export const DEFAULT_AGENT_CONFIG = {
  baseUrl: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
  apiKey: "",
  temperature: 0.7,
  maxToolRounds: 6,
};

export const AGENT_CONFIG_KEY = "ielts-workbench:agent-config-v1";
export const AGENT_CHAT_KEY = "ielts-workbench:agent-chat-v1";
export const MAX_CHAT_MESSAGES = 40;
export const MAX_TOOL_RESULT_CHARS = 2000;

const ERROR_401 = "API Key 无效或已过期，请在设置里重新填写";
const ERROR_429 = "请求过于频繁或余额不足，请稍后再试";
const ERROR_NETWORK = "无法连接模型服务（检查 Base URL 与网络）";
const ERROR_TOOL_ROUNDS = "工具调用轮次过多，已停止";
const ERROR_NO_KEY = "请先在设置里填写 API Key";

function storageOrNull() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * 归一化 Agent 配置：去空格、补默认值、校验 http(s)，并限制取值范围。
 * 非法 Base URL 会回退到默认地址，不抛错。
 * @param {object} [raw]
 * @returns {{baseUrl:string,model:string,apiKey:string,temperature:number,maxToolRounds:number}}
 */
export function normalizeAgentConfig(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  let baseUrl = String(source.baseUrl ?? DEFAULT_AGENT_CONFIG.baseUrl).trim().replace(/\/+$/g, "");
  if (!/^https?:\/\/[^\s]+$/i.test(baseUrl)) baseUrl = DEFAULT_AGENT_CONFIG.baseUrl;
  const model = String(source.model ?? DEFAULT_AGENT_CONFIG.model).trim() || DEFAULT_AGENT_CONFIG.model;
  const apiKey = String(source.apiKey ?? "").trim();
  const temperatureValue = Number(source.temperature);
  const temperature = Number.isFinite(temperatureValue)
    ? round2(clamp(temperatureValue, 0, 1.5))
    : DEFAULT_AGENT_CONFIG.temperature;
  const roundsValue = Math.trunc(Number(source.maxToolRounds));
  const maxToolRounds = Number.isFinite(roundsValue)
    ? clamp(roundsValue, 1, 6)
    : DEFAULT_AGENT_CONFIG.maxToolRounds;
  return { baseUrl, model, apiKey, temperature, maxToolRounds };
}

/** 读取本地配置；没有配置时返回默认值。 */
export function loadAgentConfig() {
  const storage = storageOrNull();
  if (!storage) return normalizeAgentConfig(DEFAULT_AGENT_CONFIG);
  try {
    const raw = storage.getItem(AGENT_CONFIG_KEY);
    return normalizeAgentConfig(raw ? JSON.parse(raw) : DEFAULT_AGENT_CONFIG);
  } catch {
    return normalizeAgentConfig(DEFAULT_AGENT_CONFIG);
  }
}

/** 保存配置（包含 apiKey，仅存当前浏览器 localStorage）。 */
export function saveAgentConfig(config) {
  const normalized = normalizeAgentConfig(config);
  const storage = storageOrNull();
  if (storage) {
    try {
      storage.setItem(AGENT_CONFIG_KEY, JSON.stringify(normalized));
    } catch {
      /* localStorage 不可用时静默失败，不影响调用方 */
    }
  }
  return normalized;
}

/** 清除 Key，保留 Base URL / 模型 / 温度等本机设置。 */
export function clearAgentConfig() {
  const current = loadAgentConfig();
  const cleared = normalizeAgentConfig({ ...current, apiKey: "" });
  const storage = storageOrNull();
  if (storage) {
    try {
      storage.setItem(AGENT_CONFIG_KEY, JSON.stringify(cleared));
    } catch {
      /* ignore */
    }
  }
  return cleared;
}

/** 语义化别名：UI 的「清除 Key」按钮可直接调用。 */
export const clearAgentKey = clearAgentConfig;

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (message) =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string"
    )
    .map((message) => ({ role: message.role, content: message.content }));
}

/** 读取最近 40 条对话（只保留 user / assistant）。 */
export function loadChatHistory() {
  const storage = storageOrNull();
  if (!storage) return [];
  try {
    const raw = storage.getItem(AGENT_CHAT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return normalizeHistory(parsed).slice(-MAX_CHAT_MESSAGES);
  } catch {
    return [];
  }
}

/** 保存最近 40 条对话；不保存 system / tool 消息。 */
export function saveChatHistory(history) {
  const normalized = normalizeHistory(history).slice(-MAX_CHAT_MESSAGES);
  const storage = storageOrNull();
  if (storage) {
    try {
      storage.setItem(AGENT_CHAT_KEY, JSON.stringify(normalized));
    } catch {
      /* ignore */
    }
  }
  return normalized;
}

function abortError() {
  if (typeof DOMException !== "undefined") return new DOMException("Aborted", "AbortError");
  const error = new Error("已停止");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) throw abortError();
}

function emit(onEvent, event) {
  if (typeof onEvent !== "function") return;
  try {
    onEvent(event);
  } catch {
    /* UI 事件回调异常不影响 Agent 运行 */
  }
}

function redactSecret(text, secret) {
  const value = String(text ?? "");
  if (!secret) return value;
  return value.split(secret).join("[已隐藏]");
}

function mapHttpError(status) {
  if (status === 401) return new Error(ERROR_401);
  if (status === 429) return new Error(ERROR_429);
  return new Error(`模型服务返回错误（HTTP ${status}）`);
}

async function parseResponseJson(response) {
  try {
    return await response.json();
  } catch {
    throw new Error("模型返回内容无法解析，请稍后重试");
  }
}

async function postChatCompletion(config, messages, signal) {
  const url = `${config.baseUrl}/chat/completions`;
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: "auto",
        temperature: config.temperature,
        stream: false,
      }),
      signal,
    });
  } catch (error) {
    if (error && error.name === "AbortError") throw error;
    throw new Error(ERROR_NETWORK);
  }
  if (!response || !response.ok) {
    throw mapHttpError(response ? response.status : 0);
  }
  return parseResponseJson(response);
}

function addUsage(total, usage) {
  if (!usage || typeof usage !== "object") return total;
  const prompt = Number(usage.prompt_tokens) || 0;
  const completion = Number(usage.completion_tokens) || 0;
  const sum = Number(usage.total_tokens) || prompt + completion;
  return {
    prompt_tokens: (total ? total.prompt_tokens : 0) + prompt,
    completion_tokens: (total ? total.completion_tokens : 0) + completion,
    total_tokens: (total ? total.total_tokens : 0) + sum,
  };
}

function compactToolContent(result, summary) {
  let json;
  try {
    json = JSON.stringify(result);
  } catch {
    json = JSON.stringify({ ok: false, error: "工具结果无法序列化", summary });
  }
  if (json.length <= MAX_TOOL_RESULT_CHARS) return json;
  return JSON.stringify({
    ok: Boolean(result && result.ok),
    summary,
    truncated: true,
    error: result && result.error ? String(result.error).slice(0, 300) : undefined,
  });
}

/**
 * 跑一轮 Agent（可能包含多轮工具调用）。
 * @param {object} opts
 * @param {object} opts.config 已经 normalize 的配置
 * @param {Array<{role:'user'|'assistant',content:string}>} opts.history
 * @param {(event:object)=>void} [opts.onEvent]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{content:string,history:Array,usage:object|null,steps:number,toolCalls:Array}>}
 */
export async function runAgent({ config, history, onEvent, signal } = {}) {
  const normalizedConfig = normalizeAgentConfig(config);
  if (!normalizedConfig.apiKey) throw new Error(ERROR_NO_KEY);
  throwIfAborted(signal);

  const secret = normalizedConfig.apiKey;
  const inputHistory = normalizeHistory(history).map((message) => ({
    role: message.role,
    content: redactSecret(message.content, secret),
  }));
  const messages = [{ role: "system", content: buildSystemPrompt() }, ...inputHistory];
  const toolCalls = [];
  let steps = 0;
  let usage = null;

  for (let round = 0; round <= normalizedConfig.maxToolRounds; round += 1) {
    throwIfAborted(signal);
    emit(onEvent, { type: "status", text: round === 0 ? "正在思考…" : "正在整理工具结果…" });
    const data = await postChatCompletion(normalizedConfig, messages, signal);
    const hasUsage = Boolean(data && data.usage);
    if (hasUsage) usage = addUsage(usage, data.usage);
    const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
    const message = (choice && choice.message) || {};
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

    if (calls.length === 0) {
      if (hasUsage) emit(onEvent, { type: "usage", usage });
      const content = redactSecret(String(message.content ?? "").trim(), secret);
      return {
        content,
        history: [...inputHistory, { role: "assistant", content }],
        usage,
        steps,
        toolCalls,
      };
    }

    if (round >= normalizedConfig.maxToolRounds) throw new Error(ERROR_TOOL_ROUNDS);

    messages.push({
      role: "assistant",
      content: message.content ?? null,
      tool_calls: calls,
    });

    for (const call of calls) {
      const name = (call && call.function && call.function.name) || "";
      let args = {};
      try {
        const rawArgs = call && call.function ? call.function.arguments : "{}";
        args = typeof rawArgs === "string" && rawArgs.trim() ? JSON.parse(rawArgs) : {};
        if (!args || typeof args !== "object" || Array.isArray(args)) args = {};
      } catch {
        args = {};
      }
      emit(onEvent, { type: "tool-start", name, args });
      const result = await executeTool(name, args);
      const summary = toolSummary(name, result);
      emit(onEvent, { type: "tool-end", name, ok: Boolean(result && result.ok), summary });
      toolCalls.push({ name, args, ok: Boolean(result && result.ok), summary });
      const content = redactSecret(compactToolContent(result, summary), secret);
      messages.push({
        role: "tool",
        tool_call_id: (call && call.id) || `call_${stepSafeId(toolCalls.length)}`,
        content,
      });
    }
    if (hasUsage) emit(onEvent, { type: "usage", usage });
    steps += 1;
  }

  throw new Error(ERROR_TOOL_ROUNDS);
}

function stepSafeId(index) {
  return `${Date.now().toString(36)}_${index}`;
}

/**
 * 测试连接：GET {baseUrl}/models。
 * @param {object} config
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ok:true,models:string[]}>}
 */
export async function testAgentConnection(config, signal) {
  const normalizedConfig = normalizeAgentConfig(config);
  if (!normalizedConfig.apiKey) throw new Error(ERROR_NO_KEY);
  throwIfAborted(signal);
  let response;
  try {
    response = await fetch(`${normalizedConfig.baseUrl}/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${normalizedConfig.apiKey}` },
      signal,
    });
  } catch (error) {
    if (error && error.name === "AbortError") throw error;
    throw new Error(ERROR_NETWORK);
  }
  if (!response || !response.ok) throw mapHttpError(response ? response.status : 0);
  const data = await parseResponseJson(response);
  const models = Array.isArray(data && data.data)
    ? data.data.map((model) => model && model.id).filter(Boolean)
    : [];
  return { ok: true, models };
}
