# Poetry Film Anthology

A cinematic anthology of poems built with [Remotion](https://remotion.dev). Each poem exists in Afrikaans and English, producing cinematic videos with animated text, background video, and music.

## Setup

```bash
npm install
npm run dev
```

Requires Node.js 18+. If `npm install` fails (e.g. esbuild on Node 25), try Node 18 or 20.

## Environment

Create a **`.env`** file in the **project root** (it is gitignored; never commit secrets):

| Variable | Required | Purpose |
|----------|----------|---------|
| `ADMIN_PASSWORD` | For production admin | Login password for `/admin` |
| `ADMIN_USER` | Optional | Login username (default `admin`) |
| `SESSION_SECRET` | Recommended | Random string so session cookies cannot be forged |
| `ADMIN_PORT` | Optional | Admin server port (default `3333`) |
| `OPENAI_API_KEY` | Optional | `npm run translate`, `add-poem --translate`, and admin translate features |

The admin server loads `.env` via [dotenv](https://github.com/motdotla/dotenv). CLI scripts that call OpenAI read `OPENAI_API_KEY` from the environment.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Remotion Studio (preview compositions) |
| `npm run admin` | Web admin UI (login-protected) at http://localhost:3333/admin |
| `npm run render` | Render a single poem: `npm run render -- <poemId> [af\|en]` |
| `npm run render:all` | Render all poems (Afrikaans + English) to `output/videos/` |
| `npm run translate` | Generate/update English from Afrikaans (needs `OPENAI_API_KEY`) |
| `npm run convert-poems` | Convert `af.md` / `en.md` to `.html` & `.txt`, sync backgrounds into `poems/<id>/media/` |
| `npm run add-poem` | Add a poem folder: `npm run add-poem <slug>` (optional `--translate`) |
| `npm run generate-poems` | Regenerate `src/poemsData.json` from `poems/` |
| `npm run generate-af-dict` | Generate Afrikaans dictionary asset used by the project |
| `npm run export-kindle` | Export all poems to EPUB for KDP (`dist/Digbundel.epub` or `Anthology.epub`). Options: `--title`, `--author`, `--output`, `--lang` (`af`, `en`, or `both`) |
| `npm run export-html` | After **convert-poems**, writes **`export/1-index.html`** (index of all poems; name sorts first in folder listings), plus each `export/<id>/afrikaans.html`, optional `english.html`, and `export/<id>/media/` — open that file in a normal browser from disk, or run **`cd export && python3 -m http.server`** and open **`http://127.0.0.1:8000/1-index.html`** if your editor’s HTML preview blocks local links |
| `npm run pages:build` | **`convert-poems` + `export-html`** — used by the GitHub Pages workflow to publish the static bundle |

**HTML backgrounds:** `npm run convert-poems` copies the chosen image from `public/media/poems/<id>/` into **`poems/<id>/media/`** and references it as **`media/<file>`** (relative to `af.html` / `en.html`). Open those files directly in a browser or use `export/<id>/afrikaans.html` (and `english.html` when present) the same way. The admin UI still serves images from **`/media/…`** (not the bundled copy).

## Project Structure

```
poems/           # One folder per poem
  <poem-id>/
    af.md        # Afrikaans text (one line per line)
    en.md        # English text
    config.json  # Metadata: title, author, timing, media paths
    media/       # Populated by convert-poems: copy of background image for relative HTML paths

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

## GitHub Pages (static poems + media)

The workflow **`.github/workflows/deploy-pages.yml`** runs on pushes to **`main`** or **`master`**: it runs **`npm run pages:build`**, uploads the **`export/`** folder (list + `export/<id>/afrikaans.html`, `english.html`, `media/`), and deploys it as the site.

1. In the GitHub repo: **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions** (not “Deploy from a branch”).
2. Push to your default branch (or run the workflow manually under **Actions**).
3. The site URL is **`https://<user>.github.io/<repo>/`** — **`index.html`** redirects to **`1-index.html`**.

Poem links use relative URLs, so they work at that project URL without a base path.

## Resolution

Videos are rendered at **1920×1080** at 30fps.
