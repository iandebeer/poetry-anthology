import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
import fs from "fs";
import path from "path";

const poemsDir = "./poems";

const poems = fs.readdirSync(poemsDir);

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
  return response.choices[0].message.content;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("Set OPENAI_API_KEY in your environment. Get a key at https://platform.openai.com/api-keys");
    process.exit(1);
  }
  for (const poem of poems) {
    const afPath = path.join(poemsDir, poem, "af.md");
    if (!fs.existsSync(afPath)) continue;

    const afText = fs.readFileSync(afPath, "utf8");
    console.log("Afrikaans text:");
    console.log(afText);

    const english = await translate(afText);
    const enPath = path.join(poemsDir, poem, "en.generated.md");
    fs.writeFileSync(enPath, english ?? "");
    console.log("Translated:", poem);
  }
}

main();