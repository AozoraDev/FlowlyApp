# rule: form

表单统一使用 TanStack Query + TanStack Form + Zod 构建，禁止手写 `useState` 管理表单状态、手写校验或自行处理提交态。

## 规则

- **Zod schema 是唯一数据源**：先定义 schema，用 `z.infer` 推导类型并接入 `@tanstack/zod-form-adapter` 校验器，一份 schema 同时覆盖校验规则与 payload 类型（同 [rule: zod](zod.md)）。
- **表单状态交给 TanStack Form**：用 `useForm` + `form.Field` 声明字段、`defaultValues` 定义初始值；禁止手写受控输入和字段联动。
- **校验分层**：字段级校验（`min`/`max`/`regex` 等）写进 schema，字段错误用 `field.state.meta.errors` 逐字段提示；网络/服务端错误在 mutation 层统一处理，不混入 zod。
- **提交用 `useMutation`**：`onSubmit` 先校验再调 mutation；`isPending` 驱动提交按钮 loading 并禁用，天然防重复提交；服务端错误用 `mutation.error` 展示，成功后 `invalidateQueries` 刷新缓存。
- **回填/初始化用 `useQuery`**：编辑表单等预填充场景用 query 拉取初始数据回填，读（query）与写（mutation）职责分离。
- **网络层遵守 [rule: network](network.md)**：`mutationFn` 底层用原生 `fetch`。

## 示例

```tsx
const signUpSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(8, '密码至少 8 位'),
});
type SignUp = z.infer<typeof signUpSchema>;

// 提交用 mutation，isPending 驱动按钮态并防重复提交
const mutation = useMutation({
  mutationFn: async (values: SignUp) => {
    const res = await fetch(`${API_BASE}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) throw new Error(await res.text());
  },
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
});

const form = useForm({
  defaultValues: { email: '', password: '' },
  validators: { onChange: signUpSchema, onSubmit: signUpSchema },
  onSubmit: ({ value }) => mutation.mutateAsync(value),
});
```
