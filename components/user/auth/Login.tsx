import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { Hand, Lock, LogIn, Mail, UserPlus, Wallet } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { z } from 'zod';

import { BrandButton } from '@/components/ui-preSettings/Button';
import { Divider } from '@/components/ui-preSettings/Divider';
import { ScreenBackground } from '@/components/ui-preSettings/ScreenBackground';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { FormField } from '@/components/user/auth/FormField';
import { signInWithEmail } from '@/supabase/auth';

// 登录表单校验 schema：邮箱 + 密码；错误文案用 i18n key，展示时再翻译。
// schema 即类型唯一来源，payload 类型由 z.infer 推导，不再平行手写。
const loginSchema = z.object({
  email: z.string().trim().email('auth.emailInvalid'),
  password: z.string().min(6, 'auth.passwordTooShort'),
});
type LoginForm = z.infer<typeof loginSchema>;

// 登录接口常见错误码 → i18n 文案 key，未知错误统一走 genericError
const ERROR_CODE_KEYS = {
  invalid_credentials: 'auth.invalidCredentials',
} as const;

// 将 Supabase 错误映射为 i18n 文案 key：按错误码取文案，未知错误走通用兜底
function toErrorKey(err: unknown): string {
  const code = (err as { code?: string })?.code;
  return code && code in ERROR_CODE_KEYS
    ? ERROR_CODE_KEYS[code as keyof typeof ERROR_CODE_KEYS]
    : 'auth.genericError';
}

type LoginProps = {
  // 前往注册表单的回调（由 user 页注入，用于登录/注册切换）
  onSwitchToRegister?: () => void;
};

// 登录界面：邮箱密码登录。表单状态交给 TanStack Form（zod schema 负责校验），
// 提交走 useMutation（isPending 驱动按钮态），服务端错误内联展示。
// 登录成功后 onAuthStateChange 广播登录态，user 页自动切换到用户信息视图。
function Login({ onSwitchToRegister }: LoginProps) {
  const { t } = useTranslation();

  // 提交请求：调 Supabase 登录接口；失败不弹 toast，错误在表单下方内联展示
  const mutation = useMutation({
    mutationFn: (values: LoginForm) => signInWithEmail(values.email, values.password),
  });

  // 表单状态交给 TanStack Form：zod schema 同时承担字段校验与提交校验，提交交给 mutation 持久化
  const form = useForm({
    defaultValues: { email: '', password: '' },
    validators: { onChange: loginSchema, onSubmit: loginSchema },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync(value);
      } catch {
        // 服务端错误已由 mutation.error 在下方内联展示，这里吞掉避免未捕获的 reject
      }
    },
  });

  // 字段错误提取：失焦或提交过后才取首个错误并翻译（schema 的 message 即 i18n key）。
  // 运行期 zod 标准 schema 的错误是「message 字符串」，但类型推断为 issue 对象，这里兼容两种形态
  const getFieldError = (
    meta: { isTouched: boolean; errors: readonly (string | { message: string } | undefined)[] },
    isSubmitted: boolean
  ) => {
    if (!(meta.isTouched || isSubmitted)) return undefined;
    const first = meta.errors[0];
    return first ? t(typeof first === 'string' ? first : first.message) : undefined;
  };

  return (
    // 复用全屏预设背景；内边距交由 ScrollView 的 contentContainer 控制，故关闭 withPadding
    <ScreenBackground withPadding={false}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-1 justify-center p-6"
        keyboardShouldPersistTaps="handled">
        {/* 标题区：欢迎文案（主题蓝色 + 前置图标）+ 品牌绿分割线 + 副标题 */}
        <View className="flex-row items-center gap-2">
          <Icon as={Hand} size={28} className="text-brand" />
          <Text variant="h2" className="flex-1 border-b-0 text-left text-brand">
            {t('auth.title')}
          </Text>
        </View>
        <Divider className="mt-3" />
        <View className="mt-3 flex-row items-center gap-1.5">
          <Icon as={Wallet} size={14} className="text-brand" />
          <Text className="text-brand">{t('auth.subtitle')}</Text>
        </View>

        <View className="mt-8 gap-4">
          {/* 邮箱/密码输入 + 字段级错误：失焦或提交过后才展示，避免初始渲染直接闪出提示 */}
          <form.Subscribe selector={(s) => s.isSubmitted}>
            {(isSubmitted) => (
              <>
                <form.Field name="email">
                  {(field) => (
                    <FormField
                      icon={Mail}
                      label={t('auth.email')}
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={field.handleBlur}
                      placeholder={t('auth.emailPlaceholder')}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      textContentType="emailAddress"
                      editable={!mutation.isPending}
                      error={getFieldError(field.state.meta, isSubmitted)}
                    />
                  )}
                </form.Field>

                <form.Field name="password">
                  {(field) => (
                    <FormField
                      icon={Lock}
                      label={t('auth.password')}
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={field.handleBlur}
                      placeholder={t('auth.passwordPlaceholder')}
                      secureTextEntry
                      autoCapitalize="none"
                      autoComplete="password"
                      textContentType="password"
                      editable={!mutation.isPending}
                      error={getFieldError(field.state.meta, isSubmitted)}
                    />
                  )}
                </form.Field>
              </>
            )}
          </form.Subscribe>

          {/* 接口/通用错误提示：由 mutation.error 内联展示，重新提交时手动 reset 清除 */}
          {mutation.error && (
            <Text className="text-sm text-destructive" accessibilityRole="alert">
              {t(toErrorKey(mutation.error))}
            </Text>
          )}

          {/* 提交按钮：品牌蓝预设样式，前置登录图标，提交期间禁用并显示进行中文案 */}
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <BrandButton
                className="mt-2"
                icon={LogIn}
                label={isSubmitting ? t('auth.submitting') : t('auth.login')}
                disabled={isSubmitting}
                onPress={() => {
                  // 校验失败时 mutation 不会触发，需手动 reset 才能清掉上一次的服务端错误
                  mutation.reset();
                  form.handleSubmit();
                }}
              />
            )}
          </form.Subscribe>
        </View>

        {/* 底部：前往注册的入口（主题蓝色 + 前置图标） */}
        <View className="mt-6 items-center">
          <Button variant="link" size="sm" onPress={onSwitchToRegister}>
            <Icon as={UserPlus} size={14} className="text-brand" />
            <Text className="text-brand">{t('auth.switchToRegister')}</Text>
          </Button>
        </View>
      </ScrollView>
    </ScreenBackground>
  );
}

export default Login;
export { Login };
