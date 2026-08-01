# rule: network

所有 HTTP 请求统一用原生 `fetch`，禁止引入 axios 等第三方 HTTP 库；已有依赖逐步替换。需公共配置（超时、鉴权头）时封装 `lib/http.ts` 小工具，底层仍用 fetch。

## 示例

```ts
const res = await fetch(`${API_BASE}/user`, { headers: { Authorization: `Bearer ${token}` } })
const data = await res.json()
```
