// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Song } from '../src/domain/Song';
import { LyricsService } from '../src/services/lyrics/LyricsService';

function song(source: 'spotify' | 'preview', durationMs: number): Song {
  return new Song({ source, id: 'x', title: 'Title', artist: 'Band', album: '', coverUrl: '', durationMs, playUri: 'u' });
}

/** First call (/get) misses, second (/search) returns the given entries. */
function stubLrclib(entries: unknown[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('/get?')) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => entries };
    }),
  );
}

const entry = (duration: number, text: string) => ({ duration, syncedLyrics: `[00:01.00] ${text}` });

describe('LyricsService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('picks the version whose length matches the Spotify track', async () => {
    stubLrclib([entry(300, 'live'), entry(201, 'studio')]);
    const lines = await new LyricsService().find(song('spotify', 200000));
    expect(lines?.[0].text).toBe('studio');
  });

  it('refuses a version that is too different, to avoid drifting lyrics', async () => {
    stubLrclib([entry(300, 'live')]);
    expect(await new LyricsService().find(song('spotify', 200000))).toBeNull();
  });

  it('takes the first synced result for previews, which only know 30 seconds', async () => {
    stubLrclib([{ duration: 250, syncedLyrics: null }, entry(250, 'first')]);
    const lines = await new LyricsService().find(song('preview', 30000));
    expect(lines?.[0].text).toBe('first');
  });
});
