import { Song } from '../../domain/Song';
import type { SongSource } from '../../domain/Song';
import type { SpotifyApi } from '../auth/SpotifyApi';
import type { MusicProvider } from './MusicProvider';

interface SpotifyTrackDto {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  artists: Array<{ name: string }>;
  album: { name: string; images: Array<{ url: string; width: number | null }> };
}

interface SpotifySearchDto {
  tracks: { items: Array<SpotifyTrackDto | null> };
}

/** Searches the Spotify catalogue. Playback is handled elsewhere. */
export class SpotifyProvider implements MusicProvider {
  readonly source: SongSource = 'spotify';

  /** Spotify limits search pages to 10 results for apps in development mode. */
  private static readonly PAGE_SIZE = 10;

  constructor(private readonly api: SpotifyApi) {}

  async search(query: string, offset = 0): Promise<Song[]> {
    const text = query.trim();
    if (!text) return [];
    const params = new URLSearchParams({
      q: text,
      type: 'track',
      limit: String(SpotifyProvider.PAGE_SIZE),
      offset: String(offset),
      market: 'from_token',
    });
    const data = await this.api.get<SpotifySearchDto>(`/search?${params.toString()}`);
    return data.tracks.items.filter((item): item is SpotifyTrackDto => item !== null).map(toSong);
  }

  async getById(id: string): Promise<Song | null> {
    try {
      const track = await this.api.get<SpotifyTrackDto>(`/tracks/${encodeURIComponent(id)}?market=from_token`);
      return toSong(track);
    } catch {
      return null;
    }
  }

  async findBest(title: string, artist: string): Promise<Song | null> {
    const attempts = [`track:${title} artist:${artist}`, `${title} ${artist}`];
    for (const query of attempts) {
      const params = new URLSearchParams({ q: query, type: 'track', limit: '1', market: 'from_token' });
      try {
        const data = await this.api.get<SpotifySearchDto>(`/search?${params.toString()}`);
        const first = data.tracks.items.find((item): item is SpotifyTrackDto => item !== null);
        if (first) return toSong(first);
      } catch {
        // try the looser query next
      }
    }
    return null;
  }
}

function toSong(track: SpotifyTrackDto): Song {
  // Pick a mid-sized cover: big enough for the vinyl label, light enough to load fast.
  const images = [...track.album.images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  const cover = images.find((image) => (image.width ?? 0) <= 340) ?? images[0];
  return new Song({
    source: 'spotify',
    id: track.id,
    title: track.name,
    artist: track.artists.map((artist) => artist.name).join(', '),
    album: track.album.name,
    coverUrl: cover ? cover.url : '',
    durationMs: track.duration_ms,
    playUri: track.uri,
  });
}
