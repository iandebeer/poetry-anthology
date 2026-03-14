import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig, Audio, staticFile } from "remotion";
import { Background } from "./components/Background";
import { PoemText } from "./components/PoemText";
import type { PoemData, PoemLanguage } from "../engine/types.js";

export interface PoemFilmProps {
  poem: PoemData;
  language: PoemLanguage;
}

const DEFAULT_LINE_DURATION = 6;
const DEFAULT_LINE_PAUSE = 1;
const DEFAULT_INTRO = 2;

export const PoemFilm: React.FC<PoemFilmProps> = ({ poem, language }) => {
  const { fps } = useVideoConfig();
  const lines = language === "af" ? poem.af : poem.en;
  const config = poem.config;

  const lineDuration = (config.lineDuration ?? DEFAULT_LINE_DURATION) * fps;
  const linePause = (config.linePause ?? DEFAULT_LINE_PAUSE) * fps;
  const introDuration = (config.introDuration ?? DEFAULT_INTRO) * fps;

  const segmentFrames = Math.round(lineDuration + linePause);
  const fadeInFrames = Math.round(fps * 1.5);
  const fadeOutFrames = Math.round(fps * 1.5);
  const holdFrames = segmentFrames - fadeInFrames - fadeOutFrames;

  const backgroundPath = config.background ?? null;
  const imagePath = config.image ?? null;
  const musicPath = config.music
    ? staticFile(config.music.startsWith("poems/") ? `media/${config.music}` : `media/music/${config.music}`)
    : null;

  return (
    <AbsoluteFill>
      <Background src={backgroundPath} imageSrc={imagePath} overlayOpacity={0.5} />

      {musicPath && (
        <Audio src={musicPath} volume={0.3} />
      )}

      {lines.map((_, i) => (
        <Sequence
          key={i}
          from={introDuration + i * segmentFrames}
          durationInFrames={segmentFrames}
        >
          <PoemText
            lines={lines}
            lineIndex={i}
            fadeInFrames={fadeInFrames}
            fadeOutFrames={fadeOutFrames}
            holdFrames={Math.max(30, holdFrames)}
            segmentFrames={segmentFrames}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
