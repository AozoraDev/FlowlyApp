import { describe, expect, it, vi } from 'vitest';

// chatStream 顶层 import expo/fetch，node 环境解析不了，测试里只测纯函数 buildChatBody，mock 掉网络层
vi.mock('expo/fetch', () => ({ fetch: vi.fn() }));

import type { ChatTool } from './chat';
import { buildChatBody } from './chatStream';

// buildChatBody 是纯函数：拼 chat/completions 请求体，重点验证可选字段（tools / max_tokens）
// 只在显式传入时才写入，避免多余的键被部分端点 reject。
describe('buildChatBody', () => {
  const messages = [{ role: 'user' as const, content: 'hi' }];

  it('默认只带 model/messages/stream/stream_options，不带 tools 与 max_tokens', () => {
    expect(buildChatBody({ model: 'm', messages })).toEqual({
      model: 'm',
      messages,
      stream: true,
      stream_options: { include_usage: true },
    });
  });

  it('tools 非空时才写入 tools 字段，空数组不写', () => {
    const tools: ChatTool[] = [
      {
        type: 'function',
        function: { name: 'list_sections', description: 'x', parameters: {} },
      },
    ];
    expect(buildChatBody({ model: 'm', messages, tools })).toMatchObject({ tools });
    expect(buildChatBody({ model: 'm', messages, tools: [] })).not.toHaveProperty('tools');
  });

  it('maxTokens 传入时写 max_tokens，未传时不含该键', () => {
    expect(buildChatBody({ model: 'm', messages, maxTokens: 1500 })).toHaveProperty(
      'max_tokens',
      1500
    );
    expect(buildChatBody({ model: 'm', messages })).not.toHaveProperty('max_tokens');
  });
});
