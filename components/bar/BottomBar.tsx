import { usePathname, useRouter, type Href } from 'expo-router';
import { House, User, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

// 底部导航项配置项：图标组件 + i18n 文案 + 目标路由
interface TabItem {
  key: string;
  label: string;
  icon: LucideIcon;
  href: Href;
}

// 底部栏：与导航条同款深海军蓝背景，向下延伸到设备底部安全区。
// 提供「首页 / 用户」两个底部导航入口，点击切换对应路由，并用 usePathname 高亮当前所在页。
function BottomBar() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();

  // 底部导航项配置：图标 + i18n 文案 + 目标路由
  // 首页即根路径 /，直接指向路由入口
  const tabs: TabItem[] = [
    { key: 'home', label: t('common.home'), icon: House, href: '/' },
    { key: 'user', label: t('common.user'), icon: User, href: '/user' },
  ];

  return (
    <SafeAreaView edges={['bottom']} className="bg-[#264778]">
      <View className="h-14 flex-row items-center justify-around px-5">
        {tabs.map(({ key, label, icon, href }) => {
          // 当前路径与目标路由一致时高亮为白色，否则置灰；
          // /notlogin 是首页的未登录引导页，归属首页 tab，因此也高亮「首页」
          const isActive = pathname === href || (pathname === '/notlogin' && href === '/');
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
