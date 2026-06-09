import { describe, it, expect } from 'vitest';
import { parseTxtCues } from './txt.js';

describe('parseTxtCues — tolerant timestamped TXT', () => {
  it('HH:MM:SS + text on same line (space separated)', () => {
    const cues = parseTxtCues('00:00:11  你好世界\n00:00:15  第二句');
    expect(cues).toHaveLength(2);
    expect(cues[0].startMs).toBe(11000); // 毫秒,不是 11
    expect(cues[0].text).toBe('你好世界');
    // end = next cue start
    expect(cues[0].endMs).toBe(15000);
  });

  it('bracketed [HH:MM:SS]', () => {
    const cues = parseTxtCues('[00:00:11] 你好\n[00:00:13] 再见');
    expect(cues[0].startMs).toBe(11000);
    expect(cues[0].text).toBe('你好');
  });

  it('MM:SS (no hours) is interpreted as minutes:seconds', () => {
    const cues = parseTxtCues('01:05 一分零五秒\n01:10 一分十秒');
    expect(cues[0].startMs).toBe(65000); // 1*60+5 = 65s = 65000ms
    expect(cues[1].startMs).toBe(70000);
  });

  it('comma millis (srt-style) 00:00:11,500', () => {
    const cues = parseTxtCues('00:00:11,500 半秒\n00:00:13,000 下一句');
    expect(cues[0].startMs).toBe(11500);
  });

  it('dot millis 00:00:11.250', () => {
    const cues = parseTxtCues('00:00:11.250 四分之一秒\n00:00:12.000 next');
    expect(cues[0].startMs).toBe(11250);
  });

  it('explicit range "--> end" is honored for endMs', () => {
    const cues = parseTxtCues('00:00:11 --> 00:00:13  带区间的句子');
    expect(cues[0].startMs).toBe(11000);
    expect(cues[0].endMs).toBe(13000); // explicit end, not tail
    expect(cues[0].text).toBe('带区间的句子');
  });

  it('timestamp on its own line, text on the next (srt habit)', () => {
    const cues = parseTxtCues('00:00:11\n这一句的时间在上一行\n00:00:14\n第二句');
    expect(cues).toHaveLength(2);
    expect(cues[0].startMs).toBe(11000);
    expect(cues[0].text).toBe('这一句的时间在上一行');
    expect(cues[0].endMs).toBe(14000);
  });

  it('leading numeric index (full srt block) parses', () => {
    const cues = parseTxtCues('1\n00:00:11,000 --> 00:00:13,000\n第一句\n2\n00:00:14,000 --> 00:00:16,000\n第二句');
    expect(cues).toHaveLength(2);
    expect(cues[0].startMs).toBe(11000);
    expect(cues[0].endMs).toBe(13000);
    expect(cues[0].text).toBe('第一句');
  });

  it('mixed formats in one file all parse (true tolerance)', () => {
    const cues = parseTxtCues('[00:01] 第一\n00:00:05 第二\n00:00:08,500 第三');
    expect(cues).toHaveLength(3);
    expect(cues[0].startMs).toBe(1000);
    expect(cues[1].startMs).toBe(5000);
    expect(cues[2].startMs).toBe(8500);
  });

  it('final cue with no following timestamp gets a tail end (start < end)', () => {
    const cues = parseTxtCues('00:00:11 只有一句');
    expect(cues).toHaveLength(1);
    expect(cues[0].endMs).toBeGreaterThan(cues[0].startMs);
  });

  it('prose lines with no timestamp are dropped, kept ones still anchor', () => {
    const cues = parseTxtCues('这是一段没有时间的开场白\n00:00:11 真正第一句\n00:00:13 第二句');
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('真正第一句');
  });

  it('THROWS on plain prose with zero timestamps (no frame anchor)', () => {
    expect(() => parseTxtCues('完全没有时间戳的一段话。\n第二行也没有。')).toThrow(/没有找到任何时间戳/);
  });

  it('CRLF line endings are handled', () => {
    const cues = parseTxtCues('00:00:11 第一\r\n00:00:13 第二\r\n');
    expect(cues).toHaveLength(2);
    expect(cues[0].startMs).toBe(11000);
  });

  it('zero/backwards span falls back to tail end (no zero-length cue)', () => {
    // two cues at the same timestamp — second must not produce end <= start
    const cues = parseTxtCues('00:00:11 同一时刻A\n00:00:11 同一时刻B');
    expect(cues[0].endMs).toBeGreaterThan(cues[0].startMs);
    expect(cues[1].endMs).toBeGreaterThan(cues[1].startMs);
  });
});
