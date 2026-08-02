import { useQuery } from '@tanstack/react-query';

import { loadModelConfig } from '@/ai/lib/modelConfig';

// 已保存模型配置的读取 hook：配置页 / 模型信息页 / 用户页共用同一 queryKey（staleTime: Infinity），
// 保存/清除配置后 invalidateQueries 会自动同步各页，无需手动刷新；后续 agent 读取配置也走这里。
export function useModelConfig() {
  return useQuery({
    queryKey: ['modelConfig'],
    queryFn: loadModelConfig,
    staleTime: Infinity,
  });
}
