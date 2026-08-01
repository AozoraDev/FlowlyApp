# Flowly — 你的 AI 流水智能助手

Flowly 是一个基于 **Expo SDK 56** 与 **React Native Reusables** 构建的个人记账 / 流水管理移动应用，同一套代码库支持 **iOS、Android、Web** 三端。

以「项目」组织流水：每个项目下可记录多条**收入 / 支出明细**，并提供整区与服务端聚合的**收支汇总**。数据由 [Supabase](https://supabase.com/)（Auth + Postgres + RLS）承载。

## ✨ 功能特性

- **项目（sections）管理**：创建 / 删除项目，删除时级联清除其下全部明细；服务端分页列表，支持选中态（乐观更新，失败回滚）
- **收支明细（items）**：每个项目下记录收入 / 支出流水（名称 + 方向 + 金额），服务端分页加载，支持删除（二次确认）
- **收支汇总**：由 Postgres 函数 `get_section_summary` / `get_section_summaries` **在服务端一次性聚合**，只回传 income / expense / balance 三个数值，避免流水量大时全量拉取明细再客户端求和
- **邮箱认证**：密码登录、邮箱验证码（OTP，8 位）注册、登出；会话自动持久化与刷新
- **多语言**：中 / 英双语，按设备语言自动初始化，用户手动选择后持久化到 AsyncStorage
- **明暗主题**：跟随系统（`class` 策略），品牌色「深海军蓝 + 品牌蓝 / 绿」液态玻璃风格 UI
- **三端一致**：iOS / Android / Web，均支持在 Expo Go 中快速预览

## 🧰 技术栈

| 类别     | 选型                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 框架     | [Expo](https://docs.expo.dev/) SDK 56 + [Expo Router](https://expo.dev/router)（文件路由，typed routes）                                   |
| UI       | [React Native Reusables](https://reactnativereusables.com)（shadcn 风格）+ [Nativewind v4](https://www.nativewind.dev/)（Tailwind for RN） |
| 后端     | [Supabase](https://supabase.com/)（`@supabase/supabase-js`，Auth + Postgres + RLS）                                                        |
| 数据请求 | [TanStack Query](https://tanstack.com/query/latest) v5（查询缓存 / mutation）                                                              |
| 表单     | [TanStack Form](https://tanstack.com/form/latest) + [Zod](https://zod.dev/)（schema 即校验规则与类型来源）                                 |
| 国际化   | i18next + react-i18next（zh / en，类型推导的文案 key）                                                                                     |
| 图标     | [Lucide React Native](https://lucide.dev/)                                                                                                 |
| 其他     | AsyncStorage（会话 / 语言偏好）、expo-localization、react-native-reanimated                                                                |

## 🚀 快速开始

### 前置要求

- Node.js ≥ 18，[pnpm](https://pnpm.io/)（或 npm / yarn / bun）
- 一个 [Supabase 项目](https://supabase.com/dashboard)（免费额度即可）

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置 Supabase

复制环境变量模板并填入你的项目凭据（在 Supabase Dashboard → Project Settings → API 获取）：

```bash
cp .env.example .env
```

```env
# .env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

> `EXPO_PUBLIC_` 前缀的变量会被 Expo 自动注入 `process.env`，属公开配置，请勿放入密钥。

### 3. 初始化数据库

在 Supabase 中建表并开启 RLS，然后执行服务端聚合函数：

- 运行 [supabase/migrations/20260801000000_item_summaries_rpc.sql](supabase/migrations/20260801000000_item_summaries_rpc.sql)（在 Dashboard SQL Editor，或 `supabase db push`）

数据表概览（建表语句在 Supabase Dashboard 中创建）：

- `profiles`：用户档案（id、username、avatar_url、bio …）
- `sections`：项目（id、describe 名称、uid 归属用户、selected 选中态）
- `items`：流水明细（id、uid、section_id、isIncome 收支方向、number 金额、reason 事由）

### 4. 运行

```bash
pnpm dev          # 启动 Expo 开发服务器（清除 Metro 缓存）
```

启动后在终端按提示操作：

- **iOS**：按 `i` 启动模拟器（仅 Mac）
- **Android**：按 `a` 启动模拟器
- **Web**：按 `w` 在浏览器打开

也可以用手机上的 [Expo Go](https://expo.dev/go) 扫码，在三端上快速预览。

## 📁 项目结构

```
app/                          # Expo Router 页面（文件路由）
  _layout.tsx                 # 根布局：i18n / Query / Toast / 主题 Provider + 全局导航骨架
  index.tsx                   # 首页：项目总览（分页列表 + 汇总 + 增删）
  create-section.tsx          # 新建项目表单页
  items/[sectionId].tsx       # 项目明细页（分页明细 + 整区汇总卡）
  items/create-item.tsx       # 添加收支明细表单页
  user.tsx                    # 用户页：登录 / 注册 / 用户信息
  notlogin.tsx                # 未登录引导页
components/
  ui/                         # 基础 UI 组件（shadcn 风格：Button / Text / Icon / Input / Card / Toast…）
  ui-preSettings/             # 业务预设组件（玻璃卡片、品牌按钮、分页列表、Toast 等）
  bar/                        # 全局导航条 + 底部栏 + 语言切换
  index/                      # 首页业务组件（项目卡、明细卡、汇总卡）
  user/                       # 用户相关（信息卡、登录 / 注册表单）
hooks/
  useAuthSession.ts           # 登录态 Hook（恢复会话 + 订阅变更）
i18n/
  index.ts                    # i18next 初始化 + 语言持久化
  locales/{zh,en}.ts          # 双语文案（key 结构一致，t() 有类型推导）
lib/
  theme.ts                    # 亮/暗 HSL 令牌 + NavigationTheme
  queryClient.ts              # TanStack Query 客户端
  utils.ts / format.ts        # 工具函数
supabase/
  client.ts                   # Supabase 客户端单例（平台适配的存储）
  auth.ts                     # 认证封装（登录 / 注册 / 会话 / OTP）
  sections.ts / items.ts      # 数据访问层（Zod 边界校验）
  types.ts                    # Zod schema + 推导类型（唯一类型来源）
  migrations/                 # 数据库迁移（服务端聚合 RPC + 索引）
```

## 🔌 数据访问约定

- 所有 Supabase 查询 / 写入响应都在 `supabase/*.ts` **边界处用 Zod 解析**（schema 即类型来源），解析后类型贯穿内部逻辑，业务代码不再手写 `as` / `!` 断言
- 分页统一采用**服务端分页**（`range` + `count: 'exact'`），翻页由 `PaginatedList` 组件驱动，而非前端切片
- 收支汇总走**服务端聚合 RPC**，替代客户端全量拉取后求和；函数以 `security invoker` 创建，叠加 `uid` 参数 + 表上 RLS，只能聚合到本人数据
- 归属隔离依赖 Supabase **RLS**，请确保 `sections` / `items` 表按 `auth.uid() = uid` 开启行级安全

## ✍️ 开发约定

项目内置代码规范，详见 [.claude/rules/](.claude/rules/)：

- **comment** — 业务代码配简体中文注释，说明「做什么、为什么」
- **network** — 网络请求统一用原生 `fetch`（本项目经 Supabase 封装）
- **zod** — 数据边界处用 Zod 校验，schema 即类型唯一来源
- **form** — 表单统一 TanStack Form + Zod + useMutation，不手写 useState 表单态
- **component** — 复杂样式抽为可复用组件，不在业务代码堆叠冗长 className

代码格式化使用 Prettier（100 列、单引号、tailwind 类名排序）：

```bash
pnpm prettier --write .
```

## 🛠 常用命令

```bash
pnpm dev          # 启动 Expo 开发服务器（清除 Metro 缓存）
pnpm android      # 启动开发服务器 + Android 模拟器
pnpm ios          # 启动开发服务器 + iOS 模拟器（仅 Mac）
pnpm web          # 启动开发服务器 + 浏览器打开
pnpm clean        # 删除 .expo 和 node_modules
```

添加更多可复用 UI 组件（交互式选择）：

```bash
npx react-native-reusables/cli@latest add
```

## 📦 构建与部署（EAS）

使用 [Expo Application Services (EAS)](https://expo.dev/eas) 构建与发布，配置见 [eas.json](eas.json)（development / preview / production 三套 profile）：

```bash
npx eas build --profile preview      # 内部预览包
npx eas build --profile production   # 生产构建（Android 默认出 APK，可配 AAB）
```

更多：

- [EAS Build](https://docs.expo.dev/build/introduction/)
- [EAS Updates](https://docs.expo.dev/eas-update/introduction/)
- [EAS Submit](https://docs.expo.dev/submit/introduction/)
