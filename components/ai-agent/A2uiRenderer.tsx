import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import {
  CalendarDays,
  CircleDollarSign,
  Table2,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';

import {
  type A2uiDataGrid,
  type A2uiDataGridColumn,
  type A2uiDateTime,
  type A2uiNode,
  type A2uiStat,
  type A2uiStatCard,
} from '@/ai/lib/a2ui';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { formatDate, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

// ============================================================
// A2UI 渲染器：把解析出的组件树递归渲染成原生卡片。
// 组件集由 ai/lib/a2ui.ts 的 schema 限定，switch 按 type 收窄；
// 全部用 tailwind 主题类（brand/success/destructive/muted/card/border）浅深色自适应，
// 收支数值按正负号着色（-红 +绿），统计卡整卡按语义浅色底（收入绿/支出红/结余品牌蓝），与气泡观感一致。
// 表格列宽按「CJK 全角 + 拉丁半角」估算后统一固定，保证表头与各行严格对齐，
// 避免只设 minWidth 时各行列宽不一导致表身错位；内容过长时容器横向滚动。
// ============================================================

// 表格：数据行 text-sm(14)、表头 text-xs(12)；列宽 = 内容估算宽 + 左右 padding(px-3) + 余量
const CELL_PADDING_X = 24;
const CELL_MIN_WIDTH = 88;
const CELL_BUFFER = 8;

/** 估算单行文本渲染宽度：CJK 全角字按整字宽、拉丁/数字按 0.6 字宽（tabular-nums 数字接近等宽） */
function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    const isWide = (code >= 0x2e80 && code <= 0x9fff) || (code >= 0xff00 && code <= 0xffef);
    width += isWide ? fontSize : fontSize * 0.6;
  }
  return width;
}

// 数值正负号 → 着色：- 红、+ 绿、无符号保持前景色（表格行/统计值通用）
function valueTone(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('-')) return 'text-destructive';
  if (trimmed.startsWith('+')) return 'text-success';
  return 'text-foreground';
}

// 标题/数值关键词 → 图标与语义色（badge 即整卡浅色底）：负数或「支出」红、正数或「收入」绿、「结余/余额」品牌蓝，其余中性蓝
function accentFor(text: string): { icon: LucideIcon; color: string; badge: string } {
  const t = text.toLowerCase();
  if (t.trim().startsWith('-') || /支出|花费|花销|expense|spend|outflow/.test(t)) {
    return { icon: TrendingDown, color: 'text-destructive', badge: 'bg-destructive/10' };
  }
  if (t.trim().startsWith('+') || /收入|入账|income|revenue|inflow/.test(t)) {
    return { icon: TrendingUp, color: 'text-success', badge: 'bg-success/10' };
  }
  if (/结余|余额|总计|合计|balance|saving/.test(t)) {
    return { icon: Wallet, color: 'text-brand', badge: 'bg-brand/10' };
  }
  return { icon: CircleDollarSign, color: 'text-brand', badge: 'bg-brand/10' };
}

/** 单元格展示：date 列按本地化日期渲染，number/string 原样（金额已由模型格式化为两位小数） */
function formatCell(
  col: A2uiDataGridColumn,
  value: string | number | null | undefined,
  language: string
): string {
  if (value == null) return '';
  if (col.data_type === 'date') return formatDate(String(value), language) || String(value);
  return String(value);
}

// 统计卡：整卡按语义浅色底（收入绿/支出红/结余品牌蓝）+ 语义色图标 + 标题/大号数值/补充说明
function StatCardView({ node }: { node: A2uiStatCard }) {
  const { icon: AccentIcon, color, badge } = accentFor(`${node.title ?? ''} ${String(node.value)}`);
  return (
    <View
      className={cn('flex-row items-center gap-3 rounded-2xl border border-border p-3.5', badge)}>
      <Icon as={AccentIcon} size={22} className={color} />
      <View className="flex-1">
        {node.title ? <Text className="text-xs text-muted-foreground">{node.title}</Text> : null}
        <Text className={cn('mt-0.5 text-2xl font-bold tabular-nums', color)}>
          {String(node.value)}
        </Text>
        {node.text ? (
          <Text className="mt-0.5 text-xs text-muted-foreground">{node.text}</Text>
        ) : null}
      </View>
    </View>
  );
}

// 紧凑统计项：整卡按语义浅色底，图标 + label 居左、value 居右；多个 Stat 堆叠即成一列汇总
function StatView({ node }: { node: A2uiStat }) {
  const value = String(node.value);
  const { icon: AccentIcon, color, badge } = accentFor(`${node.label} ${value}`);
  return (
    <View
      className={cn(
        'flex-row items-center justify-between rounded-xl border border-border px-3 py-2.5',
        badge
      )}>
      <View className="flex-1 flex-row items-center gap-2">
        <Icon as={AccentIcon} size={14} className={color} />
        <Text className="text-sm text-muted-foreground">{node.label}</Text>
      </View>
      <Text className={cn('text-sm font-semibold tabular-nums', color)}>{value}</Text>
    </View>
  );
}

// 数据表：品牌浅底表头 + 斑马纹行，列宽统一固定保证对齐；
// number 列右对齐、按正负号着色，容器横向滚动防长内容溢出
function DataGridView({ node }: { node: A2uiDataGrid }) {
  const { i18n } = useTranslation();
  const { columns, rows } = node.data;

  // 统一列宽（仅随数据变化重算）：表头与全部行内容的最宽值 + padding + 余量
  const columnWidths = useMemo(
    () =>
      columns.map((col) => {
        const headerWidth = estimateTextWidth(col.display_name ?? col.name, 12);
        const bodyWidth = rows.reduce((max, row) => {
          const raw = row.values[col.name];
          const text = raw == null ? '' : String(raw);
          return Math.max(max, estimateTextWidth(text, 14));
        }, 0);
        return Math.max(CELL_MIN_WIDTH, headerWidth, bodyWidth) + CELL_PADDING_X + CELL_BUFFER;
      }),
    [columns, rows]
  );

  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-card">
      {node.title ? (
        <View className="flex-row items-center gap-2 border-b border-border px-3 py-2.5">
          <Icon as={Table2} size={14} className="text-brand" />
          <Text className="text-sm font-semibold text-foreground">{node.title}</Text>
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* 表头：品牌浅底 + 品牌色，number 列右对齐；与数据行共用列宽保证纵向对齐 */}
          <View className="flex-row bg-brand-soft">
            {columns.map((col, i) => (
              <Text
                key={col.name}
                className={cn(
                  'px-3 py-2 text-xs font-semibold text-brand',
                  col.data_type === 'number' && 'text-right'
                )}
                style={{ width: columnWidths[i] }}>
                {col.display_name ?? col.name}
              </Text>
            ))}
          </View>
          {/* 数据行：奇数行浅底色做斑马纹，number 列右对齐、按正负号着色 */}
          {rows.map((row, i) => (
            <View
              key={row.id ?? i}
              className={cn('flex-row border-t border-border', i % 2 === 1 && 'bg-muted/30')}>
              {columns.map((col, ci) => {
                const text = formatCell(col, row.values[col.name], i18n.language);
                return (
                  <Text
                    key={col.name}
                    numberOfLines={1}
                    className={cn(
                      'px-3 py-2 text-sm',
                      col.data_type === 'number'
                        ? cn('text-right tabular-nums', valueTone(text))
                        : 'text-foreground'
                    )}
                    style={{ width: columnWidths[ci] }}>
                    {text}
                  </Text>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// 时间展示：calendar 图标 + absolute 用日期、relative 用相对时间；解析失败回退原文
function DateTimeView({ node }: { node: A2uiDateTime }) {
  const { i18n } = useTranslation();
  const { value, style } = node;
  const formatted =
    style === 'relative'
      ? formatRelativeTime(value, i18n.language)
      : formatDate(value, i18n.language);
  return (
    <View className="flex-row items-center gap-1.5">
      <Icon as={CalendarDays} size={14} className="text-muted-foreground" />
      <Text className="text-sm text-foreground">{formatted || value}</Text>
    </View>
  );
}

// 递归渲染单个节点；App/Section 是容器，往下遍历 children
function A2uiNodeView({ node }: { node: A2uiNode }) {
  switch (node.type) {
    case 'App':
    case 'Section':
      return (
        <View className="gap-2">
          {node.title ? (
            <View className="flex-row items-center gap-1.5">
              {/* 分组标题左侧品牌色竖条，一眼区分层级 */}
              {node.type === 'Section' ? (
                <View className="h-3.5 w-1 rounded-full bg-brand" />
              ) : null}
              <Text className="text-sm font-semibold text-foreground">{node.title}</Text>
            </View>
          ) : null}
          {node.children.map((child, i) => (
            <A2uiNodeView key={i} node={child} />
          ))}
        </View>
      );
    case 'StatCard':
      return <StatCardView node={node} />;
    case 'Stat':
      return <StatView node={node} />;
    case 'DataGrid':
      return <DataGridView node={node} />;
    case 'DateTime':
      return <DateTimeView node={node} />;
    case 'Text':
      return <Text className="text-sm text-foreground">{node.text}</Text>;
  }
}

/** 顶层入口：把解析出的 UI 节点渲染成卡片序列（内容完成即静态，父级 memo 已挡住无谓重渲） */
export function A2uiRenderer({ ui }: { ui: A2uiNode }) {
  return <A2uiNodeView node={ui} />;
}
