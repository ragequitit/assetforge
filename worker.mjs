// Background worker. Runs as its own Railway service (start command: npm run worker).
// Polls the jobs table, generates each image, post-processes it with the Python
// script, and stores the finished PNG back in Postgres. Keeps running independently
// of any browser tab.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getPool, initSchema, getProfileReference } from "./lib/db.js";
import {
  buildCreativeSpec,
  FIXED_CONSTRAINTS_TEXT,
  RARITY_EDIT_INSTRUCTIONS,
  slugify,
} from "./lib/prompt.js";
import { generateImage, enrichPrompt, editImage } from "./lib/providers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const SCRIPT = path.join(__dirname, "scripts", "process_image.py");
const POLL_MS = Number(process.env.WORKER_POLL_MS || 2000);
const MAX_ATTEMPTS = Number(process.env.WORKER_MAX_ATTEMPTS || 3);
// Prompt enrichment is on by default; set PROMPT_ENRICH=off to send the raw stack.
const ENRICH_ENABLED = !["off", "0", "false", "no"].includes(
  String(process.env.PROMPT_ENRICH ?? "on").toLowerCase()
);

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

// Run the raw image bytes through the Python post-processor and return the
// finished PNG bytes (transparent, cropped, centred, normalised to `size`).
async function runPipeline(rawBuf, size) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "asset-"));
  try {
    const rawPath = path.join(tmp, "raw.png");
    const outPath = path.join(tmp, "out.png");
    fs.writeFileSync(rawPath, rawBuf);
    await runPython(rawPath, outPath, size);
    return fs.readFileSync(outPath);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// After a base has been cleaned to a transparent PNG, queue one edit job per
// chosen tier FROM THAT CLEAN BASE (tiers are independent edits, never stacked).
// Common carries an empty instruction = copied straight through (no API cost).
async function fanOutTiers(p, job, baseBuf) {
  let plan;
  try {
    plan = JSON.parse(job.edit_plan || "{}");
  } catch {
    plan = {};
  }
  const tiers = Array.isArray(plan.tiers) ? plan.tiers : [];
  const edits = plan.edits && typeof plan.edits === "object" ? plan.edits : {};
  const variants = Math.min(Math.max(Number(plan.variants) || 2, 1), 3);
  const baseSlug = slugify(job.name || "pet");
  let n = 0;
  for (const tier of tiers) {
    // Prefer the edit text snapshotted at enqueue (from the loadout's rarity);
    // fall back to the built-in instruction for older jobs/standard tiers.
    const instruction =
      typeof edits[tier] === "string" ? edits[tier] : RARITY_EDIT_INSTRUCTIONS[tier] || "";
    const isCommon = !instruction.trim();
    const count = isCommon ? 1 : variants;
    for (let v = 1; v <= count; v++) {
      const tierTag = tier.toLowerCase();
      const filename =
        count > 1 ? `${baseSlug}-${tierTag}-v${v}.png` : `${baseSlug}-${tierTag}.png`;
      await p.query(
        `INSERT INTO jobs
           (name, category, rarity, size, quality, include_rarity, filename,
            status, kind, source_image, edit_prompt, profile_id, batch_id)
         VALUES ($1,'Pet',$2,$3,$4,true,$5,'queued','edit',$6,$7,$8,$9)`,
        [job.name, tier, job.size, job.quality, filename, baseBuf, instruction, job.profile_id, job.batch_id]
      );
      n++;
    }
  }
  console.log(`[worker] job ${job.id}: base cleaned, fanned out ${n} tier job(s)`);
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
  // --- edit_base: clean ONE base to transparent, then fan out the tiers -----
  // Runs first so every tier edit starts from the same clean, background-free
  // base (a colored-background upload is fine — the pipeline removes it here).
  if (job.kind === "edit_base") {
    if (!job.source_image) throw new Error("Ingen basbild att förbereda.");
    const base = await runPipeline(job.source_image, job.size);
    await fanOutTiers(p, job, base);
    // The prep job itself isn't shown; drop its heavy data now that tiers carry
    // the clean base. (The Common tier, if chosen, was queued as its own job.)
    await p.query(
      `UPDATE jobs SET status='done', image=NULL, source_image=NULL, error=NULL, updated_at=now() WHERE id=$1`,
      [job.id]
    );
    return;
  }

  let raw;
  if (job.kind === "import") {
    // Background-remove path: no generation, just process the uploaded image.
    if (!job.source_image) throw new Error("Ingen källbild att bearbeta.");
    raw = job.source_image; // Buffer (bytea)
  } else if (job.kind === "edit") {
    // Rarity-tiers-from-base path: edit the clean transparent base so identity is
    // held and the tier only adds glow/finish. Enricher is intentionally OFF.
    if (!job.source_image) throw new Error("Ingen basbild att redigera.");
    if (!job.edit_prompt || !job.edit_prompt.trim()) {
      // Common tier: the clean base IS the look — copy it through, no API cost.
      raw = job.source_image;
    } else {
      raw = await editImage(job.source_image, job.edit_prompt, { quality: job.quality });
      console.log(`[worker] job ${job.id}: edited (${job.rarity})`);
    }
  } else {
    const creativeSpec = buildCreativeSpec({
      name: job.name,
      category: job.category,
      rarity: job.rarity,
      notes: job.notes,
      style: job.style_prompt,
      categoryHint: job.category_hint,
      rarityStyle: job.rarity_style,
    });

    // Rewrite the creative stack into positive, flowing language before it hits
    // the image model (see enrichPrompt in lib/providers.js). If enrichment is
    // disabled or the text model errors, fall back to the raw stack so a job
    // never blocks on the enricher.
    let creative = creativeSpec;
    if (ENRICH_ENABLED) {
      try {
        creative = await enrichPrompt(creativeSpec);
        console.log(`[worker] job ${job.id}: prompt enriched`);
      } catch (err) {
        console.warn(
          `[worker] job ${job.id}: enrich failed, using raw prompt (${err.message})`
        );
      }
    }
    // Fixed technical constraints are always appended verbatim, after enrichment.
    const prompt = `${creative} ${FIXED_CONSTRAINTS_TEXT}`.trim();

    // Use the reference image from the loadout this job belongs to — so a queue
    // that's mid-run keeps its own look even if you switch loadout in the browser.
    raw = await generateImage(prompt, {
      quality: job.quality,
      referenceB64: (await getProfileReference(job.profile_id)) || undefined,
    });
  }

  const processed = await runPipeline(raw, job.size);
  if (job.kind === "import") {
    // Store the result and drop the now-unneeded source to reclaim space.
    await p.query(
      `UPDATE jobs SET status='done', image=$1, source_image=NULL, error=NULL, updated_at=now() WHERE id=$2`,
      [processed, job.id]
    );
  } else {
    await p.query(
      `UPDATE jobs SET status='done', image=$1, error=NULL, updated_at=now() WHERE id=$2`,
      [processed, job.id]
    );
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
