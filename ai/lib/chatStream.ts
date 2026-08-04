import { fetch as expoFetch } from 'expo/fetch';

import {
  buildChatCompletionsUrl,
  createSseLineSplitter,
  parseChunk,
  parseSseLine,
  type ChatCompletionMessage,
  type ChatTool,
  type StreamToolCallDelta,
  type TokenUsage,
} from './chat';
import type { ModelConfig } from './modelConfig';

export type StreamChatParams = {
  config: ModelConfig;
  messages: ChatCompletionMessage[];
  // 组件卸载时中止请求（expo/fetch 的 signal 兼容标准 AbortSignal）
  signal?: AbortSignal;
  // 每吐出一段增量文本回调一次，供 UI 边读边拼
  onDelta: (text: string) => void;
  // 工具定义（function calling）：模型可在回复里请求调用；不传则保持纯文本对话
  tools?: ChatTool[];
  // 每帧工具调用增量回调（跨帧碎片需调用方自行按 index 累积）
  onToolCalls?: (deltas: StreamToolCallDelta[]) => void;
  // 流式末帧 token 用量回调（请求带 stream_options.include_usage，标准协议一轮至多回调一次）
  onUsage?: (usage: TokenUsage) => void;
  // 单轮输出 token 上限：请求体带 max_tokens，超限即截断；不传则不设上限
  maxTokens?: number;
};

/**
 * 构建 chat/completions 请求体：纯函数便于单测。
 * max_tokens 仅在显式传入时写入——不同 OpenAI 兼容端点对未用参数的容忍度不一，不传即不带该键。
 */
export function buildChatBody(params: {
  model: string;
  messages: ChatCompletionMessage[];
  tools?: ChatTool[];
  maxTokens?: number;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    stream: true,
    // 请求流式末帧回传 usage，用于展示本轮 token 消耗；不支持该参数的端点忽略即可
    stream_options: { include_usage: true },
  };
  if (params.tools?.length) body.tools = params.tools;
  if (params.maxTokens != null) body.max_tokens = params.maxTokens;
  return body;
}

/**
 * 流式聊天请求：POST {baseUrl}/chat/completions（stream: true），
 * 用 expo/fetch 的 Response.body 读流（RN 内置 fetch 不支持流式 body，故此处必须用 expo/fetch）。
 * SSE 按行解析 data: 载荷，逐帧提取增量文本交给 onDelta、工具调用增量交给 onToolCalls；
 * 读到 [DONE] 或流结束即完成。网络/服务端错误抛出，由调用方 mutation 统一处理。
 */
export async function streamChatCompletion({
  config,
  messages,
  signal,
  onDelta,
  tools,
  onToolCalls,
  onUsage,
  maxTokens,
}: StreamChatParams): Promise<void> {
  const body = buildChatBody({ model: config.model, messages, tools, maxTokens });

  const res = await expoFetch(buildChatCompletionsUrl(config.url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    // 读服务端错误体（限长防挂）拼进错误，便于排查「该端点不支持 tools」等问题
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 500);
    } catch {
      // 错误体读取失败忽略，仅保留状态码
    }
    throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  if (!res.body) {
    throw new Error('response body unavailable');
  }

  // 逐帧读流：decode({ stream: true }) 保证多字节字符跨 chunk 不截断，交给行切分器拼完整行
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const split = createSseLineSplitter();
  // 提前读到 [DONE] 标记提前结束，此时底层连接可能尚未关闭，需主动 cancel 避免挂着
  let earlyDone = false;
  try {
    while (!earlyDone) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of split(decoder.decode(value, { stream: true }))) {
        const data = parseSseLine(line);
        if (data == null) continue;
        // 服务端结束标记：直接结束，无需等流真正关闭
        if (data === '[DONE]') {
          earlyDone = true;
          break;
        }
        const parsed = parseChunk(data);
        if (parsed == null) continue;
        if (parsed.content) onDelta(parsed.content);
        if (parsed.toolCalls.length > 0) onToolCalls?.(parsed.toolCalls);
        // 流式末帧 usage：转发给调用方累计（标准协议一轮仅末帧携带，多帧重复由调用方决定去重策略）
        if (parsed.usage) onUsage?.(parsed.usage);
      }
    }
  } finally {
    // 正常读完（done）只释放锁；提前结束则取消剩余流并释放锁
    if (earlyDone) {
      reader.cancel().catch(() => {});
    } else {
      reader.releaseLock();
    }
  }
}
