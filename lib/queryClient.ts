import { QueryClient } from '@tanstack/react-query';

// 全局唯一的 QueryClient 实例：所有 useQuery/useMutation 共享同一缓存，
// 默认将查询数据视为 1 分钟内新鲜，避免短时间内的重复请求；
// 失败后不自动重试，尽快把真实错误显示出来（诊断友好）
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: false,
    },
  },
});
