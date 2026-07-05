"use client";

import { useEffect, useRef, useState } from "react";

/* Motion engine — the same math that would run in the game. Given an animation
   name + time, returns how to draw the sprite this frame. */
function motion(name, t, amp) {
  const A = amp;
  switch (name) {
    case "stand":
      return { y: 0, rot: 0, sx: 1, sy: 1 + 0.01 * A * Math.sin(t * 1.6), pivot: "feet" };
    case "idle": {
      const b = Math.sin(t * 2.3);
      return { y: -5 * A * (0.5 + 0.5 * b), rot: 0.015 * A * Math.sin(t * 1.1), sx: 1, sy: 1 + 0.03 * A * b, pivot: "feet" };
    }
    case "walkR":
    case "walkL": {
      const dir = name === "walkR" ? 1 : -1;
      const step = t * 7;
      const bounce = Math.abs(Math.sin(step));
      const travel = (t * 0.42) % 1;
      return { travel, dir, y: -7 * A * bounce, rot: 0.05 * A * Math.sin(step) * dir, sx: dir, sy: 1 + 0.05 * A * bounce, pivot: "feet" };
    }
    case "hover":
      return { x: 16 * A * Math.sin(t * 0.9), y: 10 * A * Math.sin(t * 1.6), rot: 0.04 * A * Math.sin(t * 1.2), sx: 1, sy: 1, pivot: "center" };
    case "jump": {
      const T = 1.35;
      const p = (t % T) / T;
      const jp = Math.min(p / 0.72, 1);
      const inAir = p < 0.72;
      const h = inAir ? 4 * jp * (1 - jp) : 0;
      const anticip = inAir ? 0 : Math.sin(((p - 0.72) / 0.28) * Math.PI) * 0.12;
      return { y: -70 * A * h, rot: 0, sx: 1 - 0.12 * A * (h - anticip), sy: 1 + 0.22 * A * (h - anticip), pivot: "feet" };
    }
  }
  return { y: 0, rot: 0, sx: 1, sy: 1, pivot: "feet" };
}

export default function AnimatePanel() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState(null);
  const [anim, setAnim] = useState("idle");
  const [speed, setSpeed] = useState(1);
  const [amp, setAmp] = useState(1);
  const [ground, setGround] = useState(true);
  const [playing, setPlaying] = useState(true);

  const canvasRef = useRef(null);
  const spriteRef = useRef(null);
  const stRef = useRef({ anim: "idle", speed: 1, amp: 1, ground: true, playing: true, t: 0, last: 0 });

  useEffect(() => {
    stRef.current.speed = speed;
    stRef.current.amp = amp;
    stRef.current.ground = ground;
    stRef.current.playing = playing;
  }, [speed, amp, ground, playing]);

  useEffect(() => {
    stRef.current.anim = anim;
    stRef.current.t = 0;
  }, [anim]);

  useEffect(() => {
    fetch("/api/gallery", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const a = Array.isArray(d.assets) ? d.assets : [];
        setAssets(a);
        if (a.length) pick(a[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function pick(id) {
    setSelId(id);
    const img = new Image();
    img.onload = () => (spriteRef.current = img);
    img.src = `/api/asset?id=${id}`;
  }

  // Render loop — (re)starts once the canvas is actually in the DOM, i.e. after
  // loading finishes and there's at least one asset to show.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    let CW = 600, CH = 360, DPR = 1;

    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      CW = canvas.clientWidth || 600;
      CH = Math.round(CW * 0.6);
      canvas.width = Math.round(CW * DPR);
      canvas.height = Math.round(CH * DPR);
      canvas.style.height = CH + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    const st = stRef.current;
    st.last = performance.now();

    function frame(now) {
      const dt = Math.min((now - st.last) / 1000, 0.05);
      st.last = now;
      if (st.playing) st.t += dt * st.speed;

      ctx.clearRect(0, 0, CW, CH);
      const groundY = CH * 0.85;
      const laneW = CW * 0.7;
      const centerX = CW / 2;
      const sprite = spriteRef.current;

      if (!sprite) {
        raf = requestAnimationFrame(frame);
        return;
      }

      const m = motion(st.anim, st.t, st.amp);
      const target = CH * (m.pivot === "center" ? 0.42 : 0.46);
      const scale = target / sprite.height;
      const dw = sprite.width * scale;
      const dh = sprite.height * scale;

      let px = centerX + (m.x || 0);
      if (m.travel !== undefined) {
        const pos = m.dir > 0 ? m.travel * laneW : laneW - m.travel * laneW;
        px = centerX - laneW / 2 + pos;
      }
      const baseY = m.pivot === "center" ? CH * 0.47 : groundY;
      const py = baseY + (m.y || 0);

      if (st.ground) {
        const lift = Math.max(0, baseY - py) / 90;
        const shW = dw * 0.5 * (1 - Math.min(lift, 0.6));
        ctx.save();
        ctx.globalAlpha = 0.35 * (1 - Math.min(lift, 0.7));
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.ellipse(px, groundY + 6, shW, shW * 0.28, 0, 0, 7);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = "rgba(232,162,74,0.18)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, groundY + 6);
        ctx.lineTo(CW, groundY + 6);
        ctx.stroke();
      }

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(m.rot || 0);
      ctx.scale(m.sx || 1, m.sy || 1);
      if (m.pivot === "center") ctx.drawImage(sprite, -dw / 2, -dh / 2, dw, dh);
      else ctx.drawImage(sprite, -dw / 2, -dh, dw, dh);
      ctx.restore();

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [loading, assets.length]);

  if (loading) {
    return <div className="panel"><p className="placeholder">Laddar…</p></div>;
  }
  if (assets.length === 0) {
    return (
      <div className="panel">
        <p className="placeholder" style={{ padding: "40px 8px" }}>
          Inga bilder i den här loadouten än. Generera några djur först, så kan du animera dem här.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="anim-shell">
        <canvas ref={canvasRef} className="anim-canvas" />
      </div>

      <div className="anim-strip">
        {assets.map((a) => (
          <button
            key={a.id}
            className={`anim-thumb ${selId === a.id ? "sel" : ""}`}
            title={a.filename}
            onClick={() => pick(a.id)}
          >
            <img src={`/api/asset?id=${a.id}`} alt={a.filename} loading="lazy" />
          </button>
        ))}
      </div>

      <div className="grid" style={{ marginTop: 14 }}>
        <section className="panel">
          <div className="field">
            <label htmlFor="anim-sel">Animation</label>
            <select id="anim-sel" value={anim} onChange={(e) => setAnim(e.target.value)}>
              <option value="stand">Stå still</option>
              <option value="idle">Idle (andas/gungar)</option>
              <option value="walkR">Gå höger →</option>
              <option value="walkL">← Gå vänster</option>
              <option value="hover">Sväva (wisp)</option>
              <option value="jump">Hoppa</option>
            </select>
          </div>

          <div className="row">
            <div className="field">
              <label htmlFor="anim-speed">Fart · {speed.toFixed(1)}×</label>
              <input id="anim-speed" type="range" min="0.3" max="2" step="0.05" value={speed} onChange={(e) => setSpeed(+e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="anim-amp">Intensitet · {amp.toFixed(1)}×</label>
              <input id="anim-amp" type="range" min="0.3" max="1.7" step="0.05" value={amp} onChange={(e) => setAmp(+e.target.value)} />
            </div>
          </div>

          <div className="actions" style={{ justifyContent: "space-between" }}>
            <button className="btn-ghost" onClick={() => setPlaying((v) => !v)}>
              {playing ? "⏸ Pausa" : "▶ Spela"}
            </button>
            <label className="toggle" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 14 }}>
              <input type="checkbox" checked={ground} onChange={(e) => setGround(e.target.checked)} /> Mark & skugga
            </label>
          </div>
        </section>

        <section className="panel">
          <label style={{ marginBottom: 8 }}>Så funkar det</label>
          <p className="hint" style={{ marginTop: 0 }}>
            Detta kör på <b>en enda bild</b> — rörelsen görs i kod, inga extra genereringar. Bra för
            djur som går mellan hus, idlar vid ägget och wisps som svävar.
          </p>
          <p className="hint">
            Riktiga gå-cykler (ben som rör sig bild för bild) är nästa spel — den delen kräver en
            annan sorts motor.
          </p>
        </section>
      </div>
    </div>
  );
}
