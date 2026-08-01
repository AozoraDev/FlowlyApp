import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

let client: SupabaseClient | null = null;

/**
 * 获取平台对应的 auth 持久化存储
 * - Web: 默认 localStorage（由 @supabase/supabase-js 自动处理）
 * - 移动端: @react-native-async-storage/async-storage
 */
async function getStorageAdapter() {
  if (Platform.OS === 'web') return undefined;

  // 动态导入避免 web 打包时报模块缺失
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;

  return {
    getItem: (key: string) => AsyncStorage.getItem(key),
    setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
    removeItem: (key: string) => AsyncStorage.removeItem(key),
  };
}

/** 存储适配器缓存 */
let storageAdapter: Awaited<ReturnType<typeof getStorageAdapter>> | undefined;

/**
 * Supabase 客户端单例
 *
 * 环境变量通过 .env 文件配置：
 *   EXPO_PUBLIC_SUPABASE_URL=<你的项目 URL>
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY=<你的 anon key>
 *
 * Expo SDK 49+ 自动将 .env 中 EXPO_PUBLIC_* 变量注入 process.env。
 *
 * 使用示例：
 * ```ts
 * import { supabase } from '@/supabase/client';
 * const { data } = await supabase.from('profiles').select('*');
 * ```
 */
export async function getSupabase(): Promise<SupabaseClient> {
  if (client) return client;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      '缺少 Supabase 配置：请在项目根目录创建 .env 文件，并设置 EXPO_PUBLIC_SUPABASE_URL 和 EXPO_PUBLIC_SUPABASE_ANON_KEY'
    );
  }

  if (!storageAdapter) {
    storageAdapter = await getStorageAdapter();
  }

  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: storageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  });

  return client;
}

/**
 * 便捷引用 —— 在非顶层 async 上下文使用
 * 内部已缓存，首次调用后后续同步返回
 */
let clientPromise: Promise<SupabaseClient> | null = null;

export function supabase(): Promise<SupabaseClient> {
  if (client) return Promise.resolve(client);
  if (!clientPromise) {
    clientPromise = getSupabase();
  }
  return clientPromise;
}
