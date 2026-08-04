import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_MAX_TOKENS, runAgentChat } from './agent';
import type { ChatMessage } from './chat';
import { streamChatCompletion } from './chatStream';
import { getA2uiFormat, getSummaryNote } from '../prompt/systemPrompt';
import { buildSummaryApp, type AccountSummaryResult } from './a2uiPresets';
import { getChatTools, isHelpTool, isQueryTool, isWriteTool, runTool } from './tools';

// 工具执行与底层流式请求全部 mock，runAgentChat 只测多轮编排逻辑
vi.mock('./chatStream', () => ({ streamChatCompletion: vi.fn() }));
vi.mock('./tools', () => ({
  getChatTools: vi.fn(() => []),
  runTool: vi.fn(),
  isWriteTool: vi.fn(() => false),
  isHelpTool: vi.fn(() => false),
  isQueryTool: vi.fn(() => false),
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

  it('未传 maxTokens 时给单轮输出带上限（默认值 2500）', async () => {
    vi.mocked(streamChatCompletion).mockImplementationOnce(async (params) => {
      params.onDelta('好');
    });

    await runAgentChat(baseParams);
    expect(streamChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: DEFAULT_MAX_TOKENS })
    );
  });

  it('调用方传入 maxTokens 时覆盖默认上限', async () => {
    vi.mocked(streamChatCompletion).mockImplementationOnce(async (params) => {
      params.onDelta('好');
    });

    await runAgentChat({ ...baseParams, maxTokens: 600 });
    expect(streamChatCompletion).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 600 }));
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

  it('查询工具轮后：tool 结果之后追加一条 zh A2UI 格式 system 消息', async () => {
    vi.mocked(isQueryTool).mockImplementation((name) => name === 'list_sections');
    vi.mocked(streamChatCompletion)
      .mockImplementationOnce(async (params) => {
        params.onToolCalls?.([{ index: 0, id: 'c', name: 'list_sections', arguments: '{}' }]);
      })
      .mockImplementationOnce(async (params) => {
        params.onDelta('完成');
      });
    vi.mocked(runTool).mockResolvedValue('{"ok":true}');

    await runAgentChat(baseParams);
    const secondMessages = vi.mocked(streamChatCompletion).mock.calls[1][0].messages;
    // system(基础)…tool 结果之后、助手生成之前追加 A2UI 规范
    expect(secondMessages[secondMessages.length - 1]).toEqual({
      role: 'system',
      content: getA2uiFormat('zh'),
    });
  });

  it('language 传 en 时注入英文 A2UI 格式', async () => {
    vi.mocked(isQueryTool).mockImplementation((name) => name === 'list_sections');
    vi.mocked(streamChatCompletion)
      .mockImplementationOnce(async (params) => {
        params.onToolCalls?.([{ index: 0, id: 'c', name: 'list_sections', arguments: '{}' }]);
      })
      .mockImplementationOnce(async (params) => {
        params.onDelta('done');
      });
    vi.mocked(runTool).mockResolvedValue('{"ok":true}');

    await runAgentChat({ ...baseParams, language: 'en' });
    const secondMessages = vi.mocked(streamChatCompletion).mock.calls[1][0].messages;
    expect(secondMessages[secondMessages.length - 1]).toEqual({
      role: 'system',
      content: getA2uiFormat('en'),
    });
  });

  it('同一请求内多轮查询只注入一次 A2UI 格式', async () => {
    vi.mocked(isQueryTool).mockImplementation((name) => name === 'list_sections');
    vi.mocked(streamChatCompletion)
      .mockImplementationOnce(async (params) => {
        params.onToolCalls?.([{ index: 0, id: 'c1', name: 'list_sections', arguments: '{}' }]);
      })
      .mockImplementationOnce(async (params) => {
        // 第二轮仍调查询工具（拿到 sectionId 后再查明细的场景），不应再注入第二条
        params.onToolCalls?.([{ index: 0, id: 'c2', name: 'list_sections', arguments: '{}' }]);
      })
      .mockImplementationOnce(async (params) => {
        params.onDelta('完成');
      });
    vi.mocked(runTool).mockResolvedValue('{"ok":true}');

    await runAgentChat(baseParams);
    const calls = vi.mocked(streamChatCompletion).mock.calls;
    expect(calls).toHaveLength(3);
    // messages 数组在多轮循环内原地累积（各轮 stream 拿到同一引用），
    // 故对最终轮的状态断言：整条序列中 A2UI 格式恰好一条
    const finalMessages = calls[2][0].messages;
    const a2ui = finalMessages.filter(
      (m) => m.role === 'system' && m.content === getA2uiFormat('zh')
    );
    expect(a2ui).toHaveLength(1);
    // 且注入位置在首个查询轮 tool 结果之后、第二轮查询的 assistant(tool_calls) 之前
    const a2uiIdx = finalMessages.findIndex(
      (m) => m.role === 'system' && m.content === getA2uiFormat('zh')
    );
    const c2AssistantIdx = finalMessages.findIndex(
      (m) => m.role === 'assistant' && m.tool_calls?.[0]?.id === 'c2'
    );
    expect(a2uiIdx).toBeGreaterThan(-1);
    expect(c2AssistantIdx).toBeGreaterThan(a2uiIdx);
  });

  it('写入/帮助工具轮不注入 A2UI 格式', async () => {
    vi.mocked(streamChatCompletion)
      .mockImplementationOnce(async (params) => {
        params.onToolCalls?.([{ index: 0, id: 'c', name: 'add_item', arguments: '{}' }]);
      })
      .mockImplementationOnce(async (params) => {
        params.onDelta('已记录');
      });
    vi.mocked(runTool).mockResolvedValue('{"ok":true}');

    await runAgentChat(baseParams);
    const secondMessages = vi.mocked(streamChatCompletion).mock.calls[1][0].messages;
    expect(
      secondMessages.filter((m) => m.role === 'system' && m.content === getA2uiFormat('zh'))
    ).toHaveLength(0);
  });

  it('汇总轮：注入汇总说明，收尾追加代码生成的汇总卡片块', async () => {
    vi.mocked(isQueryTool).mockImplementation((name) => name === 'get_account_summaries');
    const summaryJson = JSON.stringify({
      ok: true,
      rows: [{ sectionId: 1, name: '日常', income: 300, expense: 100, balance: 200 }],
      total: { income: 300, expense: 100, balance: 200 },
    });
    vi.mocked(streamChatCompletion)
      .mockImplementationOnce(async (params) => {
        params.onToolCalls?.([
          { index: 0, id: 'c', name: 'get_account_summaries', arguments: '{}' },
        ]);
      })
      .mockImplementationOnce(async (params) => {
        params.onDelta('本月结余 200 元。');
      });
    vi.mocked(runTool).mockResolvedValue(summaryJson);

    const result = await runAgentChat({ ...baseParams, language: 'zh' });
    // 第二轮 messages：tool 结果后依次追加 A2UI 格式 + 汇总说明
    const secondMessages = vi.mocked(streamChatCompletion).mock.calls[1][0].messages;
    expect(secondMessages[secondMessages.length - 2]).toEqual({
      role: 'system',
      content: getA2uiFormat('zh'),
    });
    expect(secondMessages[secondMessages.length - 1]).toEqual({
      role: 'system',
      content: getSummaryNote('zh'),
    });
    // 最终内容 = 模型正文 + 代码确定性生成的汇总卡片块（含三卡与各项目表）
    const summary: AccountSummaryResult = {
      ok: true,
      rows: [{ sectionId: 1, name: '日常', income: 300, expense: 100, balance: 200 }],
      total: { income: 300, expense: 100, balance: 200 },
    };
    expect(result.content).toBe(
      `本月结余 200 元。\n\`\`\`a2ui\n${JSON.stringify(buildSummaryApp(summary, 'zh'))}\n\`\`\``
    );
  });

  it('汇总轮 language=en：注入英文说明，卡片用英文文案', async () => {
    vi.mocked(isQueryTool).mockImplementation((name) => name === 'get_account_summaries');
    const summaryJson = JSON.stringify({
      ok: true,
      rows: [{ sectionId: 1, name: 'Daily', income: 300, expense: 100, balance: 200 }],
      total: { income: 300, expense: 100, balance: 200 },
    });
    vi.mocked(streamChatCompletion)
      .mockImplementationOnce(async (params) => {
        params.onToolCalls?.([
          { index: 0, id: 'c', name: 'get_account_summaries', arguments: '{}' },
        ]);
      })
      .mockImplementationOnce(async (params) => {
        params.onDelta('Balance is 200.');
      });
    vi.mocked(runTool).mockResolvedValue(summaryJson);

    const result = await runAgentChat({ ...baseParams, language: 'en' });
    const secondMessages = vi.mocked(streamChatCompletion).mock.calls[1][0].messages;
    expect(secondMessages[secondMessages.length - 1]).toEqual({
      role: 'system',
      content: getSummaryNote('en'),
    });
    expect(result.content).toContain('Total income');
    expect(result.content).toContain('```a2ui');
  });

  it('汇总工具失败（ok:false）：不追加卡片块，只回模型正文', async () => {
    vi.mocked(isQueryTool).mockImplementation((name) => name === 'get_account_summaries');
    vi.mocked(streamChatCompletion)
      .mockImplementationOnce(async (params) => {
        params.onToolCalls?.([
          { index: 0, id: 'c', name: 'get_account_summaries', arguments: '{}' },
        ]);
      })
      .mockImplementationOnce(async (params) => {
        params.onDelta('查询失败，无法汇总。');
      });
    vi.mocked(runTool).mockResolvedValue('{"ok":false,"error":"db down"}');

    const result = await runAgentChat(baseParams);
    expect(result.content).toBe('查询失败，无法汇总。');
  });
});
