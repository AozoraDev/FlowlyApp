import { z } from 'zod';

import { createItem, getSectionSummaries, listItems } from '@/supabase/items';
import { createSection, listSections } from '@/supabase/sections';
import type { ChatTool } from './chat';

// ============================================================
// AI-Agent 工具定义：查询用户真实账目（sections / items）+ 写入（新建项目 / 记一笔）。
// 读取工具只读不写；写入工具（write:true）会真实落库，模型调用前必须先与用户确认全部字段。
// 参数 schema 是运行时校验的唯一来源（zod），同时经 toJSONSchema 派生成发给模型的
// parameters（JSON Schema）。注意两点：
//  1) 一律用 .optional() 而非 .default()——zod 的 .default() 会把字段塞进 required；
//  2) toJSONSchema 产物含 $schema / additionalProperties:false，部分端点会 reject，需 sanitize。
// ============================================================

const listSectionsArgsSchema = z.object({});
const helpArgsSchema = z.object({});
// ISO 日期或带时间的 ISO（如 "2026-08-01" / "2026-08-01T12:30:00Z"）；date-only 按设备本地时区补 00:00
const isoDate = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;
// 时间范围参数：from/to 可选，只按流水消费时间 items.created_at 过滤；
// sections.created_at（项目创建时间）与查询无关，绝不参与过滤
const timeRangeArgs = {
  from: z.string().regex(isoDate, 'from must be ISO date/datetime').optional(),
  to: z.string().regex(isoDate, 'to must be ISO date/datetime').optional(),
};
const accountSummariesArgsSchema = z.object({ ...timeRangeArgs });
// 导出供测试断言 schema 行为（optional 字段不进 required 等）
export const listItemsArgsSchema = z.object({
  sectionId: z.number().int().min(1),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  ...timeRangeArgs,
});
// 写入工具参数 schema：与 supabase/types 里 insert schema 的字段级约束对齐。
// 模型在信息不全时应先询问用户、确认后再调用；参数非法由 schema 拦截，错误串回给模型自愈
export const createSectionArgsSchema = z.object({
  name: z.string().trim().min(1).max(20),
});
export const addItemArgsSchema = z.object({
  sectionId: z.number().int().min(1),
  // 收支方向（true=收入）；金额必须是正数，方向由 isIncome 表达，不在金额上带符号
  isIncome: z.boolean(),
  // coerce 兼容模型输出数字字符串（如 "28"），与 itemInsertSchema 的 number 处理一致
  amount: z.coerce.number().positive(),
  reason: z.string().trim().min(1).max(50),
});

// get_help 固定的功能帮助说明（zh/en 双语）：用户输入「帮助」时经工具返回原样转述，
// 维护只此一处，模型不即兴发挥，保证文案固定可控。
export const HELP_CONTENT = {
  zh: `我是 Flowly AI 助手，可帮你处理这些记账的事：

1. **查账** — 问我花了多少、结余多少，或各项目的收支汇总；
2. **看明细** — 查看某个项目下的每一笔流水；
3. **记一笔** — 告诉我项目、事由、收支方向和金额，我写进账本；
4. **新建项目** — 创建新项目来归类账目。

直接输入问题即可，例如：
- 「我这个月总共花了多少？」
- 「日常这个月的支出明细」
- 「在『日常』记一笔买咖啡，支出 28 元」`,
  en: `I'm Flowly AI, here's what I can help you with:

1. **Check your ledger** — ask how much you've spent, your balance, or each section's summary;
2. **View transactions** — see every entry under a specific section;
3. **Record an entry** — tell me the section, reason, direction and amount, and I'll write it into your ledger;
4. **Create a section** — set up a new section to organize your ledger.

Just type your question, for example:
- "How much have I spent in total this month?"
- "Show me this month's expense entries under Daily"
- "Record a ¥28 coffee expense under Daily"`,
} as const;

// 递归剔除 JSON Schema 中对模型无用 / 易被端点拒绝的关键字：
//  $schema / additionalProperties / default 会被部分 OpenAI 兼容端点 reject；
//  pattern 是 ISO 日期运行时正则（~100 字且 from/to 重复 4 次）——日期格式已写在工具描述里，
//  模型侧不需要这份完整正则，运行时校验仍由 zod 承担，故一并剥掉省 token。
export function sanitizeJsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeJsonSchema);
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === '$schema' || k === 'additionalProperties' || k === 'default' || k === 'pattern')
        continue;
      out[k] = sanitizeJsonSchema(v);
    }
    return out;
  }
  return node;
}

/** zod schema → 可发给模型的干净 JSON Schema（剔除 $schema/additionalProperties/default/pattern） */
export function toToolJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return sanitizeJsonSchema(schema.toJSONSchema()) as Record<string, unknown>;
}

type ToolCtx = {
  userId: string;
  // 界面语言（zh/en），工具据此选文案；未传回退中文
  language?: string;
};

/**
 * 归一化 from/to 为 UTC ISO 传给 Supabase：date-only（"2026-08-01"）按设备本地时区补 00:00 再转 UTC，
 * 保证「8月」这类本地月份边界换算正确；已带时区的 ISO 原样转换。解析失败抛错，由 runTool 兜底回给模型自愈。
 */
function toUtcIso(value: string): string {
  const d = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid time range value: ${value}`);
  return d.toISOString();
}

type ToolDef = {
  paramsSchema: z.ZodType;
  run: (args: unknown, ctx: ToolCtx) => Promise<string>;
  // 写入型工具（新建项目/记一笔）：执行轮占位气泡显示「写入账目中」，且约束模型调用前先向用户确认
  write?: boolean;
  // 帮助型工具（get_help）：执行轮占位气泡保持「思考中」，不误显示「查询账目中」
  help?: boolean;
  // 查询型工具（只读返回真实账目数据）：执行后 agent 注入 A2UI 表格格式规范，让模型组装数据卡片
  query?: boolean;
};

/** 列出用户全部项目：id + 名称 + 选中态（供模型确定有哪些项目、拿 sectionId） */
async function runListSections(_args: unknown, { userId }: ToolCtx): Promise<string> {
  const page = await listSections(userId, 1, 100);
  return JSON.stringify({
    ok: true,
    total: page.total,
    sections: page.sections.map((s) => ({ id: s.id, name: s.describe, selected: s.selected })),
  });
}

/**
 * 各项目收支结余 + 合计：复用服务端聚合 RPC（可带 from/to 限定流水消费时间），
 * 客户端补项目名并求和，返回紧凑 JSON 给模型
 */
async function runAccountSummaries(args: unknown, { userId }: ToolCtx): Promise<string> {
  const { from, to } = accountSummariesArgsSchema.parse(args);
  const [summaries, sectionsPage] = await Promise.all([
    getSectionSummaries(userId, from ? toUtcIso(from) : undefined, to ? toUtcIso(to) : undefined),
    listSections(userId, 1, 100),
  ]);
  const nameById = new Map(sectionsPage.sections.map((s) => [s.id, s.describe]));
  // 金额保留两位小数，避免浮点长尾噪音
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const rows = summaries.map((r) => ({
    sectionId: r.section_id,
    name: nameById.get(r.section_id) ?? `#${r.section_id}`,
    income: round2(r.income),
    expense: round2(r.expense),
    balance: round2(r.balance),
  }));
  const total = rows.reduce(
    (acc, r) => ({
      income: round2(acc.income + r.income),
      expense: round2(acc.expense + r.expense),
      balance: round2(acc.balance + r.balance),
    }),
    { income: 0, expense: 0, balance: 0 }
  );
  return JSON.stringify({ ok: true, rows, total });
}

/** 查询某项目下的流水明细：args 在 runTool 已按 schema 校验过，这里再 parse 拿类型贯穿；from/to 限定流水消费时间 */
async function runListItems(args: unknown, { userId }: ToolCtx): Promise<string> {
  const { sectionId, page = 1, pageSize = 20, from, to } = listItemsArgsSchema.parse(args);
  const res = await listItems(
    userId,
    sectionId,
    page,
    pageSize,
    from ? toUtcIso(from) : undefined,
    to ? toUtcIso(to) : undefined
  );
  return JSON.stringify({
    ok: true,
    sectionId,
    total: res.total,
    items: res.items.map((it) => ({
      id: it.id,
      isIncome: it.isIncome,
      amount: it.number,
      reason: it.reason,
      createdAt: it.created_at,
    })),
  });
}

/** 新建项目：名称经 schema 校验后写库，返回新项目 id + 名称（去重由提示词约束模型先查 list_sections） */
async function runCreateSection(args: unknown, { userId }: ToolCtx): Promise<string> {
  const { name } = createSectionArgsSchema.parse(args);
  const section = await createSection({ describe: name, uid: userId });
  return JSON.stringify({ ok: true, section: { id: section.id, name: section.describe } });
}

/** 记一笔流水：金额为正数、收支方向用 isIncome 表达，写库后返回该条记录的摘要 */
async function runAddItem(args: unknown, { userId }: ToolCtx): Promise<string> {
  const { sectionId, isIncome, amount, reason } = addItemArgsSchema.parse(args);
  const item = await createItem({
    uid: userId,
    section_id: sectionId,
    isIncome,
    number: amount,
    reason,
  });
  return JSON.stringify({
    ok: true,
    item: { id: item.id, sectionId, isIncome, amount: item.number, reason: item.reason },
  });
}

/** 返回固定的功能帮助说明：语言取 ctx.language（未传回退中文），文案即 HELP_CONTENT 原文 */
async function runGetHelp(_args: unknown, { language }: ToolCtx): Promise<string> {
  const zh = (language ?? 'zh').toLowerCase().startsWith('zh');
  return JSON.stringify({ ok: true, help: (zh ? HELP_CONTENT.zh : HELP_CONTENT.en).trim() });
}

const REGISTRY: Record<string, ToolDef> = {
  get_help: { paramsSchema: helpArgsSchema, run: runGetHelp, help: true },
  list_sections: { paramsSchema: listSectionsArgsSchema, run: runListSections, query: true },
  get_account_summaries: {
    paramsSchema: accountSummariesArgsSchema,
    run: runAccountSummaries,
    query: true,
  },
  list_items: { paramsSchema: listItemsArgsSchema, run: runListItems, query: true },
  create_section: { paramsSchema: createSectionArgsSchema, run: runCreateSection, write: true },
  add_item: { paramsSchema: addItemArgsSchema, run: runAddItem, write: true },
};

/** 是否写入型工具：agent 据此把执行轮占位气泡切到「写入账目中」而非「查询账目」 */
export function isWriteTool(name: string): boolean {
  return REGISTRY[name]?.write ?? false;
}

/** 是否帮助型工具（get_help）：不查账不落库，agent 据此让执行轮占位气泡保持「思考中」 */
export function isHelpTool(name: string): boolean {
  return REGISTRY[name]?.help ?? false;
}

/** 是否查询型工具（只读返回账目数据）：agent 据此在数据到达后注入 A2UI 表格格式规范，帮助/写入不注入 */
export function isQueryTool(name: string): boolean {
  return REGISTRY[name]?.query ?? false;
}

/**
 * 执行一次工具调用：返回紧凑 JSON 字符串（成功 {ok:true,...} / 失败 {ok:false,error}）。
 * language 传入工具执行上下文（get_help 据此选 zh/en 文案）。
 * 任何异常（参数非法、查询失败）都转成错误串交给模型自愈，绝不向外抛出——保证 agent 循环存活。
 */
export async function runTool(
  name: string,
  argsJson: string,
  userId: string,
  language?: string
): Promise<string> {
  const def = REGISTRY[name];
  if (!def) return JSON.stringify({ ok: false, error: `unknown tool: ${name}` });
  try {
    // 无参工具模型常发 arguments: ""，空串兼容为 {}；其余 JSON.parse 失败走 catch
    const args = argsJson.trim() ? JSON.parse(argsJson) : {};
    return await def.run(args, { userId, language });
  } catch (err) {
    return JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

/** 工具描述随界面语言取 zh/en，让模型在对应语言下理解用途；未命中回退中文 */
export function getChatTools(language: string): ChatTool[] {
  const zh = language.toLowerCase().startsWith('zh');
  return [
    {
      type: 'function',
      function: {
        name: 'get_help',
        description: zh
          ? '返回固定功能说明。用户输入「帮助」或询问你能做什么时调用。'
          : 'Return the fixed help text. Call when the user types "help" or asks what you can do.',
        parameters: toToolJsonSchema(helpArgsSchema),
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_sections',
        description: zh
          ? '列出全部项目（id、名称、选中态）。不确定有哪些项目或需要项目 id 时调用。'
          : 'List all sections (id, name, selected). Call when unsure which sections exist or you need a section id.',
        parameters: toToolJsonSchema(listSectionsArgsSchema),
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_account_summaries',
        description: zh
          ? '查询各项目收支结余及合计。from/to 可选（ISO 日期或时间，如 "2026-08-01"，左闭右开，本地时区，只按流水消费时间过滤）。问整体收支/结余或某段时期时调用。'
          : 'Income/expense/balance per section plus a grand total. from/to optional (ISO date/time, half-open, local timezone, transaction time only). Call for overall spending, balances, or a specific period.',
        parameters: toToolJsonSchema(accountSummariesArgsSchema),
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_items',
        description: zh
          ? '查询某项目的流水明细（金额、方向、备注、时间）。sectionId 来自 list_sections；page/pageSize 可选（默认 1/20）；from/to 可选，语义同 get_account_summaries。'
          : 'Transaction items of one section (amount, direction, reason, time). sectionId from list_sections; page/pageSize optional (default 1/20); from/to optional, same semantics as get_account_summaries.',
        parameters: toToolJsonSchema(listItemsArgsSchema),
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_section',
        description: zh
          ? '新建项目，参数 name 为名称。先调 list_sections 查重；名称缺失或未明确时先问，不猜测。'
          : 'Create a section; name is the section name. Call list_sections first to check duplicates; ask if the name is missing or unclear — never guess.',
        parameters: toToolJsonSchema(createSectionArgsSchema),
      },
    },
    {
      type: 'function',
      function: {
        name: 'add_item',
        description: zh
          ? '在某项目记一笔流水：sectionId 来自 list_sections、isIncome 为方向（true=收入）、amount 为正数金额、reason 为事由。调用前与用户确认这四项；缺项或含糊先问，不假设。'
          : 'Record a transaction under a section: sectionId from list_sections, isIncome is the direction (true=income), amount is a positive number, reason is the description. Confirm all four fields first; if any is missing or ambiguous, ask — never assume.',
        parameters: toToolJsonSchema(addItemArgsSchema),
      },
    },
  ];
}
