import { z } from 'zod';

// ============================================================
// Zod Schema —— 运行时校验 + 类型推导
// ============================================================

/** 用户档案表 schema */
export const profileSchema = z.object({
  id: z.string().uuid(),
  username: z
    .string()
    .min(2, '用户名至少 2 个字符')
    .max(20, '用户名最多 20 个字符')
    .regex(/^[a-zA-Z0-9_]+$/, '用户名只能包含字母、数字和下划线')
    .nullable(),
  avatar_url: z.string().url().nullable(),
  bio: z.string().max(160, '简介最多 160 个字符').nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// ============================================================
// sections 表（项目/分区）
// ============================================================

/**
 * sections 表 schema
 * describe 即项目名称；selected 为选中态（默认 false）；校验错误消息使用 i18n key
 * id 为自增 bigint（非 uuid），uid 为归属用户（auth.users.id）
 */
export const sectionSchema = z.object({
  id: z.number(),
  describe: z.string().trim().min(1, 'home.nameRequired').max(20, 'home.nameTooLong'),
  uid: z.string().uuid(),
  selected: z.boolean(),
  created_at: z.string(),
});

/** 插入 sections 时的校验（排除服务端生成的 id / created_at） */
export const sectionInsertSchema = sectionSchema.pick({ describe: true, uid: true });

// ============================================================
// items 表（流水明细）
// ============================================================

/**
 * items 表 schema
 * isIncome 收支方向（true=收入）；number 金额（numeric 列 PostgREST 返回字符串，用 coerce 兜底）；
 * reason 事由；section_id 归属项目（sections.id）；uid 为归属用户（auth.users.id）
 */
export const itemSchema = z.object({
  id: z.number(),
  uid: z.string().uuid(),
  section_id: z.number(),
  isIncome: z.boolean(),
  number: z.coerce.number(),
  reason: z.string(),
  created_at: z.string(),
});

/**
 * 插入 items 时的校验（排除服务端生成的 id / created_at）
 * number 金额列在 PostgREST 中以字符串出入，这里用 coerce 兼容 number/数字字符串并统一转 number；
 * reason 名称列追加 trim/min/max 规则，把字段级约束收敛到 schema
 */
export const itemInsertSchema = z.object({
  uid: z.string().uuid(),
  section_id: z.number(),
  isIncome: z.boolean(),
  number: z.coerce.number().positive('home.amountInvalid'),
  reason: z.string().trim().min(1, 'home.reasonRequired').max(50, 'home.reasonTooLong'),
});

// ============================================================
// 分页响应 & 服务端聚合（后端分页 + RPC 汇总）
// ============================================================

/**
 * 收支汇总（服务端 RPC 返回）
 * income/expense/balance 来自 Postgres numeric 列，PostgREST 序列化为字符串，用 coerce 兜底；
 * 由 get_section_summary / get_section_summaries 在服务端聚合，客户端不再拉取明细求和
 */
export const sectionSummarySchema = z.object({
  income: z.coerce.number(),
  expense: z.coerce.number(),
  balance: z.coerce.number(),
});

/**
 * 首页按项目聚合的汇总行：在收支汇总基础上多带 section_id，用于把各项目汇总匹配到项目卡
 */
export const sectionSummaryRowSchema = sectionSummarySchema.extend({
  section_id: z.number(),
});

/** 分页响应：一页数据 + 匹配总数（count 来自 PostgREST count: 'exact'） */
export const itemsPageSchema = z.object({
  items: z.array(itemSchema),
  total: z.number().int().min(0),
});

/** sections 分页响应，与 items 同构 */
export const sectionsPageSchema = z.object({
  sections: z.array(sectionSchema),
  total: z.number().int().min(0),
});

// ============================================================
// ai_chats / ai_messages（AI-Agent 会话与消息）
// ============================================================

/**
 * ai_chats 表 schema（AI-Agent 会话）
 * title 为会话标题，客户端在首条用户消息发送时自动生成（取前 20 字）；
 * updated_at 由数据库触发器在插入消息时刷新，会话列表按它倒序把最新会话置顶
 */
export const aiChatSchema = z.object({
  id: z.number(),
  uid: z.string().uuid(),
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

/** 插入 ai_chats 时的校验（id/created_at/updated_at 由服务端生成，title 首条消息时才填） */
export const aiChatInsertSchema = aiChatSchema.pick({ uid: true });

/**
 * ai_messages 表 schema（AI-Agent 会话消息）
 * is_user 区分角色：true=用户消息，false=助手消息；content 为消息文本
 */
export const aiMessageSchema = z.object({
  id: z.number(),
  uid: z.string().uuid(),
  chat_id: z.number(),
  is_user: z.boolean(),
  content: z.string(),
  created_at: z.string(),
});

/** 插入 ai_messages 时的校验（id/created_at 由服务端生成） */
export const aiMessageInsertSchema = z.object({
  uid: z.string().uuid(),
  chat_id: z.number(),
  is_user: z.boolean(),
  content: z.string(),
});

/** 会话列表分页响应：一页会话 + 匹配总数（count 来自 PostgREST count: 'exact'） */
export const aiChatsPageSchema = z.object({
  chats: z.array(aiChatSchema),
  total: z.number().int().min(0),
});

// ============================================================
// 推导出的 TypeScript 类型
// ============================================================

/** 用户档案 */
export type Profile = z.infer<typeof profileSchema>;

/** 项目（sections 记录） */
export type Section = z.infer<typeof sectionSchema>;

/** 创建项目时的输入类型 */
export type SectionInsert = z.infer<typeof sectionInsertSchema>;

/** 流水明细（items 记录） */
export type Item = z.infer<typeof itemSchema>;

/** 创建流水明细时的输入类型 */
export type ItemInsert = z.infer<typeof itemInsertSchema>;

/** 收支汇总（服务端 RPC 返回） */
export type SectionSummary = z.infer<typeof sectionSummarySchema>;

/** 首页按项目聚合的汇总行（section_id + 收支汇总） */
export type SectionSummaryRow = z.infer<typeof sectionSummaryRowSchema>;

/** items 分页响应 */
export type ItemsPage = z.infer<typeof itemsPageSchema>;

/** sections 分页响应 */
export type SectionsPage = z.infer<typeof sectionsPageSchema>;

/** AI-Agent 会话（ai_chats 记录） */
export type AiChat = z.infer<typeof aiChatSchema>;

/** 创建会话时的输入类型 */
export type AiChatInsert = z.infer<typeof aiChatInsertSchema>;

/** AI-Agent 会话消息（ai_messages 记录） */
export type AiMessage = z.infer<typeof aiMessageSchema>;

/** 追加会话消息时的输入类型 */
export type AiMessageInsert = z.infer<typeof aiMessageInsertSchema>;

/** 会话列表分页响应 */
export type AiChatsPage = z.infer<typeof aiChatsPageSchema>;
