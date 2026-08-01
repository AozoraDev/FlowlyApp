import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { getSession, onAuthStateChange } from '@/supabase/auth';

// 登录态 Hook：首次加载时恢复已有会话，并订阅登录/登出事件实时同步
// 返回 session 与 loading，组件卸载时自动取消订阅，避免内存泄漏
export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null);
  // 首次加载：getSession 恢复会话期间先显示 loading，避免页面内容闪变
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      // 先恢复已有登录态，再订阅登录/登出事件：登录/登出后 session 自动更新
      setSession(await getSession());
      setLoading(false);

      const { data } = await onAuthStateChange((next) => setSession(next));
      unsubscribe = data.subscription.unsubscribe;
    })();

    // 组件卸载时取消订阅，避免内存泄漏
    return () => unsubscribe?.();
  }, []);

  return { session, loading };
}
