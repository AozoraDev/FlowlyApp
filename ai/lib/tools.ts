import { z } from 'zod';

import { getSectionSummaries, listItems } from '@/supabase/items';
import { listSections } from '@/supabase/sections';
import type { ChatTool } from './chat';

// ============================================================
// AI-Agent 工具定义：查询用户真实账目（sections / items），只读。
// 参数 schema 是运行时校验的唯一来源（zod），同时经 toJSONSchema 派生成发给模型的
// parameters（JSON Schema）。注意两点：
//  1) 一律用 .optional() 而非 .default()——zod 的 .default() 会把字段塞进 required；
//  2) toJSONSchema 产物含 $schema / additionalProperties:false，部分端点会 reject，需 sanitize。
// ============================================================

const listSectionsArgsSchema = z.object({});
const accountSummariesArgsSchema = z.object({});
// 导出供测试断言 schema 行为（optional 字段不进 required 等）
export const listItemsArgsSchema = z.object({
  sectionId: z.number().int().min(1),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

// 递归剔除 JSON Schema 中可能被 OpenAI 兼容端点拒绝的关键字
export function sanitizeJsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeJsonSchema);
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === '$schema' || k === 'additionalProperties' || k === 'default') continue;
      out[k] = sanitizeJsonSchema(v);
    }
    return out;
  }
  return node;
}

/** zod schema → 可发给模型的干净 JSON Schema（剔除 $schema/additionalProperties/default） */
export function toToolJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return sanitizeJsonSchema(schema.toJSONSchema()) as Record<string, unknown>;
}

type ToolDef = {
  paramsSchema: z.ZodType;
  run: (args: unknown, ctx: { userId: string }) => Promise<string>;
};

/** 列出用户全部项目：id + 名称 + 选中态（供模型确定有哪些项目、拿 sectionId） */
async function runListSections(_args: unknown, { userId }: { userId: string }): Promise<string> {
  const page = await listSections(userId, 1, 100);
  return JSON.stringify({
    ok: true,
    total: page.total,
    sections: page.sections.map((s) => ({ id: s.id, name: s.describe, selected: s.selected })),
  });
}

/** 各项目收支结余 + 合计：复用服务端聚合 RPC，客户端补项目名并求和，返回紧凑 JSON 给模型 */
async function runAccountSummaries(
  _args: unknown,
  { userId }: { userId: string }
): Promise<string> {
  const [summaries, sectionsPage] = await Promise.all([
    getSectionSummaries(userId),
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

/** 查询某项目下的流水明细：args 在 runTool 已按 schema 校验过，这里再 parse 拿类型贯穿 */
async function runListItems(args: unknown, { userId }: { userId: string }): Promise<string> {
  const { sectionId, page = 1, pageSize = 20 } = listItemsArgsSchema.parse(args);
  const res = await listItems(userId, sectionId, page, pageSize);
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

const REGISTRY: Record<string, ToolDef> = {
  list_sections: { paramsSchema: listSectionsArgsSchema, run: runListSections },
  get_account_summaries: { paramsSchema: accountSummariesArgsSchema, run: runAccountSummaries },
  list_items: { paramsSchema: listItemsArgsSchema, run: runListItems },
};

/**
 * 执行一次工具调用：返回紧凑 JSON 字符串（成功 {ok:true,...} / 失败 {ok:false,error}）。
 * 任何异常（参数非法、查询失败）都转成错误串交给模型自愈，绝不向外抛出——保证 agent 循环存活。
 */
export async function runTool(name: string, argsJson: string, userId: string): Promise<string> {
  const def = REGISTRY[name];
  if (!def) return JSON.stringify({ ok: false, error: `unknown tool: ${name}` });
  try {
    // 无参工具模型常发 arguments: ""，空串兼容为 {}；其余 JSON.parse 失败走 catch
    const args = argsJson.trim() ? JSON.parse(argsJson) : {};
    return await def.run(args, { userId });
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
        name: 'list_sections',
        description: zh
          ? '列出用户的全部项目（账目分区），含 id、名称、选中态。当用户提到某个项目但你不确定有哪些、或需要项目 id 时调用。'
          : "List all of the user's sections (ledger divisions) with id, name and selected state. Call when you need section ids or the user refers to an unknown section.",
        parameters: toToolJsonSchema(listSectionsArgsSchema),
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_account_summaries',
        description: zh
          ? '查询用户全部项目的收支汇总（每个项目的收入/支出/结余）以及全部项目合计。当用户问整体收支、花费分布、结余、某段时期总体情况时调用。'
          : 'Query income/expense/balance per section plus a grand total. Call for overall spending, balances, or per-section summaries.',
        parameters: toToolJsonSchema(accountSummariesArgsSchema),
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_items',
        description: zh
          ? '查询某项目下的流水明细（金额、收支类型、备注、时间）。参数 sectionId 来自 list_sections 或 get_account_summaries；page/pageSize 可选（默认第 1 页 20 条）。'
          : 'Query the transaction items of one section (amount, income/expense, reason, time). sectionId comes from list_sections or get_account_summaries; page/pageSize optional (default 1/20).',
        parameters: toToolJsonSchema(listItemsArgsSchema),
      },
    },
  ];
}
