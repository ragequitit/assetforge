// AutoSprite integration — by DEFAULT this only PREPARES the character in the
// user's AutoSprite account (uploads the cleaned base, free). The user then opens
// the Animate tab and presses Generate themselves — so the animations land in the
// Preview editor and the user controls the moves, quality and settings.
//
// Set AUTOSPRITE_AUTO_GENERATE=on to also auto-kick walk + idle from here (the
// old behaviour) — but note those API-made sheets don't auto-open in Preview.
//
// Shapes from AutoSprite's REST Quick Start:
//   POST /api/v1/characters                    (multipart: name, image, ...)
//   POST /api/v1/characters/{id}/spritesheets  (json: animations[], frameCount, frameSize)
// Header: x-api-key: <key>

const BASE = process.env.AUTOSPRITE_BASE_URL || "https://www.autosprite.io/api/v1";

const AUTO_GENERATE = ["on", "1", "true", "yes"].includes(
  String(process.env.AUTOSPRITE_AUTO_GENERATE ?? "off").toLowerCase()
);

// Only used when AUTO_GENERATE is on. kind:"custom" + prompt is the documented
// shape that works for any motion.
const ANIMATIONS = [
  { kind: "custom", name: "Walk", prompt: "side-view walk cycle, legs stepping, smooth seamless loop" },
  {
    kind: "custom",
    name: "Idle",
    prompt:
      "idle stance: only a very slight body sway and an occasional slow blink; the body and chest stay still; NO breathing motion, no chest rise or fall, no puffing air, no visible breath, exhale or mist; keep it calm and minimal, seamless loop",
  },
];

const FRAME_SIZE = Number(process.env.AUTOSPRITE_FRAME_SIZE || 512); // 256..640 (sheets cap ~640)
const FRAME_COUNT = Number(process.env.AUTOSPRITE_FRAME_COUNT || 25); // more = smoother, bigger sheet

export function autospriteConfigured() {
  return !!process.env.AUTOSPRITE_API_KEY;
}

// Push one base image to AutoSprite. By default just creates the character
// (prepares it, free) so the user can generate animations themselves. Throws on
// failure; the caller (worker) catches so it never blocks tier generation.
export async function pushToAutoSprite(imageBuffer, name, opts = {}) {
  const apiKey = process.env.AUTOSPRITE_API_KEY;
  if (!apiKey) throw new Error("AUTOSPRITE_API_KEY saknas.");

  const bytes = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer);
  const safeName = (name || "pet").toString().slice(0, 80);

  // 1) Create the character from our transparent base image (multipart). Free.
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

  // 2) Only if explicitly enabled: also kick off walk + idle (old behaviour).
  if (!AUTO_GENERATE) {
    return { characterId, generated: false };
  }
  const genRes = await fetch(`${BASE}/characters/${characterId}/spritesheets`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ animations: ANIMATIONS, frameCount: FRAME_COUNT, frameSize: FRAME_SIZE }),
  });
  if (!genRes.ok) {
    const detail = await genRes.text().catch(() => "");
    throw new Error(`AutoSprite generate-fel (${genRes.status}): ${detail.slice(0, 300)}`);
  }
  const gen = await genRes.json().catch(() => ({}));
  return { characterId, generated: true, creditsUsed: gen?.creditsUsed, workflows: gen?.workflows };
}
