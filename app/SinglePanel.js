"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORIES, RARITIES, SIZES } from "@/lib/prompt";
import { RARITY_COLOR } from "@/lib/colors";

const QUALITIES = ["low", "medium", "high"];
const VARIATIONS = [1, 2, 3, 4];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function SinglePanel({ includeRarity }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [rarity, setRarity] = useState(RARITIES[0]);
  const [size, setSize] = useState(512);
  const [quality, setQuality] = useState("medium");
  const [variations, setVariations] = useState(1);
  const [notes, setNotes] = useState("");

  const [results, setResults] = useState([]); // [{id, status}]
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [hasReference, setHasReference] = useState(false);
  const pollRef = useRef(false);

  const ring = RARITY_COLOR[rarity];

  useEffect(() => {
    fetch("/api/reference")
      .then((r) => r.json())
      .then((d) => setHasReference(!!d.hasReference))
      .catch(() => {});
    return () => (pollRef.current = false);
  }, []);

  async function handleGenerate() {
    if (!name.trim()) {
      setStatus({ kind: "err", text: "Ange ett asset-namn först." });
      return;
    }
    setStatus(null);
    setBusy(true);
    setResults([]);
    try {
      const res = await fetch("/api/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          includeRarity,
          items: [{ name, category, rarity, size, notes, quality, variations }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunde inte köa.");
      const initial = data.jobs.map((j) => ({ id: j.id, status: "queued" }));
      setResults(initial);
      poll(initial.map((j) => j.id));
    } catch (err) {
      setBusy(false);
      setStatus({ kind: "err", text: err.message });
    }
  }

  async function poll(ids) {
    pollRef.current = true;
    while (pollRef.current) {
      await sleep(1500);
      let data;
      try {
        const res = await fetch("/api/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        data = await res.json();
      } catch {
        continue;
      }
      if (!data.jobs) continue;
      setResults(data.jobs.map((j) => ({ id: j.id, status: j.status, error: j.error })));
      const allDone = data.jobs.every((j) => ["done", "error", "cancelled"].includes(j.status));
      if (allDone) {
        setBusy(false);
        pollRef.current = false;
        const ok = data.jobs.filter((j) => j.status === "done").length;
        setStatus({ kind: "ok", text: `Klar — ${ok} bild(er) sparad(e) i Gallery.` });
        return;
      }
    }
  }

  return (
    <div className="grid">
      <section className="panel">
        <div className="field">
          <label htmlFor="name">Asset name</label>
          <input
            id="name"
            type="text"
            placeholder="t.ex. Golden Collar"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && handleGenerate()}
          />
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="category">Category</label>
            <select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rarity">Rarity</label>
            <select id="rarity" value={rarity} onChange={(e) => setRarity(e.target.value)}>
              {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="size">Output size</label>
            <select id="size" value={size} onChange={(e) => setSize(Number(e.target.value))}>
              {SIZES.map((s) => <option key={s} value={s}>{s} × {s}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="quality">Quality</label>
            <select id="quality" value={quality} onChange={(e) => setQuality(e.target.value)}>
              {QUALITIES.map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="variations">
            Variations <span className="lbl-hint">— hur många olika versioner att skapa på en gång</span>
          </label>
          <select id="variations" value={variations} onChange={(e) => setVariations(Number(e.target.value))}>
            {VARIATIONS.map((v) => (
              <option key={v} value={v}>{v} {v === 1 ? "bild" : "bilder"}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="notes">
            Custom art direction <span className="lbl-hint">— valfritt, extra styrning just för denna asset</span>
          </label>
          <input
            id="notes"
            type="text"
            placeholder="t.ex. cozy barn where eggs hatch, glowing windows"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && handleGenerate()}
          />
        </div>

        <div className="actions">
          <button className="btn-primary" onClick={handleGenerate} disabled={busy}>
            {busy ? "Genererar…" : `Generate${variations > 1 ? ` ${variations}` : ""}`}
          </button>
        </div>

        <div className="ref-line">
          {hasReference ? "🎨 Referensstil aktiv (styrs i Settings)" : "Ingen referensstil — sätt en i Settings för konsekvent look"}
        </div>

        {status && <div className={`status ${status.kind}`}>{status.text}</div>}
      </section>

      <section className="panel preview-panel">
        {results.length <= 1 ? (
          <div className="stage" style={{ "--ring": ring }}>
            {busy && results[0]?.status !== "done" ? (
              <div className="spinner" aria-label="Genererar" />
            ) : results[0]?.status === "done" ? (
              <img src={`/api/asset?id=${results[0].id}`} alt={name || "asset"} />
            ) : (
              <p className="placeholder">
                Previewn visas här.
                <br />
                Bilden genereras på servern och sparas automatiskt i Gallery.
              </p>
            )}
          </div>
        ) : (
          <div className="variation-grid">
            {results.map((r) => (
              <div className="stage small" key={r.id} style={{ "--ring": ring }}>
                {r.status === "done" ? (
                  <img src={`/api/asset?id=${r.id}`} alt="variant" />
                ) : r.status === "error" ? (
                  <span className="tiny-err">fel</span>
                ) : (
                  <div className="spinner small" />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="meta">
          <span className="tag">
            <span className="dot" style={{ "--ring": ring }} />
            {rarity} · {category}
          </span>
          <span className="tag">{size} px · {quality}</span>
        </div>
      </section>
    </div>
  );
}
