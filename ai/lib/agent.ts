import {
  accumulateToolCalls,
  buildChatMessages,
  finalizeToolCalls,
  type AgentPhase,
  type ChatCompletionMessage,
  type ChatMessage,
  type TokenUsage,
  type ToolCallAccumulator,
} from './chat';
import { streamChatCompletion } from './chatStream';
import type { ModelConfig } from './modelConfig';
import {
  accountSummaryResultSchema,
  buildSummaryApp,
  type AccountSummaryResult,
} from './a2uiPresets';
import { getA2uiFormat, getSummaryNote } from '../prompt/systemPrompt';
import { getChatTools, isHelpTool, isQueryTool, isWriteTool, runTool } from './tools';

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
  // 返回值为最终全文 + token 用量，持久化以返回值为准
  onDelta: (text: string) => void;
  // 占位气泡阶段：thinking=首帧前思考，querying=查询账目，writing=写入账目
  onPhase?: (phase: AgentPhase) => void;
  // 单轮输出 token 上限（超限兜底截断）：账目类回答以结构化卡片为主，2500 足够放下
  // 完整的 DataGrid 数据+结论；正文精简由提示词约束，此上限只在模型输出失控时兜底。
  // 缺省用 DEFAULT_MAX_TOKENS，调用方可覆盖
  maxTokens?: number;
};

// 单次回答最多允许的工具轮数，防止模型反复调用工具形成死循环
const MAX_TOOL_ROUNDS = 5;

// 单轮输出 token 硬上限：账目卡片需完整展示数据，2500 留足空间；纯文本轮由提示词约束精简，
// 上限仅在模型输出失控时兜底截断，防动辄 4000+ token 的冗余输出
export const DEFAULT_MAX_TOKENS = 2500;

/** 构造与原生 AbortError 同名同型的错误，让调用方统一的 AbortError 静默逻辑生效 */
function abortError(): Error {
  return Object.assign(new Error('aborted'), { name: 'AbortError' });
}

/** 把一轮的 token 用量累加进累计值：多轮工具对话时每轮 prompt 都会带入上一轮的工具结果 */
function mergeTokenUsage(total: TokenUsage | null, round: TokenUsage): TokenUsage {
  return total
    ? {
        prompt_tokens: total.prompt_tokens + round.prompt_tokens,
        completion_tokens: total.completion_tokens + round.completion_tokens,
        total_tokens: total.total_tokens + round.total_tokens,
      }
    : round;
}

/**
 * Agent 多轮循环：每轮流式请求都可能返回增量文本和/或工具调用。
 *  - 流式期间把增量文本转发给 onDelta、工具调用碎片累积到 acc；
 *  - 一轮结束若存在完整工具调用 → 执行 runTool 并把 assistant(tool_calls) + tool 结果消息
 *    追加进 messages，继续下一轮（OpenAI 协议要求 assistant 之后紧跟每条 tool 结果）；
 *  - 一轮结束无工具调用 → 本轮文本即最终答案，返回累计文本。
 * 工具执行失败以 {ok:false,error} 串回给模型自愈；轮数超限直接抛错走全局错误处理。
 */
export async function runAgentChat(
  params: RunAgentChatParams
): Promise<{ content: string; usage: TokenUsage | null }> {
  const { config, systemPrompt, history, userId, language, signal, onDelta, onPhase } = params;
  const maxTokens = params.maxTokens ?? DEFAULT_MAX_TOKENS;
  const messages: ChatCompletionMessage[] = buildChatMessages(systemPrompt, history);
  const lang = language ?? 'zh';
  const tools = getChatTools(lang);
  let finalText = '';
  // 多轮工具对话的 token 累计：每轮返回后合并（provider 不支持 usage 时保持 null）
  let usage: TokenUsage | null = null;
  // A2UI 格式规范本请求是否已注入：查询工具拿到数据后才注入一次，避免后续查询轮重复携带
  let a2uiInjected = false;
  // get_account_summaries 返回的汇总数据：最终回答收尾时由代码确定性渲染三卡+各项目表，
  // 不依赖模型手写卡片（杜绝漏卡/算错/时有时无）；查询失败（ok:false）时为 null 不生成
  let pendingSummary: AccountSummaryResult | null = null;
  onPhase?.('thinking');

  for (let round = 0; ; round++) {
    let content = '';
    const acc: Record<number, ToolCallAccumulator> = {};
    // 一轮内的用量以最后一次回调为准（标准协议仅流式末帧携带 usage）
    let roundUsage: TokenUsage | null = null;
    await streamChatCompletion({
      config,
      messages,
      signal,
      tools,
      maxTokens,
      onDelta: (text) => {
        content += text;
        onDelta(text);
      },
      onToolCalls: (deltas) => {
        accumulateToolCalls(acc, deltas);
      },
      onUsage: (u) => {
        roundUsage = u;
      },
    });
    if (roundUsage) usage = mergeTokenUsage(usage, roundUsage);
    finalText += content;

    const toolCalls = finalizeToolCalls(acc);
    // 本轮没有工具调用 = 模型直接给出最终答案
    if (toolCalls.length === 0) {
      // 有汇总数据 → 代码确定性拼出三卡+各项目表块，追加在模型正文后（正文已流式输出，追加不打断）
      if (pendingSummary) {
        finalText += `\n\`\`\`a2ui\n${JSON.stringify(buildSummaryApp(pendingSummary, lang))}\n\`\`\``;
      }
      return { content: finalText, usage };
    }

    if (round >= MAX_TOOL_ROUNDS) {
      throw new Error('tool call rounds exceeded');
    }

    // 把本轮的工具调用意图 + 各工具结果按协议顺序追加进历史，供下一轮模型参考；
    // 占位气泡阶段：含写入工具 →「写入账目中」；含 get_help（不查账）→ 维持「思考中」；
    // 其余只读查询 →「查询账目中」
    messages.push({ role: 'assistant', content: content || null, tool_calls: toolCalls });
    const hasWrite = toolCalls.some((tc) => isWriteTool(tc.function.name));
    const hasHelp = toolCalls.some((tc) => isHelpTool(tc.function.name));
    onPhase?.(hasWrite ? 'writing' : hasHelp ? 'thinking' : 'querying');
    for (const tc of toolCalls) {
      // 取消后不再执行工具查询，避免白跑 Supabase 请求
      if (signal?.aborted) throw abortError();
      const result = await runTool(tc.function.name, tc.function.arguments, userId, lang);
      messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
      // 汇总工具：记住 total/rows，收尾时拼进最终回答；结果解析失败（查询失败 ok:false）保持 null
      if (tc.function.name === 'get_account_summaries') {
        try {
          const parsed = accountSummaryResultSchema.safeParse(JSON.parse(result));
          if (parsed.success) pendingSummary = parsed.data;
        } catch {
          /* 极端兜底：结果非合法 JSON 时忽略，正常不会走到 */
        }
      }
    }
    // 查询工具返回了可渲染的账目数据 → 注入 A2UI 格式规范（每请求至多一次）：
    // 模型下一轮组装答案时就有表格格式可用；纯文本/帮助/写入轮不携带，省掉每轮重复发送的格式 token。
    // 基础提示词保持稳定、该规范按需追加在末尾，不破坏前缀缓存。
    if (!a2uiInjected && toolCalls.some((tc) => isQueryTool(tc.function.name))) {
      a2uiInjected = true;
      messages.push({ role: 'system', content: getA2uiFormat(lang) });
      // 汇总轮额外提醒：汇总卡片由系统生成、模型不要再输出 a2ui 块（仅汇总轮注入，其他查询轮不带）
      if (toolCalls.some((tc) => tc.function.name === 'get_account_summaries')) {
        messages.push({ role: 'system', content: getSummaryNote(lang) });
      }
    }
    onPhase?.('thinking');
  }
}
