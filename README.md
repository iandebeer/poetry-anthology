# Poetry Film Anthology

A cinematic anthology of poems built with [Remotion](https://remotion.dev). Each poem exists in Afrikaans and English, producing cinematic videos with animated text, background video, and music.

## Setup

```bash
npm install
npm run dev
```

Requires Node.js 18+. If `npm install` fails (e.g. esbuild on Node 25), try Node 18 or 20.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Remotion Studio (preview compositions) |
| `npm run render` | Render a single poem: `npm run render -- <poemId> [af\|en]` |
| `npm run render:all` | Render all poems (Afrikaans + English) to `output/videos/` |

## Project Structure

```
poems/           # One folder per poem
  <poem-id>/
    af.md        # Afrikaans text (one line per line)
    en.md        # English text
    config.json  # Metadata: title, author, timing, media paths

media/           # Source media (also use public/media/ for Remotion)
  music/
  backgrounds/

public/media/    # Static assets for Remotion (backgrounds, music)
  backgrounds/
  music/

src/
  Root.tsx       # Registers all poem compositions
  PoemFilm.tsx   # Main composition component
  components/
    PoemText.tsx # Animated poem lines
    Background.tsx # Background video layer

engine/
  loadPoems.ts   # Scans poems/ folder
  renderPoem.ts  # Renders a single poem via Remotion

scripts/
  renderAll.ts
  renderPoem.ts
  translatePoems.ts
  generatePoemsData.ts
```

## Adding a Poem

1. Create `poems/<slug>/` with `af.md`, `en.md`, and `config.json`
2. Run `npm run generate-poems` (or `npm run dev` which runs it automatically)
3. Add optional background/music to `public/media/` and reference in config

## config.json Options

```json
{
  "titleAf": "Afrikaans title",
  "titleEn": "English title",
  "author": "Author name",
  "background": "filename.mp4",
  "music": "filename.mp3",
  "lineDuration": 6,
  "linePause": 1.5,
  "introDuration": 2,
  "outroDuration": 4
}
```

- `background`: filename in `public/media/backgrounds/`
- `music`: filename in `public/media/music/`

## Resolution

Videos are rendered at **1920×1080** at 30fps.
