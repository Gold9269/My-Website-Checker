import React from "react";

type OwlwatchLoaderProps = {
  message?: string;
  progress?: number; // 0 - 100 (optional)
};

export default function OwlwatchLoader({
  message = "Scanning nodes & checking heartbeats...",
  progress,
}: OwlwatchLoaderProps) {
  const pct = typeof progress === "number" ? Math.max(0, Math.min(100, progress)) : undefined;

  return (
    <div className="ow-wrapper" role="status" aria-live="polite" aria-label="Loading Owlwatch">
      <div className="ow-scene">
        <div className="ow-stars" aria-hidden />
        {/* <div className="ow-moon" aria-hidden>
          <svg viewBox="0 0 64 64" width="72" height="72" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M41.6 7.7A20.5 20.5 0 1 0 56.8 34 15.3 15.3 0 0 1 41.6 7.7z" fill="rgba(255,255,255,0.07)"/>
            <circle cx="22" cy="18" r="2.2" fill="rgba(255,255,255,0.06)"/>
            <circle cx="28" cy="28" r="1.6" fill="rgba(255,255,255,0.04)"/>
          </svg>
        </div> */}

        <div className="ow-card">
          <div className="ow-owl" aria-hidden>
            {/* Owl body (SVG) */}
            <svg viewBox="0 0 240 240" width="240" height="240" xmlns="http://www.w3.org/2000/svg" className="owl-svg">
              <defs>
                <linearGradient id="owlGrad" x1="0" x2="1">
                  <stop offset="0" stopColor="#223554" />
                  <stop offset="1" stopColor="#0b1220" />
                </linearGradient>
                <linearGradient id="featherGrad" x1="0" x2="1">
                  <stop offset="0" stopColor="#375775" />
                  <stop offset="1" stopColor="#14304a" />
                </linearGradient>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>

              {/* wings */}
              <g className="wing left-wing">
                <ellipse cx="52" cy="120" rx="48" ry="68" fill="url(#featherGrad)" />
              </g>
              <g className="wing right-wing">
                <ellipse cx="188" cy="120" rx="48" ry="68" fill="url(#featherGrad)" />
              </g>

              {/* body */}
              <g className="body">
                <ellipse cx="120" cy="130" rx="70" ry="90" fill="url(#owlGrad)" filter="url(#glow)" />
                <g className="feather-patches">
                  <ellipse cx="120" cy="120" rx="42" ry="56" fill="rgba(255,255,255,0.03)"/>
                  <path d="M90 150c12 10 36 10 48 0" stroke="rgba(255,255,255,0.04)" strokeWidth="4" strokeLinecap="round" />
                </g>
              </g>

              {/* face */}
              <g className="face">
                <ellipse cx="120" cy="78" rx="48" ry="40" fill="rgba(255,255,255,0.02)"/>
                {/* eyes */}
                <g className="eyes">
                  <g className="eye left-eye">
                    <circle cx="100" cy="78" r="18" fill="#fff" />
                    <circle cx="99" cy="78" r="8" className="pupil" fill="#06121e" />
                    <circle cx="94" cy="74" r="3" fill="rgba(255,255,255,0.9)"/>
                  </g>
                  <g className="eye right-eye">
                    <circle cx="140" cy="78" r="18" fill="#fff" />
                    <circle cx="141" cy="78" r="8" className="pupil" fill="#06121e" />
                    <circle cx="146" cy="74" r="3" fill="rgba(255,255,255,0.9)"/>
                  </g>
                </g>

                {/* beak */}
                <path d="M120 100 L112 112 L128 112 Z" fill="#f59e0b" />
                {/* eyebrows / brow glows */}
                <path d="M82 68 q40 -30 76 0" stroke="rgba(255,255,255,0.02)" strokeWidth="6" fill="none" strokeLinecap="round"/>
              </g>

              {/* tiny glow ring */}
              <g className="halo">
                <circle cx="120" cy="78" r="62" stroke="rgba(59,130,246,0.08)" strokeWidth="6" fill="none" />
              </g>
            </svg>
          </div>

          <div className="ow-header">
            <div className="ow-title">
              <span className="ow-owl-emoji" aria-hidden>🦉</span>
              <span className="ow-name">owlwatch</span>
            </div>
            <div className="ow-subtitle">{message}</div>
          </div>

          {/* <div className="ow-progress" aria-hidden>
            <div className="ow-bar">
              <div className="ow-fill" style={{ width: pct !== undefined ? `${pct}%` : "100%" }} />
              <div className="ow-breath" />
            </div>
            <div className="ow-stats">
              {pct !== undefined ? <div className="ow-pct">{pct}%</div> : <div className="ow-loading">Initializing…</div>}
              <div className="ow-hint">Decentralized checks • Node pings • Chain health</div>
            </div>
          </div>

          <div className="ow-footer" aria-hidden>
            <div className="ow-blink" />
            <div className="ow-tag">secure • realtime • decentralized</div>
          </div> */}
        </div>
      </div>

      {/* Styles */}
      <style>{`
        :root{
          --bg1:#030417;
          --bg2:#071228;
          --card:#071425;
          --muted:#94a3b8;
          --accent:#3b82f6;
          --accent-2:#60a5fa;
          --glass: rgba(255,255,255,0.03);
        }

        .ow-wrapper{
          width:100%;
          min-height:100vh;
          display:flex;
          align-items:center;
          justify-content:center;
          background: radial-gradient(1200px 400px at 10% 10%, rgba(59,130,246,0.04), transparent),
                      linear-gradient(180deg, var(--bg1) 0%, var(--bg2) 100%);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
          color: #e6eef8;
          padding: 48px 24px;
        }

        .ow-scene{
          width:100%;
          max-width:980px;
          position:relative;
          display:flex;
          align-items:center;
          justify-content:center;
        }

        .ow-stars{
          position:absolute;
          inset:0;
          background-image:
            radial-gradient(circle at 8% 20%, rgba(255,255,255,0.06) 0px, transparent 2px),
            radial-gradient(circle at 80% 10%, rgba(255,255,255,0.04) 0px, transparent 2px),
            radial-gradient(circle at 50% 70%, rgba(255,255,255,0.02) 0px, transparent 2px);
          background-size: 120px 120px, 180px 180px, 250px 250px;
          opacity:0.9;
          filter: blur(0.6px);
          animation: twinkle 6s linear infinite;
          pointer-events:none;
        }

        @keyframes twinkle {
          0%,100%{opacity:0.85}
          50%{opacity:0.6}
        }

        .ow-moon{
          position:absolute;
          top: -18px;
          left: -18px;
          transform: translateZ(0);
          opacity:0.9;
          filter: drop-shadow(0 6px 18px rgba(0,0,0,0.6));
          animation: moonFloat 6s ease-in-out infinite;
        }

        @keyframes moonFloat {
          0%{ transform: translateY(0) rotate(-6deg) }
          50%{ transform: translateY(6px) rotate(6deg) }
          100%{ transform: translateY(0) rotate(-6deg) }
        }

        .ow-card{
          width:100%;
          background: linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%);
          border-radius:20px;
          padding:28px;
          box-shadow: 0 10px 40px rgba(2,6,23,0.6), inset 0 1px 0 rgba(255,255,255,0.02);
          display:flex;
          flex-direction:column;
          align-items:center;
          gap:12px;
          position:relative;
          z-index:2;
          overflow:hidden;
        }

        .ow-owl{
          width:240px;
          height:240px;
          display:flex;
          align-items:center;
          justify-content:center;
          transform-origin:center;
          animation: hover 4s ease-in-out infinite;
        }

        @keyframes hover {
          0%{ transform: translateY(0) }
          50%{ transform: translateY(-8px) }
          100%{ transform: translateY(0) }
        }

        .owl-svg { display:block; }

        /* wings flap */
        .wing { transform-origin: center; transition: transform 300ms ease; }
        .left-wing { transform-origin: 80px 120px; animation: flapLeft 1.2s ease-in-out infinite; }
        .right-wing { transform-origin: 160px 120px; animation: flapRight 1.2s ease-in-out infinite; }

        @keyframes flapLeft {
          0%{ transform: rotate(-6deg) translateX(0) }
          50%{ transform: rotate(-22deg) translateX(-6px) }
          100%{ transform: rotate(-6deg) translateX(0) }
        }
        @keyframes flapRight {
          0%{ transform: rotate(6deg) translateX(0) }
          50%{ transform: rotate(22deg) translateX(6px) }
          100%{ transform: rotate(6deg) translateX(0) }
        }

        /* pupils & blinking */
        .pupil { transform-origin: center; animation: eyeLook 5s ease-in-out infinite; }
        @keyframes eyeLook {
          0%{ transform: translateX(0) scaleY(1) }
          45%{ transform: translateX(-1px) scaleY(0.98) }
          50%{ transform: translateX(0) scaleY(0.15) } /* blink */
          55%{ transform: translateX(1px) scaleY(1) }
          100%{ transform: translateX(0) scaleY(1) }
        }

        .ow-header{ text-align:center; margin-top:4px; margin-bottom:6px; }
        .ow-title{ display:flex; align-items:center; gap:10px; justify-content:center; font-weight:700; font-size:28px; letter-spacing:0.6px; text-transform:lowercase; }
        .ow-owl-emoji{ font-size:28px; filter: drop-shadow(0 6px 18px rgba(59,130,246,0.12)); transform: translateY(-2px); }
        .ow-name{
          background: linear-gradient(90deg, var(--accent), var(--accent-2));
          -webkit-background-clip: text;
          background-clip:text;
          color: transparent;
          text-shadow: 0 6px 20px rgba(59,130,246,0.06);
          font-family: "Poppins", Inter, sans-serif;
        }

        .ow-subtitle{
          margin-top:6px;
          color: var(--muted);
          font-size:13px;
          max-width:720px;
          text-align:center;
        }

        .ow-progress{
          width:100%;
          margin-top:14px;
          display:flex;
          gap:12px;
          align-items:center;
          justify-content:space-between;
          flex-wrap:wrap;
        }

        .ow-bar{
          position:relative;
          flex:1 1 60%;
          height:14px;
          background: linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));
          border-radius:10px;
          overflow:hidden;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.02);
        }
        .ow-fill{
          height:100%;
          background: linear-gradient(90deg, rgba(59,130,246,0.95), rgba(96,165,250,0.95));
          box-shadow: 0 6px 22px rgba(59,130,246,0.12);
          transition: width 600ms cubic-bezier(.2,.9,.2,1);
        }
        .ow-breath{
          position:absolute;
          top:-30%;
          left: -20%;
          width:40%;
          height:200%;
          background: radial-gradient(circle at 10% 10%, rgba(96,165,250,0.28), transparent 20%);
          filter: blur(12px);
          transform: skewX(-20deg);
          animation: breathe 3.6s ease-in-out infinite;
        }
        @keyframes breathe {
          0%{ left:-30%; opacity:1 }
          50%{ left:60%; opacity:0.15 }
          100%{ left:-30%; opacity:1 }
        }

        .ow-stats{ flex:0 0 34%; display:flex; flex-direction:column; align-items:flex-end; gap:4px; min-width:120px; }
        .ow-pct{ font-weight:700; font-size:16px; color: #e6f0ff; }
        .ow-loading{ color:var(--muted); font-size:13px; }
        .ow-hint{ color:var(--muted); font-size:12px; opacity:0.9; text-align:right; }

        .ow-footer{ width:100%; display:flex; align-items:center; justify-content:space-between; margin-top:14px; gap:10px; }
        .ow-blink{ width:12px; height:12px; border-radius:50%; background: radial-gradient(circle at 30% 30%, #34d399, rgba(52,211,153,0.12)); box-shadow: 0 6px 24px rgba(52,211,153,0.06); filter: blur(0.8px); animation: pulse 2s infinite; }
        @keyframes pulse { 0%{ transform: scale(1); opacity:1 } 50%{ transform: scale(1.6); opacity:0.35 } 100%{ transform: scale(1); opacity:1 } }

        .ow-tag{ color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:1px; opacity:0.9; }

        /* responsive tweaks */
        @media (max-width:720px){
          .ow-card{ padding:18px; border-radius:16px; }
          .ow-owl{ width:180px; height:180px; }
          .ow-title{ font-size:20px; gap:8px; }
          .ow-progress{ flex-direction:column; align-items:stretch; }
          .ow-stats{ align-items:flex-start; text-align:left; }
        }

        /* prefers reduced motion - respect user preference */
        @media (prefers-reduced-motion: reduce){
          .left-wing,.right-wing,.pupil,.ow-owl,.ow-breath,.ow-fill,.ow-moon,.ow-stars{ animation: none !important; transition: none !important; }
        }
      `}</style>
    </div>
  );
}
