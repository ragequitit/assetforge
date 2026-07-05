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
  { name: "Common", style: "plain and sturdy, muted earthy colors, minimal embellishment, no glow", color: "var(--r-common)" },
  { name: "Uncommon", style: "lightly refined, soft green accents, subtle detailing", color: "var(--r-uncommon)" },
  { name: "Rare", style: "polished, cool blue accents, faint magical glow, crisp details", color: "var(--r-rare)" },
  { name: "Epic", style: "ornate, violet energy, glowing highlights, a magical aura", color: "var(--r-epic)" },
  { name: "Legendary", style: "highly ornate, golden trim, radiant warm glow, intricate detailing", color: "var(--r-legendary)" },
  { name: "Mythical", style: "otherworldly, iridescent colors, swirling magical energy, dramatic glow", color: "var(--r-mythical)" },
  { name: "Artifact", style: "ancient relic, weathered ornate materials, engraved runes, a deep mystical aura", color: "var(--r-artifact)" },
  { name: "Heavenly", style: "divine, celestial white-gold light, a soft halo, ethereal wisps, sacred and radiant", color: "var(--r-heavenly)" },
];

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

// Always appended, not editable — the pipeline depends on these.
const FIXED_CONSTRAINTS = [
  "One centered subject, three-quarter or front view, the whole object visible with clear margin around it.",
  "Isolated on a fully transparent background. No background, no scenery, no ground plane, no cast shadow.",
  "Absolutely no text anywhere in the image: no title, no caption, no label, no item name, no rarity word, no words, letters or numbers, no logo, no watermark, no frame or border.",
];

// categoryHint / rarityStyle, when provided (snapshotted on the job from its
// loadout), take precedence. Falling back to the built-in maps keeps older jobs
// and direct callers working.
export function buildPrompt({ name, category, rarity, notes, style, categoryHint, rarityStyle }) {
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
    ...FIXED_CONSTRAINTS,
  ]
    .filter(Boolean)
    .join(" ");
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
