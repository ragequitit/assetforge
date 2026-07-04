// Prompt building, field vocab, filename helpers.

export const CATEGORIES = ["Gear", "Charm", "Building", "Resource", "Pet", "Egg"];

export const RARITIES = [
  "Common",
  "Uncommon",
  "Rare",
  "Epic",
  "Legendary",
  "Mythical",
  "Artifact",
  "Heavenly",
];

export const SIZES = [256, 512, 1024];

// Visual language per rarity tier — escalates embellishment and glow.
const RARITY_STYLE = {
  Common: "plain and sturdy, muted earthy colors, minimal embellishment, no glow",
  Uncommon: "lightly refined, soft green accents, subtle detailing",
  Rare: "polished, cool blue accents, faint magical glow, crisp details",
  Epic: "ornate, violet energy, glowing highlights, a magical aura",
  Legendary: "highly ornate, golden trim, radiant warm glow, intricate detailing",
  Mythical: "otherworldly, iridescent colors, swirling magical energy, dramatic glow",
  Artifact: "ancient relic, weathered ornate materials, engraved runes, a deep mystical aura",
  Heavenly: "divine, celestial white-gold light, a soft halo, ethereal wisps, sacred and radiant",
};

// What kind of object each category is.
const CATEGORY_HINT = {
  Gear: "a wearable equipment item or accessory for a pet",
  Charm: "a small magical charm or trinket",
  Building: "a small stylized building or structure",
  Resource: "a crafting resource material",
  Pet: "a cute original creature character",
  Egg: "a decorative creature egg",
};

// The editable "house style" (master prompt). Applied to every generation so you
// don't retype the look each time. Per-asset name + notes layer on top of this.
export const DEFAULT_STYLE =
  "Cute, polished mobile-game art style, vibrant, clean cel-shaded rendering, soft rim light.";

// These constraints are always appended and NOT editable, because the pipeline
// depends on them (transparent background, single centered subject, no text/border).
const FIXED_CONSTRAINTS = [
  "One centered subject, three-quarter or front view, the whole object visible with clear margin around it.",
  "Isolated on a fully transparent background. No background, no scenery, no ground plane, no cast shadow, no text, no logo, no watermark, no frame or border.",
];

export function buildPrompt({ name, category, rarity, notes, style }) {
  const catHint = CATEGORY_HINT[category] || "a game item";
  const rarityStyle = RARITY_STYLE[rarity] || "";
  const extra = notes && notes.trim() ? `Specific art direction: ${notes.trim()}.` : null;
  const styleLine = style && style.trim() ? style.trim() : DEFAULT_STYLE;
  return [
    `A single game asset icon of "${name}" — ${catHint}.`,
    extra,
    `Rarity tier: ${rarity}. Visual treatment: ${rarityStyle}.`,
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

// Final filename, optionally tagged with rarity: "fire-boots-legendary.png"
export function assetFilename({ name, rarity, includeRarity }) {
  const base = slugify(name);
  return includeRarity ? `${base}-${rarity.toLowerCase()}.png` : `${base}.png`;
}

// Deterministic staging basename, unique per (category, name, rarity).
export function stagingBase({ category, name, rarity }) {
  return `${category}__${slugify(name)}__${rarity.toLowerCase()}`;
}
