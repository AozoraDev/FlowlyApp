import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('拼接多个类名', () => {
    expect(cn('px-2', 'py-3')).toBe('px-2 py-3');
  });

  it('tailwind-merge 用后置类去重冲突类', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('过滤 falsy 值', () => {
    expect(cn('px-2', false, undefined, null, '', 'py-1')).toBe('px-2 py-1');
  });

  it('支持条件式传参（布尔短路）', () => {
    expect(cn('base', true && 'active', false && 'hidden')).toBe('base active');
  });
});
