"use client";

import { useEffect, useMemo, useState } from "react";
import { RARITY_COLOR } from "@/lib/colors";

function kb(bytes) {
  if (!bytes && bytes !== 0) return "";
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

export default function GalleryPanel() {
  const [data, setData] = useState({ assets: [], categories: [], count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cat, setCat] = useState("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [building, setBuilding] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/gallery", { cache: "no-store" });
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
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.assets.filter(
      (a) =>
        (cat === "all" || a.category === cat) &&
        (!q || a.filename.toLowerCase().includes(q))
    );
  }, [data.assets, cat, query]);

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

  async function remove(a) {
    if (!confirm(`Ta bort ${a.filename}?`)) return;
    try {
      const res = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id }),
      });
      if (!res.ok) throw new Error("Kunde inte ta bort.");
      setData((prev) => ({
        ...prev,
        assets: prev.assets.filter((x) => x.id !== a.id),
        count: prev.count - 1,
      }));
      setSelected((prev) => {
        const n = new Set(prev);
        n.delete(a.id);
        return n;
      });
    } catch (err) {
      setStatus({ kind: "err", text: err.message });
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
            Alla ({data.count})
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
            placeholder="Sök filnamn…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn-ghost small" onClick={load} disabled={loading}>
            {loading ? "Laddar…" : "Uppdatera"}
          </button>
          <button
            className={`btn-ghost small ${selectMode ? "active-ghost" : ""}`}
            onClick={() => {
              setSelectMode((v) => !v);
              setSelected(new Set());
            }}
          >
            {selectMode ? "Avbryt val" : "Välj"}
          </button>
          {data.count > 0 && !selectMode && (
            <a className="btn-primary small" href="/api/export">Ladda ner alla (zip)</a>
          )}
        </div>
      </div>

      {selectMode && (
        <div className="select-bar">
          <span>{selected.size} valda</span>
          <button
            className="btn-primary small"
            onClick={makeSpriteSheet}
            disabled={selected.size < 2 || building}
          >
            {building ? "Bygger…" : "Skapa sprite sheet"}
          </button>
          {selected.size > 0 && (
            <button className="btn-ghost small" onClick={() => setSelected(new Set())}>Rensa val</button>
          )}
          <span className="hint" style={{ margin: 0 }}>Välj minst 2 assets att packa ihop.</span>
        </div>
      )}

      {status && <div className={`status ${status.kind}`}>{status.text}</div>}
      {error && <div className="status err">{error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <div className="panel">
          <p className="placeholder" style={{ padding: "40px 8px" }}>
            {data.count === 0
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
                style={{ "--ring": a.rarity ? RARITY_COLOR[a.rarity] : "transparent" }}
                onClick={() => selectMode && toggleSelect(a.id)}
              >
                <div className="card-stage">
                  {selectMode && <span className={`check ${isSel ? "on" : ""}`}>{isSel ? "✓" : ""}</span>}
                  {!selectMode && (
                    <div className="card-actions">
                      <button
                        title="Skapa ny version"
                        onClick={(e) => { e.stopPropagation(); reroll(a); }}
                      >🔁</button>
                      <button
                        title="Ta bort"
                        onClick={(e) => { e.stopPropagation(); remove(a); }}
                      >🗑</button>
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
                    {a.rarity && (
                      <span className="tag">
                        <span className="dot" style={{ "--ring": RARITY_COLOR[a.rarity] }} />
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
    </div>
  );
}
