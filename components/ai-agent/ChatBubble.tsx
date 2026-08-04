import Markdown, { type MarkdownStyleMap } from '@ronradtke/react-native-markdown-display';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { useColorScheme } from 'nativewind';

import { parseA2uiBlocks } from '@/ai/lib/a2ui';
import type { ChatMessage } from '@/ai/lib/chat';
import { Text } from '@/components/ui/text';
import { THEME } from '@/lib/theme';
import { A2uiRenderer } from './A2uiRenderer';

interface ChatBubbleProps {
  message: ChatMessage;
}

// markdown 样式映射：颜色取 HSL 主题（浅/深自适应），字号对齐正文 text-sm leading-5；
// 经 mergeStyle 叠加在库默认布局上，未覆盖的节点保留库默认样式。
function buildMarkdownStyle(colorScheme: 'light' | 'dark'): MarkdownStyleMap {
  const theme = colorScheme === 'dark' ? THEME.dark : THEME.light;
  const fg = theme.foreground; // 正文/标题
  const mutedFg = theme.mutedForeground; // 次级文字（引用、链接）
  const mutedBg = theme.muted; // 代码/引用底
  const border = theme.border; // 分隔线、表格边框
  const link = theme.ring; // 链接色
  return {
    body: { color: fg, fontSize: 14, lineHeight: 20 },
    text: { color: fg },
    textgroup: { color: fg },
    paragraph: { marginTop: 2, marginBottom: 6 },
    heading1: {
      color: fg,
      fontSize: 20,
      fontWeight: '700',
      textAlign: 'left',
      marginTop: 10,
      marginBottom: 4,
    },
    heading2: {
      color: fg,
      fontSize: 18,
      fontWeight: '700',
      textAlign: 'left',
      marginTop: 10,
      marginBottom: 4,
    },
    heading3: {
      color: fg,
      fontSize: 16,
      fontWeight: '700',
      textAlign: 'left',
      marginTop: 8,
      marginBottom: 4,
    },
    heading4: {
      color: fg,
      fontSize: 15,
      fontWeight: '700',
      textAlign: 'left',
      marginTop: 8,
      marginBottom: 4,
    },
    heading5: {
      color: fg,
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'left',
      marginTop: 8,
      marginBottom: 4,
    },
    heading6: {
      color: fg,
      fontSize: 13,
      fontWeight: '700',
      textAlign: 'left',
      marginTop: 8,
      marginBottom: 4,
    },
    strong: { color: fg, fontWeight: '700' },
    em: { fontStyle: 'italic' },
    blockquote: { backgroundColor: mutedBg, borderColor: border, color: mutedFg },
    bullet_list: { marginVertical: 4 },
    ordered_list: { marginVertical: 4 },
    code_inline: { backgroundColor: mutedBg, color: fg, fontSize: 13, padding: 2, borderRadius: 4 },
    code_block: {
      backgroundColor: mutedBg,
      color: fg,
      fontSize: 13,
      lineHeight: 19,
      padding: 10,
      borderRadius: 6,
    },
    fence: { borderColor: border, borderRadius: 6 },
    fence_code: { backgroundColor: mutedBg, color: fg, fontSize: 13, lineHeight: 19, padding: 10 },
    link: { color: link, textDecorationLine: 'underline' },
    hr: { backgroundColor: border, height: 1 },
    table: { borderColor: border },
    th: { color: fg, padding: 5 },
    td: { color: fg, padding: 5 },
    tr: { borderColor: border },
  };
}

// 单条对话气泡：用户右对齐蓝泡白字，助手左对齐白泡描边；
// streaming 空内容时显示「思考中」占位，非空时在正文尾部挂一个品牌色光标；
// 完成后助手消息渲染 Markdown（模型按提示词输出 Markdown 排版）；
// error 时正文下追加失败提示。外层 View 撑满行宽，flex-row 决定左右对齐。
function ChatBubbleImpl({ message }: ChatBubbleProps) {
  const { t } = useTranslation();
  const { colorScheme } = useColorScheme();
  const isUser = message.role === 'user';
  const streaming = message.status === 'streaming';
  const failed = message.status === 'error';

  // 主题变化才重建样式对象；colorScheme 未定（undefined）时按浅色处理
  const markdownStyle = useMemo(
    () => buildMarkdownStyle(colorScheme === 'dark' ? 'dark' : 'light'),
    [colorScheme]
  );

  // 完成的助手消息才按 ```a2ui 块分段（卡片段原生渲染、文本段走 Markdown）；
  // 流式中不解析——JSON 未闭合会导致闪烁，沿用「纯文本 + 光标」直到完成
  const segments = useMemo(
    () => (!isUser && !streaming ? parseA2uiBlocks(message.content) : null),
    [isUser, streaming, message.content]
  );

  return (
    <View className={isUser ? 'flex-row justify-end' : 'flex-row justify-start'}>
      {/* 气泡容器：用户用品牌蓝底，助手用卡片白底 + 描边，圆角朝说话人一侧收窄 */}
      <View
        className={
          isUser
            ? 'max-w-[80%] rounded-2xl rounded-br-md bg-brand px-3.5 py-2.5 shadow-sm shadow-brand/30'
            : 'max-w-[80%] rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-2.5 shadow-sm shadow-black/5'
        }>
        {streaming ? (
          message.content === '' ? (
            // 首帧前的等待态：转圈 + 「思考中」；工具阶段按读写区分「查询中/写入中」
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" />
              <Text className="text-xs text-muted-foreground">
                {message.phase === 'querying'
                  ? t('aiAgent.querying')
                  : message.phase === 'writing'
                    ? t('aiAgent.writing')
                    : t('aiAgent.thinking')}
              </Text>
            </View>
          ) : (
            // 流式中：Markdown 语法未闭合会导致渲染闪烁，先用纯文本 + 光标，
            // 等完成后（status 由 streaming 转 done）再一次性走 Markdown 渲染。
            <Text selectable className="text-sm leading-5 text-foreground">
              {message.content}
              <Text className="text-brand">▍</Text>
            </Text>
          )
        ) : isUser ? (
          // 用户消息：纯文本，白字蓝底
          <Text selectable className="text-white">
            {message.content}
          </Text>
        ) : (
          // 助手消息：内容按 a2ui 块分段——文本段走 Markdown，卡片段原生渲染；
          // 无块时只有一个文本段，行为与原有 Markdown 渲染一致
          <View className="gap-1.5">
            {segments?.map((segment, i) =>
              segment.kind === 'text' ? (
                <Markdown
                  key={i}
                  colorScheme={colorScheme === 'dark' ? 'dark' : 'light'}
                  mergeStyle
                  style={markdownStyle}>
                  {segment.text}
                </Markdown>
              ) : (
                <A2uiRenderer key={i} ui={segment.ui} />
              )
            )}
          </View>
        )}
        {/* 请求失败：正文下方补一行失败提示 */}
        {failed && (
          <Text className="mt-1 text-xs text-destructive">{t('aiAgent.assistantFailed')}</Text>
        )}
        {/* token 消耗：助手消息完成且拿到用量时，正文下方补一行小字（未上报/历史消息不展示） */}
        {!isUser && !streaming && !failed && message.tokenUsage != null && (
          <Text className="mt-1 text-xs text-muted-foreground">
            {t('aiAgent.tokenUsage', { total: message.tokenUsage.total_tokens })}
          </Text>
        )}
      </View>
    </View>
  );
}

// memo：流式增量只更新最后一条助手消息的 content，其余消息对象引用不变，
// 避免每次 delta 都重渲染整条列表
export const ChatBubble = memo(ChatBubbleImpl);
