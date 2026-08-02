import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  // 头部图标（Lucide）
  icon: LucideIcon;
  // 主标题文案（一般传 i18n 文案）
  title: string;
  // 副标题文案（一般传 i18n 文案）
  desc: string;
  // 徽标容器底色（含尺寸圆角），默认品牌蓝浅底
  badgeClassName?: string;
  // 图标颜色，默认品牌蓝
  iconClassName?: string;
  // 主标题字号变体，默认 h2
  titleVariant?: 'h2' | 'h3';
  // 副标题字号，默认 text-sm
  descClassName?: string;
}

// 页面头部预设：圆形图标徽标 + 主标题 + 副标题，居中排版。
// 新建项目/明细页用绿色徽标（success + h2 + sm 描述），模型配置/信息页用品牌蓝徽标
// （brand + h3 + xs 描述），差异全部由 props 表达，调用方只需传文案与配色，无需重复书写布局。
function PageHeader({
  icon,
  title,
  desc,
  badgeClassName,
  iconClassName,
  titleVariant = 'h2',
  descClassName,
}: PageHeaderProps) {
  return (
    <View className="items-center">
      <View
        className={cn(
          'h-14 w-14 items-center justify-center rounded-full bg-brand/10',
          badgeClassName
        )}>
        <Icon as={icon} size={26} className={cn('text-brand', iconClassName)} />
      </View>
      {/* h2 自带下划线，用 border-b-0 去掉以保持头部标题纯文本样式 */}
      <Text variant={titleVariant} className="mt-4 border-b-0 text-center text-brand">
        {title}
      </Text>
      <Text className={cn('mt-1 text-center text-sm text-muted-foreground', descClassName)}>
        {desc}
      </Text>
    </View>
  );
}

export default PageHeader;
export { PageHeader };
export type { PageHeaderProps };
