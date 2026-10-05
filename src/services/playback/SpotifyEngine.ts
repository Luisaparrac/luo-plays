import type { Song, SongSource } from '../../domain/Song';
import { SpotifyHttpError } from '../auth/SpotifyAuth';
import type { SpotifyAuth } from '../auth/SpotifyAuth';
import type { SpotifyApi } from '../auth/SpotifyApi';
import { BasePlaybackEngine } from './PlaybackEngine';

/**
 * Plays full tracks through the Spotify Web Playback SDK. Our page becomes
 * a Spotify Connect device and we tell it what to play through the Web API.
 * It only works for Premium accounts.
 */
export class SpotifyEngine extends BasePlaybackEngine {
  readonly source: SongSource = 'spotify';

  private player: Spotify.Player | null = null;
  private deviceId: string | null = null;
  private pending: Song | null = null;
  private currentUri: string | null = null;
  private endedFired = false;
  private pollTimer: number | null = null;
  private volume = 0.8;

  constructor(
    private readonly auth: SpotifyAuth,
    private readonly api: SpotifyApi,
  ) {
    super();
  }

  async prepare(): Promise<void> {
    await this.loadSdk();
    const player = new Spotify.Player({
      name: 'Luo Plays',
      volume: this.volume,
      getOAuthToken: (callback) => {
        this.auth
          .getAccessToken()
          .then(callback)
          .catch(() => this.errors.emit('La sesión de Spotify expiró. Vuelve a entrar.'));
      },
    });
    this.player = player;

    const ready = new Promise<void>((resolve, reject) => {
      player.addListener('ready', (payload: { device_id: string }) => {
        this.deviceId = payload.device_id;
        resolve();
      });
      player.addListener('initialization_error', () => reject(new Error('Este navegador no soporta el reproductor de Spotify.')));
      player.addListener('authentication_error', () => reject(new Error('Spotify no aceptó la sesión. Vuelve a entrar.')));
      player.addListener('account_error', () => reject(new Error('Esta cuenta no tiene Spotify Premium.')));
      window.setTimeout(() => reject(new Error('Spotify tardó demasiado en responder.')), 20000);
    });

    player.addListener('playback_error', (payload: { message: string }) => {
      this.errors.emit(`Spotify no pudo reproducir la canción: ${payload.message}`);
    });
    player.addListener('player_state_changed', (state: Spotify.WebPlaybackState | null) => {
      if (state) this.handleState(state);
    });

    const connected = await player.connect();
    if (!connected) throw new Error('No se pudo conectar con Spotify.');
    await ready;
    this.startPolling();
  }

  unlock(): void {
    // Mobile browsers only allow audio after a tap, so this runs inside every click.
    void this.player?.activateElement();
  }

  async load(song: Song, autoplay: boolean): Promise<void> {
    this.pending = song;
    this.endedFired = false;
    this.publish({ positionMs: 0, durationMs: song.durationMs, playing: false });
    if (autoplay) await this.startPending();
  }

  async play(): Promise<void> {
    if (this.pending) {
      await this.startPending();
      return;
    }
    await this.player?.resume();
  }

  async pause(): Promise<void> {
    await this.player?.pause();
  }

  async seek(positionMs: number): Promise<void> {
    await this.player?.seek(Math.max(0, Math.floor(positionMs)));
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    void this.player?.setVolume(this.volume);
  }

  dispose(): void {
    if (this.pollTimer !== null) window.clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.player?.disconnect();
    this.player = null;
  }

  private async startPending(): Promise<void> {
    const song = this.pending;
    if (!song || !this.deviceId) return;
    try {
      await this.playOnDevice(song);
    } catch (error) {
      if (error instanceof SpotifyHttpError && error.status === 404) {
        // The device can take a moment to show up; give it one more try.
        await new Promise((resolve) => window.setTimeout(resolve, 800));
        try {
          await this.playOnDevice(song);
          return;
        } catch {
          // falls through to the message below
        }
      }
      this.errors.emit(this.describe(error));
    }
  }

  private async playOnDevice(song: Song): Promise<void> {
    await this.api.put(`/me/player/play?device_id=${encodeURIComponent(this.deviceId as string)}`, {
      uris: [song.playUri],
    });
    this.currentUri = song.playUri;
    this.pending = null;
  }

  private describe(error: unknown): string {
    if (error instanceof SpotifyHttpError) {
      if (error.status === 403) return 'Spotify rechazó la reproducción. Revisa que tu cuenta sea Premium.';
      if (error.status === 429) return 'Spotify pidió ir más despacio. Intenta de nuevo en unos segundos.';
    }
    return 'No se pudo iniciar la canción en Spotify.';
  }

  /** Spotify has no "ended" event, so we detect the usual pattern. */
  private handleState(state: Spotify.WebPlaybackState): void {
    const current = state.track_window.current_track;
    const finished =
      state.paused &&
      state.position === 0 &&
      state.track_window.previous_tracks.some((track) => track.uri === current.uri);
    if (finished && !this.endedFired && current.uri === this.currentUri) {
      this.endedFired = true;
      this.ended.emit();
    }
  }

  private startPolling(): void {
    this.pollTimer = window.setInterval(async () => {
      if (!this.player || this.pending) return;
      const state = await this.player.getCurrentState();
      if (!state) return;
      this.publish({
        positionMs: state.position,
        durationMs: state.duration,
        playing: !state.paused,
      });
    }, 250);
  }

  private loadSdk(): Promise<void> {
    if (window.Spotify) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      window.onSpotifyWebPlaybackSDKReady = () => resolve();
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      script.onerror = () => reject(new Error('No se pudo cargar el reproductor de Spotify.'));
      document.head.append(script);
    });
  }
}
