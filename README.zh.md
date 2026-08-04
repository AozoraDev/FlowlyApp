# Flowly — AI 流水智能助手

![Flowly — AI-Powered Ledger Assistant](assets/imgs/flowly-banner.svg)

<p align="center">
  <img src="https://img.shields.io/badge/React%20Native-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React Native" />
  <img src="https://img.shields.io/badge/Expo-000020?style=flat-square&logo=expo&logoColor=white" alt="Expo" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/NativeWind-06B6D4?style=flat-square" alt="NativeWind" />
  <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/TanStack%20Query-FF4154?style=flat-square&logo=react-query&logoColor=white" alt="TanStack Query" />
  <img src="https://img.shields.io/badge/TanStack%20Form-FF4154?style=flat-square&logo=tanstack&logoColor=white" alt="TanStack Form" />
  <img src="https://img.shields.io/badge/Zod-3E67B1?style=flat-square&logo=zod&logoColor=white" alt="Zod" />
  <img src="https://img.shields.io/badge/i18next-26A69A?style=flat-square&logo=i18next&logoColor=white" alt="i18next" />
  <img src="https://img.shields.io/badge/Lucide-F56565?style=flat-square&logo=lucide&logoColor=white" alt="Lucide" />
  <img src="https://img.shields.io/badge/pnpm-F69220?style=flat-square&logo=pnpm&logoColor=white" alt="pnpm" />
  <img src="https://img.shields.io/badge/EAS%20Build-000020?style=flat-square&logo=expo&logoColor=white" alt="EAS Build" />
</p>

个人记账 / 流水管理移动应用，内置 AI-Agent 记账助手，一套代码库支持 **iOS / Android / Web** 三端。

- [中文版](README.zh.md) · [English](README.md)

---

## 简介

Flowly 基于 **Expo SDK 56** 与 **React Native Reusables** 构建，以「项目（sections）」组织流水，每个项目下记录多条「收支明细（items）」，收支汇总由 Postgres 函数**服务端聚合**，数据托管在 [Supabase](https://supabase.com/)（Auth + Postgres + RLS）。

内置 **AI-Agent 记账助手**：流式对话 + 函数调用（function calling），直接读写你的真实账目——问它「这个月花了多少」能查明细、说「在『日常』记一笔咖啡 ¥28」能落库，回答中的账目数据以 A2UI 卡片原生渲染。

## ✨ 功能特性

- **项目 / 明细管理**：项目（sections）下记录收入 / 支出明细（items）；删除项目级联清除明细；服务端分页列表 + 乐观更新（失败回滚）
- **服务端聚合汇总**：Postgres 函数 `get_section_summary` / `get_section_summaries` 一次聚合，只回传 income / expense / balance，流水量大也不必全量拉取客户端求和
- **邮箱认证**：密码登录、8 位邮箱验证码（OTP）注册、登出；会话自动持久化与刷新
- **AI-Agent 记账助手**
  - 多段对话持久化（[Supabase](https://supabase.com/) ai_chats / ai_messages，RLS 按用户隔离），支持新建 / 删除会话、清空消息
  - 流式输出（SSE），Agent 多轮工具循环：查项目 / 汇总 / 明细、记一笔 / 新建项目，读真实账目、写入前与用户确认
  - 回答中的账目数据以 **A2UI** 结构化 JSON 输出，客户端解析后渲染为原生统计卡 / 数据表（汇总卡由代码确定性生成，杜绝漏卡 / 算错）
  - 模型配置（OpenAI 兼容 URL / Key / 模型）仅存本机 AsyncStorage，**API Key 不上传**，支持连通性测试
- **中英双语**：按设备语言自动初始化，手动选择后持久化
- **明暗主题**：跟随系统（`class` 策略），品牌色玻璃风格 UI
- **三端一致**：iOS / Android / Web 共用一套代码，可在 [Expo Go](https://expo.dev/go) 中快速预览

## 🧰 技术栈

| 类别     | 选型                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 框架     | [Expo](https://docs.expo.dev/) SDK 56 + [Expo Router](https://expo.dev/router)（文件路由，typed routes）                                   |
| UI       | [React Native Reusables](https://reactnativereusables.com)（shadcn 风格）+ [Nativewind v4](https://www.nativewind.dev/)（Tailwind for RN） |
| 后端     | [Supabase](https://supabase.com/)（Auth + Postgres + RLS，服务端聚合 RPC）                                                                 |
| 数据请求 | [TanStack Query](https://tanstack.com/query/latest) v5（缓存 / mutation）                                                                  |
| 表单     | [TanStack Form](https://tanstack.com/form/latest) + [Zod](https://zod.dev/)（schema 即校验规则与类型来源）                                 |
| AI 对话  | OpenAI 兼容 `chat/completions`（[expo/fetch](https://docs.expo.dev/versions/latest/sdk/expo/) 流式 SSE）+ function calling                 |
| AI 输出  | [A2UI](https://github.com/a2ui-project/a2ui) 子集：模型输出 JSON → [Zod](https://zod.dev/) 解析 → 原生卡片渲染                             |
| AI 配置  | AsyncStorage（仅本机，密钥不上传）                                                                                                         |
| 国际化   | [i18next](https://www.i18next.com/) + react-i18next（zh / en）                                                                             |
| 图标     | [Lucide React Native](https://lucide.dev/)                                                                                                 |
| 其他     | AsyncStorage、expo-localization、react-native-reanimated                                                                                   |

## 🛤 技术路径（架构）

Flowly 分「**业务数据链**」与「**AI 链**」两条路径，抽象视角如下：

```
① 业务数据链（录入 → 展示）
  表单(TanStack Form+Zod) → 写入 mutation → Supabase(RLS 校验归属) → Postgres
  读取：useQuery 缓存(60s) → 服务端分页(range+count:'exact') → 汇总走 RPC

② AI 链（对话 → 账目 → 落库）
  用户消息落库 → 流式请求用户自配的 OpenAI 兼容端点(SSE)
      │ 模型按需发起函数调用(工具注册表)
      ▼
  工具经 Supabase 读写真实账目，结果串回给模型自愈
      │
      ▼
  模型组织回答：A2UI JSON 块(汇总卡由代码确定性生成) → 客户端 Zod 解析、原生卡片渲染 → 助手消息落库
```

**分层抽象：**

- **展示层** — 路由 Provider 链（i18n → Query → Toast → 主题）+ 导航骨架（NavBar + Stack + BottomBar）；业务组件与基础 UI（`components/ui/*`）分离，复杂样式抽为可复用组件
- **状态层** — TanStack Query 单例（`staleTime` 60s、`retry: false`），读 `useQuery` 写 `useMutation`，写后 `invalidateQueries`
- **数据边界层** — `supabase/*.ts` 统一用 [Zod](https://zod.dev/) 解析外部响应，**schema 即类型唯一来源**，业务代码不出现 `as` / `!`
- **服务层** — Postgres 表 + RLS（按 `uid` 隔离）+ 聚合 RPC（`security invoker`，叠加 `uid` 参数，只能聚合到本人数据）
- **AI 层** — 模型配置（本地）→ Agent 多轮循环（工具轮数上限 / 中止 / 流式增量）→ 工具注册表（zod 参数 schema 派生成 JSON Schema 下发模型）→ A2UI 输出子集（宽容解析，解析失败整块降级为文本，绝不白屏）

**设计要点：** 数据边界只在 `supabase/*.ts` 校验一次；Agent 工具中间态不持久化（重进会话由模型重新调工具自愈）；系统提示词分层稳定（基础提示词 + 按需注入的 A2UI 格式层），配合工具定义构成可命中前缀缓存（DeepSeek / Kimi / OpenRouter 自动缓存）的稳定前缀。

## 🚀 快速开始

### 前置要求

- Node.js ≥ 18，[pnpm](https://pnpm.io/)（或 npm / yarn / bun）
- 一个 [Supabase 项目](https://supabase.com/dashboard)（免费额度即可）

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置 Supabase

复制环境变量模板并填入项目凭据（Supabase Dashboard → Project Settings → API）：

```bash
cp .env.example .env
```

```env
# .env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

> `EXPO_PUBLIC_` 前缀由 Expo 自动注入 `process.env`，属公开配置，请勿放入密钥。

### 3. 初始化数据库

在 Supabase SQL Editor（或 `supabase db push`）执行迁移，按序号依次运行：

- [20260801000000_item_summaries_rpc.sql](supabase/migrations/20260801000000_item_summaries_rpc.sql) — 收支汇总 RPC `get_section_summary(s)`
- [20260803000000_ai_chats_rls.sql](supabase/migrations/20260803000000_ai_chats_rls.sql) — AI 会话 / 消息补列、触发器、索引与 RLS
- [20260804000000_ai_messages_token_usage.sql](supabase/migrations/20260804000000_ai_messages_token_usage.sql) — 消息表 token 用量列
- [20260805000000_item_summaries_time_range.sql](supabase/migrations/20260805000000_item_summaries_time_range.sql) — 汇总 RPC 可选时间范围

数据表概览：

- `profiles` — 用户档案
- `sections` — 项目（describe 名称、uid 归属、selected 选中态）
- `items` — 流水明细（section_id、isIncome、number 金额、reason 事由）
- `ai_chats` / `ai_messages` — AI 会话与消息（title、updated_at、token 用量，RLS 按 uid）

### 4. 运行

```bash
pnpm dev          # 启动 Expo 开发服务器（清除 Metro 缓存）
```

- **iOS**：按 `i`（仅 Mac）· **Android**：按 `a` · **Web**：按 `w`
- 也可用手机 [Expo Go](https://expo.dev/go) 扫码预览

## 📁 项目结构

```
app/                          # Expo Router 页面（文件路由）
  _layout.tsx                 # 根布局：i18n / Query / Toast / 主题 Provider + 导航骨架
  index.tsx                   # 首页：项目总览（分页列表 + 汇总 + 增删）
  items/[sectionId].tsx       # 项目明细页（分页明细 + 整区汇总卡）
  ai-agent/index.tsx          # AI-Agent 会话列表（多段对话，新建 / 删除）
  ai-agent/[chatId].tsx       # 单段对话页（流式气泡 + A2UI 卡片渲染）
  model-config.tsx            # AI 模型配置（URL / Key / 模型，连通性测试）
  not-config-model.tsx        # 未配置模型引导页
components/
  ui/                         # 基础 UI 组件（shadcn 风格：Button / Text / Icon / Card…）
  ui-preSettings/             # 业务预设组件（玻璃卡片、品牌按钮、分页列表、Toast…）
  ai-agent/                   # AI 组件（ChatBubble、A2uiRenderer、ChatRow、模型配置…）
ai/
  lib/                        # agent(多轮循环) · chat(协议/历史) · chatStream(SSE 流式)
                              # tools(工具注册表) · a2ui(A2UI schema+解析) · a2uiPresets(汇总卡生成)
                              # modelConfig(本地模型配置)
  prompt/systemPrompt.ts      # 系统提示词（zh/en 分层：基础 + A2UI 格式按需注入）
  hooks/                      # useChat(单段对话持久化) · useModelConfig(本地配置)
supabase/
  client.ts                   # Supabase 客户端单例（平台适配存储）
  auth.ts                     # 认证封装（登录 / 注册 / 会话 / OTP）
  sections.ts / items.ts      # 数据访问层（Zod 边界校验）
  aiChats.ts / aiMessages.ts  # AI 会话 / 消息数据访问层
  types.ts                    # Zod schema + 推导类型（唯一类型来源）
  migrations/                 # 数据库迁移（聚合 RPC + AI 表结构与 RLS）
lib/  hooks/  i18n/           # 基础设施 / 登录态 / 国际化（zh + en）
```

## 🔌 数据访问约定

- 所有 Supabase 查询 / 写入响应在 `supabase/*.ts` **边界处用 [Zod](https://zod.dev/) 解析**（schema 即类型来源），业务代码不手写 `as` / `!`
- 分页统一**服务端分页**（`range` + `count: 'exact'`），由 `PaginatedList` 驱动，而非前端切片
- 收支汇总走**服务端聚合 RPC**，函数 `security invoker` 创建 + `uid` 参数 + 表上 RLS，只能聚合到本人数据
- 归属隔离依赖 RLS：`sections` / `items` / `ai_chats` / `ai_messages` 均按 `auth.uid() = uid` 开启行级安全

## ✍️ 开发约定

项目内置代码规范，详见 [.claude/rules/](.claude/rules/)：

- **comment** — 业务代码配简体中文注释，说明「做什么、为什么」
- **network** — 网络请求统一原生 `fetch`，禁止 axios
- **zod** — 数据边界统一 Zod 校验，schema 即类型唯一来源
- **form** — 表单统一 TanStack Form + Zod + useMutation
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
pnpm test         # 运行测试
pnpm typecheck    # TypeScript 类型检查
pnpm format:check # Prettier 格式检查
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

更多：· [EAS Build](https://docs.expo.dev/build/introduction/) · [EAS Updates](https://docs.expo.dev/eas-update/introduction/) · [EAS Submit](https://docs.expo.dev/submit/introduction/)
