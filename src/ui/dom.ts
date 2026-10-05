type Child = Node | string | null | undefined | false;

/** Creates an element with a class, children and attributes in one go. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  children: Child[] = [],
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

/** A button with an accessible label. */
export function button(className: string, label: string, children: Child[], onClick: (event: MouseEvent) => void): HTMLButtonElement {
  const node = el('button', className, children, { type: 'button', 'aria-label': label, title: label });
  node.addEventListener('click', onClick);
  return node;
}

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export type IconName =
  | 'search'
  | 'link'
  | 'prev'
  | 'next'
  | 'play'
  | 'pause'
  | 'shuffle'
  | 'repeat'
  | 'mic'
  | 'close'
  | 'drag'
  | 'queue-next'
  | 'plus'
  | 'volume'
  | 'logout'
  | 'back';

const ICONS: Record<IconName, string> = {
  search: '<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  link: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></g>',
  prev: '<path d="M6 5h2v14H6zM20 5v14L9 12z" fill="currentColor"/>',
  next: '<path d="M16 5h2v14h-2zM4 5v14l11-7z" fill="currentColor"/>',
  play: '<path d="M7 4v16l13-8z" fill="currentColor"/>',
  pause: '<path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor"/>',
  shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  repeat: '<path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  mic: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/></g>',
  close: '<path d="M5 5l14 14M19 5L5 19" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  drag: '<g fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></g>',
  'queue-next': '<g fill="currentColor"><path d="M4 6h10v2H4zM4 11h10v2H4zM4 16h6v2H4z"/><path d="M16 13l5 3.5-5 3.5z"/></g>',
  plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  volume: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></g>',
  logout: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9"/></g>',
  back: '<path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
};

export function icon(name: IconName, size = 20): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name];
  return svg;
}

/** The four-pointed sparkle used as a sticker all over the interface. */
export function sparkle(className: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z" fill="currentColor"/>';
  return svg;
}

/** Short-lived message at the bottom of the screen. */
export class Toaster {
  private readonly host = el('div', 'toasts', [], { role: 'status', 'aria-live': 'polite' });

  constructor(parent: HTMLElement) {
    parent.append(this.host);
  }

  show(message: string, kind: 'info' | 'error' = 'info'): void {
    const toast = el('div', `toast toast-${kind}`, [message]);
    this.host.append(toast);
    window.setTimeout(() => toast.classList.add('toast-out'), 3200);
    window.setTimeout(() => toast.remove(), 3700);
  }
}
