import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

// Default page size: pagination only renders when total exceeds this number.
// Exported so backend-paginated screens use the same page size for their Supabase range() query.
export const DEFAULT_PAGE_SIZE = 15;

// Labels for the jump-to-page UI; falls back to English defaults when omitted
interface PaginationLabels {
  // Accessibility label for the page-number input
  goTo?: string;
  // Text of the confirm button
  jump?: string;
  // Visible "jump to" prefix text before the input
  jumpTo?: string;
  // Total-pages hint, receives the page count so the caller can localize the number
  totalPages?: (total: number) => string;
}

interface PaginationProps {
  // Total number of items across all pages
  total: number;
  // Current page, starting at 1
  currentPage: number;
  // Called with the new page when the user navigates
  onPageChange: (page: number) => void;
  // Items per page, defaults to 15
  pageSize?: number;
  // Extra classes for the container (e.g. spacing)
  className?: string;
  // Whether to show the jump-to-page input, defaults to true
  showJump?: boolean;
  // Text labels for the jump UI, localized by the caller
  labels?: PaginationLabels;
}

// Page-item list: always keep first/last, show a window around the current page,
// and fill gaps with ellipsis placeholders so many pages never overflow the row.
function buildPageItems(
  current: number,
  total: number
): (number | 'start-ellipsis' | 'end-ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const items: (number | 'start-ellipsis' | 'end-ellipsis')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) items.push('start-ellipsis');
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < total - 1) items.push('end-ellipsis');
  items.push(total);
  return items;
}

/**
 * Reusable pagination control. Renders nothing until there is more than one page.
 * Presentational only: the caller slices its own data from (currentPage, pageSize).
 * Optionally shows a jump-to-page input (digits only, clamped to valid range).
 */
function Pagination({
  total,
  currentPage,
  pageSize = DEFAULT_PAGE_SIZE,
  onPageChange,
  className,
  showJump = true,
  labels,
}: PaginationProps) {
  // Total pages, clamped to at least 1 so calculations stay valid
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Nothing to paginate, hide the whole control
  if (totalPages <= 1) return null;

  // 跳转输入框内容：只存数字字符串，跳转成功后清空
  const [jumpValue, setJumpValue] = useState('');
  const jumpLabel = labels?.jump ?? 'Go';
  const goToLabel = labels?.goTo ?? 'Go to page';
  const jumpToLabel = labels?.jumpTo ?? 'Go to';
  // 总页数提示，缺省回退为 "of N"，由调用方经 i18n 本地化
  const totalPagesLabel = labels?.totalPages?.(totalPages) ?? `of ${totalPages}`;

  // 过滤非数字字符，保证 parse 结果安全
  const handleJumpChange = (text: string) => {
    setJumpValue(text.replace(/[^0-9]/g, ''));
  };

  // 跳转到指定页：解析输入并钳制到 [1, totalPages]，避免越界；成功后清空输入
  const handleJump = () => {
    const page = parseInt(jumpValue, 10);
    if (Number.isNaN(page)) return;
    setJumpValue('');
    onPageChange(Math.min(Math.max(page, 1), totalPages));
  };

  const items = buildPageItems(currentPage, totalPages);

  return (
    <View className={cn('items-center gap-1.5', className)} role="group" aria-label="Pagination">
      {/* 第一行：上一页 + 页码 + 下一页 */}
      <View className="flex-row items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="px-0"
          disabled={currentPage <= 1}
          accessibilityLabel="Previous page"
          onPress={() => onPageChange(currentPage - 1)}>
          <Icon as={ChevronLeft} size={16} />
        </Button>

        {items.map((item, index) => {
          // Ellipsis placeholder, not clickable
          if (item === 'start-ellipsis' || item === 'end-ellipsis') {
            return (
              <Text
                key={`ellipsis-${index}`}
                className="w-7 text-center text-sm text-muted-foreground">
                …
              </Text>
            );
          }
          const isActive = item === currentPage;
          return (
            <Button
              key={item}
              variant={isActive ? 'default' : 'ghost'}
              size="sm"
              className={cn('min-w-9 px-0', isActive && 'bg-brand')}
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`Page ${item}`}
              onPress={() => onPageChange(item)}>
              <Text className={cn(isActive && 'text-white')}>{item}</Text>
            </Button>
          );
        })}

        <Button
          variant="ghost"
          size="sm"
          className="px-0"
          disabled={currentPage >= totalPages}
          accessibilityLabel="Next page"
          onPress={() => onPageChange(currentPage + 1)}>
          <Icon as={ChevronRight} size={16} />
        </Button>
      </View>

      {/* 第二行：跳转到指定页码 —— 品牌色胶囊容器统一样式，输入框 + 总页数提示 + 主操作按钮一气呵成 */}
      {showJump && (
        <View className="flex-row items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5">
          {/* 跳转前缀文案：说明输入框用途 */}
          <Text className="text-xs text-muted-foreground">{jumpToLabel}</Text>
          {/* 紧凑数字输入框：复用基础 Input，行内 style 固定像素尺寸，避免 rem 单位换算导致宽度塌陷 */}
          <Input
            value={jumpValue}
            onChangeText={handleJumpChange}
            onSubmitEditing={handleJump}
            keyboardType="number-pad"
            returnKeyType="done"
            placeholder={String(currentPage)}
            accessibilityLabel={goToLabel}
            {...(Platform.OS === 'web' ? { inputMode: 'numeric' as const } : {})}
            className="rounded-full bg-background px-1.5 text-center text-sm"
            style={{ width: 48, height: 32 }}
          />
          {/* 总页数提示：让用户知道可跳转范围 */}
          <Text className="text-xs text-muted-foreground">{totalPagesLabel}</Text>
          {/* 品牌蓝跳转按钮：与「添加项目」主操作同风格，输入为空时置灰不可点 */}
          <Button
            variant="default"
            size="sm"
            className="h-8 rounded-full bg-brand px-3 active:bg-brand/90"
            disabled={!jumpValue}
            accessibilityLabel={goToLabel}
            onPress={handleJump}>
            <Text className="text-xs text-white">{jumpLabel}</Text>
          </Button>
        </View>
      )}
    </View>
  );
}

export { Pagination };
export type { PaginationProps, PaginationLabels };
