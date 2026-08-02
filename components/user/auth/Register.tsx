import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, Lock, LogIn, Mail, Sparkles, UserPlus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { z } from 'zod';

import { BrandButton } from '@/components/ui-preSettings/Button';
import { Divider } from '@/components/ui-preSettings/Divider';
import { FormField } from '@/components/ui-preSettings/FormField';
import { ScreenBackground } from '@/components/ui-preSettings/ScreenBackground';
import { useAppToast } from '@/components/ui-preSettings/Toast';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { AuthInput } from '@/components/user/auth/AuthInput';
import { SendCodeButton } from '@/components/user/auth/SendCodeButton';
import { sendOtp, updatePassword, verifyOtp } from '@/supabase/auth';

// 注册字段级校验 schema：拆分到单字段，便于发送验证码时只校验邮箱/密码（验证码此时未填）。
// 组合成 registerSchema 作为类型唯一来源；错误文案用 i18n key，展示时再翻译。
const emailSchema = z.string().trim().email('auth.emailInvalid');
const passwordSchema = z.string().min(6, 'auth.passwordTooShort');
// 当前项目的 Supabase OTP 验证码为 8 位数字
const codeSchema = z.string().regex(/^\d{8}$/, 'auth.codeInvalid');
const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  code: codeSchema,
});
type RegisterForm = z.infer<typeof registerSchema>;

// 验证码错误/过期时抛出的标记错误，供 onError 区分「验证码错误」与「其他失败」的提示文案
class OtpInvalidError extends Error {}

type RegisterProps = {
  // 前往登录表单的回调（由 user 页注入，用于登录/注册切换）
  onSwitchToLogin?: () => void;
};

// 注册界面：邮箱 + 密码 + 邮箱验证码注册。
// 流程：先发送验证码（OTP），输入验证码后点注册 → verifyOtp 校验；
// 验证码错误弹失败 toast 并终止；正确弹成功 toast，随后设置密码完成真实注册。
function Register({ onSwitchToLogin }: RegisterProps) {
  const { t } = useTranslation();
  const toast = useAppToast();

  // 提交请求：先校验 OTP（错误/过期抛 OtpInvalidError 终止），通过后设置密码完成注册。
  // 成功/失败提示统一由 onSuccess/onError 弹出，isPending 驱动按钮态
  const mutation = useMutation({
    mutationFn: async (values: RegisterForm) => {
      try {
        await verifyOtp(values.email, values.code);
      } catch {
        throw new OtpInvalidError();
      }
      // 验证通过：OTP 校验已自动创建账号并建立会话，设置密码即完成注册
      await updatePassword(values.password);
    },
    onSuccess: () => toast.success(t('auth.verifySuccess')),
    onError: (err) => {
      toast.error(
        err instanceof OtpInvalidError ? t('auth.codeIncorrect') : t('auth.genericError')
      );
    },
  });

  // 表单状态交给 TanStack Form：字段级 validators 挂在各 form.Field 上，
  // 发送验证码时可调用 form.validateField 只校验邮箱/密码，不会触碰验证码字段
  const form = useForm({
    defaultValues: { email: '', password: '', code: '' },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync(value);
      } catch {
        // 错误提示已由 mutation.onError 统一弹出，这里吞掉避免未捕获的 reject
      }
    },
  });

  // 发送验证码：先只校验邮箱与密码（验证码此时未填），通过后才调 OTP 接口。
  // 返回 true 表示发送成功，SendCodeButton 据此进入倒计时。
  const handleSendCode = async (): Promise<boolean> => {
    const [emailErrors, passwordErrors] = await Promise.all([
      form.validateField('email', 'submit'),
      form.validateField('password', 'submit'),
    ]);
    if (emailErrors.some(Boolean) || passwordErrors.some(Boolean)) return false;

    try {
      await sendOtp(form.state.values.email);
      toast.success(t('auth.codeSent'));
      return true;
    } catch {
      toast.error(t('auth.codeSendFailed'));
      return false;
    }
  };

  return (
    // 复用全屏预设背景；内边距交由 ScrollView 的 contentContainer 控制，故关闭 withPadding
    <ScreenBackground withPadding={false}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-1 justify-center p-6"
        keyboardShouldPersistTaps="handled">
        {/* 标题区：注册文案（主题蓝色 + 前置图标）+ 品牌绿分割线 + 副标题 */}
        <View className="flex-row items-center gap-2">
          <Icon as={UserPlus} size={28} className="text-brand" />
          <Text variant="h2" className="flex-1 border-b-0 text-left text-brand">
            {t('auth.registerTitle')}
          </Text>
        </View>
        <Divider className="mt-3" />
        <View className="mt-3 flex-row items-center gap-1.5">
          <Icon as={Sparkles} size={14} className="text-brand" />
          <Text className="text-brand">{t('auth.registerSubtitle')}</Text>
        </View>

        <View className="mt-8 gap-3">
          {/* 邮箱/密码/验证码输入 + 字段级错误：失焦或提交过后才展示，避免初始渲染直接闪出提示 */}
          <form.Subscribe selector={(s) => s.isSubmitted}>
            {(isSubmitted) => (
              <>
                <form.Field
                  name="email"
                  validators={{ onChange: emailSchema, onSubmit: emailSchema }}>
                  {(field) => (
                    <FormField
                      icon={Mail}
                      iconClassName="text-brand"
                      labelClassName="text-brand"
                      label={t('auth.email')}
                      showError={field.state.meta.isTouched || isSubmitted}
                      errors={field.state.meta.errors}>
                      <AuthInput
                        value={field.state.value}
                        onChangeText={field.handleChange}
                        onBlur={field.handleBlur}
                        placeholder={t('auth.emailPlaceholder')}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                        textContentType="emailAddress"
                        editable={!mutation.isPending}
                      />
                    </FormField>
                  )}
                </form.Field>

                <form.Field
                  name="password"
                  validators={{ onChange: passwordSchema, onSubmit: passwordSchema }}>
                  {(field) => (
                    <FormField
                      icon={Lock}
                      iconClassName="text-brand"
                      labelClassName="text-brand"
                      label={t('auth.password')}
                      showError={field.state.meta.isTouched || isSubmitted}
                      errors={field.state.meta.errors}>
                      <AuthInput
                        value={field.state.value}
                        onChangeText={field.handleChange}
                        onBlur={field.handleBlur}
                        placeholder={t('auth.passwordPlaceholder')}
                        secureTextEntry
                        autoCapitalize="none"
                        autoComplete="new-password"
                        textContentType="newPassword"
                        editable={!mutation.isPending}
                      />
                    </FormField>
                  )}
                </form.Field>

                <form.Field name="code" validators={{ onChange: codeSchema, onSubmit: codeSchema }}>
                  {(field) => (
                    <FormField
                      icon={KeyRound}
                      iconClassName="text-brand"
                      labelClassName="text-brand"
                      label={t('auth.verificationCode')}
                      showError={field.state.meta.isTouched || isSubmitted}
                      errors={field.state.meta.errors}>
                      <AuthInput
                        value={field.state.value}
                        onChangeText={field.handleChange}
                        onBlur={field.handleBlur}
                        placeholder={t('auth.codePlaceholder')}
                        keyboardType="number-pad"
                        maxLength={8}
                        autoCapitalize="none"
                        editable={!mutation.isPending}
                      />
                    </FormField>
                  )}
                </form.Field>
              </>
            )}
          </form.Subscribe>

          {/* 发送/重发验证码按钮（位于注册按钮上方，倒计时内禁用） */}
          <SendCodeButton onSend={handleSendCode} disabled={mutation.isPending} />

          {/* 提交按钮：品牌蓝预设样式，前置注册图标，提交期间禁用并显示进行中文案 */}
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <BrandButton
                icon={UserPlus}
                label={isSubmitting ? t('auth.submitting') : t('auth.register')}
                onPress={() => form.handleSubmit()}
                disabled={isSubmitting}
              />
            )}
          </form.Subscribe>
        </View>

        {/* 底部：前往登录的入口（主题蓝色 + 前置图标） */}
        <View className="mt-6 items-center">
          <Button variant="link" size="sm" onPress={onSwitchToLogin}>
            <Icon as={LogIn} size={14} className="text-brand" />
            <Text className="text-brand">{t('auth.switchToLogin')}</Text>
          </Button>
        </View>
      </ScrollView>
    </ScreenBackground>
  );
}

export default Register;
export { Register };
