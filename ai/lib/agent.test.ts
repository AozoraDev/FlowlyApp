import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runAgentChat } from './agent';
import type { ChatMessage } from './chat';
import { streamChatCompletion } from './chatStream';
import { getChatTools, isHelpTool, isWriteTool, runTool } from './tools';

// 工具执行与底层流式请求全部 mock，runAgentChat 只测多轮编排逻辑
vi.mock('./chatStream', () => ({ streamChatCompletion: vi.fn() }));
vi.mock('./tools', () => ({
  getChatTools: vi.fn(() => []),
  runTool: vi.fn(),
  isWriteTool: vi.fn(() => false),
  isHelpTool: vi.fn(() => false),
}));

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
    expect(result.content).toBe('今天天气很好');
    // 本轮未回调 usage（provider 未上报）时返回 null
    expect(result.usage).toBeNull();
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
    expect(result.content).toBe('你的项目有：日常、旅行');
    // 未传 language 时工具语言回退 zh（runAgentChat 内部归一化后再传给 runTool）
    expect(runTool).toHaveBeenCalledWith('list_sections', '{"page":1}', 'u1', 'zh');

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

  it('含写入工具的一轮推进 writing 阶段（记一笔时气泡显示「写入中」）', async () => {
    const onPhase = vi.fn();
    vi.mocked(isWriteTool).mockImplementation((name) => name === 'add_item');
    vi.mocked(streamChatCompletion)
      .mockImplementationOnce(async (params) => {
        params.onToolCalls?.([{ index: 0, id: 'c', name: 'add_item', arguments: '{}' }]);
      })
      .mockImplementationOnce(async (params) => {
        params.onDelta('已记录');
      });
    vi.mocked(runTool).mockResolvedValue('{"ok":true}');

    await runAgentChat({ ...baseParams, onPhase });
    expect(onPhase).toHaveBeenNthCalledWith(1, 'thinking');
    expect(onPhase).toHaveBeenNthCalledWith(2, 'writing');
    expect(onPhase).toHaveBeenNthCalledWith(3, 'thinking');
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

  it('多轮工具对话：跨轮累计 token 用量并随结果返回', async () => {
    vi.mocked(streamChatCompletion)
      .mockImplementationOnce(async (params) => {
        // 第一轮工具调用末帧带 usage
        params.onToolCalls?.([{ index: 0, id: 'c', name: 'list_sections', arguments: '{}' }]);
        params.onUsage?.({ prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 });
      })
      .mockImplementationOnce(async (params) => {
        // 第二轮内容末帧带 usage，两轮用量应累加
        params.onDelta('完成');
        params.onUsage?.({ prompt_tokens: 150, completion_tokens: 30, total_tokens: 180 });
      });
    vi.mocked(runTool).mockResolvedValue('{"ok":true}');

    const result = await runAgentChat(baseParams);
    expect(result.content).toBe('完成');
    expect(result.usage).toEqual({
      prompt_tokens: 250,
      completion_tokens: 50,
      total_tokens: 300,
    });
  });

  it('一轮内多次 usage 回调以后者为准（多帧携带时避免重复累加）', async () => {
    vi.mocked(streamChatCompletion).mockImplementationOnce(async (params) => {
      // 同一轮内先出现一次 usage 又被末帧覆盖：最终只取末帧值
      params.onUsage?.({ prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 });
      params.onDelta('好');
      params.onUsage?.({ prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 });
    });

    const result = await runAgentChat(baseParams);
    expect(result.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 8,
      total_tokens: 18,
    });
  });

  it('传 language 给 runTool（get_help 据此返回对应语言文案）', async () => {
    vi.mocked(streamChatCompletion)
      .mockImplementationOnce(async (params) => {
        params.onToolCalls?.([{ index: 0, id: 'c', name: 'get_help', arguments: '{}' }]);
      })
      .mockImplementationOnce(async (params) => {
        params.onDelta('我可以帮你查账…');
      });
    vi.mocked(runTool).mockResolvedValue('{"ok":true}');

    await runAgentChat({ ...baseParams, language: 'en' });
    expect(runTool).toHaveBeenCalledWith('get_help', '{}', 'u1', 'en');
  });

  it('get_help 工具轮保持 thinking 阶段（不显示「查询账目中」）', async () => {
    const onPhase = vi.fn();
    vi.mocked(isHelpTool).mockImplementation((name) => name === 'get_help');
    vi.mocked(streamChatCompletion)
      .mockImplementationOnce(async (params) => {
        params.onToolCalls?.([{ index: 0, id: 'c', name: 'get_help', arguments: '{}' }]);
      })
      .mockImplementationOnce(async (params) => {
        params.onDelta('我可以帮你查账、记一笔、建项目…');
      });
    vi.mocked(runTool).mockResolvedValue('{"ok":true}');

    await runAgentChat({ ...baseParams, onPhase });
    expect(onPhase).toHaveBeenNthCalledWith(1, 'thinking');
    expect(onPhase).toHaveBeenNthCalledWith(2, 'thinking');
    expect(onPhase).toHaveBeenNthCalledWith(3, 'thinking');
  });
});
