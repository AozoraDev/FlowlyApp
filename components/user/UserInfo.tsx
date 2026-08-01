import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { LogOut } from 'lucide-react-native';
import type { User } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';

import { UserDetailCard } from '@/components/user/UserDetailCard';
import { UserHeaderCard } from '@/components/user/UserHeaderCard';
import { BrandButton } from '@/components/ui-preSettings/Button';
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

  // 退出登录：signOut 触发 onAuthStateChange，user 页自动切回登录界面
  const handleLogout = () => {
    void signOut().catch(() => {});
  };

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

      {/* 详细信息卡片：邮箱 */}
      <UserDetailCard label={t('user.email')} value={user.email ?? '—'} />

      {/* 退出登录：使用品牌蓝按钮预设 */}
      <BrandButton icon={LogOut} label={t('user.logout')} className="mt-4" onPress={handleLogout} />
    </View>
  );
}

export default UserInfo;
export { UserInfo };
