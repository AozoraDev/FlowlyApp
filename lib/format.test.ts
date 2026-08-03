import { describe, expect, it } from 'vitest';
import { currencyPrefix, formatDate, formatRelativeTime } from './format';

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

  it('非法时间返回空串而不是抛错（列表脏数据不拖垮页面）', () => {
    expect(formatDate('', 'zh')).toBe('');
    expect(formatDate('not-a-date', 'en')).toBe('');
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

describe('formatRelativeTime', () => {
  // 固定基准时刻，避免 Date.now() 影响断言
  const now = Date.parse('2026-08-03T12:00:00Z');

  it('1 分钟内按秒粒度本地化', () => {
    const iso = '2026-08-03T11:59:40Z';
    // zh-CN 的 Intl.RelativeTimeFormat 数字与单位间无空格，这里断言实际 ICU 输出
    expect(formatRelativeTime(iso, 'zh', now)).toBe('20秒钟前');
    expect(formatRelativeTime(iso, 'en', now)).toBe('20 seconds ago');
  });

  it('几小时前按小时粒度本地化', () => {
    const iso = '2026-08-03T08:00:00Z';
    expect(formatRelativeTime(iso, 'zh', now)).toBe('4小时前');
    expect(formatRelativeTime(iso, 'en', now)).toBe('4 hours ago');
  });

  it('超过一周回落具体日期', () => {
    expect(formatRelativeTime('2026-07-01T12:00:00Z', 'zh', now)).toBe('2026/7/1');
    expect(formatRelativeTime('2026-07-01T12:00:00Z', 'en', now)).toBe('7/1/2026');
  });

  it('非法时间返回空串而不是抛错（列表脏数据不拖垮页面）', () => {
    expect(formatRelativeTime('', 'zh', now)).toBe('');
    expect(formatRelativeTime('not-a-date', 'en', now)).toBe('');
  });
});
