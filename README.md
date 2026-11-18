# Team F Listening Study

Online listening test for the Team F project in Music Perception and Cognition (Universitat Pompeu Fabra). Participants hear each track in three saturation levels at matched loudness, switch between them while the music plays, and rate each version from 0 to 5 for loudness, clarity and perceived emotional intensity.

Live site: https://listening.bdim.es

> [!IMPORTANT]
> **Pushing to `main` deploys to production.** The repository is connected to Cloudflare Pages, so every push to `main` is built and published to https://listening.bdim.es within a minute or two. Pushes to other branches get a preview URL on `*.team-f-saturation-trial.pages.dev`. Use a branch for anything you are not ready to show participants.

> [!WARNING]
> **There is no backend yet, so responses are not stored.** When a participant submits, the response is only printed to the browser console (`study response`) and then discarded. Do not share the link with real participants until `VITE_SUBMIT_URL` points to a server that saves the data.

## Study flow

1. Welcome page with study information and a consent checkbox
2. Background questions: musical background, headphone type
3. Definitions of clarity, loudness and perceived emotion
4. For each track: three versions (A, B, C in random order), each must be heard for at least 3 seconds, then three rating pages (loudness, clarity, emotion), each rating A, B and C from 0 to 5. When one version is rated uniquely highest on emotion (or, if the top is tied, uniquely lowest), a follow-up asks why.
5. Optional multiple-choice question about preferred genres, then submit

The interface is available in English (default), Spanish, Catalan, French, German, Italian, Portuguese, Dutch, Polish, Swedish, Greek, Turkish and Chinese, with light, dark and system themes. Add `?lang=es` (or any other code) to a link to open it in that language.

## Development

Requires Node 22 and pnpm 11.

```bash
pnpm install
pnpm dev
```

`pnpm build` writes the static site to `dist/`.

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
| `VITE_SUBMIT_URL` | Endpoint that receives each response as a JSON `POST`. Not set yet, see the warning above. |

Text for every language is in `src/i18n.ts`. The translations have not been checked by native speakers yet.

## Response format

Each submission is one JSON object:

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
      "why": { "kind": "most", "version": "B", "choice": "harsher" },
      "switches": 2,
      "seconds_heard": { "A": 8.3, "B": 3.3, "C": 4.8 }
    }
  ],
  "consented": "2026-11-04T15:50:14.134Z",
  "submitted": "2026-11-04T15:50:40.442Z"
}
```

Ratings are 0–5 for each version. `why` is only recorded when one version is rated uniquely highest on emotion (or, if the top is tied, uniquely lowest); `kind` is `most` or `least` and `version` names the version asked about, so the answer can be read without the random A/B/C mapping. When all three emotion ratings are equal, or both the top and the bottom are tied, no `why` is recorded. Genres are stored as comma-separated ids (`pop`, `rockIndie`, `hiphopRap`, `rnbSoul`, `electronic`, `jazzBlues`, `classical`, `latin`, `folk`, `metal`, `singerSongwriter`, `soundtrack`, `world`, `other`); the field is omitted when nothing is selected.

## Structure

```
src/
  App.tsx                 step flow and submission
  config.ts               study settings
  i18n.ts                 all interface text, 13 languages
  theme.ts                light / dark / system theme
  lib/audio.ts            synthesis, saturation, loudness matching, synced A/B/C player
  lib/tracks.ts           loads and prepares the configured tracks
  lib/submit.ts           response types and submission
  components/study/       welcome, background, definitions, trial and genre steps
  components/ui/          shadcn/ui components
```
