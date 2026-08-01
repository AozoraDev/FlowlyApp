# rule: component

复杂样式优先用可复用组件，禁止在业务代码里堆叠冗长 className。

- 能用 `components/ui/*`（Button/Text/Icon/Input）就用，用 `variant`/`size` 表达语义，别手写 Pressable 重拼样式
- 同一样式组合重复 ≥2 次 → 抽到 `components/` 复用
- 跨页复用的复杂 UI → 封装组件，用 props 控制差异
- 一次性简单布局可写 className；超约 10 个类或含多行平台分支时拆组件
- 不改 `components/ui/*` 公共接口迁就单页，用变体或业务组件包装

```tsx
// 好：Button 表达意图，语义清晰
<Button variant="outline" size="sm" onPress={handleFollow}>
  <Icon as={UserPlus} size={16} />
  <Text>{t('follow')}</Text>
</Button>

// 不好：手写 Pressable 重拼按钮样式，无法复用
<Pressable onPress={handleFollow}
  className="flex-row items-center justify-center gap-2 rounded-md border border-border px-3 py-2 active:bg-accent">
  ...
</Pressable>
```
