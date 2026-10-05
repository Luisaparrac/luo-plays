import { button, el, icon, sparkle } from './dom';

export interface LoginHandlers {
  onSpotify(): void;
  onPreview(): void;
}

/** First screen: choose Spotify Premium or the 30-second preview mode. */
export class LoginView {
  readonly element = el('main', 'login');

  private readonly message = el('p', 'login-message', [''], { role: 'alert' });
  private readonly spotifyButton: HTMLButtonElement;

  constructor(handlers: LoginHandlers) {
    this.message.hidden = true;
    this.spotifyButton = button('login-btn login-btn-main', 'Entrar con Spotify Premium', [icon('play', 20), 'Entrar con Spotify Premium'], () => handlers.onSpotify());
    const previewButton = button('login-btn login-btn-ghost', 'Entrar sin Spotify', ['Entrar sin Spotify'], () => handlers.onPreview());

    const logo = el('h1', 'logo-big', [
      el('span', 'cut cut-paper', ['LUO']),
      el('span', 'cut cut-lime', ['plays']),
    ]);

    this.element.append(
      el('div', 'login-card', [
        logo,
        el('p', 'login-lead', ['Tu cola de canciones, en cadena. Arrástrala, cámbiala, cántala.']),
        this.spotifyButton,
        el('p', 'login-fine', ['Canciones completas. Necesitas una cuenta Premium que esté autorizada en la app.']),
        previewButton,
        el('p', 'login-fine', ['Fragmentos de 30 segundos. Funciona para cualquiera, sin cuenta.']),
        this.message,
      ]),
      sparkle('spark spark-l1'),
      sparkle('spark spark-l2'),
      sparkle('spark spark-l3'),
    );
  }

  showMessage(text: string): void {
    this.message.textContent = text;
    this.message.hidden = text === '';
  }

  setSpotifyAvailable(available: boolean): void {
    this.spotifyButton.disabled = !available;
    if (!available) {
      this.showMessage('El login con Spotify no está configurado todavía (falta el Client ID). El modo sin Spotify sí funciona.');
    }
  }
}
