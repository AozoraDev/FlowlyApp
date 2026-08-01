import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import Login from '@/components/user/auth/Login';
import Register from '@/components/user/auth/Register';
import UserInfo from '@/components/user/UserInfo';
import { useAuthSession } from '@/hooks/useAuthSession';

// 用户页：按登录态切换视图 —— 未登录显示登录/注册界面，已登录显示用户信息
export default function UserScreen() {
  const { session, loading } = useAuthSession();
  // 登录/注册表单切换（注销后重置回登录，避免停留在注册页）
  const [isLogin, setIsLogin] = useState(true);

  // 注销回到未登录态时，默认展示登录表单（切换时卸载重挂载，天然清空表单状态）
  useEffect(() => {
    if (!session) setIsLogin(true);
  }, [session]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  // 已登录 → 用户信息页；未登录 → 登录/注册表单切换
  if (!session) {
    return isLogin ? (
      <Login onSwitchToRegister={() => setIsLogin(false)} />
    ) : (
      <Register onSwitchToLogin={() => setIsLogin(true)} />
    );
  }
  return <UserInfo user={session.user} />;
}
