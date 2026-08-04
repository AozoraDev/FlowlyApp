# CLAUDE.md

记账 App。Expo 56 三端 + RN Reusables + Nativewind v4 + TS strict + Supabase(Auth+RLS) + TanStack Query/Form+Zod + i18next(zh/en) + Lucide。业务：sections→items，汇总走 RPC。

## 命令
`pnpm dev|android|ios|web|test|typecheck|format:check|clean` · `npx eas build --profile preview|production`

## 环境变量
`.env` 仅 `EXPO_PUBLIC_*`（勿放密钥）：SUPABASE_URL / SUPABASE_ANON_KEY

## 目录
`app/`路由 · `components/`ui·ui-preSettings·bar·index·user/业务 · `ai/`lib·hooks·prompt · `supabase/`client·auth·sections·items·types(Zod即类型)·migrations · `hooks/ i18n/ lib/ test/` · `docs/`

## docs/
不读（省 token），仅任务直接涉及才读。

## 约定
- 路由：Provider 链 I18next→Query→Toast→Theme；NavBar+Stack+BottomBar；headerShown:false
- 主题：HSL→tailwind darkMode:'class'；lib/theme.ts 导 THEME/NAV_THEME
- UI：cva+cn()；Text 继承 TextClassContext；Icon cssInterop 映射 size
- Supabase：单例(web localStorage/移动 AsyncStorage)；types.ts 边界 Zod 解析禁 as/!；RLS 按 uid；分页 range+count:'exact'；汇总 RPC get_section_summary(s)；登录 auth.ts
- Query：单例 staleTime 60s retry:false；读 useQuery 写 useMutation，写后 invalidateQueries
- AI：模型配置 AsyncStorage(密钥不上传)；queryKey ['modelConfig'](staleTime:Infinity)；提示词内联 ai/prompt/systemPrompt.ts(基础+A2UI 输出格式分层，zh/en)；```a2ui 卡片：ai/lib/a2ui.ts(schema+parse)、a2uiPresets.ts(汇总卡代码拼)、A2uiRenderer.tsx(渲染)；流式必须 expo/fetch(纯逻辑不引入)
- i18n：初值设备语言 fallback 'zh'；文案 t()；Web 样式 Platform.select()；EAS 三 profile，app.json 含 projectId

## 规范(.claude/rules/)
comment 中文注释 · network 禁 axios · zod 校验即类型 · form Query+Form+Zod · component 样式组件复用

## 格式化
Prettier 100列/单引号/尾逗号es5/bracketSameLine；prettier-plugin-tailwindcss(tailwindFunctions:["cva"])
