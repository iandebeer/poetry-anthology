/**
 * Batch-translate Afrikaans poems to English.
 * Writes en.generated.md only when en.md is missing (never overwrites en.md).
 *
 * Run: npm run translate  (requires OPENAI_API_KEY)
 */

import OpenAI from "openai";
import fs from "fs";
import path from "path";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const poemsDir = path.join(process.cwd(), "poems");

async function translate(text: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Translate Afrikaans poetry into natural poetic English while preserving tone, rhythm, and imagery.",
      },
      {
        role: "user",
        content: text,
      },
    ],
  });
  let result = response.choices[0].message.content ?? "";
  result = result.replace(/\brhymically\b/gi, "rhythmically");
  return result;
}

function shouldSkipPoem(poemId: string): { skip: true; reason: string } | { skip: false } {
  const dir = path.join(poemsDir, poemId);
  const afPath = path.join(dir, "af.md");
  const enPath = path.join(dir, "en.md");

  if (!fs.existsSync(afPath)) {
    return { skip: true, reason: "no af.md" };
  }
  // Manual English present — do not call the API or touch en.generated.md for this poem.
  if (fs.existsSync(enPath)) {
    return { skip: true, reason: "en.md exists" };
  }
  return { skip: false };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("Set OPENAI_API_KEY in your environment. Get a key at https://platform.openai.com/api-keys");
    process.exit(1);
  }

  if (!fs.existsSync(poemsDir)) {
    console.error("Poems directory not found:", poemsDir);
    process.exit(1);
  }

  const entries = fs.readdirSync(poemsDir, { withFileTypes: true });
  let translated = 0;
  let skippedEn = 0;
  let skippedOther = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const poem = entry.name;
    if (poem.startsWith(".")) continue;

    const decision = shouldSkipPoem(poem);
    if (decision.skip) {
      if (decision.reason === "en.md exists") {
        skippedEn++;
        console.log("Skipped (en.md exists):", poem);
      } else {
        skippedOther++;
      }
      continue;
    }

    const afPath = path.join(poemsDir, poem, "af.md");
    const afText = fs.readFileSync(afPath, "utf8");
    console.log("Afrikaans text:");
    console.log(afText);

    const english = await translate(afText);
    const enGenPath = path.join(poemsDir, poem, "en.generated.md");
    fs.writeFileSync(enGenPath, english ?? "");
    translated++;
    console.log("Translated → en.generated.md:", poem);
  }

  console.log(
    `\nDone. Translated: ${translated}, skipped (en.md already present): ${skippedEn}, skipped (other): ${skippedOther}.`,
  );
}

main();
