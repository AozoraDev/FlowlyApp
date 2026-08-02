import { useMutation } from '@tanstack/react-query';

import { clearModelConfig } from '@/ai/lib/modelConfig';
import { queryClient } from '@/lib/queryClient';

// 清除模型配置的公共 mutation：「清除配置」按钮与「退出登录」共用同一逻辑。
// 只删本地存储还不够——modelConfig 查询缓存（staleTime: Infinity）仍残留旧配置，
// 退出登录后重新登录依旧会显示上一账号的模型，所以这里必须一并失效缓存。
// 页面级副作用（Toast / 跳转）由调用方通过 mutate 的 onSuccess/onError 补充。
export function useClearModelConfig() {
  return useMutation({
    mutationFn: clearModelConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modelConfig'] });
    },
  });
}
