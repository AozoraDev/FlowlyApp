// lib/format.ts —— 展示层格式化工具

// 日期本地化：zh 走 zh-CN，其余走 en-US；只显示年月日，不含具体时间
export function formatDate(iso: string, language: string) {
  const locale = language.startsWith('zh') ? 'zh-CN' : 'en-US';
  return new Date(iso).toLocaleDateString(locale);
}

// 金额前缀：收支符号 + 货币符号，如收入 '+￥'、支出 '-￥'。
// 供 CountUpText 的 prefix 使用（数字部分由组件滚动动画格式化），前缀独立便于复用到其他金额展示
export function currencyPrefix(isIncome: boolean) {
  return `${isIncome ? '+' : '-'}￥`;
}
