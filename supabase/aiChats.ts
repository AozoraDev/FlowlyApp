import { supabase } from '@/supabase/client';
import { aiChatInsertSchema, aiChatSchema, aiChatsPageSchema, type AiChat } from '@/supabase/types';

// ============================================================
// ai_chats（AI-Agent 会话）
// ============================================================

/**
 * 创建新会话（ai_chats）
 * 插入仅带 uid 归属，标题留空（首条用户消息发送时自动生成）；返回完整记录
 */
export async function createAiChat(userId: string) {
  // 校验输入数据，不通过则直接抛错
  const parsed = aiChatInsertSchema.parse({ uid: userId });

  const { data, error } = await (
    await supabase()
  )
    .from('ai_chats')
    .insert(parsed)
    .select('id, uid, title, created_at, updated_at')
    .single<AiChat>();

  if (error) throw error;
  return aiChatSchema.parse(data);
}

/**
 * 按页查询某用户的会话列表（ai_chats）
 * 后端分页：range 只取当前页，count 精确统计匹配总数；
 * 按最近活动（updated_at）倒序，最新会话置顶；显式 select 列，列缺失时快速暴露（依赖迁移补齐 title/updated_at）
 */
export async function listAiChats(userId: string, page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await (
    await supabase()
  )
    .from('ai_chats')
    .select('id, uid, title, created_at, updated_at', { count: 'exact' })
    .eq('uid', userId)
    .order('updated_at', { ascending: false })
    .range(from, to);

  if (error) throw error;
  return aiChatsPageSchema.parse({ chats: data ?? [], total: count ?? 0 });
}

/**
 * 更新会话标题（ai_chats）
 * 首条用户消息发送后调用，标题取消息前 20 字；归属校验交给 RLS（仅能操作本人数据），删除结果无回传，只抛错
 */
export async function updateAiChatTitle(chatId: number, title: string) {
  const { error } = await (await supabase()).from('ai_chats').update({ title }).eq('id', chatId);

  if (error) throw error;
}

/**
 * 删除会话及其全部消息（先删 ai_messages，再删 ai_chats）
 * 显式两步删除，不依赖外键级联配置是否开启，避免残留孤儿消息；
 * 归属校验交给 RLS，删除结果无需回传数据，只抛错
 */
export async function deleteAiChat(chatId: number) {
  const client = await supabase();

  // 先删除该会话下的全部消息
  const { error: messagesError } = await client.from('ai_messages').delete().eq('chat_id', chatId);
  if (messagesError) throw messagesError;

  // 再删除会话本身
  const { error: chatError } = await client.from('ai_chats').delete().eq('id', chatId);
  if (chatError) throw chatError;
}
