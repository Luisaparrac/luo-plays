import { describe, expect, it } from 'vitest';
import { DoublyLinkedList } from '../src/domain/DoublyLinkedList';

function listOf(...values: string[]): DoublyLinkedList<string> {
  const list = new DoublyLinkedList<string>();
  values.forEach((value) => list.addLast(value));
  return list;
}

/** Walks the chain both ways to make sure every prev/next pair agrees. */
function expectHealthy(list: DoublyLinkedList<string>): void {
  const forward: string[] = [];
  for (let node = list.head; node; node = node.next) {
    forward.push(node.value);
    if (node.next) expect(node.next.prev).toBe(node);
  }
  const backward: string[] = [];
  for (let node = list.tail; node; node = node.prev) backward.push(node.value);
  expect(backward.reverse()).toEqual(forward);
  expect(forward.length).toBe(list.size);
  expect(list.head?.prev ?? null).toBeNull();
  expect(list.tail?.next ?? null).toBeNull();
}

describe('DoublyLinkedList', () => {
  it('adds at the start and the end', () => {
    const list = listOf('b');
    list.addFirst('a');
    list.addLast('c');
    expect(list.toArray()).toEqual(['a', 'b', 'c']);
    expectHealthy(list);
  });

  it('inserts at any position', () => {
    const list = listOf('a', 'c');
    list.insertAt(1, 'b');
    list.insertAt(0, 'start');
    list.insertAt(4, 'end');
    expect(list.toArray()).toEqual(['start', 'a', 'b', 'c', 'end']);
    expectHealthy(list);
  });

  it('rejects positions outside the list', () => {
    const list = listOf('a');
    expect(() => list.insertAt(3, 'x')).toThrow(RangeError);
    expect(() => list.insertAt(-1, 'x')).toThrow(RangeError);
    expect(() => list.nodeAt(1)).toThrow(RangeError);
  });

  it('removes from the head, the middle and the tail', () => {
    const list = listOf('a', 'b', 'c', 'd');
    list.remove(list.nodeAt(1));
    expect(list.toArray()).toEqual(['a', 'c', 'd']);
    list.remove(list.head!);
    list.remove(list.tail!);
    expect(list.toArray()).toEqual(['c']);
    expectHealthy(list);
    list.remove(list.head!);
    expect(list.size).toBe(0);
    expect(list.head).toBeNull();
    expect(list.tail).toBeNull();
  });

  it('refuses nodes from another list', () => {
    const first = listOf('a');
    const second = listOf('b');
    expect(() => first.remove(second.head!)).toThrow();
  });

  it('moves a node forward and backward', () => {
    const list = listOf('a', 'b', 'c', 'd', 'e');
    list.move(list.nodeAt(0), 3);
    expect(list.toArray()).toEqual(['b', 'c', 'd', 'a', 'e']);
    list.move(list.nodeAt(4), 0);
    expect(list.toArray()).toEqual(['e', 'b', 'c', 'd', 'a']);
    list.move(list.nodeAt(2), 4);
    expect(list.toArray()).toEqual(['e', 'b', 'd', 'a', 'c']);
    expectHealthy(list);
  });

  it('finds nodes from the closest end', () => {
    const list = listOf('a', 'b', 'c', 'd', 'e', 'f');
    expect(list.nodeAt(0).value).toBe('a');
    expect(list.nodeAt(2).value).toBe('c');
    expect(list.nodeAt(3).value).toBe('d');
    expect(list.nodeAt(5).value).toBe('f');
  });

  it('reports the index of a node', () => {
    const list = listOf('a', 'b', 'c');
    expect(list.indexOf(list.nodeAt(2))).toBe(2);
    const stray = listOf('z').head!;
    expect(list.indexOf(stray)).toBe(-1);
  });

  it('clears everything', () => {
    const list = listOf('a', 'b');
    const node = list.head!;
    list.clear();
    expect(list.size).toBe(0);
    expect(list.contains(node)).toBe(false);
  });
});
