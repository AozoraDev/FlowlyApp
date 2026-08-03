import { describe, expect, it } from 'vitest';

import {
  accumulateToolCalls,
  buildChatCompletionsUrl,
  buildChatMessages,
  chatIdSchema,
  createSseLineSplitter,
  extractDelta,
  finalizeToolCalls,
  genId,
  messageSchema,
  parseChunk,
  parseSseLine,
  toChatMessage,
  truncateTitle,
  type ChatMessage,
  type ToolCallAccumulator,
} from './chat';

describe('messageSchema', () => {
  it('接受去空格后非空的输入', () => {
    expect(messageSchema.safeParse({ content: '  你好  ' }).success).toBe(true);
  });

  it('拒绝空内容', () => {
    expect(messageSchema.safeParse({ content: '' }).success).toBe(false);
  });

  it('拒绝纯空格内容', () => {
    expect(messageSchema.safeParse({ content: '   ' }).success).toBe(false);
  });
});

describe('genId', () => {
  it('连续生成的 id 不重复', () => {
    expect(genId()).not.toBe(genId());
  });
});

describe('buildChatCompletionsUrl', () => {
  it('拼接 /chat/completions', () => {
    expect(buildChatCompletionsUrl('https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1/chat/completions'
    );
  });

  it('去除尾部斜杠再拼接，避免双斜杠', () => {
    expect(buildChatCompletionsUrl('https://api.openai.com/v1/')).toBe(
      'https://api.openai.com/v1/chat/completions'
    );
  });
});

describe('parseSseLine', () => {
  it('提取 data: 行载荷', () => {
    expect(parseSseLine('data: {"a":1}')).toBe('{"a":1}');
  });

  it('忽略非 data 行', () => {
    expect(parseSseLine('event: message')).toBeNull();
    expect(parseSseLine(': 注释')).toBeNull();
    expect(parseSseLine('')).toBeNull();
  });

  it('容忍尾部 \\r', () => {
    expect(parseSseLine('data: {"a":1}\r')).toBe('{"a":1}');
  });

  it('data: [DONE] 原样返回', () => {
    expect(parseSseLine('data: [DONE]')).toBe('[DONE]');
  });
});

describe('extractDelta', () => {
  it('提取 choices[0].delta.content', () => {
    const data = JSON.stringify({ choices: [{ delta: { content: '你好' }, index: 0 }] });
    expect(extractDelta(data)).toBe('你好');
  });

  it('角色切换帧（delta 无 content）返回空串', () => {
    const data = JSON.stringify({ choices: [{ delta: { role: 'assistant' }, index: 0 }] });
    expect(extractDelta(data)).toBe('');
  });

  it('[DONE] 返回空串', () => {
    expect(extractDelta('[DONE]')).toBe('');
  });

  it('结构不符（无 choices）返回空串', () => {
    expect(extractDelta(JSON.stringify({ id: 'x' }))).toBe('');
  });

  it('坏 JSON 返回空串', () => {
    expect(extractDelta('not json')).toBe('');
  });
});

describe('createSseLineSplitter', () => {
  it('跨 chunk 的半行缓存后补全', () => {
    const split = createSseLineSplitter();
    expect(split('data: {"cho')).toEqual([]);
    expect(split('ices":[]}\n')).toEqual(['data: {"choices":[]}']);
  });

  it('一个 chunk 内多行一次性吐出', () => {
    const split = createSseLineSplitter();
    expect(split('a\nb\nc\n')).toEqual(['a', 'b', 'c']);
  });

  it('流结束后无残留半行', () => {
    const split = createSseLineSplitter();
    split('a\n');
    expect(split('')).toEqual([]);
  });
});

describe('chatIdSchema', () => {
  it('数字字符串转为数字', () => {
    expect(chatIdSchema.parse('42')).toBe(42);
  });

  it('拒绝非数字与非法值', () => {
    expect(chatIdSchema.safeParse('abc').success).toBe(false);
    expect(chatIdSchema.safeParse('-1').success).toBe(false);
    expect(chatIdSchema.safeParse('0').success).toBe(false);
  });
});

describe('truncateTitle', () => {
  it('短文本原样返回', () => {
    expect(truncateTitle('怎么记账')).toBe('怎么记账');
  });

  it('超长文本截断并加省略号', () => {
    expect(truncateTitle('a'.repeat(30))).toBe(`${'a'.repeat(20)}…`);
  });

  it('压缩连续空白并去首尾', () => {
    expect(truncateTitle('  多  个   空格  ')).toBe('多 个 空格');
  });
});

describe('toChatMessage', () => {
  const row = {
    id: 1,
    uid: '00000000-0000-0000-0000-000000000000',
    chat_id: 1,
    created_at: '2026-08-03T00:00:00Z',
  };

  it('is_user=true 映射为用户消息', () => {
    expect(toChatMessage({ ...row, is_user: true, content: '你好' })).toEqual({
      id: '1',
      role: 'user',
      content: '你好',
    });
  });

  it('is_user=false 映射为助手消息', () => {
    expect(toChatMessage({ ...row, is_user: false, content: '回答' })).toEqual({
      id: '1',
      role: 'assistant',
      content: '回答',
    });
  });
});

describe('buildChatMessages', () => {
  const history: ChatMessage[] = [
    { id: '1', role: 'user', content: '怎么记账？' },
    { id: '2', role: 'assistant', content: '记收支即可。' },
  ];

  it('system 提示词前置，历史原样跟随', () => {
    expect(buildChatMessages('你是助手', history)).toEqual([
      { role: 'system', content: '你是助手' },
      { role: 'user', content: '怎么记账？' },
      { role: 'assistant', content: '记收支即可。' },
    ]);
  });

  it('剔除 streaming 占位消息', () => {
    const withPending: ChatMessage[] = [
      ...history,
      { id: '3', role: 'assistant', content: '', status: 'streaming' },
    ];
    expect(buildChatMessages('你是助手', withPending)).toHaveLength(3);
    expect(buildChatMessages('你是助手', withPending)[1]).toEqual({
      role: 'user',
      content: '怎么记账？',
    });
  });

  it('剔除 error 消息', () => {
    const withError: ChatMessage[] = [
      ...history,
      { id: '3', role: 'assistant', content: '', status: 'error' },
    ];
    expect(buildChatMessages('你是助手', withError)).toHaveLength(3);
  });
});

describe('parseChunk', () => {
  it('提取 content 增量帧', () => {
    const data = JSON.stringify({ choices: [{ delta: { content: '你好' }, index: 0 }] });
    expect(parseChunk(data)).toEqual({ content: '你好', toolCalls: [] });
  });

  it('角色切换帧（delta 只有 role）返回空对象', () => {
    const data = JSON.stringify({ choices: [{ delta: { role: 'assistant' }, index: 0 }] });
    expect(parseChunk(data)).toEqual({ content: '', toolCalls: [] });
  });

  it('提取 tool_calls 帧（index/id/name/arguments）', () => {
    const data = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_1',
                type: 'function',
                function: { name: 'list_sections', arguments: '{}' },
              },
            ],
          },
        },
      ],
    });
    expect(parseChunk(data)).toEqual({
      content: '',
      toolCalls: [{ index: 0, id: 'call_1', name: 'list_sections', arguments: '{}' }],
    });
  });

  it('工具帧缺 index 时补 0（兼容端点）', () => {
    const data = JSON.stringify({
      choices: [{ delta: { tool_calls: [{ function: { name: 'list_sections' } }] } }],
    });
    expect(parseChunk(data)?.toolCalls[0]?.index).toBe(0);
  });

  it('[DONE] 返回 null', () => {
    expect(parseChunk('[DONE]')).toBeNull();
  });

  it('坏 JSON 返回 null', () => {
    expect(parseChunk('not json')).toBeNull();
  });

  it('无 choices / 空 choices / 无 delta 返回 null', () => {
    expect(parseChunk(JSON.stringify({ id: 'x' }))).toBeNull();
    expect(parseChunk(JSON.stringify({ choices: [] }))).toBeNull();
    expect(parseChunk(JSON.stringify({ choices: [{}] }))).toBeNull();
  });
});

describe('accumulateToolCalls', () => {
  it('按 index 归位并逐帧追加 arguments', () => {
    const acc: Record<number, ToolCallAccumulator> = {};
    accumulateToolCalls(acc, [
      { index: 0, id: 'call_1', name: 'list_items', arguments: '{"sectionId"' },
    ]);
    accumulateToolCalls(acc, [{ index: 0, arguments: ':3}' }]);
    expect(acc[0]).toEqual({ id: 'call_1', name: 'list_items', args: '{"sectionId":3}' });
  });

  it('id/name 只在首帧出现，后续帧不覆盖', () => {
    const acc: Record<number, ToolCallAccumulator> = {};
    accumulateToolCalls(acc, [{ index: 0, id: 'call_1', name: 'list_sections', arguments: '{}' }]);
    accumulateToolCalls(acc, [{ index: 0, name: 'another', arguments: 'x' }]);
    expect(acc[0]).toEqual({ id: 'call_1', name: 'list_sections', args: '{}x' });
  });

  it('多 index 并存互不干扰', () => {
    const acc: Record<number, ToolCallAccumulator> = {};
    accumulateToolCalls(acc, [
      { index: 0, name: 'a', arguments: '1' },
      { index: 1, name: 'b', arguments: '2' },
    ]);
    expect(acc[0]?.args).toBe('1');
    expect(acc[1]?.args).toBe('2');
  });
});

describe('finalizeToolCalls', () => {
  it('过滤掉只有 index 无 name 的残帧', () => {
    const acc: Record<number, ToolCallAccumulator> = {
      0: { args: '' },
      1: { name: 'x', args: '{}' },
    };
    expect(finalizeToolCalls(acc)).toHaveLength(1);
  });

  it('id 缺失时合成占位，保证 tool 结果能对上', () => {
    const acc: Record<number, ToolCallAccumulator> = { 0: { name: 'list_sections', args: '{}' } };
    const [call] = finalizeToolCalls(acc);
    expect(call?.id).toMatch(/^call_\d+-0$/);
    expect(call?.function).toEqual({ name: 'list_sections', arguments: '{}' });
  });

  it('按 index 顺序输出完整 ToolCall', () => {
    const acc: Record<number, ToolCallAccumulator> = {
      0: { id: 'c0', name: 'a', args: '{}' },
      2: { id: 'c2', name: 'b', args: '{"x":1}' },
    };
    expect(finalizeToolCalls(acc).map((c) => c.function.name)).toEqual(['a', 'b']);
  });
});
