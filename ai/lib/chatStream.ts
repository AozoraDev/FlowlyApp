import { fetch as expoFetch } from 'expo/fetch';

import {
  buildChatCompletionsUrl,
  createSseLineSplitter,
  parseChunk,
  parseSseLine,
  type ChatCompletionMessage,
  type ChatTool,
  type StreamToolCallDelta,
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
};

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
}: StreamChatParams): Promise<void> {
  const body: Record<string, unknown> = { model: config.model, messages, stream: true };
  if (tools?.length) body.tools = tools;

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
