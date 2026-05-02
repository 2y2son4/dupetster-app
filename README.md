# Dupetster

Dupetster is a music card game app inspired by Hitster. Create, manage, and export QR-coded music cards for gameplay.

Main use case: add cards manually or via JSON/CSV import, select cards, and export printable assets.

## Project architecture

The app follows a clean Angular standalone structure:

- `app.ts` — container/orchestrator component
- `features/**/components` — presentational UI components (most styles are centralized in `app.scss`)
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

1. Add cards manually via the form, or import from JSON/CSV
2. Review cards in the `Cards (N)` section
3. Use `Select All Filtered` or click individual cards to select
4. Use `Delete Selected` to remove many cards at once (with confirmation)
5. Export:

- `Export PDF` for printable cards
- `Export JSON` / `Export CSV` for data backup and transfer

You can also edit and delete individual cards from the grid.

Notes:

- Duplicate cards are blocked when adding/importing by Spotify URL.
- Exported filenames include a timestamp suffix for uniqueness.

## QR codes

All cards use `raw-url` QR mode. Each card's QR code encodes its Spotify URL directly. The QR mode selector is present in the form but other modes are currently disabled.

## PDF export

Exports a multi-page PDF with a 3×3 card grid per page. Each card includes:

- Title, artist, year
- A solid-bordered QR code box
- A dashed divider line separating card info from the QR area

## Spotify autofill and login

The card form includes a `Spotify Client ID` field and `Connect Spotify` button.

- Client ID field is masked by default and has a show/hide toggle.
- `Connect Spotify` is disabled until Client ID is filled.
- After connecting, pasting a valid Spotify track URL can auto-populate artist, title, and year.
- In Spotify app development mode, test users must be added in Spotify Dashboard User Management.

## JSON/CSV import format

You can import cards with `Import JSON` or `Import CSV`.

For JSON, use an array of objects.

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
    "difficulty": "Original"
  }
]
```

Optional JSON fields:

- `difficulty` (`Original`, `Pro`, `Expert`)
- `spotifyTrackId`
- `qrPayload`

Import behavior:

- Invalid rows are skipped.
- Difficulty values are normalized.
- Duplicate Spotify URLs are skipped with toast feedback.

## Build

```bash
npm run build
```

## Deploy and releases

This repo includes GitHub Actions workflows for:

- GitHub Pages deployment on push to `master` (`deploy-pages.yml`)
- Tag-based release artifact publishing (`release.yml`)
- Manual semver bump + tag creation (`cut-release.yml`)
