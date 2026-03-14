import React from "react";
import { AbsoluteFill, OffthreadVideo, Img, staticFile } from "remotion";

interface BackgroundProps {
  /** Video: "waves.mp4" (legacy) or "poems/<id>/video.mp4" */
  src?: string | null;
  /** Image fallback: "poems/<id>/image.jpg" */
  imageSrc?: string | null;
  /** Opacity overlay (0-1) to darken for text readability */
  overlayOpacity?: number;
}

export const Background: React.FC<BackgroundProps> = ({
  src,
  imageSrc,
  overlayOpacity = 0.4,
}) => {
  const videoPath = src
    ? staticFile(src.startsWith("poems/") ? `media/${src}` : `media/backgrounds/${src}`)
    : null;
  const imgPath = imageSrc
    ? staticFile(`media/${imageSrc}`)
    : null;

  if (!videoPath && !imgPath) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#0a0a0f",
        }}
      />
    );
  }

  return (
    <AbsoluteFill>
      {videoPath ? (
        <OffthreadVideo
          src={videoPath}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : imgPath ? (
        <Img
          src={imgPath}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          backgroundColor: "black",
          opacity: overlayOpacity,
        }}
      />
    </AbsoluteFill>
  );
};
