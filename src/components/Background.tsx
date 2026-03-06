import React from "react";
import { AbsoluteFill, OffthreadVideo, staticFile } from "remotion";

interface BackgroundProps {
  /** Filename relative to public/media/backgrounds/ (e.g. "waves.mp4") */
  src?: string | null;
  /** Opacity overlay (0-1) to darken for text readability */
  overlayOpacity?: number;
}

export const Background: React.FC<BackgroundProps> = ({
  src,
  overlayOpacity = 0.4,
}) => {
  if (!src) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#0a0a0f",
        }}
      />
    );
  }

  const videoSrc = staticFile(`media/backgrounds/${src}`);

  return (
    <AbsoluteFill>
      <OffthreadVideo
        src={videoSrc}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
      <AbsoluteFill
        style={{
          backgroundColor: "black",
          opacity: overlayOpacity,
        }}
      />
    </AbsoluteFill>
  );
};
