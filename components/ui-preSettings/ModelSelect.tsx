import * as DialogPrimitive from '@rn-primitives/dialog';
import { Check, ChevronDown } from 'lucide-react-native';
import * as React from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface ModelSelectProps {
  // 可选模型列表（一般来自测试链接接口返回）
  options: string[];
  // 当前选中值；为空时触发器展示 placeholder
  value: string;
  // 选中回调：点选列表项后触发并关闭弹层
  onChange: (value: string) => void;
  // 未选中时的占位文案
  placeholder: string;
  // 弹层标题
  title: string;
  disabled?: boolean;
}

// 模型下拉选择框：触发器样式对齐 Input（描边圆角底），点击弹出居中弹层，
// 弹层内为可滚动模型列表，选中项品牌色高亮 + 右侧对勾。模型列表可能很长（如 Ollama），
// 列表区固定最大高度滚动，不撑爆弹层。跨平台：Web 端弹层 fixed 居中，原生端全屏 flex 居中。
function ModelSelect({ options, value, onChange, placeholder, title, disabled }: ModelSelectProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      {/* 触发器：长得像输入框的下拉控件，展示当前模型或占位文案 */}
      <Pressable
        role="button"
        disabled={disabled}
        accessibilityState={{ disabled }}
        onPress={() => setOpen(true)}
        className={cn(
          'h-8 flex-row items-center justify-between rounded-md border border-input bg-background px-3',
          disabled && 'opacity-50'
        )}>
        <Text className={cn('text-sm', !value && 'text-muted-foreground')} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Icon as={ChevronDown} size={16} className="ml-2 text-muted-foreground" />
      </Pressable>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          {/* 半透明遮罩：点击遮罩关闭弹层 */}
          <DialogPrimitive.Overlay
            closeOnPress={open}
            className="absolute inset-0 z-50 bg-black/60"
          />
          {/* Web 端 Radix 渲染到 body，需 fixed 定位居中；原生端渲染到 PortalHost，全屏 flex 居中 */}
          <DialogPrimitive.Content
            className={cn(
              'z-50',
              Platform.OS === 'web'
                ? 'fixed left-1/2 top-1/2 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2'
                : 'absolute inset-0 items-center justify-center px-8'
            )}>
            {/* 弹层卡片：实色卡片底，保证叠在遮罩上文字清晰可读；宽度撑满容器并在原生端限制最大宽度，
                避免长模型名把卡片撑得过宽（Web 端宽度由 Content 的 w-* 决定，这里铺满即可） */}
            <View
              className={cn(
                'w-full rounded-2xl border border-border bg-card p-5 shadow-xl',
                Platform.OS === 'web' ? '' : 'max-w-md'
              )}>
              <DialogPrimitive.Title className="text-base font-semibold">
                {title}
              </DialogPrimitive.Title>
              {/* 模型列表：超出最大高度滚动，避免长列表撑爆弹层 */}
              <ScrollView className="mt-3 max-h-72">
                {options.map((option) => {
                  const selected = option === value;
                  return (
                    <Pressable
                      key={option}
                      role="button"
                      accessibilityState={{ selected }}
                      className={cn(
                        'flex-row items-center justify-between rounded-md px-3 py-2.5',
                        selected ? 'bg-brand/10' : 'active:bg-accent'
                      )}
                      onPress={() => {
                        onChange(option);
                        setOpen(false);
                      }}>
                      {/* 模型名可能很长（如 Ollama 的 `llama3.2:latest`），不截断、允许换行完整展示 */}
                      <Text
                        className={cn('flex-1 text-sm', selected && 'font-medium text-brand')}>
                        {option}
                      </Text>
                      {selected && <Icon as={Check} size={16} className="ml-2 text-brand" />}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

export default ModelSelect;
export { ModelSelect };
export type { ModelSelectProps };
