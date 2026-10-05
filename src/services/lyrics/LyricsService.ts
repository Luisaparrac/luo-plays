import type { Song } from '../../domain/Song';
import { LrcParser } from './LrcParser';
import type { LyricLine } from './LrcParser';

interface LrclibEntry {
  trackName?: string;
  artistName?: string;
  duration?: number;
  syncedLyrics?: string | null;
}

/** Looks up time-synced lyrics on LRCLIB, a free community service. */
export class LyricsService {
  private static readonly BASE = 'https://lrclib.net/api';
  /** Seconds of difference we still accept between the song and a lyrics version. */
  private static readonly MAX_DURATION_GAP = 4;
  private readonly cache = new Map<string, LyricLine[] | null>();

  /** Resolves to null when nothing synced was found. */
  async find(song: Song): Promise<LyricLine[] | null> {
    if (this.cache.has(song.key)) return this.cache.get(song.key) ?? null;

    let lines: LyricLine[] | null = null;
    try {
      lines = (await this.exactMatch(song)) ?? (await this.searchMatch(song));
    } catch {
      lines = null;
    }
    // Only remember successful answers, so a network hiccup can be retried.
    if (lines !== null) this.cache.set(song.key, lines);
    return lines;
  }

  private async exactMatch(song: Song): Promise<LyricLine[] | null> {
    const params = new URLSearchParams({
      track_name: song.title,
      artist_name: song.artist.split(',')[0].trim(),
    });
    if (song.album) params.set('album_name', song.album);
    if (song.source === 'spotify' && song.durationMs > 0) {
      params.set('duration', String(Math.round(song.durationMs / 1000)));
    }
    const entry = await this.getJson<LrclibEntry>(`${LyricsService.BASE}/get?${params.toString()}`);
    return this.toLines(entry);
  }

  /**
   * Falls back to a looser search. With a real duration (Spotify) we only
   * accept the version whose length matches, because a live or extended cut
   * has different timestamps and would drift. Previews only know 30 seconds,
   * so there we take the first synced result.
   */
  private async searchMatch(song: Song): Promise<LyricLine[] | null> {
    const params = new URLSearchParams({
      track_name: song.title,
      artist_name: song.artist.split(',')[0].trim(),
    });
    const entries = await this.getJson<LrclibEntry[]>(`${LyricsService.BASE}/search?${params.toString()}`);
    if (!entries) return null;
    const synced = entries.filter((entry) => entry.syncedLyrics);

    if (song.source !== 'spotify' || song.durationMs <= 0) return this.toLines(synced[0] ?? null);

    const wanted = song.durationMs / 1000;
    let best: LrclibEntry | null = null;
    let bestGap = LyricsService.MAX_DURATION_GAP;
    for (const entry of synced) {
      if (typeof entry.duration !== 'number') continue;
      const gap = Math.abs(entry.duration - wanted);
      if (gap <= bestGap) {
        best = entry;
        bestGap = gap;
      }
    }
    return this.toLines(best);
  }

  private toLines(entry: LrclibEntry | null): LyricLine[] | null {
    if (!entry || !entry.syncedLyrics) return null;
    const lines = LrcParser.parse(entry.syncedLyrics);
    return lines.length > 0 ? lines : null;
  }

  private async getJson<T>(url: string): Promise<T | null> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`LRCLIB answered ${response.status}`);
      return (await response.json()) as T;
    } finally {
      window.clearTimeout(timer);
    }
  }
}
