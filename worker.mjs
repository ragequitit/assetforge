// Background worker. Runs as its own Railway service (start command: npm run worker).
// Polls the jobs table, generates each image, post-processes it with the Python
// script, and stores the finished PNG back in Postgres. Keeps running independently
// of any browser tab.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getPool, initSchema, getSetting } from "./lib/db.js";
import { buildPrompt } from "./lib/prompt.js";
import { generateImage } from "./lib/providers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const SCRIPT = path.join(__dirname, "scripts", "process_image.py");
const POLL_MS = Number(process.env.WORKER_POLL_MS || 2000);
const MAX_ATTEMPTS = Number(process.env.WORKER_MAX_ATTEMPTS || 3);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function runPython(input, output, size) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_BIN, [SCRIPT, input, output, "--size", String(size)]);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => reject(new Error(`Python-start misslyckades: ${err.message}`)));
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`process_image.py kod ${code}: ${stderr}`))
    );
  });
}

// Atomically grab one queued job so multiple workers never collide.
async function claimJob(p) {
  const r = await p.query(`
    UPDATE jobs
       SET status='processing', attempts=attempts+1, updated_at=now()
     WHERE id = (
       SELECT id FROM jobs
        WHERE status='queued'
        ORDER BY id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
    RETURNING *`);
  return r.rows[0] || null;
}

async function processJob(p, job) {
  const prompt = buildPrompt({
    name: job.name,
    category: job.category,
    rarity: job.rarity,
    notes: job.notes,
    style: job.style_prompt,
  });

  const raw = await generateImage(prompt, {
    quality: job.quality,
    referenceB64: (await getSetting("reference_image", "")) || undefined,
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "asset-"));
  try {
    const rawPath = path.join(tmp, "raw.png");
    const outPath = path.join(tmp, "out.png");
    fs.writeFileSync(rawPath, raw);
    await runPython(rawPath, outPath, job.size);
    const processed = fs.readFileSync(outPath);
    await p.query(
      `UPDATE jobs SET status='done', image=$1, error=NULL, updated_at=now() WHERE id=$2`,
      [processed, job.id]
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function loop() {
  await initSchema();
  const p = getPool();
  console.log(`[worker] started (poll ${POLL_MS}ms, max attempts ${MAX_ATTEMPTS})`);

  for (;;) {
    let job;
    try {
      job = await claimJob(p);
    } catch (err) {
      console.error("[worker] claim error:", err.message);
      await sleep(POLL_MS);
      continue;
    }

    if (!job) {
      await sleep(POLL_MS);
      continue;
    }

    console.log(`[worker] job ${job.id} "${job.name}" (attempt ${job.attempts})`);
    try {
      await processJob(p, job);
      console.log(`[worker] done ${job.id}`);
    } catch (err) {
      const giveUp = job.attempts >= MAX_ATTEMPTS;
      await p.query(`UPDATE jobs SET status=$1, error=$2, updated_at=now() WHERE id=$3`, [
        giveUp ? "error" : "queued",
        String(err.message || err),
        job.id,
      ]);
      console.error(
        `[worker] job ${job.id} failed${giveUp ? " (giving up)" : " (will retry)"}: ${err.message}`
      );
      if (!giveUp) await sleep(1500);
    }
  }
}

loop().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
