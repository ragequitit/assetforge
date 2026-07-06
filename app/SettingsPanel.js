"use client";

import { useEffect, useRef, useState } from "react";
import { RARITY_PALETTE, DEFAULT_RARITIES, RARITY_EDIT_INSTRUCTIONS } from "@/lib/prompt";

export default function SettingsPanel({ activeName = "" }) {
  const [masterPrompt, setMasterPrompt] = useState("");
  const [defaultStyle, setDefaultStyle] = useState("");
  const [categories, setCategories] = useState([]); // [{name, hint}]
  const [rarities, setRarities] = useState([]); // [{name, style, color}]
  const [catDefaults, setCatDefaults] = useState({});
  const [hasReference, setHasReference] = useState(false);
  const [refPreview, setRefPreview] = useState(null);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const fileRef = useRef(null);

  // -- drag-to-reorder (categories & rarities) --
  const dragItem = useRef({ list: null, index: null });
  const [dragging, setDragging] = useState({ list: null, index: null });

  function moveItem(setList, from, to) {
    setList((prev) => {
      if (from == null || to == null || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function onDragStart(e, list, i) {
    dragItem.current = { list, index: i };
    setDragging({ list, index: i });
    // Firefox needs data set for a drag to actually begin.
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", String(i));
    } catch {}
  }

  // Live reorder as you drag over another row in the same list.
  function onDragEnterRow(list, setList, i) {
    const d = dragItem.current;
    if (d.list !== list || d.index == null || d.index === i) return;
    moveItem(setList, d.index, i);
    dragItem.current = { list, index: i };
    setDragging({ list, index: i });
  }

  function onDragEnd() {
    dragItem.current = { list: null, index: null };
    setDragging({ list: null, index: null });
  }

  const isDragging = (list, i) => dragging.list === list && dragging.index === i;

  async function loadAll() {
    try {
      const [s, r] = await Promise.all([
        fetch("/api/settings", { cache: "no-store" }).then((x) => x.json()),
        fetch("/api/reference", { cache: "no-store" }).then((x) => x.json()),
      ]);
      setMasterPrompt(s.masterPrompt || "");
      setDefaultStyle(s.defaultStyle || "");
      setCategories(Array.isArray(s.categories) ? s.categories : []);
      setRarities(
        (Array.isArray(s.rarities) ? s.rarities : []).map((r) => ({
          ...r,
          // Show the edit instruction that actually gets applied: use the stored
          // one if present, otherwise the built-in default for that tier. Saving
          // then makes it explicit for this loadout.
          edit: typeof r.edit === "string" ? r.edit : RARITY_EDIT_INSTRUCTIONS[r.name] ?? "",
        }))
      );
      setCatDefaults(s.categoryDefaults || {});
      setHasReference(!!r.hasReference);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  function flash(ok, text) {
    setStatus({ kind: ok ? "ok" : "err", text });
  }

  async function post(body, okText) {
    setStatus(null);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    flash(res.ok, res.ok ? okText : d.error || "Kunde inte spara.");
    return res.ok;
  }

  const saveMaster = () =>
    post({ masterPrompt }, "Master-prompt sparad. Gäller nya genereringar.");
  const saveCatDefaults = () => post({ categoryDefaults: catDefaults }, "Category defaults sparade.");

  async function saveCategories() {
    const cleaned = categories.filter((c) => (c.name || "").trim());
    if (cleaned.length === 0) return flash(false, "Minst en kategori krävs.");
    if (await post({ categories: cleaned }, "Kategorier sparade.")) loadAll();
  }

  async function saveRarities() {
    const cleaned = rarities.filter((r) => (r.name || "").trim());
    if (cleaned.length === 0) return flash(false, "Minst en rarity krävs.");
    if (await post({ rarities: cleaned }, "Rarities sparade.")) loadAll();
  }

  // -- category editor helpers --
  const setCat = (i, field, val) =>
    setCategories((prev) => prev.map((c, k) => (k === i ? { ...c, [field]: val } : c)));
  const addCat = () => setCategories((prev) => [...prev, { name: "", hint: "" }]);
  const removeCat = (i) => setCategories((prev) => prev.filter((_, k) => k !== i));

  // -- rarity editor helpers --
  const setRar = (i, field, val) =>
    setRarities((prev) => prev.map((r, k) => (k === i ? { ...r, [field]: val } : r)));
  const addRar = () =>
    setRarities((prev) => [
      ...prev,
      { name: "", style: "", color: RARITY_PALETTE[prev.length % RARITY_PALETTE.length] },
    ]);
  const removeRar = (i) => setRarities((prev) => prev.filter((_, k) => k !== i));
  // Load the built-in standard rarities into the editor (does not save until "Spara").
  const resetRarities = () => {
    setRarities(DEFAULT_RARITIES.map((r) => ({ ...r })));
    flash(true, "Standard-rarities inlästa — granska och tryck Spara för att använda dem.");
  };

  // Bulk-fill the Edit fields from a pasted block, one tier per line, e.g.
  //   Rare → keep the base pet ... CRITICAL: ...
  // Accepts →, -> or : as the separator (the FIRST one on the line), so any
  // colons inside the text (like "CRITICAL:") are left untouched. Only lines
  // whose leading word matches an existing rarity are used; blanks are ignored.
  const [editBlock, setEditBlock] = useState("");
  const importEditBlock = () => {
    const nameMap = new Map(
      rarities.filter((r) => (r.name || "").trim()).map((r) => [r.name.toLowerCase(), r.name])
    );
    const sepRe = /^\s*([A-Za-z][\w-]*)\s*(?:→|->|:)\s*(\S.*)$/;
    const parsed = {};
    for (const line of editBlock.split(/\r?\n/)) {
      const m = line.match(sepRe);
      if (!m) continue;
      const canon = nameMap.get(m[1].toLowerCase());
      if (!canon) continue;
      parsed[canon] = m[2].trim();
    }
    const hit = Object.keys(parsed);
    if (hit.length === 0) {
      return flash(false, "Hittade inga rader på formen “Tier → text”. Kolla att tier-namnen stämmer.");
    }
    setRarities((prev) => prev.map((r) => (parsed[r.name] !== undefined ? { ...r, edit: parsed[r.name] } : r)));
    flash(true, `Fyllde Edit på: ${hit.join(", ")}. Granska och tryck Spara rarities.`);
  };

  function onPickReference(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      setRefPreview(dataUrl);
      const res = await fetch("/api/reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const d = await res.json();
      if (res.ok) {
        setHasReference(true);
        flash(true, "Referensbild sparad. Nya bilder anpassas till dess stil.");
      } else {
        flash(false, d.error || "Kunde inte spara referensbilden.");
      }
    };
    reader.readAsDataURL(file);
  }

  async function removeReference() {
    await fetch("/api/reference", { method: "DELETE" });
    setHasReference(false);
    setRefPreview(null);
    flash(true, "Referensbild borttagen.");
  }

  if (loading)
    return (
      <div className="panel">
        <p className="placeholder">Laddar inställningar…</p>
      </div>
    );

  return (
    <div className="settings-stack">
      {activeName && (
        <div className="loadout-banner">
          Inställningarna nedan gäller loadouten <strong>{activeName}</strong>. Byt loadout högst
          upp för att redigera ett annat spel.
        </div>
      )}
      {status && <div className={`status ${status.kind}`}>{status.text}</div>}

      <section className="panel">
        <label htmlFor="master">Master-prompt (husstil)</label>
        <p className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
          Din genomgående stil — läggs på <strong>varje</strong> bild, så du behöver bara skriva
          namnet per asset. De tekniska kraven (transparent bakgrund, centrerat motiv, ingen
          text/ram) läggs alltid till automatiskt.
        </p>
        <textarea
          id="master"
          className="batch-input"
          style={{ minHeight: 120 }}
          spellCheck={false}
          placeholder={defaultStyle}
          value={masterPrompt}
          onChange={(e) => setMasterPrompt(e.target.value)}
        />
        <div className="actions">
          <button className="btn-primary" onClick={saveMaster}>Spara master-prompt</button>
          <button className="btn-ghost" onClick={() => setMasterPrompt(defaultStyle)}>Återställ standard</button>
        </div>
      </section>

      <section className="panel">
        <label>Kategorier</label>
        <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
          De typer du kan välja mellan när du skapar en asset. Beskrivningen är en kort rad om
          <em> vad saken är</em> — den vävs in i bilden, så egna kategorier blir lika bra som de
          inbyggda. T.ex. Building → “a small stylized building or structure”. Dra i{" "}
          <span aria-hidden="true">⠿</span> för att ändra ordning — tryck sedan Spara.
        </p>
        {categories.map((c, i) => (
          <div
            className={`vocab-row${isDragging("cat", i) ? " dragging" : ""}`}
            key={i}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={() => onDragEnterRow("cat", setCategories, i)}
          >
            <span
              className="drag-handle"
              title="Dra för att ändra ordning"
              draggable
              onDragStart={(e) => onDragStart(e, "cat", i)}
              onDragEnd={onDragEnd}
            >
              ⠿
            </span>
            <input
              className="vocab-name"
              type="text"
              placeholder="Namn"
              value={c.name}
              onChange={(e) => setCat(i, "name", e.target.value)}
            />
            <input
              className="vocab-desc"
              type="text"
              placeholder="Vad det är (valfritt)"
              value={c.hint}
              onChange={(e) => setCat(i, "hint", e.target.value)}
            />
            <button className="icon-btn" title="Ta bort" onClick={() => removeCat(i)}>×</button>
          </div>
        ))}
        <div className="actions">
          <button className="btn-ghost small" onClick={addCat}>+ Lägg till kategori</button>
          <button className="btn-primary" onClick={saveCategories}>Spara kategorier</button>
        </div>
      </section>

      <section className="panel">
        <label>Rarities</label>
        <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
          Dina rarity-nivåer. <em>Look</em> = vad nivån gör när en bild <strong>genereras från
          scratch</strong> (vävs in i prompten). <em>Edit</em> = vad nivån lägger på i fliken{" "}
          <strong>Rarity-tiers</strong> när den redigerar en <strong>befintlig basbild</strong> —
          lämna Edit tom för “kopiera basen rakt igenom” (gratis, ingen glow). Lägg gärna till egna
          nivåer (t.ex. <strong>Shadow</strong>) med egen Edit-text — de dyker då upp att välja i
          Rarity-tiers. <strong>None</strong> lämnas tom. Dra i <span aria-hidden="true">⠿</span>{" "}
          för att ändra ordning — tryck sedan Spara.
        </p>

        <details className="edit-import">
          <summary>📋 Klistra in alla edit-instruktioner på en gång</summary>
          <p className="hint" style={{ marginTop: 8 }}>
            En rad per tier på formen <code>Tier → text</code> (även <code>Tier: text</code> går).
            Bara Edit-fälten fylls; Look och färg rörs inte. <strong>Common</strong> brukar lämnas
            tom (gratis kopia) — töm Common-fältet efter import om du vill ha gratis-versionen.
            Fyller bara i — inget sparas förrän du trycker <em>Spara rarities</em>.
          </p>
          <textarea
            className="edit-import-box"
            rows={6}
            placeholder={"Uncommon → keep the base pet ... CRITICAL: ...\nRare → keep the base pet ... CRITICAL: ...\nLegendary → ..."}
            value={editBlock}
            onChange={(e) => setEditBlock(e.target.value)}
          />
          <div className="actions" style={{ marginTop: 8 }}>
            <button className="btn-ghost small" onClick={() => setEditBlock("")}>Rensa rutan</button>
            <button className="btn-primary small" onClick={importEditBlock}>Fyll Edit-fälten</button>
          </div>
        </details>
        {rarities.map((r, i) => {
          const isNone = r.name === "None";
          return (
            <div
              className={`vocab-row rarity-row${isDragging("rar", i) ? " dragging" : ""}`}
              key={i}
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={() => onDragEnterRow("rar", setRarities, i)}
            >
              <span
                className="drag-handle"
                title="Dra för att ändra ordning"
                draggable
                onDragStart={(e) => onDragStart(e, "rar", i)}
                onDragEnd={onDragEnd}
              >
                ⠿
              </span>
              <span className="swatch" style={{ background: r.color || "var(--muted)" }} />
              <input
                className="vocab-name"
                type="text"
                placeholder="Namn"
                value={r.name}
                onChange={(e) => setRar(i, "name", e.target.value)}
              />
              <input
                className="vocab-desc"
                type="text"
                placeholder={isNone ? "ingen rarity-look (lämnas tom)" : "look — vad den gör (generera)"}
                value={r.style}
                disabled={isNone}
                onChange={(e) => setRar(i, "style", e.target.value)}
              />
              <button className="icon-btn" title="Ta bort" onClick={() => removeRar(i)}>×</button>
              {!isNone && (
                <textarea
                  className="rarity-edit"
                  rows={2}
                  placeholder="edit — vad som läggs på basbilden i Rarity-tiers (lämna tom = kopiera basen, gratis)"
                  value={r.edit || ""}
                  onChange={(e) => setRar(i, "edit", e.target.value)}
                />
              )}
            </div>
          );
        })}
        <div className="actions">
          <button className="btn-ghost small" onClick={addRar}>+ Lägg till rarity</button>
          <button className="btn-ghost small" onClick={resetRarities}>↺ Återställ standard</button>
          <button className="btn-primary" onClick={saveRarities}>Spara rarities</button>
        </div>
      </section>

      <section className="panel">
        <label>Referensbild (stil-ankare)</label>
        <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
          Ladda upp en befintlig asset så matchar nya bilder dess stil — färger, linjer, känsla.
          Bra för att hålla ihop looken. Valfritt.
        </p>
        <div className="ref-box">
          {(refPreview || hasReference) ? (
            <div className="ref-preview">
              {refPreview ? <img src={refPreview} alt="referens" /> : <span className="ref-set">🎨 Referens aktiv</span>}
            </div>
          ) : (
            <div className="ref-empty">Ingen referensbild</div>
          )}
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
              {hasReference ? "Byt bild" : "Ladda upp bild"}
            </button>
            {hasReference && <button className="btn-ghost" onClick={removeReference}>Ta bort</button>}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: "none" }}
              onChange={onPickReference}
            />
          </div>
        </div>
      </section>

      <section className="panel">
        <label>Category defaults</label>
        <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
          Extra styrning som alltid läggs på en viss kategori — t.ex. att alla <em>Buildings</em>
          ritas isometriskt, eller att alla <em>Pets</em> visas i helfigur. Lämna tomt för att
          hoppa över.
        </p>
        {categories.map((c) => (
          <div className="field" key={c.name}>
            <label htmlFor={`cd-${c.name}`} style={{ textTransform: "none", letterSpacing: 0 }}>{c.name}</label>
            <input
              id={`cd-${c.name}`}
              type="text"
              placeholder={"valfri stil för " + c.name}
              value={catDefaults[c.name] || ""}
              onChange={(e) => setCatDefaults((prev) => ({ ...prev, [c.name]: e.target.value }))}
            />
          </div>
        ))}
        <div className="actions">
          <button className="btn-primary" onClick={saveCatDefaults}>Spara category defaults</button>
        </div>
      </section>
    </div>
  );
}
