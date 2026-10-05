import type { Song } from '../domain/Song';
import type { MusicProvider } from '../services/music/MusicProvider';
import { button, el, formatTime, icon } from './dom';

export interface SearchHandlers {
  /** The visitor picked a result to add with the footer tools. */
  onStage(song: Song): void;
  /** Quick add to the end of the list. */
  onQuickAdd(song: Song): void;
  onError(message: string): void;
}

/** Search box with a dropdown of results and a "load more" button. */
export class SearchView {
  readonly element = el('div', 'search');

  private readonly input = el('input', 'search-input', [], {
    type: 'search',
    placeholder: 'Buscar canciones, artistas o álbumes…',
    'aria-label': 'Buscar canciones',
    autocomplete: 'off',
  });
  private readonly panel = el('div', 'search-panel', [], { role: 'listbox' });
  private provider: MusicProvider;
  private query = '';
  private results: Song[] = [];
  private offset = 0;
  private timer: number | undefined;
  private requestId = 0;

  constructor(
    provider: MusicProvider,
    sourceBadge: string,
    private readonly handlers: SearchHandlers,
  ) {
    this.provider = provider;
    this.panel.hidden = true;
    this.element.append(
      el('div', 'search-box', [icon('search', 18), this.input, el('span', 'badge', [sourceBadge])]),
      this.panel,
    );

    this.input.addEventListener('input', () => {
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => void this.run(this.input.value), 350);
    });
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        window.clearTimeout(this.timer);
        void this.run(this.input.value);
      }
      if (event.key === 'Escape') this.close();
    });
    this.input.addEventListener('focus', () => {
      if (this.results.length > 0) this.panel.hidden = false;
    });
    document.addEventListener('pointerdown', (event) => {
      if (!this.element.contains(event.target as Node)) this.close();
    });
  }

  close(): void {
    this.panel.hidden = true;
  }

  private async run(raw: string): Promise<void> {
    const query = raw.trim();
    if (query.length < 2) {
      this.results = [];
      this.close();
      return;
    }
    this.query = query;
    this.offset = 0;
    const id = ++this.requestId;
    this.showMessage('Buscando…');
    try {
      const found = await this.provider.search(query, 0);
      if (id !== this.requestId) return;
      this.results = found;
      this.offset = found.length;
      this.paint(found.length === 10);
    } catch {
      if (id !== this.requestId) return;
      this.showMessage('No se pudo buscar ahora. Intenta de nuevo.');
      this.handlers.onError('La búsqueda falló.');
    }
  }

  private async loadMore(): Promise<void> {
    const id = ++this.requestId;
    try {
      const found = await this.provider.search(this.query, this.offset);
      if (id !== this.requestId) return;
      this.results = [...this.results, ...found];
      this.offset += found.length;
      this.paint(found.length === 10);
    } catch {
      this.handlers.onError('No se pudieron cargar más resultados.');
    }
  }

  private showMessage(text: string): void {
    this.panel.hidden = false;
    this.panel.replaceChildren(el('p', 'search-note', [text]));
  }

  private paint(canLoadMore: boolean): void {
    this.panel.hidden = false;
    this.panel.replaceChildren();
    if (this.results.length === 0) {
      this.panel.append(el('p', 'search-note', ['No encontré nada con esa búsqueda.']));
      return;
    }
    for (const song of this.results) this.panel.append(this.buildResult(song));
    if (canLoadMore) {
      this.panel.append(button('more', 'Cargar más resultados', ['Cargar más'], () => void this.loadMore()));
    }
  }

  private buildResult(song: Song): HTMLElement {
    const cover = el('div', 'cover');
    if (song.coverUrl) cover.style.backgroundImage = `url("${song.coverUrl}")`;
    const row = el('div', 'result', [
      cover,
      el('div', 'result-meta', [el('div', 'song-title', [song.title]), el('div', 'song-artist', [`${song.artist} · ${formatTime(song.durationMs)}`])]),
      button('mini mini-text', `Elegir ${song.title}`, ['Elegir'], () => {
        this.handlers.onStage(song);
        this.close();
      }),
      button('mini', `Agregar ${song.title} al final`, [icon('plus', 16)], () => this.handlers.onQuickAdd(song)),
    ], { role: 'option' });
    return row;
  }
}
