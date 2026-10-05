import { Song } from '../../domain/Song';
import type { SongData } from '../../domain/Song';
import type { RepeatMode } from '../../domain/Playlist';
import { PlaylistLibrary } from '../../domain/PlaylistLibrary';
import type { PlaylistEntry } from '../../domain/PlaylistLibrary';

const STATE_KEY = 'luo-plays.state.v1';
const LIBRARY_KEY = 'luo-plays.library.v1';
const MODE_KEY = 'luo-plays.mode';

export type AppMode = 'spotify' | 'preview';

export interface SavedState {
  songs: Song[];
  currentIndex: number;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
}

interface RawState {
  songs?: unknown[];
  currentIndex?: number;
  shuffle?: boolean;
  repeat?: RepeatMode;
  volume?: number;
}

export interface SavedLibrary {
  library: PlaylistLibrary;
  volume: number;
}

interface RawEntry extends RawState {
  id?: string;
  name?: string;
}

/** Keeps the playlists and a few settings in this browser. */
export class StorageService {
  /**
   * Loads every playlist. People who used the first version have a single
   * list under the old key, which becomes their first playlist.
   */
  loadLibrary(): SavedLibrary | null {
    try {
      const raw = localStorage.getItem(LIBRARY_KEY);
      if (raw) {
        const data = JSON.parse(raw) as { activeId?: string; volume?: number; lists?: RawEntry[] };
        const entries = (data.lists ?? [])
          .filter((item) => typeof item.id === 'string')
          .map((item) => this.toEntry(item));
        if (entries.length > 0) {
          const volume = typeof data.volume === 'number' ? data.volume : 0.8;
          return { library: new PlaylistLibrary(entries, data.activeId), volume };
        }
      }
    } catch {
      // damaged data: fall through to the old format
    }
    const legacy = this.loadState();
    if (!legacy) return null;
    const entry: PlaylistEntry = {
      id: 'l-first',
      name: 'Mi lista',
      songs: legacy.songs,
      currentIndex: legacy.currentIndex,
      shuffle: legacy.shuffle,
      repeat: legacy.repeat,
    };
    return { library: new PlaylistLibrary([entry]), volume: legacy.volume };
  }

  saveLibrary(library: PlaylistLibrary, volume: number): void {
    const payload = {
      activeId: library.active.id,
      volume,
      lists: library.all.map((entry) => ({
        id: entry.id,
        name: entry.name,
        songs: entry.songs.map((song): SongData => song.toJSON()),
        currentIndex: entry.currentIndex,
        shuffle: entry.shuffle,
        repeat: entry.repeat,
      })),
    };
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(payload));
    } catch {
      // Storage can be full or blocked; the app still works without it.
    }
  }

  private toEntry(item: RawEntry): PlaylistEntry {
    return {
      id: item.id as string,
      name: typeof item.name === 'string' && item.name ? item.name : 'Mi lista',
      songs: (item.songs ?? []).map((song) => Song.fromJSON(song)).filter((song): song is Song => song !== null),
      currentIndex: typeof item.currentIndex === 'number' ? item.currentIndex : 0,
      shuffle: Boolean(item.shuffle),
      repeat: item.repeat === 'all' || item.repeat === 'one' ? item.repeat : 'off',
    };
  }

  loadState(): SavedState | null {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as RawState;
      const songs = (data.songs ?? []).map((item) => Song.fromJSON(item)).filter((song): song is Song => song !== null);
      return {
        songs,
        currentIndex: typeof data.currentIndex === 'number' ? data.currentIndex : 0,
        shuffle: Boolean(data.shuffle),
        repeat: data.repeat === 'all' || data.repeat === 'one' ? data.repeat : 'off',
        volume: typeof data.volume === 'number' ? data.volume : 0.8,
      };
    } catch {
      return null;
    }
  }

  saveState(state: SavedState): void {
    const payload = {
      songs: state.songs.map((song): SongData => song.toJSON()),
      currentIndex: state.currentIndex,
      shuffle: state.shuffle,
      repeat: state.repeat,
      volume: state.volume,
    };
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(payload));
    } catch {
      // Storage can be full or blocked; the app still works without it.
    }
  }

  getMode(): AppMode | null {
    const mode = localStorage.getItem(MODE_KEY);
    return mode === 'spotify' || mode === 'preview' ? mode : null;
  }

  setMode(mode: AppMode): void {
    localStorage.setItem(MODE_KEY, mode);
  }

  clearMode(): void {
    localStorage.removeItem(MODE_KEY);
  }
}
