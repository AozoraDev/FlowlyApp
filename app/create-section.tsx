import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { FolderPlus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { z } from 'zod';

import { BrandButton } from '@/components/ui-preSettings/Button';
import { FormField } from '@/components/ui-preSettings/FormField';
import { GlassCard } from '@/components/ui-preSettings/GlassCard';
import { PageHeader } from '@/components/ui-preSettings/PageHeader';
import { ScreenBackground } from '@/components/ui-preSettings/ScreenBackground';
import { useAppToast } from '@/components/ui-preSettings/Toast';
import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useAuthSession } from '@/hooks/useAuthSession';
import { queryClient } from '@/lib/queryClient';
import { createSection } from '@/supabase/sections';

// 新建项目表单校验 schema：只填名称，最多 20 字符；错误文案用 i18n key，展示时再翻译。
// schema 即类型唯一来源，payload 类型由 z.infer 推导，不再平行手写。
const createSectionFormSchema = z.object({
  describe: z.string().min(1, 'home.nameRequired').max(20, 'home.nameTooLong'),
});
type CreateSectionForm = z.infer<typeof createSectionFormSchema>;

// 新建项目页：填写项目名称后提交到 sections 表，uid 取当前登录用户，其余字段走数据库默认值。
// 提交成功返回首页并刷新项目列表；未登录访问时重定向到未登录引导页。
export default function CreateSectionScreen() {
  const { session, loading } = useAuthSession();
  const { t } = useTranslation();
  const toast = useAppToast();
  const userId = session?.user.id;

  // 提交请求：插入成功后失效首页的 sections 查询（让新项目立即出现），再返回上一页
  const mutation = useMutation({
    mutationFn: async (values: CreateSectionForm) => {
      // 页面已保证登录态，此处兜底守卫避免 userId 为 undefined 时插入脏数据
      if (!userId) throw new Error('not logged in');
      return createSection({ ...values, uid: userId });
    },
    onSuccess: () => {
      toast.success(t('home.createSuccess'));
      queryClient.invalidateQueries({ queryKey: ['sections', userId] });
      router.back();
    },
    onError: (err) => {
      console.error(err);
      toast.error(t('home.createFailed'));
    },
  });

  // 表单状态交给 TanStack Form：zod schema 同时承担校验与提交校验，提交交给 mutation 持久化
  const form = useForm({
    defaultValues: { describe: '' },
    validators: { onChange: createSectionFormSchema, onSubmit: createSectionFormSchema },
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

  // 未登录 → 重定向到未登录引导页（正常流程只能从首页进来，这里兜底防直接输入 URL）
  if (!session) {
    return <Redirect href="/notlogin" />;
  }

  return (
    <ScreenBackground>
      {/* 玻璃卡片表单容器，与首页项目卡片同一套液态玻璃风格 */}
      <GlassCard className="py-3">
        <CardContent>
          {/* 头部：绿色图标徽标 + 标题 + 一句说明，让用户一眼清楚当前操作意图 */}
          <PageHeader
            icon={FolderPlus}
            title={t('home.createDialogTitle')}
            desc={t('home.createDialogDesc')}
            badgeClassName="bg-success-soft"
            iconClassName="text-success"
            titleVariant="h3"
            descClassName="text-xs"
          />

          {/* 名称输入 + 字段级错误：失焦或提交过后才展示错误，避免初始渲染直接闪出「必填」 */}
          <form.Subscribe selector={(s) => s.isSubmitted}>
            {(isSubmitted) => (
              <form.Field name="describe">
                {(field) => (
                  <FormField
                    label={t('home.nameLabel')}
                    charCount={{ value: field.state.value, max: 20 }}
                    showError={field.state.meta.isTouched || isSubmitted}
                    errors={field.state.meta.errors}
                    className="mt-6">
                    <Input
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={field.handleBlur}
                      placeholder={t('home.namePlaceholder')}
                      maxLength={20}
                      editable={!mutation.isPending}
                    />
                  </FormField>
                )}
              </form.Field>
            )}
          </form.Subscribe>

          {/* 提交 / 取消按钮区：isSubmitting 驱动按钮 loading 并防重复提交 */}
          <View className="mt-6 gap-3">
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(isSubmitting) => (
                <BrandButton
                  label={isSubmitting ? t('home.submitting') : t('home.submit')}
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
