import type { DoublyNode } from '../domain/DoublyNode';
import type { Playlist } from '../domain/Playlist';
import type { Song } from '../domain/Song';
import { el } from './dom';

/**
 * A strip that walks the real prev/next links around the current song,
 * so you can see the chain the playlist is built on.
 */
export class QueueView {
  readonly element = el('section', 'queue');

  private readonly chain = el('div', 'chain');

  constructor(private readonly onSelect: (node: DoublyNode<Song>) => void) {
    this.element.append(el('div', 'paper-label', ['cola de reproducción']), this.chain);
  }

  render(playlist: Playlist): void {
    this.chain.replaceChildren();
    const current = playlist.currentNode;
    if (!current) {
      this.chain.append(el('p', 'empty', ['Cuando agregues canciones, aquí verás cómo se enlazan.']));
      return;
    }

    const before: DoublyNode<Song>[] = [];
    let cursor = current.prev;
    while (cursor && before.length < 2) {
      before.unshift(cursor);
      cursor = cursor.prev;
    }
    const hiddenBefore = cursor !== null;

    const after: DoublyNode<Song>[] = [];
    cursor = current.next;
    while (cursor && after.length < 2) {
      after.push(cursor);
      cursor = cursor.next;
    }
    const hiddenAfter = cursor !== null;

    const numbering = playlist.currentIndex - before.length;
    this.chain.append(el('span', hiddenBefore ? 'chain-more' : 'chain-end', [hiddenBefore ? '…' : '']));

    const line = [...before, current, ...after];
    line.forEach((node, offset) => {
      const active = node === current;
      const tag = String(numbering + offset + 1).padStart(2, '0');
      const card = el('button', `link${active ? ' is-active' : ''}`, [
        el('span', 'link-tag', [active ? `${tag} · SONANDO` : tag]),
        el('span', 'link-title', [node.value.title]),
      ], { type: 'button', 'aria-label': `Ir a ${node.value.title}` });
      card.addEventListener('click', () => this.onSelect(node));
      this.chain.append(card);
      if (offset < line.length - 1) this.chain.append(arrows());
    });

    this.chain.append(el('span', hiddenAfter ? 'chain-more' : 'chain-end', [hiddenAfter ? '…' : '']));
  }
}

function arrows(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 52 24');
  svg.setAttribute('class', 'arrows');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML =
    '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h40M40 3l6 5-6 5M46 16H6M12 11l-6 5 6 5"/></g>';
  return svg;
}
