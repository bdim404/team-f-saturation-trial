# Team F Listening Study

Online listening test for the Team F project in Music Perception and Cognition (Universitat Pompeu Fabra). Participants hear each track in three saturation levels at matched loudness, switch between them while the music plays, and rate each version from 0 to 5 for loudness, clarity and perceived emotional intensity.

Live site: https://listening.bdim.es

> [!IMPORTANT]
> **Pushing to `main` deploys to production.** The Cloudflare Pages project only builds the production branch, so every push to `main` is built and published to https://listening.bdim.es within a minute or two. Other branches and pull requests are not deployed; build and check a change locally with `pnpm build && pnpm preview` before merging.

> [!WARNING]
> **This branch is a synthetic integration candidate.** The configured API handles consent, session assignment, validation and storage. Without an API origin and matching immutable release, saving fails closed. Answers are never printed to the console. Do not recruit participants or change the production deployment until the backend, origins, consent and stimuli have been reviewed.

## Study flow

1. Welcome page with study information and a consent checkbox
2. Background questions: musical background, headphone type
3. Definitions of clarity, loudness and perceived emotion
4. For each track: three versions (A, B, C in random order), each must be heard for more than 3 seconds, then three rating pages (loudness, clarity, emotion), each rating A, B and C from 0 to 5. When one version is rated uniquely highest on emotion (or, if the top is tied, uniquely lowest), a follow-up asks why.
5. Optional multiple-choice question about preferred genres, then submit

The interface is available in English (default), Spanish, Catalan, French, German, Italian, Portuguese, Dutch, Polish, Swedish, Greek, Turkish and Chinese, with light, dark and system themes. Add `?lang=es` (or any other code) to a link to open it in that language.

## Development

Requires Node 22 and pnpm 11.

```bash
pnpm install
pnpm dev
```

`pnpm build` writes the static site to `dist/`, and `pnpm preview` serves that build on http://localhost:4173.

## Configuration

Study settings live in `src/config.ts`:

| Setting | Purpose |
|---|---|
| `tracks` | The stimuli. Each track is either `{ id, source }` (one unmastered mix; the site renders the three versions with a tanh soft clipper using `drive`) or `{ id, files: { less, base, more } }` (three pre-rendered versions). Paths are relative to `public/`. With no `source` or `files`, a synthesised pop loop is used. |
| `drive` | Soft-clip drive `d` for each level in `y = tanh(d·x) / tanh(d)`; `0` means no saturation. |
| `minSecondsPerVersion` | How long each version must be heard before the questions unlock. |

All versions of a track are loudness-matched to −20 LUFS (K-weighted, ITU-R BS.1770 filters, no gating) in the browser before playback.

Environment variables (set them in the Cloudflare Pages project for production, or in `.env.local` for development):

| Variable | Purpose |
|---|---|
| `VITE_API_ORIGIN` | Exact HTTPS API origin, or `same-origin` for the configured Pages gateway. Loopback HTTP is allowed only in development. |
| `VITE_STUDY_RELEASE` | Immutable synthetic release UUID matching `BUNDLE_REVISION`. |

Text for every language is in `src/i18n.ts`. The translations have not been checked by native speakers yet.

## API contract

The API is under `/integration/team-f/`: versioned `entry/`, `protocol/`, `language/`,
`responses/` and participant `export/json/`, `export/csv/`, `export/delete/` routes.
Requests include session cookies and CSRF tokens. The server supplies the A/B/C map.
Submission retries preserve exact JSON bytes, attempt ID and withdrawal key; success
requires an acknowledged matching ID. Responses and aggregate timings stay in memory
and are cleared after confirmed save; only a withdrawal key lives in sessionStorage.
Reloading loses unsaved answers. A saved receipt is recovered from the backend in
the same tab while its session and withdrawal key remain available, including after
a save whose acknowledgement was lost. This does not download answers automatically.
Theme/language preferences are independent.

The wire format is schema 2: `release`, `language`, `answers`, `answer_languages`,
`timings`, `mapping`, `seconds_heard`, `switches`, `submitted`. Nine rating question
IDs (`loudness_A` etc.) use option IDs `0` through `5`; background/genres/reasons use arrays of
option IDs. The multiple-reason revision rejects opposite pairs and keeps older
single-reason releases separate. All 17 timing entries include first seen/answered/last answered timestamps,
answer changes, visible active time and elapsed time while that question is shown.
Hidden-tab time is excluded from active time, and hidden tabs pause audio.

`node scripts/export-study-bundle.mjs` exports public question copy and metadata for
registration in the separate backend. Updating questions requires a matching new
revision; old releases remain immutable. This candidate supports the one synthetic
triplet currently in config, despite the intro currently saying two tracks. Final
stimuli and multi-track collection need a reviewed contract. It does not add telemetry
or Gold-MSI. `node --test tests/study.test.mjs` checks transport and measurements.

## Internal UI types

The UI components still use these in-memory types. This is **not** the API payload:


```json
{
  "study": "saturation-perceived-emotion-01",
  "language": "en",
  "participant": { "music_background": true, "music_background_type": "instrument, other", "music_background_other": "conducting", "headphones": "over-ear", "genres": "pop, other", "genres_other": "qawwali" },
  "trials": [
    {
      "track": "synth-pop-loop",
      "mapping": { "A": { "level": "more", "drive": 5 }, "B": { "level": "base", "drive": 2 }, "C": { "level": "less", "drive": 0 } },
      "ratings": {
        "loudness": { "A": 4, "B": 3, "C": 1 },
        "clarity": { "A": 2, "B": 3, "C": 5 },
        "emotion": { "A": 3, "B": 5, "C": 4 }
      },
      "why": { "kind": "most", "version": "B", "choices": ["harsher", "moreDynamic"] },
      "switches": 2,
      "seconds_heard": { "A": 8.3, "B": 3.3, "C": 4.8 }
    }
  ],
  "consented": "2026-11-04T15:50:14.134Z",
  "submitted": "2026-11-04T15:50:40.442Z"
}
```

Ratings are 0–5 for each version. `why.choices` holds every reason the participant ticked (opposite pairs such as harsher/softer cannot both be selected), and `why` is only recorded when one version is rated uniquely highest on emotion (or, if the top is tied, uniquely lowest); `kind` is `most` or `least` and `version` names the version asked about, so the answer can be read without the random A/B/C mapping. When all three emotion ratings are equal, or both the top and the bottom are tied, no `why` is recorded. When **Other** is ticked a free-text field appears and the text is stored in `genres_other`. Genres are stored as comma-separated ids (`pop`, `rockIndie`, `hiphopRap`, `rnbSoul`, `electronic`, `jazzBlues`, `classical`, `latin`, `folk`, `metal`, `singerSongwriter`, `soundtrack`, `world`, `other`); the field is omitted when nothing is selected.

## Structure

```
src/
  App.tsx                 step flow and submission
  config.ts               study settings
  i18n.ts                 all interface text, 13 languages
  theme.ts                light / dark / system theme
  lib/audio.ts            synthesis, saturation, loudness matching, synced A/B/C player
  lib/tracks.ts           loads and prepares the configured tracks
  lib/submit.ts           internal UI response types
  lib/study-api.ts        session, CSRF, idempotent transport and receipts
  lib/study-bundle.ts     bundled questionnaire revision and public metadata
  lib/study-measurements.ts aggregate question timings
  components/study/       welcome, background, definitions, trial and genre steps
  components/ui/          shadcn/ui components
```


## Same-origin Pages gateway (synthetic testing)

`functions/integration/team-f/[[path]].js` forwards only participant API routes to
`https://api.soundandmusic.eu`. Set the build value `VITE_API_ORIGIN=same-origin`
and the matching `VITE_STUDY_RELEASE`. Runtime Pages bindings are
`MPC_GATEWAY_ENABLED=synthetic` and `MPC_FRONTEND_ORIGIN` set to the exact
frontend HTTPS origin. The backend must allow that same frontend origin.
The gateway fails closed without these exact settings. No backend credentials belong
in React or `VITE_*` variables. The API service must use its separate API-only URL
configuration and `__Host-mpc_api_*` cookies.

Only study cookies, CSRF and submission/withdrawal headers are forwarded. Request size
is bounded, redirects are rejected, and no caching, storage, payload logs or retries
are added. Admin routes never pass through this gateway. Static assets remain static.
Cloudflare now processes the proxied request in transit; PostgreSQL remains the system
of record. Review this changed data flow and deployed settings before activation.

Run `node --test tests/study.test.mjs tests/gateway.test.mjs` and verify the deployed
Pages/HTTPS save, retry, receipt and withdrawal flow before enabling any environment.
A local HTTP Docker test alone cannot validate the deployed gateway.
The production Pages branch remains main; publishing dev does not activate this code.
