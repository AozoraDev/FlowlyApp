import { supabase } from '@/supabase/client';
import {
  itemInsertSchema,
  itemSchema,
  itemsPageSchema,
  sectionSummaryRowSchema,
  sectionSummarySchema,
  type Item,
} from '@/supabase/types';
import { z } from 'zod';

// ============================================================
// items（流水明细）
// ============================================================

/**
 * 创建流水明细（items）
 * number 金额允许以字符串传入（来自表单输入），由 itemInsertSchema 的 z.coerce 统一转 number 并校验
 */
export async function createItem(input: z.input<typeof itemInsertSchema>) {
  // 校验输入数据，不通过则直接抛错
  const parsed = itemInsertSchema.parse(input);

  const { data, error } = await (
    await supabase()
  )
    .from('items')
    .insert(parsed)
    .select()
    .single<Item>();

  if (error) throw error;
  return itemSchema.parse(data);
}

/**
 * 按页查询某项目下的流水明细（items）
 * 后端分页：range 只取当前页，count 精确统计整表匹配总数，翻页由服务端驱动而非前端切片；
 * 按 uid + section_id 双重限定归属，创建时间倒序，每行经 Zod 校验，确保运行时的脏数据不会进入内部
 */
export async function listItems(userId: string, sectionId: number, page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await (
    await supabase()
  )
    .from('items')
    .select('*', { count: 'exact' })
    .eq('uid', userId)
    .eq('section_id', sectionId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw error;
  return itemsPageSchema.parse({ items: data ?? [], total: count ?? 0 });
}

/**
 * 查询某项目下的收支汇总（服务端聚合 RPC）
 * 由 Postgres 函数 get_section_summary 在服务端一次求和，只回传 income/expense/balance 三数，
 * 不再把该项目全量明细拉到客户端逐行累加；聚合无 group by 恒返回一行，用 .single() 取唯一结果
 */
export async function getSectionSummary(userId: string, sectionId: number) {
  const { data, error } = await (
    await supabase()
  )
    .rpc('get_section_summary', { p_uid: userId, p_section_id: sectionId })
    .single();

  if (error) throw error;
  return sectionSummarySchema.parse(data);
}

/**
 * 查询当前用户全部项目的收支汇总（服务端聚合 RPC）
 * 由 Postgres 函数 get_section_summaries 按 section_id 分组一次性聚合，
 * 替代原先全量拉取明细投影再客户端分组求和，流水量大时只传 N 行汇总而非全量明细；
 * 批量用 z.array 解析，比逐行 parse 更快更简洁
 */
export async function getSectionSummaries(userId: string) {
  const { data, error } = await (
    await supabase()
  ).rpc('get_section_summaries', { p_uid: userId });

  if (error) throw error;
  return sectionSummaryRowSchema.array().parse(data ?? []);
}

/**
 * 删除单条流水明细（items）
 * 按 id 定位并删除，归属校验交给 RLS（仅能操作本人数据）；删除无回传数据，只抛错
 */
export async function deleteItem(itemId: number) {
  const { error } = await (await supabase()).from('items').delete().eq('id', itemId);
  if (error) throw error;
}
