# rule: zod

运行时数据校验统一使用 zod，禁止手写 if 校验、`as` 强转或 `!` 非空断言绕过校验。

## 规则

- **数据边界处必须用 zod** 校验并解析外部不可信数据，边界包括：Supabase 查询/写入响应、网络/API 响应、表单与用户输入、`process.env.*`、AsyncStorage/localStorage、Deep link/路由参数。
- **边界处解析一次，内部流转不再重复校验**：解析后类型贯穿内部逻辑，后续拿到的是已确认数据。
- **schema 是类型唯一来源**：用 `z.infer<typeof schema>` 推导类型，禁止平行手写同名 TS 类型；复杂业务校验（`min`/`max`/`regex` 等）写进 schema，而非散落在业务函数里。
- **用户输入优先用 `safeParse`** 拿字段级错误（`result.error.issues`）；内部不可信数据用 `parse`，失败即抛错。
- **避免过度设计**：纯内部内存数据流（TS 类型已保证）或单字段琐碎判断（如 `value.length > 0`），不必引入 zod。

## 示例

```ts
// 边界处用 zod 解析，校验与类型推导一步到位
const { data } = await (await supabase()).from('profiles').select('*').single();
const profile = profileSchema.parse(data);

// 用户输入用 safeParse 拿字段级错误
const result = signUpSchema.safeParse({ email, password });
if (!result.success) return result.error.issues;

// 环境变量用 zod 兜底，替代 `!` 断言
const env = envSchema.parse(process.env);
```
