# rule: form

表单统一 TanStack Query + TanStack Form + Zod，禁手写 useState、手写校验或自管提交态。

- schema 唯一数据源：z.infer 推导类型，接 `@tanstack/zod-form-adapter` 校验器
- 状态交给 useForm：form.Field 声明字段、defaultValues 初始值，禁手写受控输入
- 校验分层：字段级（min/max/regex）写进 schema，用 field.state.meta.errors 逐字段提示；网络/服务端错误在 mutation 层处理
- 提交 useMutation：onSubmit 先校验再 mutate；isPending 驱动 loading 防重复；成功 invalidateQueries
- 编辑回填 useQuery，读写分离
- 网络遵守 [network.md](network.md)
