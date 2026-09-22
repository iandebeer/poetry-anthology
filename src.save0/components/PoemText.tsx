import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

interface PoemTextProps {
  lines: string[];
  /** Index of the line to show (0-based) */
  lineIndex: number;
  /** Frames for fade in */
  fadeInFrames?: number;
  /** Frames for fade out */
  fadeOutFrames?: number;
  /** Frames this line is fully visible */
  holdFrames?: number;
  /** Total frames for this line segment */
  segmentFrames: number;
}

export const PoemText: React.FC<PoemTextProps> = ({
  lines,
  lineIndex,
  fadeInFrames = 30,
  fadeOutFrames = 30,
  holdFrames = 60,
  segmentFrames,
}) => {
  const frame = useCurrentFrame();

  const line = lines[lineIndex];
  if (!line) return null;

  const opacity = interpolate(
    frame,
    [0, fadeInFrames, fadeInFrames + holdFrames, segmentFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const translateY = interpolate(
    frame,
    [0, fadeInFrames],
    [20, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: 80,
      }}
    >
      <p
        style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: 42,
          lineHeight: 1.8,
          color: "white",
          textAlign: "center",
          maxWidth: 1200,
          margin: 0,
          opacity,
          transform: `translateY(${translateY}px)`,
          textShadow: "0 2px 20px rgba(0,0,0,0.8)",
        }}
      >
        {line}
      </p>
    </AbsoluteFill>
  );
};
