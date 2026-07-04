"use client";

import { useEffect, useRef, useState } from "react";

export default function SettingsPanel() {
  const [masterPrompt, setMasterPrompt] = useState("");
  const [defaultStyle, setDefaultStyle] = useState("");
  const [categories, setCategories] = useState([]);
  const [catDefaults, setCatDefaults] = useState({});
  const [hasReference, setHasReference] = useState(false);
  const [refPreview, setRefPreview] = useState(null);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const fileRef = useRef(null);

  async function loadAll() {
    try {
      const [s, r] = await Promise.all([
        fetch("/api/settings", { cache: "no-store" }).then((x) => x.json()),
        fetch("/api/reference", { cache: "no-store" }).then((x) => x.json()),
      ]);
      setMasterPrompt(s.masterPrompt || "");
      setDefaultStyle(s.defaultStyle || "");
      setCategories(s.categories || []);
      setCatDefaults(s.categoryDefaults || {});
      setHasReference(!!r.hasReference);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function saveMaster() {
    setStatus(null);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ masterPrompt }),
    });
    setStatus(res.ok
      ? { kind: "ok", text: "Master-prompt sparad. Gäller nya genereringar." }
      : { kind: "err", text: "Kunde inte spara master-prompt." });
  }

  async function saveCatDefaults() {
    setStatus(null);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryDefaults: catDefaults }),
    });
    setStatus(res.ok
      ? { kind: "ok", text: "Category defaults sparade." }
      : { kind: "err", text: "Kunde inte spara." });
  }

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
        setStatus({ kind: "ok", text: "Referensbild sparad. Nya bilder anpassas till dess stil." });
      } else {
        setStatus({ kind: "err", text: d.error || "Kunde inte spara referensbilden." });
      }
    };
    reader.readAsDataURL(file);
  }

  async function removeReference() {
    await fetch("/api/reference", { method: "DELETE" });
    setHasReference(false);
    setRefPreview(null);
    setStatus({ kind: "ok", text: "Referensbild borttagen." });
  }

  if (loading) return <div className="panel"><p className="placeholder">Laddar inställningar…</p></div>;

  return (
    <div className="settings-stack">
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
          <div className="field" key={c}>
            <label htmlFor={`cd-${c}`} style={{ textTransform: "none", letterSpacing: 0 }}>{c}</label>
            <input
              id={`cd-${c}`}
              type="text"
              placeholder={c === "Building" ? "t.ex. isometric view, small footprint" : "valfri stil för " + c}
              value={catDefaults[c] || ""}
              onChange={(e) => setCatDefaults((prev) => ({ ...prev, [c]: e.target.value }))}
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
