import { Send } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';

interface ChatInputBarProps {
  // 输入框受控值 / 变更回调（由页面的 TanStack Form 字段驱动）
  value: string;
  onChangeText: (text: string) => void;
  // 提交回调（回车或点发送按钮触发，空内容由表单 zod 校验拦截）
  onSubmit: () => void;
  // 输入非空才允许发送
  canSend: boolean;
  // 流式进行中：禁用发送按钮（输入仍可编辑，便于提前准备下一条问题）
  sending: boolean;
}

// 底部输入条：单行输入框 + 品牌蓝发送按钮。纯展示组件，
// 状态与校验都归页面的 TanStack Form，这里只负责布局与交互触发。
function ChatInputBar({ value, onChangeText, onSubmit, canSend, sending }: ChatInputBarProps) {
  const { t } = useTranslation();

  return (
    <View className="flex-row items-center gap-2 border-t border-border bg-background/80 px-4 py-2.5">
      <Input
        className="flex-1"
        value={value}
        onChangeText={onChangeText}
        placeholder={t('aiAgent.inputPlaceholder')}
        returnKeyType="send"
        onSubmitEditing={onSubmit}
        blurOnSubmit={false}
      />
      <Button
        size="icon"
        className="bg-brand"
        disabled={!canSend || sending}
        onPress={onSubmit}
        accessibilityLabel={t('aiAgent.send')}>
        <Icon as={Send} size={16} className="text-white" />
      </Button>
    </View>
  );
}

export default ChatInputBar;
export { ChatInputBar };
export type { ChatInputBarProps };
