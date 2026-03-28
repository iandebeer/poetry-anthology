/**
 * For each temp/*.png: extract Afrikaans poem text via vision (OpenAI) and write
 *   poems/<file-stem>/af.md
 *   poems/<file-stem>/config.json
 *
 * Folder name = PNG basename without extension (e.g. hier.png → poems/hier/).
 * No en.md — loadPoems uses Afrikaans lines for the English track until you add en.md.
 *
 * Requires: OPENAI_API_KEY
 * Run: npx tsx scripts/importTempPoems.ts
 */

import "dotenv/config";
import OpenAI from "openai";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const TEMP = path.join(ROOT, "temp");
const POEMS = path.join(ROOT, "poems");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/** Directory name under poems/ — same as input filename without .png */
function poemIdFromPng(basename: string): string {
  return basename.replace(/\.png$/i, "");
}

interface ExtractedAf {
  titleAf: string;
  bodyAf: string;
}

async function extractAfrikaansFromImage(imagePath: string): Promise<ExtractedAf> {
  const b64 = fs.readFileSync(imagePath).toString("base64");
  const url = `data:image/png;base64,${b64}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You transcribe Afrikaans poetry from images (caption bars, overlays, or typed text). " +
          "Return only valid JSON: titleAf (string, no leading #), bodyAf (full poem text only). " +
          "Use \\n\\n between stanzas in bodyAf and \\n for line breaks within a stanza. " +
          "Do not put a markdown heading inside bodyAf.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe the Afrikaans poem from this image as JSON." },
          { type: "image_url", image_url: { url } },
        ],
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid JSON from model: ${raw.slice(0, 200)}`);
  }

  const titleAf = String(data.titleAf ?? "").trim();
  const bodyAf = String(data.bodyAf ?? "").trim().replace(/\\n/g, "\n");

  if (!titleAf || !bodyAf) {
    throw new Error("Missing titleAf or bodyAf in model response");
  }

  return { titleAf, bodyAf };
}

function writePoemAfOnly(poemId: string, extracted: ExtractedAf): void {
  const dir = path.join(POEMS, poemId);
  fs.mkdirSync(dir, { recursive: true });

  const afMd = `# ${extracted.titleAf}\n\n${extracted.bodyAf}\n`;
  fs.writeFileSync(path.join(dir, "af.md"), afMd, "utf-8");

  const config = {
    titleAf: extracted.titleAf,
    titleEn: extracted.titleAf,
    author: "",
    lineDuration: 5,
    linePause: 1,
    introDuration: 3,
    outroDuration: 5,
  };
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(config, null, 2) + "\n", "utf-8");
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.error("Set OPENAI_API_KEY in .env (vision extraction requires it).");
    process.exit(1);
  }

  if (!fs.existsSync(TEMP)) {
    console.error("Missing temp/ directory");
    process.exit(1);
  }

  const files = fs
    .readdirSync(TEMP)
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .sort();

  if (files.length === 0) {
    console.error("No PNG files in temp/");
    process.exit(1);
  }

  for (const file of files) {
    const src = path.join(TEMP, file);
    const poemId = poemIdFromPng(file);
    console.log(`\n→ ${file}  → poems/${poemId}/af.md`);

    try {
      const extracted = await extractAfrikaansFromImage(src);
      writePoemAfOnly(poemId, extracted);
      console.log(`  “${extracted.titleAf}”`);
    } catch (e) {
      console.error(`  failed:`, e);
    }
  }

  console.log("\nRunning generate-poems…");
  execFileSync("npm", ["run", "generate-poems"], { stdio: "inherit", cwd: ROOT });
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
