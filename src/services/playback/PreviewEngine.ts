import type { Song, SongSource } from '../../domain/Song';
import { BasePlaybackEngine } from './PlaybackEngine';

/** Plays 30-second previews with a plain audio element. */
export class PreviewEngine extends BasePlaybackEngine {
  readonly source: SongSource = 'preview';

  private readonly audio = new Audio();

  async prepare(): Promise<void> {
    this.audio.preload = 'auto';
    this.audio.addEventListener('timeupdate', () => this.emitCurrent());
    this.audio.addEventListener('play', () => this.emitCurrent());
    this.audio.addEventListener('pause', () => this.emitCurrent());
    this.audio.addEventListener('loadedmetadata', () => this.emitCurrent());
    this.audio.addEventListener('ended', () => {
      this.emitCurrent();
      this.ended.emit();
    });
    this.audio.addEventListener('error', () => {
      this.errors.emit('No se pudo reproducir este fragmento.');
    });
  }

  async load(song: Song, autoplay: boolean): Promise<void> {
    this.audio.src = song.playUri;
    this.audio.load();
    this.publish({ positionMs: 0, durationMs: song.durationMs, playing: false });
    if (autoplay) await this.play();
  }

  async play(): Promise<void> {
    try {
      await this.audio.play();
    } catch {
      this.errors.emit('El navegador bloqueó el audio. Toca play otra vez.');
    }
  }

  async pause(): Promise<void> {
    this.audio.pause();
  }

  async seek(positionMs: number): Promise<void> {
    this.audio.currentTime = positionMs / 1000;
  }

  setVolume(volume: number): void {
    this.audio.volume = Math.max(0, Math.min(1, volume));
  }

  dispose(): void {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
  }

  private emitCurrent(): void {
    const duration = Number.isFinite(this.audio.duration) ? this.audio.duration * 1000 : this.last.durationMs;
    this.publish({
      positionMs: this.audio.currentTime * 1000,
      durationMs: duration,
      playing: !this.audio.paused && !this.audio.ended,
    });
  }
}
