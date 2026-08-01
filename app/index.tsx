import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import ProjectCard from '@/components/index/ProjectCard';
import { DEFAULT_PAGE_SIZE } from '@/components/ui/pagination';
import PaginatedList from '@/components/ui-preSettings/PaginatedList';
import { BrandButton } from '@/components/ui-preSettings/Button';
import { ScreenBackground } from '@/components/ui-preSettings/ScreenBackground';
import { useAppToast } from '@/components/ui-preSettings/Toast';
import { Text } from '@/components/ui/text';
import { useAuthSession } from '@/hooks/useAuthSession';
import { queryClient } from '@/lib/queryClient';
import { getSectionSummaries } from '@/supabase/items';
import { deleteSectionWithItems, listSections, updateSectionSelected } from '@/supabase/sections';
import type { SectionSummary, SectionsPage } from '@/supabase/types';

// 首页：未登录时重定向到 /notlogin 引导登录，已登录按当前用户展示项目列表（sections）
export default function Index() {
  const { session, loading } = useAuthSession();
  const { t } = useTranslation();
  const toast = useAppToast();
  // 当前登录用户 id；未登录时为 undefined，查询通过 enabled 关闭
  const userId = session?.user.id;

  // 后端分页页码：从第 1 页起，翻页时由 PaginatedList 回调更新，页码随 queryKey 驱动新的分页请求
  const [page, setPage] = useState(1);

  // 按页拉取当前用户的项目列表；登录态才启用查询，登出后随缓存自动失效；
  // placeholderData 保留上一页数据，翻页期间列表不闪空
  const {
    data: pageData,
    isLoading,
    isError,
    error,
    isFetching,
  } = useQuery({
    queryKey: ['sections', userId, page],
    queryFn: async () => {
      // enabled 已保证 userId 非空，此处兜底守卫避免传入 undefined
      if (!userId) throw new Error('user not logged in');
      return listSections(userId, page, DEFAULT_PAGE_SIZE);
    },
    enabled: !!userId,
    placeholderData: (prev) => prev,
  });

  // 当前页数据与匹配总数（后端分页：total 供翻页控件计算总页数）
  const sections = pageData?.sections;
  const sectionsTotal = pageData?.total;

  // 拉取当前用户各项目的收支汇总（服务端聚合：一次请求返回全部项目的收入/支出/结余），
  // 替代原先全量拉取明细投影再客户端分组求和，流水量大时只传 N 行汇总而非全量明细
  const { data: summaries } = useQuery({
    queryKey: ['sectionSummaries', userId],
    queryFn: async () => {
      // enabled 已保证 userId 非空，此处兜底守卫避免传入 undefined
      if (!userId) throw new Error('user not logged in');
      return getSectionSummaries(userId);
    },
    enabled: !!userId,
  });

  // 把服务端聚合结果映射为 sectionId -> 汇总，供渲染每条项目卡时按 id 取出；
  // 无明细的项目在聚合结果里缺席，取不到映射时回退全 0
  const summariesBySection = useMemo(() => {
    const map = new Map<number, SectionSummary>();
    for (const row of summaries ?? []) map.set(row.section_id, row);
    return map;
  }, [summaries]);

  // 每次回到首页刷新各项目汇总：明细页新增/删除后，返回时让各项目汇总同步更新
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['sectionSummaries', userId] });
    }, [userId])
  );

  // 切换项目选中态：乐观更新让界面即时响应点击，失败回滚，结束后刷新与后端对齐。
  // 数据已按页缓存，乐观更新只作用于当前页（用户正在浏览的那一页），避免跨页写入冲突
  const toggleMutation = useMutation({
    mutationFn: ({ id, selected }: { id: number; selected: boolean }) =>
      updateSectionSelected(id, selected),
    onMutate: async ({ id, selected }) => {
      // 先取消在途查询，避免旧结果覆盖乐观更新
      await queryClient.cancelQueries({ queryKey: ['sections', userId] });
      const pageKey = ['sections', userId, page] as const;
      const previous = queryClient.getQueryData<SectionsPage>(pageKey);
      // 本地先翻转目标条目的选中态，界面即时反馈
      queryClient.setQueryData<SectionsPage>(pageKey, (old) =>
        old
          ? {
              ...old,
              sections: old.sections.map((s) => (s.id === id ? { ...s, selected } : s)),
            }
          : old
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      // 失败回滚：恢复点击前的列表状态
      if (context?.previous) {
        queryClient.setQueryData(['sections', userId, page], context.previous);
      }
    },
    onSettled: () => {
      // 与数据库对齐，拉取最新选中态（前缀覆盖所有分页）
      queryClient.invalidateQueries({ queryKey: ['sections', userId] });
    },
  });

  // 删除项目：先清空该项目所有明细再删项目本身（supabase 层封装），成功后刷新列表
  const deleteMutation = useMutation({
    mutationFn: (sectionId: number) => deleteSectionWithItems(sectionId),
    onSuccess: () => {
      toast.success(t('home.deleteSuccess'));
      // 项目被删时其全部明细一并删除，sections 与各项目汇总缓存都需刷新
      queryClient.invalidateQueries({ queryKey: ['sections', userId] });
      queryClient.invalidateQueries({ queryKey: ['sectionSummaries', userId] });
    },
    onError: (err) => {
      console.error(err);
      toast.error(t('home.deleteFailed'));
    },
  });

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  // 未登录 → 重定向到未登录引导页
  if (!session) {
    return <Redirect href="/notlogin" />;
  }

  return (
    // 页面背景统一走 ScreenBackground 预设；内边距由列表 contentContainer 自行管理（withPadding 关闭）
    <ScreenBackground withPadding={false}>
      {/* 服务端分页列表：items 为当前页数据，total/currentPage/onPageChange 交给后端分页驱动 */}
      <PaginatedList
        className="flex-1"
        items={sections}
        total={sectionsTotal}
        currentPage={page}
        onPageChange={setPage}
        isFetching={isFetching}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <ProjectCard
            section={item}
            // 该项目的收支汇总；无明细时回退全 0
            summary={summariesBySection.get(item.id) ?? { income: 0, expense: 0, balance: 0 }}
            // 切换 / 删除请求进行中时禁用全部卡片，防止连点重复提交
            disabled={toggleMutation.isPending || deleteMutation.isPending}
            // 点击徽标回调：传取反后的目标选中态，由 mutation 持久化到数据库
            onToggle={(next) => toggleMutation.mutate({ id: item.id, selected: next })}
            // 删除回调：确认弹窗通过后由 mutation 删除项目及全部明细
            onDelete={(sectionId) => deleteMutation.mutate(sectionId)}
          />
        )}
        contentContainerStyle={{ gap: 8, padding: 8 }}
        // 列表顶部入口：左侧品牌蓝「项目总览」标题，右侧小号「添加项目」按钮，点击跳转新建项目页
        ListHeaderComponent={
          <View className="flex-row items-center justify-between px-2">
            <Text className="text-2xl font-semibold text-brand">{t('home.projectOverview')}</Text>
            <BrandButton
              size="sm"
              icon={Plus}
              label={t('home.addProject')}
              onPress={() => router.push('/create-section')}
            />
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
                {t('home.loadFailed')}
              </Text>
              {/* 诊断用：展示真实报错（表不存在 / 缺列 / RLS 等），定位后可按需移除 */}
              <Text className="text-center text-xs text-destructive">{error?.message}</Text>
            </View>
          ) : (
            <Text className="py-10 text-center text-sm text-muted-foreground">
              {t('home.emptySections')}
            </Text>
          )
        }
      />
    </ScreenBackground>
  );
}
