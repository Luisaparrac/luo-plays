import type { RepeatMode } from '../domain/Playlist';
import type { Song } from '../domain/Song';
import type { PlaybackSnapshot } from '../services/playback/PlaybackEngine';
import { Visualizer } from './Visualizer';
import { button, el, formatTime, icon } from './dom';

export interface PlayerHandlers {
  onToggle(): void;
  onPrevious(): void;
  onNext(): void;
  onShuffle(): void;
  onRepeat(): void;
  onKaraoke(): void;
  onSeek(positionMs: number): void;
  onVolume(volume: number): void;
}

/** The deck: LCD screen, spinning vinyl, waveform, progress bar and controls. */
export class PlayerView {
  readonly element = el('section', 'deck');
  readonly visualizer = new Visualizer();

  private readonly lcdTitle = el('span', '', ['Elige una canción']);
  private readonly lcdTitleBox = el('div', 'lcd-title', [this.lcdTitle]);
  private readonly lcdTime = el('div', 'lcd-time', ['00:00']);
  private readonly lcdSource = el('span', '', ['']);
  private readonly lcdRepeat = el('span', '', ['REPEAT: OFF']);
  private readonly lcdShuffle = el('span', '', ['SHUFFLE: OFF']);
  private readonly lcdCount = el('span', 'lcd-count', ['0 / 0']);

  private readonly vinyl = el('div', 'vinyl');
  private readonly label = el('div', 'vinyl-label');
  private readonly wrap = el('div', 'vinyl-wrap');

  private readonly barFill = el('div', 'bar-fill');
  private readonly barThumb = el('div', 'bar-thumb');
  private readonly bar = el('div', 'bar', [this.barFill, this.barThumb], { role: 'slider', 'aria-label': 'Progreso', tabindex: '0' });
  private readonly elapsed = el('span', '', ['00:00']);
  private readonly total = el('span', '', ['00:00']);

  private readonly playButton: HTMLButtonElement;
  private readonly shuffleButton: HTMLButtonElement;
  private readonly repeatButton: HTMLButtonElement;
  private readonly karaokeButton: HTMLButtonElement;

  private duration = 0;
  private scrubbing = false;

  constructor(
    private readonly handlers: PlayerHandlers,
    sourceLabel: string,
  ) {
    this.lcdSource.textContent = sourceLabel;

    this.playButton = button('ctl ctl-play', 'Reproducir o pausar', [icon('play', 30)], () => handlers.onToggle());
    this.shuffleButton = button('ctl ctl-small', 'Aleatorio', [icon('shuffle')], () => handlers.onShuffle());
    this.repeatButton = button('ctl ctl-small', 'Repetir', [icon('repeat')], () => handlers.onRepeat());
    this.karaokeButton = button('karaoke-btn', 'Abrir modo karaoke', [icon('mic', 18), 'Karaoke'], () => handlers.onKaraoke());

    const lcd = el('div', 'lcd', [
      el('div', 'lcd-top', [this.lcdTitleBox, this.lcdTime]),
      el('div', 'lcd-bottom', [this.lcdSource, el('span', '', ['STEREO']), this.lcdRepeat, this.lcdShuffle, this.lcdCount]),
    ]);

    this.wrap.append(
      el('div', 'vinyl-glow'),
      this.vinyl,
      el('div', 'vinyl-sheen'),
      el('div', 'tonearm', [el('div', 'tonearm-base'), el('div', 'tonearm-rod'), el('div', 'tonearm-head')]),
    );
    this.vinyl.append(el('div', 'vinyl-grooves'), this.label, el('div', 'vinyl-hole'));

    const stage = el('div', 'stage', [this.wrap, el('div', 'wave', [this.visualizer.element])]);
    const progress = el('div', 'progress', [this.elapsed, this.bar, this.total]);

    const volume = el('input', 'volume', [], {
      type: 'range',
      min: '0',
      max: '100',
      value: '80',
      'aria-label': 'Volumen',
    });
    volume.addEventListener('input', () => handlers.onVolume(Number(volume.value) / 100));

    const controls = el('div', 'controls', [
      this.shuffleButton,
      button('ctl ctl-mid', 'Canción anterior', [icon('prev', 22)], () => handlers.onPrevious()),
      this.playButton,
      button('ctl ctl-mid', 'Canción siguiente', [icon('next', 22)], () => handlers.onNext()),
      this.repeatButton,
      this.karaokeButton,
      el('label', 'volume-wrap', [icon('volume', 18), volume]),
    ]);

    this.element.append(
      el('span', 'screw screw-a'),
      el('span', 'screw screw-b'),
      lcd,
      stage,
      progress,
      controls,
    );

    this.bindScrubbing();
    this.visualizer.start();
  }

  setSourceLabel(text: string): void {
    this.lcdSource.textContent = text;
  }

  setSong(song: Song | null, index: number, total: number): void {
    this.lcdCount.textContent = `${total === 0 ? 0 : index + 1} / ${total}`;
    this.visualizer.setSeed(song ? song.key : '');
    if (!song) {
      this.lcdTitle.textContent = 'Elige una canción';
      this.label.style.backgroundImage = '';
      this.duration = 0;
      this.total.textContent = '00:00';
      return;
    }
    this.lcdTitle.textContent = `${song.title} — ${song.artist}`.toUpperCase();
    this.label.style.backgroundImage = song.coverUrl ? `url("${song.coverUrl}")` : '';
    this.duration = song.durationMs;
    this.total.textContent = formatTime(song.durationMs);
    this.lcdTitleBox.classList.remove('scroll');
    requestAnimationFrame(() => {
      this.lcdTitleBox.classList.toggle('scroll', this.lcdTitle.scrollWidth > this.lcdTitleBox.clientWidth);
    });
  }

  setSnapshot(snapshot: PlaybackSnapshot): void {
    this.duration = snapshot.durationMs || this.duration;
    this.playButton.replaceChildren(icon(snapshot.playing ? 'pause' : 'play', 30));
    this.element.classList.toggle('is-playing', snapshot.playing);
    this.visualizer.setPlaying(snapshot.playing);
    if (this.scrubbing) return;
    this.paintProgress(snapshot.positionMs);
  }

  setModes(shuffle: boolean, repeat: RepeatMode): void {
    this.shuffleButton.classList.toggle('is-on', shuffle);
    this.repeatButton.classList.toggle('is-on', repeat !== 'off');
    this.lcdShuffle.textContent = `SHUFFLE: ${shuffle ? 'ON' : 'OFF'}`;
    this.lcdRepeat.textContent = `REPEAT: ${repeat === 'off' ? 'OFF' : repeat === 'all' ? 'LISTA' : 'UNA'}`;
    this.lcdRepeat.classList.toggle('lit', repeat !== 'off');
    this.repeatButton.setAttribute('data-mode', repeat);
  }

  setKaraokeAvailable(available: boolean, loading = false): void {
    this.karaokeButton.disabled = !available;
    this.karaokeButton.classList.toggle('is-loading', loading);
    this.karaokeButton.title = loading ? 'Buscando la letra…' : available ? 'Abrir modo karaoke' : 'Esta canción no tiene letra sincronizada';
  }

  setGlow(color: string | null): void {
    const value = color ?? '#D4FF3A';
    this.element.style.setProperty('--glow', value);
    this.visualizer.setAccent(value);
  }

  private paintProgress(positionMs: number): void {
    const ratio = this.duration > 0 ? Math.min(1, positionMs / this.duration) : 0;
    this.barFill.style.width = `${ratio * 100}%`;
    this.barThumb.style.left = `${ratio * 100}%`;
    this.elapsed.textContent = formatTime(positionMs);
    this.lcdTime.textContent = formatTime(positionMs);
    this.bar.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  }

  private bindScrubbing(): void {
    const positionFrom = (event: PointerEvent): number => {
      const rect = this.bar.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      return ratio * this.duration;
    };
    this.bar.addEventListener('pointerdown', (event) => {
      if (this.duration <= 0) return;
      this.scrubbing = true;
      this.bar.setPointerCapture(event.pointerId);
      this.paintProgress(positionFrom(event));
    });
    this.bar.addEventListener('pointermove', (event) => {
      if (this.scrubbing) this.paintProgress(positionFrom(event));
    });
    this.bar.addEventListener('pointerup', (event) => {
      if (!this.scrubbing) return;
      this.scrubbing = false;
      this.handlers.onSeek(positionFrom(event));
    });
    this.bar.addEventListener('keydown', (event) => {
      if (this.duration <= 0) return;
      const step = event.key === 'ArrowRight' ? 5000 : event.key === 'ArrowLeft' ? -5000 : 0;
      if (step === 0) return;
      event.preventDefault();
      this.handlers.onSeek(Math.max(0, Math.min(this.duration, this.currentPositionFromBar() + step)));
    });
  }

  private currentPositionFromBar(): number {
    const ratio = Number(this.bar.getAttribute('aria-valuenow') ?? '0') / 100;
    return ratio * this.duration;
  }
}
