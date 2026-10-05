import { Observable } from '../../domain/Observable';
import type { Song, SongSource } from '../../domain/Song';

export interface PlaybackSnapshot {
  positionMs: number;
  durationMs: number;
  playing: boolean;
}

/** What the interface needs from whatever is actually making sound. */
export interface PlaybackEngine {
  readonly source: SongSource;
  readonly snapshots: Observable<PlaybackSnapshot>;
  /** Fires once when a song finishes by itself. */
  readonly ended: Observable<void>;
  readonly errors: Observable<string>;
  readonly snapshot: PlaybackSnapshot;

  /** Gets the engine ready (loads SDKs, opens connections). */
  prepare(): Promise<void>;
  /** Must be called synchronously inside a click so browsers allow audio. */
  unlock(): void;
  load(song: Song, autoplay: boolean): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  toggle(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setVolume(volume: number): void;
  dispose(): void;
}

/** Shared plumbing so each engine only writes the parts that differ. */
export abstract class BasePlaybackEngine implements PlaybackEngine {
  abstract readonly source: SongSource;

  readonly snapshots = new Observable<PlaybackSnapshot>();
  readonly ended = new Observable<void>();
  readonly errors = new Observable<string>();

  protected last: PlaybackSnapshot = { positionMs: 0, durationMs: 0, playing: false };

  get snapshot(): PlaybackSnapshot {
    return this.last;
  }

  abstract prepare(): Promise<void>;
  abstract load(song: Song, autoplay: boolean): Promise<void>;
  abstract play(): Promise<void>;
  abstract pause(): Promise<void>;
  abstract seek(positionMs: number): Promise<void>;
  abstract setVolume(volume: number): void;
  abstract dispose(): void;

  unlock(): void {
    // Most engines do not need this.
  }

  async toggle(): Promise<void> {
    if (this.last.playing) await this.pause();
    else await this.play();
  }

  protected publish(snapshot: PlaybackSnapshot): void {
    this.last = snapshot;
    this.snapshots.emit(snapshot);
  }
}
