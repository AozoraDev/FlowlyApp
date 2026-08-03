import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { LogOut } from 'lucide-react-native';
import type { User } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';

import { useClearModelConfig } from '@/ai/hooks/useClearModelConfig';
import { useModelConfig } from '@/ai/hooks/useModelConfig';
import { BrandButton } from '@/components/ui-preSettings/Button';
import { ConfigureModelButton } from '@/components/ai-agent/ConfigureModelButton';
import { UserDetailCard } from '@/components/user/UserDetailCard';
import { UserHeaderCard } from '@/components/user/UserHeaderCard';
import { formatDate } from '@/lib/format';
import { getProfile, signOut } from '@/supabase/auth';
import type { Profile } from '@/supabase/types';

interface UserInfoProps {
  user: User;
}

// 用户信息页：登录后展示头像/显示名/加入时间/邮箱，并提供退出登录。
// 档案数据来自 profiles 表，查询失败时降级展示 auth 自带的基础信息。
function UserInfo({ user }: UserInfoProps) {
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // 挂载时拉取用户档案；profiles 表缺失/查询失败时保持 null，界面自动降级
  useEffect(() => {
    void (async () => {
      try {
        setProfile(await getProfile(user.id));
      } catch {
        setProfile(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [user.id]);

  // 退出登录：先清模型配置（本地存储 + 内存缓存一并清除，与「清除配置」同一逻辑），
  // 再 signOut 触发 onAuthStateChange，user 页自动切回登录界面；任一步失败都不阻断整体流程
  const clearConfig = useClearModelConfig();
  const handleLogout = () => {
    void (async () => {
      await clearConfig.mutateAsync(undefined).catch(() => {});
      await signOut().catch(() => {});
    })();
  };

  // 当前已配置模型：存在时在邮箱下方追加一行「模型 → 名称」。复用配置页同一 hook，
  // 保存/清除配置后 invalidateQueries 会自动同步到这里，无需手动刷新
  const { data: modelConfig } = useModelConfig();

  // 显示名：优先用户名 → 邮箱前缀 → 兜底「游客」
  const displayName = profile?.username ?? user.email?.split('@')[0] ?? t('user.guest');
  // 加入时间：取档案创建时间，缺失时回退到 auth 用户创建时间，并按当前语言本地化
  const joinedLabel = formatDate(profile?.created_at ?? user.created_at, i18n.language);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View className="flex-1 p-4">
      {/* 头卡：头像/显示名/加入时间，样式与降级逻辑收敛在 UserHeaderCard 内 */}
      <UserHeaderCard
        avatarUrl={profile?.avatar_url}
        displayName={displayName}
        memberSinceLabel={`${t('user.memberSince')} · ${joinedLabel}`}
      />

      {/* 详细信息卡片：邮箱始终展示，已成功配置模型时在同一张卡片内追加「模型 → 当前模型名」一行 */}
      <UserDetailCard
        rows={[
          { label: t('user.email'), value: user.email ?? '—' },
          ...(modelConfig ? [{ label: t('user.modelLabel'), value: modelConfig.model }] : []),
        ]}
      />

      {/* 配置模型：已配置时进模型信息页（可查看/清除），未配置时进模型配置页填写 */}
      <ConfigureModelButton className="mt-4" />

      {/* 退出登录：使用品牌蓝按钮预设 */}
      <BrandButton icon={LogOut} label={t('user.logout')} className="mt-4" onPress={handleLogout} />
    </View>
  );
}

export default UserInfo;
export { UserInfo };
