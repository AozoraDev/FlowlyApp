import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

// 模型配置校验 schema：url / apiKey / model 均必填；错误文案用 i18n key，展示时再翻译。
// schema 即类型唯一来源，ModelConfig 由 z.infer 推导，不再平行手写类型。
export const modelConfigSchema = z.object({
  url: z.string().trim().min(1, 'user.urlRequired').url('user.urlInvalid'),
  apiKey: z.string().trim().min(1, 'user.apiKeyRequired'),
  model: z.string().trim().min(1, 'user.modelRequired'),
});
export type ModelConfig = z.infer<typeof modelConfigSchema>;

// 测试接口（GET {baseUrl}/models）响应边界：OpenAI 兼容协议返回 { data: [{ id, ... }] }
const modelListSchema = z.object({
  data: z.array(z.object({ id: z.string() })),
});

// 本地存储 key：仅存本机（Web 端由 AsyncStorage 落到 localStorage），API Key 不上传服务端
const MODEL_CONFIG_KEY = 'model-config';

// 测试请求超时时间：链接不通时避免一直挂着（10s）
const TEST_TIMEOUT_MS = 10_000;

/** 拼测试接口地址：去尾部斜杠再拼 /models，避免 baseUrl 带斜杠时拼出双斜杠 */
export function buildModelsUrl(url: string): string {
  return `${url.trim().replace(/\/+$/, '')}/models`;
}

/** 读取已保存的模型配置；缺失或解析失败返回 null（外部数据边界 zod 解析一次） */
export async function loadModelConfig(): Promise<ModelConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(MODEL_CONFIG_KEY);
    if (!raw) return null;
    const result = modelConfigSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    // 存储读取/解析失败按未配置处理，不让配置页白屏
    return null;
  }
}

/** 保存模型配置到本地存储（parse 保证落库的是合法结构） */
export async function saveModelConfig(config: ModelConfig): Promise<void> {
  await AsyncStorage.setItem(MODEL_CONFIG_KEY, JSON.stringify(modelConfigSchema.parse(config)));
}

/** 清除本地模型配置缓存（退出登录时调用，避免账号切换后残留上一账号的 API Key） */
export async function clearModelConfig(): Promise<void> {
  await AsyncStorage.removeItem(MODEL_CONFIG_KEY);
}

/**
 * 测试 OpenAI 兼容链接连通性：GET {baseUrl}/models + Bearer Key，
 * 一次同时验证地址与密钥有效性，并返回可用模型列表（供页面填充选择框）。
 * 连接失败抛错（含状态码，方便诊断）；连接成功但响应解析失败时返回空数组，
 * 页面据此降级为手动输入模型名。
 */
export async function testModelConfig({
  url,
  apiKey,
}: Pick<ModelConfig, 'url' | 'apiKey'>): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
  try {
    const res = await fetch(buildModelsUrl(url), {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    // 连接本身已成功；响应非 JSON 或结构不符时按「拿不到模型列表」处理，走手动输入降级
    try {
      const result = modelListSchema.safeParse(await res.json());
      return result.success ? result.data.data.map((m) => m.id) : [];
    } catch {
      return [];
    }
  } finally {
    clearTimeout(timer);
  }
}
