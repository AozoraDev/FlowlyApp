# rule: zod

运行时校验统一 zod，禁手写 if 校验、`as` 强转、`!` 断言。

- 边界解析一次：Supabase 查询/写入、网络响应、表单输入、process.env、AsyncStorage、路由参数等外部数据用 zod，解析后类型贯穿内部，不重复校验
- schema 唯一类型来源：z.infer 推导，禁平行手写 TS 类型；min/max/regex 写进 schema
- 用户输入用 safeParse 拿字段级错误（result.error.issues）；内部不可信数据用 parse，失败即抛
- 纯内部内存流或琐碎单字段判断不必引入 zod
