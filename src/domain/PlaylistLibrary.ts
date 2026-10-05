import type { RepeatMode } from './Playlist';
import type { Song } from './Song';

/** One saved playlist: its songs plus where the listener left off. */
export interface PlaylistEntry {
  id: string;
  name: string;
  songs: Song[];
  currentIndex: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

/**
 * Keeps every playlist the person has made and knows which one is open.
 * It only stores plain data: the open one is played through a live
 * `Playlist`, and the app copies it back here before saving.
 */
export class PlaylistLibrary {
  static readonly MAX_LISTS = 12;
  static readonly MAX_NAME = 24;

  private entries: PlaylistEntry[];
  private activeId: string;

  constructor(entries: PlaylistEntry[] = [], activeId = '') {
    this.entries = entries.length > 0 ? [...entries] : [PlaylistLibrary.blank('Mi lista')];
    this.activeId = this.entries.some((entry) => entry.id === activeId) ? activeId : this.entries[0].id;
  }

  get all(): readonly PlaylistEntry[] {
    return this.entries;
  }

  get active(): PlaylistEntry {
    return this.entries.find((entry) => entry.id === this.activeId) as PlaylistEntry;
  }

  get isFull(): boolean {
    return this.entries.length >= PlaylistLibrary.MAX_LISTS;
  }

  /** Adds an empty playlist, or returns null when the limit is reached. */
  create(name: string): PlaylistEntry | null {
    if (this.isFull) return null;
    const entry = PlaylistLibrary.blank(this.cleanName(name));
    this.entries.push(entry);
    return entry;
  }

  activate(id: string): boolean {
    if (!this.entries.some((entry) => entry.id === id)) return false;
    this.activeId = id;
    return true;
  }

  rename(id: string, name: string): void {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (entry) entry.name = this.cleanName(name, entry.name);
  }

  /**
   * Deletes a playlist. The last one cannot be deleted. If the open one goes,
   * its neighbour becomes the open one. Returns false when nothing was removed.
   */
  remove(id: string): boolean {
    const index = this.entries.findIndex((entry) => entry.id === id);
    if (index < 0 || this.entries.length === 1) return false;
    this.entries.splice(index, 1);
    if (this.activeId === id) this.activeId = this.entries[Math.min(index, this.entries.length - 1)].id;
    return true;
  }

  /** Copies the live state of the open playlist into its entry. */
  saveActive(state: Pick<PlaylistEntry, 'songs' | 'currentIndex' | 'shuffle' | 'repeat'>): void {
    Object.assign(this.active, state);
  }

  private cleanName(name: string, fallback = ''): string {
    const trimmed = name.trim().slice(0, PlaylistLibrary.MAX_NAME);
    return trimmed || fallback || `Lista ${this.entries.length + 1}`;
  }

  private static blank(name: string): PlaylistEntry {
    return { id: PlaylistLibrary.newId(), name, songs: [], currentIndex: 0, shuffle: false, repeat: 'off' };
  }

  private static newId(): string {
    return `l${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  }
}
