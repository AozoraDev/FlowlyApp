import { Redirect } from 'expo-router';
import { Bot } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { useModelConfig } from '@/ai/hooks/useModelConfig';
import { ConfigureModelButton } from '@/components/ai-agent/ConfigureModelButton';
import { GlassCard } from '@/components/ui-preSettings/GlassCard';
import { PageHeader } from '@/components/ui-preSettings/PageHeader';
import { ScreenBackground } from '@/components/ui-preSettings/ScreenBackground';
import { CardContent } from '@/components/ui/card';

// 未配置模型引导页：点击 AI-Agent 但本地还没有模型配置时展示，引导前往模型配置页。
// 与 ai-agent 页互斥跳转（本页无配置→引导、有配置→进 AI-Agent），保存配置返回后
// 检测到已配置会自动跳回 AI-Agent，不会停留在已失效的「未配置」提示上
export default function NotConfigModelScreen() {
  const { t } = useTranslation();
  // 与配置页/用户页共用同一 hook：配置保存后 invalidate 自动同步，这里随即跳回 AI-Agent
  const { data: config, isLoading } = useModelConfig();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  // 已配置模型 → 直接进入 AI-Agent 页；本页只服务于「未配置」引导场景
  if (config) {
    return <Redirect href="/ai-agent" />;
  }

  return (
    <ScreenBackground className="justify-center">
      {/* 玻璃卡片容器，与模型配置页同一套液态玻璃风格；外层 justify-center 让卡片在屏幕中垂直居中 */}
      <GlassCard className="py-3">
        <CardContent>
          {/* 头部：图标徽标 + 标题 + 一句说明，让用户明白为什么看到这页 */}
          <PageHeader
            icon={Bot}
            title={t('aiAgent.notConfiguredTitle')}
            desc={t('aiAgent.notConfiguredDesc')}
            titleVariant="h3"
            descClassName="text-xs"
          />

          {/* 去配置：未配置时走配置页；保存返回后本页检测到已配置自动跳回 AI-Agent */}
          <ConfigureModelButton label={t('aiAgent.goConfigure')} className="mt-6" />
        </CardContent>
      </GlassCard>
    </ScreenBackground>
  );
}
