import { describe, expect, it } from 'vitest';
import { currencyPrefix, formatDate } from './format';

describe('formatDate', () => {
  // 用 UTC 中午时刻，避免各时区因跨日导致断言不稳定
  const iso = '2026-08-02T12:00:00Z';

  it('zh 语言走 zh-CN 本地化格式', () => {
    expect(formatDate(iso, 'zh')).toBe('2026/8/2');
    expect(formatDate(iso, 'zh-CN')).toBe('2026/8/2');
  });

  it('非 zh 语言走 en-US 本地化格式', () => {
    expect(formatDate(iso, 'en')).toBe('8/2/2026');
  });
});

describe('currencyPrefix', () => {
  it('收入为 + 号前缀', () => {
    expect(currencyPrefix(true)).toBe('+￥');
  });

  it('支出为 - 号前缀', () => {
    expect(currencyPrefix(false)).toBe('-￥');
  });
});
