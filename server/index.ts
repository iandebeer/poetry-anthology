/**
 * Admin server with access control.
 * Run: npm run admin
 *
 * Set ADMIN_PASSWORD (and optionally ADMIN_USER) in env or .env file.
 */

import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env: try project root (cwd) and server directory
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(process.cwd(), ".env") });
config({ path: join(__dirname, "..", ".env") });

import express from "express";
import session from "express-session";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { addPoem } from "../scripts/addPoem.js";
import {
  loadPoems,
  resolveAfrikaansMarkdownPath,
  resolveEnglishMarkdownPath,
} from "../engine/loadPoems.js";
import { safePoemDir } from "../engine/safePoemPath.js";
import { wrapHtmlWithPoemBackground, extractPoemBodyInnerForCombine } from "../engine/poemHtmlDocument.js";

const execAsync = promisify(exec);

const SCRIPT_EXEC = { cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 } as const;

async function execTsx(script: string, extraArgs = "") {
  const suffix = extraArgs.trim() ? ` ${extraArgs.trim()}` : "";
  return execAsync(`npx tsx ${script}${suffix}`, SCRIPT_EXEC);
}
const PORT = process.env.ADMIN_PORT || 3333;
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme";

declare module "express-session" {
  interface SessionData {
    authenticated?: boolean;
  }
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "poetry-anthology-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === "production", maxAge: 24 * 60 * 60 * 1000 },
  })
);

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.session?.authenticated) return next();
  res.status(401).json({ error: "Unauthorized" });
}

/** Express 5 may type :id as string | string[] */
function paramId(p: string | string[] | undefined): string {
  if (typeof p === "string") return p;
  if (Array.isArray(p)) return p[0] ?? "";
  return "";
}

// Login
app.post("/api/login", (req, res) => {
  const user = String(req.body?.user ?? "").trim();
  const password = String(req.body?.password ?? "").trim();
  const expectedUser = String(ADMIN_USER).trim();
  const expectedPassword = String(ADMIN_PASSWORD).trim();
  if (user === expectedUser && password === expectedPassword) {
    req.session!.authenticated = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: "Invalid credentials" });
});

app.post("/api/logout", (req, res) => {
  req.session?.destroy(() => {});
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  res.json({ authenticated: !!req.session?.authenticated });
});

// Debug: verify env is loaded (does not reveal password)
app.get("/api/auth-status", (_req, res) => {
  res.json({
    hasPassword: !!process.env.ADMIN_PASSWORD,
    username: ADMIN_USER,
    usingDefaultPassword: ADMIN_PASSWORD === "changeme",
  });
});

// Protected API
app.get("/api/poems", requireAuth, (req, res) => {
  try {
    const poems = loadPoems();
    const lang = (req.query.lang as string) || "all";
    const filtered = poems.map((p) => {
      const base = { id: p.id, config: p.config };
      if (lang === "af") return { ...base, af: p.af };
      if (lang === "en") return { ...base, en: p.en };
      return { ...base, af: p.af, en: p.en };
    });
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/poems/:id", requireAuth, (req, res) => {
  const poems = loadPoems();
  const poem = poems.find((p) => p.id === paramId(req.params.id));
  if (!poem) return res.status(404).json({ error: "Not found" });
  const poemsDir = join(process.cwd(), "poems");
  const poemDir = join(poemsDir, poem.id);
  let af = "";
  let en = "";
  try {
    const afP = resolveAfrikaansMarkdownPath(poemDir);
    const enP = resolveEnglishMarkdownPath(poemDir);
    if (afP) af = readFileSync(afP, "utf-8");
    if (enP) en = readFileSync(enP, "utf-8");
  } catch {
    /* ignore */
  }
  res.json({ ...poem, afRaw: af, enRaw: en });
});

function mdToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const lines = md.split("\n");
  const parts: string[] = [];
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (lines[i]?.trim().startsWith("# ")) {
    parts.push(`<h1>${esc(lines[i].replace(/^#\s+/, "").trim())}</h1>`);
    i++;
  }
  const stanzas: string[][] = [];
  let current: string[] = [];
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      if (current.length > 0) {
        stanzas.push(current);
        current = [];
      }
    } else {
      current.push(line.trimEnd());
    }
  }
  if (current.length > 0) stanzas.push(current);
  for (const stanza of stanzas) {
    parts.push(`<p>${stanza.map((l) => esc(l)).join("<br>\n  ")}</p>`);
  }
  return parts.join("\n");
}

// Use cwd (project root when run via npm) - same as loadPoems
const POEMS_DIR = join(process.cwd(), "poems");

/**
 * Always rebuild shell from current poem.config.image (auto-detected paths included).
 * Pre-wrapped af.html used to short-circuit with URL rewrite only, which missed updates
 * and could leave broken or missing backgrounds.
 */
function htmlForAdminResponse(raw: string, imagePath: string | undefined): string {
  const inner = extractPoemBodyInnerForCombine(raw);
  const shell = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head><body>${inner}</body></html>`;
  const imageAbs =
    imagePath?.startsWith("poems/")
      ? join(process.cwd(), "public", "media", ...imagePath.split("/").filter(Boolean))
      : null;
  const imageAbsOk = imageAbs && existsSync(imageAbs) ? imageAbs : null;
  return wrapHtmlWithPoemBackground(shell, imagePath, "/media/", null, imageAbsOk);
}

app.get("/api/poems/:id/html", requireAuth, (req, res) => {
  const poems = loadPoems();
  const poem = poems.find((p) => p.id === paramId(req.params.id));
  if (!poem) return res.status(404).json({ error: "Not found" });
  const poemDir = safePoemDir(POEMS_DIR, poem.id);
  if (!poemDir) return res.status(400).json({ error: "Invalid poem path" });
  const lang = (req.query.lang as string) || "all";
  const imagePath = poem.config.image ?? undefined;

  // Prefer pre-generated .html files from convert-poems
  const afHtmlPath = join(poemDir, "af.html");
  const enHtmlPath = join(poemDir, "en.html");
  const enGenPath = join(poemDir, "en.generated.html");

  if (lang === "af" && existsSync(afHtmlPath)) {
    const raw = readFileSync(afHtmlPath, "utf-8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(htmlForAdminResponse(raw, imagePath));
  }
  if (lang === "af" && !existsSync(afHtmlPath)) {
    console.warn(`[html] af.html not found at ${afHtmlPath} (poem: ${poem.id}, cwd: ${process.cwd()})`);
  }
  if (lang === "en") {
    const enPath = existsSync(enHtmlPath) ? enHtmlPath : existsSync(enGenPath) ? enGenPath : null;
    if (enPath) {
      const raw = readFileSync(enPath, "utf-8");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(htmlForAdminResponse(raw, imagePath));
    }
  }
  if (lang === "all") {
    const afHtml = existsSync(afHtmlPath) ? readFileSync(afHtmlPath, "utf-8") : null;
    const enPath = existsSync(enHtmlPath) ? enHtmlPath : existsSync(enGenPath) ? enGenPath : null;
    const enHtml = enPath ? readFileSync(enPath, "utf-8") : null;
    if (afHtml && enHtml) {
      const afBody = extractPoemBodyInnerForCombine(afHtml);
      const enBody = extractPoemBodyInnerForCombine(enHtml);
      const combined = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Poem</title></head><body><div class="lang-block"><h3>Afrikaans</h3>${afBody}</div><div class="lang-block"><h3>English</h3>${enBody}</div></body></html>`;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(htmlForAdminResponse(combined, imagePath));
    }
  }

  // Fallback: convert from .md
  let af = "",
    en = "";
  try {
    const afP = resolveAfrikaansMarkdownPath(poemDir);
    const enP = resolveEnglishMarkdownPath(poemDir);
    if (afP) af = readFileSync(afP, "utf-8");
    if (enP) en = readFileSync(enP, "utf-8");
  } catch {
    /* ignore */
  }
  let body = "";
  if (lang === "af") body = mdToHtml(af);
  else if (lang === "en") body = mdToHtml(en);
  else body = `<div class="lang-block"><h3>Afrikaans</h3>${mdToHtml(af)}</div><div class="lang-block"><h3>English</h3>${mdToHtml(en)}</div>`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(htmlForAdminResponse(html, imagePath));
});

app.post("/api/poems", requireAuth, async (req, res) => {
  const { id, afContent, author, titleAf, titleEn, translate } = req.body || {};
  if (!id) {
    return res.status(400).json({ error: "id required" });
  }
  try {
    const path = await addPoem({
      id: String(id).replace(/[^a-z0-9-]/gi, "-"),
      afContent: afContent ? String(afContent) : undefined,
      author: author ? String(author) : undefined,
      titleAf: titleAf ? String(titleAf) : undefined,
      titleEn: titleEn ? String(titleEn) : undefined,
      translate: !!translate,
    });
    res.json({ ok: true, path });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

async function runScript(script: string, res: express.Response) {
  try {
    const { stdout, stderr } = await execTsx(script);
    res.json({ ok: true, stdout: stdout || "", stderr: stderr || "" });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    res.status(500).json({
      error: e?.message || String(err),
      stdout: e?.stdout || "",
      stderr: e?.stderr || "",
    });
  }
}

app.post("/api/translate", requireAuth, (req, res) => runScript("scripts/translatePoems.ts", res));
/** Each temp/*.png → vision → poems/<stem>/af.md + config.json; then generate-poems (requires OPENAI_API_KEY). */
app.post("/api/import-temp-poems", requireAuth, (req, res) => runScript("scripts/importTempPoems.ts", res));
app.post("/api/generate-poems", requireAuth, (req, res) => runScript("scripts/generatePoemsData.ts", res));
app.post("/api/convert-poems", requireAuth, (req, res) => runScript("scripts/convertPoemsToHtmlAndText.ts", res));
app.post("/api/generate-af-dict", requireAuth, (req, res) => runScript("scripts/generateAfrikaansDictionary.ts", res));
app.post("/api/export-kindle", requireAuth, async (req, res) => {
  const lang = (req.body?.lang as string) || "both";
  const validLang = ["af", "en", "both"].includes(lang) ? lang : "both";
  try {
    const { stdout, stderr } = await execTsx("scripts/exportKindle.ts", `--lang ${validLang}`);
    res.json({ ok: true, stdout: stdout || "", stderr: stderr || "", lang: validLang });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    res.status(500).json({
      error: e?.message || String(err),
      stdout: e?.stdout || "",
      stderr: e?.stderr || "",
    });
  }
});
app.get("/api/export-kindle/download", requireAuth, (req, res) => {
  const lang = (req.query.lang as string) || "both";
  const filename = lang === "en" ? "Anthology.epub" : "Digbundel.epub";
  const epubPath = join(process.cwd(), "dist", filename);
  if (!existsSync(epubPath)) return res.status(404).json({ error: "EPUB not found. Run Export Kindle first." });
  res.setHeader("Content-Type", "application/epub+zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.sendFile(epubPath);
});

/** Convert → HTML + media/, then export/1-index.html (toc) + export/<id>/afrikaans.html (+ english.html) + media/. */
app.post("/api/export-html", requireAuth, async (_req, res) => {
  try {
    const convert = await execTsx("scripts/convertPoemsToHtmlAndText.ts");
    const exp = await execTsx("scripts/exportHtml.ts");
    const stdout = [convert.stdout, exp.stdout].filter(Boolean).join("\n");
    const stderr = [convert.stderr, exp.stderr].filter(Boolean).join("\n");
    res.json({ ok: true, stdout: stdout || "", stderr: stderr || "" });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    res.status(500).json({
      error: e?.message || String(err),
      stdout: e?.stdout || "",
      stderr: e?.stderr || "",
    });
  }
});

app.post("/api/translate/:id", requireAuth, async (req, res) => {
  const poemsDir = join(process.cwd(), "poems");
  const poemDir = safePoemDir(poemsDir, paramId(req.params.id));
  if (!poemDir) return res.status(400).json({ error: "Invalid poem id" });
  const afPath = resolveAfrikaansMarkdownPath(poemDir);
  const enPath = join(poemDir, "en.md");
  if (!afPath) return res.status(404).json({ error: "Poem not found" });
  if (existsSync(enPath)) return res.json({ ok: true, skipped: true, message: "en.md already exists" });
  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const afText = readFileSync(afPath, "utf-8");
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Translate Afrikaans poetry into natural poetic English while preserving tone, rhythm, and imagery.",
        },
        { role: "user", content: afText },
      ],
    });
    let result = response.choices[0].message.content ?? "";
    result = result.replace(/\brhymically\b/gi, "rhythmically");
    const enGenPath = join(poemDir, "en.generated.md");
    writeFileSync(enGenPath, result, "utf-8");
    res.json({ ok: true, path: enGenPath });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Serve poem media (for HTML background images)
app.use("/media", express.static(join(process.cwd(), "public", "media")));

// Serve admin UI
app.get("/admin", (_req, res) => res.sendFile(join(process.cwd(), "server", "public", "index.html")));
app.use("/admin", express.static(join(process.cwd(), "server", "public")));
app.get("/", (_req, res) => res.redirect("/admin"));

app.listen(PORT, () => {
  console.log(`Admin server: http://localhost:${PORT}/admin`);
  const envFile = join(process.cwd(), ".env");
  console.log(`Auth: ${ADMIN_USER} / ${ADMIN_PASSWORD === "changeme" ? "changeme (default)" : "***"}`);
  if (ADMIN_PASSWORD === "changeme") {
    console.warn(`Set ADMIN_PASSWORD in ${envFile} or: ADMIN_PASSWORD=xxx npm run admin`);
  }
});
