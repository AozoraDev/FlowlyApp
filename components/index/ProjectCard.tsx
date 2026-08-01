import { router } from 'expo-router';
import { CalendarDays, CheckCircle2, Circle, List, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { View } from 'react-native';

import { ConfirmDialog } from '@/components/ui-preSettings/ConfirmDialog';
import { GlassCard } from '@/components/ui-preSettings/GlassCard';
import { Pill } from '@/components/ui-preSettings/Pill';
import { MiniSummary } from '@/components/index/MiniSummary';
import { CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth';
import { formatDate } from '@/lib/format';
import type { Section } from '@/supabase/types';

interface ProjectCardProps {
  // sections 表中的一条项目记录：describe 名称 / created_at 创建时间 / selected 选中态
  section: Section;
  // 该项目收支汇总：收入/支出/结余，由父组件经服务端聚合查询传入（无明细的项目回退全 0）
  summary: { income: number; expense: number; balance: number };
  // 点击选中态徽标时的回调，参数为点击后的目标选中态（由父组件取反后持久化）
  onToggle: (nextSelected: boolean) => void;
  // 确认删除后的回调：由父组件负责删除该项目的所有明细及项目本身
  onDelete: (sectionId: number) => void;
  // 是否有切换/删除请求进行中：置灰并禁用，防止连点重复提交
  disabled?: boolean;
}

// 项目卡片：展示项目名称、创建时间、收支汇总（收入/支出/结余三列）与选中状态，供首页项目列表逐条复用。
// 选中态徽标可点击，点击时向父组件上报目标选中态，数据持久化由父组件负责。
function ProjectCard({ section, summary, onToggle, onDelete, disabled }: ProjectCardProps) {
  const { t, i18n } = useTranslation();
  // 删除确认弹窗的开关：点删除按钮打开，确认/取消/遮罩后关闭
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 时间按当前语言本地化，只显示年月日
  const createdAt = formatDate(section.created_at, i18n.language);
  // 测量卡片像素宽度，用于把项目名限制在卡片宽度的 60% 内截断
  const { width: cardWidth, onLayout: onCardLayout } = useMeasuredWidth();

  // 选中态徽标：选中用「淡绿背景 + 绿色对勾 + 已选中」，未选中用置灰「空心圆 + 未选中」
  const badgeIcon = section.selected ? CheckCircle2 : Circle;

  return (
    // 液态玻璃预设卡片：渐变背景 + 反光带 + 投影已由 GlassCard 接管，此处只传布局间距
    <GlassCard className="py-0.5" onLayout={onCardLayout}>
      <CardContent>
        <View className="gap-1">
          {/* 标题行：项目名左侧品牌蓝突出主体，创建时间右侧灰色弱化，同一行一左一右分布 */}
          <View className="flex-row items-center justify-between">
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{ maxWidth: cardWidth ? cardWidth * 0.55 : '55%' }}
              className="text-base font-semibold text-brand">
              {section.describe}
            </Text>
            <View className="flex-row items-center gap-1">
              <Icon as={CalendarDays} size={14} className="text-muted-foreground" />
              <Text className="text-xs text-muted-foreground">{createdAt}</Text>
            </View>
          </View>

          {/* 操作按钮一行：选中/明细/删除三个 pill 并排 */}
          <View className="flex-row items-center gap-2">
            {/* 选中状态徽标 —— 点击在已选中/未选中间取反，并触发父组件持久化 */}
            <Pill
              variant={section.selected ? 'success' : 'muted'}
              icon={badgeIcon}
              label={section.selected ? t('home.selected') : t('home.unselected')}
              disabled={disabled}
              accessibilityState={{ selected: section.selected, disabled }}
              onPress={() => onToggle(!section.selected)}
            />

            {/* 明细按钮：品牌蓝主操作，点击进入该项目的明细页 */}
            <Pill
              variant="brand"
              icon={List}
              label={t('home.detail')}
              accessibilityLabel={t('home.detail')}
              onPress={() =>
                router.push({
                  pathname: '/items/[sectionId]',
                  params: { sectionId: section.id, name: section.describe },
                })
              }
            />

            {/* 删除按钮：红色危险预设，点击弹出二次确认，确认后删除项目及全部明细 */}
            <Pill
              variant="danger"
              icon={Trash2}
              label={t('home.delete')}
              accessibilityLabel={t('home.delete')}
              disabled={disabled}
              onPress={() => setConfirmOpen(true)}
            />
          </View>
        </View>

        {/* 收支汇总：仅选中状态展示，三列（收入/支出/结余）抽离为 MiniSummary 复用，
              金额配色与动效已由组件接管（收入绿、支出红、结余主题蓝 + 数字滚动） */}
        {section.selected && <MiniSummary summary={summary} />}
      </CardContent>

      {/* 删除二次确认弹窗：确认后关闭弹窗并上报删除请求，由父组件持久化 */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('home.deleteConfirmTitle')}
        description={t('home.deleteConfirmDesc')}
        confirmLabel={t('home.confirmDelete')}
        cancelLabel={t('home.cancel')}
        icon={Trash2}
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete(section.id);
        }}
      />
    </GlassCard>
  );
}

export default ProjectCard;
export { ProjectCard };
