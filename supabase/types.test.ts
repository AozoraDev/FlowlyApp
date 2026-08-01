import { describe, expect, it } from 'vitest';
import {
  itemInsertSchema,
  itemSchema,
  itemsPageSchema,
  profileSchema,
  sectionInsertSchema,
  sectionSchema,
  sectionSummaryRowSchema,
  sectionSummarySchema,
  sectionsPageSchema,
} from './types';

const uuid = '123e4567-e89b-12d3-a456-426614174000';

// 构造一个合法的 itemInsert 输入，各测试在其上局部改动
const validItemInsert = {
  uid: uuid,
  section_id: 1,
  isIncome: true,
  number: 12.5,
  reason: '午餐',
};

// 合法的完整 items 行（服务端返回形态，number 常为字符串）
const validItemRow = {
  id: 1,
  uid: uuid,
  section_id: 1,
  isIncome: true,
  number: '12.5',
  reason: '午餐',
  created_at: '2026-08-02T12:00:00Z',
};

describe('itemInsertSchema', () => {
  it('合法输入通过，reason 会 trim', () => {
    const result = itemInsertSchema.parse({ ...validItemInsert, reason: '  午餐  ' });
    expect(result.number).toBe(12.5);
    expect(result.reason).toBe('午餐');
  });

  it('金额支持字符串输入（表单/PostgREST）并转 number', () => {
    const result = itemInsertSchema.parse({ ...validItemInsert, number: '88.6' });
    expect(result.number).toBe(88.6);
  });

  it('金额必须为正数，拒绝 0/负数/非数字', () => {
    for (const bad of [0, -1, 'abc', NaN]) {
      expect(() => itemInsertSchema.parse({ ...validItemInsert, number: bad })).toThrow();
    }
  });

  it('reason 为空报 home.reasonRequired 错误 key', () => {
    const result = itemInsertSchema.safeParse({ ...validItemInsert, reason: '   ' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe('home.reasonRequired');
  });

  it('reason 超 50 字报 home.reasonTooLong 错误 key', () => {
    const result = itemInsertSchema.safeParse({ ...validItemInsert, reason: '长'.repeat(51) });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe('home.reasonTooLong');
  });

  it('uid 非法 UUID 被拒绝', () => {
    expect(itemInsertSchema.safeParse({ ...validItemInsert, uid: 'not-a-uuid' }).success).toBe(
      false
    );
  });
});

describe('sectionInsertSchema', () => {
  it('describe 会 trim 且必填', () => {
    const ok = sectionInsertSchema.safeParse({ describe: '  日常  ', uid: uuid });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.describe).toBe('日常');

    const empty = sectionInsertSchema.safeParse({ describe: ' ', uid: uuid });
    expect(empty.success).toBe(false);
    if (!empty.success) expect(empty.error.issues[0].message).toBe('home.nameRequired');
  });

  it('describe 超 20 字报 home.nameTooLong', () => {
    const result = sectionInsertSchema.safeParse({ describe: '长'.repeat(21), uid: uuid });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe('home.nameTooLong');
  });
});

describe('itemSchema（边界解析）', () => {
  it('PostgREST 返回字符串金额时 coerce 为 number', () => {
    const row = itemSchema.parse(validItemRow);
    expect(row.number).toBe(12.5);
  });

  it('脏数据（非法 uid）在边界被拦下', () => {
    expect(() => itemSchema.parse({ ...validItemRow, uid: 'bad' })).toThrow();
  });
});

describe('sectionSchema', () => {
  it('解析合法行', () => {
    const row = sectionSchema.parse({
      id: 1,
      describe: '日常',
      uid: uuid,
      selected: true,
      created_at: '2026-08-02T12:00:00Z',
    });
    expect(row.selected).toBe(true);
  });
});

describe('汇总 schema（RPC 字符串数值 coerce）', () => {
  it('sectionSummarySchema 把字符串数值转 number', () => {
    const summary = sectionSummarySchema.parse({ income: '100.5', expense: '20', balance: '80.5' });
    expect(summary).toEqual({ income: 100.5, expense: 20, balance: 80.5 });
  });

  it('sectionSummaryRowSchema 额外带 section_id', () => {
    const row = sectionSummaryRowSchema.parse({
      section_id: 3,
      income: '1',
      expense: '0',
      balance: '1',
    });
    expect(row.section_id).toBe(3);
    expect(row.balance).toBe(1);
  });
});

describe('分页 schema', () => {
  it('itemsPageSchema 解析一页明细与总数', () => {
    const page = itemsPageSchema.parse({ items: [validItemRow], total: 1 });
    expect(page.total).toBe(1);
    expect(page.items[0].number).toBe(12.5);
  });

  it('total 为负时报错', () => {
    expect(() => itemsPageSchema.parse({ items: [], total: -1 })).toThrow();
  });

  it('sectionsPageSchema 解析一页项目与总数', () => {
    const page = sectionsPageSchema.parse({
      sections: [
        { id: 1, describe: '日常', uid: uuid, selected: false, created_at: '2026-08-02T12:00:00Z' },
      ],
      total: 1,
    });
    expect(page.total).toBe(1);
  });
});

describe('profileSchema', () => {
  it('username 非法字符被拒绝', () => {
    const result = profileSchema.safeParse({
      id: uuid,
      username: 'bad name',
      avatar_url: null,
      bio: null,
      created_at: '2026-08-02T12:00:00Z',
      updated_at: '2026-08-02T12:00:00Z',
    });
    expect(result.success).toBe(false);
  });
});
