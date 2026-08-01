import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/supabase/client';
import { mockClient, mockQuery } from '@/test/supabaseMock';
import {
  createSection,
  deleteSectionWithItems,
  listSections,
  updateSectionSelected,
} from './sections';

// 整个模块替换成可编程 mock，避免加载真实 client（其内部依赖 RN 存储）
vi.mock('@/supabase/client', () => ({ supabase: vi.fn() }));

const uuid = '123e4567-e89b-12d3-a456-426614174000';

const sectionRow = {
  id: 1,
  describe: '日常',
  uid: uuid,
  selected: false,
  created_at: '2026-08-02T12:00:00Z',
};

// 获取 from() 最后一次调用返回的 query builder，便于断言链式方法
function lastQuery(client: any) {
  return client.from.mock.results.at(-1).value;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createSection', () => {
  it('插入前经 Zod 校验，链式调用 insert/select/single 并返回解析后的行', async () => {
    const client = mockClient();
    vi.mocked(supabase).mockResolvedValue(client);
    client.from.mockReturnValue(mockQuery({ data: sectionRow, error: null }));

    const res = await createSection({ describe: '日常', uid: uuid });

    expect(client.from).toHaveBeenCalledWith('sections');
    const q = lastQuery(client);
    expect(q.insert).toHaveBeenCalledWith({ describe: '日常', uid: uuid });
    expect(q.select).toHaveBeenCalled();
    expect(q.single).toHaveBeenCalled();
    expect(res).toEqual(sectionRow);
  });

  it('输入非法时直接抛错，不发起请求', async () => {
    const client = mockClient();
    vi.mocked(supabase).mockResolvedValue(client);

    await expect(createSection({ describe: '', uid: uuid })).rejects.toThrow();
    expect(client.from).not.toHaveBeenCalled();
  });

  it('Supabase 错误原样抛出', async () => {
    const client = mockClient();
    vi.mocked(supabase).mockResolvedValue(client);
    client.from.mockReturnValue(mockQuery({ data: null, error: new Error('db down') }));

    await expect(createSection({ describe: '日常', uid: uuid })).rejects.toThrow('db down');
  });
});

describe('listSections', () => {
  it('按 uid 过滤、创建时间倒序、range 分页', async () => {
    const client = mockClient();
    vi.mocked(supabase).mockResolvedValue(client);
    client.from.mockReturnValue(mockQuery({ data: [sectionRow], error: null, count: 2 }));

    const res = await listSections(uuid, 2, 10);

    expect(client.from).toHaveBeenCalledWith('sections');
    const q = lastQuery(client);
    expect(q.select).toHaveBeenCalledWith('*', { count: 'exact' });
    expect(q.eq).toHaveBeenCalledWith('uid', uuid);
    expect(q.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(q.range).toHaveBeenCalledWith(10, 19); // 第 2 页 size 10
    expect(res.total).toBe(2);
  });

  it('响应含脏数据时在边界抛错（parse 生效）', async () => {
    const client = mockClient();
    vi.mocked(supabase).mockResolvedValue(client);
    client.from.mockReturnValue(
      mockQuery({ data: [{ ...sectionRow, uid: 'bad' }], error: null, count: 1 })
    );

    await expect(listSections(uuid, 1, 10)).rejects.toThrow();
  });
});

describe('updateSectionSelected', () => {
  it('按 id 更新 selected 并返回新行', async () => {
    const client = mockClient();
    vi.mocked(supabase).mockResolvedValue(client);
    client.from.mockReturnValue(
      mockQuery({ data: { ...sectionRow, selected: true }, error: null })
    );

    const res = await updateSectionSelected(1, true);

    const q = lastQuery(client);
    expect(q.update).toHaveBeenCalledWith({ selected: true });
    expect(q.eq).toHaveBeenCalledWith('id', 1);
    expect(res.selected).toBe(true);
  });
});

describe('deleteSectionWithItems', () => {
  it('先删 items 再删 sections，避免残留孤儿数据', async () => {
    const client = mockClient();
    vi.mocked(supabase).mockResolvedValue(client);
    client.from.mockReturnValue(mockQuery({ data: null, error: null }));

    await deleteSectionWithItems(7);

    expect(client.from).toHaveBeenNthCalledWith(1, 'items');
    expect(client.from).toHaveBeenNthCalledWith(2, 'sections');
    const itemsQ = client.from.mock.results[0].value;
    const sectionsQ = client.from.mock.results[1].value;
    expect(itemsQ.delete).toHaveBeenCalled();
    expect(itemsQ.eq).toHaveBeenCalledWith('section_id', 7);
    expect(sectionsQ.delete).toHaveBeenCalled();
    expect(sectionsQ.eq).toHaveBeenCalledWith('id', 7);
  });
});
