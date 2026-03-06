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
  /** Background video path (relative to media/backgrounds/) */
  background?: string;
  /** Music path (relative to media/music/) */
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
