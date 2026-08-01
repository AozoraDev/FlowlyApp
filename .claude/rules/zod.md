# rule: zod

运行时校验统一用 zod，禁止手写 if 校验、`as` 强转或 `!` 断言绕过校验。

- **边界处必须解析**：Supabase 查询/写入、网络/API 响应、表单输入、`process.env.*`、AsyncStorage、路由参数等外部数据
- **边界解析一次**：解析后类型贯穿内部逻辑，不再重复校验
- **schema 是类型唯一来源**：用 `z.infer` 推导，禁止平行手写 TS 类型；min/max/regex 等写进 schema
- **用户输入用 `safeParse`** 拿字段级错误（`result.error.issues`）；内部不可信数据用 `parse`，失败即抛错
- **避免过度设计**：纯内部内存数据流或琐碎单字段判断不必引入 zod

## 示例

```ts
const profile = profileSchema.parse(data);           // 边界解析，类型贯穿内部
const result = signUpSchema.safeParse({ email, password });
if (!result.success) return result.error.issues;     // 用户输入拿字段级错误
```
