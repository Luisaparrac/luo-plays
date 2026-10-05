import { describe, expect, it } from 'vitest';
import { LrcParser } from '../src/services/lyrics/LrcParser';

describe('LrcParser', () => {
  const sample = ['[00:12.50] first line', '[00:20.00]second line', '[01:05.123] third line', '[ar: someone]', '[00:30.00]'].join('\n');

  it('reads timestamps in order and skips tags and empty lines', () => {
    const lines = LrcParser.parse(sample);
    expect(lines.map((line) => line.text)).toEqual(['first line', 'second line', 'third line']);
    expect(lines.map((line) => line.timeMs)).toEqual([12500, 20000, 65123]);
  });

  it('handles several timestamps on one line', () => {
    const lines = LrcParser.parse('[00:10.00][00:40.00] chorus');
    expect(lines.map((line) => line.timeMs)).toEqual([10000, 40000]);
  });

  it('finds the line that matches a playback position', () => {
    const lines = LrcParser.parse(sample);
    expect(LrcParser.indexAt(lines, 5000)).toBe(-1);
    expect(LrcParser.indexAt(lines, 12500)).toBe(0);
    expect(LrcParser.indexAt(lines, 25000)).toBe(1);
    expect(LrcParser.indexAt(lines, 999999)).toBe(2);
  });
});
