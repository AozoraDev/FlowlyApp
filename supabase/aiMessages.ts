import { z } from 'zod';

import { supabase } from '@/supabase/client';
import { aiMessageInsertSchema, aiMessageSchema, type AiMessage } from '@/supabase/types';

// ============================================================
// ai_messages（AI-Agent 会话消息）
// ============================================================

/**
 * 追加一条消息（ai_messages）
 * is_user 区分角色：true=用户消息，false=助手消息；插入后返回完整记录（含服务端生成的 id/created_at）
 */
export async function createAiMessage(input: z.input<typeof aiMessageInsertSchema>) {
  // 校验输入数据，不通过则直接抛错
  const parsed = aiMessageInsertSchema.parse(input);

  const { data, error } = await (
    await supabase()
  )
    .from('ai_messages')
    .insert(parsed)
    .select(
      'id, uid, chat_id, is_user, content, created_at, prompt_tokens, completion_tokens, total_tokens'
    )
    .single<AiMessage>();

  if (error) throw error;
  return aiMessageSchema.parse(data);
}

/**
 * 按会话正序查询全部消息（ai_messages）
 * created_at 升序还原对话顺序，id 作为同时间戳的兜底排序；
 * uid + chat_id 双重限定归属（与 items 同一防御风格），每行经 Zod 校验
 */
export async function listAiMessages(userId: string, chatId: number) {
  const { data, error } = await (
    await supabase()
  )
    .from('ai_messages')
    .select(
      'id, uid, chat_id, is_user, content, created_at, prompt_tokens, completion_tokens, total_tokens'
    )
    .eq('uid', userId)
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;
  return aiMessageSchema.array().parse(data ?? []);
}

/**
 * 清空某会话的全部消息（「清空对话」用）
 * 按 chat_id 删除，归属校验交给 RLS；删除结果无需回传数据，只抛错
 */
export async function clearAiChatMessages(chatId: number) {
  const { error } = await (await supabase()).from('ai_messages').delete().eq('chat_id', chatId);

  if (error) throw error;
}
