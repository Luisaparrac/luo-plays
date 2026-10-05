export interface LyricLine {
  timeMs: number;
  text: string;
}

/** Turns synced lyrics in LRC format ("[01:23.45] some words") into lines. */
export class LrcParser {
  private static readonly STAMP = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

  static parse(raw: string): LyricLine[] {
    const lines: LyricLine[] = [];
    for (const row of raw.split(/\r?\n/)) {
      const stamps = [...row.matchAll(LrcParser.STAMP)];
      if (stamps.length === 0) continue;
      const text = row.replace(LrcParser.STAMP, '').trim();
      if (!text) continue;
      for (const stamp of stamps) {
        const minutes = Number(stamp[1]);
        const seconds = Number(stamp[2]);
        const millis = stamp[3] ? Number(stamp[3].padEnd(3, '0').slice(0, 3)) : 0;
        lines.push({ timeMs: (minutes * 60 + seconds) * 1000 + millis, text });
      }
    }
    return lines.sort((a, b) => a.timeMs - b.timeMs);
  }

  /** Index of the line that should be highlighted at this position, or -1. */
  static indexAt(lines: LyricLine[], positionMs: number): number {
    let low = 0;
    let high = lines.length - 1;
    let found = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (lines[middle].timeMs <= positionMs) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return found;
  }
}
