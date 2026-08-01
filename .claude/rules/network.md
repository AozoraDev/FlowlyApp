# rule: network

所有网络请求必须使用 `fetch`，禁止引入其他 HTTP 库（如 axios、got、superagent 等）。

## 规则

- **所有 HTTP 请求统一使用原生 `fetch`**，不做二次封装成独立请求库。
- 禁止新增 `axios` 等第三方 HTTP 客户端依赖；已存在应逐步替换为 `fetch`。
- 需要公共配置（超时、鉴权头等）时，封装 `lib/http.ts` 之类小工具，底层仍用 `fetch`。

## 示例

```ts
const res = await fetch(`${API_BASE}/user`, {
  headers: { Authorization: `Bearer ${token}` },
})
const data = await res.json()
```
