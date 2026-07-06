// AutoSprite integration — fire-and-forget "push" of a cleaned base image so a
// walk + idle animation is generated in the user's AutoSprite account. We do NOT
// poll or download the result: the character + spritesheets live in AutoSprite,
// where the user previews, trims frames, tunes loops and downloads the finals.
// So this module just: (1) creates the character from the base image, and
// (2) kicks off the animations. That's it.
//
// Auth + shapes come from AutoSprite's REST Quick Start:
//   POST /api/v1/characters                    (multipart: name, image, ...)
//   POST /api/v1/characters/{id}/spritesheets  (json: animations[], frameCount, frameSize)
// Header: x-api-key: <key>

const BASE = process.env.AUTOSPRITE_BASE_URL || "https://www.autosprite.io/api/v1";

// The moves to generate per pet. kind:"custom" + a prompt is the documented shape
// that works for any motion. If AutoSprite exposes cleaner presets via API
// (kind:"walk"/"idle"), these can be swapped here without touching anything else.
const ANIMATIONS = [
  { kind: "custom", name: "Walk", prompt: "side-view walk cycle, legs stepping, smooth seamless loop" },
  { kind: "custom", name: "Idle", prompt: "idle breathing loop, subtle gentle motion, standing in place" },
];

const FRAME_SIZE = Number(process.env.AUTOSPRITE_FRAME_SIZE || 256);

export function autospriteConfigured() {
  return !!process.env.AUTOSPRITE_API_KEY;
}

// Push one base image to AutoSprite and start walk + idle. Throws on failure;
// the caller (worker) catches so it never blocks the tier generation.
export async function pushToAutoSprite(imageBuffer, name, opts = {}) {
  const apiKey = process.env.AUTOSPRITE_API_KEY;
  if (!apiKey) throw new Error("AUTOSPRITE_API_KEY saknas.");

  const bytes = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer);
  const safeName = (name || "pet").toString().slice(0, 80);

  // 1) Create the character from our transparent base image (multipart).
  const form = new FormData();
  form.append("name", safeName);
  form.append("isHumanoid", "false");
  if (opts.description) form.append("characterDescription", String(opts.description).slice(0, 300));
  form.append("image", new Blob([bytes], { type: "image/png" }), `${safeName || "pet"}.png`);

  const createRes = await fetch(`${BASE}/characters`, {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: form,
  });
  if (!createRes.ok) {
    const detail = await createRes.text().catch(() => "");
    throw new Error(`AutoSprite create-fel (${createRes.status}): ${detail.slice(0, 300)}`);
  }
  const character = await createRes.json();
  const characterId = character?.id;
  if (!characterId) throw new Error("AutoSprite returnerade inget character-id.");

  // 2) Kick off the animations (walk + idle) in one call. Fire-and-forget — we
  // don't poll; the jobs finish in AutoSprite and sit in the user's account.
  const genRes = await fetch(`${BASE}/characters/${characterId}/spritesheets`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ animations: ANIMATIONS, frameSize: FRAME_SIZE }),
  });
  if (!genRes.ok) {
    const detail = await genRes.text().catch(() => "");
    throw new Error(`AutoSprite generate-fel (${genRes.status}): ${detail.slice(0, 300)}`);
  }
  const gen = await genRes.json().catch(() => ({}));
  return { characterId, creditsUsed: gen?.creditsUsed, workflows: gen?.workflows };
}
