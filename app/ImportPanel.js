"use client";

import { useEffect, useRef, useState } from "react";

const CHUNK = 6; // upload a few files per request to keep each request small

function kb(bytes) {
  if (!bytes) return "";
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

export default function ImportPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [size, setSize] = useState(512);
  const [method, setMethod] = useState("floodfill"); // 'floodfill' | 'rembg'
  const [stagedFiles, setStagedFiles] = useState([]); // [{file, name}]
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [status, setStatus] = useState(null);
  const fileRef = useRef(null);

  const pending = items.filter((i) => i.status === "queued" || i.status === "processing").length;
  const done = items.filter((i) => i.status === "done");

  // Inline rename of results (before zipping). Local edits keyed by job id.
  const [nameEdits, setNameEdits] = useState({});
  const stem = (fn) => (fn || "").replace(/\.[a-z0-9]+$/i, "");
  const nameValue = (it) => (nameEdits[it.id] !== undefined ? nameEdits[it.id] : stem(it.filename));
  const onNameChange = (id, v) => setNameEdits((p) => ({ ...p, [id]: v }));
  async function saveRename(it) {
    const v = (nameValue(it) || "").trim();
    if (!v || v === stem(it.filename)) {
      setNameEdits((p) => {
        const n = { ...p };
        delete n[it.id];
        return n;
      });
      return;
    }
    try {
      const res = await fetch("/api/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: it.id, name: v }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.filename) {
        setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, filename: d.filename, name: d.name } : x)));
      }
    } catch {
      /* ignore */
    } finally {
      setNameEdits((p) => {
        const n = { ...p };
        delete n[it.id];
        return n;
      });
    }
  }

  async function loadItems() {
    try {
      const res = await fetch("/api/import", { cache: "no-store" });
      const d = await res.json();
      if (res.ok) setItems(d.items || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

  // Poll while anything is still queued/processing.
  useEffect(() => {
    if (pending === 0) return;
    const t = setTimeout(loadItems, 2000);
    return () => clearTimeout(t);
  }, [pending, items]);

  function onPickFiles(e) {
    const files = Array.from(e.target.files || []);
    if (files.length) {
      setStagedFiles((prev) => [
        ...prev,
        ...files.map((f) => ({ file: f, name: f.name.replace(/\.[a-z0-9]+$/i, "") })),
      ]);
    }
    if (fileRef.current) fileRef.current.value = "";
  }
  const removeStaged = (i) => setStagedFiles((prev) => prev.filter((_, k) => k !== i));
  const setStagedName = (i, val) =>
    setStagedFiles((prev) => prev.map((b, k) => (k === i ? { ...b, name: val } : b)));

  async function process() {
    if (stagedFiles.length === 0) return;
    setUploading(true);
    setStatus(null);
    let uploaded = 0;
    try {
      for (let i = 0; i < stagedFiles.length; i += CHUNK) {
        const slice = stagedFiles.slice(i, i + CHUNK);
        const fd = new FormData();
        fd.append("size", String(size));
        fd.append("method", method);
        fd.append("names", JSON.stringify(slice.map((b) => (b.name || "").trim())));
        for (const b of slice) fd.append("files", b.file);
        const res = await fetch("/api/import", { method: "POST", body: fd });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Uppladdning misslyckades.");
        }
        uploaded += slice.length;
        setProgress(`Laddar upp ${uploaded}/${stagedFiles.length}…`);
      }
      setProgress("");
      setStagedFiles([]);
      setStatus({ kind: "ok", text: `${uploaded} bild(er) i kö — bakgrunden tas bort på servern.` });
      await loadItems();
    } catch (err) {
      setStatus({ kind: "err", text: err.message });
    } finally {
      setUploading(false);
    }
  }

  async function downloadAll() {
    if (done.length === 0) return;
    setDownloading(true);
    try {
      const ids = done.map((i) => i.id);
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
      a.download = "borttagna-bakgrunder.zip";
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ kind: "ok", text: `${done.length} transparenta PNG nedladdade.` });
    } catch (err) {
      setStatus({ kind: "err", text: `Nedladdning misslyckades: ${err.message}` });
    } finally {
      setDownloading(false);
    }
  }

  async function clearImports(scope) {
    const label = scope === "done" ? "alla klara" : "ALLA";
    if (!window.confirm(`Ta bort ${label} bilder i den här listan permanent? Det går inte att ångra.`)) return;
    try {
      await fetch(`/api/import${scope === "done" ? "?scope=done" : ""}`, { method: "DELETE" });
      await loadItems();
      setStatus({ kind: "ok", text: scope === "done" ? "Klara bilder rensade." : "Listan rensad." });
    } catch {
      setStatus({ kind: "err", text: "Kunde inte rensa." });
    }
  }

  async function remove(it) {
    try {
      await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: it.id, permanent: true }),
      });
      setItems((prev) => prev.filter((x) => x.id !== it.id));
    } catch {
      /* ignore */
    }
  }

  return (
    <div>
      <section className="panel">
        <label>Ta bort bakgrund (batch)</label>
        <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
          Ladda upp dina egna bilder (även många på en gång). Servern tar bort bakgrunden, centrerar
          och exporterar transparenta PNG:er — <b>ingen generering, ingen kostnad</b>. De hamnar
          <b> här</b>, separat från ditt vanliga Gallery. Tips: plana, enfärgade bakgrunder utan glöd
          och sparkles blir renast.
        </p>

        <div className="field">
          <label>
            Bilder
            <span className="lbl-hint"> — namnet blir filnamnet (tomt = originalnamnet)</span>
          </label>
          {stagedFiles.length > 0 && (
            <div className="basefile-list">
              {stagedFiles.map((b, i) => (
                <span className="basefile" key={i}>
                  <input
                    className="basefile-name"
                    type="text"
                    value={b.name}
                    placeholder="namn"
                    onChange={(e) => setStagedName(i, e.target.value)}
                    title={b.file?.name || ""}
                    disabled={uploading}
                  />
                  <button title="Ta bort" onClick={() => removeStaged(i)} disabled={uploading}>×</button>
                </span>
              ))}
            </div>
          )}
          <button className="btn-ghost small" onClick={() => fileRef.current?.click()} disabled={uploading}>
            + Lägg till bilder
          </button>
        </div>

        <div className="row" style={{ alignItems: "flex-end" }}>
          <div className="field">
            <label htmlFor="imp-method">Bakgrund</label>
            <select id="imp-method" value={method} onChange={(e) => setMethod(e.target.value)} disabled={uploading}>
              <option value="floodfill">Enfärgad bakgrund (renast)</option>
              <option value="rembg">AI / foto</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="imp-size">Utstorlek</label>
            <select id="imp-size" value={size} onChange={(e) => setSize(Number(e.target.value))} disabled={uploading}>
              {[256, 512, 1024].map((s) => <option key={s} value={s}>{s} × {s}</option>)}
            </select>
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <button className="btn-primary" onClick={process} disabled={uploading || stagedFiles.length === 0}>
              {uploading ? progress || "Laddar upp…" : `Rensa bakgrund${stagedFiles.length ? ` (${stagedFiles.length})` : ""}`}
            </button>
          </div>
        </div>
        <p className="hint" style={{ marginTop: 2 }}>
          <b>Enfärgad bakgrund</b> tar bort en plan, enfärgad bakgrund och stannar exakt vid den
          svarta konturen — renast för spel-illustrationer (ägg, pets m.m.). <b>AI / foto</b> för
          bilder med skuggor eller rörig bakgrund.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={onPickFiles}
        />
        {status && <div className={`status ${status.kind}`}>{status.text}</div>}
      </section>

      {(pending > 0 || done.length > 0) && (
        <div className="select-bar" style={{ margintop: 4 }}>
          <span>{done.length} klara{pending > 0 ? ` · ${pending} kvar…` : ""}</span>
          <button className="btn-primary small" onClick={downloadAll} disabled={done.length === 0 || downloading}>
            {downloading ? "Packar…" : "Ladda ner alla (zip)"}
          </button>
          {done.length > 0 && (
            <button className="btn-ghost small" onClick={() => clearImports("done")}>Rensa klara</button>
          )}
          <button className="btn-ghost small" onClick={() => clearImports("all")}>Rensa alla</button>
        </div>
      )}

      {loading ? (
        <div className="panel"><p className="placeholder">Laddar…</p></div>
      ) : items.length === 0 ? (
        <div className="panel">
          <p className="placeholder" style={{ padding: "40px 8px" }}>
            Inga bilder här än. Välj bilder ovan för att ta bort bakgrunden.
          </p>
        </div>
      ) : (
        <div className="gallery-grid">
          {items.map((it) => (
            <div key={it.id} className="card">
              <div className="card-stage">
                <div className="card-actions">
                  <button title="Ta bort" onClick={() => remove(it)}>✕</button>
                </div>
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
                <input
                  className="card-rename"
                  type="text"
                  value={nameValue(it)}
                  title="Byt namn (sparas till zip-filnamnet)"
                  onChange={(e) => onNameChange(it.id, e.target.value)}
                  onBlur={() => saveRename(it)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
                <div className="card-meta">
                  <span>{it.status === "done" ? "klar" : it.status === "error" ? "fel" : "bearbetar…"}</span>
                  {it.bytes ? <span>{kb(it.bytes)}</span> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
