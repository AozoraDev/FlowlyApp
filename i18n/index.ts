import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en';
import zh from './locales/zh';

// 语言资源表：zh/en 两套文案，key 结构完全一致
const resources = {
  zh: { translation: zh },
  en: { translation: en },
} as const;

// 让 t() 的 key 获得完整类型推导：key 写错或结构不匹配时编译即报错
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: typeof resources;
  }
}

// 支持的语种（zh 为默认/兜底语言）与语言偏好持久化 key
export const SUPPORTED_LANGUAGES = ['zh', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
const LANGUAGE_STORAGE_KEY = 'app-language';

// 同步探测设备语言：getLocales() 为同步 API，保证首次渲染即用正确语言
function getDeviceLanguage(): Language {
  const code = getLocales()[0]?.languageCode;
  return code === 'en' ? 'en' : 'zh';
}

// 初始化 i18n：初始语言取设备语言，资源全部内联因此无需异步等待
i18n.use(initReactI18next).init({
  resources,
  lng: getDeviceLanguage(),
  fallbackLng: 'zh',
  interpolation: {
    // React Native 无 DOM，关闭 HTML 转义以避免文案被转义
    escapeValue: false,
  },
});

// 读取用户上次手动选择的语言，未设置或读取失败时回退设备语言
export async function loadSavedLanguage(): Promise<Language> {
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    // 存储读取失败忽略，走设备语言兜底
  }
  return getDeviceLanguage();
}

// 切换语言并持久化用户偏好，供下次启动恢复
export async function changeLanguage(lang: Language) {
  await i18n.changeLanguage(lang);
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // 持久化失败不影响本次切换
  }
}

export default i18n;
