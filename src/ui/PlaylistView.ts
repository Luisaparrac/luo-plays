import type { DoublyNode } from '../domain/DoublyNode';
import type { Playlist } from '../domain/Playlist';
import type { PlaylistEntry } from '../domain/PlaylistLibrary';
import type { Song } from '../domain/Song';
import { button, el, formatTime, icon } from './dom';

export interface PlaylistHandlers {
  onPlay(node: DoublyNode<Song>): void;
  onRemove(node: DoublyNode<Song>): void;
  onPlayNext(node: DoublyNode<Song>): void;
  onMove(from: number, to: number): void;
  onAddFirst(): void;
  onAddLast(): void;
  /** Puts the staged song right after the one that is playing. */
  onAddNext(): void;
  /** `index` is zero-based. */
  onAddAt(index: number): void;
  onSelectList(id: string): void;
  onCreateList(): void;
  onRenameList(): void;
  onDeleteList(): void;
}

/** The list window: rows you can drag, plus the "add" tools at the bottom. */
export class PlaylistView {
  readonly element = el('section', 'window');

  private readonly title = el('div', 'paper-label', ['mi lista']);
  private readonly tabs = el('div', 'list-tabs', [], { role: 'tablist', 'aria-label': 'Tus playlists' });
  private listName = 'Mi lista';
  private readonly rows = el('div', 'rows', [], { role: 'list' });
  private readonly staged = el('div', 'staged', ['Busca una canción y elígela para agregarla aquí.']);
  private readonly positionInput = el('input', 'position-input', [], {
    type: 'number',
    min: '1',
    value: '1',
    'aria-label': 'Posición donde insertar',
  });
  private readonly addFirst: HTMLButtonElement;
  private readonly addLast: HTMLButtonElement;
  private readonly addNext: HTMLButtonElement;
  private readonly addAt: HTMLButtonElement;

  private lastPlaylist: Playlist | null = null;

  constructor(private readonly handlers: PlaylistHandlers) {
    this.addFirst = button('tool', 'Agregar al inicio', ['+ Al inicio'], () => handlers.onAddFirst());
    this.addLast = button('tool', 'Agregar al final', ['+ Al final'], () => handlers.onAddLast());
    this.addNext = button('tool', 'Agregar a continuación', ['+ Siguiente'], () => handlers.onAddNext());
    this.addAt = button('tool tool-wide','Agregar en la posición indicada', ['+ En posición'], () => {
      const requested = Math.floor(Number(this.positionInput.value));
      handlers.onAddAt(Number.isFinite(requested) ? requested - 1 : 0);
    });

    const bar = el('div', 'window-bar', [
      this.title,
      el('div', 'window-dots', [el('i'), el('i'), el('i', 'dot-hot')]),
    ]);
    const header = el('div', 'rows-head', [
      el('span', 'col-grip'),
      el('span', 'col-num', ['#']),
      el('span', 'col-cover'),
      el('span', 'col-title', ['TÍTULO']),
      el('span', 'col-time', ['DUR.']),
      el('span', 'col-actions'),
    ]);
    const footer = el('div', 'window-foot', [
      this.staged,
      el('div', 'tools', [this.addFirst, this.addLast, this.addNext, el('div', 'tool-at', [this.addAt, this.positionInput])]),
      el('p', 'hint', ['Arrastra las filas desde el asa para reordenarlas.']),
    ]);
    this.element.append(bar, this.tabs, header, this.rows, footer);
    this.setStaged(null);
  }

  render(playlist: Playlist): void {
    this.lastPlaylist = playlist;
    this.title.textContent = `${this.listName} · ${playlist.size} ${playlist.size === 1 ? 'canción' : 'canciones'}`;
    this.positionInput.max = String(playlist.size + 1);
    this.rows.replaceChildren();

    if (playlist.size === 0) {
      this.rows.append(el('div', 'empty', [
          el('strong', '', ['Aquí vive tu lista.']),
          el('span', '', ['1. Escribe una canción en el buscador de arriba.']),
          el('span', '', ['2. Toca “+” para mandarla al final, o “Elegir” para decidir dónde entra.']),
        ]));
      return;
    }

    let index = 0;
    for (const node of playlist.nodes()) {
      this.rows.append(this.buildRow(node, index, node === playlist.currentNode));
      index++;
    }
  }

  /** Draws one tab per playlist, plus the buttons to create, rename and delete. */
  setLists(entries: readonly PlaylistEntry[], activeId: string): void {
    this.listName = entries.find((entry) => entry.id === activeId)?.name ?? 'Mi lista';
    this.tabs.replaceChildren();
    for (const entry of entries) {
      const tab = button(
        `list-tab${entry.id === activeId ? ' is-active' : ''}`,
        `Abrir la playlist ${entry.name}`,
        [entry.name],
        () => this.handlers.onSelectList(entry.id),
      );
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(entry.id === activeId));
      this.tabs.append(tab);
    }
    this.tabs.append(
      button('list-tab list-new', 'Crear una playlist nueva', ['+ Nueva'], () => this.handlers.onCreateList()),
      button('list-mini', 'Renombrar la playlist abierta', ['Renombrar'], () => this.handlers.onRenameList()),
    );
    if (entries.length > 1) {
      this.tabs.append(button('list-mini list-del', 'Borrar la playlist abierta', ['Borrar'], () => this.handlers.onDeleteList()));
    }
  }

  /** Shows which song is waiting to be added and enables the add buttons. */
  setStaged(song: Song | null): void {
    const has = song !== null;
    this.addFirst.disabled = !has;
    this.addLast.disabled = !has;
    this.addNext.disabled = !has;
    this.addAt.disabled = !has;
    this.staged.classList.toggle('has-song', has);
    this.staged.replaceChildren();
    if (song) {
      this.staged.append(el('span', 'staged-tag', ['lista para agregar']), el('b', '', [song.title]), ` · ${song.artist}`);
    } else {
      this.staged.textContent = 'Busca una canción y elígela para agregarla aquí.';
    }
  }

  private buildRow(node: DoublyNode<Song>, index: number, active: boolean): HTMLElement {
    const song = node.value;
    const grip = el('button', 'grip', [icon('drag', 18)], { type: 'button', 'aria-label': `Mover ${song.title}`, title: 'Arrastra para reordenar' });
    grip.addEventListener('pointerdown', (event) => this.startDrag(event, index));

    const cover = el('div', 'cover');
    if (song.coverUrl) cover.style.backgroundImage = `url("${song.coverUrl}")`;

    const row = el('div', `row${active ? ' is-active' : ''}`, [
      grip,
      el('span', 'col-num', [String(index + 1).padStart(2, '0')]),
      cover,
      el('div', 'col-title', [el('div', 'song-title', [song.title]), el('div', 'song-artist', [song.artist])]),
      el('span', 'col-time', [formatTime(song.durationMs)]),
      el('div', 'col-actions', [
        button('mini', `Reproducir ${song.title} a continuación`, [icon('queue-next', 16)], (event) => {
          event.stopPropagation();
          this.handlers.onPlayNext(node);
        }),
        button('mini', `Quitar ${song.title}`, [icon('close', 14)], (event) => {
          event.stopPropagation();
          this.handlers.onRemove(node);
        }),
      ]),
    ], { role: 'listitem', tabindex: '0' });

    row.addEventListener('click', () => this.handlers.onPlay(node));
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.handlers.onPlay(node);
    });
    return row;
  }

  /* ---------- drag and drop (works with mouse and touch) ---------- */

  private startDrag(event: PointerEvent, from: number): void {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const rows = Array.from(this.rows.querySelectorAll<HTMLElement>('.row'));
    rows[from]?.classList.add('is-dragging');
    this.rows.classList.add('is-sorting');

    let slot = from;
    const indicator = el('div', 'drop-line');
    this.rows.append(indicator);

    const place = (clientY: number): void => {
      const box = this.rows.getBoundingClientRect();
      // Scroll the list when the pointer is near its top or bottom edge.
      if (clientY < box.top + 28) this.rows.scrollTop -= 12;
      else if (clientY > box.bottom - 28) this.rows.scrollTop += 12;

      slot = rows.length;
      for (let i = 0; i < rows.length; i++) {
        const rect = rows[i].getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) {
          slot = i;
          break;
        }
      }
      const reference = slot < rows.length ? rows[slot] : rows[rows.length - 1];
      const top = slot < rows.length ? reference.offsetTop : reference.offsetTop + reference.offsetHeight;
      indicator.style.top = `${top}px`;
    };
    place(event.clientY);

    const onMove = (moveEvent: PointerEvent): void => place(moveEvent.clientY);
    const finish = (commit: boolean): void => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onCancel);
      indicator.remove();
      rows[from]?.classList.remove('is-dragging');
      this.rows.classList.remove('is-sorting');
      if (!commit) return;
      // Dropping below the original spot shifts everything up by one.
      const target = slot > from ? slot - 1 : slot;
      if (target !== from && this.lastPlaylist) this.handlers.onMove(from, target);
    };
    const onUp = (): void => finish(true);
    const onCancel = (): void => finish(false);

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onCancel);
  }
}
