# Flowly — Your AI-Powered Transaction Assistant

Flowly is a personal bookkeeping / transaction management mobile app built with **Expo SDK 56** and **React Native Reusables**. A single codebase serves **iOS, Android, and Web**.

Transactions are organized around **sections (projects)**: each section can hold multiple **income / expense items**, with **aggregated summaries** computed both per-section and server-side. Data is backed by [Supabase](https://supabase.com/) (Auth + Postgres + RLS).

## ✨ Features

- **Section management**: create / delete sections, cascading-deleting all of their items; server-side paginated list with a selected state (optimistic updates with rollback on failure)
- **Items**: record income / expense transactions per section (name + direction + amount), server-side pagination, delete with confirmation
- **Income / Expense summary**: aggregated **once on the server** via the Postgres functions `get_section_summary` / `get_section_summaries`, returning only three numbers (income / expense / balance) — no full-fetch-then-client-sum when item counts grow large
- **Email authentication**: password login, email verification code (8-digit OTP) sign-up, logout; automatic session persistence and refresh
- **i18n**: Chinese / English, auto-initialized from the device language, with the user's manual choice persisted to AsyncStorage
- **Light / dark theme**: follows the system (`class` strategy), liquid-glass UI with brand colors (deep navy + brand blue / green)
- **Consistent across platforms**: iOS / Android / Web, all quickly previewable in Expo Go

## 🧰 Tech Stack

| Category      | Choice                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Framework     | [Expo](https://docs.expo.dev/) SDK 56 + [Expo Router](https://expo.dev/router) (file-based routing, typed routes)                          |
| UI            | [React Native Reusables](https://reactnativereusables.com) (shadcn-style) + [Nativewind v4](https://www.nativewind.dev/) (Tailwind for RN) |
| Backend       | [Supabase](https://supabase.com/) (`@supabase/supabase-js`, Auth + Postgres + RLS)                                                         |
| Data fetching | [TanStack Query](https://tanstack.com/query/latest) v5 (query cache / mutations)                                                           |
| Forms         | [TanStack Form](https://tanstack.com/form/latest) + [Zod](https://zod.dev/) (schema as the single source of validation rules and types)    |
| i18n          | i18next + react-i18next (zh / en, type-inferred translation keys)                                                                          |
| Icons         | [Lucide React Native](https://lucide.dev/)                                                                                                 |
| Other         | AsyncStorage (session / language preference), expo-localization, react-native-reanimated                                                   |

## 🚀 Quick Start

### Prerequisites

- Node.js ≥ 18, [pnpm](https://pnpm.io/) (or npm / yarn / bun)
- A [Supabase project](https://supabase.com/dashboard) (the free tier is enough)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure Supabase

Copy the environment variable template and fill in your project credentials (available in Supabase Dashboard → Project Settings → API):

```bash
cp .env.example .env
```

```env
# .env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

> Variables prefixed with `EXPO_PUBLIC_` are auto-injected into `process.env` by Expo and are public configuration — do not put secrets here.

### 3. Initialize the database

Create the tables in Supabase, enable RLS, then run the server-side aggregation functions:

- Run [supabase/migrations/20260801000000_item_summaries_rpc.sql](supabase/migrations/20260801000000_item_summaries_rpc.sql) (in the Dashboard SQL Editor, or via `supabase db push`)

Table overview (CREATE TABLE statements are created in the Supabase Dashboard):

- `profiles`: user profiles (id, username, avatar_url, bio …)
- `sections`: projects (id, describe name, uid owner, selected state)
- `items`: transaction details (id, uid, section_id, isIncome direction, number amount, reason)

### 4. Run

```bash
pnpm dev          # Start the Expo dev server (clears Metro cache)
```

Follow the prompts in the terminal after it starts:

- **iOS**: press `i` to launch the simulator (Mac only)
- **Android**: press `a` to launch the emulator
- **Web**: press `w` to open in the browser

You can also scan the QR code with [Expo Go](https://expo.dev/go) on your phone to preview quickly on all three platforms.

## 📁 Project Structure

```
app/                          # Expo Router pages (file-based routing)
  _layout.tsx                 # Root layout: i18n / Query / Toast / theme providers + global nav skeleton
  index.tsx                   # Home: section overview (paged list + summary + add/delete)
  create-section.tsx          # New section form page
  items/[sectionId].tsx       # Section items page (paged items + section summary card)
  items/create-item.tsx       # Add income/expense item form page
  user.tsx                    # User page: login / sign-up / user info
  notlogin.tsx                # Not-logged-in onboarding page
components/
  ui/                         # Base UI components (shadcn-style: Button / Text / Icon / Input / Card / Toast…)
  ui-preSettings/             # Pre-built business components (glass cards, brand buttons, paged list, Toast…)
  bar/                        # Global nav bar + bottom bar + language switcher
  index/                      # Home business components (section card, item card, summary card)
  user/                       # User-related (info card, login / sign-up forms)
hooks/
  useAuthSession.ts           # Auth state hook (restore session + subscribe to changes)
i18n/
  index.ts                    # i18next init + language persistence
  locales/{zh,en}.ts          # Bilingual copy (same key structure, t() with type inference)
lib/
  theme.ts                    # Light/dark HSL tokens + NavigationTheme
  queryClient.ts              # TanStack Query client
  utils.ts / format.ts        # Utility functions
supabase/
  client.ts                   # Supabase client singleton (platform-adaptive storage)
  auth.ts                     # Auth wrappers (login / sign-up / session / OTP)
  sections.ts / items.ts      # Data access layer (Zod boundary validation)
  types.ts                    # Zod schemas + inferred types (single source of types)
  migrations/                 # Database migrations (server-side aggregation RPC + indexes)
```

## 🔌 Data Access Conventions

- All Supabase query / write responses are parsed with **Zod at the boundary** in `supabase/*.ts` (schema as the source of types); typed data flows through internal logic, and business code no longer writes `as` / `!` assertions
- Pagination is **server-side** throughout (`range` + `count: 'exact'`), driven by the `PaginatedList` component rather than client-side slicing
- Income / expense summaries go through **server-side aggregation RPCs** instead of fetching everything and summing client-side; functions are created with `security invoker`, combined with the `uid` parameter and RLS on the tables, so they can only aggregate the current user's own data
- Ownership isolation relies on Supabase **RLS** — make sure `sections` / `items` tables enable row-level security on `auth.uid() = uid`

## ✍️ Development Conventions

The project ships its own code rules — see [.claude/rules/](.claude/rules/):

- **comment** — business code carries concise Simplified Chinese comments explaining "what and why"
- **network** — network requests uniformly use native `fetch` (here wrapped via Supabase)
- **zod** — validate data at boundaries with Zod; schema is the single source of types
- **form** — forms uniformly use TanStack Form + Zod + useMutation; no hand-written `useState` form state
- **component** — extract complex styles into reusable components; no stacking long className strings in business code

Code formatting uses Prettier (100-column width, single quotes, tailwind class sorting):

```bash
pnpm prettier --write .
```

## 🛠 Common Commands

```bash
pnpm dev          # Start the Expo dev server (clears Metro cache)
pnpm android      # Start dev server + Android emulator
pnpm ios          # Start dev server + iOS simulator (Mac only)
pnpm web          # Start dev server + open in browser
pnpm clean        # Delete .expo and node_modules
```

Add more reusable UI components (interactive selection):

```bash
npx react-native-reusables/cli@latest add
```

## 📦 Build & Deploy (EAS)

Build and release with [Expo Application Services (EAS)](https://expo.dev/eas). Configuration lives in [eas.json](eas.json) (three profiles: development / preview / production):

```bash
npx eas build --profile preview      # Internal preview build
npx eas build --profile production   # Production build (Android defaults to APK; AAB is configurable)
```

Learn more:

- [EAS Build](https://docs.expo.dev/build/introduction/)
- [EAS Updates](https://docs.expo.dev/eas-update/introduction/)
- [EAS Submit](https://docs.expo.dev/submit/introduction/)
