import { Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { ConfirmDialog } from '@/components/ui-preSettings/ConfirmDialog';
import { GlassCard } from '@/components/ui-preSettings/GlassCard';
import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { formatRelativeTime } from '@/lib/format';
import type { AiChat } from '@/supabase/types';

interface ChatRowProps {
  // ai_chats 一条会话记录：title 标题（空则回退「新对话」）、updated_at 最近活动时间
  chat: AiChat;
  // 点击行进入该会话
  onPress: () => void;
  // 确认删除后的回调：由父组件负责删除该会话及其全部消息
  onDelete: (chatId: number) => void;
  // 是否有删除/新建请求进行中：置灰并禁用，防止连点重复提交
  disabled?: boolean;
}

// 对话列表行：标题 + 相对时间，整行可点进入会话，右侧删除按钮二次确认后删除。
// 外层 Pressable 触发进入，内部 Button 处理删除（RN 嵌套按压由最内层响应，不会冒泡触发进入）。
function ChatRow({ chat, onPress, onDelete, disabled }: ChatRowProps) {
  const { t, i18n } = useTranslation();
  // 删除确认弹窗的开关：点删除按钮打开，确认/取消/遮罩后关闭
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 标题为空（新建未发言）时回退「新对话」占位
  const title = chat.title.trim() || t('aiAgent.untitledChat');

  return (
    <Pressable onPress={onPress} disabled={disabled}>
      <GlassCard className="py-0.5">
        <CardContent>
          <View className="flex-row items-center justify-between gap-2">
            {/* 标题 + 最近活动时间：时间用相对时间展示，按当前语言本地化 */}
            <View className="flex-1">
              <Text numberOfLines={1} className="text-base font-semibold text-brand">
                {title}
              </Text>
              <Text className="mt-0.5 text-xs text-muted-foreground">
                {formatRelativeTime(chat.updated_at, i18n.language)}
              </Text>
            </View>

            {/* 删除按钮：危险操作走二次确认，与全局删除交互一致 */}
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              accessibilityLabel={t('aiAgent.deleteChat')}
              onPress={() => setConfirmOpen(true)}>
              <Icon as={Trash2} size={16} className="text-muted-foreground" />
            </Button>
          </View>
        </CardContent>

        {/* 删除二次确认：确认后关闭弹窗并上报删除请求，由父组件持久化 */}
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={t('aiAgent.deleteConfirmTitle')}
          description={t('aiAgent.deleteConfirmDesc')}
          confirmLabel={t('home.confirmDelete')}
          cancelLabel={t('home.cancel')}
          icon={Trash2}
          onConfirm={() => {
            setConfirmOpen(false);
            onDelete(chat.id);
          }}
        />
      </GlassCard>
    </Pressable>
  );
}

export default ChatRow;
export { ChatRow };
export type { ChatRowProps };
