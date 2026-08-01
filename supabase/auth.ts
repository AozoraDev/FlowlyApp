import { supabase } from '@/supabase/client';
import { profileSchema, type Profile } from '@/supabase/types';

// ============================================================
// 邮箱登录 / 登出
// ============================================================

/**
 * 邮箱密码登录
 */
export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await (
    await supabase()
  ).auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

/**
 * 登出
 */
export async function signOut() {
  const { error } = await (await supabase()).auth.signOut();
  if (error) throw error;
}

// ============================================================
// 会话管理
// ============================================================

/**
 * 获取当前会话（用于应用启动时恢复登录态）
 */
export async function getSession() {
  const { data, error } = await (await supabase()).auth.getSession();
  if (error) throw error;
  return data.session;
}

/**
 * 监听认证状态变化
 *
 * 推荐在 _layout.tsx 的 useEffect 中调用，用于同步应用登录态
 *
 * @example
 * ```tsx
 * useEffect(() => {
 *   const { data: listener } = onAuthStateChange((session) => {
 *     setUser(session?.user ?? null);
 *   });
 *   return () => listener.subscription.unsubscribe();
 * }, []);
 * ```
 */
export async function onAuthStateChange(
  callback: (session: Awaited<ReturnType<typeof getSession>>) => void
) {
  return (await supabase()).auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}

/**
 * 使用重置令牌更新密码
 */
export async function updatePassword(newPassword: string) {
  const { error } = await (
    await supabase()
  ).auth.updateUser({
    password: newPassword,
  });
  if (error) throw error;
}

// ============================================================
// 邮箱验证码（OTP）
// ============================================================

/**
 * 发送邮箱验证码
 * shouldCreateUser 默认开启：首次使用该邮箱即自动创建账号记录，
 * 后续 verifyOtp 校验通过时直接建立会话（注册流程见 Register 组件）
 */
export async function sendOtp(email: string) {
  const { error } = await (
    await supabase()
  ).auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

/**
 * 校验邮箱验证码，成功即建立会话（验证码过期/错误时抛错）
 */
export async function verifyOtp(email: string, token: string) {
  const { data, error } = await (
    await supabase()
  ).auth.verifyOtp({
    email,
    token,
    type: 'email',
  });
  if (error) throw error;
  return data;
}

// ============================================================
// 用户档案 —— 带 Zod 校验
// ============================================================

/**
 * 获取当前用户档案
 */
export async function getProfile(userId: string) {
  const { data, error } = await (
    await supabase()
  )
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single<Profile>();

  if (error) throw error;
  // 用 Zod 校验响应数据，确保类型安全
  return profileSchema.parse(data);
}
