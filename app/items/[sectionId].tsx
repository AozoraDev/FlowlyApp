import { useMutation, useQuery } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import ItemCard from '@/components/index/ItemCard';
import SummaryCard from '@/components/index/SummaryCard';
import { DEFAULT_PAGE_SIZE } from '@/components/ui/pagination';
import PaginatedList from '@/components/ui-preSettings/PaginatedList';
import { ScreenBackground } from '@/components/ui-preSettings/ScreenBackground';
import { BrandButton } from '@/components/ui-preSettings/Button';
import { useAppToast } from '@/components/ui-preSettings/Toast';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAuthSession } from '@/hooks/useAuthSession';
import { queryClient } from '@/lib/queryClient';
import { deleteItem, getSectionSummary, listItems } from '@/supabase/items';

// 项目明细页：从路由取 sectionId 与项目名，登录态下按 uid 拉取该项目 items。
// 页内承载列表的查询、顶部返回按钮 + 标题、收支汇总卡、底部翻页（PaginatedList 接管）与加载/空/错态；
// 单条明细的渲染收敛在 ItemCard 卡片组件中，页面只组装列表结构。
export default function SectionDetailScreen() {
  const { sectionId, name } = useLocalSearchParams<{
    sectionId: string;
    name?: string;
  }>();
  const { session, loading } = useAuthSession();
  const { t } = useTranslation();
  const toast = useAppToast();

  // 路由参数 sectionId 为字符串，统一转 number 供查询使用
  const sectionIdNumber = Number(sectionId);

  // 后端分页页码：从第 1 页起，翻页时由 PaginatedList 回调更新，页码随 queryKey 驱动新的分页请求
  const [page, setPage] = useState(1);

  // 按页查询该项目下的流水明细；登录态未就绪时禁用查询（enabled 兜底），queryKey 以 uid + 页码区分；
  // placeholderData 保留上一页数据，翻页期间列表不闪空
  const {
    data: pageData,
    isLoading,
    isError,
    error,
    isFetching,
  } = useQuery({
    queryKey: ['items', session?.user.id, sectionIdNumber, page],
    queryFn: async () => {
      // enabled 已保证登录后才发起查询，此处判空仅为 TS 收窄
      if (!session) throw new Error('not logged in');
      return listItems(session.user.id, sectionIdNumber, page, DEFAULT_PAGE_SIZE);
    },
    enabled: !!session,
    placeholderData: (prev) => prev,
  });

  // 查询该项目整区收支汇总（轻量聚合投影，与服务端分页解耦），供顶部汇总卡展示
  const { data: summary } = useQuery({
    queryKey: ['itemSummary', session?.user.id, sectionIdNumber],
    queryFn: async () => {
      // enabled 已保证登录后才发起查询，此处判空仅为 TS 收窄
      if (!session) throw new Error('not logged in');
      return getSectionSummary(session.user.id, sectionIdNumber);
    },
    enabled: !!session,
  });

  // 删除单条明细：确认弹窗通过后由 mutation 删除，成功后刷新列表（前缀覆盖全部分页）与整区汇总并提示
  const deleteMutation = useMutation({
    mutationFn: (itemId: number) => deleteItem(itemId),
    onSuccess: () => {
      toast.success(t('home.itemDeleteSuccess'));
      // 前缀匹配 ['items', uid, sectionId] 下的所有分页；末页删空导致的页码越界由 PaginatedList 自动回落
      queryClient.invalidateQueries({
        queryKey: ['items', session?.user.id, sectionIdNumber],
      });
      queryClient.invalidateQueries({
        queryKey: ['itemSummary', session?.user.id, sectionIdNumber],
      });
    },
    onError: (err) => {
      console.error(err);
      toast.error(t('home.itemDeleteFailed'));
    },
  });

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  // 未登录 → 重定向到未登录引导页（正常只能从首页进来，这里兜底防直接输入 URL）
  if (!session) {
    return <Redirect href="/notlogin" />;
  }

  return (
    <ScreenBackground withPadding={false}>
      {/* 服务端分页列表：items 为当前页数据，total/currentPage/onPageChange 交给后端分页驱动 */}
      <PaginatedList
        className="flex-1"
        items={pageData?.items}
        total={pageData?.total}
        currentPage={page}
        onPageChange={setPage}
        isFetching={isFetching}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <ItemCard
            item={item}
            // 删除请求进行中时禁用全部删除 pill，防止连点重复提交
            disabled={deleteMutation.isPending}
            // 删除回调：确认弹窗通过后由 mutation 删除该条明细
            onDelete={(itemId) => deleteMutation.mutate(itemId)}
          />
        )}
        contentContainerStyle={{ padding: 16 }}
        // 头部：返回按钮 + 项目名称（占满剩余宽度）+ 右侧品牌蓝预设「添加项目」按钮，跳转新建明细页；
        // 下方为收支汇总卡，只在数据加载完成后展示，避免加载中闪出 0 值
        ListHeaderComponent={
          <View>
            <View className="mb-2 flex-row items-center gap-2">
              <Button variant="ghost" size="icon" onPress={() => router.back()}>
                <Icon as={ArrowLeft} size={20} />
              </Button>
              <Text className="flex-1 text-lg font-semibold text-brand">
                {name || t('home.detail')}
              </Text>
              <BrandButton
                icon={Plus}
                label={t('home.addItem')}
                size="sm"
                onPress={() =>
                  router.push({
                    pathname: '/items/create-item',
                    params: { sectionId: sectionIdNumber, ...(name ? { name } : {}) },
                  })
                }
              />
            </View>
            {/* 收支汇总卡：置于明细遍历上方，展示聚合查询算出的整区收入 / 支出 / 结余 */}
            {summary ? <SummaryCard summary={summary} /> : null}
          </View>
        }
        // 空列表 / 加载中 / 失败态：按当前状态展示对应提示
        ListEmptyComponent={
          isLoading ? (
            <View className="items-center py-10">
              <ActivityIndicator />
            </View>
          ) : isError ? (
            <View className="items-center gap-1 py-10">
              <Text className="text-center text-sm text-muted-foreground">
                {t('home.itemsLoadFailed')}
              </Text>
              {/* 诊断用：展示真实报错（表不存在 / 缺列 / RLS 等），定位后可按需移除 */}
              <Text className="text-center text-xs text-destructive">{error?.message}</Text>
            </View>
          ) : (
            <Text className="py-10 text-center text-sm text-muted-foreground">
              {t('home.emptyItems')}
            </Text>
          )
        }
      />
    </ScreenBackground>
  );
}
