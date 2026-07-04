"use client";

import { useEffect, useState } from "react";
import SinglePanel from "./SinglePanel";
import BatchPanel from "./BatchPanel";
import GalleryPanel from "./GalleryPanel";
import SettingsPanel from "./SettingsPanel";

export default function Page() {
  const [tab, setTab] = useState("single");
  const [includeRarity, setIncludeRarity] = useState(true);

  // The pending batch list lives here (not inside BatchPanel) so the Single form
  // can add to it and it survives switching tabs.
  const [batchText, setBatchText] = useState("");
  const batchCount = batchText
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#")).length;

  function addLineToBatch(line) {
    setBatchText((prev) => {
      const base = prev.replace(/\s*$/, "");
      return base ? `${base}\n${line}` : line;
    });
  }

  // Loadouts (profiles): each is a self-contained look + its own set of assets.
  const [profiles, setProfiles] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);

  const activeName = profiles.find((p) => p.id === activeId)?.name || "";

  async function loadProfiles() {
    try {
      const res = await fetch("/api/profiles", { cache: "no-store" });
      const d = await res.json();
      setProfiles(d.profiles || []);
      setActiveId(d.activeId || null);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    loadProfiles();
  }, []);

  // Remount the panels so they re-fetch for the newly active loadout.
  const bumpRefresh = () => setRefreshKey((k) => k + 1);

  async function postProfile(body) {
    setBusy(true);
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        alert(d.error || "Något gick fel.");
        return null;
      }
      return d;
    } catch {
      alert("Nätverksfel — försök igen.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function switchProfile(id) {
    if (!id || id === activeId) return;
    const d = await postProfile({ action: "activate", id });
    if (d) {
      setActiveId(d.activeId);
      bumpRefresh();
    }
  }

  async function newProfile() {
    const name = window.prompt(
      "Namn på den nya loadouten (t.ex. namnet på ditt andra spel):"
    );
    if (!name || !name.trim()) return;
    const d = await postProfile({ action: "create", name: name.trim() });
    if (d) {
      await loadProfiles();
      setActiveId(d.activeId);
      bumpRefresh();
      setTab("settings"); // land in Settings so you can set the new look up
    }
  }

  async function renameProfile() {
    if (!activeId) return;
    const name = window.prompt("Nytt namn på loadouten:", activeName);
    if (!name || !name.trim() || name.trim() === activeName) return;
    const d = await postProfile({ action: "rename", id: activeId, name: name.trim() });
    if (d) await loadProfiles();
  }

  async function deleteProfile() {
    if (!activeId) return;
    if (
      !window.confirm(
        `Ta bort loadouten "${activeName}"? Det går bara om den är tom på bilder.`
      )
    )
      return;
    const d = await postProfile({ action: "delete", id: activeId });
    if (d) {
      await loadProfiles();
      setActiveId(d.activeId);
      bumpRefresh();
    }
  }

  return (
    <main className="wrap">
      <div className="masthead">
        <span className="planet" aria-hidden="true" />
        <h1>Pet Planet · Asset Generator</h1>
      </div>
      <p className="sub">Internt verktyg — generera, bearbeta och spara spel-assets lokalt.</p>

      <div className="loadout-bar">
        <span className="loadout-label">Loadout</span>
        <select
          className="loadout-select"
          value={activeId || ""}
          onChange={(e) => switchProfile(e.target.value)}
          disabled={busy || profiles.length === 0}
          aria-label="Välj loadout"
        >
          {profiles.length === 0 && <option value="">Laddar…</option>}
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="btn-ghost small" onClick={newProfile} disabled={busy}>
          + Ny
        </button>
        <button className="btn-ghost small" onClick={renameProfile} disabled={busy || !activeId}>
          Byt namn
        </button>
        <button className="btn-ghost small" onClick={deleteProfile} disabled={busy || !activeId}>
          Ta bort
        </button>
        <span className="loadout-hint">
          Allt du genererar och ser i Gallery hör till vald loadout.
        </span>
      </div>

      <div className="toolbar">
        <div className="tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "single"}
            className={`tab ${tab === "single" ? "active" : ""}`}
            onClick={() => setTab("single")}
          >
            Single
          </button>
          <button
            role="tab"
            aria-selected={tab === "batch"}
            className={`tab ${tab === "batch" ? "active" : ""}`}
            onClick={() => setTab("batch")}
          >
            Batch
          </button>
          <button
            role="tab"
            aria-selected={tab === "gallery"}
            className={`tab ${tab === "gallery" ? "active" : ""}`}
            onClick={() => setTab("gallery")}
          >
            Gallery
          </button>
          <button
            role="tab"
            aria-selected={tab === "settings"}
            className={`tab ${tab === "settings" ? "active" : ""}`}
            onClick={() => setTab("settings")}
          >
            Settings
          </button>
        </div>

        <label className="toggle">
          <input
            type="checkbox"
            checked={includeRarity}
            onChange={(e) => setIncludeRarity(e.target.checked)}
          />
          <span>Rarity i filnamn</span>
        </label>
      </div>

      {tab === "single" && (
        <SinglePanel
          key={refreshKey}
          includeRarity={includeRarity}
          onAddToBatch={addLineToBatch}
          batchCount={batchCount}
          onGoToBatch={() => setTab("batch")}
        />
      )}
      {tab === "batch" && (
        <BatchPanel
          key={refreshKey}
          includeRarity={includeRarity}
          batchText={batchText}
          setBatchText={setBatchText}
        />
      )}
      {tab === "gallery" && <GalleryPanel key={refreshKey} />}
      {tab === "settings" && <SettingsPanel key={refreshKey} activeName={activeName} />}
    </main>
  );
}
