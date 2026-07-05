"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SIZES } from "@/lib/prompt";
import { parseBatch } from "@/lib/parseBatch";

const QUALITIES = ["low", "medium", "high"];
const MAX_THUMBS = 18;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PLACEHOLDER = `# En asset per rad:  name | category | rarity | size | notes
# Allt efter namnet är valfritt och faller tillbaka på standardvärdena nedan.

Golden Collar | Gear | Legendary
Hatchery | Building | Rare | 512 | cozy barn where eggs hatch, glowing windows
Fire Boots | Gear | Epic | | wreathed in flames, embers drifting up
Dragon Egg | Egg | Mythical | 1024 | cracked shell, light leaking out
Simple Stick | Resource | Common`;

export default function BatchPanel({ includeRarity, batchText, setBatchText }) {
  const text = batchText;
  const setText = setBatchText;
  const [cats, setCats] = useState([]); // [{name, hint}]
  const [rars, setRars] = useState([]); // [{name, style, color}]
  const [dCategory, setDCategory] = useState("");
  const [dRarity, setDRarity] = useState("");
  const [dSize, setDSize] = useState(512);
  const [quality, setQuality] = useState("medium");

  const rarColor = useMemo(
    () => Object.fromEntries(rars.map((r) => [r.name, r.color])),
    [rars]
  );

  // Load this loadout's categories + rarities for the dropdowns and parsing.
  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const c = Array.isArray(d.categories) ? d.categories : [];
        const rr = Array.isArray(d.rarities) ? d.rarities : [];
        setCats(c);
        setRars(rr);
        setDCategory(c[0]?.name || "");
        const common = rr.find((x) => x.name === "Common");
        setDRarity(common ? "Common" : rr[0]?.name || "");
      })
      .catch(() => {});
  }, []);

  const [jobs, setJobs] = useState([]); // [{id, name, category, rarity, size, filename, status, error}]
  const [running, setRunning] = useState(false);
  const [thumbs, setThumbs] = useState([]);
  const [batchId, setBatchId] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const pollRef = useRef(false);
  const seenDone = useRef(new Set());

  useEffect(() => () => (pollRef.current = false), []);

  // Reconnect to a run that's still going (e.g. after a page reload).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/active", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && data.jobs && data.jobs.length > 0) {
          setJobs(data.jobs);
          setBatchId(data.batchId || null);
          const active = data.jobs.some((j) => j.status === "queued" || j.status === "processing");
          if (active) {
            setRunning(true);
            poll(data.jobs.map((j) => j.id));
          }
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const defaults = useMemo(
    () => ({
      category: dCategory,
      rarity: dRarity,
      size: dSize,
      includeRarity,
      categoryNames: cats.map((c) => c.name),
      rarityNames: rars.map((r) => r.name),
    }),
    [dCategory, dRarity, dSize, includeRarity, cats, rars]
  );
  const { items, warningCount } = useMemo(() => parseBatch(text, defaults), [text, defaults]);

  const counts = useMemo(() => {
    let done = 0, error = 0, cancelled = 0, active = 0;
    for (const j of jobs) {
      if (j.status === "done") done++;
      else if (j.status === "error") error++;
      else if (j.status === "cancelled") cancelled++;
      else active++;
    }
    return { done, error, cancelled, active };
  }, [jobs]);

  // Rough per-image cost by quality (USD). Estimate only — prices can change.
  const COST_PER_IMG = { low: 0.02, medium: 0.04, high: 0.08 };
  const estCost = (n) => (n * (COST_PER_IMG[quality] || 0.04)).toFixed(2);

  async function startAll() {
    if (!items.length) return;
    if (
      items.length > 20 &&
      !window.confirm(
        `Generera ${items.length} bilder? Uppskattad kostnad ~$${estCost(items.length)} på OpenAI-nyckeln.`
      )
    )
      return;
    setThumbs([]);
    seenDone.current = new Set();
    setRunning(true);
    try {
      const res = await fetch("/api/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          includeRarity,
          items: items.map((it) => ({
            name: it.name,
            category: it.category,
            rarity: it.rarity,
            size: it.size,
            notes: it.notes,
            quality,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunde inte köa.");
      setBatchId(data.batchId);
      const initial = data.jobs.map((j) => ({ ...j, status: "queued" }));
      setJobs(initial);
      poll(initial.map((j) => j.id));
    } catch (err) {
      setRunning(false);
      setJobs([{ id: "err", name: err.message, status: "error", error: err.message }]);
    }
  }

  async function cancelQueue() {
    setCancelling(true);
    try {
      await fetch("/api/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId }),
      });
    } catch {
      /* ignore; poll reflects the result */
    } finally {
      setCancelling(false);
    }
  }

  async function retryFailed() {
    const failed = jobs.filter((j) => j.status === "error");
    if (failed.length === 0) return;
    setRunning(true);
    const newJobs = [];
    for (const f of failed) {
      try {
        const res = await fetch("/api/regenerate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: f.id }),
        });
        const d = await res.json();
        if (res.ok) {
          newJobs.push({
            id: d.id, name: f.name, category: f.category, rarity: f.rarity,
            size: f.size, filename: f.filename, status: "queued",
          });
        }
      } catch {
        /* skip this one */
      }
    }
    if (newJobs.length) {
      seenDone.current = new Set();
      setJobs(newJobs);
      poll(newJobs.map((j) => j.id));
    } else {
      setRunning(false);
    }
  }

  async function poll(ids) {
    pollRef.current = true;
    while (pollRef.current) {
      await sleep(2000);
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
      setJobs(data.jobs);

      for (const j of data.jobs) {
        if (j.status === "done" && !seenDone.current.has(j.id)) {
          seenDone.current.add(j.id);
          setThumbs((prev) =>
            [{ id: j.id, filename: j.filename }, ...prev].slice(0, MAX_THUMBS)
          );
        }
      }

      const allTerminal = data.jobs.every(
        (j) => j.status === "done" || j.status === "error" || j.status === "cancelled"
      );
      if (allTerminal) {
        setRunning(false);
        pollRef.current = false;
        return;
      }
    }
  }

  const total = jobs.length || items.length;
  const finished = counts.done + counts.error + counts.cancelled;
  const pct = jobs.length ? Math.round((finished / jobs.length) * 100) : 0;

  return (
    <div className="batch">
      <section className="panel">
        <div className="field">
          <label htmlFor="batch-text">Assets (en per rad)</label>
          <textarea
            id="batch-text"
            className="batch-input"
            spellCheck={false}
            placeholder={PLACEHOLDER}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={running}
          />
        </div>

        <div className="defaults-row">
          <span className="defaults-label">Standard för tomma fält:</span>
          <select value={dCategory} onChange={(e) => setDCategory(e.target.value)} disabled={running}>
            {cats.map((c) => <option key={c.name}>{c.name}</option>)}
          </select>
          <select value={dRarity} onChange={(e) => setDRarity(e.target.value)} disabled={running}>
            {rars.map((r) => <option key={r.name}>{r.name}</option>)}
          </select>
          <select value={dSize} onChange={(e) => setDSize(Number(e.target.value))} disabled={running}>
            {SIZES.map((s) => <option key={s} value={s}>{s} px</option>)}
          </select>
          <select value={quality} onChange={(e) => setQuality(e.target.value)} disabled={running}>
            {QUALITIES.map((q) => <option key={q} value={q}>{q} quality</option>)}
          </select>
        </div>

        {items.length > 0 && !running && (
          <p className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
            {items.length} {items.length === 1 ? "bild" : "bilder"} · ~${estCost(items.length)} (uppskattning, {quality})
          </p>
        )}

        <div className="actions">
          <button className="btn-primary" onClick={startAll} disabled={running || items.length === 0}>
            {running ? "Kör på servern…" : items.length ? `Generate all (${items.length})` : "Inga assets"}
          </button>
          {running && (
            <button className="btn-ghost" onClick={cancelQueue} disabled={cancelling}>
              {cancelling ? "Avbryter…" : "Avbryt kö"}
            </button>
          )}
          {!running && counts.error > 0 && (
            <button className="btn-ghost" onClick={retryFailed}>
              Försök igen på misslyckade ({counts.error})
            </button>
          )}
        </div>

        {jobs.length > 0 && (
          <div className="progress-wrap">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="progress-legend">
              <span>{finished}/{jobs.length} klara</span>
              <span className="ok-text">✓ {counts.done}</span>
              {counts.error > 0 && <span className="err-text">✕ {counts.error}</span>}
              {counts.cancelled > 0 && <span className="warn-text">⊘ {counts.cancelled}</span>}
            </div>
          </div>
        )}

        <p className="hint">
          Kön körs på servern — du kan stänga fliken och komma tillbaka senare, jobben fortsätter ändå.
          {warningCount > 0 && !running ? ` · ${warningCount} varning(ar) i listan.` : ""}
        </p>
      </section>

      <section className="panel">
        <label style={{ marginBottom: 12 }}>{jobs.length ? "Kö" : `Förhandsgranskning (${items.length})`}</label>
        <div className="queue">
          {jobs.length === 0 &&
            items.map((it, i) => (
              <div key={i} className="qrow">
                <span className="qidx">{i + 1}</span>
                <span className="qdot" style={{ background: rarColor[it.rarity] || "var(--muted)" }} />
                <div className="qmain">
                  <div className="qname">
                    {it.name}
                    <span className="qfile">{it.filename}</span>
                  </div>
                  <div className="qmeta">
                    {it.category} · {it.rarity} · {it.size}px{it.notes ? ` · ${it.notes}` : ""}
                  </div>
                  {it.warnings.map((w, k) => (
                    <div key={k} className="qwarn">⚠ {w}</div>
                  ))}
                </div>
              </div>
            ))}

          {jobs.map((j, i) => (
            <div key={j.id} className={`qrow ${j.status}`}>
              <span className="qidx">{i + 1}</span>
              <span className="qdot" style={{ background: rarColor[j.rarity] || "var(--muted)" }} />
              <div className="qmain">
                <div className="qname">
                  {j.name}
                  {j.filename && <span className="qfile">{j.filename}</span>}
                </div>
                <div className="qmeta">
                  {j.category} · {j.rarity} · {j.size}px
                </div>
                {j.error && <div className="qerr">✕ {j.error}</div>}
              </div>
              <span className={`chip chip-${j.status === "processing" ? "running" : j.status}`}>
                {j.status === "done"
                  ? "✓"
                  : j.status === "error"
                  ? "✕"
                  : j.status === "cancelled"
                  ? "⊘"
                  : j.status === "processing"
                  ? "…"
                  : "•"}
              </span>
            </div>
          ))}
        </div>

        {thumbs.length > 0 && (
          <>
            <label style={{ margin: "18px 0 10px" }}>Senast klara</label>
            <div className="thumbs">
              {thumbs.map((t) => (
                <div className="thumb" key={t.id} title={t.filename}>
                  <img src={`/api/asset?id=${t.id}`} alt={t.filename} loading="lazy" />
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
