// Parses a pasted, line-based batch list into asset items.
//
// One asset per line. Fields separated by "|" (recommended) or TAB (paste from
// a spreadsheet). Commas work too, but note that commas inside the notes field
// only survive when you use "|" or TAB as the separator.
//
//   name | category | rarity | size | notes
//
// Everything after the name is optional. Blank fields fall back to the batch
// defaults. Lines starting with "#" are treated as comments.
//
//   Golden Collar | Gear | Legendary
//   Hatchery | Building | Rare | 512 | cozy barn where eggs hatch, glowing windows
//   Fire Boots | Gear | Epic | | wreathed in flames, embers drifting up
//   Simple Stick | Resource | Common

import { CATEGORIES, RARITIES, SIZES, slugify, assetFilename } from "./prompt.js";

const CAT_LOOKUP = new Map(CATEGORIES.map((c) => [c.toLowerCase(), c]));
const RAR_LOOKUP = new Map(RARITIES.map((r) => [r.toLowerCase(), r]));

function pickSeparator(line) {
  if (line.includes("|")) return "|";
  if (line.includes("\t")) return "\t";
  return ",";
}

export function parseLine(rawLine, defaults) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) return null;

  const sep = pickSeparator(line);
  const parts = line.split(sep).map((p) => p.trim());
  const name = parts[0];
  if (!name) return null;

  const warnings = [];

  let category = defaults.category;
  if (parts[1]) {
    const m = CAT_LOOKUP.get(parts[1].toLowerCase());
    if (m) category = m;
    else warnings.push(`okänd kategori "${parts[1]}" → använder ${category}`);
  }

  let rarity = defaults.rarity;
  if (parts[2]) {
    const m = RAR_LOOKUP.get(parts[2].toLowerCase());
    if (m) rarity = m;
    else warnings.push(`okänd rarity "${parts[2]}" → använder ${rarity}`);
  }

  // The 4th field is size ONLY if it looks like a number; otherwise it's notes.
  let size = defaults.size;
  let notesStart = 3;
  if (parts[3] !== undefined && parts[3] !== "") {
    if (/^\d+$/.test(parts[3])) {
      const n = parseInt(parts[3], 10);
      if (SIZES.includes(n)) size = n;
      else warnings.push(`ogiltig storlek "${parts[3]}" → använder ${size}`);
      notesStart = 4;
    } else {
      notesStart = 3; // no size given; this field is the start of notes
    }
  } else if (parts[3] === "") {
    notesStart = 4; // explicit empty size field
  }

  const noteJoin = sep === "," ? ", " : " ";
  const notes = parts.slice(notesStart).filter(Boolean).join(noteJoin).trim();

  return { name, category, rarity, size, notes, warnings, raw: rawLine };
}

export function parseBatch(text, defaults) {
  const lines = String(text || "").split(/\r?\n/);
  const items = [];
  let warningCount = 0;

  for (const raw of lines) {
    const item = parseLine(raw, defaults);
    if (item) {
      items.push(item);
      warningCount += item.warnings.length;
    }
  }

  // Flag duplicate final filenames (later ones would overwrite earlier ones).
  const seen = new Map();
  for (const it of items) {
    const fname = assetFilename({
      name: it.name,
      rarity: it.rarity,
      includeRarity: defaults.includeRarity,
    });
    const key = `${it.category.toLowerCase()}/${fname}`;
    if (seen.has(key)) {
      it.warnings = [...it.warnings, `krockar med rad ${seen.get(key) + 1} (samma filnamn)`];
      warningCount += 1;
    } else {
      seen.set(key, items.indexOf(it));
    }
    it.filename = fname;
  }

  return { items, warningCount };
}
