# The Tao of Lila

The Tao of Lila is a contemplative game and self-inquiry platform that combines
Leela states of consciousness, I Ching hexagrams, moving lines, and functional
state transformations.

The core model is:

```text
State -> Change -> Meaning
```

Everything in this initial project keeps the domain logic independent of UI,
persistence, and deployment concerns.

## Stack

- Haskell
- Cabal
- Servant
- Aeson
- Warp

## Project layout

```text
app/
  Main.hs              # HTTP executable entry point
  public/index.html    # Minimal browser UI
src/
  Domain/              # Domain types and JSON loading
  Engine/              # Pure reading generation
  API/                 # Servant API
  Interpretation/      # Interpretation composition
data/
  leela.json           # Seed Leela state data
  hexagrams.json       # Seed I Ching hexagram data
  lines.json           # Moving-line lesson data
test/
docs/
```

## Run locally

```bash
cabal update
cabal run tao-of-lila-api
```

The service listens on `PORT` when set, otherwise `8080`.

Open `http://localhost:8080/` for the minimal UI.

## Test

```bash
cabal test
```

## API

### `GET /health`

Returns service health.

### `GET /states`

Returns loaded Leela states.

### `GET /hexagrams`

Returns loaded hexagrams.

### `POST /reading`

Generates a full reading.

```json
{
  "question": "What state is asking to be seen?",
  "leelaStateId": 2,
  "hexagramNumber": 24,
  "movingLines": [1, 5]
}
```

Only `question` is required. When state, hexagram, or moving lines are omitted,
the pure engine derives them deterministically from the inquiry.

### `POST /interpret`

Accepts the same payload as `/reading` and returns only the interpretation.

## Data status

The engine supports the intended 72 Leela states and 64 hexagrams, but the
initial repository contains a representative seed dataset. Expanding the corpus
is a data-entry task in `data/leela.json` and `data/hexagrams.json`.

## Heroku

The app reads Heroku's `PORT` environment variable. A `Procfile` and Dockerfile
are included for deployment paths that build the Cabal executable.
