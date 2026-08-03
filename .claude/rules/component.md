# rule: component

复杂样式优先复用组件，禁止业务代码堆叠长 className。

- 能用 `components/ui/*`（Button/Text/Icon/Input）就用，用 variant/size 表达语义，别手写 Pressable 重拼样式
- 同一样式组合重复 ≥2 次 → 抽到 components/
- 跨页复杂 UI → 封装组件，props 控制差异
- 一次性简单布局可写 className；超约 10 类或含多行平台分支时拆组件
- 不改 ui/* 公共接口迁就单页，用变体或业务包装
