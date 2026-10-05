import type { Song } from '../domain/Song';
import { LrcParser } from '../services/lyrics/LrcParser';
import type { LyricLine } from '../services/lyrics/LrcParser';
import type { PlaybackSnapshot } from '../services/playback/PlaybackEngine';
import { button, el, icon, sparkle } from './dom';

export interface KaraokeHandlers {
  onToggle(): void;
  onPrevious(): void;
  onNext(): void;
  onClose(): void;
}

/** Full-screen lyrics: the line being sung fills with colour as it plays. */
export class KaraokeView {
  readonly element = el('div', 'karaoke', [], { role: 'dialog', 'aria-label': 'Modo karaoke', 'aria-modal': 'true' });

  private readonly songTitle = el('div', 'k-title', ['']);
  private readonly songArtist = el('div', 'k-artist', ['']);
  private readonly stage = el('div', 'k-stage');
  private readonly track = el('div', 'k-track');
  private readonly note = el('p', 'k-note', ['']);
  private readonly playButton: HTMLButtonElement;
  private readonly miniFill = el('div', 'k-fill');

  private readonly offsetLabel = el('span', 'k-offset-value', ['0.0 s']);

  private lines: LyricLine[] = [];
  private lineElements: HTMLElement[] = [];
  private activeIndex = -2;
  private duration = 0;

  /** Last position reported by the engine, and when we received it. */
  private snapshot: PlaybackSnapshot = { positionMs: 0, durationMs: 0, playing: false };
  private snapshotAt = 0;
  /** Added to the playback position before looking up the lyric line. */
  private offsetMs = 0;
  private song: Song | null = null;
  private frame = 0;
  private static readonly STORAGE_KEY = 'luo-plays.lyric-offsets';

  constructor(handlers: KaraokeHandlers) {
    this.element.hidden = true;
    this.playButton = button('ctl ctl-play ctl-sm', 'Reproducir o pausar', [icon('play', 22)], () => handlers.onToggle());

    const top = el('div', 'k-top', [
      button('k-back', 'Volver al reproductor', [icon('back', 16), 'Volver al reproductor'], () => handlers.onClose()),
      el('div', 'k-paper', [this.songTitle, this.songArtist]),
      el('div', 'k-source', ['Letra sincronizada · LRCLIB']),
    ]);
    this.stage.append(this.track);
    const tuner = el('div', 'k-tuner', [
      el('span', 'k-tuner-label', ['Ajustar letra']),
      button('k-tune', 'Atrasar la letra medio segundo', ['− 0.5 s'], () => this.nudge(-500)),
      this.offsetLabel,
      button('k-tune', 'Adelantar la letra medio segundo', ['+ 0.5 s'], () => this.nudge(500)),
      button('k-tune k-tune-reset', 'Reiniciar el ajuste de la letra', ['Reiniciar'], () => this.setOffset(0)),
    ]);
    const mini = el('div', 'k-mini', [
      button('ctl ctl-mini', 'Canción anterior', [icon('prev', 18)], () => handlers.onPrevious()),
      this.playButton,
      button('ctl ctl-mini', 'Canción siguiente', [icon('next', 18)], () => handlers.onNext()),
      el('div', 'k-bar', [this.miniFill]),
    ]);
    this.element.append(top, this.stage, this.note, tuner, mini, sparkle('spark spark-k1'), sparkle('spark spark-k2'));

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.element.hidden) handlers.onClose();
    });
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  open(): void {
    this.element.hidden = false;
    document.body.classList.add('no-scroll');
    this.activeIndex = -2;
    this.startClock();
  }

  close(): void {
    this.element.hidden = true;
    document.body.classList.remove('no-scroll');
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  setSong(song: Song | null): void {
    this.song = song;
    this.songTitle.textContent = song ? song.title : '';
    this.songArtist.textContent = song ? song.artist : '';
    this.offsetMs = song ? KaraokeView.loadOffsets()[song.key] ?? 0 : 0;
    this.showOffset();
  }

  /** `null` shows the "no lyrics" message; `undefined` means still searching. */
  setLyrics(lines: LyricLine[] | null | undefined, previewOnly: boolean): void {
    this.lines = lines ?? [];
    this.track.replaceChildren();
    this.lineElements = [];
    this.activeIndex = -2;
    if (lines === undefined) {
      this.note.textContent = 'Buscando la letra…';
      return;
    }
    if (lines === null) {
      this.note.textContent = 'Esta canción no tiene letra sincronizada.';
      return;
    }
    this.note.textContent = previewOnly
      ? 'Modo sin Spotify: el fragmento sale de la mitad de la canción. Toca la línea que está sonando para alinear la letra.'
      : 'Si la letra va desfasada, toca la línea que está sonando o usa los botones de ajuste.';
    this.lineElements = lines.map((line, index) => {
      const node = el('div', 'k-line', [line.text]);
      node.addEventListener('click', () => this.alignTo(index));
      return node;
    });
    this.track.append(...this.lineElements);
  }

  setSnapshot(snapshot: PlaybackSnapshot): void {
    this.snapshot = snapshot;
    this.snapshotAt = performance.now();
    this.duration = snapshot.durationMs || this.duration;
    this.playButton.replaceChildren(icon(snapshot.playing ? 'pause' : 'play', 22));
    this.sync();
  }

  /** Where the song is right now, filling the gap between engine updates. */
  private estimatedPosition(): number {
    if (!this.snapshot.playing) return this.snapshot.positionMs;
    const elapsed = performance.now() - this.snapshotAt;
    const position = this.snapshot.positionMs + elapsed;
    return this.duration > 0 ? Math.min(position, this.duration) : position;
  }

  private startClock(): void {
    if (this.frame) return;
    const tick = (): void => {
      this.sync();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private sync(): void {
    const position = this.estimatedPosition();
    const ratio = this.duration > 0 ? Math.min(1, position / this.duration) : 0;
    this.miniFill.style.width = `${ratio * 100}%`;
    if (this.element.hidden || this.lines.length === 0) return;

    const lyricTime = position + this.offsetMs;
    const index = LrcParser.indexAt(this.lines, lyricTime);
    if (index !== this.activeIndex) {
      this.activeIndex = index;
      this.lineElements.forEach((node, i) => {
        node.classList.toggle('is-active', i === index);
        node.classList.toggle('is-near', i !== index && Math.abs(i - index) === 1);
        node.classList.toggle('is-past', i < index);
        if (i !== index) node.style.removeProperty('--fill');
      });
      this.centerOn(index);
    }
    if (index >= 0) {
      const start = this.lines[index].timeMs;
      const end = index + 1 < this.lines.length ? this.lines[index + 1].timeMs : start + 4000;
      const fill = Math.min(1, Math.max(0, (lyricTime - start) / Math.max(1, Math.min(end - start, 8000))));
      this.lineElements[index].style.setProperty('--fill', `${(fill * 100).toFixed(1)}%`);
    }
  }

  /** The user says "this line is what I hear now": we learn the offset from it. */
  private alignTo(index: number): void {
    const line = this.lines[index];
    if (!line) return;
    this.setOffset(Math.round(line.timeMs - this.estimatedPosition()));
  }

  private nudge(deltaMs: number): void {
    this.setOffset(this.offsetMs + deltaMs);
  }

  private setOffset(value: number): void {
    this.offsetMs = Math.max(-60000, Math.min(60000, value));
    this.activeIndex = -2;
    this.showOffset();
    this.saveOffset();
    this.sync();
  }

  private showOffset(): void {
    const seconds = this.offsetMs / 1000;
    this.offsetLabel.textContent = `${seconds > 0 ? '+' : ''}${seconds.toFixed(1)} s`;
  }

  private saveOffset(): void {
    if (!this.song) return;
    try {
      const all = KaraokeView.loadOffsets();
      if (this.offsetMs === 0) delete all[this.song.key];
      else all[this.song.key] = this.offsetMs;
      localStorage.setItem(KaraokeView.STORAGE_KEY, JSON.stringify(all));
    } catch {
      // Storage can be blocked; the adjustment then lasts until the page closes.
    }
  }

  private static loadOffsets(): Record<string, number> {
    try {
      const raw = localStorage.getItem(KaraokeView.STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
    } catch {
      return {};
    }
  }

  private centerOn(index: number): void {
    const target = index < 0 ? this.lineElements[0] : this.lineElements[index];
    if (!target) return;
    const offset = target.offsetTop + target.offsetHeight / 2 - this.stage.clientHeight / 2;
    this.track.style.transform = `translateY(${-offset}px)`;
  }
}
