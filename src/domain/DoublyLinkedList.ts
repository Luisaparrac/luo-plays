import { DoublyNode } from './DoublyNode';

/**
 * A classic doubly linked list. Each node knows its neighbours, so adding,
 * removing or moving a song only rewires a few pointers and never shifts
 * the rest of the list.
 */
export class DoublyLinkedList<T> implements Iterable<T> {
  private first: DoublyNode<T> | null = null;
  private last: DoublyNode<T> | null = null;
  private length = 0;

  get head(): DoublyNode<T> | null {
    return this.first;
  }

  get tail(): DoublyNode<T> | null {
    return this.last;
  }

  get size(): number {
    return this.length;
  }

  addFirst(value: T): DoublyNode<T> {
    const node = new DoublyNode(value, this);
    this.linkBefore(this.first, node);
    return node;
  }

  addLast(value: T): DoublyNode<T> {
    const node = new DoublyNode(value, this);
    this.linkBefore(null, node);
    return node;
  }

  /** Inserts so the new value ends up at `index` (0 = first, size = last). */
  insertAt(index: number, value: T): DoublyNode<T> {
    if (index < 0 || index > this.length) {
      throw new RangeError(`Index ${index} is outside 0..${this.length}`);
    }
    const reference = index === this.length ? null : this.nodeAt(index);
    const node = new DoublyNode(value, this);
    this.linkBefore(reference, node);
    return node;
  }

  insertAfter(reference: DoublyNode<T>, value: T): DoublyNode<T> {
    this.assertOwns(reference);
    const node = new DoublyNode(value, this);
    this.linkBefore(reference.next, node);
    return node;
  }

  /** Walks from whichever end is closer to the index. */
  nodeAt(index: number): DoublyNode<T> {
    if (index < 0 || index >= this.length) {
      throw new RangeError(`Index ${index} is outside 0..${this.length - 1}`);
    }
    let node: DoublyNode<T>;
    if (index < this.length / 2) {
      node = this.first as DoublyNode<T>;
      for (let i = 0; i < index; i++) node = node.next as DoublyNode<T>;
    } else {
      node = this.last as DoublyNode<T>;
      for (let i = this.length - 1; i > index; i--) node = node.prev as DoublyNode<T>;
    }
    return node;
  }

  indexOf(node: DoublyNode<T>): number {
    if (!this.contains(node)) return -1;
    let index = 0;
    for (let cursor = this.first; cursor; cursor = cursor.next) {
      if (cursor === node) return index;
      index++;
    }
    return -1;
  }

  contains(node: DoublyNode<T>): boolean {
    return node.owner === this;
  }

  remove(node: DoublyNode<T>): T {
    this.assertOwns(node);
    this.unlink(node);
    return node.value;
  }

  /** Moves an existing node so it ends up at `targetIndex` of the final list. */
  move(node: DoublyNode<T>, targetIndex: number): void {
    this.assertOwns(node);
    if (targetIndex < 0 || targetIndex >= this.length) {
      throw new RangeError(`Index ${targetIndex} is outside 0..${this.length - 1}`);
    }
    if (this.indexOf(node) === targetIndex) return;
    this.unlink(node);
    const reference = targetIndex >= this.length ? null : this.nodeAt(targetIndex);
    this.linkBefore(reference, node);
  }

  clear(): void {
    for (let node = this.first; node; ) {
      const following = node.next;
      node.prev = null;
      node.next = null;
      node.owner = null;
      node = following;
    }
    this.first = null;
    this.last = null;
    this.length = 0;
  }

  toArray(): T[] {
    return [...this];
  }

  *nodes(): Generator<DoublyNode<T>> {
    for (let node = this.first; node; node = node.next) {
      yield node;
    }
  }

  [Symbol.iterator](): Iterator<T> {
    const walker = this.nodes();
    return {
      next: (): IteratorResult<T> => {
        const step = walker.next();
        return step.done ? { done: true, value: undefined } : { done: false, value: step.value.value };
      },
    };
  }

  /** Puts `node` right before `reference`. A null reference means "at the end". */
  private linkBefore(reference: DoublyNode<T> | null, node: DoublyNode<T>): void {
    node.owner = this;
    if (reference === null) {
      node.prev = this.last;
      node.next = null;
      if (this.last) this.last.next = node;
      else this.first = node;
      this.last = node;
    } else {
      node.next = reference;
      node.prev = reference.prev;
      if (reference.prev) reference.prev.next = node;
      else this.first = node;
      reference.prev = node;
    }
    this.length++;
  }

  private unlink(node: DoublyNode<T>): void {
    if (node.prev) node.prev.next = node.next;
    else this.first = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.last = node.prev;
    node.prev = null;
    node.next = null;
    node.owner = null;
    this.length--;
  }

  private assertOwns(node: DoublyNode<T>): void {
    if (!this.contains(node)) {
      throw new Error('That node does not belong to this list');
    }
  }
}
