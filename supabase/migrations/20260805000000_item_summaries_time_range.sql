-- ============================================================
-- get_section_summaries 增加可选时间范围（按 items.created_at 过滤）
-- ============================================================
-- 背景：AI-Agent 问「某月/某段时间的消费」时，需要按流水明细的消费时间
-- （items.created_at）聚合，而不是全时段汇总。项目创建时间 sections.created_at
-- 与流水消费时间无任何关联，绝不参与过滤。
-- 新增 p_from / p_to 两个可选参数（timestamptz，缺省 null = 不限），
-- 半开区间 [p_from, p_to)：created_at >= p_from 且 created_at < p_to。
-- 首页等旧调用不传新参数（null），行为与原来完全一致。
-- 执行方式：Supabase Dashboard SQL Editor 运行本文件，或 supabase CLI `supabase db push`。

create or replace function public.get_section_summaries(
  p_uid uuid,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  section_id public.items.section_id%type,
  income numeric,
  expense numeric,
  balance numeric
)
language sql
security invoker
stable
as $$
  select
    section_id,
    coalesce(sum(case when "isIncome" then number else 0 end), 0) as income,
    coalesce(sum(case when not "isIncome" then number else 0 end), 0) as expense,
    coalesce(sum(case when "isIncome" then number else 0 end), 0)
      - coalesce(sum(case when not "isIncome" then number else 0 end), 0) as balance
  from public.items
  where uid = p_uid
    and (p_from is null or created_at >= p_from)
    and (p_to is null or created_at < p_to)
  group by section_id
$$;
