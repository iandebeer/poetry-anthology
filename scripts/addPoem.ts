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

export interface AddPoemOptions {
  /** Poem ID (folder name, use kebab-case) */
  id: string;
  /** Afrikaans content (markdown) */
  afContent: string;
  /** Author name */
  author?: string;
  /** Afrikaans title (default: extracted from first # line) */
  titleAf?: string;
  /** English title */
  titleEn?: string;
  /** Run AI translation for en.md */
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

  const afTitle = titleAf ?? extractTitle(afContent);
  const config = {
    titleAf: afTitle ?? id,
    titleEn: titleEn ?? afTitle ?? id,
    author: author ?? "",
    lineDuration: 5,
    linePause: 1,
    introDuration: 3,
    outroDuration: 5,
  };
  const configPath = join(poemDir, "config.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

  return poemDir;
}

async function main() {
  const args = process.argv.slice(2);
  const hasTranslate = args.includes("--translate");
  const filtered = args.filter((a) => !a.startsWith("--"));
  const id = filtered[0];

  if (!id) {
    console.log(`
Add a new poem (Afrikaans) to the anthology.

Usage:
  npx tsx scripts/addPoem.ts <id> [options]

Options:
  --translate    Generate English translation via AI (requires OPENAI_API_KEY)
  --author NAME   Author name
  --title-af T    Afrikaans title
  --title-en T    English title

Example:
  npx tsx scripts/addPoem.ts my-new-poem --translate --author "Ian de Beer"

Then paste your Afrikaans poem when prompted, or pipe it:
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
    console.log("Paste your Afrikaans poem (markdown). End with Ctrl+D (Unix) or Ctrl+Z (Windows):\n");
    afContent = await new Promise<string>((resolve) => {
      const chunks: Buffer[] = [];
      process.stdin.on("data", (c) => chunks.push(c));
      process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    });
  } else {
    afContent = await new Promise<string>((resolve) => {
      const chunks: Buffer[] = [];
      process.stdin.on("data", (c) => chunks.push(c));
      process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    });
  }

  if (!afContent.trim()) {
    console.error("No poem content provided.");
    process.exit(1);
  }

  try {
    const path = await addPoem({
      id,
      afContent: afContent.trim(),
      author,
      titleAf,
      titleEn,
      translate: hasTranslate,
    });
    console.log(`Created poem: ${path}`);
    if (!hasTranslate) {
      console.log("Run `npm run translate` to generate English, then copy en.generated.md → en.md");
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
