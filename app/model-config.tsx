import { useForm, useSelector } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Bot, Check, Link2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { modelConfigSchema, saveModelConfig, testModelConfig } from '@/ai/lib/modelConfig';
import type { ModelConfig } from '@/ai/lib/modelConfig';
import { useModelConfig } from '@/ai/hooks/useModelConfig';
import { BrandButton } from '@/components/ui-preSettings/Button';
import { FormField } from '@/components/ui-preSettings/FormField';
import { GlassCard } from '@/components/ui-preSettings/GlassCard';
import ModelSelect from '@/components/ui-preSettings/ModelSelect';
import { PageHeader } from '@/components/ui-preSettings/PageHeader';
import { ScreenBackground } from '@/components/ui-preSettings/ScreenBackground';
import { useAppToast } from '@/components/ui-preSettings/Toast';
import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { queryClient } from '@/lib/queryClient';

// 模型配置页：先读取已保存配置，加载完成后再渲染表单，避免空默认值闪一下再回填
export default function ModelConfigScreen() {
  // 读取已保存配置：配置页 / 模型信息页 / 用户页共用同一 hook（见 useModelConfig）
  const { data, isLoading } = useModelConfig();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  return <ModelConfigForm initialConfig={data ?? null} />;
}

// 模型配置表单：url / API Key / 模型三个字段 + 「测试链接」「确认」两步。
// 只有测试链接成功（且测试后未改动 url/key）确认按钮才可点；测试成功/失败均弹 Toast。
// 表单状态交给 TanStack Form（zod schema 承担校验），测试与保存分别走 useMutation。
function ModelConfigForm({ initialConfig }: { initialConfig: ModelConfig | null }) {
  const { t } = useTranslation();
  const toast = useAppToast();

  // 可用模型列表：初始为已保存模型（单值，此时走手动输入形态）；测试成功后由接口返回填充
  const [modelOptions, setModelOptions] = useState<string[]>(
    initialConfig ? [initialConfig.model] : []
  );
  // 最近一次「测试成功」对应的 url/apiKey；与当前表单值不一致即视为未通过测试
  const [tested, setTested] = useState<{ url: string; apiKey: string } | null>(null);

  // 测试链接：成功后记录当时的 url/apiKey 并填充模型列表；失败清空测试记录
  const testMutation = useMutation({
    mutationFn: testModelConfig,
    onSuccess: (models, vars) => {
      setModelOptions(models);
      setTested({ url: vars.url, apiKey: vars.apiKey });
      toast.success(t('user.modelConfigTestSuccess'));
    },
    onError: (err) => {
      console.error(err);
      setTested(null);
      toast.error(t('user.modelConfigTestFailed'));
    },
  });

  // 保存配置：成功后刷新 modelConfig 缓存（后续回填用）并返回上一页
  const saveMutation = useMutation({
    mutationFn: saveModelConfig,
    onSuccess: () => {
      toast.success(t('user.modelConfigSaveSuccess'));
      queryClient.invalidateQueries({ queryKey: ['modelConfig'] });
      router.back();
    },
    onError: (err) => {
      console.error(err);
      toast.error(t('user.modelConfigSaveFailed'));
    },
  });

  // 表单状态交给 TanStack Form：zod schema 同时承担字段校验与提交校验，提交交给 mutation 持久化
  const form = useForm({
    defaultValues: initialConfig ?? { url: '', apiKey: '', model: '' },
    validators: { onChange: modelConfigSchema, onSubmit: modelConfigSchema },
    onSubmit: async ({ value }) => {
      try {
        await saveMutation.mutateAsync(value);
      } catch {
        // 错误提示已由 mutation.onError 统一弹出，这里吞掉避免未捕获的 reject
      }
    },
  });

  // 订阅当前表单值：测试/确认按钮的可用性都由它派生，字段一变界面即时联动
  const values = useSelector(form.store, (s) => s.values);

  // 测试按钮可点条件：url/apiKey 本身合法（模型字段尚未填写，不参与判断）
  const canTest = modelConfigSchema.omit({ model: true }).safeParse(values).success;
  // 确认可点条件：最近一次测试通过的正是当前 url/apiKey，且整份表单合法（含模型已选）
  const isTested = !!tested && tested.url === values.url && tested.apiKey === values.apiKey;
  const schemaValid = modelConfigSchema.safeParse(values).success;
  // 任一请求进行中时整体禁用输入与按钮，防止连点重复提交
  const busy = testMutation.isPending || saveMutation.isPending;

  return (
    <ScreenBackground>
      {/* 玻璃卡片表单容器，与新建项目页同一套液态玻璃风格 */}
      <GlassCard className="py-3">
        <CardContent>
          {/* 头部：图标徽标 + 标题 + 一句说明，让用户一眼清楚当前操作意图 */}
          <PageHeader
            icon={Bot}
            title={t('user.modelConfigTitle')}
            desc={t('user.modelConfigDesc')}
            titleVariant="h3"
            descClassName="text-xs"
          />

          {/* 字段区：接口地址 → API Key → 模型，自上而下；失焦或提交过后才展示字段级错误 */}
          <form.Subscribe selector={(s) => s.isSubmitted}>
            {(isSubmitted) => (
              <View className="mt-6 gap-3">
                {/* 接口地址 */}
                <form.Field name="url">
                  {(field) => (
                    <FormField
                      label={t('user.modelConfigUrl')}
                      showError={field.state.meta.isTouched || isSubmitted}
                      errors={field.state.meta.errors}>
                      <Input
                        value={field.state.value}
                        onChangeText={field.handleChange}
                        onBlur={field.handleBlur}
                        placeholder={t('user.modelConfigUrlPlaceholder')}
                        keyboardType="url"
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!busy}
                      />
                    </FormField>
                  )}
                </form.Field>

                {/* API Key */}
                <form.Field name="apiKey">
                  {(field) => (
                    <FormField
                      label={t('user.modelConfigApiKey')}
                      showError={field.state.meta.isTouched || isSubmitted}
                      errors={field.state.meta.errors}>
                      <Input
                        value={field.state.value}
                        onChangeText={field.handleChange}
                        onBlur={field.handleBlur}
                        placeholder={t('user.modelConfigApiKeyPlaceholder')}
                        secureTextEntry
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!busy}
                      />
                    </FormField>
                  )}
                </form.Field>

                {/* 模型：仅在链接测试通过后展示——此时接口才返回可用模型列表（走下拉选择），
                    拿不到列表则降级为手动输入。未通过测试时整块隐藏，避免在连接未知时让用户填模型 */}
                {isTested && (
                  <form.Field name="model">
                    {(field) => (
                      <FormField
                        label={t('user.modelLabel')}
                        hint={modelOptions.length === 0 ? t('user.modelEmptyHint') : undefined}
                        showError={field.state.meta.isTouched || isSubmitted}
                        errors={field.state.meta.errors}>
                        {modelOptions.length > 0 ? (
                          <ModelSelect
                            options={modelOptions}
                            value={field.state.value}
                            onChange={field.handleChange}
                            placeholder={t('user.modelPlaceholder')}
                            title={t('user.selectModelTitle')}
                            disabled={busy}
                          />
                        ) : (
                          // 手动输入兜底：拿不到列表时降级为输入框，hint 说明为什么不是下拉选择
                          <Input
                            value={field.state.value}
                            onChangeText={field.handleChange}
                            onBlur={field.handleBlur}
                            placeholder={t('user.modelManualPlaceholder')}
                            autoCapitalize="none"
                            autoCorrect={false}
                            editable={!busy}
                          />
                        )}
                      </FormField>
                    )}
                  </form.Field>
                )}
              </View>
            )}
          </form.Subscribe>

          {/* 测试链接 / 确认按钮区：测试通过后确认才可点，请求进行中禁用防重复提交 */}
          <View className="mt-6 gap-3">
            <Button
              variant="outline"
              disabled={!canTest || busy}
              onPress={() => testMutation.mutate({ url: values.url, apiKey: values.apiKey })}>
              <Icon as={Link2} size={16} />
              <Text>
                {testMutation.isPending ? t('user.modelConfigTesting') : t('user.modelConfigTest')}
              </Text>
            </Button>

            <BrandButton
              icon={Check}
              label={t('user.modelConfigConfirm')}
              disabled={!isTested || !schemaValid || busy}
              onPress={() => form.handleSubmit()}
            />
            {/* 未通过测试时提示：必须先测试链接才能确认 */}
            {!isTested && (
              <Text className="text-center text-xs text-muted-foreground">
                {t('user.modelConfigConfirmHint')}
              </Text>
            )}

            {/* 取消：不保存直接返回上一页，与新建项目页同一交互 */}
            <Button variant="link" className="self-center" onPress={() => router.back()}>
              <Text>{t('home.cancel')}</Text>
            </Button>
          </View>
        </CardContent>
      </GlassCard>
    </ScreenBackground>
  );
}
