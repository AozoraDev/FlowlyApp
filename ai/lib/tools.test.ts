import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createItem, getSectionSummaries, listItems } from '@/supabase/items';
import { createSection, listSections } from '@/supabase/sections';
import {
  HELP_CONTENT,
  addItemArgsSchema,
  createSectionArgsSchema,
  isHelpTool,
  isWriteTool,
  listItemsArgsSchema,
  runTool,
  sanitizeJsonSchema,
  toToolJsonSchema,
} from './tools';

// 工具 executor 只依赖 supabase 查询函数，mock 掉即可测 runTool 的校验与格式化逻辑
vi.mock('@/supabase/sections', () => ({ listSections: vi.fn(), createSection: vi.fn() }));
vi.mock('@/supabase/items', () => ({
  listItems: vi.fn(),
  getSectionSummaries: vi.fn(),
  createItem: vi.fn(),
}));

const uid = '123e4567-e89b-12d3-a456-426614174000';

const sectionRows = [
  { id: 1, describe: '日常', selected: true, uid, created_at: '2026-08-01T00:00:00Z' },
  { id: 2, describe: '旅行', selected: false, uid, created_at: '2026-08-02T00:00:00Z' },
];

const itemRows = [
  {
    id: 1,
    uid,
    section_id: 3,
    isIncome: false,
    number: 25,
    reason: '打车',
    created_at: '2026-08-02T12:00:00Z',
  },
  {
    id: 2,
    uid,
    section_id: 3,
    isIncome: true,
    number: 100,
    reason: '报销',
    created_at: '2026-08-01T12:00:00Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sanitizeJsonSchema', () => {
  it('递归剔除 $schema / additionalProperties / default / pattern', () => {
    const input = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        page: { type: 'integer', default: 1 },
        from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        nested: { items: { additionalProperties: false } },
      },
      additionalProperties: false,
    };
    expect(sanitizeJsonSchema(input)).toEqual({
      type: 'object',
      properties: {
        page: { type: 'integer' },
        from: { type: 'string' },
        nested: { items: {} },
      },
    });
  });
});

describe('toToolJsonSchema', () => {
  it('产物干净且 optional 字段不进 required', () => {
    const schema = toToolJsonSchema(listItemsArgsSchema);
    expect(schema).not.toHaveProperty('$schema');
    expect(schema).not.toHaveProperty('additionalProperties');
    // sectionId 必填、page/pageSize 可选（required 只含 sectionId）；default 关键字已被剔除
    expect(schema.required).toEqual(['sectionId']);
    expect(JSON.stringify(schema)).not.toContain('default');
  });

  it('create_section / add_item 写入工具必填字段齐全', () => {
    expect(toToolJsonSchema(createSectionArgsSchema).required).toEqual(['name']);
    // add_item 四项缺一不可：模型在信息不全时必须先问用户，不允许拿缺字段的参数落库
    expect(toToolJsonSchema(addItemArgsSchema).required).toEqual([
      'sectionId',
      'isIncome',
      'amount',
      'reason',
    ]);
  });
});

describe('runTool', () => {
  it('list_sections：空参数兼容，按 (uid, 1, 100) 查询并返回紧凑 JSON', async () => {
    vi.mocked(listSections).mockResolvedValue({ sections: sectionRows, total: 2 });
    const result = JSON.parse(await runTool('list_sections', '', uid));
    expect(result.ok).toBe(true);
    expect(result.sections).toEqual([
      { id: 1, name: '日常', selected: true },
      { id: 2, name: '旅行', selected: false },
    ]);
    expect(listSections).toHaveBeenCalledWith(uid, 1, 100);
  });

  it('get_account_summaries：合并项目名并计算合计，金额保留两位小数', async () => {
    vi.mocked(getSectionSummaries).mockResolvedValue([
      { section_id: 1, income: 100.5, expense: 40.25, balance: 60.25 },
      { section_id: 2, income: 0, expense: 12.345, balance: -12.35 },
    ]);
    vi.mocked(listSections).mockResolvedValue({ sections: sectionRows, total: 2 });
    const result = JSON.parse(await runTool('get_account_summaries', '{}', uid));
    expect(result.ok).toBe(true);
    expect(result.rows[0]).toEqual({
      sectionId: 1,
      name: '日常',
      income: 100.5,
      expense: 40.25,
      balance: 60.25,
    });
    expect(result.rows[1].name).toBe('旅行');
    expect(result.total).toEqual({ income: 100.5, expense: 52.6, balance: 47.9 });
  });

  it('get_account_summaries：传 from/to 时按流水消费时间过滤，转 UTC 后透传 RPC', async () => {
    vi.mocked(getSectionSummaries).mockResolvedValue([
      { section_id: 1, income: 100, expense: 0, balance: 100 },
    ]);
    vi.mocked(listSections).mockResolvedValue({ sections: sectionRows, total: 2 });
    const result = JSON.parse(
      await runTool(
        'get_account_summaries',
        '{"from":"2026-08-01T00:00:00Z","to":"2026-09-01T00:00:00Z"}',
        uid
      )
    );
    expect(result.ok).toBe(true);
    expect(getSectionSummaries).toHaveBeenCalledWith(
      uid,
      '2026-08-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z'
    );
  });

  it('get_account_summaries：date-only from/to 按本地时区补 00:00 后转 UTC', async () => {
    vi.mocked(getSectionSummaries).mockResolvedValue([]);
    vi.mocked(listSections).mockResolvedValue({ sections: sectionRows, total: 2 });
    await runTool('get_account_summaries', '{"from":"2026-08-01","to":"2026-09-01"}', uid);
    // 与 toUtcIso 同一换算逻辑：date-only 在设备本地时区补 00:00，再转 UTC（跨时区机器也稳定通过）
    expect(getSectionSummaries).toHaveBeenCalledWith(
      uid,
      new Date('2026-08-01T00:00:00').toISOString(),
      new Date('2026-09-01T00:00:00').toISOString()
    );
  });

  it('get_account_summaries：非法 from 格式返回 {ok:false} 且不查询', async () => {
    const result = JSON.parse(await runTool('get_account_summaries', '{"from":"not-a-date"}', uid));
    expect(result.ok).toBe(false);
    expect(getSectionSummaries).not.toHaveBeenCalled();
  });

  it('list_items：默认 page=1 / pageSize=20', async () => {
    vi.mocked(listItems).mockResolvedValue({ items: itemRows, total: 2 });
    const result = JSON.parse(await runTool('list_items', '{"sectionId":3}', uid));
    expect(result.ok).toBe(true);
    expect(listItems).toHaveBeenCalledWith(uid, 3, 1, 20, undefined, undefined);
    expect(result.items[0]).toEqual({
      id: 1,
      isIncome: false,
      amount: 25,
      reason: '打车',
      createdAt: '2026-08-02T12:00:00Z',
    });
  });

  it('list_items：传 from/to 时透传时间范围（转 UTC），只按流水消费时间过滤', async () => {
    vi.mocked(listItems).mockResolvedValue({ items: itemRows, total: 2 });
    const result = JSON.parse(
      await runTool(
        'list_items',
        '{"sectionId":3,"from":"2026-08-01T00:00:00Z","to":"2026-09-01T00:00:00Z"}',
        uid
      )
    );
    expect(result.ok).toBe(true);
    expect(listItems).toHaveBeenCalledWith(
      uid,
      3,
      1,
      20,
      '2026-08-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z'
    );
  });

  it('list_items：缺 sectionId 参数非法 → 返回 {ok:false,error} 不抛出', async () => {
    const result = JSON.parse(await runTool('list_items', '{}', uid));
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(listItems).not.toHaveBeenCalled();
  });

  it('未知工具返回错误串', async () => {
    const result = JSON.parse(await runTool('nope', '{}', uid));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('unknown tool');
  });

  it('坏 JSON 返回错误串不抛出', async () => {
    const result = JSON.parse(await runTool('list_items', '{bad', uid));
    expect(result.ok).toBe(false);
  });

  it('executor 查询失败返回错误串不抛出', async () => {
    vi.mocked(listSections).mockRejectedValue(new Error('RLS denied'));
    const result = JSON.parse(await runTool('list_sections', '{}', uid));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('RLS denied');
  });
});

describe('create_section（写入）', () => {
  it('名称校验通过后按 (describe, uid) 落库并返回新项目', async () => {
    vi.mocked(createSection).mockResolvedValue({
      id: 5,
      describe: '旅行',
      uid,
      selected: false,
      created_at: '2026-08-03T00:00:00Z',
    });
    const result = JSON.parse(await runTool('create_section', '{"name":"旅行"}', uid));
    expect(result.ok).toBe(true);
    expect(result.section).toEqual({ id: 5, name: '旅行' });
    expect(createSection).toHaveBeenCalledWith({ describe: '旅行', uid });
  });

  it('名称缺失/超长 → 返回 {ok:false} 且不落库', async () => {
    const missing = JSON.parse(await runTool('create_section', '{}', uid));
    expect(missing.ok).toBe(false);
    const tooLong = JSON.parse(
      await runTool('create_section', '{"name":"一二三四五六七八九十一二三四五六七八九十一"}', uid)
    );
    expect(tooLong.ok).toBe(false);
    expect(createSection).not.toHaveBeenCalled();
  });
});

describe('add_item（写入）', () => {
  it('四项齐全时按 uid/section_id/isIncome/number/reason 落库并返回记录摘要', async () => {
    vi.mocked(createItem).mockResolvedValue({
      id: 9,
      uid,
      section_id: 1,
      isIncome: false,
      number: 28,
      reason: '咖啡',
      created_at: '2026-08-03T00:00:00Z',
    });
    const result = JSON.parse(
      await runTool('add_item', '{"sectionId":1,"isIncome":false,"amount":28,"reason":"咖啡"}', uid)
    );
    expect(result.ok).toBe(true);
    expect(result.item).toEqual({
      id: 9,
      sectionId: 1,
      isIncome: false,
      amount: 28,
      reason: '咖啡',
    });
    expect(createItem).toHaveBeenCalledWith({
      uid,
      section_id: 1,
      isIncome: false,
      number: 28,
      reason: '咖啡',
    });
  });

  it('金额字符串经 coerce 转 number（兼容模型输出 "42"）', async () => {
    vi.mocked(createItem).mockResolvedValue({
      id: 1,
      uid,
      section_id: 2,
      isIncome: true,
      number: 42,
      reason: '报销',
      created_at: '2026-08-03T00:00:00Z',
    });
    const result = JSON.parse(
      await runTool(
        'add_item',
        '{"sectionId":2,"isIncome":true,"amount":"42","reason":"报销"}',
        uid
      )
    );
    expect(createItem).toHaveBeenCalledWith({
      uid,
      section_id: 2,
      isIncome: true,
      number: 42,
      reason: '报销',
    });
    expect(result.item.amount).toBe(42);
  });

  it('缺 sectionId / 金额非正 → 返回 {ok:false} 且不落库', async () => {
    const missing = JSON.parse(
      await runTool('add_item', '{"isIncome":false,"amount":28,"reason":"咖啡"}', uid)
    );
    expect(missing.ok).toBe(false);
    const negative = JSON.parse(
      await runTool('add_item', '{"sectionId":1,"isIncome":false,"amount":-5,"reason":"咖啡"}', uid)
    );
    expect(negative.ok).toBe(false);
    expect(createItem).not.toHaveBeenCalled();
  });

  it('落库失败返回错误串不抛出', async () => {
    vi.mocked(createItem).mockRejectedValue(new Error('RLS denied'));
    const result = JSON.parse(
      await runTool('add_item', '{"sectionId":1,"isIncome":false,"amount":28,"reason":"咖啡"}', uid)
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('RLS denied');
  });
});

describe('get_help（帮助说明）', () => {
  it('未传语言时默认返回中文固定帮助说明', async () => {
    const result = JSON.parse(await runTool('get_help', '', uid));
    expect(result.ok).toBe(true);
    expect(result.help).toBe(HELP_CONTENT.zh.trim());
  });

  it('language=en 时返回英文帮助说明', async () => {
    const result = JSON.parse(await runTool('get_help', '', uid, 'en'));
    expect(result.ok).toBe(true);
    expect(result.help).toBe(HELP_CONTENT.en.trim());
  });

  it('language 传 zh-CN（带区域后缀）也命中中文', async () => {
    const result = JSON.parse(await runTool('get_help', '', uid, 'zh-CN'));
    expect(result.ok).toBe(true);
    expect(result.help).toBe(HELP_CONTENT.zh.trim());
  });
});

describe('isWriteTool / isHelpTool', () => {
  it('写入工具返回 true，读取/帮助/未知工具返回 false', () => {
    expect(isWriteTool('add_item')).toBe(true);
    expect(isWriteTool('create_section')).toBe(true);
    expect(isWriteTool('list_sections')).toBe(false);
    expect(isWriteTool('list_items')).toBe(false);
    expect(isWriteTool('get_help')).toBe(false);
    expect(isWriteTool('nope')).toBe(false);
  });

  it('仅 get_help 为帮助型工具', () => {
    expect(isHelpTool('get_help')).toBe(true);
    expect(isHelpTool('list_sections')).toBe(false);
    expect(isHelpTool('add_item')).toBe(false);
    expect(isHelpTool('nope')).toBe(false);
  });
});
