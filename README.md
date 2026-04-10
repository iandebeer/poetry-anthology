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
| `npm run optimize-pngs` | Shrink PNGs under `public/media/poems/` **without changing width/height** (default: palette + quality; `--lossless` for zlib-only). Then run **`convert-poems`** to refresh `poems/<id>/media/` |
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

The workflow **`.github/workflows/deploy-pages.yml`** runs on pushes to **`main`**, **`master`**, or **`poetry-anthology`**: it runs **`npm run pages:build`**, uploads **only** the **`export/`** folder, and deploys that folder as the **entire** site (not the repo root).

1. In the GitHub repo: **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions** (not “Deploy from a branch”). If Source is a **branch** with **/ (root)**, GitHub Pages serves the whole repository and Jekyll often shows **README.md** at **`/`** instead of the poetry HTML.
2. After a push, open **Actions** and confirm **Deploy GitHub Pages** completed (green). A failed or missing workflow leaves an old deploy or no site.
3. With **GitHub Actions**, the live site root is the **`export/`** build output. **`index.html`** and **`1-index.html`** are the same poem list; **`/`** shows Gedigte directly (no README).

Poem links use relative URLs, so they work at that project URL without a base path.

**If you deploy from a branch** (folder `/ (root)`): root **`index.html`** redirects to **`export/`** (same list there), and **`.nojekyll`** disables Jekyll so README is not the homepage. Prefer **GitHub Actions** so **`/`** is the anthology only.

### Custom domain (e.g. `iandebeer.co.za`)

Your domain name is **`iandebeer.co.za`** (not `iandebeer/co/za`). Use either the **apex** (`iandebeer.co.za`) or a **subdomain** (e.g. `www.iandebeer.co.za` or `gedigte.iandebeer.co.za`).

1. **Repository → Settings → Secrets and variables → Actions → Variables** (tab **Variables**): create **`PAGES_CUSTOM_DOMAIN`** with the **exact** hostname you want (e.g. `www.iandebeer.co.za`). The Pages workflow passes it as **`GITHUB_PAGES_CNAME`** so **`export/CNAME`** is generated on each deploy. For a one-off local build: `GITHUB_PAGES_CNAME=www.iandebeer.co.za npm run export-html`.

2. **DNS** at your registrar (for **GitHub Pages** with this repo as a **project site**, Git username **`iandebeer`**):
   - **Subdomain** (`www` or `gedigte` etc.): create a **CNAME** record: host `www` (or `gedigte`) → target **`iandebeer.github.io`**.
   - **Apex** (`iandebeer.co.za` with no subdomain): add **four A records** for **`@`** to GitHub’s IPs (see [GitHub: managing a custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site#configuring-an-apex-domain)); or use your DNS provider’s **ALIAS/ANAME** to **`iandebeer.github.io`** if supported.

3. **Repository → Settings → Pages → Custom domain**: enter the same hostname (e.g. `www.iandebeer.co.za`), save, and enable **Enforce HTTPS** once DNS validates.

4. Wait for DNS propagation (often minutes, sometimes up to 24–48 hours).

#### “InvalidDNSError” / “Domain’s DNS record could not be retrieved”

GitHub’s check **cannot see** the records it expects, or **DNS resolution fails** from the public internet.

| Check | What to do |
|--------|------------|
| **Cloudflare (or similar)** | Turn **proxy off** — **DNS only** / grey cloud (not orange). Proxied records often cause this exact error. Keep it **off** for GitHub Pages so HTTPS renewal keeps working. |
| **CNAME target** | Must be **`iandebeer.github.io`** only — no `https://`, no repo path, no `/poetry-anthology`. |
| **Apex** (`iandebeer.co.za`) | Use **four A records** for `@` (or the apex name your provider uses): **`185.199.108.153`**, **`185.199.109.153`**, **`185.199.110.153`**, **`185.199.111.153`**. Confirm [current IPs in GitHub’s docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site#configuring-an-apex-domain) in case they change. |
| **www** | Use a **CNAME** for `www` → **`iandebeer.github.io`**. Do **not** CNAME the apex `@` to `github.io` (invalid on many DNS systems). |
| **Where you edit DNS** | The domain’s **nameservers** must point to the provider where you added these records (registrar vs Cloudflare vs Route 53). |
| **Propagation** | After changes, wait and retry **Settings → Pages → Custom domain**, or run `dig www.iandebeer.co.za` / `dig iandebeer.co.za` from your machine. |

If you use **both** apex and `www` in GitHub, both need correct records; **“alternate name”** is often the second hostname you added (e.g. `www` when apex is primary).

#### DomainRegister.co.za (or similar ZA registrars)

1. Sign in at your registrar → open **Domains** / **My domains** → **`iandebeer.co.za`** → **DNS**, **DNS zone**, **ZDNS**, or **Manage DNS** (wording varies).
2. Confirm the domain’s **nameservers** are the ones for **where you are editing** these records (often the registrar’s own NS if DNS is hosted there). If NS point elsewhere (e.g. Cloudflare), you must add the A/CNAME records **there** instead.
3. **Apex** `iandebeer.co.za`: add **four A records** for the root host (often **`@`**, **blank**, or **`iandebeer.co.za`**) → GitHub’s four IPs (see table above). Remove conflicting old A records for `@` if the panel only allows one set.
4. **`www`**: add **CNAME** → host **`www`** → target **`iandebeer.github.io`** (no `https://`). Some panels want a **trailing dot**: `iandebeer.github.io.`
5. Save, wait a few minutes, then retry **GitHub → Settings → Pages → Custom domain**.

## Resolution

Videos are rendered at **1920×1080** at 30fps.
