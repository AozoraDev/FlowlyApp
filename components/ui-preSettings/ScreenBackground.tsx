import { View } from 'react-native';

import { cn } from '@/lib/utils';

type ScreenBackgroundProps = React.ComponentProps<typeof View> & {
  // 是否保留角落装饰光斑，不需要装饰的页面可关闭
  withCircles?: boolean;
  // 是否带默认 p-6 内边距；列表页等需要自己管 contentContainer 内边距的场景可关闭
  withPadding?: boolean;
};

// 全屏页面背景预设：亮色浅蓝（暗色沿用主题深色）+ 对角两枚品牌色柔光圆斑，
// 统一所有页面的背景基调，新增页面直接复用，避免逐页手写同样的背景与装饰。
function ScreenBackground({
  className,
  withCircles = true,
  withPadding = true,
  children,
  ...props
}: ScreenBackgroundProps) {
  return (
    <View
      className={cn(
        'relative flex-1 bg-[#e1efff] dark:bg-background',
        withPadding && 'p-6',
        className
      )}
      {...props}>
      {withCircles ? (
        <>
          {/* 背景装饰：品牌色柔和光斑，铺在内容后方增加画面层次，边缘溢出由屏幕自然裁切 */}
          <View className="pointer-events-none absolute -left-16 top-16 h-48 w-48 rounded-full bg-brand/10" />
          <View className="pointer-events-none absolute -right-20 bottom-24 h-64 w-64 rounded-full bg-brand/10 dark:bg-brand/5" />
        </>
      ) : null}
      {children}
    </View>
  );
}

export default ScreenBackground;
export { ScreenBackground };
export type { ScreenBackgroundProps };
