import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, View, type FlatListProps } from 'react-native';

import { DEFAULT_PAGE_SIZE, Pagination, type PaginationLabels } from '@/components/ui/pagination';
import { cn } from '@/lib/utils';

// 客户端分页状态管理：页码 state + 当前页切片 + 越界回退，仅预设内部使用。
// items 可传 undefined（加载中/未登录），按空列表处理；总量变化导致当前页越界时自动回落到最后一页。
function usePagination<T>(items: T[] | undefined, pageSize = DEFAULT_PAGE_SIZE) {
  // 当前页码从 1 开始，翻页时由 setCurrentPage 驱动重渲染
  const [currentPage, setCurrentPage] = useState(1);
  const total = items?.length ?? 0;
  // 总页数至少为 1，保证切片与翻页计算始终合法
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // 仅取当前页的数据渲染，切换页时重算切片
  const currentPageItems = items?.slice((currentPage - 1) * pageSize, currentPage * pageSize) ?? [];

  // 数据总量变化（如删减）导致当前页越界时，回落到最后一页
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return { currentPage, currentPageItems, total, totalPages, pageSize, setCurrentPage };
}

// 分页列表预设：接管分页状态、底部翻页控件与跳转页码文案，调用方只需传数据与渲染逻辑。
// 支持两种模式：
//  - 客户端分页（默认）：传全量 items，内部切片分页；
//  - 服务端分页：total/currentPage/onPageChange 齐备时启用，列表只渲染后端按页返回的数据，
//    翻页回调触发新的分页查询（数据由调用方经 useQuery 拉取）。
interface PaginatedListProps<T> extends Omit<FlatListProps<T>, 'data' | 'ListFooterComponent'> {
  // 客户端模式下为全量数据；服务端模式下为当前页数据；undefined（加载中/未登录）按空列表处理
  items: T[] | undefined;
  // 每页条数，默认 15
  pageSize?: number;
  // 跳转页码输入框的文案，缺省走 i18n（common.goTo 等），调用方可按需覆盖
  paginationLabels?: Partial<PaginationLabels>;
  // 服务端分页模式：后端返回的匹配总数（对应 Supabase count: 'exact'）
  total?: number;
  // 服务端分页模式：当前页（由外部 state 驱动）
  currentPage?: number;
  // 服务端分页模式：翻页回调，触发新的分页查询
  onPageChange?: (page: number) => void;
  // 服务端分页模式：翻页请求进行中标记，用于在列表与翻页间展示小型加载指示
  isFetching?: boolean;
}

// 分页列表预设：内部用 usePagination 管理页码与当前页切片，翻页控件固定在内容区底部、
// bottombar 上方（列表 flex-1 独立滚动，分页作为兄弟节点不随内容滚动），超一页才显示。
// 跳转页码的文案内置 i18n 默认值，无需调用方逐条传入；renderItem / 空态 / 顶部入口等列表行为
// 仍由调用方通过 props 传入，跨列表页直接复用。
function PaginatedList<T>({
  items,
  pageSize,
  paginationLabels,
  total,
  currentPage,
  onPageChange,
  isFetching,
  className,
  ...listProps
}: PaginatedListProps<T>) {
  const { t } = useTranslation();
  const {
    currentPage: clientPage,
    currentPageItems,
    total: clientTotal,
    pageSize: realPageSize,
    setCurrentPage,
  } = usePagination(items, pageSize);

  // 服务端分页模式判定：三个驱动项齐备即启用；收敛成对象后 TS 才能在分支里正确收窄各字段类型
  const serverProps =
    total !== undefined && currentPage !== undefined && onPageChange !== undefined
      ? { total, currentPage, onPageChange }
      : undefined;

  // 跳转页码文案：i18n 默认值 + 调用方覆盖项合并，保证只传部分 key 也能生效
  const labels: PaginationLabels = {
    goTo: t('common.goTo'),
    jump: t('common.jump'),
    jumpTo: t('common.jumpTo'),
    totalPages: (total) => t('common.totalPages', { total }),
    ...paginationLabels,
  };

  // 服务端模式下数据已由后端按页返回，直接渲染不再切片；客户端模式才走内部切片
  const effectiveItems = serverProps ? (items ?? []) : currentPageItems;
  const effectivePageSize = pageSize ?? DEFAULT_PAGE_SIZE;

  // 服务端模式越界回退：数据总量变化（如删减）导致当前页超出总页数时，回落到最后一页并触发新的分页查询
  useEffect(() => {
    if (!serverProps) return;
    const totalPages = Math.max(1, Math.ceil(serverProps.total / effectivePageSize));
    if (serverProps.currentPage > totalPages) {
      serverProps.onPageChange(totalPages);
    }
  }, [serverProps, effectivePageSize]);

  return (
    // 外层容器占满内容区高度：列表占剩余空间独立滚动，分页钉在底部、bottombar 上方
    <View className={cn('flex-1', className)}>
      <FlatList {...listProps} className="flex-1" data={effectiveItems} />
      {/* 服务端模式翻页加载指示：仅在列表已有内容时展示，初始加载仍由 ListEmptyComponent 承担，避免双 spinner */}
      {serverProps && isFetching && effectiveItems.length > 0 ? (
        <View className="items-center py-2">
          <ActivityIndicator size="small" />
        </View>
      ) : null}
      <Pagination
        total={serverProps ? serverProps.total : clientTotal}
        currentPage={serverProps ? serverProps.currentPage : clientPage}
        pageSize={serverProps ? effectivePageSize : realPageSize}
        onPageChange={serverProps ? serverProps.onPageChange : setCurrentPage}
        labels={labels}
        className="py-4"
      />
    </View>
  );
}

export default PaginatedList;
export { PaginatedList };
export type { PaginatedListProps };
