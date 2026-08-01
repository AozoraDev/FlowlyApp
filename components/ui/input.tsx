import * as React from 'react';
import { Platform, TextInput } from 'react-native';

import { cn } from '@/lib/utils';

/**
 * A base TextInput component with theme-aware styling.
 * Placeholder color is set via nativewind's `placeholder:` variant,
 * which maps to `placeholderTextColor` under the hood.
 */
const Input = React.forwardRef<
  React.ElementRef<typeof TextInput>,
  React.ComponentPropsWithoutRef<typeof TextInput>
>(({ className, style, ...props }, ref) => {
  return (
    <TextInput
      ref={ref}
      className={cn(
        'native:h-12 native:py-0 native:text-lg native:leading-[1.2] h-10 w-full rounded-md border border-input bg-background px-3 text-base text-foreground placeholder:text-muted-foreground web:flex web:items-center web:py-0 web:text-sm web:leading-6',
        className
      )}
      // 原生端垂直居中：
      // - textAlignVertical 显式居中（iOS 15+ / Android 均支持）；
      // - Android 默认 includeFontPadding 会在文字上下加内衬导致内容偏上，关掉它；
      // - 行高压到贴近字体自然行高（1.2），避免 Android 把多出的行距压在文字下方造成视觉上偏
      {...(Platform.OS === 'android' ? { includeFontPadding: false } : {})}
      style={[Platform.OS !== 'web' ? { textAlignVertical: 'center' } : undefined, style]}
      {...props}
    />
  );
});

Input.displayName = 'Input';

export { Input };
