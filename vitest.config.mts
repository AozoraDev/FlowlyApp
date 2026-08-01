import { defineConfig } from 'vitest/config';

// vitest 配置：面向纯逻辑 + mock 数据层的单测，跑在 Node 环境，不依赖 RN/Expo 原生模块
// resolve.tsconfigPaths 复用 tsconfig.json 的 @/ 别名，测试代码与源码用同一套 import 写法
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
  },
});
