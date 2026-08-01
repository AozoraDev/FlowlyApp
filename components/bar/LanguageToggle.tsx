import { Languages } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import Pill from '@/components/ui-preSettings/Pill';
import { changeLanguage, type Language } from '@/i18n';

// 语言切换胶囊：只显示当前语言（CN/EN），点击即切换到另一种语言，无需展示两个选项。
// 直接用 Pill 预设承载「图标 + 文案」，样式、按压反馈、disabled 态全部由预设接管。
function LanguageToggle() {
  const { i18n, t } = useTranslation();
  // 兼容 zh-CN/en-US 等带地区后缀的设备语言，仅取首段判断
  const current: Language = i18n.language.startsWith('en') ? 'en' : 'zh';

  // 显示目标语言而非当前语言：中文界面显示 EN（点击切到英文），英文界面显示 CN
  const toggle = () => changeLanguage(current === 'en' ? 'zh' : 'en');

  return (
    <Pill
      icon={Languages}
      label={current === 'en' ? 'CN' : 'EN'}
      variant="success"
      onPress={toggle}
      accessibilityLabel={t('common.languageToggle')}
    />
  );
}

export default LanguageToggle;
