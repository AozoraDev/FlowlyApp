import { Redirect, router } from 'expo-router';
import { Bot, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { useClearModelConfig } from '@/ai/hooks/useClearModelConfig';
import { useModelConfig } from '@/ai/hooks/useModelConfig';
import { GlassCard } from '@/components/ui-preSettings/GlassCard';
import { PageHeader } from '@/components/ui-preSettings/PageHeader';
import { ScreenBackground } from '@/components/ui-preSettings/ScreenBackground';
import { useAppToast } from '@/components/ui-preSettings/Toast';
import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { UserDetailCard } from '@/components/user/UserDetailCard';

// 模型信息页：已配置模型时展示当前配置（接口地址 + 模型名），并提供「清除配置」。
// 清除成功后删除本地缓存并跳转到配置页，便于立即重新配置。
export default function ModelInfoScreen() {
  const { t } = useTranslation();
  const toast = useAppToast();

  // 已保存配置：与配置页/用户页共用同一 hook，保存/清除后 invalidate 自动同步
  const { data: config, isLoading } = useModelConfig();

  // 清除配置：复用公共 mutation（删本地存储 + 失效缓存），
  // 页面级副作用（Toast / 跳转）在此补充；replace 让返回键直接回用户页，避免退回到已失效的模型信息页
  const clearMutation = useClearModelConfig();
  const handleClear = () => {
    clearMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success(t('user.clearConfigSuccess'));
        router.replace('/model-config');
      },
      onError: (err) => {
        console.error(err);
        toast.error(t('user.clearConfigFailed'));
      },
    });
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  // 防御：正常只能从用户页带配置进入；缓存被外部清除时回退到配置页，避免空信息页
  if (!config) {
    return <Redirect href="/model-config" />;
  }

  return (
    <ScreenBackground>
      {/* 玻璃卡片容器，与模型配置页同一套液态玻璃风格 */}
      <GlassCard className="py-3">
        <CardContent>
          {/* 头部：图标徽标 + 标题 + 一句说明，一眼清楚当前展示的是什么 */}
          <PageHeader
            icon={Bot}
            title={t('user.modelInfoTitle')}
            desc={t('user.modelInfoDesc')}
            titleVariant="h3"
            descClassName="text-xs"
          />

          {/* 已配置信息：接口地址 + 模型名称，一行一项收进同一张卡片 */}
          <UserDetailCard
            className="mt-6"
            rows={[
              { label: t('user.modelInfoUrl'), value: config.url },
              { label: t('user.modelInfoModel'), value: config.model },
            ]}
          />

          {/* 清除配置：危险操作，删除本地缓存并跳回配置页重新配置 */}
          <View className="mt-6">
            <Button variant="destructive" disabled={clearMutation.isPending} onPress={handleClear}>
              <Icon as={Trash2} size={16} />
              <Text>{t('user.clearConfig')}</Text>
            </Button>
          </View>

          {/* 取消：不操作直接返回上一页，与新建项目页同一交互 */}
          <View className="mt-3">
            <Button variant="link" className="self-center" onPress={() => router.back()}>
              <Text>{t('home.cancel')}</Text>
            </Button>
          </View>
        </CardContent>
      </GlassCard>
    </ScreenBackground>
  );
}
