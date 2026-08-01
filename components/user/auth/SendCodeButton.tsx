import { Send } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BrandButton } from '@/components/ui-preSettings/Button';

// 发送验证码后的倒计时秒数：期间按钮禁用，防止频繁重发
const COUNTDOWN_SECONDS = 10;

type SendCodeButtonProps = {
  // 发送验证码的回调；返回 false（如表单校验未通过）时不进入倒计时
  onSend: () => Promise<boolean>;
  // 外部禁用（如提交注册中）
  disabled?: boolean;
};

// 发送/重发验证码按钮：点击触发 onSend，成功后进入 10s 倒计时并禁用。
// 文案三态：未发送过「获取验证码」/ 已发送过「重新发送验证码」/ 倒计时中「N 秒后重发」。
function SendCodeButton({ onSend, disabled }: SendCodeButtonProps) {
  const { t } = useTranslation();
  const [seconds, setSeconds] = useState(0);
  const [sending, setSending] = useState(false);
  const sentRef = useRef(false);

  // 倒计时每秒递减，归零后自动停止（依赖 seconds > 0 切换，避免每秒重建定时器）
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setInterval(() => {
      setSeconds((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [seconds > 0]);

  // 点击发送：调用 onSend，成功后启动倒计时并标记「已发送过」
  const handlePress = async () => {
    setSending(true);
    try {
      const ok = await onSend();
      if (ok) {
        sentRef.current = true;
        setSeconds(COUNTDOWN_SECONDS);
      }
    } finally {
      setSending(false);
    }
  };

  // 倒计时 / 发送中 / 外部禁用时均不可点击
  const inactive = seconds > 0 || sending || disabled;

  let label: string;
  if (sending) {
    label = t('auth.submitting');
  } else if (seconds > 0) {
    label = t('auth.codeCountdown', { seconds });
  } else if (sentRef.current) {
    label = t('auth.resendCode');
  } else {
    label = t('auth.getCode');
  }

  // 使用品牌蓝预设按钮（BrandButton），与提交按钮保持统一的预设样式
  return <BrandButton icon={Send} label={label} onPress={handlePress} disabled={inactive} />;
}

export default SendCodeButton;
export { SendCodeButton };
