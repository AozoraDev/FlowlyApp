# rule: component

复杂 CSS 样式优先用 react-native-reusables 可复用组件替代，禁止在业务代码里堆叠冗长 className，提升可读性、可维护性与复用性。

## 规则

- **能用基础组件不手写样式**：优先用 `components/ui/*`（[Button](components/ui/button.tsx)、[Text](components/ui/text.tsx)、[Icon](components/ui/icon.tsx)、[Input](components/ui/input.tsx) 等），用 `variant`/`size` 表达语义，而非原生组件 + className 重拼交互和外观。
- **重复 ≥2 次的样式组合抽为业务组件**：同一区块（如头像卡片、详情行）多处同布局同样式时，抽到 `components/` 下复用，className 只在组件内部出现一次。
- **跨页面复用的复杂 UI 封装成组件**：多状态/多步骤/跨页 UI 块（表单、标签、列表行）用 props 控制差异，避免复制粘贴后各自演进。
- **一次性简单布局可直接写 className**，但单次超过约 10 个类/含多行平台分支时应拆组件。
- **不改 `components/ui/*` 公共接口迁就单页**：需求差异用变体或业务组件包装解决，不在页面里绕过它手写同款样式。

## 示例

```tsx
// 好：用 Button 表达意图，语义清晰
<Button variant="outline" size="sm" onPress={handleFollow}>
  <Icon as={UserPlus} size={16} />
  <Text>{t('follow')}</Text>
</Button>

// 不好：手写 Pressable 重拼按钮样式，无法复用
<Pressable
  onPress={handleFollow}
  className="flex-row items-center justify-center gap-2 rounded-md border border-border px-3 py-2 active:bg-accent"
>
  <Icon as={UserPlus} size={16} />
  <Text className="text-sm font-medium">{t('follow')}</Text>
</Pressable>
```

```tsx
// 好：重复卡片抽成业务组件，一处维护
// components/UserCard.tsx —— 用户卡片：头像 + 显示名 + 加入时间
function UserCard({ user }: { user: User }) {
  return (
    <View className="items-center rounded-2xl bg-card p-6">
      <Avatar url={user.avatar_url} />
      <Text className="mt-3 text-xl font-bold">{user.displayName}</Text>
    </View>
  );
}
```
