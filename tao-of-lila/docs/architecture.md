# Architecture

The application follows a small functional-core, imperative-shell structure.

## Functional core

- `Domain.Types` defines immutable records for Leela states, hexagrams,
  moving lines, readings, and interpretations.
- `Engine.Reading` turns a `ReadingRequest` and loaded `DomainData` into a
  `Reading` without IO.
- `Interpretation.Engine` composes meaning from state, change pattern, and
  active lines without knowing about HTTP, files, or databases.

## Imperative shell

- `Domain.Loading` reads JSON files at startup.
- `API.Server` exposes the pure engine through Servant endpoints.
- `app/Main.hs` resolves the port, loads data, and starts Warp.

## Boundary rule

Domain logic should not import API, persistence, or deployment modules. New
features should keep the direction of dependency pointed inward:

```text
Main/API/Storage -> Engine/Interpretation -> Domain
```

This preserves the project principle:

```text
Input -> Transformation -> Interpretation -> Output
```
