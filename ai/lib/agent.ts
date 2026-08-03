import {
  accumulateToolCalls,
  buildChatMessages,
  finalizeToolCalls,
  type AgentPhase,
  type ChatCompletionMessage,
  type ChatMessage,
  type ToolCallAccumulator,
} from './chat';
import { streamChatCompletion } from './chatStream';
import type { ModelConfig } from './modelConfig';
import { getChatTools, runTool } from './tools';

export type RunAgentChatParams = {
  config: ModelConfig;
  systemPrompt: string;
  // 界面消息历史（user/assistant 文本）；工具中间态不持久化，重进会话由模型重新调工具自愈
  history: readonly ChatMessage[];
  // 工具查询的归属用户 id（RLS 隔离由服务端保证，这里双保险传给查询函数）
  userId: string;
  // 工具描述语言（zh/en），默认中文
  language?: string;
  signal?: AbortSignal;
  // 每轮增量文本都转发（工具轮几乎无文本，若模型先输出叙述文字留在气泡里读起来自然）；
  // 返回值为最终全文，持久化以返回值为准
  onDelta: (text: string) => void;
  // 占位气泡阶段：thinking=首帧前思考，querying=正在查询账目
  onPhase?: (phase: AgentPhase) => void;
};

// 单次回答最多允许的工具轮数，防止模型反复调用工具形成死循环
const MAX_TOOL_ROUNDS = 5;

/** 构造与原生 AbortError 同名同型的错误，让调用方统一的 AbortError 静默逻辑生效 */
function abortError(): Error {
  return Object.assign(new Error('aborted'), { name: 'AbortError' });
}

/**
 * Agent 多轮循环：每轮流式请求都可能返回增量文本和/或工具调用。
 *  - 流式期间把增量文本转发给 onDelta、工具调用碎片累积到 acc；
 *  - 一轮结束若存在完整工具调用 → 执行 runTool 并把 assistant(tool_calls) + tool 结果消息
 *    追加进 messages，继续下一轮（OpenAI 协议要求 assistant 之后紧跟每条 tool 结果）；
 *  - 一轮结束无工具调用 → 本轮文本即最终答案，返回累计文本。
 * 工具执行失败以 {ok:false,error} 串回给模型自愈；轮数超限直接抛错走全局错误处理。
 */
export async function runAgentChat(params: RunAgentChatParams): Promise<string> {
  const { config, systemPrompt, history, userId, language, signal, onDelta, onPhase } = params;
  const messages: ChatCompletionMessage[] = buildChatMessages(systemPrompt, history);
  const tools = getChatTools(language ?? 'zh');
  let finalText = '';
  onPhase?.('thinking');

  for (let round = 0; ; round++) {
    let content = '';
    const acc: Record<number, ToolCallAccumulator> = {};
    await streamChatCompletion({
      config,
      messages,
      signal,
      tools,
      onDelta: (text) => {
        content += text;
        onDelta(text);
      },
      onToolCalls: (deltas) => {
        accumulateToolCalls(acc, deltas);
      },
    });
    finalText += content;

    const toolCalls = finalizeToolCalls(acc);
    // 本轮没有工具调用 = 模型直接给出最终答案
    if (toolCalls.length === 0) return finalText;

    if (round >= MAX_TOOL_ROUNDS) {
      throw new Error('tool call rounds exceeded');
    }

    // 把本轮的工具调用意图 + 各工具结果按协议顺序追加进历史，供下一轮模型参考
    messages.push({ role: 'assistant', content: content || null, tool_calls: toolCalls });
    onPhase?.('querying');
    for (const tc of toolCalls) {
      // 取消后不再执行工具查询，避免白跑 Supabase 请求
      if (signal?.aborted) throw abortError();
      const result = await runTool(tc.function.name, tc.function.arguments, userId);
      messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
    }
    onPhase?.('thinking');
  }
}
