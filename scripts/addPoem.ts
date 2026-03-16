/**
 * Add a new poem (Afrikaans) to the anthology.
 *
 * Usage:
 *   npx tsx scripts/addPoem.ts <id> [options]
 *   npx tsx scripts/addPoem.ts  # interactive mode
 *
 * Options:
 *   --translate    Run AI translation to generate en.md (requires OPENAI_API_KEY)
 *   --author       Author name
 *   --title-af     Afrikaans title
 *   --title-en     English title
 *
 * Or use programmatically:
 *   import { addPoem } from "./scripts/addPoem.js";
 *   await addPoem({ id: "my-poem", afContent: "..." });
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const POEMS_DIR = join(process.cwd(), "poems");
const MEDIA_POEMS_DIR = join(process.cwd(), "public", "media", "poems");

export interface AddPoemOptions {
  /** Poem ID (folder name, use kebab-case) */
  id: string;
  /** Afrikaans content (markdown). Omit to create directory structure only. */
  afContent?: string;
  /** Author name */
  author?: string;
  /** Afrikaans title (default: extracted from first # line or id) */
  titleAf?: string;
  /** English title */
  titleEn?: string;
  /** Run AI translation for en.md (only when afContent provided) */
  translate?: boolean;
}

function extractTitle(md: string): string | undefined {
  const match = md.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

export async function addPoem(options: AddPoemOptions): Promise<string> {
  const { id, afContent, author, titleAf, titleEn, translate: doTranslate } = options;

  const poemDir = join(POEMS_DIR, id);
  if (existsSync(poemDir)) {
    throw new Error(`Poem already exists: ${id}`);
  }

  mkdirSync(poemDir, { recursive: true });
  mkdirSync(join(MEDIA_POEMS_DIR, id), { recursive: true });

  const displayTitle = id.replace(/-/g, " ");
  const afTitle = titleAf ?? (afContent ? extractTitle(afContent) : undefined) ?? displayTitle;
  const config = {
    titleAf: afTitle,
    titleEn: titleEn ?? afTitle,
    author: author ?? "",
    lineDuration: 5,
    linePause: 1,
    introDuration: 3,
    outroDuration: 5,
  };
  const configPath = join(poemDir, "config.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

  if (afContent) {
    const afPath = join(poemDir, "af.md");
    writeFileSync(afPath, afContent.trimEnd() + "\n", "utf-8");

    let enContent: string;
    if (doTranslate && process.env.OPENAI_API_KEY) {
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Translate Afrikaans poetry into natural poetic English while preserving tone, rhythm, and imagery.",
          },
          { role: "user", content: afContent },
        ],
      });
      let result = response.choices[0].message.content ?? "";
      result = result.replace(/\brhymically\b/gi, "rhythmically");
      enContent = result;
    } else {
      enContent = doTranslate
        ? "# Translation failed (set OPENAI_API_KEY)\n\nRun `npm run translate` to generate."
        : "# Translation pending\n\nRun `npm run translate` to generate en.generated.md, then copy to en.md.";
    }

    const enPath = join(poemDir, "en.md");
    writeFileSync(enPath, enContent.trimEnd() + "\n", "utf-8");
  }

  return poemDir;
}

async function main() {
  const args = process.argv.slice(2);
  const hasTranslate = args.includes("--translate");
  const filtered = args.filter((a) => !a.startsWith("--"));
  const id = filtered[0];

  if (!id) {
    console.log(`
Add a new poem to the anthology.

Usage:
  npx tsx scripts/addPoem.ts <id> [options]

Creates directory structure only (poems/<id>/, public/media/poems/<id>/, config.json).
Add af.md and en.md manually.

Options:
  --translate    With piped content: generate en.md via AI (requires OPENAI_API_KEY)
  --author NAME   Author name
  --title-af T    Afrikaans title
  --title-en T    English title

Examples:
  npx tsx scripts/addPoem.ts my-new-poem
  cat poem.md | npx tsx scripts/addPoem.ts my-poem --translate
`);
    process.exit(0);
  }

  const getArg = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const author = getArg("--author");
  const titleAf = getArg("--title-af");
  const titleEn = getArg("--title-en");

  let afContent: string;
  if (process.stdin.isTTY) {
    afContent = "";
  } else {
    afContent = await new Promise<string>((resolve) => {
      const chunks: Buffer[] = [];
      process.stdin.on("data", (c) => chunks.push(c));
      process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    });
  }

  try {
    const path = await addPoem({
      id,
      afContent: afContent.trim() || undefined,
      author,
      titleAf,
      titleEn,
      translate: hasTranslate,
    });
    console.log(`Created: ${path}`);
    console.log(`Add af.md and en.md to poems/${id}/`);
    console.log(`Add media to public/media/poems/${id}/: video.mp4, image.jpg, audio.mp3`);
    if (afContent && !hasTranslate) {
      console.log("Run `npm run translate` to generate English, then copy en.generated.md → en.md");
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

if (process.argv[1]?.includes("addPoem")) {
  main();
}
