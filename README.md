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
| `npm run admin` | Web admin UI (login-protected) at http://localhost:3333/admin |
| `npm run render` | Render a single poem: `npm run render -- <poemId> [af\|en]` |
| `npm run render:all` | Render all poems (Afrikaans + English) to `output/videos/` |
| `npm run export-kindle` | Export all poems to EPUB for KDP (`dist/Digbundel.epub` or `Anthology.epub`). Options: `--title`, `--author`, `--output`, `--lang` (`af`, `en`, or `both`) |
| `npm run export-html` | Convert markdown to HTML then copy to `export/<slug>.html` (run `convert-poems` first or use admin **Export HTML bundle**) |

Generated `af.html` / `en.html` / `export/*.html` embed background images as **absolute `file://` URLs** so opening the file in a browser (double-click) still loads images. Re-run **convert-poems** after moving the project folder so those paths stay valid. The admin poem preview uses normal `/media/…` URLs instead.

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

public/media/    # Static assets for Remotion
  poems/<id>/     # Per-poem: video.mp4, image.jpg, audio.mp3 (auto-detected)
  backgrounds/    # Legacy shared backgrounds
  music/         # Legacy shared music

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

1. Run `npm run add-poem <slug>` and paste your Afrikaans poem (or use `cat poem.md | npm run add-poem <slug>`)
2. Run `npm run translate` to generate English, then copy `en.generated.md` → `en.md`
3. Add media to `public/media/poems/<slug>/`:
   - `video.mp4` – background video
   - `image.jpg` – background image (fallback when no video)
   - `audio.mp3` – music/sound
4. Run `npm run generate-poems` (or `npm run dev` which runs it automatically)

## Per-Poem Media

Each poem can have its own unique media in `public/media/poems/<poem-id>/`:

| File | Purpose |
|------|---------|
| `video.mp4` (or `.mov`, `.webm`) | Background video |
| `image.jpg` (or `.png`, `.webp`) | Background image (Remotion fallback when no video; also used as background when viewing poem HTML in admin). Prefix for text placement: `t-image.jpg`=top, `b-image.jpg`=bottom, `l-image.jpg`=left, `r-image.jpg`=right |
| `audio.mp3` (or `.wav`, `.m4a`) | Music/sound |

Files are auto-detected. Config overrides (e.g. `background`, `music`) take precedence.

## config.json Options

```json
{
  "titleAf": "Afrikaans title",
  "titleEn": "English title",
  "author": "Author name",
  "background": "poems/<id>/video.mp4",
  "image": "poems/<id>/image.jpg",
  "music": "poems/<id>/audio.mp3",
  "lineDuration": 6,
  "linePause": 1.5,
  "introDuration": 2,
  "outroDuration": 4
}
```

- `background` / `image` / `music`: omit to auto-detect from `public/media/poems/<id>/`, or set explicitly

## Admin UI

Run `npm run admin` to start the web-based admin at http://localhost:3333/admin. It provides:

- **Login** – Session-based auth (set `ADMIN_PASSWORD` and optionally `ADMIN_USER` in env)
- **Add poem** – Create new poems with optional AI translation
- **Operations** – Translate all, generate poems data, convert to HTML/text, generate Afrikaans dictionary, export Kindle EPUB, export HTML bundle

Default credentials: `admin` / `changeme` (change via env in production).

### Production / security

- Set **`ADMIN_PASSWORD`** (and optionally **`ADMIN_USER`**) — never expose the default password on a public host.
- Set **`SESSION_SECRET`** to a long random string so session cookies cannot be forged.
- Poem API routes validate paths so IDs like `../..` cannot escape the `poems/` directory.
- Use **`NODE_ENV=production`** and HTTPS so the session cookie is marked `secure`.

## Resolution

Videos are rendered at **1920×1080** at 30fps.
