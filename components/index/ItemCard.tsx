import { CalendarDays, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ConfirmDialog } from '@/components/ui-preSettings/ConfirmDialog';
import { CountUpText } from '@/components/ui-preSettings/CountUpText';
import { GlassCard } from '@/components/ui-preSettings/GlassCard';
import { Pill } from '@/components/ui-preSettings/Pill';
import { CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth';
import { currencyPrefix, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Item } from '@/supabase/types';

interface ItemCardProps {
  // items 表中的一条流水明细记录
  item: Item;
  // 确认删除后的回调：由父组件负责删除该条明细
  onDelete: (itemId: number) => void;
  // 是否有删除请求进行中：置灰并禁用，防止连点重复提交
  disabled?: boolean;
}

// 项目明细卡片：左侧事由 + 创建时间（日期后带删除 pill），右侧带正负号的金额。
// 删除二次确认收敛在本组件，数据持久化由父组件以 onDelete 回调接管，保持卡片无查询/写库职责。
function ItemCard({ item, onDelete, disabled }: ItemCardProps) {
  const { t, i18n } = useTranslation();
  // 删除确认弹窗的开关：点删除按钮打开，确认/取消/遮罩后关闭
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 时间按当前语言本地化，只显示年月日
  const date = formatDate(item.created_at, i18n.language);
  // 测量卡片像素宽度，用于把标题限制在卡片宽度的 60% 内截断
  const { width: cardWidth, onLayout: onCardLayout } = useMeasuredWidth();

  return (
    // 液态玻璃预设卡片：渐变背景 + 反光带 + 投影已由 GlassCard 接管，此处只传间距与横向布局
    <GlassCard className="mb-1.5 py-0.5" onLayout={onCardLayout}>
      <CardContent>
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1 gap-0.5">
            {/* 事由标题：最多占卡片宽度的 60%，超长时由 numberOfLines 在省略处自动截断。
                maxWidth 用测得的像素值（首帧回退 60% 避免闪跳），防止标题撑破单行 */}
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{ maxWidth: cardWidth ? cardWidth * 0.6 : '60%' }}
              className="text-sm font-medium">
              {item.reason || t('home.noReason')}
            </Text>
            <View className="flex-row items-center gap-1">
              <Icon as={CalendarDays} size={12} className="text-muted-foreground" />
              <Text className="text-xs text-muted-foreground">{date}</Text>
              {/* 删除按钮：红色危险预设，紧跟日期，点击弹出二次确认。
                  内边距收窄到 px-1.5 py-0.5，让 pill 与日期文字的视觉尺寸一致（文字同为 text-xs） */}
              <Pill
                variant="danger"
                icon={Trash2}
                label={t('home.delete')}
                accessibilityLabel={t('home.delete')}
                disabled={disabled}
                className="px-1.5 py-0.5"
                onPress={() => setConfirmOpen(true)}
              />
            </View>
          </View>
          {/* 金额带正负号与货币符号：isIncome 决定收支方向与颜色；数字用 CountUpText 从 0 滚动到终值，
              符号+￥ 经 currencyPrefix 拼在滚动值前，动画全程都带着；位数由组件按终值补齐，宽度不跳动 */}
          <CountUpText
            end={item.number}
            prefix={currencyPrefix(item.isIncome)}
            thousandsSeparator=","
            className={cn(
              'text-base font-semibold tabular-nums',
              item.isIncome ? 'text-success' : 'text-destructive'
            )}
          />
        </View>
      </CardContent>

      {/* 删除二次确认弹窗：确认后关闭弹窗并上报删除请求，由父组件持久化 */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('home.itemDeleteConfirmTitle')}
        description={t('home.itemDeleteConfirmDesc')}
        confirmLabel={t('home.confirmDelete')}
        cancelLabel={t('home.cancel')}
        icon={Trash2}
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete(item.id);
        }}
      />
    </GlassCard>
  );
}

export default ItemCard;
export { ItemCard };
