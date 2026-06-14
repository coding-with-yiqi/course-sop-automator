import { describe, it, expect } from 'vitest';
import { richTextToPlain } from './richtext.js';

describe('richTextToPlain', () => {
  it('keeps list items on separate lines with a bullet prefix', () => {
    const html = '<ul><li>第一步</li><li>第二步</li></ul>';
    expect(richTextToPlain(html)).toBe('· 第一步\n· 第二步');
  });

  it('does not collapse adjacent list items into one line', () => {
    // 这正是放开 <ul><li> 排版后会踩的坑:粗暴剥标签会得到「AB」
    const html = '<ul><li>A</li><li>B</li></ul>';
    expect(richTextToPlain(html)).not.toContain('AB');
  });

  it('turns <br> and </p> into line breaks', () => {
    expect(richTextToPlain('<p>一</p><p>二</p>')).toBe('一\n二');
    expect(richTextToPlain('左<br>右')).toBe('左\n右');
  });

  it('strips inline tags but keeps text', () => {
    expect(richTextToPlain('运行 <code>npm test</code> 再 <strong>提交</strong>')).toBe(
      '运行 npm test 再 提交',
    );
  });

  it('collapses excess blank lines and trims', () => {
    expect(richTextToPlain('<p>a</p><p></p><p></p><p>b</p>')).toBe('a\n\nb');
  });

  it('returns plain text unchanged when no tags', () => {
    expect(richTextToPlain('就一句话')).toBe('就一句话');
  });
});
