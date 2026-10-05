/* Just the parts of the Spotify Web Playback SDK that this app touches. */

declare namespace Spotify {
  interface PlayerInit {
    name: string;
    getOAuthToken(callback: (token: string) => void): void;
    volume?: number;
  }

  interface TrackRef {
    id: string | null;
    uri: string;
  }

  interface WebPlaybackState {
    paused: boolean;
    position: number;
    duration: number;
    track_window: {
      current_track: TrackRef;
      previous_tracks: TrackRef[];
    };
  }

  class Player {
    constructor(init: PlayerInit);
    connect(): Promise<boolean>;
    disconnect(): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addListener(event: string, callback: (payload: any) => void): boolean;
    getCurrentState(): Promise<WebPlaybackState | null>;
    setVolume(volume: number): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    togglePlay(): Promise<void>;
    seek(positionMs: number): Promise<void>;
    activateElement(): Promise<void>;
  }
}

interface Window {
  onSpotifyWebPlaybackSDKReady?: () => void;
  Spotify?: typeof Spotify;
}
