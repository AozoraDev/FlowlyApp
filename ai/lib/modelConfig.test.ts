import { describe, expect, it } from 'vitest';

import { buildModelsUrl, modelConfigSchema } from './modelConfig';

describe('modelConfigSchema', () => {
  const base = { url: 'https://api.openai.com/v1', apiKey: 'sk-xxx', model: 'gpt-4o' };

  it('接受合法的 url / apiKey / model', () => {
    expect(modelConfigSchema.safeParse(base).success).toBe(true);
  });

  it('拒绝非法 url', () => {
    expect(modelConfigSchema.safeParse({ ...base, url: 'not-a-url' }).success).toBe(false);
  });

  it('拒绝空 apiKey（含纯空格）', () => {
    expect(modelConfigSchema.safeParse({ ...base, apiKey: '  ' }).success).toBe(false);
  });

  it('拒绝空 model', () => {
    expect(modelConfigSchema.safeParse({ ...base, model: '' }).success).toBe(false);
  });
});

describe('buildModelsUrl', () => {
  it('拼接 /models', () => {
    expect(buildModelsUrl('https://api.openai.com/v1')).toBe('https://api.openai.com/v1/models');
  });

  it('去除尾部斜杠再拼接，避免双斜杠', () => {
    expect(buildModelsUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1/models');
  });
});
