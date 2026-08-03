import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/supabase/client';
import { mockClient, mockQuery } from '@/test/supabaseMock';
import { createItem, deleteItem, getSectionSummaries, getSectionSummary, listItems } from './items';

vi.mock('@/supabase/client', () => ({ supabase: vi.fn() }));

const uuid = '123e4567-e89b-12d3-a456-426614174000';

const itemRow = {
  id: 1,
  uid: uuid,
  section_id: 1,
  isIncome: true,
  number: 12.5,
  reason: '工资',
  created_at: '2026-08-02T12:00:00Z',
};

function lastQuery(client: any) {
  return client.from.mock.results.at(-1).value;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createItem', () => {
  it('金额字符串经 Zod coerce 转 number 后再插入', async () => {
    const client = mockClient();
    vi.mocked(supabase).mockResolvedValue(client);
    client.from.mockReturnValue(mockQuery({ data: { ...itemRow, number: 42 }, error: null }));

    const res = await createItem({
      uid: uuid,
      section_id: 1,
      isIncome: true,
      number: '42',
      reason: '工资',
    });

    expect(client.from).toHaveBeenCalledWith('items');
    const q = lastQuery(client);
    expect(q.insert).toHaveBeenCalledWith({
      uid: uuid,
      section_id: 1,
      isIncome: true,
      number: 42,
      reason: '工资',
    });
    expect(res.number).toBe(42);
  });

  it('金额非正时直接抛错，不发起请求', async () => {
    const client = mockClient();
    vi.mocked(supabase).mockResolvedValue(client);

    await expect(
      createItem({ uid: uuid, section_id: 1, isIncome: true, number: -5, reason: 'x' })
    ).rejects.toThrow();
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe('listItems', () => {
  it('按 uid + section_id 双重过滤、倒序、分页', async () => {
    const client = mockClient();
    vi.mocked(supabase).mockResolvedValue(client);
    client.from.mockReturnValue(mockQuery({ data: [itemRow], error: null, count: 2 }));

    const res = await listItems(uuid, 9, 1, 20);

    const q = lastQuery(client);
    expect(q.eq).toHaveBeenNthCalledWith(1, 'uid', uuid);
    expect(q.eq).toHaveBeenNthCalledWith(2, 'section_id', 9);
    expect(q.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(q.range).toHaveBeenCalledWith(0, 19);
    expect(res.total).toBe(2);
  });

  it('响应含脏数据时在边界抛错', async () => {
    const client = mockClient();
    vi.mocked(supabase).mockResolvedValue(client);
    client.from.mockReturnValue(
      mockQuery({ data: [{ ...itemRow, uid: 'bad' }], error: null, count: 1 })
    );

    await expect(listItems(uuid, 1, 1, 20)).rejects.toThrow();
  });

  it('传 from/to 时按流水消费时间加 gte/lt 过滤（半开区间）', async () => {
    const client = mockClient();
    vi.mocked(supabase).mockResolvedValue(client);
    client.from.mockReturnValue(mockQuery({ data: [itemRow], error: null, count: 1 }));

    await listItems(uuid, 9, 1, 20, '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');

    const q = lastQuery(client);
    expect(q.gte).toHaveBeenCalledWith('created_at', '2026-08-01T00:00:00.000Z');
    expect(q.lt).toHaveBeenCalledWith('created_at', '2026-09-01T00:00:00.000Z');
    expect(q.eq).toHaveBeenCalledWith('uid', uuid);
    expect(q.eq).toHaveBeenCalledWith('section_id', 9);
  });
});

describe('汇总 RPC', () => {
  it('getSectionSummary 调用 RPC 并把字符串数值转 number', async () => {
    const client = mockClient();
    vi.mocked(supabase).mockResolvedValue(client);
    client.rpc.mockReturnValue(
      mockQuery({ data: { income: '10', expense: '4', balance: '6' }, error: null })
    );

    const res = await getSectionSummary(uuid, 3);

    expect(client.rpc).toHaveBeenCalledWith('get_section_summary', {
      p_uid: uuid,
      p_section_id: 3,
    });
    expect(res).toEqual({ income: 10, expense: 4, balance: 6 });
  });

  it('getSectionSummaries 批量 RPC 逐行解析', async () => {
    const client = mockClient();
    vi.mocked(supabase).mockResolvedValue(client);
    client.rpc.mockReturnValue(
      mockQuery({ data: [{ section_id: 1, income: '1', expense: '0', balance: '1' }], error: null })
    );

    const res = await getSectionSummaries(uuid);

    expect(client.rpc).toHaveBeenCalledWith('get_section_summaries', { p_uid: uuid });
    expect(res).toEqual([{ section_id: 1, income: 1, expense: 0, balance: 1 }]);
  });

  it('getSectionSummaries 带 from/to 时把时间范围传给 RPC（只按流水消费时间过滤）', async () => {
    const client = mockClient();
    vi.mocked(supabase).mockResolvedValue(client);
    client.rpc.mockReturnValue(mockQuery({ data: [], error: null }));

    await getSectionSummaries(uuid, '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');

    expect(client.rpc).toHaveBeenCalledWith('get_section_summaries', {
      p_uid: uuid,
      p_from: '2026-08-01T00:00:00.000Z',
      p_to: '2026-09-01T00:00:00.000Z',
    });
  });
});

describe('deleteItem', () => {
  it('按 id 定位删除', async () => {
    const client = mockClient();
    vi.mocked(supabase).mockResolvedValue(client);
    client.from.mockReturnValue(mockQuery({ data: null, error: null }));

    await deleteItem(11);

    const q = lastQuery(client);
    expect(q.delete).toHaveBeenCalled();
    expect(q.eq).toHaveBeenCalledWith('id', 11);
  });
});
