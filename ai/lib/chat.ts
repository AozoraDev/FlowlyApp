import { z } from 'zod';

import type { AiMessage } from '@/supabase/types';

// 聊天输入表单校验 schema：去首尾空格后至少 1 字；错误 message 用 i18n key，展示时再翻译。
// schema 即类型唯一来源，ChatInput 由 z.infer 推导。
export const messageSchema = z.object({
  content: z.string().trim().min(1, 'aiAgent.messageRequired'),
});
export type ChatInput = z.infer<typeof messageSchema>;

// 路由参数 chatId：来自 URL 的字符串，用 coerce 转数字并校验为正整数（zod 边界，一次解析）
export const chatIdSchema = z.coerce.number().int().positive();

// AI-Agent 占位气泡的进行中阶段：thinking=首帧前思考，querying=读取工具查询账目中，
// writing=写入工具（新建项目/记一笔）正在落库
export type AgentPhase = 'thinking' | 'querying' | 'writing';

// 内存中的一条对话消息；status 仅助手消息使用（streaming/error），缺省视为已完成（done）。
// 用户消息始终无 status；构造请求时会剔除 streaming/error 占位（见 buildChatMessages）
export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: 'streaming' | 'error';
  // 进行中阶段（仅助手占位气泡）：决定「思考中 / 查询账目中」的文案
  phase?: AgentPhase;
  // token 用量（仅助手已完成消息）：未上报（provider 不支持）或历史数据为 null
  tokenUsage?: TokenUsage | null;
};

// 归一化后的 token 用量（OpenAI 兼容流式末帧 usage 字段）：三值必填，缺省字段补 0
export const tokenUsageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
});
export type TokenUsage = z.infer<typeof tokenUsageSchema>;

// OpenAI 兼容 chat 接口的 messages 元素：发给模型的最小结构。
// assistant 可携带 tool_calls（调用工具），tool 角色回传工具执行结果，二者必须挂 role 区分
export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';
export type ChatCompletionMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

// 单个工具定义（OpenAI function calling 格式）；parameters 是 JSON Schema，由 zod schema 派生
export type ToolFunction = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};
export type ChatTool = { type: 'function'; function: ToolFunction };

// 模型最终产出的一个完整工具调用；arguments 是 JSON 字符串，执行时再 parse
export type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

// 流式 chunk 里的单帧工具增量：index 定位是哪个调用，id/name 只在首帧出现，arguments 是碎片
export type StreamToolCallDelta = {
  index: number;
  id?: string;
  name?: string;
  arguments?: string;
};

// 按 index 累积工具调用碎片的状态：id/name 首值保留，args 逐帧追加
export type ToolCallAccumulator = { id?: string; name?: string; args: string };

// 流式 chunk 响应边界：OpenAI 兼容协议返回 { choices: [{ delta: { content, tool_calls } }] }，
// delta 可能缺失 content（角色切换帧），choices 也可能为空，故全部置可选。
// 请求带 stream_options.include_usage 时，流式末帧为 { choices: [], usage: {...} }（无 delta）
const streamChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z
          .object({
            content: z.string().optional(),
            // 工具调用流式帧：index 必填用于归位（缺省补 0 兼容），id/name 首帧给，arguments 逐帧碎片
            tool_calls: z
              .array(
                z.object({
                  index: z.number().int().nonnegative().default(0),
                  id: z.string().optional(),
                  type: z.literal('function').optional(),
                  function: z
                    .object({
                      name: z.string().optional(),
                      arguments: z.string().optional(),
                    })
                    .optional(),
                })
              )
              .optional(),
          })
          .optional(),
      })
    )
    .optional(),
  // 流式末帧 token 用量：字段可能不齐（部分端点只报 total），全部置可选，解析后补 0 归一化。
  // 必须用 nullish 放行 null——OpenAI 兼容端点开启 include_usage 后，普通内容帧也会带 usage:null，
  // 若按 optional（只放行 undefined）校验，会令所有内容帧 safeParse 失败、正文增量被整帧丢弃
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
      total_tokens: z.number().int().nonnegative().optional(),
    })
    .nullish(),
});

// 自增序列：与时间戳拼接保证同屏 id 唯一
let seq = 0;

/** 消息 id：时间戳 + 自增序号，保证同一会话内不重复 */
export function genId(): string {
  seq += 1;
  return `${Date.now()}-${seq}`;
}

/** 拼 chat/completions 地址：去尾部斜杠再拼接，避免 baseUrl 带斜杠时拼出双斜杠 */
export function buildChatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '')}/chat/completions`;
}

/** 单行 SSE 解析：仅处理 data: 行并返回载荷文本（容忍尾部 \r），其余行（event:/注释等）返回 null */
export function parseSseLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return null;
  return trimmed.slice(5).trim();
}

// 单帧解析结果：content 为该帧增量文本（可能为空串），toolCalls 为该帧工具调用增量（可能为空数组），
// usage 为流式末帧携带的 token 用量（仅 usage 帧有值，其余帧为 null）
export type ParsedChunk = {
  content: string;
  toolCalls: StreamToolCallDelta[];
  usage: TokenUsage | null;
};

/**
 * 解析一个 SSE data 载荷（流式 chunk）：
 * [DONE] / 坏 JSON / 结构不符（无 choices / 空 choices / 无 delta 且无 usage）返回 null；
 * 角色切换帧（delta 只有 role 无内容）返回空对象，调用方据此跳过或作为空帧处理。
 */
export function parseChunk(data: string): ParsedChunk | null {
  if (data === '[DONE]') return null;
  try {
    const result = streamChunkSchema.safeParse(JSON.parse(data));
    if (!result.success) return null;
    const delta = result.data.choices?.[0]?.delta;
    const usage = result.data.usage;
    // 既无增量内容/工具帧也无 usage 的帧（空 choices、角色帧等）视为无效帧
    if (!delta && !usage) return null;
    return {
      content: delta?.content ?? '',
      toolCalls: (delta?.tool_calls ?? []).map((tc) => ({
        index: tc.index,
        id: tc.id,
        name: tc.function?.name,
        arguments: tc.function?.arguments,
      })),
      // 缺省字段补 0，归一化成必填的 TokenUsage；未带 usage 的普通帧为 null
      usage: usage
        ? {
            prompt_tokens: usage.prompt_tokens ?? 0,
            completion_tokens: usage.completion_tokens ?? 0,
            total_tokens: usage.total_tokens ?? 0,
          }
        : null,
    };
  } catch {
    return null;
  }
}

/** 取单帧增量文本（兼容旧纯文本流式调用方）；工具调用帧 / [DONE] / 结构不符返回空串 */
export function extractDelta(data: string): string {
  return parseChunk(data)?.content ?? '';
}

/**
 * SSE 行切分器：流式 chunk 可能把一行拆到两个 buffer 里，
 * 闭包缓存未完成的后半行，下次补全后一次性吐出完整行。
 */
export function createSseLineSplitter(): (chunk: string) => string[] {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk;
    const lines: string[] = [];
    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      lines.push(buffer.slice(0, newlineIdx));
      buffer = buffer.slice(newlineIdx + 1);
    }
    return lines;
  };
}

/**
 * 累积工具调用流式碎片：按 index 归位到槽位，id/name 只在首帧出现故首值保留，
 * arguments 是跨帧碎片需逐帧追加拼接，返回同一个累积对象便于循环引用。
 */
export function accumulateToolCalls(
  prev: Record<number, ToolCallAccumulator>,
  deltas: readonly StreamToolCallDelta[]
): Record<number, ToolCallAccumulator> {
  for (const d of deltas) {
    const slot = prev[d.index] ?? (prev[d.index] = { args: '' });
    if (d.id && !slot.id) slot.id = d.id;
    if (d.name && !slot.name) slot.name = d.name;
    if (d.arguments) slot.args += d.arguments;
  }
  return prev;
}

/**
 * 把累积槽位收口成完整的 ToolCall 列表：过滤掉没有 name 的残帧（只出现 index 的空帧），
 * id 缺失时合成占位（部分兼容端点不发 id），保证后续 tool 结果消息能对得上。
 */
export function finalizeToolCalls(acc: Record<number, ToolCallAccumulator>): ToolCall[] {
  return Object.entries(acc)
    .filter(([, c]) => c.name)
    .map(([index, c]) => ({
      id: c.id ?? `call_${Date.now()}-${index}`,
      type: 'function' as const,
      function: { name: c.name!, arguments: c.args },
    }));
}

/**
 * 组装发给模型的 messages：system 提示词 + 已完成的历史对话。
 * 剔除 streaming 占位（未完成）与 error 消息（失败回答），避免把半截/错误内容喂给模型当上下文。
 */
export function buildChatMessages(
  systemPrompt: string,
  history: readonly ChatMessage[]
): ChatCompletionMessage[] {
  return [
    { role: 'system', content: systemPrompt },
    ...history
      .filter((m) => m.status !== 'streaming' && m.status !== 'error')
      .map((m): ChatCompletionMessage =>
        m.role === 'user'
          ? { role: 'user', content: m.content }
          : { role: 'assistant', content: m.content }
      ),
  ];
}

/** 会话标题：取首条用户消息前 20 字，连续空白压缩为单个空格、超长加省略号；列表与详情页共用同一来源 */
export function truncateTitle(content: string, max = 20): string {
  const text = content.replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/** 服务端消息行 → 界面消息：is_user 映射角色，id 统一为字符串（FlatList key 用） */
export function toChatMessage(row: AiMessage): ChatMessage {
  return {
    id: String(row.id),
    role: row.is_user ? 'user' : 'assistant',
    content: row.content,
    // token 三列全为 null（旧数据/未上报）时 tokenUsage 为 null，气泡不展示用量
    tokenUsage:
      row.prompt_tokens != null || row.completion_tokens != null || row.total_tokens != null
        ? {
            prompt_tokens: row.prompt_tokens ?? 0,
            completion_tokens: row.completion_tokens ?? 0,
            total_tokens: row.total_tokens ?? 0,
          }
        : null,
  };
}
