import '@/global.css';

import { useEffect } from 'react';
import { Platform, View } from 'react-native';

import { PortalHost } from '@rn-primitives/portal';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { ThemeProvider } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { I18nextProvider } from 'react-i18next';

import BottomBar from '@/components/bar/BottomBar';
import NavBar from '@/components/bar/NavBar';
import AppToastProvider from '@/components/ui-preSettings/Toast';
import i18n, { loadSavedLanguage } from '@/i18n';
import { queryClient } from '@/lib/queryClient';
import { NAV_THEME } from '@/lib/theme';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

// 将 <html lang> 与当前语言保持同步（仅 Web 生效）。
// 静态渲染出的 lang 取自构建机环境，浏览器端需在此校准为用户实际语言
function syncHtmlLang(lang: string) {
  if (Platform.OS === 'web') {
    document.documentElement.lang = lang;
  }
}

export default function RootLayout() {
  const { colorScheme } = useColorScheme();

  // 先校准为初始语言（设备语言），再恢复用户上次选择的语言偏好：
  // 初始语言已按设备语言同步初始化，这里再异步覆盖为用户手动选择过的语言（若有）
  useEffect(() => {
    syncHtmlLang(i18n.resolvedLanguage ?? 'zh');
    void (async () => {
      const lang = await loadSavedLanguage();
      await i18n.changeLanguage(lang);
      syncHtmlLang(lang);
    })();
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      {/* TanStack Query Provider：全局共享 useQuery/useMutation 缓存 */}
      <QueryClientProvider client={queryClient}>
        {/* Toast 预设宿主：业务代码通过 useAppToast() 的 success/error/warning 弹出提示 */}
        <AppToastProvider>
          <ThemeProvider value={NAV_THEME[colorScheme ?? 'light']}>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
            {/* 全局导航骨架：顶部导航条 + 路由内容区 + 底部栏，中间区域随路由切换（home/user） */}
            <View className="flex-1">
              <NavBar />
              <View className="flex-1 bg-background">
                {/* 统一隐藏 Stack 默认导航头，改用自定义导航条；各页面只负责内容区 */}
                <Stack screenOptions={{ headerShown: false }} />
              </View>
              <BottomBar />
            </View>
            <PortalHost />
          </ThemeProvider>
        </AppToastProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
