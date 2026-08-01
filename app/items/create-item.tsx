import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Minus, Plus, WalletCards, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { z } from 'zod';

import { BrandButton } from '@/components/ui-preSettings/Button';
import { GlassCard } from '@/components/ui-preSettings/GlassCard';
import { ScreenBackground } from '@/components/ui-preSettings/ScreenBackground';
import { useAppToast } from '@/components/ui-preSettings/Toast';
import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useAuthSession } from '@/hooks/useAuthSession';
import { queryClient } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { createItem } from '@/supabase/items';

// 添加明细表单校验 schema：名称必填（≤50 字）、金额为大于 0 的数字；错误文案用 i18n key，展示时再翻译。
// isIncome 收支方向由「支出/收入」切换按钮维护，默认支出（false）。schema 即类型唯一来源。
const createItemFormSchema = z.object({
  reason: z.string().trim().min(1, 'home.reasonRequired').max(50, 'home.reasonTooLong'),
  isIncome: z.boolean(),
  amount: z
    .string()
    .trim()
    .min(1, 'home.amountRequired')
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, 'home.amountInvalid'),
});
type CreateItemForm = z.infer<typeof createItemFormSchema>;

// 收支类型语义色映射：选中态用填充底（收入绿/支出红），未选中为描边态。
// 用静态字符串表避免动态拼接 Tailwind 类名（JIT 无法编译模板插值出的类名）
const TYPE_COLORS = {
  expense: {
    selected: 'border-destructive bg-destructive active:bg-destructive/90',
    label: 'text-destructive',
  },
  income: {
    selected: 'border-success bg-success active:bg-success/90',
    label: 'text-success',
  },
} as const;

// 收支类型切换按钮：支出/收入二选一，选中态填充语义色并配白字，未选中用描边 + 语义色文字。
// 可复用于收入与支出两种按钮，差异只由 type / selected 两个 props 控制
function TypeToggleButton({
  selected,
  type,
  icon,
  label,
  disabled,
  onPress,
}: {
  selected: boolean;
  type: keyof typeof TYPE_COLORS;
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const colors = TYPE_COLORS[type];
  return (
    <Button
      variant="outline"
      className={cn('flex-1', selected ? colors.selected : undefined)}
      disabled={disabled}
      accessibilityState={{ selected }}
      onPress={onPress}>
      <Icon as={icon} size={16} className={selected ? 'text-white' : colors.label} />
      <Text className={selected ? 'text-white' : colors.label}>{label}</Text>
    </Button>
  );
}

// 添加明细页：从路由取 sectionId，填写名称、收支方向、金额后提交到 items 表，uid 取当前登录用户。
// 样式沿用新建项目页的玻璃卡片表单；提交成功返回明细页并刷新列表。
export default function CreateItemScreen() {
  const { session, loading } = useAuthSession();
  const { t } = useTranslation();
  const toast = useAppToast();
  // 路由参数：sectionId 为所在项目
  const { sectionId } = useLocalSearchParams<{ sectionId: string }>();
  const userId = session?.user.id;
  const sectionIdNumber = Number(sectionId);

  // 提交请求：插入成功后失效该项目的 items 查询（让新明细立即出现），再返回上一页
  const mutation = useMutation({
    mutationFn: async (values: CreateItemForm) => {
      // 页面已保证登录态与 sectionId，此处兜底守卫避免 uid/section_id 为脏值
      if (!userId) throw new Error('not logged in');
      if (!Number.isInteger(sectionIdNumber)) throw new Error('invalid section');
      return createItem({
        uid: userId,
        section_id: sectionIdNumber,
        isIncome: values.isIncome,
        // 金额输入为字符串，由 insert schema 的 z.coerce 统一转 number 并校验
        number: values.amount,
        reason: values.reason,
      });
    },
    onSuccess: () => {
      toast.success(t('home.itemCreateSuccess'));
      queryClient.invalidateQueries({ queryKey: ['items', userId, sectionIdNumber] });
      router.back();
    },
    onError: (err) => {
      console.error(err);
      toast.error(t('home.itemCreateFailed'));
    },
  });

  // 表单状态交给 TanStack Form：zod schema 同时承担字段校验与提交校验，提交交给 mutation 持久化
  const form = useForm({
    defaultValues: { reason: '', isIncome: false, amount: '' },
    validators: { onChange: createItemFormSchema, onSubmit: createItemFormSchema },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync(value);
      } catch {
        // 错误提示已由 mutation.onError 统一弹出，这里吞掉避免未捕获的 reject
      }
    },
  });

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  // 未登录 → 重定向到未登录引导页（正常流程只能从明细页进来，这里兜底防直接输入 URL）
  if (!session) {
    return <Redirect href="/notlogin" />;
  }

  return (
    <ScreenBackground>
      {/* 玻璃卡片表单容器，与新建项目页同一套液态玻璃风格 */}
      <GlassCard className="py-3">
        <CardContent>
          {/* 头部：图标徽标 + 标题 + 一句说明，让用户一眼清楚当前操作意图 */}
          <View className="items-center">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-success-soft">
              <Icon as={WalletCards} size={26} className="text-success" />
            </View>
            <Text variant="h2" className="mt-4 border-b-0 text-center text-brand">
              {t('home.createItemTitle')}
            </Text>
            <Text className="mt-1 text-center text-sm text-muted-foreground">
              {t('home.createItemDesc')}
            </Text>
          </View>

          {/* 字段区：名称 → 支出/收入 → 金额，自上而下；失焦或提交过后才展示字段级错误 */}
          <form.Subscribe selector={(s) => s.isSubmitted}>
            {(isSubmitted) => (
              <View className="mt-6 gap-4">
                {/* 名称：实时字符计数（当前/上限）+ 字段级错误提示 */}
                <form.Field name="reason">
                  {(field) => (
                    <View className="gap-1.5">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-sm font-medium">{t('home.nameLabel')}</Text>
                        <Text className="text-xs tabular-nums text-muted-foreground">
                          {field.state.value.length}/50
                        </Text>
                      </View>
                      <Input
                        value={field.state.value}
                        onChangeText={field.handleChange}
                        onBlur={field.handleBlur}
                        placeholder={t('home.reasonPlaceholder')}
                        maxLength={50}
                        editable={!mutation.isPending}
                      />
                      {field.state.meta.isTouched || isSubmitted
                        ? field.state.meta.errors.map((err) => {
                            // 运行期 zod 标准 schema 的错误是「message 字符串（i18n key）」，类型推断为 issue 对象，兼容两种形态
                            const msg =
                              typeof err === 'string'
                                ? err
                                : err && typeof err === 'object'
                                  ? err.message
                                  : undefined;
                            return msg ? (
                              <Text key={msg} className="text-xs text-destructive">
                                {t(msg)}
                              </Text>
                            ) : null;
                          })
                        : null}
                    </View>
                  )}
                </form.Field>

                {/* 支出/收入：两个切换按钮二选一，默认支出（isIncome=false） */}
                <form.Field name="isIncome">
                  {(field) => (
                    <View className="gap-1.5">
                      <Text className="text-sm font-medium">{t('home.incomeTypeLabel')}</Text>
                      <View className="flex-row gap-3">
                        <TypeToggleButton
                          selected={!field.state.value}
                          type="expense"
                          icon={Minus}
                          label={t('home.expense')}
                          disabled={mutation.isPending}
                          onPress={() => field.handleChange(false)}
                        />
                        <TypeToggleButton
                          selected={field.state.value}
                          type="income"
                          icon={Plus}
                          label={t('home.income')}
                          disabled={mutation.isPending}
                          onPress={() => field.handleChange(true)}
                        />
                      </View>
                    </View>
                  )}
                </form.Field>

                {/* 金额：数字键盘输入，失焦/提交后展示校验错误 */}
                <form.Field name="amount">
                  {(field) => (
                    <View className="gap-1.5">
                      <Text className="text-sm font-medium">{t('home.amountLabel')}</Text>
                      <Input
                        value={field.state.value}
                        onChangeText={field.handleChange}
                        onBlur={field.handleBlur}
                        placeholder={t('home.amountPlaceholder')}
                        keyboardType="decimal-pad"
                        maxLength={12}
                        editable={!mutation.isPending}
                      />
                      {field.state.meta.isTouched || isSubmitted
                        ? field.state.meta.errors.map((err) => {
                            // 运行期 zod 标准 schema 的错误是「message 字符串（i18n key）」，类型推断为 issue 对象，兼容两种形态
                            const msg =
                              typeof err === 'string'
                                ? err
                                : err && typeof err === 'object'
                                  ? err.message
                                  : undefined;
                            return msg ? (
                              <Text key={msg} className="text-xs text-destructive">
                                {t(msg)}
                              </Text>
                            ) : null;
                          })
                        : null}
                    </View>
                  )}
                </form.Field>
              </View>
            )}
          </form.Subscribe>

          {/* 提交 / 取消按钮区：isSubmitting 驱动按钮 loading 并防重复提交 */}
          <View className="mt-6 gap-3">
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(isSubmitting) => (
                <BrandButton
                  label={isSubmitting ? t('home.adding') : t('home.add')}
                  disabled={isSubmitting}
                  onPress={() => form.handleSubmit()}
                />
              )}
            </form.Subscribe>
            <Button variant="link" className="self-center" onPress={() => router.back()}>
              <Text>{t('home.cancel')}</Text>
            </Button>
          </View>
        </CardContent>
      </GlassCard>
    </ScreenBackground>
  );
}
