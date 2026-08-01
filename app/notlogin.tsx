import { useTranslation } from 'react-i18next';

import { ImageBackground, View } from 'react-native';

import { Divider } from '@/components/ui-preSettings/Divider';
import { Text } from '@/components/ui/text';

// 未登录页：background.png 作为整页背景，标语中品牌名用深蓝、描述用黑色，居中展示
export default function NotLogin() {
  const { t } = useTranslation();

  return (
    <ImageBackground
      source={require('../assets/imgs/background.png')}
      resizeMode="cover"
      className="flex-1"
    >
      {/* px-8 给整体左右留白：Divider 为 w-full，留白放父容器才能把线收窄 */}
      <View className="flex-1 items-center justify-center px-8">
        <Text className="font-semibold" style={{ color: '#155dfc', fontSize: 30, lineHeight: 36 }}>
          {t('common.sloganBrand')}
        </Text>
        <Text className="font-semibold" style={{ color: '#000', fontSize: 26, lineHeight: 36 }}>
          {t('common.sloganDesc')}
        </Text>
        {/* 预设品牌色下划线：左右留白，避免通栏 */}
        <Divider className="mt-3" />
        {/* 灰色引导文案：text-center 保证换行时行内也居中 */}
        <Text className="mt-3 text-center text-muted-foreground" style={{ fontSize: 18 }}>
          {t('common.registerCta')}
        </Text>
      </View>
    </ImageBackground>
  );
}
