# Luo Plays

Un reproductor de música hecho con TypeScript para el taller de listas dobles. La cola de canciones es una lista doblemente enlazada de verdad: cada canción es un nodo que apunta a la anterior y a la siguiente, y todo lo que haces con la lista (agregar, quitar, mover, adelantar, retroceder) es reconectar nodos.

## Qué hace

- **Agregar** una canción al inicio, al final, justo después de la que suena o en cualquier posición.
- **Eliminar** canciones de la lista.
- **Adelantar y retroceder**. Retroceder usa un historial real: vuelve a la canción que sonó antes, no solo a la vecina.
- **Arrastrar y soltar** para reordenar (funciona con mouse y con el dedo).
- **Reproducir a continuación** desde cualquier fila.
- **Shuffle y repeat** (apagado, toda la lista, una canción).
- **Karaoke** con la letra sincronizada de LRCLIB.
- **Buscador** libre, **colores que siguen la portada**, barra de progreso con salto, volumen y atajos de teclado (espacio, N, P).
- **Compartir enlace**: quien lo abre carga la misma lista y puede modificarla.
- **Varias playlists**: crea, renombra, borra y cambia entre hasta 12 listas, cada una con su propia lista doble.
- Las listas se guardan en el navegador de cada persona.

Hay dos modos, que se eligen en la primera pantalla:

| Modo | Audio | Quién puede usarlo |
| --- | --- | --- |
| Spotify Premium | Canciones completas | Cuentas Premium que el dueño de la app autorice (máximo 5 mientras la app esté en modo desarrollo de Spotify) |
| Sin Spotify | Fragmentos de 30 segundos (iTunes) | Cualquier persona, sin cuenta |

## Cómo está organizado

```
src/
  domain/      Song, DoublyNode, DoublyLinkedList, Playlist, PlaylistLibrary, Observable
  services/
    auth/      SpotifyAuth (login PKCE), SpotifyApi
    music/     MusicProvider (interfaz), SpotifyProvider, PreviewProvider
    playback/  PlaybackEngine (base), SpotifyEngine, PreviewEngine
    lyrics/    LrcParser, LyricsService
    storage/   StorageService, ShareService
  ui/          PlayerView, PlaylistView, QueueView, SearchView, KaraokeView, LoginView, Visualizer
  App.ts       conecta todo
public/
  seed-catalog.json   la lista inicial (editable, no está en el código)
tests/         pruebas de la lista doble, la playlist, el parser de letras y una prueba de humo de la interfaz
```

La idea es que cada clase tenga una sola responsabilidad. `Playlist` no sabe nada de Spotify ni de la pantalla, y las vistas no saben de dónde viene el audio. Para sumar otra fuente de música basta con una clase nueva que cumpla `MusicProvider` y otra que cumpla `PlaybackEngine`.

## Correrlo en el computador

```bash
npm install
cp .env.example .env    
npm run dev              
npm test                 
npm run build            
```

