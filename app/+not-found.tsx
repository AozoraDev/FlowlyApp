import { Link, Stack } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/text';

// 404 页面：路由不存在时展示，文案随 i18n 当前语言切换
export default function NotFoundScreen() {
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen options={{ title: t('notFound.title') }} />
      <View>
        <Text>{t('notFound.desc')}</Text>

        <Link href="/">
          <Text>{t('notFound.goHome')}</Text>
        </Link>
      </View>
    </>
  );
}
