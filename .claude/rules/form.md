# rule: form

表单统一用 TanStack Query + TanStack Form + Zod，禁止手写 useState 管理状态、手写校验或自行处理提交态。

- **schema 是唯一数据源**：z.infer 推导类型，接入 `@tanstack/zod-form-adapter` 校验器
- **状态交给 useForm**：`form.Field` 声明字段、`defaultValues` 初始值，禁止手写受控输入
- **校验分层**：字段级校验（min/max/regex）写进 schema，错误用 `field.state.meta.errors` 逐字段提示；网络/服务端错误在 mutation 层统一处理
- **提交用 useMutation**：onSubmit 先校验再调 mutation；`isPending` 驱动按钮 loading 并防重复提交；成功后 invalidateQueries
- **回填用 useQuery**：编辑场景 query 拉初始数据回填，读写分离
- 底层网络遵守 [rule: network](network.md)

```tsx
const mutation = useMutation({
  mutationFn: (values: SignUp) =>
    fetch(`${API_BASE}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    }).then(async (res) => {
      if (!res.ok) throw new Error(await res.text());
    }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
});

const form = useForm({
  defaultValues: { email: '', password: '' },
  validators: { onChange: signUpSchema, onSubmit: signUpSchema },
  onSubmit: ({ value }) => mutation.mutateAsync(value),
});
```
