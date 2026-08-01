import { supabase } from '@/supabase/client';
import {
  sectionInsertSchema,
  sectionSchema,
  sectionsPageSchema,
  type Section,
  type SectionInsert,
} from '@/supabase/types';

// ============================================================
// sections（项目/分区）
// ============================================================

/**
 * 创建项目（sections）
 * 插入前经过 Zod 校验（describe 名称规则 + uid 归属）
 */
export async function createSection(input: SectionInsert) {
  // 校验输入数据，不通过则直接抛错
  const parsed = sectionInsertSchema.parse(input);

  const { data, error } = await (
    await supabase()
  )
    .from('sections')
    .insert(parsed)
    .select()
    .single<Section>();

  if (error) throw error;
  return sectionSchema.parse(data);
}

/**
 * 按页查询某用户的项目列表（sections）
 * 后端分页：range 只取当前页，count 精确统计匹配总数，翻页由服务端驱动；
 * 按创建时间倒序返回，每行经过 Zod 校验，确保运行时的脏数据不会进入内部
 */
export async function listSections(userId: string, page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await (
    await supabase()
  )
    .from('sections')
    .select('*', { count: 'exact' })
    .eq('uid', userId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw error;
  return sectionsPageSchema.parse({ sections: data ?? [], total: count ?? 0 });
}

/**
 * 更新项目选中态（sections）
 * @param id 项目 id
 * @param selected 目标选中态 —— 由调用方在取反后传入（如 !current.selected）
 * 返回更新后的完整记录，同样经过 Zod 校验
 */
export async function updateSectionSelected(id: number, selected: boolean) {
  const { data, error } = await (
    await supabase()
  )
    .from('sections')
    .update({ selected })
    .eq('id', id)
    .select()
    .single<Section>();

  if (error) throw error;
  return sectionSchema.parse(data);
}

/**
 * 删除项目及其全部流水明细（先删 items，再删 sections）
 * 按 section_id 定位该项目的所有明细并删除，避免残留孤儿数据；
 * 归属校验交给 RLS（仅能操作本人数据），删除结果无需回传数据，只抛错
 */
export async function deleteSectionWithItems(sectionId: number) {
  const client = await supabase();

  // 先删除该项目下的所有流水明细
  const { error: itemsError } = await client.from('items').delete().eq('section_id', sectionId);
  if (itemsError) throw itemsError;

  // 再删除项目本身
  const { error: sectionError } = await client.from('sections').delete().eq('id', sectionId);
  if (sectionError) throw sectionError;
}
