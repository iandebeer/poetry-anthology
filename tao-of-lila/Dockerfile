FROM haskell:9.8.2 AS build

WORKDIR /opt/tao-of-lila
COPY tao-of-lila.cabal ./
RUN cabal update && cabal build --only-dependencies

COPY . ./
RUN cabal build exe:tao-of-lila-api
RUN mkdir -p /opt/dist && cp "$(cabal list-bin exe:tao-of-lila-api)" /opt/dist/tao-of-lila-api

FROM debian:bookworm-slim

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates libgmp10 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /opt/dist/tao-of-lila-api /usr/local/bin/tao-of-lila-api
COPY data ./data
COPY app/public ./app/public

ENV PORT=8080
EXPOSE 8080

CMD ["tao-of-lila-api"]
