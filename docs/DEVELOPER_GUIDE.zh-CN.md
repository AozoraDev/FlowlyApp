# Flowly 开发者指南

> 面向**人类开发者**：功能 → 代码文件 → 核心逻辑的速查图，帮助你快速上手。
> 非给 LLM 阅读。

## 技术栈

- **Expo SDK 56** + **Expo Router**（typed routes）+ RN Reusables + Nativewind v4 —— iOS / Android / Web 三端
- **后端**：Supabase（Auth + Postgres + RLS）
- **状态/表单**：TanStack Query v5 + TanStack Form + Zod v4
- i18next（zh/en，key 类型推导）、Lucide 图标、TS 严格模式

## 入口点

| 文件                          | 职责                                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `app/_layout.tsx`             | 根布局：Provider 链 `I18next → Query → Toast → Theme`；自定义 `NavBar` + `Stack`（`headerShown:false`）+ `BottomBar` + `PortalHost` |
| `lib/queryClient.ts`          | 全局 `QueryClient` 单例：`staleTime: 60_000`、`retry: false`                                                                        |
| `global.css` / `lib/theme.ts` | HSL CSS 变量 → tailwind，`darkMode: 'class'`                                                                                        |

## 功能模块

### 1. 认证 —— 登录 / 注册 / 登出

| 功能                   | 文件                                                                           |
| ---------------------- | ------------------------------------------------------------------------------ |
| 登录（邮箱+密码）      | `app/user.tsx`、`components/user/auth/Login.tsx`、`supabase/auth.ts`           |
| 注册（邮箱验证码 OTP） | `components/user/auth/Register.tsx`、`components/user/auth/SendCodeButton.tsx` |
| 登出 / 用户信息        | `components/user/UserInfo.tsx`、`UserDetailCard.tsx`、`UserHeaderCard.tsx`     |
| 登录态                 | `hooks/useAuthSession.ts`、`supabase/auth.ts`                                  |
| 未登录落地页           | `app/notlogin.tsx`                                                             |

**逻辑**

- `app/user.tsx` 按登录态在 登录 / 注册 / 用户信息 间切换（登出后重置回登录页）。
- **登录**：`signInWithEmail`；Supabase 错误 `code` → i18n key，表单下方内联展示（不走 toast）。
- **注册**：OTP 流程 —— `sendOtp`（`shouldCreateUser` 首次即自动建号）→ 输入 8 位验证码 → `verifyOtp`（校验并建立会话）→ `updatePassword` 设置密码完成注册。验证码错误抛 `OtpInvalidError` → 弹 `auth.codeIncorrect` toast。
- `useAuthSession` 挂载时恢复会话并订阅认证事件；各页面以此做守卫，未登录 `<Redirect href="/notlogin">`。
- **登出**（`UserInfo`）：先清除模型配置（本地存储 + 查询缓存），再 `signOut`。

### 2. 项目（sections）—— 首页列表与增删改

| 功能               | 文件                                                                              |
| ------------------ | --------------------------------------------------------------------------------- |
| 列表（分页）       | `app/index.tsx`、`supabase/sections.ts`                                           |
| 新建               | `app/create-section.tsx`                                                          |
| 卡片 / 选中 / 删除 | `components/index/ProjectCard.tsx`、`components/ui-preSettings/ConfirmDialog.tsx` |

**逻辑**

- 列表走**服务端分页**：`listSections(uid, page, 15)` → `range` + `count:'exact'`，按 `created_at desc`；页码进 `queryKey ['sections', uid, page]`。
- **新建**：表单（名称 ≤20 字）→ `createSection`；成功失效 `['sections', uid]`。
- **切换选中态**：乐观更新 —— 取消在途查询、本地改写当前页、失败回滚、settle 后失效整个前缀 `['sections', uid]`。只改当前页，避免跨页写入冲突。
- **删除**：`deleteSectionWithItems(id)` 走**两条查询** —— 先按 `section_id` 删 `items`，再删 section（不留孤儿数据）。归属校验交给 RLS。
- 每张项目卡的汇总来自聚合 RPC（见 §4）。

### 3. 明细（items）—— 项目明细页

| 功能         | 文件                                                  |
| ------------ | ----------------------------------------------------- |
| 列表（分页） | `app/items/[sectionId].tsx`、`supabase/items.ts`      |
| 新建         | `app/items/create-item.tsx`                           |
| 卡片 / 删除  | `components/index/ItemCard.tsx`                       |
| 汇总头部     | `components/index/SummaryCard.tsx`、`MiniSummary.tsx` |

**逻辑**

- 路由参数：`sectionId`（number）+ 可选 `name`（页头标题）。
- 列表：`listItems(uid, sectionId, page, 15)`，同时限定 `uid` 与 `section_id`。
- **新建**：事由（≤50）+ 支出/收入切换（默认支出）+ 金额（>0）。金额以字符串输入，由 zod insert schema 的 `coerce` 统一转 number。
- **删除**：`deleteItem(id)`，二次确认弹窗收敛在 `ItemCard` 内。
- `useFocusEffect` 在返回时失效 `['itemSummary', uid, sectionId]`，新建/删除后顶部 `SummaryCard` 即时刷新。

### 4. 收支汇总 —— 服务端聚合（RPC）

| 文件                                                                 | 职责              |
| ------------------------------------------------------------------ | --------------- |
| `supabase/migrations/20260801000000_item_summaries_rpc.sql`        | RPC 函数 + 索引     |
| `supabase/items.ts`                                                | 客户端封装           |
| `supabase/types.ts`                                                | 响应 schema       |
| `supabase/migrations/20260805000000_item_summaries_time_range.sql` | 首页 RPC 增加可选时间范围 |

**逻辑**

- `get_section_summaries(uid, p_from?, p_to?)` —— 首页：**按项目分组**一次求和（收入/支出/结余）。
- `get_section_summary(uid, section_id)` —— 明细页：该项目整区一行汇总。
- 两者均 `security invoker` + `uid` 过滤，`items` 表 RLS 照常生效。
- `p_from`/`p_to`（时间范围迁移新增）为可选参数，半开区间 `[from, to)` **只按流水消费时间 `items.created_at` 过滤** —— AI-Agent 问「这个月/某段时间」时用它；首页不传（null）行为与原来完全一致。
- PostgREST 把 `numeric` 序列化为字符串 → `supabase/types.ts` 用 `z.coerce.number()` 在边界解析一次。

### 5. AI 模型配置 —— 仅本地存储，OpenAI 兼容

| 功能                   | 文件                                                                |
| ---------------------- | ------------------------------------------------------------------- |
| 纯逻辑 / 存储 / 网络   | `ai/lib/modelConfig.ts`                                             |
| Query / mutation hooks | `ai/hooks/useModelConfig.ts`、`ai/hooks/useClearModelConfig.ts`     |
| 配置页                 | `app/model-config.tsx`、`components/ui-preSettings/ModelSelect.tsx` |
| 信息 / 清除页          | `app/model-info.tsx`                                                |

**逻辑**

- 配置 `{ url, apiKey, model }` 仅存 **AsyncStorage**（本地），API Key 不上传 Supabase。
- **测试链接**：`GET {base}/models` + `Bearer` key（10s 超时）一次验证地址与密钥，并返回模型列表；响应解析失败则降级为手动输入模型名。
- 配置页**两步交互**：「确认」需在「测试链接」成功后且当前 `url`/`apiKey` 与测试记录一致才可点。
- 各页共用 `queryKey ['modelConfig']`（`staleTime: Infinity`）；保存/清除后 invalidate 自动同步。
- **登出时清除配置**，避免账号切换后残留上一账号的 Key。
- 已保存的配置还**是 AI-Agent 的入口开关**（见 §6）：未配置时 `/ai-agent` 页会跳转 `/not-config-model`，保存配置后该页自动恢复回到 `/ai-agent`。

### 6. AI-Agent 聊天 —— 持久化多段对话，流式 + 工具（只读查账 / 写入记账）

| 功能         | 文件                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 系统提示词      | `ai/prompt/systemPrompt.ts`（`getSystemPrompt`、`localDateStr`，zh/en 双语模板字符串）                                                        |
| 聊天原语 / SSE | `ai/lib/chat.ts`（`parseChunk`、`accumulateToolCalls`、`buildChatMessages`、`truncateTitle`、`tokenUsageSchema`、zod schema）             |
| 流式传输       | `ai/lib/chatStream.ts`（`streamChatCompletion` —— 基于 `expo/fetch` 的 SSE，`include_usage` token 上报）                                   |
| Agent 循环   | `ai/lib/agent.ts`（`runAgentChat` → `{content, usage}`、`MAX_TOOL_ROUNDS`）                                                           |
| 工具         | `ai/lib/tools.ts`（`getChatTools`、`runTool`、`isWriteTool`、`isHelpTool`）                                                             |
| Query hook | `ai/hooks/useChat.ts`（`useChat`）                                                                                                   |
| 持久化        | `supabase/aiChats.ts`、`supabase/aiMessages.ts`、迁移 `20260803000000_ai_chats_rls.sql` + `20260804000000_ai_messages_token_usage.sql` |
| 页面         | `app/ai-agent/index.tsx`（会话列表）、`app/ai-agent/[chatId].tsx`（单段对话）、`app/not-config-model.tsx`（引导页）                                   |
| 组件         | `components/ai-agent/` —— `ChatBubble`、`ChatInputBar`、`ChatRow`、`ConfigureModelButton`                                             |
| 入口         | `components/bar/BottomBar.tsx` —— AI-Agent tab（中间，登录后展示）                                                                           |

**逻辑**

- **守卫** —— 入口门槛：
  - `BottomBar` 仅在**登录后**把 AI-Agent 插入中间位（未登录两个入口，登录后三个）。
  - `/ai-agent` 两页在未登录时跳 `/notlogin`，未配置模型时跳 `/not-config-model`。
- **会话列表**（`index.tsx`）：
  - 服务端分页：`listAiChats(uid, page, 15)` → `queryKey ['aiChats', uid, page]`。
  - 新建：`createAiChat(uid)` 后 push `/ai-agent/[chatId]`。
  - 删除：`deleteAiChat`（先删消息再删会话）。
  - `useFocusEffect` 在重新聚焦时失效 `['aiChats', uid]`，保证标题/排序即时刷新。
- **发送流水线**（`useChat`）：
  - **先落库用户消息** —— 问题不丢。
  - 若是首条消息，用 `truncateTitle`（20 字）生成会话标题。
  - `runAgentChat` 把增量文本流进本地助手占位气泡，成功后落库助手答案**并带上末帧的 token 用量**。
  - 工具中间态**不落库** —— 重进会话由模型重新调工具自愈。
  - 种子查询未完成前禁发；`pendingRef` 同步拦截连点；卸载时 abort 在途流。
- **Agent 循环**（`agent.ts`）：
  - 一次 `runAgentChat` = 最多 `MAX_TOOL_ROUNDS`（5）轮流式请求。
  - 返回 `{ content, usage }` —— usage 为多轮工具对话的用量合并（每轮 prompt 都带入上一轮工具结果，故逐轮累加）。
  - 每轮把 `onDelta`（增量文本）+ 累计的 `tool_calls` 前向转发，再经 `runTool` 执行。
  - 工具失败返回 `{ok:false,error}` 字符串且**永不抛异常**，循环得以存活。
  - `onPhase('thinking' | 'querying' | 'writing')` 驱动占位气泡：写入工具 → `writing`，`get_help` → `thinking`，只读查询 → `querying`。
- **流式**（`chatStream.ts`）：
  - SSE 必须走 **`expo/fetch`** —— RN 内置 fetch 读不了 `response.body`。
  - `TextDecoder({stream:true})` 保住多字节字符；行拆分器重组 SSE 帧；`[DONE]` 后 cancel reader。
  - 请求带 `stream_options: { include_usage: true }`，流式末帧携带 `usage` 经 `onUsage` 上抛（不支持该参数的端点忽略即可）；`parseChunk` 把缺省的用量字段补 0 归一化。
  - 非 2xx 读取响应体（截断 500 字符）抛 `HTTP <status>: <detail>` —— 端点不支持 tools 时诚实报错。
- **工具**（`tools.ts`）—— 6 个工具：3 只读 + 2 写入 + 1 帮助：
  - `list_sections` —— 全部项目。
  - `get_account_summaries` —— 各项目收支结余 + 合计，可选 `from`/`to` 时间范围。
  - `list_items` —— 某项目流水，分页，可选 `from`/`to` 时间范围。
  - `create_section` / `add_item`（`write:true`）—— 新建项目 / 记一笔；系统提示词强制模型调用前先向用户确认全部字段。
  - `get_help`（`help:true`）—— 返回固定的双语 `HELP_CONTENT` 原文（不即兴发挥）。
  - 参数 schema：zod → JSON Schema（`toToolJsonSchema`）剔除 `$schema`/`additionalProperties`/`default`/`pattern`（ISO 日期正则太长且重复多次，剥掉省 token，运行时校验仍由 zod 承担）；参数一律 `.optional()`，默认值放 executor，避免默认值混进 `required`。
- **时间范围**：`from`/`to` 接受 ISO 日期或带时间 ISO（date-only 按设备本地时区补 00:00 再经 `toUtcIso` 转 UTC）；**只按流水消费时间 `items.created_at` 过滤**（绝不涉及 `sections.created_at`）。后端由 `get_section_summaries(uid, p_from?, p_to?)` 支撑（见 §4）。
- **系统提示词**（`systemPrompt.ts`）：`getSystemPrompt(language, today?)` 注入设备本地日期，模型才知道「今天」是哪天、才能把「这个月」换算成 `from`/`to`；涉及账目必须调工具（工具返回为唯一事实来源，禁止编造金额）、写入前确认全部字段、按用户语言用 Markdown 回答、拒绝不安全请求。
- **Markdown**：`ChatBubble` 流式中保持纯文本 + 光标（避免语法未闭合闪烁），完成后用 `<Markdown>`（`@ronradtke/react-native-markdown-display`）渲染，颜色取自 `THEME`；助手回答完成且拿到用量时，正文下方补一行「消耗 {{total}} tokens」。
- **数据表**：`ai_chats(id, uid, title, created_at, updated_at)` → `ai_messages(id, chat_id, uid, is_user bool, content, prompt_tokens, completion_tokens, total_tokens, created_at)`。
  - `ai_chats_rls` 迁移补充 `title`/`updated_at`（含消息插入时更新 `updated_at` 的触发器）、索引、两张表的按 uid RLS；`ai_messages_token_usage` 迁移补三列可空 token（仅助手消息携带，用户消息/历史数据保持 null）。

### 7. i18n

- `i18n/index.ts` 初始化取设备语言，`fallbackLng: 'zh'`，用户手动选择持久化到 AsyncStorage。
- 全部文案走 `t()`，key 有完整类型推导（`locales/{zh,en}.ts`）；切换按钮在 `NavBar`（`components/bar/LanguageToggle.tsx`）。

## 共享基础设施（动手前先读）

- **`components/ui/`** —— 基础 `Button/Text/Input/Icon/Card/...`（RN Reusables + cva 变体 + `cn()`）。
- **`components/ui-preSettings/`** —— 业务预设：`GlassCard`、`PaginatedList`、`FormField`、`ModelSelect`、`ConfirmDialog`、`CountUpText`、`PageHeader`、`Pill`、`ScreenBackground`、`Toast`、`BrandButton`。
- **`components/ai-agent/`** —— 聊天 UI：`ChatBubble`（流式占位思考/查询/写入 + Markdown + token 用量小字）、`ChatInputBar`（纯展示输入框）、`ChatRow`（会话列表行）、`ConfigureModelButton`（跳转配置/信息页，`UserInfo` 也在用）。
- **`PaginatedList`** 双模式：客户端切片（传全量 `items`）或服务端分页（传 `total/currentPage/onPageChange`）。数据删减导致页码越界时自动回落。
- **`lib/format.ts`** —— `formatDate`（zh-CN/en-US，非法输入返回空串）、`currencyPrefix`（`+￥`/`-￥`）、`formatRelativeTime`（Intl.RelativeTimeFormat，超过一周回落 `formatDate`）。
- 金额统一走 `CountUpText` 数字滚动动效。

## 约定 —— 不要破坏

- **表单**：TanStack Form + zod（schema 是唯一数据源）；字段错误取 `field.state.meta.errors`；提交走 `useMutation`（`isPending` 防重复提交）；成功 invalidateQueries。
- **Query key**：`['sections', uid, page]`、`['items', uid, sectionId, page]`、`['sectionSummaries', uid]`、`['itemSummary', uid, sectionId]`、`['modelConfig']`、`['aiChats', uid, page]`、`['aiMessages', chatId]`。
- **AI 流式**：必须用 `expo/fetch`（RN 的 fetch 不能流式）；纯逻辑（`ai/lib/chat.ts`、`agent.ts`）不 import `expo/fetch`，保证 vitest 在 node 下可单测。
- **Supabase 边界**：所有查询/响应经 zod 解析（`parse`/`safeParse`），禁 `as`/`!`；RLS 按 `uid` 隔离，删除类操作依赖 RLS 保证归属。
- **数据模型**：`sections(id bigint, describe, uid, selected, created_at)` → `items(id, uid, section_id, isIncome, number numeric, reason, created_at)`；`profiles(id, username, avatar_url, bio, ...)`；`ai_chats(id, uid, title, created_at, updated_at)` → `ai_messages(id, chat_id, uid, is_user, content, prompt_tokens, completion_tokens, total_tokens, created_at)`。

## 命令

```bash
pnpm dev | android | ios | web   # 启动
pnpm test                        # vitest 单测
pnpm typecheck                   # tsc --noEmit
pnpm format:check                # prettier 检查
npx eas build --profile preview | production
```
