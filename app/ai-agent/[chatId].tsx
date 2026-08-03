import { useForm, useSelector } from '@tanstack/react-form';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Bot, Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { useChat } from '@/ai/hooks/useChat';
import { useModelConfig } from '@/ai/hooks/useModelConfig';
import { chatIdSchema, messageSchema, truncateTitle, type ChatMessage } from '@/ai/lib/chat';
import { ChatBubble } from '@/components/ai-agent/ChatBubble';
import { ChatInputBar } from '@/components/ai-agent/ChatInputBar';
import { ConfirmDialog } from '@/components/ui-preSettings/ConfirmDialog';
import { ScreenBackground } from '@/components/ui-preSettings/ScreenBackground';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAuthSession } from '@/hooks/useAuthSession';

// 单段对话页：从会话列表进入，展示该会话的消息与输入条。
// 发送/清空走 useChat（服务端持久化 + 流式），输入框表单交给 TanStack Form（zod 校验）；
// 标题取首条用户消息截断，与会话列表持久化的标题同源，无需额外查询会话表。
export default function AiChatScreen() {
  const { session, loading } = useAuthSession();
  const { data: modelConfig, isLoading: configLoading } = useModelConfig();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ chatId: string }>();

  // 路由参数解析（zod 边界）：非法 chatId 回退到 0，后面 Redirect 回列表；
  // hooks 需无条件调用，故解析失败仍传入 0（查询 disabled）
  const chatId = chatIdSchema.safeParse(params.chatId).data ?? 0;

  // 对话状态 hook：config 为 null（加载中/未配置）、userId 未定（登录加载中）时也调用——hooks 规则要求无条件调用
  const chat = useChat({ chatId, userId: session?.user.id, config: modelConfig ?? null });

  // 清空对话二次确认弹窗开关
  const [clearOpen, setClearOpen] = useState(false);

  // 输入表单：单字段 content，zod 提交校验（空内容被拦截，不会走到发送）；
  // 发送成功后重置表单清空输入框，便于连续追问
  const form = useForm({
    defaultValues: { content: '' },
    validators: { onSubmit: messageSchema },
    onSubmit: ({ value, formApi }) => {
      chat.sendMessage(value);
      formApi.reset();
    },
  });
  // 订阅输入值：非空才允许发送
  const value = useSelector(form.store, (s) => s.values.content);
  const canSend = value.trim().length > 0;

  // 消息列表自动跟随：流式增量时仅在贴近底部才滚动到底，避免打断用户上翻阅读
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const nearBottomRef = useRef(true);
  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    nearBottomRef.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 60;
  };
  const handleContentSizeChange = () => {
    if (nearBottomRef.current) listRef.current?.scrollToEnd({ animated: false });
  };

  // 标题：取首条用户消息截断，与列表持久化的标题同源；无消息（新建/已清空）时兜底「新对话」
  const firstUserMessage = chat.messages.find((m) => m.role === 'user');
  const title = firstUserMessage
    ? truncateTitle(firstUserMessage.content)
    : t('aiAgent.untitledChat');

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

  // 非法 chatId（非数字/非正整数）→ 回列表
  if (!chatId) {
    return <Redirect href="/ai-agent" />;
  }

  // 尚未配置模型 → 先引导完成配置，避免进入后无法发送
  if (!modelConfig) {
    return <Redirect href="/not-config-model" />;
  }

  return (
    <ScreenBackground withPadding={false}>
      {/* 键盘避让：iOS 键盘弹出时把输入条顶上去，避免被键盘遮挡 */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        {/* 顶栏：返回 + 标题 + 清空对话入口（危险操作走 ConfirmDialog，与全局删除交互一致） */}
        <View className="flex-row items-center px-4 pt-4">
          <Button
            variant="ghost"
            size="sm"
            accessibilityLabel={t('aiAgent.back')}
            onPress={() => router.back()}>
            <Icon as={ArrowLeft} size={18} className="text-foreground" />
          </Button>
          <View className="flex-1 items-center px-2">
            <Text numberOfLines={1} className="text-base font-semibold text-brand">
              {title}
            </Text>
          </View>
          <Button
            variant="ghost"
            size="sm"
            disabled={!chat.hasMessages || chat.isStreaming}
            onPress={() => setClearOpen(true)}>
            <Icon as={Trash2} size={16} className="text-muted-foreground" />
            <Text>{t('aiAgent.clearChat')}</Text>
          </Button>
        </View>

        {/* 消息列表：贴近底部时自动跟随流式输出；键盘弹出时点发送按钮不收起键盘 */}
        <FlatList
          ref={listRef}
          data={chat.messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <ChatBubble message={item} />}
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingVertical: 12,
            gap: 10,
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onContentSizeChange={handleContentSizeChange}
          // 空对话欢迎态：圆形徽标 + 标题 + 一句说明 + 输入「帮助」引导，居中展示
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center gap-1 px-8">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-brand/10">
                <Icon as={Bot} size={26} className="text-brand" />
              </View>
              <Text className="mt-2 text-base font-semibold text-brand">
                {t('aiAgent.welcomeTitle')}
              </Text>
              <Text className="text-center text-sm text-muted-foreground">
                {t('aiAgent.welcomeDesc')}
              </Text>
              <Text className="mt-1 text-center text-sm text-muted-foreground">
                {t('aiAgent.welcomeHelpHint')}
              </Text>
            </View>
          }
        />

        {/* 输入条：值由 TanStack Form 字段驱动，发送走表单提交（空内容被 zod 拦截） */}
        <form.Field name="content">
          {(field) => (
            <ChatInputBar
              value={field.state.value}
              onChangeText={field.handleChange}
              onSubmit={() => void form.handleSubmit()}
              canSend={canSend}
              // 加载历史消息（isSeeding）或流式回答中（isStreaming）都禁用发送，
              // 完成/失败后才放行
              sending={chat.isStreaming || chat.isSeeding}
            />
          )}
        </form.Field>
      </KeyboardAvoidingView>

      {/* 清空对话二次确认 */}
      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title={t('aiAgent.clearConfirmTitle')}
        description={t('aiAgent.clearConfirmDesc')}
        confirmLabel={t('aiAgent.confirmClear')}
        cancelLabel={t('home.cancel')}
        icon={Trash2}
        loading={chat.isClearing}
        onConfirm={() => {
          setClearOpen(false);
          void chat.clearChat();
        }}
      />
    </ScreenBackground>
  );
}
