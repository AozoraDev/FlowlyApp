import { z } from 'zod';

import type { A2uiApp } from './a2ui';

// ============================================================
// 汇总卡片代码预设：get_account_summaries 返回的 total/rows 由代码确定性拼成 A2UI 块
// （三张 StatCard + 各项目收支结余表），模型不参与生成，杜绝漏卡/算错/时有时无。
// 只在 agent 汇总注入分支 import；卡面文案随界面语言，数值两位小数精确到分。
// ============================================================

// 汇总工具结果边界解析：ok:true 时才有 rows/total（字段与 tools.ts runAccountSummaries 输出对齐）；
// ok:false（查询失败）解析失败，调用方据此不生成卡片
export const accountSummaryResultSchema = z.object({
  ok: z.literal(true),
  rows: z.array(
    z.object({
      sectionId: z.number(),
      name: z.string(),
      income: z.number(),
      expense: z.number(),
      balance: z.number(),
    })
  ),
  total: z.object({ income: z.number(), expense: z.number(), balance: z.number() }),
});
export type AccountSummaryResult = z.infer<typeof accountSummaryResultSchema>;

// 卡面文案随界面语言（zh/en），与 A2UI 规范「卡片文案跟随用户语言」一致；数据值原样不翻译
const LABELS = {
  zh: {
    totalIncome: '总收入',
    totalExpense: '总支出',
    totalBalance: '总计',
    gridTitle: '各项目收支结余',
    colName: '项目',
    colIncome: '收入',
    colExpense: '支出',
    colBalance: '结余',
  },
  en: {
    totalIncome: 'Total income',
    totalExpense: 'Total expense',
    totalBalance: 'Total balance',
    gridTitle: 'Per-section summary',
    colName: 'Section',
    colIncome: 'Income',
    colExpense: 'Expense',
    colBalance: 'Balance',
  },
} as const;

/** 金额保留两位小数（精确到分），避免浮点长尾噪音 */
function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/**
 * 把 get_account_summaries 结果拼成 A2UI App 块：三张彩色 StatCard（总收入/总支出/总计）+
 * 各项目收支结余 DataGrid。表内支出以负号展示（收入正/支出负的既有约定，随正负号着色），
 * 卡片上的总支出显示正数、靠标题关键词着色；数值直接抄工具返回，不经过模型重算。
 */
export function buildSummaryApp(result: AccountSummaryResult, language: string): A2uiApp {
  const zh = language.toLowerCase().startsWith('zh');
  const L = zh ? LABELS.zh : LABELS.en;
  return {
    type: 'App',
    children: [
      { type: 'StatCard', title: L.totalIncome, value: fmt(result.total.income) },
      { type: 'StatCard', title: L.totalExpense, value: fmt(result.total.expense) },
      { type: 'StatCard', title: L.totalBalance, value: fmt(result.total.balance) },
      {
        type: 'DataGrid',
        title: L.gridTitle,
        data: {
          columns: [
            { name: 'name', data_type: 'string', display_name: L.colName },
            { name: 'income', data_type: 'number', display_name: L.colIncome },
            { name: 'expense', data_type: 'number', display_name: L.colExpense },
            { name: 'balance', data_type: 'number', display_name: L.colBalance },
          ],
          rows: result.rows.map((r) => ({
            values: {
              name: r.name,
              income: fmt(r.income),
              expense: fmt(-r.expense),
              balance: fmt(r.balance),
            },
          })),
        },
      },
    ],
  };
}
