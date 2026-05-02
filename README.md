# Dupetster

Dupetster is a music card game app inspired by Hitster. Create, manage, and export QR-coded music cards for gameplay.

Main use case: add cards manually or via JSON import, select cards, and export a PDF card sheet ready to cut.

## Project architecture

The app follows a clean Angular standalone structure:

- `app.ts` — container/orchestrator component
- `features/**/components` — presentational UI components, each with its own SCSS file
- `ui/components` — reusable shell widgets (toast, loader, modal), each with its own SCSS file
- `core/models` — domain types and contracts
- `core/services` — business logic and state (`AppStateService`, `PdfExportService`, etc.)

### State management

`AppStateService` is the central state service. It exposes a public API of signals and methods. All internal helpers are declared with JavaScript native `#` private fields/methods (not TypeScript `private`), which enforces true runtime privacy.

### Theming

CSS custom properties are defined in `app-root` and cascade to all components:

```scss
// Raw color tokens
--white: #fff;
--black: #000;

// Semantic tokens (swap these to retheme the app)
--main-color: var(--white);
--secondary-color: var(--black);
--ink: var(--secondary-color);
--surface: var(--main-color);
--border: var(--secondary-color);
```

## Source tree

```text
src/
  app/
    app.ts
    app.html
    app.scss                          ← global shared styles and theme tokens only
    app.config.ts
    app.routes.ts
    core/
      models/
        card.model.ts
        spotify.model.ts
        ui.model.ts
      services/
        app-state.service.ts          ← central state, all internals use # private
        pdf-export.service.ts
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
            cards-section.component.scss
          live-preview-panel/
            live-preview-panel.component.ts
            live-preview-panel.component.html
            live-preview-panel.component.scss
      spotify/
        components/
          spotify-import-panel/       ← currently disabled (commented out in app.html)
            spotify-import-panel.component.ts
            spotify-import-panel.component.html
    ui/
      components/
        confirm-modal/
          confirm-modal.component.ts
          confirm-modal.component.html
          confirm-modal.component.scss
        loader-overlay/
          loader-overlay.component.ts
          loader-overlay.component.html
          loader-overlay.component.scss
        toast-layer/
          toast-layer.component.ts
          toast-layer.component.html
          toast-layer.component.scss
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

## How to use

Typical flow:

1. Add cards manually via the form, or import from a JSON file
2. Review cards in the `Cards (N)` section
3. Use `Select All Filtered` or click individual cards to select
4. Click `Export PDF` to generate a card sheet ready to print and cut

You can also edit or duplicate existing cards from the card grid.

## QR codes

All cards use `raw-url` QR mode. Each card's QR code encodes its Spotify URL directly. The QR mode selector is present in the form but other modes are currently disabled.

## PDF export

Exports a multi-page PDF with a 4×2 card grid per page. Each card includes:

- Title, artist, year
- A solid-bordered QR code box
- A dashed divider line separating card info from the QR area

## JSON import format

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
- `spotifyTrackId`
- `qrPayload`

<!--
## Spotify import (currently disabled)

`<app-spotify-import-panel>` is commented out in `app.html`. The Spotify import UI and all related
flows (OAuth PKCE login, Client Credentials, local proxy) are implemented but not exposed in the UI.

### Supported import modes

1. Spotify Login import (OAuth PKCE — works with public/private playlists)
2. Legacy Client Credentials import (Client ID + Client Secret)
3. Local proxy import (credentials stay in `.env.proxy`)

### Recommended flow (Spotify Login)

1. Enter your Spotify Client ID in the app.
2. Click `Connect Spotify Account`.
3. Approve access on Spotify.
4. Back in Dupetster, click `Import Playlist (Spotify Login)`.

### Local proxy

Start the local proxy:

```bash
npm run start:proxy
```

Proxy endpoint: `http://127.0.0.1:8787/api/playlist-tracks?playlist=<url-or-id>`

`.env.proxy` example:

```env
SPOTIFY_CLIENT_ID=your_real_client_id
SPOTIFY_CLIENT_SECRET=your_real_client_secret
SPOTIFY_PROXY_PORT=8787
```

### Spotify Developer Dashboard settings

- App name: `Dupetster`
- Website: `https://2y2son4.github.io/dupetster-app/`
- APIs/SDKs: `Web API` and `Android`

Redirect URIs:

- `http://127.0.0.1:4200/callback`
- `https://2y2son4.github.io/dupetster-app/callback`

Note: Spotify requires explicit loopback IPs for local HTTP redirects. Use `127.0.0.1` (not `localhost`).

### Future Android app notes

1. Add your Android package in Spotify dashboard (e.g. `io.dupetster.app`).
2. Add an app redirect URI with a custom scheme (e.g. `dupetster://callback`).
3. Keep Web API selected for playlist metadata requests.
-->

## Build

```bash
npm run build
```

## Deploy

This repo includes a GitHub Actions workflow to publish to GitHub Pages on push to `master`.
