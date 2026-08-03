# CLAUDE.md

记账 App。Expo 56 + Expo Router(typed) + RN Reusables + Nativewind v4，三端。
Supabase(Auth+RLS)、TanStack Query v5+Form+Zod v4、i18next(zh/en)、Lucide、TS strict。
业务：项目 sections→明细 items，汇总走服务端 RPC。

## 命令

```bash
pnpm dev|android|ios|web    # 启动
pnpm test · typecheck · format:check · clean
npx eas build --profile preview|production
npx react-native-reusables/cli@latest add
```

## 环境变量

`.env`，`EXPO_PUBLIC_*`（公开勿放密钥）：SUPABASE_URL / SUPABASE_ANON_KEY

## 目录

```
app/        路由；_layout.tsx 引 global.css + Provider 链 + 导航骨架
components/ ui/基础 · ui-preSettings/预设 · bar/导航 · index/首页 · user/用户
ai/         lib/纯逻辑 · hooks/Query · prompt/*.md 系统提示词
hooks/ i18n/ lib/ test/ assets/  全局配置
supabase/   client/auth/sections/items/types(Zod schema 即类型)/migrations
```

## 约定

- 路由：Provider 链 I18next→Query→Toast→Theme；NavBar+Stack+BottomBar；headerShown:false
- 主题：HSL→tailwind darkMode:'class'；lib/theme.ts 导出 THEME/NAV_THEME
- UI：cva+cn()；Text 继承 TextClassContext；Icon 用 cssInterop 映射 size
- Supabase：单例（web localStorage/移动 AsyncStorage）；types.ts 边界 Zod 解析禁 as/!；RLS 按 uid；分页 range+count:'exact'；汇总 RPC get_section_summary(s)；登录见 auth.ts
- Query：全局单例 staleTime 60s retry:false；读 useQuery 写 useMutation，写后 invalidateQueries
- AI：模型配置存 AsyncStorage（密钥不上传）；共用 queryKey ['modelConfig']（staleTime:Infinity），存/清后 invalidate；提示词在 ai/prompt/*.md，经 metro.transform.js 转字符串 import，改提示词只改 md
- i18n：设备语言初值 fallback 'zh'；文案 t()
- 跨平台：Platform.select() 处理 Web 样式
- EAS：eas.json 三 profile；app.json 含 projectId

## 规范（.claude/rules/）

- comment 中文注释 · network fetch 禁 axios · zod zod 校验 schema 即类型 · form Query+Form+Zod · component 复杂样式组件复用

## 格式化

Prettier 100列/单引号/尾逗号es5/bracketSameLine；prettier-plugin-tailwindcss 排序（tailwindFunctions:["cva"]）
