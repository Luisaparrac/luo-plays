import { DoublyLinkedList } from './DoublyLinkedList';
import { DoublyNode } from './DoublyNode';
import { Observable } from './Observable';
import type { Song } from './Song';

export type RepeatMode = 'off' | 'all' | 'one';

export interface RemovalResult {
  wasCurrent: boolean;
  /** The song that took over as current, if the removed one was playing. */
  successor: Song | null;
}

const MAX_HISTORY = 200;

/**
 * The play queue. It wraps a doubly linked list and adds the idea of a
 * "current" song, a real listening history, shuffle and repeat.
 */
export class Playlist {
  /** Fires after every change so the interface can redraw. */
  readonly changed = new Observable<void>();

  private readonly list = new DoublyLinkedList<Song>();
  private cursor: DoublyNode<Song> | null = null;
  private history: DoublyNode<Song>[] = [];
  private shuffleOn = false;
  private repeatMode: RepeatMode = 'off';

  /** The random source can be swapped in tests to get predictable shuffles. */
  constructor(private readonly random: () => number = Math.random) {}

  get size(): number {
    return this.list.size;
  }

  get current(): Song | null {
    return this.cursor ? this.cursor.value : null;
  }

  get currentNode(): DoublyNode<Song> | null {
    return this.cursor;
  }

  get currentIndex(): number {
    return this.cursor ? this.list.indexOf(this.cursor) : -1;
  }

  get shuffle(): boolean {
    return this.shuffleOn;
  }

  get repeat(): RepeatMode {
    return this.repeatMode;
  }

  get songs(): Song[] {
    return this.list.toArray();
  }

  indexOf(node: DoublyNode<Song>): number {
    return this.list.indexOf(node);
  }

  nodes(): Generator<DoublyNode<Song>> {
    return this.list.nodes();
  }

  /* ---------- adding ---------- */

  addFirst(song: Song): DoublyNode<Song> {
    return this.afterInsert(this.list.addFirst(song));
  }

  addLast(song: Song): DoublyNode<Song> {
    return this.afterInsert(this.list.addLast(song));
  }

  /** Inserts at a zero-based position. Out-of-range values are clamped. */
  insertAt(index: number, song: Song): DoublyNode<Song> {
    const safe = Math.max(0, Math.min(index, this.list.size));
    return this.afterInsert(this.list.insertAt(safe, song));
  }

  /** "Play next": puts the song right after the current one. */
  playNext(song: Song): DoublyNode<Song> {
    if (!this.cursor) return this.addFirst(song);
    return this.afterInsert(this.list.insertAfter(this.cursor, song));
  }

  /* ---------- removing and reordering ---------- */

  remove(node: DoublyNode<Song>): RemovalResult {
    const wasCurrent = node === this.cursor;
    const successor = wasCurrent ? node.next ?? node.prev : null;
    this.history = this.history.filter((entry) => entry !== node);
    this.list.remove(node);
    if (wasCurrent) this.cursor = successor;
    this.changed.emit();
    return { wasCurrent, successor: successor ? successor.value : null };
  }

  /** Moves the song at `from` so it ends up at index `to`. */
  move(from: number, to: number): void {
    if (from === to) return;
    this.list.move(this.list.nodeAt(from), to);
    this.changed.emit();
  }

  clear(): void {
    this.list.clear();
    this.cursor = null;
    this.history = [];
    this.changed.emit();
  }

  /** Swaps the whole queue, used when loading a saved or shared list. */
  replaceAll(songs: Song[], currentIndex = 0): void {
    this.list.clear();
    this.history = [];
    this.cursor = null;
    for (const song of songs) this.list.addLast(song);
    if (this.list.size > 0) {
      const safe = Math.max(0, Math.min(currentIndex, this.list.size - 1));
      this.cursor = this.list.nodeAt(safe);
    }
    this.changed.emit();
  }

  /* ---------- navigation ---------- */

  /** Makes a node the current one and remembers where we came from. */
  select(node: DoublyNode<Song>): Song {
    if (!this.list.contains(node)) {
      throw new Error('That song is not in the playlist');
    }
    if (this.cursor && this.cursor !== node) this.remember(this.cursor);
    this.cursor = node;
    this.changed.emit();
    return node.value;
  }

  /**
   * Moves forward. `auto` is true when a song ended by itself, which is the
   * only case where "repeat one" keeps the same song.
   */
  next(auto = false): Song | null {
    const current = this.cursor;
    if (!current) return null;

    if (auto && this.repeatMode === 'one') {
      this.changed.emit();
      return current.value;
    }

    let target: DoublyNode<Song> | null;
    if (this.shuffleOn && this.list.size > 1) {
      target = this.pickRandomExcept(current);
    } else {
      target = current.next ?? (this.repeatMode === 'all' ? this.list.head : null);
    }
    if (!target) return null;

    if (target === current) {
      this.changed.emit();
      return current.value;
    }
    this.remember(current);
    this.cursor = target;
    this.changed.emit();
    return target.value;
  }

  /**
   * Goes back to the song that was really played before, falling back to the
   * previous node when there is no history. At the very start it returns the
   * current song so the caller can restart it.
   */
  previous(): Song | null {
    const current = this.cursor;
    if (!current) return null;

    let target: DoublyNode<Song> | null = null;
    while (this.history.length > 0) {
      const candidate = this.history.pop() as DoublyNode<Song>;
      if (this.list.contains(candidate)) {
        target = candidate;
        break;
      }
    }
    if (!target) {
      target = current.prev ?? (this.repeatMode === 'all' ? this.list.tail : null);
    }
    if (!target) return current.value;

    this.cursor = target;
    this.changed.emit();
    return target.value;
  }

  /* ---------- modes ---------- */

  toggleShuffle(): boolean {
    this.shuffleOn = !this.shuffleOn;
    this.changed.emit();
    return this.shuffleOn;
  }

  setShuffle(on: boolean): void {
    this.shuffleOn = on;
    this.changed.emit();
  }

  cycleRepeat(): RepeatMode {
    const order: RepeatMode[] = ['off', 'all', 'one'];
    this.repeatMode = order[(order.indexOf(this.repeatMode) + 1) % order.length];
    this.changed.emit();
    return this.repeatMode;
  }

  setRepeat(mode: RepeatMode): void {
    this.repeatMode = mode;
    this.changed.emit();
  }

  /* ---------- internals ---------- */

  private afterInsert(node: DoublyNode<Song>): DoublyNode<Song> {
    if (!this.cursor) this.cursor = node;
    this.changed.emit();
    return node;
  }

  private remember(node: DoublyNode<Song>): void {
    this.history.push(node);
    if (this.history.length > MAX_HISTORY) this.history.shift();
  }

  private pickRandomExcept(excluded: DoublyNode<Song>): DoublyNode<Song> | null {
    const candidates: DoublyNode<Song>[] = [];
    for (const node of this.list.nodes()) {
      if (node !== excluded) candidates.push(node);
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(this.random() * candidates.length)];
  }
}
