"use client";

import { useEffect, useMemo, useState } from "react";

function kb(bytes) {
  if (!bytes && bytes !== 0) return "";
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

export default function GalleryPanel({ includeRarity = true }) {
  const [data, setData] = useState({ assets: [], categories: [], count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cat, setCat] = useState("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(null); // { kind, text, action?: {label, fn} }
  const [trashMode, setTrashMode] = useState(false);

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [building, setBuilding] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [promptModal, setPromptModal] = useState(null); // { title, text, loading }
  const [remake, setRemake] = useState(null); // editable fields for "remake with tweaks"
  const [cats, setCats] = useState([]);
  const [rars, setRars] = useState([]);

  // Vocabulary for the remake editor's dropdowns.
  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setCats(Array.isArray(d.categories) ? d.categories : []);
        setRars(Array.isArray(d.rarities) ? d.rarities : []);
      })
      .catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/gallery${trashMode ? "?trash=1" : ""}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kunde inte läsa galleriet.");
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trashMode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.assets.filter(
      (a) =>
        (cat === "all" || a.category === cat) &&
        (!q ||
          a.filename.toLowerCase().includes(q) ||
          (a.name || "").toLowerCase().includes(q))
    );
  }, [data.assets, cat, query]);

  function dropFromView(id) {
    setData((prev) => ({
      ...prev,
      assets: prev.assets.filter((x) => x.id !== id),
      count: Math.max(0, prev.count - 1),
    }));
    setSelected((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function reroll(a) {
    setStatus(null);
    try {
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Kunde inte skapa ny version.");
      setStatus({ kind: "ok", text: `Ny version av ${a.filename} köad — dyker upp här när den är klar.` });
    } catch (err) {
      setStatus({ kind: "err", text: err.message });
    }
  }

  // Soft delete → offer Undo right away.
  async function remove(a) {
    try {
      const res = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id }),
      });
      if (!res.ok) throw new Error("Kunde inte ta bort.");
      dropFromView(a.id);
      setStatus({
        kind: "ok",
        text: `${a.filename} flyttad till papperskorgen.`,
        action: { label: "Ångra", fn: () => restore(a, true) },
      });
    } catch (err) {
      setStatus({ kind: "err", text: err.message });
    }
  }

  async function restore(a, silent) {
    try {
      const res = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, restore: true }),
      });
      if (!res.ok) throw new Error("Kunde inte återställa.");
      if (trashMode) dropFromView(a.id);
      setStatus({ kind: "ok", text: silent ? `${a.filename} återställd.` : `${a.filename} återställd till galleriet.` });
    } catch (err) {
      setStatus({ kind: "err", text: err.message });
    }
  }

  async function purge(a) {
    if (!confirm(`Ta bort ${a.filename} permanent? Det går inte att ångra.`)) return;
    try {
      const res = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, permanent: true }),
      });
      if (!res.ok) throw new Error("Kunde inte ta bort permanent.");
      dropFromView(a.id);
      setStatus({ kind: "ok", text: `${a.filename} borttagen permanent.` });
    } catch (err) {
      setStatus({ kind: "err", text: err.message });
    }
  }

  async function showPrompt(a) {
    setPromptModal({ title: a.filename, text: "", loading: true });
    try {
      const res = await fetch(`/api/prompt?id=${a.id}`, { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Kunde inte hämta prompten.");
      setPromptModal({ title: a.filename, text: d.prompt, loading: false });
    } catch (err) {
      setPromptModal({ title: a.filename, text: `Fel: ${err.message}`, loading: false });
    }
  }

  // Open the remake editor pre-filled with this asset's fields.
  async function openRemake(a) {
    setRemake({ loading: true, filename: a.filename });
    try {
      const res = await fetch(`/api/prompt?id=${a.id}`, { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Kunde inte läsa assetet.");
      setRemake({
        loading: false,
        filename: a.filename,
        name: d.name || "",
        category: d.category || cats[0]?.name || "",
        rarity: d.rarity || "None",
        size: d.size || 512,
        quality: d.quality || "medium",
        notes: d.rawNotes || "",
        busy: false,
      });
    } catch (err) {
      setRemake(null);
      setStatus({ kind: "err", text: err.message });
    }
  }

  async function submitRemake() {
    if (!remake?.name?.trim()) return;
    setRemake((r) => ({ ...r, busy: true }));
    try {
      const res = await fetch("/api/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          includeRarity,
          items: [
            {
              name: remake.name,
              category: remake.category,
              rarity: remake.rarity,
              size: Number(remake.size),
              quality: remake.quality,
              notes: remake.notes,
              variations: 1,
            },
          ],
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Kunde inte köa.");
      setRemake(null);
      setStatus({ kind: "ok", text: "Ny version köad — dyker upp här när den är klar. Uppdatera galleriet strax." });
    } catch (err) {
      setRemake((r) => ({ ...r, busy: false }));
      setStatus({ kind: "err", text: err.message });
    }
  }

  async function downloadSelected() {
    setDownloading(true);
    setStatus(null);
    try {
      const ids = [...selected];
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
      a.download = "valda-assets.zip";
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ kind: "ok", text: `${ids.length} valda assets nedladdade.` });
    } catch (err) {
      setStatus({ kind: "err", text: `Nedladdning misslyckades: ${err.message}` });
    } finally {
      setDownloading(false);
    }
  }

  function copyPrompt() {
    if (promptModal?.text) {
      navigator.clipboard?.writeText(promptModal.text).then(
        () => setStatus({ kind: "ok", text: "Prompt kopierad." }),
        () => {}
      );
    }
  }

  async function makeSpriteSheet() {
    setBuilding(true);
    setStatus(null);
    try {
      const ids = [...selected];
      const res = await fetch("/api/spritesheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "spritesheet.zip";
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ kind: "ok", text: `Sprite sheet med ${ids.length} assets nedladdad.` });
    } catch (err) {
      setStatus({ kind: "err", text: `Sprite sheet misslyckades: ${err.message}` });
    } finally {
      setBuilding(false);
    }
  }

  return (
    <div>
      <div className="gallery-bar">
        <div className="chips">
          <button className={`chip-btn ${cat === "all" ? "active" : ""}`} onClick={() => setCat("all")}>
            {trashMode ? "Papperskorg" : "Alla"} ({data.count})
          </button>
          {data.categories.map((c) => (
            <button key={c} className={`chip-btn ${cat === c ? "active" : ""}`} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="gallery-tools">
          <input
            type="text"
            placeholder="Sök namn…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn-ghost small" onClick={load} disabled={loading}>
            {loading ? "Laddar…" : "Uppdatera"}
          </button>
          <button
            className={`btn-ghost small ${trashMode ? "active-ghost" : ""}`}
            onClick={() => {
              setTrashMode((v) => !v);
              setSelectMode(false);
              setSelected(new Set());
              setCat("all");
            }}
          >
            {trashMode ? "← Galleri" : "Papperskorg"}
          </button>
          {!trashMode && (
            <button
              className={`btn-ghost small ${selectMode ? "active-ghost" : ""}`}
              onClick={() => {
                setSelectMode((v) => !v);
                setSelected(new Set());
              }}
            >
              {selectMode ? "Avbryt val" : "Välj"}
            </button>
          )}
          {data.count > 0 && !selectMode && !trashMode && (
            <a className="btn-primary small" href="/api/export">Ladda ner alla (zip)</a>
          )}
        </div>
      </div>

      {selectMode && !trashMode && (
        <div className="select-bar">
          <span>{selected.size} valda</span>
          <button
            className="btn-primary small"
            onClick={makeSpriteSheet}
            disabled={selected.size < 2 || building}
          >
            {building ? "Bygger…" : "Skapa sprite sheet"}
          </button>
          <button
            className="btn-ghost small"
            onClick={downloadSelected}
            disabled={selected.size === 0 || downloading}
          >
            {downloading ? "Packar…" : "Ladda ner valda (zip)"}
          </button>
          {selected.size > 0 && (
            <button className="btn-ghost small" onClick={() => setSelected(new Set())}>Rensa val</button>
          )}
          <span className="hint" style={{ margin: 0 }}>Välj minst 2 assets att packa ihop.</span>
        </div>
      )}

      {trashMode && (
        <div className="select-bar">
          <span className="hint" style={{ margin: 0 }}>
            Borttagna bilder ligger kvar här tills du tar bort dem permanent. Återställ med ↩.
          </span>
        </div>
      )}

      {status && (
        <div className={`status ${status.kind}`}>
          {status.text}{" "}
          {status.action && (
            <button type="button" className="linklike" onClick={status.action.fn}>
              {status.action.label}
            </button>
          )}
        </div>
      )}
      {error && <div className="status err">{error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <div className="panel">
          <p className="placeholder" style={{ padding: "40px 8px" }}>
            {trashMode
              ? "Papperskorgen är tom."
              : data.count === 0
              ? "Inga sparade assets än. Generera några så dyker de upp här."
              : "Inga assets matchar filtret."}
          </p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="gallery-grid">
          {filtered.map((a) => {
            const isSel = selected.has(a.id);
            return (
              <div
                key={a.id}
                className={`card ${selectMode ? "selectable" : ""} ${isSel ? "selected" : ""}`}
                style={{ "--ring": a.rarity && a.rarity !== "None" ? (a.color || "transparent") : "transparent" }}
                onClick={() => selectMode && toggleSelect(a.id)}
              >
                <div className="card-stage">
                  {selectMode && <span className={`check ${isSel ? "on" : ""}`}>{isSel ? "✓" : ""}</span>}
                  {!selectMode && !trashMode && (
                    <div className="card-actions">
                      <button title="Skapa ny version (samma prompt)" onClick={(e) => { e.stopPropagation(); reroll(a); }}>🔁</button>
                      <button title="Remake med ändringar" onClick={(e) => { e.stopPropagation(); openRemake(a); }}>✏️</button>
                      <button title="Visa prompt" onClick={(e) => { e.stopPropagation(); showPrompt(a); }}>📝</button>
                      <button title="Ta bort" onClick={(e) => { e.stopPropagation(); remove(a); }}>🗑</button>
                    </div>
                  )}
                  {trashMode && (
                    <div className="card-actions">
                      <button title="Återställ" onClick={(e) => { e.stopPropagation(); restore(a); }}>↩</button>
                      <button title="Ta bort permanent" onClick={(e) => { e.stopPropagation(); purge(a); }}>✕</button>
                    </div>
                  )}
                  {selectMode ? (
                    <img src={`/api/asset?id=${a.id}`} alt={a.filename} loading="lazy" />
                  ) : (
                    <a href={`/api/asset?id=${a.id}`} target="_blank" rel="noreferrer">
                      <img src={`/api/asset?id=${a.id}`} alt={a.filename} loading="lazy" />
                    </a>
                  )}
                </div>
                <div className="card-body">
                  <div className="card-name" title={a.filename}>{a.filename}</div>
                  <div className="card-meta">
                    {a.rarity && a.rarity !== "None" && (
                      <span className="tag">
                        <span className="dot" style={{ "--ring": a.color || "var(--muted)" }} />
                        {a.rarity}
                      </span>
                    )}
                    <span>{a.category}</span>
                    {a.size && <span>{a.size}px</span>}
                    <span>{kb(a.bytes)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {promptModal && (
        <div className="modal-overlay" onClick={() => setPromptModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <strong>Prompt · {promptModal.title}</strong>
              <button className="icon-btn" onClick={() => setPromptModal(null)}>×</button>
            </div>
            <p className="hint" style={{ marginTop: 0 }}>
              Detta är hela texten som skickades — ditt namn/notes plus master-prompt, kategorins
              betydelse, rarity-behandlingen och de fasta reglerna.
            </p>
            {promptModal.loading ? (
              <p className="placeholder">Hämtar…</p>
            ) : (
              <textarea className="batch-input" readOnly style={{ minHeight: 160 }} value={promptModal.text} />
            )}
            <div className="actions">
              <button className="btn-primary" onClick={copyPrompt} disabled={promptModal.loading}>Kopiera</button>
              <button className="btn-ghost" onClick={() => setPromptModal(null)}>Stäng</button>
            </div>
          </div>
        </div>
      )}
      {remake && (
        <div className="modal-overlay" onClick={() => !remake.busy && setRemake(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <strong>Remake med ändringar</strong>
              <button className="icon-btn" onClick={() => !remake.busy && setRemake(null)}>×</button>
            </div>
            {remake.loading ? (
              <p className="placeholder">Läser in…</p>
            ) : (
              <>
                <p className="hint" style={{ marginTop: 0 }}>
                  Justera fälten och kör om — en ny bild skapas, originalet lämnas orört.
                </p>
                <div className="field">
                  <label>Namn</label>
                  <input
                    type="text"
                    value={remake.name}
                    onChange={(e) => setRemake((r) => ({ ...r, name: e.target.value }))}
                  />
                </div>
                <div className="row">
                  <div className="field">
                    <label>Category</label>
                    <select value={remake.category} onChange={(e) => setRemake((r) => ({ ...r, category: e.target.value }))}>
                      {cats.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Rarity</label>
                    <select value={remake.rarity} onChange={(e) => setRemake((r) => ({ ...r, rarity: e.target.value }))}>
                      {rars.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="row">
                  <div className="field">
                    <label>Storlek</label>
                    <select value={remake.size} onChange={(e) => setRemake((r) => ({ ...r, size: Number(e.target.value) }))}>
                      {[256, 512, 1024].map((s) => <option key={s} value={s}>{s} × {s}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Quality</label>
                    <select value={remake.quality} onChange={(e) => setRemake((r) => ({ ...r, quality: e.target.value }))}>
                      {["low", "medium", "high"].map((q) => <option key={q} value={q}>{q}</option>)}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Custom art direction (notes)</label>
                  <input
                    type="text"
                    placeholder="t.ex. warmer colors, bigger glow"
                    value={remake.notes}
                    onChange={(e) => setRemake((r) => ({ ...r, notes: e.target.value }))}
                  />
                </div>
                <div className="actions">
                  <button className="btn-primary" onClick={submitRemake} disabled={remake.busy || !remake.name.trim()}>
                    {remake.busy ? "Köar…" : "Skapa ny version"}
                  </button>
                  <button className="btn-ghost" onClick={() => setRemake(null)} disabled={remake.busy}>Avbryt</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
