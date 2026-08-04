# Flowly — AI-Powered Ledger Assistant

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

A personal bookkeeping / ledger management mobile app with a built-in AI-Agent assistant — one codebase targeting **iOS / Android / Web**.

- [English](README.md) · [简体中文](README.zh.md)

---

## Introduction

Flowly is a personal bookkeeping app built on **Expo SDK 56** and **React Native Reusables** — one codebase that targets **iOS, Android, and Web**. Ledger entries are organized into **sections** (projects), each holding income / expense **items** (transactions). Totals are aggregated **server-side** by Postgres functions, and all data lives in [Supabase](https://supabase.com/) (Auth + Postgres + RLS).

It also ships with an **AI-Agent assistant**: a streaming chat with function calling that reads and writes your actual ledger. Ask "how much did I spend this month?" and it queries your entries; tell it "record a ¥28 coffee under Daily" and it writes the entry. Any ledger data in its replies renders as native A2UI cards.

## ✨ Features

- **Sections & items** — projects (sections) hold income / expense entries (items); deleting a section cascades to its items; server-side pagination with optimistic updates (rolled back on failure)
- **Server-side aggregation** — Postgres functions `get_section_summary` / `get_section_summaries` return only income / expense / balance, so large ledgers never require pulling every row to sum on the client
- **Email auth** — password login, 8-digit email OTP signup, logout; session persisted and refreshed automatically
- **AI-Agent assistant**
  - Multi-chat persistence ([Supabase](https://supabase.com/) ai_chats / ai_messages, RLS-scoped per user); create / delete chats, clear messages
  - Streaming output (SSE) with a multi-round tool loop: query sections / summaries / items, record an entry / create a section — it reads real ledger data and confirms before any write
  - Ledger data replies use **A2UI** structured JSON, parsed client-side and rendered as native stat cards / data grids (summary cards are generated deterministically in code — never missing or miscounted)
  - Model config (OpenAI-compatible URL / Key / model) stored only in local AsyncStorage — **the API key never leaves the device**; connectivity test included
- **Bilingual** — follows the device language by default, with a manual override that is persisted
- **Light / dark theme** — follows system (`class` strategy), glassy brand UI
- **Three platforms** — iOS / Android / Web share one codebase; preview quickly in [Expo Go](https://expo.dev/go)

## 🧰 Tech Stack

| Category  | Choice                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Framework | [Expo](https://docs.expo.dev/) SDK 56 + [Expo Router](https://expo.dev/router) (file-based, typed routes)                                  |
| UI        | [React Native Reusables](https://reactnativereusables.com) (shadcn-style) + [Nativewind v4](https://www.nativewind.dev/) (Tailwind for RN) |
| Backend   | [Supabase](https://supabase.com/) (Auth + Postgres + RLS, aggregation RPC)                                                                 |
| Data      | [TanStack Query](https://tanstack.com/query/latest) v5 (cache / mutations)                                                                 |
| Forms     | [TanStack Form](https://tanstack.com/form/latest) + [Zod](https://zod.dev/) (schema as validation & type source)                           |
| AI chat   | OpenAI-compatible `chat/completions` ([expo/fetch](https://docs.expo.dev/versions/latest/sdk/expo/) streaming SSE) + function calling      |
| AI output | [A2UI](https://github.com/a2ui-project/a2ui) subset: model JSON → [Zod](https://zod.dev/) parse → native card rendering                    |
| AI config | AsyncStorage (local-only, key never uploaded)                                                                                              |
| i18n      | [i18next](https://www.i18next.com/) + react-i18next (zh / en)                                                                              |
| Icons     | [Lucide React Native](https://lucide.dev/)                                                                                                 |
| Other     | AsyncStorage, expo-localization, react-native-reanimated                                                                                   |

## 🛤 Tech Path (Architecture)

Flowly has two paths — the **business data path** and the **AI path**:

```
① Business data path (write → read)
  Form(TanStack Form+Zod) → write mutation → Supabase(RLS ownership) → Postgres
  Read: useQuery cache(60s) → server-side pagination(range+count:'exact') → RPC aggregation

② AI path (chat → ledger → persist)
  User message persisted → stream to a user-configured OpenAI-compatible endpoint (SSE)
      │ model issues function calls on demand (tool registry)
      ▼
  Tools read/write real ledger via Supabase; results fed back for the model to self-heal
      │
      ▼
  Model composes the answer: A2UI JSON block (summary cards generated deterministically in code)
      → client Zod parses & renders native cards → assistant message persisted
```

**Layered view:**

- **Presentation** — router Provider chain (i18n → Query → Toast → theme) + nav skeleton (NavBar + Stack + BottomBar); business components separated from base UI (`components/ui/*`); complex styles extracted into reusable components
- **State** — TanStack Query singleton (`staleTime` 60s, `retry: false`); reads via `useQuery`, writes via `useMutation`, then `invalidateQueries`
- **Data boundary** — `supabase/*.ts` parses every external response with [Zod](https://zod.dev/); **schema is the single type source**, no `as` / `!` in business code
- **Service** — Postgres tables + RLS (per `uid`) + aggregation RPC (`security invoker`, `uid` param — only aggregates the caller's own data)
- **AI** — local model config → agent multi-round loop (tool-round cap / abort / streaming deltas) → tool registry (zod parameter schemas derived into JSON Schema for the model) → A2UI output subset (lenient parsing; a failed block degrades to plain text, never a blank screen)

**Key design decisions:** data is validated exactly once at the `supabase/*.ts` boundary; agent tool intermediate state is not persisted (re-entering a chat lets the model re-call tools to self-heal); the system prompt is layered and stable (base prompt + an A2UI format layer injected on demand), forming a stable prefix that hits automatic provider caching (DeepSeek / Kimi / OpenRouter).

## 🚀 Quick Start

### Prerequisites

- Node.js ≥ 18, [pnpm](https://pnpm.io/) (or npm / yarn / bun)
- A [Supabase project](https://supabase.com/dashboard) (free tier is enough)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure Supabase

Copy the env template and fill in your project credentials (Supabase Dashboard → Project Settings → API):

```bash
cp .env.example .env
```

```env
# .env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

> `EXPO_PUBLIC_` variables are auto-injected by Expo into `process.env` — public config, never put secrets here.

### 3. Initialize the database

Run the migrations in order (Supabase SQL Editor, or `supabase db push`):

- [20260801000000_item_summaries_rpc.sql](supabase/migrations/20260801000000_item_summaries_rpc.sql) — summary RPC `get_section_summary(s)`
- [20260803000000_ai_chats_rls.sql](supabase/migrations/20260803000000_ai_chats_rls.sql) — AI chats/messages columns, trigger, indexes & RLS
- [20260804000000_ai_messages_token_usage.sql](supabase/migrations/20260804000000_ai_messages_token_usage.sql) — token usage columns on messages
- [20260805000000_item_summaries_time_range.sql](supabase/migrations/20260805000000_item_summaries_time_range.sql) — optional time range on summary RPC

Key tables:

- `profiles` — user profiles
- `sections` — projects (describe name, uid owner, selected flag)
- `items` — ledger entries (section_id, isIncome, number amount, reason)
- `ai_chats` / `ai_messages` — AI chats & messages (title, updated_at, token usage; RLS per uid)

### 4. Run

```bash
pnpm dev          # start the Expo dev server (clears Metro cache)
```

- **iOS**: press `i` (Mac only) · **Android**: press `a` · **Web**: press `w`
- Or scan the QR with [Expo Go](https://expo.dev/go) on your phone

## 📁 Project Structure

```
app/                          # Expo Router pages (file-based routing)
  _layout.tsx                 # Root layout: i18n / Query / Toast / theme providers + nav skeleton
  index.tsx                   # Home: section overview (paged list + summaries + CRUD)
  items/[sectionId].tsx       # Section detail (paged items + section summary card)
  ai-agent/index.tsx          # AI-Agent chat list (multi-chat, create / delete)
  ai-agent/[chatId].tsx       # Single chat (streaming bubbles + A2UI card rendering)
  model-config.tsx            # AI model config (URL / Key / model, connectivity test)
  not-config-model.tsx        # "no model configured" guide
components/
  ui/                         # Base UI (shadcn-style: Button / Text / Icon / Card…)
  ui-preSettings/             # Business presets (glass cards, brand buttons, paged list, Toast…)
  ai-agent/                   # AI components (ChatBubble, A2uiRenderer, ChatRow, model config…)
ai/
  lib/                        # agent(multi-round loop) · chat(protocol/history) · chatStream(SSE)
                              # tools(tool registry) · a2ui(A2UI schema+parse) · a2uiPresets(summary cards)
                              # modelConfig(local model config)
  prompt/systemPrompt.ts      # System prompts (zh/en, layered: base + on-demand A2UI format)
  hooks/                      # useChat(persisted single chat) · useModelConfig(local config)
supabase/
  client.ts                   # Supabase client singleton (platform-adaptive storage)
  auth.ts                     # Auth wrapper (login / signup / session / OTP)
  sections.ts / items.ts      # Data access layer (Zod boundary validation)
  aiChats.ts / aiMessages.ts  # AI chat / message data access
  types.ts                    # Zod schemas + derived types (single source of truth)
  migrations/                 # DB migrations (aggregation RPC + AI tables & RLS)
lib/  hooks/  i18n/           # Infrastructure / auth session / i18n (zh + en)
```

## 🔌 Data Access Conventions

- Every Supabase response is parsed with [Zod](https://zod.dev/) **at the `supabase/*.ts` boundary** (schema as type source); no hand-written `as` / `!` in business code
- Pagination is always **server-side** (`range` + `count: 'exact'`), driven by `PaginatedList`, never client slicing
- Summaries go through **server-side aggregation RPC** — functions are `security invoker`, take a `uid` param, and rely on table RLS, so they can only aggregate the caller's own data
- Isolation relies on RLS: `sections` / `items` / `ai_chats` / `ai_messages` all enable row-level security with `auth.uid() = uid`

## ✍️ Dev Conventions

Built-in code rules live in [.claude/rules/](.claude/rules/):

- **comment** — Chinese comments in business code, explaining "what & why"
- **network** — native `fetch` only, no axios
- **zod** — Zod validation at data boundaries; schema as the single type source
- **form** — TanStack Form + Zod + useMutation for all forms
- **component** — extract complex styles into reusable components instead of piling long classNames in business code

Formatting uses Prettier (100 columns, single quotes, tailwind class sorting):

```bash
pnpm prettier --write .
```

## 🛠 Commands

```bash
pnpm dev          # start Expo dev server (clears Metro cache)
pnpm android      # dev server + Android emulator
pnpm ios          # dev server + iOS simulator (Mac only)
pnpm web          # dev server + open in browser
pnpm test         # run tests
pnpm typecheck    # TypeScript type check
pnpm format:check # Prettier check
pnpm clean        # remove .expo and node_modules
```

Add more reusable UI components (interactive picker):

```bash
npx react-native-reusables/cli@latest add
```

## 📦 Build & Deploy (EAS)

Build and release with [Expo Application Services (EAS)](https://expo.dev/eas); config in [eas.json](eas.json) (development / preview / production profiles):

```bash
npx eas build --profile preview      # internal preview build
npx eas build --profile production   # production build (APK by default, AAB configurable)
```

More: · [EAS Build](https://docs.expo.dev/build/introduction/) · [EAS Updates](https://docs.expo.dev/eas-update/introduction/) · [EAS Submit](https://docs.expo.dev/submit/introduction/)
