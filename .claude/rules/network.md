# rule: network

HTTP 统一原生 fetch，禁 axios 等第三方库。需公共配置（超时、鉴权头）时封装 `lib/http.ts`，底层仍 fetch。
