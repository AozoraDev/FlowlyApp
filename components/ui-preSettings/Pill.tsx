import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, type PressableProps } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { usePressScale } from '@/lib/usePressScale';

// 用 Reanimated 包一层 Pressable，才能把弹簧缩放动画接到按压缩放上
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// 小药丸按钮预设：图标 + 小号文字，胶囊外观，用于列表中的状态徽标/快捷操作。
// 形状进 base、颜色进 variant，调用方只传 icon/label/variant，无需重复书写样式。
const pillVariants = cva('flex-row items-center gap-1 rounded-full px-2 py-1 active:opacity-70', {
  variants: {
    variant: {
      // 次要操作
      secondary: 'bg-secondary',
      // 品牌蓝主操作（如「明细」）
      brand: 'bg-brand',
      // 中性态（未选中）
      muted: 'bg-muted',
      // 成功态（选中，浅绿底）
      success: 'bg-success-soft',
      // 危险操作（如删除）：红底警示
      danger: 'bg-destructive',
    },
  },
  defaultVariants: { variant: 'secondary' },
});

// 文字/图标颜色与背景 variant 一一对应，避免调用方各自配字色
const pillTextVariants = cva('text-xs font-medium', {
  variants: {
    variant: {
      secondary: 'text-secondary-foreground',
      // 蓝底配白字，保证明暗模式下对比度一致
      brand: 'text-white',
      muted: 'text-muted-foreground',
      success: 'text-success',
      // 红底配白字，与 brand 同样保证明暗对比度
      danger: 'text-white',
    },
  },
  defaultVariants: { variant: 'secondary' },
});

interface PillProps extends PressableProps, VariantProps<typeof pillVariants> {
  // 可选前置图标
  icon?: LucideIcon;
  // 按钮文字（一般传 i18n 文案）
  label: string;
}

// 胶囊按钮：形状与配色由预设接管，disabled 自动置灰；选中态切换等业务逻辑由调用方负责
function Pill({
  icon,
  label,
  variant,
  className,
  disabled,
  style,
  onPressIn,
  onPressOut,
  ...props
}: PillProps) {
  // 按压缩放反馈：与 active:opacity-70 的透明度反馈叠加，胶囊按压更有"弹"感
  const press = usePressScale();

  return (
    <AnimatedPressable
      role="button"
      disabled={disabled}
      className={cn(pillVariants({ variant }), disabled && 'opacity-50', className)}
      style={[press.style, style]}
      onPressIn={(e) => {
        press.onPressIn();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        press.onPressOut();
        onPressOut?.(e);
      }}
      {...props}>
      {icon && <Icon as={icon} size={14} className={pillTextVariants({ variant })} />}
      <Text className={pillTextVariants({ variant })}>{label}</Text>
    </AnimatedPressable>
  );
}

export default Pill;
export { Pill };
export type { PillProps };
