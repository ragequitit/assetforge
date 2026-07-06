"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_RARITIES, RARITY_EDIT_INSTRUCTIONS } from "@/lib/prompt";

// Built-in tier ladder (fallback until the loadout's own rarities load).
const BUILTIN_TIERS = DEFAULT_RARITIES.filter((r) => r.name !== "None").map((r) => ({
  name: r.name,
  color: r.color,
  free: !((RARITY_EDIT_INSTRUCTIONS[r.name] || "").trim()),
}));

// gpt-image-1.5 per-image cost by quality (1024², USD). Estimate only.
const COST = { low: 0.009, medium: 0.034, high: 0.133 };

function kb(bytes) {
  if (!bytes) return "";
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

export default function RarityEditPanel() {
  const [baseFiles, setBaseFiles] = useState([]); // File[]
  // Tiers come from the ACTIVE LOADOUT (so custom rarities like "Shadow" appear);
  // start from the built-in set until the first load returns.
  const [tiers, setTiers] = useState(BUILTIN_TIERS);
  const tierOrder = useMemo(() => tiers.map((t) => t.name), [tiers]);
  const [selected, setSelected] = useState(() => new Set());
  const defaultedRef = useRef(false);
  const [variants, setVariants] = useState(2);
  const [quality, setQuality] = useState("high");
  const [size, setSize] = useState(512);

  const [items, setItems] = useState([]);
  const [preparing, setPreparing] = useState(0);
  const [prepErrors, setPrepErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [status, setStatus] = useState(null);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState(() => new Set()); // selected output ids (for zip)
  const fileRef = useRef(null);

  const pending = items.filter((i) => i.status === "queued" || i.status === "processing").length;
  const done = items.filter((i) => i.status === "done");
  const failed = items.filter((i) => i.status === "error");

  async function loadItems() {
    try {
      const res = await fetch("/api/rarity-edit", { cache: "no-store" });
      const d = await res.json();
      if (res.ok) {
        setItems(d.items || []);
        setPreparing(d.preparing || 0);
        setPrepErrors(d.prepErrors || []);
        if (Array.isArray(d.tiers) && d.tiers.length) {
          setTiers(d.tiers);
          // First time we learn the loadout's tiers, pre-select the classic
          // Common→Legendary span among whatever tiers actually exist.
          if (!defaultedRef.current) {
            defaultedRef.current = true;
            const names = new Set(d.tiers.map((t) => t.name));
            const pref = ["Common", "Uncommon", "Rare", "Epic", "Legendary"].filter((n) =>
              names.has(n)
            );
            if (pref.length) setSelected(new Set(pref));
          }
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

  // Poll while a base is still being prepared OR any tier is still queued/processing.
  useEffect(() => {
    if (pending === 0 && preparing === 0) return;
    const t = setTimeout(loadItems, 2500);
    return () => clearTimeout(t);
  }, [pending, preparing, items]);

  // --- cost preview ---
  const plan = useMemo(() => {
    const chosen = tierOrder.filter((t) => selected.has(t));
    let apiJobs = 0;
    let freeJobs = 0;
    for (const t of chosen) {
      const isFree = tiers.find((x) => x.name === t)?.free;
      if (isFree) freeJobs += 1;
      else apiJobs += variants;
    }
    const perBase = apiJobs + freeJobs;
    const nBase = baseFiles.length || 0;
    const totalApi = apiJobs * nBase;
    const est = (totalApi * (COST[quality] || COST.high)).toFixed(2);
    return { chosen, perBase, nBase, totalApi, est };
  }, [selected, variants, quality, baseFiles, tiers, tierOrder]);

  function toggleTier(name) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }
  const selectAllTiers = () => setSelected(new Set(tierOrder));
  const clearTiers = () => setSelected(new Set());

  function onPickFiles(e) {
    const files = Array.from(e.target.files || []);
    if (files.length) {
      setBaseFiles((prev) => [
        ...prev,
        ...files.map((f) => ({ file: f, name: f.name.replace(/\.[a-z0-9]+$/i, "") })),
      ]);
    }
    if (fileRef.current) fileRef.current.value = "";
  }
  const removeBaseFile = (i) => setBaseFiles((prev) => prev.filter((_, k) => k !== i));
  const setBaseName = (i, val) =>
    setBaseFiles((prev) => prev.map((b, k) => (k === i ? { ...b, name: val } : b)));

  async function generate() {
    if (baseFiles.length === 0) return setStatus({ kind: "err", text: "Lägg till minst en basbild." });
    if (plan.chosen.length === 0) return setStatus({ kind: "err", text: "Välj minst en tier." });
    if (
      plan.totalApi > 20 &&
      !window.confirm(
        `Skapa ${plan.totalApi} redigerade bilder (plus gratis Common-kopior)? Uppskattad kostnad ~$${plan.est} på OpenAI-nyckeln.`
      )
    )
      return;

    setUploading(true);
    setStatus(null);
    try {
      const fd = new FormData();
      fd.append("tiers", JSON.stringify(plan.chosen));
      fd.append("variants", String(variants));
      fd.append("quality", quality);
      fd.append("size", String(size));
      // Names line up with the files in append order — the output files are named
      // <name>-<tier>.png, so "dog" → dog-common.png, dog-rare.png, …
      fd.append("names", JSON.stringify(baseFiles.map((b) => (b.name || "").trim())));
      for (const b of baseFiles) fd.append("files", b.file);
      const res = await fetch("/api/rarity-edit", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Kunde inte köa.");
      setStatus({
        kind: "ok",
        text: `${plan.nBase} basbild(er) rensas till transparent — tiers skapas automatiskt när basen är klar.`,
      });
      setBaseFiles([]);
      await loadItems();
    } catch (err) {
      setStatus({ kind: "err", text: err.message });
    } finally {
      setUploading(false);
    }
  }

  async function cancelRun() {
    try {
      const res = await fetch("/api/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "rarity" }),
      });
      const d = await res.json().catch(() => ({}));
      await loadItems();
      setStatus({
        kind: "ok",
        text: `Avbrutet — ${d.cancelled || 0} kvarvarande jobb stoppade. Bilder som redan var igång blir klara.`,
      });
    } catch {
      setStatus({ kind: "err", text: "Kunde inte avbryta." });
    }
  }

  async function reroll(it) {
    try {
      await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: it.id }),
      });
      await loadItems();
    } catch {
      /* ignore */
    }
  }

  async function retryFailed() {
    for (const it of failed) await reroll(it);
  }

  async function remove(it) {
    try {
      await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: it.id, permanent: true }),
      });
      setItems((prev) => prev.filter((x) => x.id !== it.id));
      setPicked((prev) => {
        const n = new Set(prev);
        n.delete(it.id);
        return n;
      });
    } catch {
      /* ignore */
    }
  }

  async function clearAll(scope) {
    const label = scope === "done" ? "alla klara" : "ALLA";
    if (!window.confirm(`Ta bort ${label} bilder i det här galleriet permanent? Går inte att ångra.`))
      return;
    try {
      await fetch(`/api/rarity-edit${scope === "done" ? "?scope=done" : ""}`, { method: "DELETE" });
      setPicked(new Set());
      await loadItems();
    } catch {
      setStatus({ kind: "err", text: "Kunde inte rensa." });
    }
  }

  function togglePick(id) {
    setPicked((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function downloadZip(ids, label) {
    if (ids.length === 0) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "rarity-tiers.zip";
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ kind: "ok", text: `${ids.length} PNG nedladdade (${label}).` });
    } catch (err) {
      setStatus({ kind: "err", text: `Nedladdning misslyckades: ${err.message}` });
    } finally {
      setDownloading(false);
    }
  }

  // Group done/pending items by base pet name, tiers in ladder order.
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? items.filter((i) => (i.name || "").toLowerCase().includes(q)) : items;
    const byName = new Map();
    for (const it of filtered) {
      if (!byName.has(it.name)) byName.set(it.name, []);
      byName.get(it.name).push(it);
    }
    for (const arr of byName.values()) {
      arr.sort((a, b) => {
        const d = tierOrder.indexOf(a.rarity) - tierOrder.indexOf(b.rarity);
        return d !== 0 ? d : a.filename.localeCompare(b.filename);
      });
    }
    return [...byName.entries()];
  }, [items, search, tierOrder]);

  return (
    <div>
      <section className="panel">
        <label>Rarity-tiers från basbild (image-to-image)</label>
        <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
          Ladda upp en eller flera <b>godkända bas-pets</b> (transparent PNG, 512 eller 1024) och
          välj vilka tiers du vill ut. Varje tier körs som en <b>edit</b> mot basbilden, så
          identiteten hålls och tiern lägger bara på rätt glow/finish. <b>Common</b> kopieras rakt
          igenom utan kostnad. Berikaren är av i det här flödet. Resultaten hamnar <b>här</b>,
          separat från ditt vanliga Gallery.
        </p>

        {/* base images */}
        <div className="field">
          <label>
            Basbilder
            <span className="lbl-hint"> — namnet blir filnamnet: “dog” → dog-common, dog-rare …</span>
          </label>
          {baseFiles.length > 0 && (
            <div className="basefile-list">
              {baseFiles.map((b, i) => (
                <span className="basefile" key={i}>
                  <input
                    className="basefile-name"
                    type="text"
                    value={b.name}
                    placeholder="namn"
                    onChange={(e) => setBaseName(i, e.target.value)}
                    title={b.file?.name || ""}
                  />
                  <button title="Ta bort" onClick={() => removeBaseFile(i)}>×</button>
                </span>
              ))}
            </div>
          )}
          <button className="btn-ghost small" onClick={() => fileRef.current?.click()} disabled={uploading}>
            + Lägg till basbild(er)
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/webp"
            multiple
            hidden
            onChange={onPickFiles}
          />
        </div>

        {/* tier picker */}
        <div className="field" style={{ marginTop: 6 }}>
          <label>
            Tiers att skapa
            <span className="lbl-hint">
              {" "}— <button className="linklike" onClick={selectAllTiers}>alla</button> ·{" "}
              <button className="linklike" onClick={clearTiers}>inga</button>
            </span>
          </label>
          <div className="tier-pick">
            {tiers.map((t) => (
              <label key={t.name} className={`tier-chip ${selected.has(t.name) ? "on" : ""}`}>
                <input type="checkbox" checked={selected.has(t.name)} onChange={() => toggleTier(t.name)} />
                <span className="swatch" style={{ background: t.color || "var(--muted)" }} />
                <span className="tier-name">{t.name}</span>
                {t.free && <span className="tier-free">gratis</span>}
              </label>
            ))}
          </div>
        </div>

        {/* options */}
        <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field">
            <label htmlFor="re-var">Varianter per tier <span className="lbl-hint">(best-of)</span></label>
            <select id="re-var" value={variants} onChange={(e) => setVariants(Number(e.target.value))} disabled={uploading}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="re-q">Kvalitet</label>
            <select id="re-q" value={quality} onChange={(e) => setQuality(e.target.value)} disabled={uploading}>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="re-size">Utstorlek</label>
            <select id="re-size" value={size} onChange={(e) => setSize(Number(e.target.value))} disabled={uploading}>
              {[256, 512, 1024].map((s) => <option key={s} value={s}>{s} × {s}</option>)}
            </select>
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <button className="btn-primary" onClick={generate} disabled={uploading}>
              {uploading ? "Köar…" : "Skapa rarity-tiers"}
            </button>
          </div>
        </div>

        {plan.nBase > 0 && plan.chosen.length > 0 && (
          <p className="hint" style={{ marginTop: 4 }}>
            {plan.nBase} basdjur × {plan.chosen.length} tiers → <b>{plan.totalApi}</b> edit-bilder
            {plan.totalApi > 0 ? ` (uppskattat ~$${plan.est})` : ""} plus gratis Common-kopior.
          </p>
        )}
        {status && <div className={`status ${status.kind}`}>{status.text}</div>}
      </section>

      {/* base-prep progress / errors */}
      {preparing > 0 && (
        <div className="status ok">
          Förbereder {preparing} basbild(er) till transparent — tiers dyker upp automatiskt strax…
        </div>
      )}
      {prepErrors.map((e, i) => (
        <div className="status err" key={i}>
          Kunde inte förbereda basbilden “{e.name}”: {e.error}
        </div>
      ))}

      {/* results toolbar */}
      {(preparing > 0 || pending > 0 || done.length > 0 || failed.length > 0) && (
        <div className="select-bar">
          <span>
            {done.length} klara{pending > 0 ? ` · ${pending} kvar…` : ""}
            {failed.length > 0 ? ` · ${failed.length} fel` : ""}
          </span>
          {(pending > 0 || preparing > 0) && (
            <button className="btn-ghost small danger" onClick={cancelRun}>
              ✕ Avbryt körning
            </button>
          )}
          <input
            className="search-mini"
            type="text"
            placeholder="sök basdjur…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="btn-primary small"
            onClick={() => downloadZip([...picked], "valda")}
            disabled={picked.size === 0 || downloading}
          >
            {downloading ? "Packar…" : `Ladda ner valda (${picked.size})`}
          </button>
          <button
            className="btn-ghost small"
            onClick={() => downloadZip(done.map((i) => i.id), "alla")}
            disabled={done.length === 0 || downloading}
          >
            Ladda ner alla (zip)
          </button>
          {failed.length > 0 && (
            <button className="btn-ghost small" onClick={retryFailed}>Försök igen på misslyckade</button>
          )}
          {done.length > 0 && (
            <button className="btn-ghost small" onClick={() => clearAll("done")}>Rensa klara</button>
          )}
          <button className="btn-ghost small" onClick={() => clearAll("all")}>Rensa alla</button>
        </div>
      )}

      {/* results gallery, grouped by base pet */}
      {loading ? (
        <div className="panel"><p className="placeholder">Laddar…</p></div>
      ) : items.length === 0 ? (
        <div className="panel">
          <p className="placeholder" style={{ padding: "40px 8px" }}>
            {preparing > 0
              ? "Rensar basbilden till transparent… tiers dyker upp här när den är klar."
              : "Inga rarity-tiers än. Lägg till en basbild ovan, välj tiers och tryck “Skapa rarity-tiers”."}
          </p>
        </div>
      ) : (
        groups.map(([name, arr]) => (
          <div className="tier-group" key={name}>
            <div className="tier-group-head">{name}</div>
            <div className="gallery-grid">
              {arr.map((it) => (
                <div key={it.id} className="card">
                  <div className="card-stage">
                    <div className="card-actions">
                      {it.status === "done" && (
                        <button title="Re-roll (ny variant)" onClick={() => reroll(it)}>🔁</button>
                      )}
                      <button title="Ta bort" onClick={() => remove(it)}>✕</button>
                    </div>
                    {it.status === "done" && (
                      <label className="card-pick" title="Markera för nedladdning">
                        <input type="checkbox" checked={picked.has(it.id)} onChange={() => togglePick(it.id)} />
                      </label>
                    )}
                    {it.status === "done" ? (
                      <a href={`/api/asset?id=${it.id}`} target="_blank" rel="noreferrer">
                        <img src={`/api/asset?id=${it.id}`} alt={it.filename} loading="lazy" />
                      </a>
                    ) : it.status === "error" ? (
                      <span className="tiny-err" title={it.error || ""}>fel</span>
                    ) : (
                      <div className="spinner" />
                    )}
                  </div>
                  <div className="card-body">
                    <div className="card-name" title={it.filename}>
                      <span className="swatch" style={{ background: it.color || "var(--muted)" }} />
                      {it.rarity}
                    </div>
                    <div className="card-meta">
                      <span>{it.status === "done" ? "klar" : it.status === "error" ? "fel" : "bearbetar…"}</span>
                      {it.bytes ? <span>{kb(it.bytes)}</span> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
