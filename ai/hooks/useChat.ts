import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runAgentChat } from '@/ai/lib/agent';
import {
  genId,
  toChatMessage,
  truncateTitle,
  type ChatInput,
  type ChatMessage,
} from '@/ai/lib/chat';
import type { ModelConfig } from '@/ai/lib/modelConfig';
import { getSystemPrompt, localDateStr } from '@/ai/prompt/systemPrompt';
import { useAppToast } from '@/components/ui-preSettings/Toast';
import { updateAiChatTitle } from '@/supabase/aiChats';
import { clearAiChatMessages, createAiMessage, listAiMessages } from '@/supabase/aiMessages';

interface UseChatOptions {
  // 会话 id（来自路由参数，已由 chatIdSchema 解析）
  chatId: number;
  // 当前用户 id（登录态加载前为 undefined，查询暂不启用）
  userId?: string;
  // 模型配置：页面守卫下非空才渲染聊天，hook 在守卫前实例化，闭包读 ref
  config: ModelConfig | null;
}

/**
 * AI-Agent 单段对话 hook（持久化版）。
 * 关键点：
 *  - 服务端持久化消息经 useQuery 拉取，作为本地会话的「种子」；本地消息列表是渲染唯一来源；
 *  - 发送时先把用户消息落库（问题不丢），流式完成后再落库助手消息；失败/中断不写助手消息；
 *  - 首条用户消息自动生成会话标题（供列表展示）；
 *  - 流式增量通过 onDelta 边读边拼进最后一条助手占位；
 *  - onSettled 后 invalidate 消息/列表缓存，保证离开后重进能拿到最新持久化数据；
 *  - 卸载时中止在途流式请求，避免离页后继续占用连接。
 */
export function useChat({ chatId, userId, config }: UseChatOptions) {
  const { t, i18n } = useTranslation();
  const toast = useAppToast();
  const queryClient = useQueryClient();

  // 持久化消息查询：登录态 + 合法 chatId 才启用；数据作为本地会话的种子
  const {
    data: persisted = [],
    isSuccess,
    isFetched,
  } = useQuery({
    queryKey: ['aiMessages', chatId],
    queryFn: async () => {
      // enabled 已保证 userId 非空，此处兜底守卫避免传入 undefined
      if (!userId) throw new Error('user not logged in');
      return listAiMessages(userId, chatId);
    },
    enabled: !!userId && chatId > 0,
  });

  // 消息列表放 useState 供 UI 渲染，另用 ref 镜像保存最新值；
  // 所有变更统一走 commit，保证 ref 与 state 同步
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const commit = (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    const next = updater(messagesRef.current);
    messagesRef.current = next;
    setMessages(next);
  };

  // 本地列表绑定的 chatId：仅当切换会话或首次加载完成时用服务端数据重建，
  // 避免流式期间 / 发送后的 refetch 把本地乐观状态冲掉
  const boundChatRef = useRef<number | null>(null);
  useEffect(() => {
    // 仅当本地还没有消息时才用服务端数据作种子；若已发出乐观消息（种子查询失败重试场景），
    // 跳过覆盖，避免把用户刚发的消息冲掉
    if (isSuccess && boundChatRef.current !== chatId && messagesRef.current.length === 0) {
      boundChatRef.current = chatId;
      commit(() => persisted.map(toChatMessage));
    }
  }, [isSuccess, chatId, persisted]);

  // 最新 config / userId：页面守卫下才渲染，但 hook 在守卫前实例化，闭包须读 ref
  const configRef = useRef(config);
  configRef.current = config;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // 流式请求进行中标记 + AbortController：pending 用 ref 保证 sendMessage 同步读取，杜绝连点
  const pendingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  // 种子查询是否已定稿（成功或失败都算）：未定稿前禁止发送，否则乐观追加的消息
  // 会被稍后到达的持久化数据覆盖（首次进入时历史消息还没加载完就抢发的竞态）
  const seededRef = useRef(false);
  seededRef.current = isFetched;
  // 本轮是否为该会话首条用户消息（决定是否生成标题）；onMutate 在乐观追加前捕获，反映发送前状态
  const firstMessageRef = useRef(false);

  // 清空进行中标记：防连点（与 pending 分开，清空与发送可各自独立）
  const clearingRef = useRef(false);
  const [isClearing, setIsClearing] = useState(false);

  const sendMutation = useMutation({
    mutationFn: async (input: ChatInput) => {
      const uid = userIdRef.current;
      const cfg = configRef.current;
      // 页面守卫保证走不到这里；防御性兜底
      if (!uid) throw new Error('user not logged in');
      if (!cfg) throw new Error('model config missing');

      // 1) 用户消息先落库：问题不丢，即使助手回答失败/中断也保留提问
      await createAiMessage({ uid, chat_id: chatId, is_user: true, content: input.content });

      // 2) 首条用户消息 → 自动生成会话标题（供列表展示）；标题是装饰性数据，失败不阻断发送
      if (firstMessageRef.current) {
        try {
          await updateAiChatTitle(chatId, truncateTitle(input.content));
        } catch (e) {
          console.error('update ai chat title failed', e);
        }
      }

      // 3) Agent 多轮请求：涉及账目问题时模型会调用工具查询真实数据，最终文本增量拼进
      //    最后一条助手占位并用于落库；工具中间态不落库，重进会话由模型重新调工具自愈
      abortRef.current = new AbortController();
      const result = await runAgentChat({
        config: cfg,
        // 注入设备本地日期，模型才知道「今天」是哪天，才能把「8月」换算成 from/to 时间区间
        systemPrompt: getSystemPrompt(i18n.language, localDateStr()),
        history: messagesRef.current,
        userId: uid,
        language: i18n.language,
        signal: abortRef.current.signal,
        onDelta: (text) => {
          commit((prev) =>
            prev.map((m, i) =>
              i === prev.length - 1 && m.role === 'assistant'
                ? { ...m, content: m.content + text }
                : m
            )
          );
        },
        // 工具轮期间更新占位气泡阶段，UI 区分「思考中 / 查询账目中」
        onPhase: (phase) => {
          commit((prev) =>
            prev.map((m, i) =>
              i === prev.length - 1 && m.role === 'assistant' ? { ...m, phase } : m
            )
          );
        },
      });

      // 4) 助手消息仅在流式成功后落库；失败/中断由 onError 标记为 error，不写库。
      //    token 用量随消息持久化，重进会话后气泡仍能展示；未上报时为 null
      await createAiMessage({
        uid,
        chat_id: chatId,
        is_user: false,
        content: result.content,
        prompt_tokens: result.usage?.prompt_tokens ?? null,
        completion_tokens: result.usage?.completion_tokens ?? null,
        total_tokens: result.usage?.total_tokens ?? null,
      });
      return result;
    },
    onMutate: (input) => {
      pendingRef.current = true;
      // 捕获首条标记：在乐观追加之前，length 反映发送前状态
      firstMessageRef.current = messagesRef.current.length === 0;
      // 乐观追加：用户消息 + 空助手占位（streaming），随后流式增量往占位里填
      commit((prev) => [
        ...prev,
        { id: genId(), role: 'user', content: input.content },
        { id: genId(), role: 'assistant', content: '', status: 'streaming' },
      ]);
    },
    onSuccess: (data) => {
      // 完成：把助手占位从 streaming 标记为已完成（status 置空），并补上本轮 token 用量供气泡展示。
      // 正文以 runAgentChat 返回值（data.content）回填——汇总卡片块是 agent 在流结束后追加的，
      // 只存在于返回值、不经 onDelta；若只用 onDelta 拼内容，实时气泡会缺卡片、重进会话才显示。
      // 统一以返回值覆盖，实时与落库内容一致，也兼容未来任何确定性追加
      commit((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1 && m.role === 'assistant'
            ? { ...m, status: undefined, content: data.content, tokenUsage: data.usage }
            : m
        )
      );
    },
    onError: (err) => {
      // 失败：标记助手消息为 error，气泡内展示失败提示（用户消息已落库，本地保留显示）
      commit((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1 && m.role === 'assistant' ? { ...m, status: 'error' } : m
        )
      );
      // 卸载中止导致的失败静默处理：用户已离页，弹 Toast 无意义
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error(err);
      toast.error(t('aiAgent.requestFailed'));
    },
    onSettled: () => {
      pendingRef.current = false;
      abortRef.current = null;
      // 同步缓存：消息已落库（成功=user+assistant，失败=user），刷新后离开再进能拿到最新数据；
      // 列表需感知新标题与最近活动时间（updated_at 由触发器刷新）
      queryClient.invalidateQueries({ queryKey: ['aiMessages', chatId] });
      queryClient.invalidateQueries({ queryKey: ['aiChats'] });
    },
  });

  // 卸载时中止在途流式请求，避免离页后继续占用连接
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // 发送：种子未定稿或流式进行中直接忽略，配合按钮 disabled 双保险；
  // 内容去首尾空格，避免气泡里展示多余空白
  const sendMessage = (input: ChatInput) => {
    if (!seededRef.current || pendingRef.current) return;
    sendMutation.mutate({ content: input.content.trim() });
  };

  // 清空当前会话全部消息：删库 + 重置本地 + 标题复位（列表回退「新对话」占位）
  const clearChat = async () => {
    if (!seededRef.current || pendingRef.current || clearingRef.current) return;
    clearingRef.current = true;
    setIsClearing(true);
    try {
      await clearAiChatMessages(chatId);
      await updateAiChatTitle(chatId, '');
      commit(() => []);
      queryClient.invalidateQueries({ queryKey: ['aiMessages', chatId] });
      queryClient.invalidateQueries({ queryKey: ['aiChats'] });
    } catch (err) {
      console.error(err);
      toast.error(t('aiAgent.clearFailed'));
    } finally {
      clearingRef.current = false;
      setIsClearing(false);
    }
  };

  return {
    messages,
    // 种子查询未返回（首次进入加载历史消息）时 true：页面据此禁用发送按钮，
    // 等加载完成 / 失败后放行，避免竞态
    isSeeding: !isFetched,
    isStreaming: sendMutation.isPending,
    isClearing,
    sendMessage,
    clearChat,
    hasMessages: messages.length > 0,
  };
}
