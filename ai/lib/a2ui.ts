import { z } from 'zod';

// ============================================================
// A2UI 子集：模型在回答里以 ```a2ui 围栏 JSON 块输出结构化 UI（Anthropic App UI 组件树风格），
// 客户端解析后渲染成原生卡片（统计卡 + 数据表），替代 RN 里观感差的 markdown 表格。
// schema 即类型唯一来源；字段宽容（可选字段、数字/字符串兼收、未知键剥离），
// 兼容两种模型写法：{ "type":"App", ... } 或键名即组件类型的 { "App":{...} }（见 normalizeTaggedA2ui）；
// 模型输出有偏差时整块降级为普通文本（见 parseA2uiBlocks），绝不让气泡白屏。
// ============================================================

// 数值展示字段：模型可能输出数字字符串或纯数字，统一接受，渲染时 String()
const displayValue = z.union([z.string(), z.number()]);
// 表格单元格：再加 null（模型漏填时以空串展示，不拖垮整块）
const cellValue = z.union([z.string(), z.number(), z.null()]);

const statCardSchema = z.object({
  type: z.literal('StatCard'),
  title: z.string().optional(),
  value: displayValue,
  text: z.string().optional(),
});

const statSchema = z.object({
  type: z.literal('Stat'),
  label: z.string(),
  value: displayValue,
});

// 表格列定义：data_type 决定对齐（number 右对齐）与日期渲染；display_name 为展示名
const columnSchema = z.object({
  name: z.string(),
  data_type: z.enum(['string', 'number', 'date']).default('string'),
  display_name: z.string().optional(),
  // 官方规范的数字列格式（小数位）；本实现直接展示模型给出的字符串，保留字段仅为兼容模型输出
  format: z
    .object({ type: z.literal('decimal'), digits: z.number().int().nonnegative().optional() })
    .optional(),
});

// 行数据两种写法兼容：{ values: {列名: 值} }（提示词格式）或平铺 {列名: 值}（模型常见输出）。
// 平铺时多余键经 catchall 收集，transform 归并进 values；values 缺省兜底为空对象
const rowSchema = z
  .object({
    id: z.string().optional(),
    values: z.record(z.string(), cellValue).optional(),
  })
  .catchall(cellValue)
  .transform((row) => {
    const { id, values, ...flatValues } = row;
    // id 只在模型给过时带上，避免 transform 输出把 id 变成必填键
    return {
      ...(id !== undefined ? { id } : {}),
      values: { ...(values ?? {}), ...flatValues },
    };
  });

const dataGridSchema = z.object({
  type: z.literal('DataGrid'),
  title: z.string().optional(),
  data: z.object({
    columns: z.array(columnSchema).min(1),
    rows: z.array(rowSchema),
  }),
});

const dateTimeSchema = z.object({
  type: z.literal('DateTime'),
  value: z.string(),
  style: z.enum(['relative', 'absolute']).optional(),
});

const textSchema = z.object({
  type: z.literal('Text'),
  text: z.string(),
});

// 叶子节点类型（非递归分支，直接由 schema 推导，符合「schema 即类型」约定）
type A2uiLeaf =
  | z.infer<typeof statCardSchema>
  | z.infer<typeof statSchema>
  | z.infer<typeof dataGridSchema>
  | z.infer<typeof dateTimeSchema>
  | z.infer<typeof textSchema>;

// 容器节点：children 递归引用 A2uiNode；递归分支无法由 schema 直接自推导，需手写类型标注
type A2uiContainer =
  | { type: 'App'; title?: string; children: A2uiNode[] }
  | { type: 'Section'; title?: string; children: A2uiNode[] };

export type A2uiNode = A2uiLeaf | A2uiContainer;

// 递归 schema：z.lazy 让容器 children 自引用；显式标注 ZodType<A2uiNode> 打断类型推导环
export const a2uiNodeSchema: z.ZodType<A2uiNode> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('App'),
      title: z.string().optional(),
      children: z.array(a2uiNodeSchema).default([]),
    }),
    z.object({
      type: z.literal('Section'),
      title: z.string().optional(),
      children: z.array(a2uiNodeSchema).default([]),
    }),
    statCardSchema,
    statSchema,
    dataGridSchema,
    dateTimeSchema,
    textSchema,
  ])
);

// 渲染器按具体组件类型取值的便捷类型
export type A2uiApp = Extract<A2uiNode, { type: 'App' }>;
export type A2uiSection = Extract<A2uiNode, { type: 'Section' }>;
export type A2uiStatCard = Extract<A2uiNode, { type: 'StatCard' }>;
export type A2uiStat = Extract<A2uiNode, { type: 'Stat' }>;
export type A2uiDataGrid = Extract<A2uiNode, { type: 'DataGrid' }>;
export type A2uiDataGridColumn = A2uiDataGrid['data']['columns'][number];
export type A2uiDateTime = Extract<A2uiNode, { type: 'DateTime' }>;
export type A2uiText = Extract<A2uiNode, { type: 'Text' }>;

// 分段：文本段或已解析的 UI 段；块间文本保留，保证卡片与前后叙述的顺序一致
export type A2uiSegment = { kind: 'text'; text: string } | { kind: 'ui'; ui: A2uiNode };

// ```a2ui 围栏块提取：宽容空格/换行，捕获组 1 为块内 JSON 文本
const A2UI_BLOCK_RE = /```a2ui\s*([\s\S]*?)\s*```/g;

// 已知组件 type 集合：normalize 靠「单键且键名命中」识别 { "App": {...} } 标签写法；
// 与下方各 z.literal('...') 保持一致，新增组件时同步补充
const A2UI_TYPE_KEYS = new Set([
  'App',
  'Section',
  'StatCard',
  'Stat',
  'DataGrid',
  'DateTime',
  'Text',
]);

/**
 * 兼容模型常见的「标签对象」写法：根或子节点写成 { "App": {...} } / { "StatCard": {...} }，
 * 即键名是组件 type、键值是组件 props（不带 type 字段）。递归归一化成 schema 用的 { type, ...props }。
 * 只转换「单键且键名命中组件类型、键值为对象」的情况，避免误伤 DataGrid 行的 values（键是列名）；
 * 容器（App/Section）的 components 字段是官方 A2UI 命名，一并映射到本实现的 children。
 * 已按 { type, ... } 写的对象原样保留（幂等）。
 */
function normalizeTaggedA2ui(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalizeTaggedA2ui);
  if (node == null || typeof node !== 'object') return node;
  const obj = node as Record<string, unknown>;
  const keys = Object.keys(obj);

  // { "App": {...} }：键值对象视为 props，转成 { type, ...props } 再递归
  if (keys.length === 1 && A2UI_TYPE_KEYS.has(keys[0])) {
    const props = obj[keys[0]];
    if (props != null && typeof props === 'object' && !Array.isArray(props)) {
      return normalizeTaggedA2ui({ type: keys[0], ...(props as Record<string, unknown>) });
    }
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (
      (key === 'children' || key === 'components') &&
      (obj.type === 'App' || obj.type === 'Section')
    ) {
      // 容器节点的子组件：官方 A2UI 的 components 与既有 children 统一收敛到 children
      result.children = normalizeTaggedA2ui(value);
    } else {
      result[key] = normalizeTaggedA2ui(value);
    }
  }
  return result;
}

/**
 * 把消息 content 按 ```a2ui 围栏块切分成文本/卡片交替的段序列。
 * 块 JSON 非法或不符合 schema 时整块按原文保留（Markdown 会以代码块展示），不丢信息也不白屏；
 * 解析前先过 normalizeTaggedA2ui 兼容「键名即组件类型」的标签写法，避免整块降级成 JSON 代码；
 * 无块时返回单个文本段，走原有 Markdown 渲染，行为不变。
 */
export function parseA2uiBlocks(content: string): A2uiSegment[] {
  const segments: A2uiSegment[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  A2UI_BLOCK_RE.lastIndex = 0;
  while ((match = A2UI_BLOCK_RE.exec(content)) !== null) {
    // 块前的普通文本原样保留
    if (match.index > last) segments.push({ kind: 'text', text: content.slice(last, match.index) });
    let ui: A2uiNode | null = null;
    try {
      const result = a2uiNodeSchema.safeParse(normalizeTaggedA2ui(JSON.parse(match[1].trim())));
      if (result.success) ui = result.data;
    } catch {
      // JSON 非法：走下面整体按文本保留
    }
    if (ui) {
      segments.push({ kind: 'ui', ui });
    } else {
      segments.push({ kind: 'text', text: match[0] });
    }
    last = match.index + match[0].length;
  }
  // 末尾剩余文本（含无块时整段内容）
  if (last < content.length) segments.push({ kind: 'text', text: content.slice(last) });
  return segments;
}
