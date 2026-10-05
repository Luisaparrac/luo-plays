import { describe, expect, it } from 'vitest';
import { PlaylistLibrary } from '../src/domain/PlaylistLibrary';

describe('PlaylistLibrary', () => {
  it('starts with one playlist called "Mi lista"', () => {
    const library = new PlaylistLibrary();
    expect(library.all.length).toBe(1);
    expect(library.active.name).toBe('Mi lista');
  });

  it('creates, activates and renames playlists', () => {
    const library = new PlaylistLibrary();
    const gym = library.create('  Gym  ')!;
    expect(gym.name).toBe('Gym');
    library.activate(gym.id);
    expect(library.active.id).toBe(gym.id);
    library.rename(gym.id, 'Noche');
    expect(library.active.name).toBe('Noche');
    library.rename(gym.id, '   ');
    expect(library.active.name).toBe('Noche');
  });

  it('gives a default name to an empty one', () => {
    const library = new PlaylistLibrary();
    expect(library.create('')!.name).toBe('Lista 2');
  });

  it('refuses to go past the limit', () => {
    const library = new PlaylistLibrary();
    for (let i = 1; i < PlaylistLibrary.MAX_LISTS; i++) library.create(`L${i}`);
    expect(library.isFull).toBe(true);
    expect(library.create('extra')).toBeNull();
  });

  it('removes a playlist and moves to its neighbour, but never the last one', () => {
    const library = new PlaylistLibrary();
    const second = library.create('B')!;
    library.activate(second.id);
    expect(library.remove(second.id)).toBe(true);
    expect(library.active.name).toBe('Mi lista');
    expect(library.remove(library.active.id)).toBe(false);
  });

  it('keeps each playlist separate when saving the open one', () => {
    const library = new PlaylistLibrary();
    const other = library.create('B')!;
    library.saveActive({ songs: [], currentIndex: 3, shuffle: true, repeat: 'all' });
    expect(library.active.shuffle).toBe(true);
    expect(other.shuffle).toBe(false);
  });
});
