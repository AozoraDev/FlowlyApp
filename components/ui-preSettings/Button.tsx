import type { LucideIcon } from 'lucide-react-native';

import { Button, type ButtonProps } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

// 预设内部接管文字颜色（Icon/Text 强制白色），调用方只需传入图标与文案，无需重复书写样式。
interface BrandButtonProps extends ButtonProps {
  // 可选前置图标
  icon?: LucideIcon;
  // 按钮文字（一般传 i18n 文案）
  label: string;
}

// 品牌蓝主操作按钮预设：蓝底白字，按下/悬停同色加深。
function BrandButton({ icon, label, className, ...props }: BrandButtonProps) {
  return (
    <Button
      variant="default"
      className={cn('bg-brand hover:bg-brand/90 active:bg-brand/90', className)}
      {...props}>
      {icon && <Icon as={icon} size={16} className="text-white" />}
      <Text className="text-white">{label}</Text>
    </Button>
  );
}

export default BrandButton;
export { BrandButton };
export type { BrandButtonProps };
