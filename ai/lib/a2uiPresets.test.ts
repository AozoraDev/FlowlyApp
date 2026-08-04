import { describe, expect, it } from 'vitest';

import { parseA2uiBlocks } from './a2ui';
import {
  accountSummaryResultSchema,
  buildSummaryApp,
  type AccountSummaryResult,
} from './a2uiPresets';

// 与 tools.ts runAccountSummaries 输出对齐的样例：两项目 + 合计；
// 显式标注 AccountSummaryResult 让 ok 收窄为 true（对象字面量默认会拓宽成 boolean）
const sample: AccountSummaryResult = {
  ok: true,
  rows: [
    { sectionId: 1, name: '日常', income: 300, expense: 1280.5, balance: -980.5 },
    { sectionId: 2, name: '旅行', income: 200, expense: 0, balance: 200 },
  ],
  total: { income: 500, expense: 1280.5, balance: -780.5 },
};

describe('accountSummaryResultSchema', () => {
  it('解析工具返回的汇总结果（rows + total）', () => {
    expect(accountSummaryResultSchema.safeParse(sample).success).toBe(true);
  });

  it('查询失败（ok:false）解析失败，调用方据此不生成卡片', () => {
    expect(accountSummaryResultSchema.safeParse({ ok: false, error: 'boom' }).success).toBe(false);
  });
});

describe('buildSummaryApp', () => {
  it('中文：三张 StatCard + 各项目表，数值两位小数，表内支出负号', () => {
    const app = buildSummaryApp(sample, 'zh');
    expect(app.type).toBe('App');
    const cards = app.children.filter((c) => c.type === 'StatCard');
    expect(cards).toHaveLength(3);
    expect(cards).toMatchObject([
      { type: 'StatCard', title: '总收入', value: '500.00' },
      { type: 'StatCard', title: '总支出', value: '1280.50' },
      { type: 'StatCard', title: '总计', value: '-780.50' },
    ]);
    const grid = app.children.find((c) => c.type === 'DataGrid');
    expect(grid).toBeDefined();
    if (grid?.type === 'DataGrid') {
      expect(grid.data.columns.map((c) => c.display_name)).toEqual([
        '项目',
        '收入',
        '支出',
        '结余',
      ]);
      expect(grid.data.rows[0].values).toEqual({
        name: '日常',
        income: '300.00',
        expense: '-1280.50',
        balance: '-980.50',
      });
      expect(grid.data.rows[1].values).toEqual({
        name: '旅行',
        income: '200.00',
        expense: '0.00',
        balance: '200.00',
      });
    }
  });

  it('英文：卡面/列名随语言，无中文字例', () => {
    // 数据值（项目名）原样不翻译，故样例用英文项目名才能断言卡面纯英文
    const enSample = {
      ...sample,
      rows: sample.rows.map((r) => ({ ...r, name: r.name === '日常' ? 'Daily' : 'Travel' })),
    };
    const app = buildSummaryApp(enSample, 'en');
    const cards = app.children.filter((c) => c.type === 'StatCard');
    expect(cards).toMatchObject([
      { type: 'StatCard', title: 'Total income', value: '500.00' },
      { type: 'StatCard', title: 'Total expense', value: '1280.50' },
      { type: 'StatCard', title: 'Total balance', value: '-780.50' },
    ]);
    const json = JSON.stringify(app);
    expect(json).not.toMatch(/[一-鿿]/);
  });

  it('生成的块经 JSON 序列化后可被 parseA2uiBlocks 解析回 App', () => {
    const content = `\`\`\`a2ui\n${JSON.stringify(buildSummaryApp(sample, 'zh'))}\n\`\`\``;
    const segments = parseA2uiBlocks(content);
    const ui = segments.find((s) => s.kind === 'ui');
    expect(ui?.kind === 'ui').toBe(true);
    if (ui?.kind === 'ui') expect(ui.ui.type).toBe('App');
  });
});
