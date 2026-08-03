import { useMutation, useQuery } from '@tanstack/react-query';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { Bot, Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { useModelConfig } from '@/ai/hooks/useModelConfig';
import { ChatRow } from '@/components/ai-agent/ChatRow';
import { DEFAULT_PAGE_SIZE } from '@/components/ui/pagination';
import PaginatedList from '@/components/ui-preSettings/PaginatedList';
import { BrandButton } from '@/components/ui-preSettings/Button';
import { ScreenBackground } from '@/components/ui-preSettings/ScreenBackground';
import { useAppToast } from '@/components/ui-preSettings/Toast';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAuthSession } from '@/hooks/useAuthSession';
import { queryClient } from '@/lib/queryClient';
import { createAiChat, deleteAiChat, listAiChats } from '@/supabase/aiChats';

// AI-Agent 对话列表页：仅登录后可通过底部栏进入，未登录重定向引导登录；
// 尚未配置模型时先引导去配置页（not-config-model），配置成功后展示会话列表。
// 列表按最近活动倒序（updated_at），支持新建对话与删除对话，点击行进入单段对话页。
export default function AiAgentScreen() {
  const { session, loading } = useAuthSession();
  const { data: modelConfig, isLoading: configLoading } = useModelConfig();
  const { t } = useTranslation();
  const toast = useAppToast();
  // 当前登录用户 id；未登录时为 undefined，查询通过 enabled 关闭
  const userId = session?.user.id;

  // 后端分页页码：从第 1 页起，翻页时由 PaginatedList 回调更新
  const [page, setPage] = useState(1);

  // 按页拉取当前用户的会话列表；登录态才启用查询，登出后随缓存自动失效
  const {
    data: pageData,
    isLoading,
    isError,
    error,
    isFetching,
  } = useQuery({
    queryKey: ['aiChats', userId, page],
    queryFn: async () => {
      // enabled 已保证 userId 非空，此处兜底守卫避免传入 undefined
      if (!userId) throw new Error('user not logged in');
      return listAiChats(userId, page, DEFAULT_PAGE_SIZE);
    },
    enabled: !!userId,
    placeholderData: (prev) => prev,
  });

  // 每次回到列表刷新：单段对话页里发送/改标题/清空后，返回时同步标题、排序与列表状态
  useFocusEffect(
    useCallback(() => {
      if (userId) queryClient.invalidateQueries({ queryKey: ['aiChats', userId] });
    }, [userId])
  );

  // 新建对话：创建后直接进入该会话（标题为空，首条消息时自动生成）
  const createMutation = useMutation({
    mutationFn: async () => {
      // enabled 已保证 userId 非空，此处兜底守卫避免传入 undefined
      if (!userId) throw new Error('user not logged in');
      return createAiChat(userId);
    },
    onSuccess: (chat) => {
      router.push({ pathname: '/ai-agent/[chatId]', params: { chatId: String(chat.id) } });
    },
    onError: (err) => {
      console.error(err);
      toast.error(t('aiAgent.createFailed'));
    },
  });

  // 删除对话：先删全部消息再删会话（aiChats 层封装），成功后刷新列表
  const deleteMutation = useMutation({
    mutationFn: (chatId: number) => deleteAiChat(chatId),
    onSuccess: () => {
      toast.success(t('aiAgent.deleteSuccess'));
      queryClient.invalidateQueries({ queryKey: ['aiChats', userId] });
    },
    onError: (err) => {
      console.error(err);
      toast.error(t('aiAgent.deleteFailed'));
    },
  });

  // 当前页数据与匹配总数（后端分页：total 供翻页控件计算总页数）
  const chats = pageData?.chats;
  const chatsTotal = pageData?.total;

  if (loading || configLoading) {
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

  // 尚未配置模型 → 先引导完成配置，避免进入空列表后无法对话
  if (!modelConfig) {
    return <Redirect href="/not-config-model" />;
  }

  return (
    // 页面背景统一走 ScreenBackground 预设；内边距由列表 contentContainer 自行管理（withPadding 关闭）
    <ScreenBackground withPadding={false}>
      {/* 服务端分页列表：chats 为当前页数据，total/currentPage/onPageChange 交给后端分页驱动 */}
      <PaginatedList
        className="flex-1"
        items={chats}
        total={chatsTotal}
        currentPage={page}
        onPageChange={setPage}
        isFetching={isFetching}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <ChatRow
            chat={item}
            // 删除/新建请求进行中时禁用全部行，防止连点重复提交
            disabled={deleteMutation.isPending || createMutation.isPending}
            // 点击行进入对应会话
            onPress={() =>
              router.push({ pathname: '/ai-agent/[chatId]', params: { chatId: String(item.id) } })
            }
            // 删除回调：确认弹窗通过后由 mutation 删除会话及全部消息
            onDelete={(chatId) => deleteMutation.mutate(chatId)}
          />
        )}
        contentContainerStyle={{ gap: 8, padding: 8 }}
        // 列表顶部入口：左侧「AI-Agent」标题，右侧小号「新建对话」按钮
        ListHeaderComponent={
          <View className="flex-row items-center justify-between px-2">
            <Text className="text-xl font-semibold text-brand">{t('common.aiAgent')}</Text>
            <BrandButton
              size="sm"
              icon={Plus}
              label={t('aiAgent.newChat')}
              onPress={() => createMutation.mutate()}
            />
          </View>
        }
        // 空列表 / 加载中 / 失败态：按当前状态展示对应提示；空态提供「开始新对话」入口
        ListEmptyComponent={
          isLoading ? (
            <View className="items-center py-10">
              <ActivityIndicator />
            </View>
          ) : isError ? (
            <View className="items-center gap-1 py-10">
              <Text className="text-center text-sm text-muted-foreground">
                {t('aiAgent.emptyChatsLoadFailed')}
              </Text>
              {/* 诊断用：展示真实报错（表不存在 / 缺列 / RLS 等），定位后可按需移除 */}
              <Text className="text-center text-xs text-destructive">{error?.message}</Text>
            </View>
          ) : (
            <View className="items-center gap-1 px-8 py-14">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-brand/10">
                <Icon as={Bot} size={26} className="text-brand" />
              </View>
              <Text className="mt-2 text-base font-semibold text-brand">
                {t('aiAgent.welcomeTitle')}
              </Text>
              <Text className="text-center text-sm text-muted-foreground">
                {t('aiAgent.welcomeDesc')}
              </Text>
              <Button variant="outline" className="mt-4" onPress={() => createMutation.mutate()}>
                <Icon as={Plus} size={16} />
                <Text>{t('aiAgent.startNewChat')}</Text>
              </Button>
            </View>
          )
        }
      />
    </ScreenBackground>
  );
}
