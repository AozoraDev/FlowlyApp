import { describe, expect, it } from 'vitest';

import { parseA2uiBlocks, type A2uiNode } from './a2ui';

// 拼接一段带 a2ui 围栏块的内容：围栏内为 JSON.stringify 序列化的节点（含标签写法，故放宽为 unknown）
function wrapFence(node: unknown, before = '先说一句：\n', after = '\n以上就是结论。'): string {
  return `${before}\`\`\`a2ui\n${JSON.stringify(node)}\n\`\`\`${after}`;
}

describe('parseA2uiBlocks', () => {
  it('无 a2ui 块时返回单个文本段，内容原样保留', () => {
    const content = '你这个月总共花了 1280.5 元。';
    const segments = parseA2uiBlocks(content);
    expect(segments).toEqual([{ kind: 'text', text: content }]);
  });

  it('单个合法 App 块：切出 ui 段，块间文本按序保留', () => {
    const app: A2uiNode = {
      type: 'App',
      children: [{ type: 'StatCard', title: '本月总支出', value: '1280.50' }],
    };
    const segments = parseA2uiBlocks(wrapFence(app));
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ kind: 'text', text: '先说一句：\n' });
    expect(segments[1]).toEqual({ kind: 'ui', ui: app });
    expect(segments[2]).toEqual({ kind: 'text', text: '\n以上就是结论。' });
  });

  it('连续多个块：交替切分，ui 段可有多段', () => {
    const stat: A2uiNode = { type: 'Stat', label: '结余', value: 800 };
    const grid: A2uiNode = {
      type: 'DataGrid',
      title: '各项目收支结余',
      data: {
        columns: [
          { name: 'name', data_type: 'string', display_name: '项目' },
          { name: 'balance', data_type: 'number', display_name: '结余' },
        ],
        rows: [{ values: { name: '日常', balance: 800 } }],
      },
    };
    const content = `${wrapFence(stat, '', '')}\n${wrapFence(grid, '', '')}`;
    const segments = parseA2uiBlocks(content);
    expect(segments.filter((s) => s.kind === 'ui')).toHaveLength(2);
  });

  it('DataGrid 单元格接受纯数字输入并保留数值', () => {
    const app: A2uiNode = {
      type: 'App',
      children: [
        {
          type: 'DataGrid',
          data: {
            columns: [{ name: 'amount', data_type: 'number' }],
            rows: [{ values: { amount: 1234.5 } }],
          },
        },
      ],
    };
    const segments = parseA2uiBlocks(wrapFence(app));
    const ui = segments.find((s) => s.kind === 'ui');
    expect(ui?.kind === 'ui').toBe(true);
    if (ui?.kind === 'ui' && ui.ui.type === 'App') {
      const grid = ui.ui.children[0];
      expect(grid.type).toBe('DataGrid');
      if (grid.type === 'DataGrid') {
        expect(grid.data.rows[0].values.amount).toBe(1234.5);
      }
    }
  });

  it('嵌套 Section：children 递归解析', () => {
    const app: A2uiNode = {
      type: 'App',
      children: [
        {
          type: 'Section',
          title: '本月汇总',
          children: [{ type: 'Stat', label: '收入', value: 200 }],
        },
      ],
    };
    const segments = parseA2uiBlocks(wrapFence(app));
    expect(segments.find((s) => s.kind === 'ui')).toBeDefined();
  });

  it('兼容「键名即组件类型」的标签写法：{ "App": {...} } 归一化后渲染', () => {
    const content = wrapFence({
      App: {
        title: '本月账目',
        children: [
          { StatCard: { title: '本月总支出', value: '1280.50' } },
          {
            DataGrid: {
              title: '各项目收支结余',
              data: {
                columns: [
                  { name: 'name', data_type: 'string', display_name: '项目' },
                  { name: 'balance', data_type: 'number', display_name: '结余' },
                ],
                rows: [{ values: { name: '日常', balance: '800.00' } }],
              },
            },
          },
        ],
      },
    });
    const segments = parseA2uiBlocks(content);
    const ui = segments.find((s) => s.kind === 'ui');
    expect(ui?.kind === 'ui').toBe(true);
    if (ui?.kind === 'ui' && ui.ui.type === 'App') {
      expect(ui.ui.children).toHaveLength(2);
      expect(ui.ui.children[0]).toMatchObject({
        type: 'StatCard',
        title: '本月总支出',
        value: '1280.50',
      });
      expect(ui.ui.children[1].type).toBe('DataGrid');
    }
  });

  it('标签写法支持嵌套 Section 与官方 components 字段名', () => {
    const content = wrapFence({
      App: {
        components: [
          { Section: { title: '本月汇总', children: [{ Stat: { label: '收入', value: 200 } }] } },
        ],
      },
    });
    const segments = parseA2uiBlocks(content);
    const ui = segments.find((s) => s.kind === 'ui');
    expect(ui?.kind === 'ui').toBe(true);
    if (ui?.kind === 'ui' && ui.ui.type === 'App') {
      expect(ui.ui.children[0].type).toBe('Section');
    }
  });

  it('标签写法不误伤 DataGrid 行 values：单键列名与组件同名但值为原始类型时不做转换', () => {
    const content = wrapFence({
      DataGrid: {
        title: '明细',
        data: {
          columns: [{ name: 'App', data_type: 'string' }],
          rows: [{ values: { App: '软件订阅' } }],
        },
      },
    });
    const segments = parseA2uiBlocks(content);
    expect(segments.find((s) => s.kind === 'ui')).toBeDefined();
  });

  it('DataGrid 行平铺写法：{列名: 值} 直接归并进 values 渲染', () => {
    const content = wrapFence({
      App: {
        children: [
          {
            DataGrid: {
              title: '各项目收支结余',
              data: {
                columns: [
                  { name: 'name', display_name: '项目' },
                  { name: 'balance', display_name: '结余' },
                ],
                rows: [
                  { name: '日常', balance: '800.00' },
                  { name: '餐饮', balance: '-120.00' },
                ],
              },
            },
          },
        ],
      },
    });
    const segments = parseA2uiBlocks(content);
    const ui = segments.find((s) => s.kind === 'ui');
    expect(ui?.kind === 'ui').toBe(true);
    if (ui?.kind === 'ui' && ui.ui.type === 'App' && ui.ui.children[0].type === 'DataGrid') {
      expect(ui.ui.children[0].data.rows[0].values).toEqual({ name: '日常', balance: '800.00' });
      expect(ui.ui.children[0].data.rows[1].values).toEqual({ name: '餐饮', balance: '-120.00' });
    }
  });

  it('块内是非法 JSON：整块按文本保留，不丢信息', () => {
    const content = '```a2ui\n{ not json\n```';
    const segments = parseA2uiBlocks(content);
    expect(segments).toEqual([{ kind: 'text', text: content }]);
  });

  it('JSON 合法但含未知组件 type：整块按文本保留（降级）', () => {
    const content = '```a2ui\n{"type":"SparkLine","data":[1,2,3]}\n```';
    const segments = parseA2uiBlocks(content);
    expect(segments).toEqual([{ kind: 'text', text: content }]);
  });

  it('围栏格式容错：允许无换行、块前后带空白', () => {
    const stat: A2uiNode = { type: 'Stat', label: '支出', value: 10 };
    const content = '```a2ui ' + JSON.stringify(stat) + ' ```';
    const segments = parseA2uiBlocks(content);
    expect(segments.find((s) => s.kind === 'ui')).toBeDefined();
  });
});
