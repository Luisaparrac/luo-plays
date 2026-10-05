/** Where a song can be played from. */
export type SongSource = 'spotify' | 'preview';

export interface SongData {
  source: SongSource;
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  durationMs: number;
  /** A Spotify URI for full tracks, or a direct audio URL for previews. */
  playUri: string;
}

/** A single track. Instances are immutable, so they are safe to share. */
export class Song {
  readonly source: SongSource;
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  readonly coverUrl: string;
  readonly durationMs: number;
  readonly playUri: string;

  constructor(data: SongData) {
    this.source = data.source;
    this.id = data.id;
    this.title = data.title;
    this.artist = data.artist;
    this.album = data.album;
    this.coverUrl = data.coverUrl;
    this.durationMs = data.durationMs;
    this.playUri = data.playUri;
  }

  /** Unique per source, e.g. "spotify:4uLU6hMCjMI75M1A2tKUQC". */
  get key(): string {
    return `${this.source}:${this.id}`;
  }

  toJSON(): SongData {
    return {
      source: this.source,
      id: this.id,
      title: this.title,
      artist: this.artist,
      album: this.album,
      coverUrl: this.coverUrl,
      durationMs: this.durationMs,
      playUri: this.playUri,
    };
  }

  /** Rebuilds a song from stored data. Returns null when the data is damaged. */
  static fromJSON(raw: unknown): Song | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const data = raw as Partial<SongData>;
    const validSource = data.source === 'spotify' || data.source === 'preview';
    if (!validSource || typeof data.id !== 'string' || typeof data.title !== 'string') {
      return null;
    }
    return new Song({
      source: data.source as SongSource,
      id: data.id,
      title: data.title,
      artist: typeof data.artist === 'string' ? data.artist : '',
      album: typeof data.album === 'string' ? data.album : '',
      coverUrl: typeof data.coverUrl === 'string' ? data.coverUrl : '',
      durationMs: typeof data.durationMs === 'number' ? data.durationMs : 0,
      playUri: typeof data.playUri === 'string' ? data.playUri : '',
    });
  }
}
