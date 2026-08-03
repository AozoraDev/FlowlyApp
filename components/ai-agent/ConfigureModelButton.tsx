import { router } from 'expo-router';
import { Settings2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { useModelConfig } from '@/ai/hooks/useModelConfig';
import { BrandButton, type BrandButtonProps } from '@/components/ui-preSettings/Button';

interface ConfigureModelButtonProps extends Omit<BrandButtonProps, 'icon' | 'label' | 'onPress'> {
  // 文案：默认「配置模型」，调用方（如未配置引导页）可覆盖为「去配置」
  label?: string;
}

// 配置模型按钮预设：统一「已配置→模型信息页 / 未配置→模型配置页」的跳转逻辑。
// 用户页与 AI-Agent 未配置引导页共用，避免两处重复拼 BrandButton + Settings2 + router.push。
// 未配置场景下配置为空，自动走「未配置→配置页」，因此两处效果一致。
function ConfigureModelButton({ label, className, ...props }: ConfigureModelButtonProps) {
  const { t } = useTranslation();
  // 与配置页/用户页共用同一 hook：保存/清除后 invalidate 自动同步
  const { data: modelConfig } = useModelConfig();

  return (
    <BrandButton
      icon={Settings2}
      label={label ?? t('user.configureModel')}
      className={className}
      onPress={() => router.push(modelConfig ? '/model-info' : '/model-config')}
      {...props}
    />
  );
}

export default ConfigureModelButton;
export { ConfigureModelButton };
export type { ConfigureModelButtonProps };
