import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  // 字段标签文案（调用方已翻译）
  label: string;
  // 标签前置图标，登录/注册表单使用；不传则不渲染
  icon?: LucideIcon;
  // 图标颜色类（默认跟随 Icon 基础色；登录/注册传 text-brand）
  iconClassName?: string;
  // 标签文字颜色类（默认继承文本色；登录/注册传 text-brand）
  labelClassName?: string;
  // 右侧实时字符计数：传当前值与上限，渲染「当前长度/上限」
  charCount?: { value: string; max: number };
  // 控件下方的辅助说明（如手动输入兜底时的提示）
  hint?: string;
  // 是否展示字段错误：失焦或提交过后才传 true，避免初始渲染直接闪出「必填」
  showError?: boolean;
  // zod 字段错误：message 为 i18n key（或 issue 对象），组件内统一提取并翻译
  errors?: readonly unknown[];
  // 外层容器类（页内间距如 mt-6 由调用方控制）
  className?: string;
  // 输入控件：基础 Input / ModelSelect 下拉 / 手动输入兜底均可
  children: ReactNode;
}

// 表单字段预设：统一「标签行 + 输入控件 + 错误提示」的布局，
// 新建项目 / 添加明细 / 模型配置 / 登录注册 多个表单页共用。控件通过 children 传入，
// 标签左侧可选前置图标（登录/注册的蓝色 icon + 标签），右侧可选字符计数，
// 错误提取与翻译逻辑收进组件内部，避免各页复制粘贴。
function FormField({
  label,
  icon,
  iconClassName,
  labelClassName,
  charCount,
  hint,
  showError,
  errors,
  className,
  children,
}: FormFieldProps) {
  const { t } = useTranslation();
  return (
    <View className={cn('gap-1.5', className)}>
      {/* 标签行：左侧「图标 + 标签」，右侧可选实时字符计数 */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          {icon && <Icon as={icon} size={14} className={iconClassName} />}
          <Text className={cn('text-xs font-medium', labelClassName)}>{label}</Text>
        </View>
        {charCount && (
          <Text className="text-xs tabular-nums text-muted-foreground">
            {charCount.value.length}/{charCount.max}
          </Text>
        )}
      </View>

      {children}

      {/* 控件下方辅助说明（仅模型字段手动输入兜底时使用） */}
      {hint && <Text className="text-xs text-muted-foreground">{hint}</Text>}

      {/* 字段错误：运行期 zod 标准 schema 的错误 message 是「i18n key 字符串」，兼容 issue 对象两种形态 */}
      {showError &&
        errors?.map((err) => {
          const msg =
            typeof err === 'string'
              ? err
              : err && typeof err === 'object'
                ? (err as { message?: string }).message
                : undefined;
          return msg ? (
            <Text key={msg} className="text-xs text-destructive">
              {t(msg)}
            </Text>
          ) : null;
        })}
    </View>
  );
}

export default FormField;
export { FormField };
