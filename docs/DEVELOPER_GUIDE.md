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

| File                                                        | Role                  |
| ----------------------------------------------------------- | --------------------- |
| `supabase/migrations/20260801000000_item_summaries_rpc.sql` | RPC functions + index |
| `supabase/items.ts`                                         | Client wrappers       |
| `supabase/types.ts`                                         | Response schemas      |

**Logic**

- `get_section_summaries(uid)` — home: sums **per section** in one round trip (income/expense/balance).
- `get_section_summary(uid, section_id)` — detail: single row for the whole section.
- Both are `security invoker` + `uid` filter, so `items` RLS still applies.
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

### 6. i18n

- `i18n/index.ts` initializes from device language, `fallbackLng: 'zh'`, and persists the user's manual choice in AsyncStorage.
- All copy goes through `t()` with fully typed keys (`locales/{zh,en}.ts`); toggle is in `NavBar` (`components/bar/LanguageToggle.tsx`).

## Shared infrastructure (read before reimplementing)

- **`components/ui/`** — base `Button/Text/Input/Icon/Card/...` (RN Reusables + cva variants + `cn()`).
- **`components/ui-preSettings/`** — business presets: `GlassCard`, `PaginatedList`, `FormField`, `ModelSelect`, `ConfirmDialog`, `CountUpText`, `PageHeader`, `Pill`, `ScreenBackground`, `Toast`, `BrandButton`.
- **`PaginatedList`** has two modes: client slicing (pass full `items`) or server pagination (pass `total/currentPage/onPageChange`). Auto-clamps the page when data shrinks.
- **`lib/format.ts`** — `formatDate` (zh-CN/en-US) and `currencyPrefix` (`+￥`/`-￥`).
- Amounts animate with `CountUpText`.

## Conventions — don't break

- **Forms**: TanStack Form + zod (schema is the single source of truth); field errors from `field.state.meta.errors`; submit via `useMutation` (`isPending` prevents double-submit); invalidate queries on success.
- **Query keys**: `['sections', uid, page]`, `['items', uid, sectionId, page]`, `['sectionSummaries', uid]`, `['itemSummary', uid, sectionId]`, `['modelConfig']`.
- **Supabase boundary**: every query/response is parsed with zod (`parse`/`safeParse`) — no `as`, no `!`. RLS isolates data by `uid`; deletes assume ownership via RLS.
- **Data model**: `sections(id bigint, describe, uid, selected, created_at)` → `items(id, uid, section_id, isIncome, number numeric, reason, created_at)`; `profiles(id, username, avatar_url, bio, ...)`.

## Commands

```bash
pnpm dev | android | ios | web   # run
pnpm test                        # vitest
pnpm typecheck                   # tsc --noEmit
pnpm format:check                # prettier
npx eas build --profile preview | production
```
