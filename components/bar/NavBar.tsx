import { Image, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import LanguageToggle from '@/components/bar/LanguageToggle';
import { Text } from '@/components/ui/text';

// 导航条：深海军蓝背景向上延伸到状态栏区域，左侧 logo + 白色标题，右侧语言切换按钮。
// 用 SafeAreaView 处理顶部刘海/状态栏安全区，三端（iOS/Android/Web）行为一致。
function NavBar() {
  // 点击 logo 或标题时回到首页（/ 路由）
  const goHome = () => router.navigate('/');

  return (
    <SafeAreaView edges={['top']} className="bg-[#264778]">
      <View className="h-14 flex-row items-center justify-between px-5">
        <Pressable onPress={goHome} className="flex-row items-center gap-2">
          <Image source={require('../../assets/imgs/logo.png')} className="h-7 w-7" resizeMode="contain" />
          <Text className="text-xl font-bold text-white">Flowly</Text>
        </Pressable>
        <LanguageToggle />
      </View>
    </SafeAreaView>
  );
}

export default NavBar;
export { NavBar };
