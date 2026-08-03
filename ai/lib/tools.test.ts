import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSectionSummaries, listItems } from '@/supabase/items';
import { listSections } from '@/supabase/sections';
import { runTool, sanitizeJsonSchema, toToolJsonSchema, listItemsArgsSchema } from './tools';

// 工具 executor 只依赖 supabase 查询函数，mock 掉即可测 runTool 的校验与格式化逻辑
vi.mock('@/supabase/sections', () => ({ listSections: vi.fn() }));
vi.mock('@/supabase/items', () => ({ listItems: vi.fn(), getSectionSummaries: vi.fn() }));

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
  it('递归剔除 $schema / additionalProperties / default', () => {
    const input = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        page: { type: 'integer', default: 1 },
        nested: { items: { additionalProperties: false } },
      },
      additionalProperties: false,
    };
    expect(sanitizeJsonSchema(input)).toEqual({
      type: 'object',
      properties: { page: { type: 'integer' }, nested: { items: {} } },
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

  it('list_items：默认 page=1 / pageSize=20', async () => {
    vi.mocked(listItems).mockResolvedValue({ items: itemRows, total: 2 });
    const result = JSON.parse(await runTool('list_items', '{"sectionId":3}', uid));
    expect(result.ok).toBe(true);
    expect(listItems).toHaveBeenCalledWith(uid, 3, 1, 20);
    expect(result.items[0]).toEqual({
      id: 1,
      isIncome: false,
      amount: 25,
      reason: '打车',
      createdAt: '2026-08-02T12:00:00Z',
    });
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
