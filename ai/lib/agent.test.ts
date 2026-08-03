import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runAgentChat } from './agent';
import type { ChatMessage } from './chat';
import { streamChatCompletion } from './chatStream';
import { getChatTools, runTool } from './tools';

// 工具执行与底层流式请求全部 mock，runAgentChat 只测多轮编排逻辑
vi.mock('./chatStream', () => ({ streamChatCompletion: vi.fn() }));
vi.mock('./tools', () => ({ getChatTools: vi.fn(() => []), runTool: vi.fn() }));

const config = { url: 'https://api.example.com/v1', apiKey: 'key', model: 'm' };
const history: ChatMessage[] = [
  { id: '1', role: 'user', content: '我有几个项目？' },
  { id: '2', role: 'assistant', content: '我查一下。' },
];

const baseParams = {
  config,
  systemPrompt: '你是记账助手',
  history,
  userId: 'u1',
  onDelta: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runAgentChat', () => {
  it('单内容轮：直接返回模型文本，不再发第二轮', async () => {
    vi.mocked(streamChatCompletion).mockImplementationOnce(async (params) => {
      params.onDelta('今天天气很好');
    });

    const result = await runAgentChat(baseParams);
    expect(result).toBe('今天天气很好');
    expect(streamChatCompletion).toHaveBeenCalledTimes(1);
  });

  it('工具轮 + 内容轮：执行工具并把 assistant(tool_calls)+tool 结果带入第二轮', async () => {
    vi.mocked(streamChatCompletion)
      .mockImplementationOnce(async (params) => {
        // 第一轮：只发工具调用（id/name 在首帧，arguments 是碎片，分两帧模拟累积）
        params.onToolCalls?.([
          { index: 0, id: 'call_1', name: 'list_sections', arguments: '{"page' },
        ]);
        params.onToolCalls?.([{ index: 0, arguments: '":1}' }]);
      })
      .mockImplementationOnce(async (params) => {
        params.onDelta('你的项目有：日常、旅行');
      });
    vi.mocked(runTool).mockResolvedValue('{"ok":true,"sections":[{"id":1,"name":"日常"}]}');

    const result = await runAgentChat(baseParams);
    expect(result).toBe('你的项目有：日常、旅行');
    expect(runTool).toHaveBeenCalledWith('list_sections', '{"page":1}', 'u1');

    const calls = vi.mocked(streamChatCompletion).mock.calls;
    expect(calls).toHaveLength(2);
    // 第二轮 messages：system + history + assistant(tool_calls) + tool 结果，顺序与 tool_call_id 对应
    const secondMessages = calls[1][0].messages;
    expect(secondMessages[0]).toEqual({ role: 'system', content: '你是记账助手' });
    expect(secondMessages[1]).toEqual({ role: 'user', content: '我有几个项目？' });
    expect(secondMessages[2]).toEqual({ role: 'assistant', content: '我查一下。' });
    expect(secondMessages[3]).toMatchObject({
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call_1', function: { name: 'list_sections', arguments: '{"page":1}' } }],
    });
    expect(secondMessages[4]).toEqual({
      role: 'tool',
      tool_call_id: 'call_1',
      content: '{"ok":true,"sections":[{"id":1,"name":"日常"}]}',
    });
  });

  it('onPhase 按 思考中→查询中→思考中 推进', async () => {
    const onPhase = vi.fn();
    vi.mocked(streamChatCompletion)
      .mockImplementationOnce(async (params) => {
        params.onToolCalls?.([{ index: 0, id: 'c', name: 'list_sections', arguments: '{}' }]);
      })
      .mockImplementationOnce(async (params) => {
        params.onDelta('完成');
      });
    vi.mocked(runTool).mockResolvedValue('{"ok":true}');

    await runAgentChat({ ...baseParams, onPhase });
    expect(onPhase).toHaveBeenNthCalledWith(1, 'thinking');
    expect(onPhase).toHaveBeenNthCalledWith(2, 'querying');
    expect(onPhase).toHaveBeenNthCalledWith(3, 'thinking');
  });

  it('工具轮数超限直接抛错，防止死循环', async () => {
    vi.mocked(streamChatCompletion).mockImplementation(async (params) => {
      params.onToolCalls?.([{ index: 0, id: 'c', name: 'list_sections', arguments: '{}' }]);
    });
    vi.mocked(runTool).mockResolvedValue('{"ok":true}');

    await expect(runAgentChat(baseParams)).rejects.toThrow('tool call rounds exceeded');
    // 第 0~4 轮执行工具，第 5 轮检测到超限抛错 = 共 6 次流式请求
    expect(streamChatCompletion).toHaveBeenCalledTimes(6);
  });

  it('signal 已中止时不执行工具查询，抛 AbortError', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.mocked(streamChatCompletion).mockImplementationOnce(async (params) => {
      params.onToolCalls?.([{ index: 0, id: 'c', name: 'list_sections', arguments: '{}' }]);
    });

    await expect(runAgentChat({ ...baseParams, signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(runTool).not.toHaveBeenCalled();
  });
});
