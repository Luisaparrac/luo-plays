import { config } from '../config';
import type { Song } from '../domain/Song';
import type { MusicProvider } from './music/MusicProvider';
import type { SharedEntry } from './storage/ShareService';
import type { SavedState } from './storage/StorageService';

export interface InitialPlaylist {
  songs: Song[];
  currentIndex: number;
  origin: 'shared' | 'saved' | 'seed' | 'empty';
}

interface SeedFile {
  tracks?: Array<{ title?: string; artist?: string }>;
}

/**
 * Decides what the playlist holds when the app opens: a shared link wins,
 * then the saved list, then the starter catalogue file.
 */
export class PlaylistBootstrap {
  constructor(private readonly provider: MusicProvider) {}

  async load(shared: SharedEntry[] | null, saved: SavedState | null): Promise<InitialPlaylist> {
    if (shared && shared.length > 0) {
      const songs = await this.resolveShared(shared.slice(0, config.maxShareSongs));
      if (songs.length > 0) return { songs, currentIndex: 0, origin: 'shared' };
    }
    if (saved && saved.songs.length > 0) {
      const songs = await this.adaptToProvider(saved.songs);
      if (songs.length > 0) {
        return { songs, currentIndex: Math.min(saved.currentIndex, songs.length - 1), origin: 'saved' };
      }
    }
    const seed = await this.loadSeed();
    if (seed.length > 0) return { songs: seed, currentIndex: 0, origin: 'seed' };
    return { songs: [], currentIndex: 0, origin: 'empty' };
  }

  /** Same-source entries are fetched by id; others are matched by title and artist. */
  private async resolveShared(entries: SharedEntry[]): Promise<Song[]> {
    return this.inBatches(entries, async (entry) => {
      if (entry.source === this.provider.source) {
        const exact = await this.provider.getById(entry.id);
        if (exact) return exact;
      }
      return this.provider.findBest(entry.title, entry.artist);
    });
  }

  /** Songs saved from the other source are re-found in the current one. */
  async adaptToProvider(songs: Song[]): Promise<Song[]> {
    return this.inBatches(songs, async (song) =>
      song.source === this.provider.source ? song : this.provider.findBest(song.title, song.artist),
    );
  }

  private async loadSeed(): Promise<Song[]> {
    try {
      const response = await fetch(config.seedCatalogUrl, { cache: 'no-cache' });
      if (!response.ok) return [];
      const file = (await response.json()) as SeedFile;
      const tracks = (file.tracks ?? [])
        .filter((track) => track.title && track.artist)
        .slice(0, config.maxSeedTracks);
      return this.inBatches(tracks, (track) => this.provider.findBest(track.title as string, track.artist as string));
    } catch {
      return [];
    }
  }

  /** Runs lookups a few at a time to stay friendly with rate limits. */
  private async inBatches<T>(items: T[], work: (item: T) => Promise<Song | null>): Promise<Song[]> {
    const found: Song[] = [];
    for (let i = 0; i < items.length; i += 4) {
      const batch = await Promise.all(items.slice(i, i + 4).map((item) => work(item).catch(() => null)));
      for (const song of batch) if (song) found.push(song);
    }
    return found;
  }
}
