import * as React from 'react';

import { ToastProvider as BaseToastProvider, useToast } from '@/components/ui/toast';

// 业务级 Toast 预设：把「成功/失败/警告」语义映射到固定配色——成功浅绿、失败/警告红色。
// 业务代码只关心语义（toast.success/error/warning），不再自行传 variant 或选颜色。
type AppToast = {
  success: (title: string) => void;
  error: (title: string) => void;
  warning: (title: string) => void;
};

const AppToastContext = React.createContext<AppToast | null>(null);

// 内层桥接：读取基础 useToast，把语义方法注入 AppToast 上下文（必须挂在基础 Provider 内）
function AppToastBridge({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();
  const value = React.useMemo<AppToast>(
    () => ({
      success: (title) => showToast(title, 'success'),
      error: (title) => showToast(title, 'destructive'),
      warning: (title) => showToast(title, 'destructive'),
    }),
    [showToast]
  );
  return <AppToastContext.Provider value={value}>{children}</AppToastContext.Provider>;
}

// 预设整体：内部已挂载基础 ToastProvider + 语义上下文，根布局直接用它替换基础 Provider
function AppToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <BaseToastProvider>
      <AppToastBridge>{children}</AppToastBridge>
    </BaseToastProvider>
  );
}

function useAppToast() {
  const ctx = React.useContext(AppToastContext);
  if (!ctx) {
    throw new Error('useAppToast must be used within an AppToastProvider');
  }
  return ctx;
}

export default AppToastProvider;
export { AppToastProvider, useAppToast };
