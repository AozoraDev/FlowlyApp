# Flowly 开发者指南

> 面向**人类开发者**：功能 → 代码文件 → 核心逻辑的速查图，帮助你快速上手。
> 非给 LLM 阅读。

## 技术栈

- **Expo SDK 56** + **Expo Router**（typed routes）+ RN Reusables + Nativewind v4 —— iOS / Android / Web 三端
- **后端**：Supabase（Auth + Postgres + RLS）
- **状态/表单**：TanStack Query v5 + TanStack Form + Zod v4
- i18next（zh/en，key 类型推导）、Lucide 图标、TS 严格模式

## 入口点

| 文件 | 职责 |
|---|---|
| `app/_layout.tsx` | 根布局：Provider 链 `I18next → Query → Toast → Theme`；自定义 `NavBar` + `Stack`（`headerShown:false`）+ `BottomBar` + `PortalHost` |
| `lib/queryClient.ts` | 全局 `QueryClient` 单例：`staleTime: 60_000`、`retry: false` |
| `global.css` / `lib/theme.ts` | HSL CSS 变量 → tailwind，`darkMode: 'class'` |

## 功能模块

### 1. 认证 —— 登录 / 注册 / 登出

| 功能 | 文件 |
|---|---|
| 登录（邮箱+密码） | `app/user.tsx`、`components/user/auth/Login.tsx`、`supabase/auth.ts` |
| 注册（邮箱验证码 OTP） | `components/user/auth/Register.tsx`、`components/user/auth/SendCodeButton.tsx` |
| 登出 / 用户信息 | `components/user/UserInfo.tsx`、`UserDetailCard.tsx`、`UserHeaderCard.tsx` |
| 登录态 | `hooks/useAuthSession.ts`、`supabase/auth.ts` |
| 未登录落地页 | `app/notlogin.tsx` |

**逻辑**

- `app/user.tsx` 按登录态在 登录 / 注册 / 用户信息 间切换（登出后重置回登录页）。
- **登录**：`signInWithEmail`；Supabase 错误 `code` → i18n key，表单下方内联展示（不走 toast）。
- **注册**：OTP 流程 —— `sendOtp`（`shouldCreateUser` 首次即自动建号）→ 输入 8 位验证码 → `verifyOtp`（校验并建立会话）→ `updatePassword` 设置密码完成注册。验证码错误抛 `OtpInvalidError` → 弹 `auth.codeIncorrect` toast。
- `useAuthSession` 挂载时恢复会话并订阅认证事件；各页面以此做守卫，未登录 `<Redirect href="/notlogin">`。
- **登出**（`UserInfo`）：先清除模型配置（本地存储 + 查询缓存），再 `signOut`。

### 2. 项目（sections）—— 首页列表与增删改

| 功能 | 文件 |
|---|---|
| 列表（分页） | `app/index.tsx`、`supabase/sections.ts` |
| 新建 | `app/create-section.tsx` |
| 卡片 / 选中 / 删除 | `components/index/ProjectCard.tsx`、`components/ui-preSettings/ConfirmDialog.tsx` |

**逻辑**

- 列表走**服务端分页**：`listSections(uid, page, 15)` → `range` + `count:'exact'`，按 `created_at desc`；页码进 `queryKey ['sections', uid, page]`。
- **新建**：表单（名称 ≤20 字）→ `createSection`；成功失效 `['sections', uid]`。
- **切换选中态**：乐观更新 —— 取消在途查询、本地改写当前页、失败回滚、settle 后失效整个前缀 `['sections', uid]`。只改当前页，避免跨页写入冲突。
- **删除**：`deleteSectionWithItems(id)` 走**两条查询** —— 先按 `section_id` 删 `items`，再删 section（不留孤儿数据）。归属校验交给 RLS。
- 每张项目卡的汇总来自聚合 RPC（见 §4）。

### 3. 明细（items）—— 项目明细页

| 功能 | 文件 |
|---|---|
| 列表（分页） | `app/items/[sectionId].tsx`、`supabase/items.ts` |
| 新建 | `app/items/create-item.tsx` |
| 卡片 / 删除 | `components/index/ItemCard.tsx` |
| 汇总头部 | `components/index/SummaryCard.tsx`、`MiniSummary.tsx` |

**逻辑**

- 路由参数：`sectionId`（number）+ 可选 `name`（页头标题）。
- 列表：`listItems(uid, sectionId, page, 15)`，同时限定 `uid` 与 `section_id`。
- **新建**：事由（≤50）+ 支出/收入切换（默认支出）+ 金额（>0）。金额以字符串输入，由 zod insert schema 的 `coerce` 统一转 number。
- **删除**：`deleteItem(id)`，二次确认弹窗收敛在 `ItemCard` 内。
- `useFocusEffect` 在返回时失效 `['itemSummary', uid, sectionId]`，新建/删除后顶部 `SummaryCard` 即时刷新。

### 4. 收支汇总 —— 服务端聚合（RPC）

| 文件 | 职责 |
|---|---|
| `supabase/migrations/20260801000000_item_summaries_rpc.sql` | RPC 函数 + 索引 |
| `supabase/items.ts` | 客户端封装 |
| `supabase/types.ts` | 响应 schema |

**逻辑**

- `get_section_summaries(uid)` —— 首页：**按项目分组**一次求和（收入/支出/结余）。
- `get_section_summary(uid, section_id)` —— 明细页：该项目整区一行汇总。
- 两者均 `security invoker` + `uid` 过滤，`items` 表 RLS 照常生效。
- PostgREST 把 `numeric` 序列化为字符串 → `supabase/types.ts` 用 `z.coerce.number()` 在边界解析一次。

### 5. AI 模型配置 —— 仅本地存储，OpenAI 兼容

| 功能 | 文件 |
|---|---|
| 纯逻辑 / 存储 / 网络 | `ai/lib/modelConfig.ts` |
| Query / mutation hooks | `ai/hooks/useModelConfig.ts`、`ai/hooks/useClearModelConfig.ts` |
| 配置页 | `app/model-config.tsx`、`components/ui-preSettings/ModelSelect.tsx` |
| 信息 / 清除页 | `app/model-info.tsx` |

**逻辑**

- 配置 `{ url, apiKey, model }` 仅存 **AsyncStorage**（本地），API Key 不上传 Supabase。
- **测试链接**：`GET {base}/models` + `Bearer` key（10s 超时）一次验证地址与密钥，并返回模型列表；响应解析失败则降级为手动输入模型名。
- 配置页**两步交互**：「确认」需在「测试链接」成功后且当前 `url`/`apiKey` 与测试记录一致才可点。
- 各页共用 `queryKey ['modelConfig']`（`staleTime: Infinity`）；保存/清除后 invalidate 自动同步。
- **登出时清除配置**，避免账号切换后残留上一账号的 Key。

### 6. i18n

- `i18n/index.ts` 初始化取设备语言，`fallbackLng: 'zh'`，用户手动选择持久化到 AsyncStorage。
- 全部文案走 `t()`，key 有完整类型推导（`locales/{zh,en}.ts`）；切换按钮在 `NavBar`（`components/bar/LanguageToggle.tsx`）。

## 共享基础设施（动手前先读）

- **`components/ui/`** —— 基础 `Button/Text/Input/Icon/Card/...`（RN Reusables + cva 变体 + `cn()`）。
- **`components/ui-preSettings/`** —— 业务预设：`GlassCard`、`PaginatedList`、`FormField`、`ModelSelect`、`ConfirmDialog`、`CountUpText`、`PageHeader`、`Pill`、`ScreenBackground`、`Toast`、`BrandButton`。
- **`PaginatedList`** 双模式：客户端切片（传全量 `items`）或服务端分页（传 `total/currentPage/onPageChange`）。数据删减导致页码越界时自动回落。
- **`lib/format.ts`** —— `formatDate`（zh-CN/en-US）与 `currencyPrefix`（`+￥`/`-￥`）。
- 金额统一走 `CountUpText` 数字滚动动效。

## 约定 —— 不要破坏

- **表单**：TanStack Form + zod（schema 是唯一数据源）；字段错误取 `field.state.meta.errors`；提交走 `useMutation`（`isPending` 防重复提交）；成功 invalidateQueries。
- **Query key**：`['sections', uid, page]`、`['items', uid, sectionId, page]`、`['sectionSummaries', uid]`、`['itemSummary', uid, sectionId]`、`['modelConfig']`。
- **Supabase 边界**：所有查询/响应经 zod 解析（`parse`/`safeParse`），禁 `as`/`!`；RLS 按 `uid` 隔离，删除类操作依赖 RLS 保证归属。
- **数据模型**：`sections(id bigint, describe, uid, selected, created_at)` → `items(id, uid, section_id, isIncome, number numeric, reason, created_at)`；`profiles(id, username, avatar_url, bio, ...)`。

## 命令

```bash
pnpm dev | android | ios | web   # 启动
pnpm test                        # vitest 单测
pnpm typecheck                   # tsc --noEmit
pnpm format:check                # prettier 检查
npx eas build --profile preview | production
```
