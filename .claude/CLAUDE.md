# CLAUDE.md

此文件为 Claude Code（claude.ai/code）在此仓库中工作时提供指导。

## 项目概述

FlowlyApp 是一个基于 Expo SDK 56 和 React Native Reusables 构建的 React Native 移动应用。同一代码库支持 iOS、Android 和 Web 三端。

- **框架**：[Expo](https://docs.expo.dev/)（SDK 56）+ [Expo Router](https://expo.dev/router)（基于文件的路由）
- **UI**：[React Native Reusables](https://reactnativereusables.com)（类 shadcn/ui 风格的 RN 组件库），使用 [Nativewind v4](https://www.nativewind.dev/)（Tailwind CSS 的 RN 实现）进行样式设计
- **图标**：[Lucide React Native](https://lucide.dev/guide/packages/lucide-react-native)
- **语言**：TypeScript 6.0（严格模式）

## 常用命令

```bash
pnpm dev          # 启动 Expo 开发服务器（清除 Metro 缓存）
pnpm android      # 启动开发服务器 + Android 模拟器
pnpm ios          # 启动开发服务器 + iOS 模拟器（仅 Mac）
pnpm web          # 启动开发服务器 + 浏览器打开
pnpm clean        # 删除 .expo 和 node_modules
```

添加更多可复用的 UI 组件（交互式选择）：
```bash
npx react-native-reusables/cli@latest add
```

## 项目结构

```
app/                  # Expo Router 页面（基于文件的路由）
  _layout.tsx         # 根布局 — 包裹所有路由，设置 Provider
  index.tsx           # 首页（目前为空）
components/
  ui/                 # 可复用的 UI 基础组件（shadcn 风格）
    button.tsx        # Pressable 组件，通过 cva 定义变体
    icon.tsx          # Lucide 图标封装，支持 nativewind className
    text.tsx          # 文本组件，含排版变体（h1-h4, p, blockquote, code 等）
lib/
  theme.ts            # 亮/暗 HSL 颜色令牌 + 适配 NavigationTheme 的主题对象
  utils.ts            # cn() 工具函数：clsx + tailwind-merge（用于合并 Tailwind 类名）
assets/               # 静态资源（图标、启动屏）
global.css            # Tailwind 指令 + CSS 自定义属性（主题色定义）
tailwind.config.js    # 将 CSS 变量映射到 Tailwind 颜色类、动画配置
babel.config.js       # Babel 配置，含 nativewind JSX 导入源设置
metro.config.js       # Metro 打包器配置，含 nativewind CSS 处理
```

## 架构与约定

### 基于文件的路由（Expo Router）
- `app/_layout.tsx` 是根布局 — 它引入 `global.css`，设置主题 Provider、状态栏和 Portal 宿主。新路由的全局包装在这里添加。
- `app/` 目录下的每个 `.tsx` 文件自动成为一个路由。
- 入口点在 `package.json` 中声明（`"main": "expo-router/entry"`）。

### 主题系统
- `global.css` 中的 **CSS 自定义属性** 定义了亮/暗模式的 HSL 颜色令牌（如 `--background`、`--primary`、`--destructive`）。
- **Tailwind 配置**（`tailwind.config.js`）将这些 CSS 变量映射到 Tailwind 颜色类（`bg-background`、`text-foreground`、`border-border` 等）。
- 暗色模式使用 `class` 策略（`darkMode: 'class'`），通过 Nativewind 的 `useColorScheme()` 钩子切换。
- `lib/theme.ts` 导出 `THEME`（完整 HSL 令牌对象）和 `NAV_THEME`（兼容 Expo Router 的 `Theme` 对象，在 `_layout.tsx` 中使用）。

### UI 组件（shadcn/ui 模式）
- 组件使用 `class-variance-authority`（cva）定义基于变体的样式。
- `lib/utils.ts` 中的 `cn()` 工具函数通过 `clsx` + `tail-merge` 合并 Tailwind 类名。
- [Text 组件](components/ui/text.tsx) 导出 `TextClassContext`，子组件（如 [Button](components/ui/button.tsx) 和 [Icon](components/ui/icon.tsx)）通过读取该上下文继承文本样式。
- [Icon 组件](components/ui/icon.tsx) 使用 Nativewind 的 `cssInterop`，通过 `nativeStyleToProp` 将 `className` 转发到 `style` 属性（将 `height`/`width` 映射为 `size`）。

### 跨平台模式
- 组件使用 `Platform.select()` 处理 Web 特有的样式（如 focus-visible 环、悬停状态、文本选择）。
- `react-native-web` 实现浏览器渲染。Web 输出通过 Metro 打包器以静态模式输出。
- [Text](components/ui/text.tsx) 中的排版变体映射到相应的 ARIA 角色和级别，确保可访问性。

### 组件注册
- `components.json` 遵循 shadcn/ui 的 schema 格式 — 别名将 `@/` 映射到项目根目录，用于导入。
- 新组件可通过 `@react-native-reusables/cli` CLI 工具生成。

### 编码规范（详见 [.claude/rules/](.claude/rules/)）
- [rule: comment](.claude/rules/comment.md) — 业务代码配简体中文注释
- [rule: network](.claude/rules/network.md) — 网络请求统一用 `fetch`
- [rule: zod](.claude/rules/zod.md) — 运行时校验用 zod，schema 即类型
- [rule: form](.claude/rules/form.md) — 表单用 TanStack Query + Form + Zod
- [rule: component](.claude/rules/component.md) — 复杂样式用组件复用

### 代码格式化
- Prettier 配置：100 打印宽度、单引号、尾逗号（es5）、`bracketSameLine: true`。
- 使用 `prettier-plugin-tailwindcss`，`tailwindFunctions: ["cva"]` 实现 Tailwind 类名自动排序。
- 运行 `prettier --write .` 格式化代码，或在编辑器中配置保存时自动格式化。
