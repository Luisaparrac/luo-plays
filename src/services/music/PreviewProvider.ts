import { Song } from '../../domain/Song';
import type { SongSource } from '../../domain/Song';
import type { MusicProvider } from './MusicProvider';

interface ItunesTrackDto {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  kind?: string;
}

interface ItunesResponse {
  results: ItunesTrackDto[];
}

/**
 * Finds songs through the public iTunes Search API, which needs no key and
 * returns 30-second previews. It is the mode for visitors without Spotify.
 * Requests use JSONP, so they never fail because of CORS.
 */
export class PreviewProvider implements MusicProvider {
  readonly source: SongSource = 'preview';

  private static readonly PAGE_SIZE = 10;
  private readonly cache = new Map<string, Song[]>();

  async search(query: string, offset = 0): Promise<Song[]> {
    const text = query.trim();
    if (!text) return [];
    let all = this.cache.get(text);
    if (!all) {
      const params = new URLSearchParams({ term: text, media: 'music', entity: 'song', limit: '50' });
      const data = await jsonp<ItunesResponse>(`https://itunes.apple.com/search?${params.toString()}`);
      all = data.results.map(toSong).filter((song): song is Song => song !== null);
      this.cache.set(text, all);
    }
    return all.slice(offset, offset + PreviewProvider.PAGE_SIZE);
  }

  async getById(id: string): Promise<Song | null> {
    try {
      const data = await jsonp<ItunesResponse>(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}`);
      const first = data.results.map(toSong).find((song): song is Song => song !== null);
      return first ?? null;
    } catch {
      return null;
    }
  }

  async findBest(title: string, artist: string): Promise<Song | null> {
    try {
      const results = await this.search(`${title} ${artist}`);
      return results[0] ?? null;
    } catch {
      return null;
    }
  }
}

function toSong(track: ItunesTrackDto): Song | null {
  if (!track.previewUrl || track.trackId === undefined) return null;
  return new Song({
    source: 'preview',
    id: String(track.trackId),
    title: track.trackName,
    artist: track.artistName,
    album: track.collectionName ?? '',
    coverUrl: track.artworkUrl100 ? track.artworkUrl100.replace('100x100', '400x400') : '',
    durationMs: 30000,
    playUri: track.previewUrl,
  });
}

function jsonp<T>(url: string, timeoutMs = 8000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const callbackName = `__luoPlays_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const registry = window as unknown as Record<string, unknown>;
    const script = document.createElement('script');

    const cleanup = (): void => {
      delete registry[callbackName];
      script.remove();
      window.clearTimeout(timer);
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('La búsqueda tardó demasiado.'));
    }, timeoutMs);

    registry[callbackName] = (data: T) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('No se pudo conectar con el buscador.'));
    };
    script.src = `${url}${url.includes('?') ? '&' : '?'}callback=${callbackName}`;
    document.head.append(script);
  });
}
