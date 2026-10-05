import { describe, expect, it } from 'vitest';
import { Playlist } from '../src/domain/Playlist';
import { Song } from '../src/domain/Song';

function song(id: string): Song {
  return new Song({
    source: 'preview',
    id,
    title: `Song ${id}`,
    artist: 'Test',
    album: '',
    coverUrl: '',
    durationMs: 30000,
    playUri: `https://example.com/${id}.mp3`,
  });
}

function playlistOf(...ids: string[]): Playlist {
  const playlist = new Playlist();
  ids.forEach((id) => playlist.addLast(song(id)));
  return playlist;
}

const titles = (playlist: Playlist): string[] => playlist.songs.map((s) => s.id);

describe('Playlist', () => {
  it('makes the first added song the current one', () => {
    const playlist = playlistOf('a', 'b');
    expect(playlist.current?.id).toBe('a');
  });

  it('adds at the start, end and a position', () => {
    const playlist = playlistOf('b', 'd');
    playlist.addFirst(song('a'));
    playlist.addLast(song('e'));
    playlist.insertAt(2, song('c'));
    expect(titles(playlist)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('clamps an out-of-range position instead of failing', () => {
    const playlist = playlistOf('a');
    playlist.insertAt(99, song('z'));
    playlist.insertAt(-5, song('y'));
    expect(titles(playlist)).toEqual(['y', 'a', 'z']);
  });

  it('puts "play next" right after the current song', () => {
    const playlist = playlistOf('a', 'b', 'c');
    playlist.select(playlist.currentNode!.next!);
    playlist.playNext(song('x'));
    expect(titles(playlist)).toEqual(['a', 'b', 'x', 'c']);
  });

  it('goes forward and stops at the end', () => {
    const playlist = playlistOf('a', 'b');
    expect(playlist.next()?.id).toBe('b');
    expect(playlist.next()).toBeNull();
    expect(playlist.current?.id).toBe('b');
  });

  it('wraps around with repeat all', () => {
    const playlist = playlistOf('a', 'b');
    playlist.setRepeat('all');
    playlist.next();
    expect(playlist.next()?.id).toBe('a');
  });

  it('keeps the same song with repeat one only when it ends by itself', () => {
    const playlist = playlistOf('a', 'b');
    playlist.setRepeat('one');
    expect(playlist.next(true)?.id).toBe('a');
    expect(playlist.next(false)?.id).toBe('b');
  });

  it('goes back through the real history', () => {
    const playlist = playlistOf('a', 'b', 'c', 'd');
    playlist.select(playlist.currentNode!.next!.next!); // jump a -> c
    playlist.next(); // c -> d
    expect(playlist.previous()?.id).toBe('c');
    expect(playlist.previous()?.id).toBe('a'); // history, not the neighbour "b"
  });

  it('falls back to the previous node when there is no history', () => {
    const playlist = playlistOf('a', 'b', 'c');
    playlist.replaceAll(playlist.songs, 2);
    expect(playlist.previous()?.id).toBe('b');
  });

  it('restarts the first song when going back from the very start', () => {
    const playlist = playlistOf('a', 'b');
    expect(playlist.previous()?.id).toBe('a');
  });

  it('moves songs and keeps the current one', () => {
    const playlist = playlistOf('a', 'b', 'c', 'd');
    playlist.select(playlist.currentNode!.next!); // current = b
    playlist.move(0, 3);
    expect(titles(playlist)).toEqual(['b', 'c', 'd', 'a']);
    expect(playlist.current?.id).toBe('b');
  });

  it('hands over to the next song when the current one is removed', () => {
    const playlist = playlistOf('a', 'b', 'c');
    const result = playlist.remove(playlist.currentNode!);
    expect(result.wasCurrent).toBe(true);
    expect(result.successor?.id).toBe('b');
    expect(playlist.current?.id).toBe('b');
  });

  it('falls back to the previous song when the last one is removed', () => {
    const playlist = playlistOf('a', 'b');
    playlist.select(playlist.currentNode!.next!);
    const result = playlist.remove(playlist.currentNode!);
    expect(result.successor?.id).toBe('a');
  });

  it('forgets removed songs in the history', () => {
    const playlist = playlistOf('a', 'b', 'c');
    const first = playlist.currentNode!;
    playlist.next(); // a -> b
    playlist.remove(first);
    expect(playlist.previous()?.id).toBe('b'); // nothing left behind, so it restarts
  });

  it('shuffles without repeating the current song', () => {
    let calls = 0;
    const playlist = new Playlist(() => (calls++ % 2 === 0 ? 0 : 0.99));
    ['a', 'b', 'c'].forEach((id) => playlist.addLast(song(id)));
    playlist.setShuffle(true);
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const before = playlist.current!.id;
      const after = playlist.next()!.id;
      expect(after).not.toBe(before);
      seen.add(after);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('notifies listeners after changes', () => {
    const playlist = new Playlist();
    let count = 0;
    playlist.changed.subscribe(() => count++);
    playlist.addLast(song('a'));
    playlist.addLast(song('b'));
    playlist.move(0, 1);
    expect(count).toBe(3);
  });
});

describe('Song', () => {
  it('survives a trip through JSON', () => {
    const original = song('a');
    const copy = Song.fromJSON(JSON.parse(JSON.stringify(original)));
    expect(copy?.key).toBe(original.key);
    expect(copy?.title).toBe('Song a');
  });

  it('rejects damaged data', () => {
    expect(Song.fromJSON(null)).toBeNull();
    expect(Song.fromJSON({ id: 1 })).toBeNull();
  });
});
