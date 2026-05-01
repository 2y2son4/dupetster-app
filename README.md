# Dupetster

Dupetster is a music card game app inspired by Hitster. It imports Spotify playlists and generates printable QR cards for gameplay.

Main use case: import a Spotify playlist, select cards, and print/export a 4x4 card sheet ready to cut.

## Project architecture

The app now follows a cleaner Angular structure:

- `app.ts` is now a container/orchestrator component
- `features/**/components` contains presentational UI components
- `ui/components` contains reusable shell widgets (toast, loader, modal)
- `core/models` contains domain types and contracts
- `core/services` contains reusable business/integration logic

## Source tree

```text
src/
  app/
    app.ts
    app.html
    app.scss
    app.config.ts
    app.routes.ts
    core/
      models/
        card.model.ts
        spotify.model.ts
        ui.model.ts
      services/
        qr-code.service.ts
        spotify-api.service.ts
    features/
      cards/
        components/
          card-form-panel/
            card-form-panel.component.ts
            card-form-panel.component.html
          cards-section/
            cards-section.component.ts
            cards-section.component.html
          live-preview-panel/
            live-preview-panel.component.ts
            live-preview-panel.component.html
      spotify/
        components/
          spotify-import-panel/
            spotify-import-panel.component.ts
            spotify-import-panel.component.html
    ui/
      components/
        confirm-modal/
          confirm-modal.component.ts
          confirm-modal.component.html
        loader-overlay/
          loader-overlay.component.ts
          loader-overlay.component.html
        toast-layer/
          toast-layer.component.ts
          toast-layer.component.html
  main.ts
  styles.scss
```

## Run locally

Install dependencies and start the Angular app:

```bash
npm ci
npm start
```

The app runs at `http://localhost:4200/`.
For Spotify OAuth, always open the app at `http://127.0.0.1:4200/`.

## How to use

Typical flow:

1. Import songs from Spotify playlist (recommended)
2. Review cards in the `Cards (N)` section
3. Use `Select All Filtered` or click individual cards
4. Export PDF or print selected cards

You can also create or edit cards manually from the form.

## Spotify import modes

Dupetster supports two import paths:

1. Spotify Login import (recommended; OAuth PKCE, works with public/private playlists)
2. Legacy Client Credentials import (Client ID + Client Secret)
3. Local proxy import (credentials stay in `.env.proxy`)

### Recommended flow (Spotify Login)

1. Enter your Spotify Client ID in the app.
2. Click `Connect Spotify Account`.
3. Approve access on Spotify.
4. Back in Dupetster, click `Import Playlist (Spotify Login)`.

This flow is the most reliable for playlist access.

Start the local proxy:

```bash
npm run start:proxy
```

Proxy endpoint: `http://127.0.0.1:8787/api/playlist-tracks?playlist=<url-or-id>`

If proxy mode fails, check that `.env.proxy` contains your real values:

```env
SPOTIFY_CLIENT_ID=your_real_client_id
SPOTIFY_CLIENT_SECRET=your_real_client_secret
SPOTIFY_PROXY_PORT=8787
```

Then restart proxy:

```bash
npm run start:proxy
```

## JSON import format example

You can import cards with `Import JSON` using an array of objects.

Minimal accepted example:

```json
[
  {
    "title": "Blinding Lights",
    "artist": "The Weekend",
    "year": 2019,
    "spotifyUrl": "https://open.spotify.com/track/id-string"
  },
  {
    "title": "Billie Jean",
    "artist": "Michael Jackson",
    "year": 1983,
    "spotifyUrl": "https://open.spotify.com/track/id-string",
    "album": "Thriller",
    "genre": "Pop",
    "difficulty": "Original"
  }
]
```

Optional fields:

- `album`
- `genre`
- `difficulty` (`Original`, `Pro`, `Expert`)
- `qrMode` (`canonical-url`, `spotify-uri`, `raw-url`)
- `spotifyTrackId`
- `qrPayload`

## Spotify Developer Dashboard settings

For this project, use these settings in your Spotify app:

- App name: `Dupetster`
- Website: `https://2y2son4.github.io/dupetster-app/`
- APIs/SDKs: `Web API` and `Android`

### Redirect URIs

Use:

- `http://127.0.0.1:4200/callback`
- `https://2y2son4.github.io/dupetster-app/callback`

Note: Spotify now requires explicit loopback IPs for local HTTP redirects. Use `127.0.0.1` (not `localhost`).

## Future Android app notes

When you start Android implementation:

1. Add your Android package in Spotify dashboard (for example `io.dupetster.app`).
2. Add an app redirect URI with a custom scheme (for example `dupetster://callback`) and use the same value in Android auth config.
3. Keep Web API selected for playlist metadata requests.

## Build

```bash
npm run build
```

## Deploy

This repo includes a GitHub Actions workflow to publish to GitHub Pages on push to `master`.
