-- ============================================================
-- AI-Agent 对话持久化：补列 + 触发器 + 索引 + RLS
-- ============================================================
-- 背景：ai_chats / ai_messages 已由用户在 Dashboard 建好，列结构为：
--   ai_chats(id bigint, uid uuid, created_at)
--   ai_messages(id bigint, chat_id bigint, uid uuid, is_user bool, content text, created_at)
-- 本迁移只补齐「多段对话 / 会话列表」所需的结构与安全策略，全部幂等、可重复执行。
-- 执行方式：Supabase Dashboard 的 SQL Editor 运行本文件（与 item_summaries_rpc 一致）。
--
-- 注意：此前两张表未开 RLS，匿名 key 也能读到全部数据，对记账 App 是安全隐患，
-- 这里统一按 uid 隔离（select/insert/update/delete 仅本人）。

-- 1. 补列：会话标题（首条用户消息自动生成）+ 最近活动时间（列表按此倒序，最新会话置顶）
alter table public.ai_chats add column if not exists title text not null default '';
alter table public.ai_chats add column if not exists updated_at timestamptz not null default now();

-- 2. 触发器：插入消息后自动刷新所属会话的 updated_at
-- 以 invoker 权限执行，更新本人会话（RLS 照常生效），无需放宽权限
create or replace function public.touch_ai_chat_updated_at()
returns trigger
language plpgsql
as $$
begin
  update public.ai_chats set updated_at = now() where id = new.chat_id;
  return new;
end;
$$;

-- create trigger 无 if not exists，用 do 块做存在性保护，保证可重复执行
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_ai_chats_touch_updated_at') then
    create trigger trg_ai_chats_touch_updated_at
    after insert on public.ai_messages
    for each row execute function public.touch_ai_chat_updated_at();
  end if;
end;
$$;

-- 3. 索引：会话列表按用户 + 最近活动倒序；消息按会话 + 创建时间正序还原对话
create index if not exists idx_ai_chats_uid_updated_at
  on public.ai_chats (uid, updated_at desc);
create index if not exists idx_ai_messages_chat_created_at
  on public.ai_messages (chat_id, created_at);

-- 4. RLS：两张表按 uid 隔离，只允许操作本人数据
-- create policy 无 if not exists（PG 15 前不支持），用 pg_policies 查重做存在性保护，保证可重复执行
alter table public.ai_chats enable row level security;
alter table public.ai_messages enable row level security;

do $$
begin
  -- ai_chats：四类操作都限定本人
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_chats' and policyname = 'ai_chats_select') then
    create policy "ai_chats_select" on public.ai_chats for select using (uid = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_chats' and policyname = 'ai_chats_insert') then
    create policy "ai_chats_insert" on public.ai_chats for insert with check (uid = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_chats' and policyname = 'ai_chats_update') then
    create policy "ai_chats_update" on public.ai_chats for update using (uid = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_chats' and policyname = 'ai_chats_delete') then
    create policy "ai_chats_delete" on public.ai_chats for delete using (uid = auth.uid());
  end if;

  -- ai_messages：同 ai_chats，按 uid 限定
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_messages' and policyname = 'ai_messages_select') then
    create policy "ai_messages_select" on public.ai_messages for select using (uid = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_messages' and policyname = 'ai_messages_insert') then
    create policy "ai_messages_insert" on public.ai_messages for insert with check (uid = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_messages' and policyname = 'ai_messages_update') then
    create policy "ai_messages_update" on public.ai_messages for update using (uid = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_messages' and policyname = 'ai_messages_delete') then
    create policy "ai_messages_delete" on public.ai_messages for delete using (uid = auth.uid());
  end if;
end;
$$;
