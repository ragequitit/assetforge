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

// Shared CRITICAL suffix appended to every non-empty edit instruction. SET A
// (matt/fur) protects anatomy and adds finish "as light/tint on top"; SET B
// (shiny/metal) protects anatomy and only "recolor/light the hard surfaces".
const CRIT_A =
  " CRITICAL: do not redraw or reshape the face, eyes, mouth, nose/beak, or feet/paws — keep them identical to the base; keep every existing shape, marking and emblem intact. Only add the finish as light/tint on top; never alter anatomy or pose.";
const CRIT_B =
  " CRITICAL: do not redraw or reshape the face, eyes, mouth, nose/beak, or feet/paws — keep them identical to the base; keep every existing shape, marking and emblem intact. Only recolor/light the hard surfaces; never alter anatomy or pose.";

// Standard rarity tiers. Each has:
//   name       — the tier name
//   style      — what it does when GENERATING from scratch (woven into the prompt)
//   edit       — Rarity-tiers EDIT instruction for MATT/FUR pets (SET A)
//   editShiny  — Rarity-tiers EDIT instruction for SHINY/METAL pets (SET B)
//   color      — the UI ring/swatch color
// An empty edit/editShiny = "copy the base straight through" (no API call, e.g.
// Common). "None" is the no-treatment tier.
export const DEFAULT_RARITIES = [
  { name: "None", style: "", edit: "", editShiny: "", color: "var(--muted)" },
  { name: "Common", style: "muted natural honest colors, clean and simple, no glow, no sparkle, no aura — all held within the silhouette", edit: "", editShiny: "", color: "var(--r-common)" },
  { name: "Uncommon", style: "green accent markings, a soft gentle sheen, slightly richer and cleaner — all held within the silhouette", edit: "keep the base pet fully intact and dominant; add subtle GREEN accent tinting on the existing markings and a soft gentle green sheen — all held within the silhouette." + CRIT_A, editShiny: "keep identity, pose and shape; retint the hard shiny surfaces (armor, plating, shell, gems, crystal) toward a clear GREEN-tinted metal with a green edge-light; any skin/fur/beak/paws/face stay natural — all within the silhouette." + CRIT_B, color: "var(--r-uncommon)" },
  { name: "Rare", style: "blue-teal jewel-toned accent markings, crisper saturated colors, a soft cool rim-light, a few tiny sparkle glints — all held within the silhouette", edit: "keep the base pet fully intact and dominant; add a clear cool BLUE-TEAL rim-light hugging the outline and a faint blue-teal sheen on the markings; only a FEW small sparkles — all held within the silhouette." + CRIT_A, editShiny: "keep identity, pose and shape; retint the hard shiny surfaces toward a rich BLUE-TEAL metal with a cool blue edge-light and a few sparkles; skin/fur/beak/paws/face stay natural — all within the silhouette." + CRIT_B, color: "var(--r-rare)" },
  { name: "Epic", style: "purple-violet energy markings, a bold dramatic palette, a glowing violet rim-light, premium 4-point sparkles — all held within the silhouette", edit: "keep the base pet fully intact and dominant; add a glowing PURPLE-VIOLET rim-light and a few premium 4-point sparkles — all held within the silhouette." + CRIT_A, editShiny: "keep identity, pose and shape; retint the hard shiny surfaces toward a vivid PURPLE-VIOLET metal with a violet edge-light and premium 4-point sparkles; skin/fur/beak/paws/face stay natural — all within the silhouette." + CRIT_B, color: "var(--r-epic)" },
  { name: "Legendary", style: "gold, a warm golden glow, gilded accents grown into the surface, deeper contrast, bright gold hero sparkles, majestic — all held within the silhouette", edit: "keep the base pet fully intact and dominant; add a clearly visible warm GOLDEN glow and rim-light, gilded tips on crest/tail/high points, and a scatter of bright gold sparkles; the original fur/colors stay fully readable, NOT plated solid gold — all held within the silhouette." + CRIT_A, editShiny: "keep identity, pose and shape; turn the hard shiny surfaces into bright polished GOLD with a warm golden glow and gold sparkles; skin/fur/beak/paws/face stay natural — all within the silhouette." + CRIT_B, color: "var(--r-legendary)" },
  { name: "Mythical", style: "crimson-ruby energy woven through the surface, a strong warm red glow, red hero sparkles, fierce and powerful — all held within the silhouette", edit: "keep the base pet fully intact and dominant; add a light RED glow around the outline and a few red sparkles, with a faint red energy tint on the existing markings only; most original fur stays visible, do NOT turn the pet red — all held within the silhouette." + CRIT_A, editShiny: "keep identity, pose and shape; retint the hard shiny surfaces toward a fierce crimson-RED metal with a red edge-light and red sparkles; skin/fur/beak/paws/face stay natural — all within the silhouette." + CRIT_B, color: "var(--r-mythical)" },
  { name: "Artifact", style: "an ancient precious relic, ornate glowing engraved detail set into the surface, a turquoise-teal radiant aura, the richest sparkle set — all held within the silhouette", edit: "keep the base pet fully intact and dominant; add ornate engraved BRONZE-AND-AGED-GOLD relic accents grown into the surface, a restrained antique rim-light and a few small sparkles; an ancient-relic feel, clearly distinct from bright Legendary gold — all held within the silhouette." + CRIT_A, editShiny: "keep identity, pose and shape; turn the hard shiny surfaces into ancient ornate BRONZE-AND-AGED-GOLD with engraved patterning and a weathered antique patina, plus a few small warm sparkles; keep it clearly 2D illustrated (NOT a glossy 3D render, no photoreal gems); distinct from bright Legendary gold; skin/fur/beak/paws/face stay natural — all within the silhouette." + CRIT_B, color: "var(--r-artifact)" },
  { name: "Heavenly", style: "divine, celestial white-gold light, a soft halo, ethereal wisps, a near-white luminous core, sacred and radiant — all held within the silhouette", edit: "keep the base pet fully intact and dominant; add a clearly visible soft WHITE-TURQUOISE divine halo rim-light, a gentle glowing inner light and a few soft sparkles — luminous and holy, colors stay readable — all within the silhouette, nothing beyond the outline." + CRIT_A, editShiny: "keep identity, pose and shape; turn the hard shiny surfaces into radiant WHITE-AND-TURQUOISE holy metal with a soft halo and a glowing inner light; skin/fur/beak/paws/face stay natural — all within the silhouette." + CRIT_B, color: "var(--r-heavenly)" },
  { name: "Eternal", style: "a radiant timeless eternal light infused through the surface, a layered luminous aura hugging the silhouette with slow drifting motes of light and a richer sparkle set, transcendent — one step beyond Heavenly — all held within the silhouette", edit: "keep the base pet fully intact and dominant; add a soft layered WHITE-GOLD radiant rim-light and a few slow drifting light motes tight to the body; base stays fully visible — nothing beyond the outline, strictly within the silhouette." + CRIT_A, editShiny: "keep identity, pose and shape; turn the hard shiny surfaces into luminous WHITE-GOLD eternal metal with layered radiance and slow drifting light motes tight to the body; skin/fur/beak/paws/face stay natural — all within the silhouette." + CRIT_B, color: "var(--r-eternal)" },
  { name: "Cosmic", style: "deep galaxy-nebula surface in violets, blues and magentas, swirling stardust and tiny glowing stars, the grandest awe-inspiring aura, supreme and infinite — all held within the silhouette", edit: "keep the base pet fully intact and dominant; add a GALAXY-NEBULA shimmer with tiny stars ONLY inside the existing dark fur/markings, plus a soft violet rim-light and a few star sparkles; the face, eyes and shape stay clearly readable — nothing beyond the outline, strictly within the silhouette." + CRIT_A, editShiny: "keep identity, pose and shape; turn the hard shiny surfaces into a deep GALAXY-NEBULA metal of cosmic violets/blues/magentas with tiny stars and a soft violet edge-light; the face stays clearly readable; skin/fur/beak/paws/face stay natural — all within the silhouette." + CRIT_B, color: "var(--r-cosmic)" },
];

// Built-in edit instructions keyed by tier name, derived from DEFAULT_RARITIES.
// Two sets: matt/fur (default) and shiny/metal. Used as a fallback for loadouts
// whose stored rarities predate these fields, so standard tiers keep working.
export const RARITY_EDIT_INSTRUCTIONS = Object.fromEntries(
  DEFAULT_RARITIES.map((r) => [r.name, r.edit || ""])
);
export const RARITY_EDIT_INSTRUCTIONS_SHINY = Object.fromEntries(
  DEFAULT_RARITIES.map((r) => [r.name, r.editShiny || ""])
);

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
