import { vi } from 'vitest';

export type QueryResult = { data: unknown; error: null | Error; count?: number };

// 构造可链式调用的 query builder mock：每个方法都是 vi.fn 且返回自身，
// 对象自身携带 data/error/count，链尾 await 后即得到最终结果。
// 方法名需覆盖 sections.ts / items.ts 中用到的全部链式操作。
export function mockQuery(result: QueryResult) {
  const q: Record<string, any> = { ...result };
  for (const method of [
    'select',
    'eq',
    'gte',
    'lt',
    'order',
    'range',
    'insert',
    'update',
    'delete',
    'single',
  ]) {
    q[method] = vi.fn().mockReturnValue(q);
  }
  return q;
}

// 构造 mock client：from/rpc 均为 vi.fn，测试中按需 mockReturnValue(mockQuery(...))
// 返回 any 是测试专用的宽容写法，避免逐项对齐 SupabaseClient 庞大类型
export function mockClient() {
  return { from: vi.fn(), rpc: vi.fn() } as any;
}
