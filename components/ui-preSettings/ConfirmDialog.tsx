import * as DialogPrimitive from '@rn-primitives/dialog';
import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

// 用 Reanimated 包一层 Overlay，让遮罩透明度可动画化
const AnimatedOverlay = Animated.createAnimatedComponent(DialogPrimitive.Overlay);

interface ConfirmDialogProps {
  // 受控开关：由调用方维护 open，onOpenChange 处理关闭（遮罩点击/取消按钮）
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // 标题与说明文案，一般传 i18n 文案
  title: string;
  description?: string;
  // 确认 / 取消按钮文案
  confirmLabel: string;
  cancelLabel: string;
  // 可选警示图标：渲染为红色圆底徽标，强化危险语义
  icon?: LucideIcon;
  // 确认请求进行中：确认按钮转加载态并禁用，防止重复提交
  loading?: boolean;
  // 点击确认按钮的回调（关闭逻辑由调用方决定）
  onConfirm: () => void;
}

// 二次确认弹窗预设：半透明遮罩 + 居中卡片，标题/说明/按钮文案全部由调用方传入。
// 确认按钮固定为红色危险样式；Web 用 fixed 居中，原生端用全屏 flex 居中。
// 进出场动画：遮罩淡入淡出，卡片 spring 放大/缩小 + 上下位移，带一点 overshoot 更"弹"。
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  icon,
  loading,
  onConfirm,
}: ConfirmDialogProps) {
  // 自管挂载态：@rn-primitives/dialog 在 !open 时直接卸载子树（除非 forceMount），做不了退出动画。
  // 这里 forceMount 常驻渲染 + present 门控，动画播完再卸载。
  const [present, setPresent] = React.useState(open);
  const overlayOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.9);
  const cardTranslateY = useSharedValue(24);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  // 卡片透明度跟随遮罩淡入淡出，缩放 + 位移用 spring 制造"弹出/回落"感
  const cardStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
    transform: [{ scale: cardScale.value }, { translateY: cardTranslateY.value }],
  }));

  React.useEffect(() => {
    if (open) {
      // 入场：遮罩淡入，卡片 spring 放大到 1 并上移到原位
      setPresent(true);
      overlayOpacity.value = withTiming(1, { duration: 200 });
      cardScale.value = withSpring(1, { damping: 18, stiffness: 220 });
      cardTranslateY.value = withSpring(0, { damping: 18, stiffness: 220 });
    } else if (present) {
      // 退场：遮罩淡出、卡片缩小下移，播完再卸载，避免"瞬间消失"的硬切
      overlayOpacity.value = withTiming(0, { duration: 150 }, (finished) => {
        if (finished) runOnJS(setPresent)(false);
      });
      cardScale.value = withTiming(0.95, { duration: 150 });
      cardTranslateY.value = withTiming(16, { duration: 150 });
    }
  }, [open, present, overlayOpacity, cardScale, cardTranslateY]);

  if (!present) return null;

  return (
    // asChild：让 Root 不渲染占位 View，避免在父容器（如 Card 的 gap）中留下多余空隙
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} asChild>
      {/* forceMount：关闭时也不卸载子树，让退场动画能完整播完（present 门控兜底卸载） */}
      <DialogPrimitive.Portal forceMount>
        {/* 半透明遮罩：点击遮罩关闭；closeOnPress 仅在 open 时生效，退场瞬间不会误触发重新打开 */}
        <AnimatedOverlay
          forceMount
          closeOnPress={open}
          className="absolute inset-0 z-50 bg-black/60"
          style={overlayStyle}
        />
        {/* Web 端 Radix 渲染到 body，需 fixed 定位居中；原生端渲染到 PortalHost，全屏 flex 居中 */}
        <DialogPrimitive.Content
          forceMount
          className={cn(
            'z-50',
            Platform.OS === 'web'
              ? 'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
              : 'absolute inset-0 items-center justify-center px-8'
          )}>
          {/* 弹窗卡片：实色卡片底，保证叠在遮罩上文字清晰可读。缩放/位移动画放内层，
              避免与 Web 端外层居中的 -translate-x/y 类（同为 transform）互相覆盖 */}
          <Animated.View
            style={cardStyle}
            className={cn(
              'rounded-2xl border border-border bg-card p-6 shadow-xl',
              Platform.OS === 'web' ? 'w-[min(24rem,calc(100vw-2rem))]' : 'w-full max-w-sm'
            )}>
            {/* 可选警示图标徽标：红底圆标，一眼识别这是危险操作 */}
            {icon && (
              <View className="mb-4 h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <Icon as={icon} size={22} className="text-destructive" />
              </View>
            )}
            <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="mt-1 text-sm leading-5 text-muted-foreground">
                {description}
              </DialogPrimitive.Description>
            )}
            {/* 取消 / 确认按钮区 */}
            <View className="mt-6 flex-row gap-3">
              <DialogPrimitive.Close asChild>
                <Button variant="outline" className="flex-1">
                  <Text>{cancelLabel}</Text>
                </Button>
              </DialogPrimitive.Close>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={loading}
                onPress={onConfirm}>
                {loading && <ActivityIndicator size="small" color="white" />}
                <Text className="text-center">{confirmLabel}</Text>
              </Button>
            </View>
          </Animated.View>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default ConfirmDialog;
export { ConfirmDialog };
export type { ConfirmDialogProps };
