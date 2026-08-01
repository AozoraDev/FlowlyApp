-- ============================================================
-- 服务端聚合 RPC：收支汇总（替代客户端全量拉取后求和）
-- ============================================================
-- 背景：首页 / 明细页原先分别通过 listAllItems / getSectionSummary 把
-- 流水明细全量拉到客户端再逐行求和，流水量上千后每次进页都会全量传输 + 解析。
-- 这里改为 Postgres 侧一次性聚合，只回传各项目（或某项目）的 income/expense/balance 三数。
-- 两个函数均以 security invoker 创建：以调用者权限执行，items 表上的 RLS 照常生效，
-- 叠加 uid 参数过滤，双重保证只能聚合到本人数据。
-- 执行方式：在 Supabase Dashboard 的 SQL Editor 里运行本文件，或用 supabase CLI `supabase db push`。

-- 首页：按项目分组，一次返回当前用户全部项目的收支汇总
-- section_id 沿用表列类型（%TYPE），income/expense/balance 为 numeric（PostgREST 序列化为字符串，客户端用 coerce 兜底）
create or replace function public.get_section_summaries(p_uid uuid)
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
  group by section_id
$$;

-- 明细页：按项目聚合，返回某项目整区收支汇总
-- 聚合无 group by，空集也返回一行（各值 coalesce 为 0），客户端可用 .single() 取唯一返回
create or replace function public.get_section_summary(p_uid uuid, p_section_id public.items.section_id%type)
returns table (
  income numeric,
  expense numeric,
  balance numeric
)
language sql
security invoker
stable
as $$
  select
    coalesce(sum(case when "isIncome" then number else 0 end), 0) as income,
    coalesce(sum(case when not "isIncome" then number else 0 end), 0) as expense,
    coalesce(sum(case when "isIncome" then number else 0 end), 0)
      - coalesce(sum(case when not "isIncome" then number else 0 end), 0) as balance
  from public.items
  where uid = p_uid and section_id = p_section_id
$$;

-- 支持索引：按用户 + 项目过滤/聚合的查询（首页汇总、明细页分页、明细页整区汇总）都命中 (uid, section_id)
create index if not exists idx_items_uid_section_id
  on public.items (uid, section_id);
