-- ============================================================
-- AI-Agent token 用量展示：ai_messages 补 token 三列
-- ============================================================
-- 背景：ai 回答后需要展示本次对话消耗的 token 数，用量来自 OpenAI 兼容接口
-- 流式末帧的 usage 字段（请求需带 stream_options.include_usage）。
-- 本迁移在 ai_messages 上加三列，助手消息落库时写入；旧数据与用户消息保持 null。
-- 全部幂等、可重复执行。
-- 执行方式：Supabase Dashboard 的 SQL Editor 运行本文件（与 ai_chats_rls 一致）。

alter table public.ai_messages add column if not exists prompt_tokens integer;
alter table public.ai_messages add column if not exists completion_tokens integer;
alter table public.ai_messages add column if not exists total_tokens integer;
