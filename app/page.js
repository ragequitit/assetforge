"use client";

import { useState } from "react";
import SinglePanel from "./SinglePanel";
import BatchPanel from "./BatchPanel";
import GalleryPanel from "./GalleryPanel";
import SettingsPanel from "./SettingsPanel";

export default function Page() {
  const [tab, setTab] = useState("single");
  const [includeRarity, setIncludeRarity] = useState(true);

  return (
    <main className="wrap">
      <div className="masthead">
        <span className="planet" aria-hidden="true" />
        <h1>Pet Planet · Asset Generator</h1>
      </div>
      <p className="sub">Internt verktyg — generera, bearbeta och spara spel-assets lokalt.</p>

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

      {tab === "single" && <SinglePanel includeRarity={includeRarity} />}
      {tab === "batch" && <BatchPanel includeRarity={includeRarity} />}
      {tab === "gallery" && <GalleryPanel />}
      {tab === "settings" && <SettingsPanel />}
    </main>
  );
}
