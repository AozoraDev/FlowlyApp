# Flowly Developer Guide

> For **human developers**. A terse map of features → code files → core logic, so you can ramp up fast.
> Not written for LLM ingestion.

## Stack

- **Expo SDK 56** + **Expo Router** (typed routes) + RN Reusables + Nativewind v4 — iOS / Android / Web
- **Backend**: Supabase (Auth + Postgres + RLS)
- **State / Forms**: TanStack Query v5 + TanStack Form + Zod v4
- i18next (zh/en, typed keys), Lucide icons, TS strict

## Entry points

| File                          | Role                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/_layout.tsx`             | Root layout: Provider chain `I18next → Query → Toast → Theme`; custom `NavBar` + `Stack` (`headerShown:false`) + `BottomBar` + `PortalHost` |
| `lib/queryClient.ts`          | Global `QueryClient` singleton: `staleTime: 60_000`, `retry: false`                                                                         |
| `global.css` / `lib/theme.ts` | HSL CSS vars → tailwind, `darkMode: 'class'`                                                                                                |

## Feature map

### 1. Auth — login / register / logout

| Feature                | Files                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| Login (email+password) | `app/user.tsx`, `components/user/auth/Login.tsx`, `supabase/auth.ts`                                       |
| Register (email OTP)   | `components/user/auth/Register.tsx`, `components/user/auth/SendCodeButton.tsx`                             |
| Logout / user info     | `components/user/UserInfo.tsx`, `components/user/UserDetailCard.tsx`, `components/user/UserHeaderCard.tsx` |
| Session state          | `hooks/useAuthSession.ts`, `supabase/auth.ts`                                                              |
| Not-logged-in landing  | `app/notlogin.tsx`                                                                                         |

**Logic**

- `app/user.tsx` switches Login / Register / UserInfo by session state (reset to login after logout).
- **Login**: `signInWithEmail`; Supabase error `code` → i18n key, shown inline under the form (not a toast).
- **Register**: OTP flow — `sendOtp` (auto-creates the user via `shouldCreateUser`) → user enters 8-digit code → `verifyOtp` (validates code, establishes session) → `updatePassword` sets the password. Wrong code throws `OtpInvalidError` → `auth.codeIncorrect` toast.
- `useAuthSession` restores the session on mount then subscribes to auth events; every screen gates on it and `<Redirect href="/notlogin">` when logged out.
- **Logout** (`UserInfo`): clears the model config first (local storage + query cache), then `signOut`.

### 2. Sections (projects) — home list & CRUD

| Feature                | Files                                                                             |
| ---------------------- | --------------------------------------------------------------------------------- |
| List (paginated)       | `app/index.tsx`, `supabase/sections.ts`                                           |
| Create                 | `app/create-section.tsx`                                                          |
| Card / toggle / delete | `components/index/ProjectCard.tsx`, `components/ui-preSettings/ConfirmDialog.tsx` |

**Logic**

- List uses **server-side pagination**: `listSections(uid, page, 15)` → `range` + `count:'exact'`, `created_at desc`; page drives the `queryKey ['sections', uid, page]`.
- **Create**: form (name ≤ 20 chars) → `createSection`; invalidate `['sections', uid]` on success.
- **Toggle selected**: optimistic update — cancel in-flight query, patch the current page locally, rollback on error, invalidate the whole prefix `['sections', uid]` on settle. Only the current page is patched to avoid cross-page writes.
- **Delete**: `deleteSectionWithItems(id)` runs **two queries** — delete `items` by `section_id` first, then the section (no orphan rows). Ownership is enforced by RLS.
- Each card's summary comes from the aggregate RPC (see §4).

### 3. Items (ledger entries) — section detail page

| Feature          | Files                                                                  |
| ---------------- | ---------------------------------------------------------------------- |
| List (paginated) | `app/items/[sectionId].tsx`, `supabase/items.ts`                       |
| Create           | `app/items/create-item.tsx`                                            |
| Card / delete    | `components/index/ItemCard.tsx`                                        |
| Summary header   | `components/index/SummaryCard.tsx`, `components/index/MiniSummary.tsx` |

**Logic**

- Route params: `sectionId` (number) + optional `name` for the header.
- List: `listItems(uid, sectionId, page, 15)`, scoped by both `uid` and `section_id`.
- **Create**: reason (≤50) + income/expense toggle (default expense) + amount (> 0). Amount is input as string and coerced to number by the zod insert schema.
- **Delete**: `deleteItem(id)` with a `ConfirmDialog` inside `ItemCard`.
- `useFocusEffect` invalidates `['itemSummary', uid, sectionId]` when returning, so the top `SummaryCard` refreshes after create/delete.

### 4. Summaries — server-side aggregation (RPC)

| File                                                               | Role                       |
| ------------------------------------------------------------------ | -------------------------- |
| `supabase/migrations/20260801000000_item_summaries_rpc.sql`        | RPC functions + index      |
| `supabase/items.ts`                                                | Client wrappers            |
| `supabase/types.ts`                                                | Response schemas           |
| `supabase/migrations/20260805000000_item_summaries_time_range.sql` | home RPC time-range params |

**Logic**

- `get_section_summaries(uid, p_from?, p_to?)` — home: sums **per section** in one round trip (income/expense/balance).
- `get_section_summary(uid, section_id)` — detail: single row for the whole section.
- Both are `security invoker` + `uid` filter, so `items` RLS still applies.
- `p_from`/`p_to` (from the time-range migration) are optional, half-open `[from, to)` filters on **`items.created_at` only** — the AI-Agent's "this month / this period" questions use them; the home page omits them (`null`) so behavior is unchanged.
- PostgREST returns `numeric` as string → `z.coerce.number()` in `supabase/types.ts` parses it once at the boundary.

### 5. AI model config — local-only, OpenAI-compatible

| Feature                        | Files                                                               |
| ------------------------------ | ------------------------------------------------------------------- |
| Pure logic / storage / network | `ai/lib/modelConfig.ts`                                             |
| Query / mutation hooks         | `ai/hooks/useModelConfig.ts`, `ai/hooks/useClearModelConfig.ts`     |
| Configure page                 | `app/model-config.tsx`, `components/ui-preSettings/ModelSelect.tsx` |
| Info / clear page              | `app/model-info.tsx`                                                |

**Logic**

- Config `{ url, apiKey, model }` is stored in **AsyncStorage only** — the API key never reaches Supabase.
- **Test link**: `GET {base}/models` with `Bearer` key (10s timeout) validates the endpoint and returns the model list; if the response doesn't parse, it falls back to manual model input.
- Configure page is **two-step**: "confirm" is disabled until "test link" succeeds **and** the current `url`/`apiKey` still match the tested ones.
- All pages share `queryKey ['modelConfig']` (`staleTime: Infinity`); save/clear invalidate to sync across pages.
- **Logout clears the config** to prevent cross-account leakage.
- The saved config **gates the AI-Agent** (§6): `/ai-agent` screens redirect to `/not-config-model` when none exists, and that screen auto-recovers to `/ai-agent` once a config is saved.

### 6. AI-Agent chat — persisted multi-turn chat, streaming + tools (read & write)

| Feature               | Files                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| System prompt         | `ai/prompt/systemPrompt.ts` (`getSystemPrompt`, `localDateStr`, bilingual zh/en template strings)                                            |
| Chat primitives / SSE | `ai/lib/chat.ts` (`parseChunk`, `accumulateToolCalls`, `buildChatMessages`, `truncateTitle`, `tokenUsageSchema`, zod schemas)                |
| Streaming transport   | `ai/lib/chatStream.ts` (`streamChatCompletion` — SSE over `expo/fetch`, `include_usage` token reporting)                                     |
| Agent loop            | `ai/lib/agent.ts` (`runAgentChat` → `{content, usage}`, `MAX_TOOL_ROUNDS`)                                                                   |
| Tools                 | `ai/lib/tools.ts` (`getChatTools`, `runTool`, `isWriteTool`, `isHelpTool`)                                                                   |
| Query hook            | `ai/hooks/useChat.ts` (`useChat`)                                                                                                            |
| Persistence           | `supabase/aiChats.ts`, `supabase/aiMessages.ts`, migrations `20260803000000_ai_chats_rls.sql` + `20260804000000_ai_messages_token_usage.sql` |
| Screens               | `app/ai-agent/index.tsx` (list), `app/ai-agent/[chatId].tsx` (chat), `app/not-config-model.tsx` (guide)                                      |
| Components            | `components/ai-agent/` — `ChatBubble`, `ChatInputBar`, `ChatRow`, `ConfigureModelButton`                                                     |
| Entry                 | `components/bar/BottomBar.tsx` — AI-Agent tab (middle, login-gated)                                                                          |

**Logic**

- **Guards** — entry gating:
  - The AI-Agent tab is spliced into `BottomBar` **only when logged in** (two tabs logged out, three logged in).
  - Both `/ai-agent` screens redirect to `/notlogin` when logged out, and to `/not-config-model` when no model config exists.
- **Conversation list** (`index.tsx`):
  - Server-side pagination: `listAiChats(uid, page, 15)` → `queryKey ['aiChats', uid, page]`.
  - New chat: `createAiChat(uid)` then push `/ai-agent/[chatId]`.
  - Delete: `deleteAiChat` (messages then chat).
  - `useFocusEffect` invalidates `['aiChats', uid]` on refocus so titles/ordering refresh.
- **Send pipeline** (`useChat`):
  - Persist the user message **first** — the question is never lost.
  - If it's the first message, set the chat title via `truncateTitle` (20 chars).
  - `runAgentChat` streams deltas into a local assistant placeholder; on success, persist the assistant answer **plus the token usage** from the final stream frame.
  - Tool intermediates are **not persisted** — re-entering a chat lets the model re-call tools (self-heal).
  - Sends block until the seed query settles; `pendingRef` blocks double-taps; unmount aborts the in-flight stream.
- **Agent loop** (`agent.ts`):
  - One `runAgentChat` call = up to `MAX_TOOL_ROUNDS` (5) streaming rounds.
  - Returns `{ content, usage }` — usage merges each round's `usage` (every round's prompt carries the previous tool results, so they add up).
  - Each round forwards `onDelta` (incremental text) + accumulated `tool_calls`, then executes via `runTool`.
  - Tool failures return `{ok:false,error}` strings and **never throw**, so the loop survives.
  - `onPhase('thinking' | 'querying' | 'writing')` drives the placeholder bubble: write tools → `writing`, `get_help` → `thinking`, read-only queries → `querying`.
- **Streaming** (`chatStream.ts`):
  - SSE over **`expo/fetch`** — RN's built-in fetch can't read `response.body`.
  - `TextDecoder({stream:true})` preserves multi-byte chars; a line splitter reconstructs frames; `[DONE]` cancels the reader.
  - Requests set `stream_options: { include_usage: true }`; the final frame carries `usage`, surfaced via `onUsage` (endpoints that don't support it just ignore the field). `parseChunk` normalizes missing usage fields to 0.
  - Non-2xx reads the body (capped 500 chars) and throws `HTTP <status>: <detail>` — honest failure when the endpoint doesn't support tools.
- **Tools** (`tools.ts`) — 6 tools: 3 read-only, 2 write, 1 help:
  - `list_sections` — all sections.
  - `get_account_summaries` — per-section income/expense/balance + total, optional `from`/`to` time range.
  - `list_items` — one section's transactions, paginated, optional `from`/`to` time range.
  - `create_section` / `add_item` (`write:true`) — create a section / record an entry; the system prompt forces the model to confirm every field with the user first.
  - `get_help` (`help:true`) — returns the fixed bilingual `HELP_CONTENT` verbatim (no improvisation).
  - Arg schemas: zod → JSON Schema via `toToolJsonSchema` (strips `$schema`/`additionalProperties`/`default`/`pattern` — the ISO-date regex is dropped to save tokens; runtime validation still uses zod); params are `.optional()` so defaults never leak into `required`.
- **Time range**: `from`/`to` accept ISO date or datetime (date-only → device-local midnight → UTC via `toUtcIso`); they filter **only** on `items.created_at`, never `sections.created_at`. Backed by `get_section_summaries(uid, p_from?, p_to?)` (see §4).
- **System prompt** (`systemPrompt.ts`): `getSystemPrompt(language, today?)` injects the device-local date so the model knows "today" and can convert "this month" → `from`/`to`; call a tool for any ledger question (tool results are the only source of truth — never invent amounts), confirm all fields before any write, answer in the user's language with Markdown, refuse unsafe requests.
- **Markdown**: `ChatBubble` renders streaming as plain text + cursor (avoids unclosed-syntax flicker), then `<Markdown>` (`@ronradtke/react-native-markdown-display`) once done, themed from `THEME`; completed assistant answers show a `{{total}} tokens used` line when usage was reported.
- **DB**: `ai_chats(id, uid, title, created_at, updated_at)` → `ai_messages(id, chat_id, uid, is_user bool, content, prompt_tokens, completion_tokens, total_tokens, created_at)`.
  - `ai_chats_rls` adds `title`/`updated_at` (+ trigger touching `updated_at` on message insert), indexes, and per-uid RLS on both tables; `ai_messages_token_usage` adds the three nullable token columns (assistant messages only — user/historical rows stay `null`).

### 7. i18n

- `i18n/index.ts` initializes from device language, `fallbackLng: 'zh'`, and persists the user's manual choice in AsyncStorage.
- All copy goes through `t()` with fully typed keys (`locales/{zh,en}.ts`); toggle is in `NavBar` (`components/bar/LanguageToggle.tsx`).

## Shared infrastructure (read before reimplementing)

- **`components/ui/`** — base `Button/Text/Input/Icon/Card/...` (RN Reusables + cva variants + `cn()`).
- **`components/ui-preSettings/`** — business presets: `GlassCard`, `PaginatedList`, `FormField`, `ModelSelect`, `ConfirmDialog`, `CountUpText`, `PageHeader`, `Pill`, `ScreenBackground`, `Toast`, `BrandButton`.
- **`components/ai-agent/`** — chat UI: `ChatBubble` (streaming placeholder thinking/querying/writing + Markdown + token-usage line), `ChatInputBar` (presentational input), `ChatRow` (list row), `ConfigureModelButton` (routes to config/info, also used by `UserInfo`).
- **`PaginatedList`** has two modes: client slicing (pass full `items`) or server pagination (pass `total/currentPage/onPageChange`). Auto-clamps the page when data shrinks.
- **`lib/format.ts`** — `formatDate` (zh-CN/en-US, returns `''` on invalid input), `currencyPrefix` (`+￥`/`-￥`), `formatRelativeTime` (Intl.RelativeTimeFormat, falls back to `formatDate` past a week).
- Amounts animate with `CountUpText`.

## Conventions — don't break

- **Forms**: TanStack Form + zod (schema is the single source of truth); field errors from `field.state.meta.errors`; submit via `useMutation` (`isPending` prevents double-submit); invalidate queries on success.
- **Query keys**: `['sections', uid, page]`, `['items', uid, sectionId, page]`, `['sectionSummaries', uid]`, `['itemSummary', uid, sectionId]`, `['modelConfig']`, `['aiChats', uid, page]`, `['aiMessages', chatId]`.
- **AI streaming**: must use `expo/fetch` (RN's fetch can't stream); keep pure logic (`ai/lib/chat.ts`, `agent.ts`) free of `expo/fetch` so vitest can run them under node.
- **Supabase boundary**: every query/response is parsed with zod (`parse`/`safeParse`) — no `as`, no `!`. RLS isolates data by `uid`; deletes assume ownership via RLS.
- **Data model**: `sections(id bigint, describe, uid, selected, created_at)` → `items(id, uid, section_id, isIncome, number numeric, reason, created_at)`; `profiles(id, username, avatar_url, bio, ...)`; `ai_chats(id, uid, title, created_at, updated_at)` → `ai_messages(id, chat_id, uid, is_user, content, prompt_tokens, completion_tokens, total_tokens, created_at)`.

## Commands

```bash
pnpm dev | android | ios | web   # run
pnpm test                        # vitest
pnpm typecheck                   # tsc --noEmit
pnpm format:check                # prettier
npx eas build --profile preview | production
```
