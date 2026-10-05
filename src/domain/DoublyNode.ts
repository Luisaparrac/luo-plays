import type { DoublyLinkedList } from './DoublyLinkedList';

/**
 * One link of the chain. It keeps a pointer to the node before it and the
 * node after it, plus a reference to the list that owns it so a list can
 * refuse nodes that belong somewhere else.
 */
export class DoublyNode<T> {
  prev: DoublyNode<T> | null = null;
  next: DoublyNode<T> | null = null;

  constructor(
    public value: T,
    public owner: DoublyLinkedList<T> | null,
  ) {}
}
