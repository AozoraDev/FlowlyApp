import type { LucideIcon } from 'lucide-react-native';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';

type FormFieldProps = {
  // 字段标签文案
  label: string;
  // 字段级错误文案，为空时不渲染错误提示
  error?: string | null;
  // 标签前置图标，与标签文字同为主题蓝色
  icon?: LucideIcon;
} & ComponentProps<typeof Input>;

// 表单字段预设：统一「标签 + 输入框 + 错误提示」的布局与样式，
// 登录/注册共用；输入框的 placeholder、secureTextEntry、autoComplete 等属性通过 props 透传
function FormField({ label, error, icon, ...inputProps }: FormFieldProps) {
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-1.5">
        {icon && <Icon as={icon} size={14} className="text-brand" />}
        <Text className="text-sm font-medium text-brand">{label}</Text>
      </View>
      {/* 输入框样式：黑色边框、大圆角、内容水平居中、小号字体（native/web 均生效）。
          native 侧基础 Input 是 text-lg 行高，此处压成 text-sm 后需同步覆盖行高并去掉
          垂直内边距，保证文本在固定高度里上下居中。
          key 绑定 placeholder：切换语言时文案变化，强制重建原生输入框，
          规避 RN 在 Android 上动态修改 placeholder 导致提示词消失的 bug */}
      <Input
        key={inputProps.placeholder}
        {...inputProps}
        className="native:py-0 native:leading-5 native:text-sm rounded-2xl border-black text-center text-sm"
      />
      {error && <Text className="text-xs text-destructive">{error}</Text>}
    </View>
  );
}

export default FormField;
export { FormField };
