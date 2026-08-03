// lib/format.ts —— 展示层格式化工具

// 日期本地化：zh 走 zh-CN，其余走 en-US；只显示年月日，不含具体时间。
// 非法时间（空串/无法解析的格式）返回空串，避免 toLocaleDateString 抛 RangeError 拖垮整个页面
export function formatDate(iso: string, language: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const locale = language.startsWith('zh') ? 'zh-CN' : 'en-US';
  return date.toLocaleDateString(locale);
}

// 金额前缀：收支符号 + 货币符号，如收入 '+￥'、支出 '-￥'。
// 供 CountUpText 的 prefix 使用（数字部分由组件滚动动画格式化），前缀独立便于复用到其他金额展示
export function currencyPrefix(isIncome: boolean) {
  return `${isIncome ? '+' : '-'}￥`;
}

// 相对时间：1 分钟内「秒前」、1 小时内「分钟前」、1 天内「小时前」、1 周内「天前」，
// 更早回落具体日期。用 Intl.RelativeTimeFormat 按语言本地化，无需额外 i18n 文案；
// now 参数便于测试固定基准时刻。
// 非法时间直接返回空串；Intl.RelativeTimeFormat 不可用（部分 Hermes 版本未内置）时回落具体日期，
// 两处兜底都是为了让列表不因脏数据或引擎差异崩溃
export function formatRelativeTime(iso: string, language: string, now = Date.now()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const locale = language.startsWith('zh') ? 'zh-CN' : 'en-US';
  const diffMs = now - date.getTime();
  let rt: Intl.RelativeTimeFormat;
  try {
    rt = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  } catch {
    return formatDate(iso, language);
  }

  const seconds = Math.round(diffMs / 1000);
  if (Math.abs(seconds) < 60) return rt.format(-seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return rt.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rt.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return rt.format(-days, 'day');
  return formatDate(iso, language);
}
