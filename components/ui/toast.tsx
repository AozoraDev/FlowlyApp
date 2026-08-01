import { Portal } from '@rn-primitives/portal';
import * as React from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

// Toast 自动消失时长（毫秒）
const TOAST_DURATION = 2500;

type ToastVariant = 'default' | 'success' | 'destructive';

type ToastItem = {
  id: number;
  title: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  showToast: (title: string, variant?: ToastVariant) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

/**
 * Global toast provider. Renders toasts on top of the app via the existing
 * `PortalHost` in the root layout. Mount once in `_layout.tsx` and consume
 * with `useToast().showToast(title, variant?)`.
 */
function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const idRef = React.useRef(0);
  const timersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  const dismiss = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = React.useCallback(
    (title: string, variant: ToastVariant = 'default') => {
      const id = ++idRef.current;
      // 最多同时保留最后 2 条，避免旧 toast 堆积
      setToasts((prev) => [...prev.slice(-1), { id, title, variant }]);
      timersRef.current.push(setTimeout(() => dismiss(id), TOAST_DURATION));
    },
    [dismiss]
  );

  // 组件卸载时清理所有待触发的自动消失定时器
  React.useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const value = React.useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <Portal name="toast">
          <View
            pointerEvents="none"
            style={{ paddingTop: insets.top + 8 }}
            className="absolute inset-x-0 top-0 items-center gap-2 px-4">
            {toasts.map((toast) => (
              // 入场动画：从顶部下滑淡入，弹出瞬间更柔和（退出依赖 dismiss 定时器，瞬时移除）
              <Animated.View
                key={toast.id}
                entering={FadeInDown.duration(200)}
                className={cn(
                  'w-full max-w-md rounded-xl px-4 py-3 shadow-lg',
                  toast.variant === 'destructive' && 'bg-destructive',
                  toast.variant === 'success' && 'bg-success-soft',
                  toast.variant === 'default' && 'border border-border bg-card'
                )}>
                <Text
                  className={cn(
                    'text-center text-sm font-medium',
                    toast.variant === 'destructive' && 'text-white',
                    toast.variant === 'success' && 'text-success',
                    toast.variant === 'default' && 'text-card-foreground'
                  )}>
                  {toast.title}
                </Text>
              </Animated.View>
            ))}
          </View>
        </Portal>
      )}
    </ToastContext.Provider>
  );
}

function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

export { ToastProvider, useToast };
