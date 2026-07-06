// Prompt building, field vocab, filename helpers.
//
// Categories and rarities are now PER-LOADOUT and user-editable (each has a name
// and a short "meaning" that gets woven into the prompt). The constants below are
// only the built-in defaults used to seed loadouts; the live values come from the
// active loadout and are snapshotted onto each job at enqueue time.

export const SIZES = [256, 512, 1024];

// ---- Built-in defaults (used to seed loadouts) ----

// Pet Planet's original categories, kept exactly. name + hint ("what it is").
export const DEFAULT_CATEGORIES = [
  { name: "Gear", hint: "a wearable equipment item or accessory for a pet" },
  { name: "Charm", hint: "a small magical charm or trinket" },
  { name: "Building", hint: "a small stylized building or structure" },
  { name: "Resource", hint: "a crafting resource material" },
  { name: "Pet", hint: "a cute original creature character" },
  { name: "Egg", hint: "a decorative creature egg" },
  { name: "UI", hint: "a clean, flat UI icon or interface symbol, simple and readable at small sizes" },
  { name: "Button", hint: "a UI button plate (rounded or square), clean and readable, the symbol centered on transparency" },
];

// A neutral starter set for brand-new loadouts (fully editable/removable).
export const GENERIC_CATEGORIES = [
  { name: "Item", hint: "a small game item or object" },
  { name: "Character", hint: "a character or creature" },
  { name: "Building", hint: "a building or structure" },
  { name: "Resource", hint: "a crafting resource or material" },
  { name: "UI", hint: "a clean, flat UI icon or interface symbol, simple and readable at small sizes" },
  { name: "Button", hint: "a UI button plate (rounded or square), clean and readable, the symbol centered on transparency" },
];

// Standard rarity tiers. name + style ("what it does") + color (UI ring).
// "None" is the no-treatment tier: empty style, neutral color.
export const DEFAULT_RARITIES = [
  { name: "None", style: "", color: "var(--muted)" },
  { name: "Common", style: "muted natural honest colors, clean and simple, no glow, no sparkle, no aura — all held within the silhouette", color: "var(--r-common)" },
  { name: "Uncommon", style: "green accent markings, a soft gentle sheen, slightly richer and cleaner — all held within the silhouette", color: "var(--r-uncommon)" },
  { name: "Rare", style: "blue-teal jewel-toned accent markings, crisper saturated colors, a soft cool rim-light, a few tiny sparkle glints — all held within the silhouette", color: "var(--r-rare)" },
  { name: "Epic", style: "purple-violet energy markings, a bold dramatic palette, a glowing violet rim-light, premium 4-point sparkles — all held within the silhouette", color: "var(--r-epic)" },
  { name: "Legendary", style: "gold, a warm golden glow, gilded accents grown into the surface, deeper contrast, bright gold hero sparkles, majestic — all held within the silhouette", color: "var(--r-legendary)" },
  { name: "Mythical", style: "crimson-ruby energy woven through the surface, a strong warm red glow, red hero sparkles, fierce and powerful — all held within the silhouette", color: "var(--r-mythical)" },
  { name: "Artifact", style: "an ancient precious relic, ornate glowing engraved detail set into the surface, a turquoise-teal radiant aura, the richest sparkle set — all held within the silhouette", color: "var(--r-artifact)" },
  { name: "Heavenly", style: "divine, celestial white-gold light, a soft halo, ethereal wisps, a near-white luminous core, sacred and radiant — all held within the silhouette", color: "var(--r-heavenly)" },
  { name: "Eternal", style: "a radiant timeless eternal light infused through the surface, a layered luminous aura hugging the silhouette with slow drifting motes of light and a richer sparkle set, transcendent — one step beyond Heavenly — all held within the silhouette", color: "var(--r-eternal)" },
  { name: "Cosmic", style: "deep galaxy-nebula surface in violets, blues and magentas, swirling stardust and tiny glowing stars, the grandest awe-inspiring aura, supreme and infinite — all held within the silhouette", color: "var(--r-cosmic)" },
];

// Dedicated EDIT instructions for the "Rarity-tiers from a base image" flow.
// These modify an existing approved base pet via image-to-image edit — they are
// NOT the generate-from-scratch rarity styles above. Common is intentionally an
// empty string: that flow copies the base straight through with no API call
// (the base IS the Common look). Keyed by rarity name.
export const RARITY_EDIT_INSTRUCTIONS = {
  Common: "",
  Uncommon:
    "keep the pet's identity, pose, colors and markings unchanged; add subtle GREEN accent tinting on existing markings and a soft gentle green sheen across the surface — all held within the silhouette",
  Rare:
    "keep the pet's identity, pose, colors and markings unchanged; add a soft cool BLUE-TEAL rim-light hugging the silhouette, crisper saturated colors, and a few tiny sparkle glints on the body — all held within the silhouette",
  Epic:
    "keep the pet's identity, pose, colors and markings unchanged; add a glowing PURPLE-VIOLET rim-light on the silhouette, violet energy shimmer through its own surface, and a set of premium 4-point sparkles on the body — all held within the silhouette",
  Legendary:
    "keep the pet's identity, pose, colors and markings unchanged; add a warm GOLDEN glow hugging the silhouette, gilded accents grown into its surface, deeper contrast, and bright gold hero sparkles on the body — all held within the silhouette",
  Mythical:
    "keep the pet's identity, pose, colors and markings unchanged; weave rich crimson-RUBY energy through its own surface, add a strong warm RED glow hugging the silhouette and red hero sparkles on the body; fierce and powerful (not prismatic) — all held within the silhouette",
  Artifact:
    "keep the pet's identity, pose, colors and markings unchanged; set ornate glowing engraved detail into its surface, add a radiant GOLD-AND-WHITE aura hugging the silhouette and the richest sparkle set on the body — all held within the silhouette",
  Heavenly:
    "keep the pet's identity, pose, colors and markings unchanged; add a soft halo-like divine glow hugging the silhouette, near-white luminous core highlights with icy TURQUOISE edges and holy inner light; ethereal and serene — all held within the silhouette",
  Eternal:
    "keep the pet's identity, pose, colors and markings unchanged; infuse a radiant timeless ETERNAL light through its surface, add a layered luminous aura hugging the silhouette with slow drifting motes of light and a richer sparkle set; transcendent, one step beyond Heavenly — all held within the silhouette",
  Cosmic:
    "keep the pet's identity, pose, colors and markings unchanged; transform its own surface into a deep GALAXY-NEBULA of cosmic violets, blues and magentas with tiny glowing stars and swirling nebula, glowing cosmic eyes, and the grandest awe-inspiring aura hugging the silhouette; go all out but stay contained within the outline",
};

// Palette used to auto-assign a color to user-added rarities.
export const RARITY_PALETTE = [
  "#7dd3fc", "#a78bfa", "#f472b6", "#fb7185", "#fbbf24",
  "#34d399", "#22d3ee", "#c084fc", "#f97316", "#4ade80",
];

// Legacy flat exports kept so any older import still resolves.
export const CATEGORIES = DEFAULT_CATEGORIES.map((c) => c.name);
export const RARITIES = DEFAULT_RARITIES.map((r) => r.name);
const RARITY_STYLE = Object.fromEntries(DEFAULT_RARITIES.map((r) => [r.name, r.style]));
const CATEGORY_HINT = Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.name, c.hint]));

// The editable "house style" (master prompt).
export const DEFAULT_STYLE =
  "Cute, polished mobile-game art style, vibrant, clean cel-shaded rendering, soft rim light.";

// Always appended, not editable — the pipeline depends on these. Exported so the
// worker can append them verbatim AFTER prompt enrichment (they must never be
// softened or dropped by a text-model rewrite).
export const FIXED_CONSTRAINTS = [
  "One centered subject, three-quarter or front view, the whole object visible with clear margin around it.",
  "Isolated on a fully transparent background. No background, no scenery, no ground plane, no cast shadow.",
  "Absolutely no text anywhere in the image: no title, no caption, no label, no item name, no rarity word, no words, letters or numbers, no logo, no watermark, no frame or border.",
];
export const FIXED_CONSTRAINTS_TEXT = FIXED_CONSTRAINTS.join(" ");

// The CREATIVE half of the prompt only — species/subject, notes, rarity finish
// and house style — WITHOUT the fixed technical constraints above. This is what
// gets sent to the prompt enricher (lib/providers.js). Keeping the constraints
// separate means the transparent-background / no-text guarantees can never be
// reworded away by the rewrite.
export function buildCreativeSpec({ name, category, rarity, notes, style, categoryHint, rarityStyle }) {
  const catHint =
    categoryHint && categoryHint.trim()
      ? categoryHint.trim()
      : CATEGORY_HINT[category] || "a game item";
  const rStyle = rarityStyle != null ? rarityStyle : RARITY_STYLE[rarity] || "";
  const extra = notes && notes.trim() ? `Specific art direction: ${notes.trim()}.` : null;
  const styleLine = style && style.trim() ? style.trim() : DEFAULT_STYLE;
  // Describe the tier's LOOK without ever naming it, and describe the subject
  // without quoting its name — quoting the name and spelling out "Rarity tier:
  // Common" is what tempts the model to render those exact words as a title.
  const rarityLine =
    rStyle && rStyle.trim() ? `Visual treatment: ${rStyle.trim()}.` : null;
  return [
    `A single centered game-asset icon of ${name} — ${catHint}.`,
    extra,
    rarityLine,
    styleLine,
  ]
    .filter(Boolean)
    .join(" ");
}

// Full raw prompt = creative spec + fixed constraints. Used as the fallback when
// enrichment is disabled or fails, and by callers that reconstruct a prompt.
export function buildPrompt(args) {
  return [buildCreativeSpec(args), FIXED_CONSTRAINTS_TEXT].filter(Boolean).join(" ");
}

// "Golden Collar!" -> "golden-collar"
export function slugify(str) {
  return (
    String(str)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "asset"
  );
}

// Final filename, optionally tagged with rarity. "None" is never tagged.
export function assetFilename({ name, rarity, includeRarity }) {
  const base = slugify(name);
  const tag = includeRarity && rarity && rarity !== "None";
  return tag ? `${base}-${rarity.toLowerCase()}.png` : `${base}.png`;
}

export function stagingBase({ category, name, rarity }) {
  return `${category}__${slugify(name)}__${String(rarity).toLowerCase()}`;
}
