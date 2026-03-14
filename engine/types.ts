/**
 * Shared types for the poetry anthology engine
 */

export interface PoemConfig {
  /** Poem identifier (folder name) */
  id: string;
  /** Title in Afrikaans */
  titleAf?: string;
  /** Title in English */
  titleEn?: string;
  /** Author name */
  author?: string;
  /** Background video: "filename.mp4" (legacy, in media/backgrounds/) or "poems/<id>/video.mp4" */
  background?: string;
  /** Background image: "poems/<id>/image.jpg" (fallback when no video) */
  image?: string;
  /** Music: "filename.mp3" (legacy, in media/music/) or "poems/<id>/audio.mp3" */
  music?: string;
  /** Duration per line in seconds */
  lineDuration?: number;
  /** Pause between lines in seconds */
  linePause?: number;
  /** Intro duration in seconds before first line */
  introDuration?: number;
  /** Outro duration in seconds after last line */
  outroDuration?: number;
}

export interface PoemData {
  id: string;
  config: PoemConfig;
  af: string[];
  en: string[];
}

export type PoemLanguage = "af" | "en";
