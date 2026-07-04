// Image generation providers. Select with IMAGE_PROVIDER ("openai" | "replicate").
// Each function takes a prompt and returns a PNG Buffer.

// --- OpenAI (gpt-image-1) -------------------------------------------------
// gpt-image-1 supports a native transparent background, which is ideal for
// game assets. It only renders square at 1024x1024, so we always request that
// and let the Python post-processor normalise to the chosen export size.
async function generateOpenAI(prompt, opts = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY saknas i .env.local");

  const quality = opts.quality || process.env.IMAGE_QUALITY || "medium"; // low | medium | high

  // If a style-reference image is provided, use the image edits endpoint so the
  // new asset is anchored to the reference's look.
  if (opts.referenceB64) {
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", prompt);
    form.append("size", "1024x1024");
    form.append("background", "transparent");
    form.append("quality", quality);
    const bytes = Buffer.from(opts.referenceB64, "base64");
    form.append("image", new Blob([bytes], { type: "image/png" }), "reference.png");

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`OpenAI edits-fel (${res.status}): ${detail}`);
    }
    const data = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI returnerade ingen bild.");
    return Buffer.from(b64, "base64");
  }

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: "1024x1024",
      background: "transparent",
      output_format: "png",
      quality,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI API-fel (${res.status}): ${detail}`);
  }

  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returnerade ingen bild.");
  return Buffer.from(b64, "base64");
}

// --- Replicate ------------------------------------------------------------
// Uses the model-name predictions endpoint with `Prefer: wait` so we get the
// result synchronously. Default model output is opaque, so the Python step
// handles background removal (install rembg for best results).
async function generateReplicate(prompt) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN saknas i .env.local");
  const model = process.env.REPLICATE_MODEL || "black-forest-labs/flux-schnell";

  const res = await fetch(
    `https://api.replicate.com/v1/models/${model}/predictions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        input: {
          prompt,
          aspect_ratio: "1:1",
          output_format: "png",
          num_outputs: 1,
        },
      }),
    }
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Replicate-fel (${res.status}): ${detail}`);
  }

  const data = await res.json();
  const output = Array.isArray(data.output) ? data.output[0] : data.output;
  if (!output) throw new Error("Replicate returnerade ingen bild-URL.");

  const imgRes = await fetch(output);
  if (!imgRes.ok) throw new Error(`Kunde inte hämta bilden från Replicate (${imgRes.status}).`);
  return Buffer.from(await imgRes.arrayBuffer());
}

export async function generateImage(prompt, opts = {}) {
  const provider = (process.env.IMAGE_PROVIDER || "openai").toLowerCase();
  if (provider === "replicate") return generateReplicate(prompt);
  return generateOpenAI(prompt, opts);
}
