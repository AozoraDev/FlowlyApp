# CLAUDE.md

FlowlyApp：个人记账/流水应用。Expo SDK 56 + Expo Router（typed routes）+ React Native Reusables + Nativewind v4，支持 iOS/Android/Web 三端。

- 后端：Supabase（Auth + Postgres + RLS）
- 状态/表单：TanStack Query v5 + TanStack Form + Zod v4
- 业务模型：项目（sections）→ 收入/支出明细（items），收支汇总走服务端聚合
- i18n：i18next（zh/en，key 类型推导）；图标：Lucide；TS 严格模式

## 常用命令

```bash
pnpm dev|android|ios|web        # 启动开发服务器
pnpm clean                      # 清 .expo / node_modules
pnpm prettier --write .         # 格式化
npx eas build --profile preview|production   # EAS 构建
npx react-native-reusables/cli@latest add    # 添加 UI 组件
```

## 环境变量（`.env`，`EXPO_PUBLIC_*` 前缀自动注入 process.env，公开勿放密钥）

```env
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

## 项目结构

```
app/            # 文件路由；_layout.tsx 根布局（Provider 链 + 全局导航骨架）
components/     # ui/ 基础组件；ui-preSettings/ 业务预设；bar/ 导航；index/ 首页；user/ 用户
hooks/ i18n/    # useAuthSession / i18n 初始化与双语文案
lib/            # theme、queryClient、cn、format
supabase/       # client、auth、sections、items、types（Zod schema）、migrations
assets/ global.css tailwind.config.js babel.config.js metro.config.js eas.json app.json
```

## 架构约定

- **路由**：`_layout.tsx` 引入 global.css，按 I18next→Query→Toast→Theme 包裹，渲染 NavBar + Stack + BottomBar；Stack `headerShown:false`；typedRoutes 开启路径类型检查
- **主题**：CSS 变量（HSL）→ tailwind 类；`darkMode:'class'`；`lib/theme.ts` 导出 THEME/NAV_THEME
- **UI**：cva 变体 + `cn()`；Text 用 TextClassContext 继承样式；Icon 用 cssInterop 映射 size
- **Supabase**：单例客户端（Web localStorage / 移动端 AsyncStorage）；响应在 types.ts 边界 Zod 解析（schema 即类型，禁 `as`/`!`）；RLS 按 uid 隔离；分页 `range`+`count:'exact'`；汇总走 RPC `get_section_summary(s)`；登录/OTP/会话见 auth.ts
- **Query**：全局单例（staleTime 60s、retry:false）；读 useQuery、写 useMutation，成功后 invalidateQueries
- **表单**：Zod schema 唯一数据源 + `useForm`；提交 useMutation（isPending 防重复）；网络/服务端错误在 mutation 层处理
- **i18n**：初始取设备语言，fallback 'zh'；文案必须 `t()`，禁止硬编码中英文
- **跨平台**：`Platform.select()` 处理 Web 特有样式
- **EAS**：eas.json 三 profile；app.json 含 projectId

## 编码规范（.claude/rules/）

- [comment](.claude/rules/comment.md) 业务代码配中文注释
- [network](.claude/rules/network.md) 网络统一 fetch
- [zod](.claude/rules/zod.md) 运行时校验用 zod，schema 即类型
- [form](.claude/rules/form.md) 表单用 Query+Form+Zod
- [component](.claude/rules/component.md) 复杂样式用组件复用

## 格式化

Prettier：100 列、单引号、尾逗号（es5）、bracketSameLine；prettier-plugin-tailwindcss 自动排序（tailwindFunctions:["cva"]）
