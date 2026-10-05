import { config, spotifyRedirectUri } from './config';
import type { DoublyNode } from './domain/DoublyNode';
import { Playlist } from './domain/Playlist';
import { PlaylistLibrary } from './domain/PlaylistLibrary';
import type { PlaylistEntry } from './domain/PlaylistLibrary';
import type { Song } from './domain/Song';
import { ColorExtractor } from './services/ColorExtractor';
import { PlaylistBootstrap } from './services/PlaylistBootstrap';
import { SpotifyApi } from './services/auth/SpotifyApi';
import { SpotifyAuth, SpotifyHttpError } from './services/auth/SpotifyAuth';
import type { LyricLine } from './services/lyrics/LrcParser';
import { LyricsService } from './services/lyrics/LyricsService';
import type { MusicProvider } from './services/music/MusicProvider';
import { PreviewProvider } from './services/music/PreviewProvider';
import { SpotifyProvider } from './services/music/SpotifyProvider';
import type { PlaybackEngine } from './services/playback/PlaybackEngine';
import { PreviewEngine } from './services/playback/PreviewEngine';
import { SpotifyEngine } from './services/playback/SpotifyEngine';
import { ShareService } from './services/storage/ShareService';
import { StorageService } from './services/storage/StorageService';
import type { AppMode } from './services/storage/StorageService';
import { KaraokeView } from './ui/KaraokeView';
import { LoginView } from './ui/LoginView';
import { PlayerView } from './ui/PlayerView';
import { PlaylistView } from './ui/PlaylistView';
import { QueueView } from './ui/QueueView';
import { SearchView } from './ui/SearchView';
import { Toaster, button, el, icon, sparkle } from './ui/dom';

interface Session {
  mode: AppMode;
  provider: MusicProvider;
  engine: PlaybackEngine;
  who: string;
}

/**
 * The conductor. It owns the playlist and the services and connects them to
 * the views: nothing else in the app knows about the other pieces.
 */
export class App {
  private readonly storage = new StorageService();
  private readonly share = new ShareService();
  private readonly lyrics = new LyricsService();
  private readonly colors = new ColorExtractor();
  private readonly auth = new SpotifyAuth(config.spotifyClientId, spotifyRedirectUri(), config.spotifyScopes);
  private readonly toaster = new Toaster(document.body);

  private session: Session | null = null;
  private playlist = new Playlist();
  private library = new PlaylistLibrary();
  private cleanups: Array<() => void> = [];

  private player!: PlayerView;
  private playlistView!: PlaylistView;
  private queueView!: QueueView;
  private karaoke!: KaraokeView;

  private staged: Song | null = null;
  private loadedNode: DoublyNode<Song> | null = null;
  private shownNode: DoublyNode<Song> | null = null;
  private lyricsLines: LyricLine[] | null | undefined = null;
  private lyricsToken = 0;
  private glowToken = 0;
  private volume = 0.8;
  private saveTimer: number | undefined;

  constructor(private readonly root: HTMLElement) {}

  async start(): Promise<void> {
    const outcome = await this.auth.completeLoginIfReturning();
    if (outcome === 'ok') {
      this.storage.setMode('spotify');
      await this.enterSpotify();
      return;
    }
    if (outcome === 'denied') {
      this.showLogin('Cancelaste el permiso en Spotify. Puedes intentarlo otra vez o entrar sin Spotify.');
      return;
    }
    if (outcome === 'error') {
      this.showLogin('No se pudo completar el login con Spotify. Inténtalo otra vez.');
      return;
    }

    const mode = this.storage.getMode();
    if (mode === 'spotify' && this.auth.hasSession) {
      await this.enterSpotify();
    } else if (mode === 'preview') {
      await this.enterPreview();
    } else {
      this.showLogin();
    }
  }

  /* ---------- entering and leaving ---------- */

  private showLogin(message = ''): void {
    this.teardown();
    const login = new LoginView({
      onSpotify: () => {
        login.showMessage('');
        this.auth.startLogin().catch((error: Error) => login.showMessage(error.message));
      },
      onPreview: () => {
        this.storage.setMode('preview');
        void this.enterPreview();
      },
    });
    login.setSpotifyAvailable(this.auth.isConfigured);
    if (message) login.showMessage(message);
    this.root.replaceChildren(login.element);
  }

  private async enterSpotify(): Promise<void> {
    this.showLoading('Conectando con Spotify…');
    try {
      const profile = await this.auth.fetchProfile();
      if (profile.product !== 'premium') {
        this.auth.logout();
        this.storage.clearMode();
        this.showLogin('Esa cuenta de Spotify no es Premium. Con Premium suenan las canciones completas; sin Premium puedes entrar con los fragmentos de 30 segundos.');
        return;
      }
      const api = new SpotifyApi(this.auth);
      const engine = new SpotifyEngine(this.auth, api);
      await engine.prepare();
      await this.openSession({ mode: 'spotify', provider: new SpotifyProvider(api), engine, who: profile.displayName });
    } catch (error) {
      if (!(error instanceof SpotifyHttpError) || error.status !== 429) this.auth.logout();
      this.storage.clearMode();
      this.showLogin(this.explain(error));
    }
  }

  private async enterPreview(): Promise<void> {
    this.showLoading('Preparando el reproductor…');
    const engine = new PreviewEngine();
    await engine.prepare();
    await this.openSession({ mode: 'preview', provider: new PreviewProvider(), engine, who: 'sin Spotify' });
  }

  private explain(error: unknown): string {
    if (error instanceof SpotifyHttpError) {
      if (error.status === 403) {
        return 'Spotify no dejó entrar a esta cuenta. La app está en modo desarrollo y solo pueden usarla las cuentas Premium que su dueña agregó en el panel de Spotify (máximo 5).';
      }
      if (error.status === 401) return 'La sesión de Spotify expiró. Vuelve a entrar.';
      if (error.status === 429) return 'Spotify pidió ir más despacio. Inténtalo de nuevo en un minuto.';
    }
    return error instanceof Error ? error.message : 'No se pudo conectar con Spotify.';
  }

  private logout(): void {
    if (this.session?.mode === 'spotify') this.auth.logout();
    this.storage.clearMode();
    this.showLogin();
  }

  private teardown(): void {
    this.cleanups.forEach((undo) => undo());
    this.cleanups = [];
    this.session?.engine.dispose();
    this.session = null;
    this.playlist = new Playlist();
    this.library = new PlaylistLibrary();
    this.staged = null;
    this.loadedNode = null;
    this.shownNode = null;
    this.karaoke?.close();
    document.title = config.appName;
  }

  private showLoading(text: string): void {
    this.root.replaceChildren(el('div', 'loading', [el('div', 'loading-disc'), el('p', '', [text])]));
  }

  /* ---------- building the main screen ---------- */

  private async openSession(session: Session): Promise<void> {
    this.teardown();
    this.session = session;
    const { engine, provider, mode } = session;

    const stored = this.storage.loadLibrary();
    const shared = this.share.readFromLocation();
    this.library = stored?.library ?? new PlaylistLibrary();
    this.volume = stored?.volume ?? 0.8;
    engine.setVolume(this.volume);

    this.buildShell(session);
    this.player.setModes(false, 'off');
    this.player.setKaraokeAvailable(false);
    this.refresh();

    this.cleanups.push(
      engine.snapshots.subscribe((snapshot) => {
        this.player.setSnapshot(snapshot);
        this.karaoke.setSnapshot(snapshot);
      }),
      engine.ended.subscribe(() => void this.handleEnded()),
      engine.errors.subscribe((message) => this.toaster.show(message, 'error')),
    );

    this.toaster.show('Cargando tu lista…');
    const active = this.library.active;
    const saved = active.songs.length > 0 ? { ...active, volume: this.volume } : null;
    // The starter catalogue only fills the very first playlist, never one the person emptied.
    const initial =
      stored && !saved && !(shared && shared.length > 0)
        ? { songs: [] as Song[], currentIndex: 0, origin: 'empty' as const }
        : await new PlaylistBootstrap(provider).load(shared, saved);
    if (this.session !== session) return;

    if (initial.origin === 'shared') {
      const incoming = this.library.create('Lista compartida');
      if (incoming) this.library.activate(incoming.id);
    }
    this.playlist.replaceAll(initial.songs, initial.currentIndex);
    if (initial.origin === 'saved') {
      this.playlist.setShuffle(active.shuffle);
      this.playlist.setRepeat(active.repeat);
    }
    if (initial.origin === 'shared') {
      this.share.clearFromLocation();
      this.toaster.show(`Lista compartida cargada: ${initial.songs.length} canciones.`);
    } else if (shared && shared.length > 0) {
      this.share.clearFromLocation();
      this.toaster.show('No pude abrir la lista compartida con esta fuente de música.', 'error');
    }
    if (mode === 'preview' && initial.origin !== 'empty') {
      this.toaster.show('Modo sin Spotify: cada canción suena 30 segundos.');
    }

    this.cleanups.push(this.playlist.changed.subscribe(() => this.onPlaylistChanged()));
    this.refresh();
    this.persist();
  }

  private buildShell(session: Session): void {
    const { engine, provider, mode } = session;
    const sourceLabel = mode === 'spotify' ? 'SPOTIFY' : 'PREVIEW 30 S';

    this.player = new PlayerView(
      {
        onToggle: () => void this.toggle(),
        onPrevious: () => void this.previous(),
        onNext: () => void this.next(),
        onShuffle: () => {
          this.playlist.toggleShuffle();
        },
        onRepeat: () => {
          this.playlist.cycleRepeat();
        },
        onKaraoke: () => this.openKaraoke(),
        onSeek: (positionMs) => {
          engine.unlock();
          void engine.seek(positionMs);
        },
        onVolume: (volume) => {
          this.volume = volume;
          engine.setVolume(volume);
          this.persist();
        },
      },
      sourceLabel,
    );
    this.cleanups.push(() => this.player.visualizer.stop());

    this.playlistView = new PlaylistView({
      onPlay: (node) => void this.playNode(node),
      onRemove: (node) => void this.removeNode(node),
      onPlayNext: (node) => this.moveAfterCurrent(node),
      onMove: (from, to) => this.playlist.move(from, to),
      onAddFirst: () => this.addStaged('first'),
      onAddLast: () => this.addStaged('last'),
      onAddNext: () => this.addStaged('next'),
      onAddAt: (index) => this.addStaged(index),
      onSelectList: (id) => void this.switchList(id),
      onCreateList: () => void this.createList(),
      onRenameList: () => this.renameList(),
      onDeleteList: () => void this.deleteList(),
    });

    this.queueView = new QueueView((node) => void this.playNode(node));

    this.karaoke = new KaraokeView({
      onToggle: () => void this.toggle(),
      onPrevious: () => void this.previous(),
      onNext: () => void this.next(),
      onClose: () => this.karaoke.close(),
    });

    const search = new SearchView(provider, mode === 'spotify' ? 'SPOTIFY' : 'ITUNES', {
      onStage: (song) => {
        this.staged = song;
        this.playlistView.setStaged(song);
      },
      onQuickAdd: (song) => {
        this.playlist.addLast(song);
        this.toaster.show(`“${song.title}” se agregó al final de tu lista.`);
        this.revealPlaylist();
      },
      onError: (message) => this.toaster.show(message, 'error'),
    });

    const logo = el('div', 'logo', [
      el('span', 'cut cut-paper', ['LUO']),
      el('span', 'cut cut-lime', ['plays']),
    ]);
    const shareButton = button('pill', 'Compartir enlace', [icon('link', 16), 'Compartir enlace'], () => void this.copyShareLink());
    const chip = el('div', 'chip', [
      el('span', 'chip-dot'),
      el('span', 'chip-text', [mode === 'spotify' ? `Spotify · ${session.who}` : 'Sin Spotify · 30 s']),
      button('chip-out', 'Cambiar de modo o salir', [icon('logout', 16)], () => this.logout()),
    ]);

    const app = el('div', 'app', [
      el('header', 'topbar', [logo, search.element, shareButton, chip]),
      el('div', 'main-grid', [this.player.element, this.playlistView.element]),
      this.queueView.element,
      sparkle('spark spark-a'),
      sparkle('spark spark-b'),
      sparkle('spark spark-c'),
      this.karaoke.element,
    ]);
    this.root.replaceChildren(app);

    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'BUTTON'].includes(target.tagName) || target.getAttribute('role') === 'slider')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        void this.toggle();
      } else if (event.key === 'n' || event.key === 'N') {
        void this.next();
      } else if (event.key === 'p' || event.key === 'P') {
        void this.previous();
      }
    };
    document.addEventListener('keydown', onKey);
    this.cleanups.push(() => document.removeEventListener('keydown', onKey));
  }

  /* ---------- reacting to changes ---------- */

  private onPlaylistChanged(): void {
    this.refresh();
    this.persist();
  }

  /** Redraws everything that depends on the playlist. */
  private refresh(): void {
    this.playlistView.setLists(this.library.all, this.library.active.id);
    this.playlistView.render(this.playlist);
    this.queueView.render(this.playlist);
    this.player.setModes(this.playlist.shuffle, this.playlist.repeat);
    this.player.setSong(this.playlist.current, Math.max(0, this.playlist.currentIndex), this.playlist.size);

    const node = this.playlist.currentNode;
    if (node !== this.shownNode) {
      this.shownNode = node;
      this.onCurrentSongChanged(node ? node.value : null);
    }
  }

  private onCurrentSongChanged(song: Song | null): void {
    this.karaoke.setSong(song);
    document.title = song ? `${song.title} · ${config.appName}` : config.appName;

    const glowId = ++this.glowToken;
    this.player.setGlow(null);
    if (song) {
      void this.colors.dominant(song.coverUrl).then((color) => {
        if (glowId === this.glowToken) this.player.setGlow(color);
      });
    }
    void this.fetchLyrics(song);
  }

  private async fetchLyrics(song: Song | null): Promise<void> {
    const token = ++this.lyricsToken;
    const previewOnly = this.session?.mode === 'preview';
    if (!song) {
      this.lyricsLines = null;
      this.player.setKaraokeAvailable(false);
      this.karaoke.setLyrics(null, previewOnly);
      return;
    }
    this.lyricsLines = undefined;
    this.player.setKaraokeAvailable(false, true);
    this.karaoke.setLyrics(undefined, previewOnly);
    const lines = await this.lyrics.find(song);
    if (token !== this.lyricsToken) return;
    this.lyricsLines = lines;
    this.player.setKaraokeAvailable(lines !== null);
    this.karaoke.setLyrics(lines, previewOnly);
    this.karaoke.setSnapshot(this.session?.engine.snapshot ?? { positionMs: 0, durationMs: 0, playing: false });
  }

  private openKaraoke(): void {
    if (!this.lyricsLines) {
      this.toaster.show('Esta canción no tiene letra sincronizada.');
      return;
    }
    this.karaoke.open();
    this.karaoke.setSnapshot(this.session?.engine.snapshot ?? { positionMs: 0, durationMs: 0, playing: false });
  }

  /** Copies what is playing into the open playlist's entry. */
  private syncActive(): void {
    this.library.saveActive({
      songs: this.playlist.songs,
      currentIndex: Math.max(0, this.playlist.currentIndex),
      shuffle: this.playlist.shuffle,
      repeat: this.playlist.repeat,
    });
  }

  private persist(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.syncActive();
      this.storage.saveLibrary(this.library, this.volume);
    }, 300);
  }

  /* ---------- several playlists ---------- */

  private async switchList(id: string): Promise<void> {
    if (id === this.library.active.id) return;
    this.syncActive();
    if (!this.library.activate(id)) return;
    await this.openActiveList();
  }

  /** Stops the music and loads the open playlist's songs into the live list. */
  private async openActiveList(): Promise<void> {
    const session = this.session;
    if (!session) return;
    await this.engine.pause();
    this.loadedNode = null;
    this.staged = null;
    this.playlistView.setStaged(null);

    const entry: PlaylistEntry = this.library.active;
    const songs = entry.songs.length > 0 ? await new PlaylistBootstrap(session.provider).adaptToProvider(entry.songs) : [];
    if (this.session !== session || entry !== this.library.active) return;

    this.playlist.setShuffle(entry.shuffle);
    this.playlist.setRepeat(entry.repeat);
    this.playlist.replaceAll(songs, entry.currentIndex);
    this.refresh();
    this.persist();
  }

  private async createList(): Promise<void> {
    if (this.library.isFull) {
      this.toaster.show(`Puedes tener hasta ${PlaylistLibrary.MAX_LISTS} playlists.`, 'error');
      return;
    }
    const name = window.prompt('¿Cómo se llama la nueva playlist?', '');
    if (name === null) return;
    this.syncActive();
    const entry = this.library.create(name);
    if (!entry) return;
    this.library.activate(entry.id);
    await this.openActiveList();
    this.toaster.show(`Playlist “${entry.name}” creada. Busca canciones para llenarla.`);
  }

  private renameList(): void {
    const entry = this.library.active;
    const name = window.prompt('Nuevo nombre de la playlist', entry.name);
    if (name === null) return;
    this.library.rename(entry.id, name);
    this.refresh();
    this.persist();
  }

  private async deleteList(): Promise<void> {
    const entry = this.library.active;
    if (!window.confirm(`¿Borrar la playlist “${entry.name}”? Las canciones de esa lista se pierden.`)) return;
    if (!this.library.remove(entry.id)) return;
    await this.openActiveList();
    this.toaster.show(`Playlist “${entry.name}” borrada.`);
  }

  /* ---------- playback actions ---------- */

  private get engine(): PlaybackEngine {
    return (this.session as Session).engine;
  }

  private async loadCurrent(song: Song, autoplay: boolean): Promise<void> {
    this.loadedNode = this.playlist.currentNode;
    await this.engine.load(song, autoplay);
  }

  private async playNode(node: DoublyNode<Song>): Promise<void> {
    this.engine.unlock();
    const song = this.playlist.select(node);
    await this.loadCurrent(song, true);
  }

  private async toggle(): Promise<void> {
    this.engine.unlock();
    const node = this.playlist.currentNode;
    if (!node) {
      this.toaster.show('Agrega una canción para empezar.');
      return;
    }
    if (this.loadedNode !== node) {
      await this.loadCurrent(node.value, true);
      return;
    }
    await this.engine.toggle();
  }

  private async next(): Promise<void> {
    this.engine.unlock();
    const song = this.playlist.next();
    if (!song) {
      this.toaster.show('Esa es la última canción de la lista.');
      return;
    }
    await this.loadCurrent(song, true);
  }

  private async previous(): Promise<void> {
    this.engine.unlock();
    if (this.engine.snapshot.positionMs > 3000) {
      await this.engine.seek(0);
      return;
    }
    const song = this.playlist.previous();
    if (song) await this.loadCurrent(song, true);
  }

  private async handleEnded(): Promise<void> {
    const song = this.playlist.next(true);
    if (song) await this.loadCurrent(song, true);
  }

  private async removeNode(node: DoublyNode<Song>): Promise<void> {
    const wasPlaying = this.engine.snapshot.playing;
    const result = this.playlist.remove(node);
    if (!result.wasCurrent) return;
    if (this.loadedNode === node) this.loadedNode = null;
    if (result.successor) {
      await this.loadCurrent(result.successor, wasPlaying);
    } else {
      await this.engine.pause();
    }
  }

  /** Moves a song that is already in the list to play right after the current one. */
  private moveAfterCurrent(node: DoublyNode<Song>): void {
    const from = this.playlist.indexOf(node);
    const current = this.playlist.currentIndex;
    if (from < 0 || current < 0 || node === this.playlist.currentNode) return;
    this.playlist.move(from, from > current ? current + 1 : current);
    this.toaster.show(`“${node.value.title}” sonará después de la actual.`);
  }

  private addStaged(where: 'first' | 'last' | 'next' | number): void {
    const song = this.staged;
    if (!song) return;
    if (where === 'first') this.playlist.addFirst(song);
    else if (where === 'last') this.playlist.addLast(song);
    else if (where === 'next') this.playlist.playNext(song);
    else this.playlist.insertAt(where, song);
    this.toaster.show(`“${song.title}” se agregó a tu lista.`);
    this.revealPlaylist();
    this.staged = null;
    this.playlistView.setStaged(null);
  }

  /** On narrow screens the list sits below the player, so bring it into view. */
  private revealPlaylist(): void {
    this.playlistView.element.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }

  private async copyShareLink(): Promise<void> {
    const songs = this.playlist.songs;
    if (songs.length === 0) {
      this.toaster.show('Tu lista está vacía todavía.');
      return;
    }
    const url = this.share.buildUrl(songs.slice(0, config.maxShareSongs));
    try {
      await navigator.clipboard.writeText(url);
      this.toaster.show('Enlace copiado. Quien lo abra verá esta misma lista.');
    } catch {
      window.prompt('Copia este enlace:', url);
    }
    if (songs.length > config.maxShareSongs) {
      this.toaster.show(`El enlace incluye las primeras ${config.maxShareSongs} canciones.`);
    }
  }
}
