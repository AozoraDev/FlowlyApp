import { usePathname, useRouter, type Href } from 'expo-router';
import { Bot, House, User, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAuthSession } from '@/hooks/useAuthSession';

// 底部导航项配置项：图标组件 + i18n 文案 + 目标路由
interface TabItem {
  key: string;
  label: string;
  icon: LucideIcon;
  href: Href;
}

// 底部栏：与导航条同款深海军蓝背景，向下延伸到设备底部安全区。
// 提供「首页 / AI-Agent / 用户」底部导航入口，点击切换对应路由，并用 usePathname 高亮当前所在页。
// AI-Agent 仅在登录后展示（中间的第三个入口），未登录时保持左右两个入口的布局
function BottomBar() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  // 登录态决定 AI-Agent 入口是否可见：订阅登录/登出事件，状态变化时自动增删该项
  const { session } = useAuthSession();

  // 底部导航项配置：图标 + i18n 文案 + 目标路由；首页即根路径 /
  const tabs: TabItem[] = [
    { key: 'home', label: t('common.home'), icon: House, href: '/' },
    { key: 'user', label: t('common.user'), icon: User, href: '/user' },
  ];
  // AI-Agent 插在中间（首页与用户之间），登录后才渲染，保证已登录时三入口、未登录时两入口
  if (session) {
    tabs.splice(1, 0, {
      key: 'ai-agent',
      label: t('common.aiAgent'),
      icon: Bot,
      href: '/ai-agent',
    });
  }

  return (
    <SafeAreaView edges={['bottom']} className="bg-[#264778]">
      <View className="h-14 flex-row items-center justify-around px-5">
        {tabs.map(({ key, label, icon, href }) => {
          // 当前路径与目标路由一致时高亮为白色，否则置灰；
          // /notlogin 是首页的未登录引导页、/not-config-model 是 AI-Agent 的未配置引导页，
          // 都归属对应 tab，因此也高亮所属入口
          const isActive =
            pathname === href ||
            (pathname === '/notlogin' && href === '/') ||
            (pathname === '/not-config-model' && href === '/ai-agent');
          const color = isActive ? 'text-white' : 'text-slate-400';
          return (
            <Pressable
              key={key}
              onPress={() => router.replace(href)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              className="items-center gap-1">
              <Icon as={icon} size={20} className={color} />
              <Text className={`text-xs ${color}`}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export default BottomBar;
export { BottomBar };
