import React, { type ComponentType } from "react";
import { Composition } from "remotion";
import { PoemFilm } from "./PoemFilm";
import poemsData from "./poemsData.json";
import type { PoemData, PoemLanguage } from "../engine/types.js";

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;

function calculateDuration(poem: PoemData, lang: PoemLanguage): number {
  const lines = lang === "af" ? poem.af : poem.en;
  const config = poem.config;
  const lineDuration = (config.lineDuration ?? 6) + (config.linePause ?? 1);
  const intro = config.introDuration ?? 2;
  const outro = config.outroDuration ?? 4;
  return Math.ceil((intro + lines.length * lineDuration + outro) * FPS);
}

export const RemotionRoot: React.FC = () => {
  const poems = poemsData as PoemData[];

  return (
    <>
      {poems.flatMap((poem) =>
        (["af", "en"] as PoemLanguage[]).map((lang) => (
          <Composition
            key={`${poem.id}-${lang}`}
            id={`${poem.id}-${lang}`}
            component={PoemFilm as unknown as ComponentType<Record<string, unknown>>}
            durationInFrames={calculateDuration(poem, lang)}
            width={WIDTH}
            height={HEIGHT}
            fps={FPS}
            defaultProps={{
              poem,
              language: lang,
            }}
          />
        ))
      )}
    </>
  );
};
