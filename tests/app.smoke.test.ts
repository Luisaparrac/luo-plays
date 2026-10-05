// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

/** Minimal stand-ins for browser features jsdom does not ship. */
class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

function installBrowserStubs(): void {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  HTMLCanvasElement.prototype.getContext = (() => ({
    setTransform: () => {},
    clearRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    drawImage: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(0) }),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLMediaElement.prototype.play = (() => Promise.resolve()) as typeof HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.pause = (() => {}) as typeof HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.load = (() => {}) as typeof HTMLMediaElement.prototype.load;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('seed-catalog')) return { ok: true, json: async () => ({ tracks: [] }) };
      return { ok: false, status: 404, json: async () => ({}) };
    }),
  );
}

const savedSongs = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({
  source: 'preview',
  id,
  title: `Song ${id.toUpperCase()}`,
  artist: 'Test Band',
  album: 'Demo',
  coverUrl: '',
  durationMs: 30000,
  playUri: `https://example.com/${id}.mp3`,
}));

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('app smoke test (preview mode)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    installBrowserStubs();
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    root = document.getElementById('app') as HTMLElement;
  });

  it('shows the login screen first', async () => {
    await new App(root).start();
    expect(root.querySelector('.login')).not.toBeNull();
    const labels = Array.from(root.querySelectorAll('button')).map((b) => b.getAttribute('aria-label'));
    expect(labels).toContain('Entrar con Spotify Premium');
    expect(labels).toContain('Entrar sin Spotify');
  });

  it('opens an empty player after choosing the preview mode', async () => {
    await new App(root).start();
    (root.querySelector('button[aria-label="Entrar sin Spotify"]') as HTMLButtonElement).click();
    await settle();
    expect(root.querySelector('.deck')).not.toBeNull();
    expect(root.querySelector('.window')).not.toBeNull();
    expect(root.querySelector('.queue')).not.toBeNull();
    expect(root.querySelector('.rows .empty')).not.toBeNull();
    expect(localStorage.getItem('luo-plays.mode')).toBe('preview');
  });

  it('restores a saved list and draws rows, the chain and the vinyl', async () => {
    localStorage.setItem('luo-plays.mode', 'preview');
    localStorage.setItem(
      'luo-plays.state.v1',
      JSON.stringify({ songs: savedSongs, currentIndex: 2, shuffle: false, repeat: 'all', volume: 0.5 }),
    );
    await new App(root).start();
    await settle();

    expect(root.querySelectorAll('.row').length).toBe(6);
    expect(root.querySelector('.row.is-active .song-title')?.textContent).toBe('Song C');
    expect(root.querySelector('.lcd-title span')?.textContent).toBe('SONG C — TEST BAND');
    expect(root.querySelector('.lcd-count')?.textContent).toBe('3 / 6');
    // The chain shows two neighbours on each side of the current song.
    expect(root.querySelectorAll('.link').length).toBe(5);
    expect(root.querySelector('.link.is-active .link-title')?.textContent).toBe('Song C');
    expect(root.querySelector('.vinyl-label')).not.toBeNull();
    expect(root.querySelector('.tonearm')).not.toBeNull();
  });

  it('starts playing on play and moves on with next', async () => {
    localStorage.setItem('luo-plays.mode', 'preview');
    localStorage.setItem(
      'luo-plays.state.v1',
      JSON.stringify({ songs: savedSongs, currentIndex: 0, shuffle: false, repeat: 'off', volume: 0.8 }),
    );
    await new App(root).start();
    await settle();

    (root.querySelector('button[aria-label="Canción siguiente"]') as HTMLButtonElement).click();
    await settle();
    expect(root.querySelector('.row.is-active .song-title')?.textContent).toBe('Song B');
    expect(root.querySelector('.lcd-count')?.textContent).toBe('2 / 6');

    (root.querySelector('button[aria-label="Canción anterior"]') as HTMLButtonElement).click();
    await settle();
    expect(root.querySelector('.row.is-active .song-title')?.textContent).toBe('Song A');
  });

  it('removes a song and hands over to the next one', async () => {
    localStorage.setItem('luo-plays.mode', 'preview');
    localStorage.setItem(
      'luo-plays.state.v1',
      JSON.stringify({ songs: savedSongs, currentIndex: 0, shuffle: false, repeat: 'off', volume: 0.8 }),
    );
    await new App(root).start();
    await settle();

    (root.querySelector('button[aria-label="Quitar Song A"]') as HTMLButtonElement).click();
    await settle();
    expect(root.querySelectorAll('.row').length).toBe(5);
    expect(root.querySelector('.row.is-active .song-title')?.textContent).toBe('Song B');
  });

  it('turns the "play next" button into a real move', async () => {
    localStorage.setItem('luo-plays.mode', 'preview');
    localStorage.setItem(
      'luo-plays.state.v1',
      JSON.stringify({ songs: savedSongs, currentIndex: 0, shuffle: false, repeat: 'off', volume: 0.8 }),
    );
    await new App(root).start();
    await settle();

    (root.querySelector('button[aria-label="Reproducir Song E a continuación"]') as HTMLButtonElement).click();
    await settle();
    const order = Array.from(root.querySelectorAll('.row .song-title')).map((n) => n.textContent);
    expect(order).toEqual(['Song A', 'Song E', 'Song B', 'Song C', 'Song D', 'Song F']);
  });

  it('creates a second playlist, keeps both separate and switches back', async () => {
    localStorage.setItem('luo-plays.mode', 'preview');
    localStorage.setItem(
      'luo-plays.state.v1',
      JSON.stringify({ songs: savedSongs, currentIndex: 0, shuffle: false, repeat: 'off', volume: 0.8 }),
    );
    vi.stubGlobal('prompt', () => 'Gym');
    await new App(root).start();
    await settle();

    (root.querySelector('button[aria-label="Crear una playlist nueva"]') as HTMLButtonElement).click();
    await settle();
    expect(root.querySelectorAll('.list-tab:not(.list-new)').length).toBe(2);
    expect(root.querySelector('.list-tab.is-active')?.textContent).toBe('Gym');
    expect(root.querySelectorAll('.row').length).toBe(0);
    expect(root.querySelector('.rows .empty')).not.toBeNull();

    (root.querySelector('button[aria-label="Abrir la playlist Mi lista"]') as HTMLButtonElement).click();
    await settle();
    expect(root.querySelectorAll('.row').length).toBe(6);
    expect(root.querySelector('.paper-label')?.textContent).toBe('Mi lista · 6 canciones');
  });

  it('shows a clear message when the Spotify Client ID is missing', async () => {
    await new App(root).start();
    expect(root.querySelector('.login-message')?.textContent).toContain('Client ID');
  });
});
