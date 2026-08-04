import { describe, expect, it } from 'vitest';

import { A2UI_FORMAT, SUMMARY_NOTE, getA2uiFormat, getSummaryNote } from './systemPrompt';

// CJK 检测：语言统一约束下，英文 A2UI 规范不得携带中文字例（否则模型会照抄中文卡片标题/列名）
const HAS_CJK = /[一-鿿]/;

describe('A2UI 格式规范语言统一', () => {
  it('英文规范含英文示例，无中文字例', () => {
    const en = getA2uiFormat('en');
    expect(en).not.toMatch(HAS_CJK);
    // 明确指示卡片文案跟随用户语言
    expect(en).toContain("Cards follow the user's language");
    // 示例为英文标题与本地化 display_name（数据键 name/balance 保留不变）
    expect(en).toContain('Per-section balance');
    expect(en).toContain('display_name":"Section"');
    expect(en).toContain('display_name":"Balance"');
  });

  it('中文规范明确跟随用户语言，示例用本地化 display_name', () => {
    const zh = getA2uiFormat('zh');
    expect(zh).toContain('卡片文案跟随用户语言');
    expect(zh).toContain('display_name":"项目"');
    expect(zh).toContain('display_name":"结余"');
  });

  it('英文规范无中文「结余/日常」等残留示例', () => {
    expect(getA2uiFormat('en')).not.toContain('各项目结余');
    expect(getA2uiFormat('en')).not.toContain('日常');
  });

  it('未知语言回退中文', () => {
    expect(getA2uiFormat('fr')).toBe(A2UI_FORMAT.zh);
  });
});

describe('汇总轮说明 getSummaryNote', () => {
  it('英文无中文字例，明确卡片由系统生成', () => {
    const note = getSummaryNote('en');
    expect(note).not.toMatch(HAS_CJK);
    expect(note).toContain('auto-rendered');
    expect(note).toContain('get_account_summaries');
  });

  it('中文提示汇总卡片系统生成、模型不输出 a2ui 块', () => {
    const note = getSummaryNote('zh');
    expect(note).toContain('汇总卡片');
    expect(note).toContain('get_account_summaries');
    expect(note).toContain('不要重复罗列');
  });

  it('未知语言回退中文', () => {
    expect(getSummaryNote('fr')).toBe(SUMMARY_NOTE.zh);
  });
});
