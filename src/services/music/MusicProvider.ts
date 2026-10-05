import type { Song, SongSource } from '../../domain/Song';

/**
 * Anything that can find songs. The app only talks to this interface, so
 * Spotify and the 30-second previews are interchangeable.
 */
export interface MusicProvider {
  readonly source: SongSource;

  /** Searches by free text. `offset` is used for "load more". */
  search(query: string, offset?: number): Promise<Song[]>;

  /** Looks a song up by the id it has in this source. */
  getById(id: string): Promise<Song | null>;

  /** Best single match for a title and artist, or null. */
  findBest(title: string, artist: string): Promise<Song | null>;
}
