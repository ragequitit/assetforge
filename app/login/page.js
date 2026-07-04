"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Inloggning misslyckades.");
      window.location.href = "/";
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <span className="planet" aria-hidden="true" />
        <h1>Asset Generator</h1>
        <p className="sub" style={{ margin: "0 0 20px" }}>
          Ange lösenord för att fortsätta.
        </p>
        <input
          type="password"
          autoFocus
          placeholder="Lösenord"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn-primary" type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Loggar in…" : "Logga in"}
        </button>
        {error && <div className="status err">{error}</div>}
      </form>
    </main>
  );
}
