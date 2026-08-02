# CLAUDE.md

FlowlyApp：个人记账/流水 App。Expo SDK 56 + Expo Router（typed routes）+ RN Reusables + Nativewind v4，三端（iOS/Android/Web）。

- 后端：Supabase（Auth + Postgres + RLS）
- 状态/表单：TanStack Query v5 + TanStack Form + Zod v4
- 业务：项目 sections → 明细 items；收支汇总走服务端 RPC 聚合
- 其他：i18next（zh/en，key 类型推导）、Lucide 图标、TS 严格模式

## 命令

```bash
pnpm dev|android|ios|web    # 启动
pnpm test                   # vitest 单测
pnpm typecheck              # tsc --noEmit
pnpm format:check           # prettier 检查
pnpm clean                  # 清 .expo / node_modules
npx eas build --profile preview|production  # EAS 构建
npx react-native-reusables/cli@latest add   # 添加 UI 组件
```

## 环境变量

`.env`，`EXPO_PUBLIC_*` 前缀自动注入（公开，勿放密钥）：

```env
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

## 目录

```
app/        文件路由；_layout.tsx 根布局（Provider 链 + 导航骨架）
components/ ui/ 基础组件；ui-preSettings/ 业务预设；bar/ 导航；index/ 首页；user/ 用户
ai/         AI 领域：lib/ 纯逻辑（schema/存储/网络）、hooks/ Query hooks；模型配置本地存储、OpenAI 兼容协议
hooks/ i18n/ lib/ test/ assets/ 全局配置文件（global.css/tailwind/metro/babel/eas/app.json）
supabase/   client、auth、sections、items、types（Zod schema，schema 即类型）、migrations
```

## 约定

- **路由**：`_layout.tsx` 引 global.css；Provider 链 I18next→Query→Toast→Theme；NavBar + Stack + BottomBar，`headerShown:false`；typedRoutes 类型检查
- **主题**：HSL CSS 变量 → tailwind，`darkMode:'class'`；`lib/theme.ts` 导出 THEME/NAV_THEME
- **UI**：cva 变体 + `cn()`；Text 用 TextClassContext 继承样式；Icon 用 cssInterop 映射 size
- **Supabase**：单例客户端（Web localStorage / 移动端 AsyncStorage）；types.ts 边界 Zod 解析，禁 `as`/`!`；RLS 按 uid 隔离；分页 `range`+`count:'exact'`；汇总走 RPC `get_section_summary`/`get_section_summaries`；登录/OTP/会话见 auth.ts
- **Query**：全局单例（staleTime 60s、retry:false）；读 useQuery、写 useMutation，成功后 invalidateQueries
- **表单**：Zod schema 唯一数据源 + useForm；提交 useMutation（isPending 防重复）；网络/服务端错误在 mutation 层处理
- **AI**：模型配置本地存 AsyncStorage（密钥不上传）；`ai/lib` 纯逻辑 + `ai/hooks` Query hooks；共用 queryKey `['modelConfig']`（staleTime: Infinity），保存/清除后 invalidate 同步各页
- **i18n**：初始取设备语言，fallback 'zh'；文案必须 `t()`，禁硬编码中英文
- **跨平台**：`Platform.select()` 处理 Web 特有样式
- **EAS**：eas.json 三 profile；app.json 含 projectId

## 编码规范（.claude/rules/）

- [comment](.claude/rules/comment.md) 业务代码配中文注释
- [network](.claude/rules/network.md) 网络统一 fetch，禁 axios
- [zod](.claude/rules/zod.md) 运行时校验用 zod，schema 即类型
- [form](.claude/rules/form.md) 表单用 Query+Form+Zod
- [component](.claude/rules/component.md) 复杂样式用组件复用

## 格式化

Prettier：100 列、单引号、尾逗号（es5）、bracketSameLine；prettier-plugin-tailwindcss 自动排序（tailwindFunctions:["cva"]）
