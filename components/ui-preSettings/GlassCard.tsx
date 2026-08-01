import { LinearGradient } from 'expo-linear-gradient';
import { cssInterop, useColorScheme } from 'nativewind';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// 让 LinearGradient 支持 nativewind className（与 Icon 一致，通过 cssInterop 打通样式）
cssInterop(LinearGradient, {
  className: {
    target: 'style',
  },
});

// 液态玻璃背景渐变：亮色浅蓝→白，暗色深蓝玻璃，留一点透明度保持"透过感"
const GLASS_LIGHT = ['rgba(214, 235, 255, 0.9)', 'rgba(255, 255, 255, 0.96)'] as const;
const GLASS_DARK = ['rgba(37, 72, 140, 0.5)', 'rgba(23, 32, 64, 0.55)'] as const;
// 顶部反光带：模拟玻璃边缘的"捕捉光"，让卡片更有立体感
const HIGHLIGHT_LIGHT = ['rgba(255, 255, 255, 0.45)', 'rgba(255, 255, 255, 0)'] as const;
const HIGHLIGHT_DARK = ['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0)'] as const;

type GlassCardProps = React.ComponentProps<typeof Card> & {
  // 可选覆盖玻璃/高光渐变配色，默认跟随亮暗主题自动切换
  glassColors?: readonly [string, string];
  highlightColors?: readonly [string, string];
};

// 液态玻璃卡片预设：渐变玻璃背景 + 顶部反光带 + 彩色投影，一处封装全局复用。
// 渐变层绝对定位铺在内容之下，圆角由渐变层自带 borderRadius 裁切，
// 避免给外层加 overflow-hidden 把 iOS 阴影一起裁掉。
function GlassCard({
  className,
  glassColors,
  highlightColors,
  children,
  ...props
}: GlassCardProps) {
  const { colorScheme } = useColorScheme();
  // 按当前主题选择玻璃渐变配色，暗色模式用深色玻璃保持质感一致
  const isDark = colorScheme === 'dark';
  const bgColors = glassColors ?? (isDark ? GLASS_DARK : GLASS_LIGHT);
  const topColors = highlightColors ?? (isDark ? HIGHLIGHT_DARK : HIGHLIGHT_LIGHT);

  return (
    <Card
      // 覆盖默认白底为半透明玻璃，白色描边 + 品牌蓝投影（暗色改深色描边/投影）
      className={cn(
        'border-white/70 bg-transparent shadow-lg shadow-brand/30 dark:border-white/10 dark:shadow-black/60',
        className
      )}
      {...props}>
      {/* 背景渐变：浅蓝到白（暗色为深蓝玻璃），绝对定位铺满卡片 */}
      <LinearGradient
        colors={bgColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="absolute inset-0 rounded-xl"
      />
      {/* 顶部高光：玻璃反光带，自顶部向下渐隐，强化液态玻璃质感 */}
      <LinearGradient colors={topColors} className="absolute inset-x-0 top-0 h-12 rounded-t-xl" />
      {children}
    </Card>
  );
}

export default GlassCard;
export { GlassCard };
export type { GlassCardProps };
