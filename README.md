# Dupetster

Dupetster is a music card game app inspired by Hitster. It imports Spotify playlists and generates printable QR cards for gameplay.

Main use case: import a Spotify playlist, select cards, and print/export a 4x4 card sheet ready to cut.

## Run locally

Install dependencies and start the Angular app:

```bash
npm ci
npm start
```

The app runs at `http://localhost:4200/`.

## How to use

Typical flow:

1. Import songs from Spotify playlist (recommended)
2. Review cards in the `Cards (N)` section
3. Use `Select All Filtered` or click individual cards
4. Export PDF or print selected cards

You can also create or edit cards manually from the form.

## Spotify import modes

Dupetster supports two import paths:

1. Direct browser import (Client ID + Client Secret in UI)
2. Local proxy import (recommended; credentials stay in `.env.proxy`)

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
    "artist": "The Weeknd",
    "year": 2019,
    "spotifyUrl": "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b"
  },
  {
    "title": "Billie Jean",
    "artist": "Michael Jackson",
    "year": 1983,
    "spotifyUrl": "https://open.spotify.com/track/5ChkMS8OtdzJeqyybCc9R5",
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
- `http://localhost:4200/callback`
- `https://2y2son4.github.io/dupetster-app/callback`

Note: for local Angular dev server, prefer `http://localhost:4200/callback` (not `https://localhost:4200/callback`).

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
