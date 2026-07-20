import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

// ============================================================================
// ░░ BLOK 2 — MANTIQ · Dars02 — "Ortiqchasini top" (log-2-01-v1)
// Spets: dars_2.pdf — 20 sahifa. 15 to'plam (rang, shakl, ma'no, o'lcham,
// miqdor, holat bo'yicha). Klassifikatsiya — mantiqning bazaviy amali.
// Maskot: Diqqat tulkichasi (detektiv shlyapa + lupa).
//
// UMUMIY MEXANIKA:
//  TO'G'RI:   yashil ramka → konfetti → "ding-ding!" → yulduzcha hisoblagichga
//             uchadi → +1 ("chiling!") → qisqa pauza → AVTOMATIK keyingi sahifa.
//  NOTO'G'RI: yulduz YO'Q, karta yumshoq silkinadi, past "hmm", qizil rang/X
//             ISHLATILMAYDI, cheklovsiz urinish.
//  OVOZ:      har sahifada bitta avto-ovozli xabar (savol/ko'rsatma).
// ============================================================================

// ============================================================
// KONFIG (LMS props) — Dars01 bilan bir xil naqsh
// ============================================================
let ttsConfig = { ttsApiBase: '', voiceGender: 'f' };
const configureLesson = (cfg) => { ttsConfig = { ...ttsConfig, ...cfg }; };

function buildTtsUrl(base, text, gender) {
  const enc = encodeURIComponent(String(text).slice(0, 1000));
  const g = gender === 'f' ? 'f' : 'm';
  return `${base}/api/tts?text=${enc}&g=${g}`;
}

// ============================================================
// TOVUSH DVIJOKI (WebAudio) — tovush jadvali bo'yicha:
//  ding-ding (to'g'ri) · chiling (hisoblagich) · hmm (xato) · muu (sigir) ·
//  fanfar (motivatsiya) · bayram musiqasi (sertifikat, ~5-6 s)
// ============================================================
let _actx = null;
const getCtx = () => {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  _actx = _actx || new AC();
  if (_actx.state === 'suspended') _actx.resume();
  return _actx;
};

// bitta nota: t0 (s, hozirdan), f (Hz), dur (s), vol, type
const note = (ctx, t0, f, dur, vol = 0.16, type = 'sine') => {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = type; o.frequency.value = f;
  const t = ctx.currentTime + t0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.05);
};

// Yorqin "ding-ding!" — to'g'ri javob
function sfxDingDing() {
  try { const c = getCtx(); if (!c) return;
    note(c, 0,    660, 0.22, 0.17);
    note(c, 0.13, 880, 0.30, 0.17);
  } catch (e) { /* no-op */ }
}
// "Chiling!" qo'ng'iroqcha — yulduz hisoblagichga yetganda
function sfxChiling() {
  try { const c = getCtx(); if (!c) return;
    note(c, 0,    1318, 0.18, 0.13, 'triangle');
    note(c, 0.09, 1760, 0.34, 0.13, 'triangle');
  } catch (e) { /* no-op */ }
}
// Past, mayin "hmm" — noto'g'ri javob (qo'pol emas)
function sfxHmm() {
  try { const c = getCtx(); if (!c) return;
    note(c, 0,    300, 0.22, 0.09);
    note(c, 0.14, 235, 0.30, 0.09);
  } catch (e) { /* no-op */ }
}
// Yumshoq "muu" — 18-sahifa: sigir uyiga qarab yuradi
function sfxMoo() {
  try { const c = getCtx(); if (!c) return;
    note(c, 0,    196, 0.4, 0.1, 'sawtooth');
    note(c, 0.22, 147, 0.6, 0.09, 'sawtooth');
  } catch (e) { /* no-op */ }
}
// Uzunroq quvnoq fanfar — motivatsiya ekranlari
function sfxFanfare() {
  try { const c = getCtx(); if (!c) return;
    const seq = [[0, 523], [0.16, 659], [0.32, 784], [0.5, 1047]];
    seq.forEach(([t, f]) => note(c, t, f, 0.3, 0.15, 'triangle'));
    note(c, 0.72, 1047, 0.7, 0.17, 'triangle');
    note(c, 0.72, 784,  0.7, 0.10, 'sine');
  } catch (e) { /* no-op */ }
}
// Bayramona musiqa (~5-6 soniya) — sertifikat sahifasi
function sfxFestive() {
  try { const c = getCtx(); if (!c) return;
    const mel = [523, 659, 784, 659, 880, 784, 659, 523, 587, 698, 880, 698, 1047, 880, 784, 659, 523, 659, 784, 880, 1047, 1047];
    mel.forEach((f, i) => note(c, 0.2 + i * 0.24, f, 0.26, 0.11, 'triangle'));
    const bass = [262, 196, 220, 262, 196, 220, 262, 262];
    bass.forEach((f, i) => note(c, 0.2 + i * 0.66, f, 0.5, 0.05, 'sine'));
  } catch (e) { /* no-op */ }
}

// ============================================================
// OVOZLI XABAR — Dars01 dvijoki: LMS TTS bo'lsa <audio>, bo'lmasa
// Web Speech (uz -> tr -> ru -> en). Avtoplay bloklansa — jestda qayta.
// ============================================================
const pickVoice = (synth) => {
  const vs = synth.getVoices() || [];
  return (
    vs.find(v => /^uz/i.test(v.lang)) ||
    vs.find(v => /^tr/i.test(v.lang)) ||
    vs.find(v => /^ru/i.test(v.lang)) ||
    vs.find(v => /^en/i.test(v.lang)) ||
    vs[0] || null
  );
};

// Foydalanuvchi jesti ichida DARHOL aytish (sabab tugmalari nomi, sanash,
// maqtov) — autoplay blokidan xoli, navbatdagi ovozni bekor qilib gapiradi.
function speakNow(text) {
  try {
    const base = ttsConfig.ttsApiBase;
    if (base) {
      const a = new Audio(buildTtsUrl(base, text, ttsConfig.voiceGender));
      const p = a.play();
      if (p && p.catch) p.catch(() => { /* no-op */ });
      return;
    }
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(synth);
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'uz-UZ'; }
    u.rate = 0.95; u.pitch = 1.05;
    synth.speak(u);
  } catch (e) { /* no-op */ }
}

// Sahifa ochilganda avto gapiradi (delayMs = null — faqat teginishda).
// Qaytaradi: { replay, stop, isSpeaking, started }
function useVoice(text, delayMs = 120) {
  const speakRef = useRef(null);
  const stopRef = useRef(null);
  const speakingRef = useRef(null);
  const [startedUi, setStartedUi] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !text) return undefined;
    let cancelled = false;
    let audioEl = null;
    let started = false;
    let muted = false;
    let armed = false;
    setStartedUi(false);
    const markStarted = () => { started = true; setStartedUi(true); };

    const speakWS = () => {
      const synth = window.speechSynthesis;
      if (!synth) return;
      let spoken = false;
      const doSpeak = () => {
        if (cancelled || spoken) return;
        spoken = true;
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const v = pickVoice(synth);
        if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'uz-UZ'; }
        u.rate = 0.95; u.pitch = 1.05;
        u.onstart = markStarted;
        setTimeout(() => { try { synth.speak(u); } catch (e) { /* no-op */ } }, 60);
      };
      if ((synth.getVoices() || []).length === 0) {
        const once = () => { synth.removeEventListener('voiceschanged', once); doSpeak(); };
        synth.addEventListener('voiceschanged', once);
        setTimeout(doSpeak, 500);
      } else {
        doSpeak();
      }
    };

    const speak = () => {
      if (cancelled || muted) return;
      const base = ttsConfig.ttsApiBase;
      if (base) {
        try { if (audioEl) audioEl.pause(); } catch (e) { /* no-op */ }
        audioEl = new Audio(buildTtsUrl(base, text, ttsConfig.voiceGender));
        audioEl.onplaying = markStarted;
        const p = audioEl.play();
        if (p && p.catch) p.catch(() => { /* bloklandi — jestda qayta uriniladi */ });
        return;
      }
      speakWS();
    };
    speakRef.current = () => { muted = false; speak(); };
    stopRef.current = () => {
      muted = true;
      try { if (audioEl) audioEl.pause(); } catch (e) { /* no-op */ }
      try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* no-op */ }
    };
    speakingRef.current = () => {
      if (audioEl) return !audioEl.paused && !audioEl.ended;
      try { return !!(window.speechSynthesis && window.speechSynthesis.speaking); } catch (e) { return false; }
    };

    const resume = () => { if (armed && !started && !muted) speak(); };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    let timers = [];
    if (delayMs === null) {
      armed = true;
    } else {
      timers = [0, 1500, 4000].map((off) =>
        setTimeout(() => { armed = true; if (!started && !muted) speak(); }, delayMs + off)
      );
    }

    return () => {
      cancelled = true;
      speakRef.current = null;
      stopRef.current = null;
      speakingRef.current = null;
      timers.forEach(clearTimeout);
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
      try { if (audioEl) audioEl.pause(); } catch (e) { /* no-op */ }
      try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* no-op */ }
    };
  }, [text, delayMs]);

  const replay = useCallback(() => { if (speakRef.current) speakRef.current(); }, []);
  const stop = useCallback(() => { if (stopRef.current) stopRef.current(); }, []);
  const isSpeaking = useCallback(() => (speakingRef.current ? speakingRef.current() : false), []);
  return { replay, stop, isSpeaking, started: startedUi };
}

// Dumaloq karnaycha tugmasi (ikki holatli)
const VoiceButton = ({ muted, onClick, corner = 'tr' }) => (
  <button
    type="button"
    className={`d2-voice-btn ${corner !== 'tr' ? corner : ''} ${muted ? 'off' : ''}`}
    onClick={onClick}
    onPointerDown={(e) => e.stopPropagation()}
    aria-label={muted ? "Ovozni yoqish (boshidan aytadi)" : "Ovozni o'chirish"}
    title={muted ? 'Yoqish' : "O'chirish"}
  >
    {muted ? (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/>
        <line x1="23" y1="9" x2="17" y2="15"/>
        <line x1="17" y1="9" x2="23" y2="15"/>
      </svg>
    ) : (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      </svg>
    )}
  </button>
);

// O'yin sahifalari karnaychasi
const PageVoice = ({ voice, corner = 'bl' }) => {
  const [muted, setMuted] = useState(false);
  const onClick = () => {
    if (voice.isSpeaking()) { voice.stop(); setMuted(true); }
    else { voice.replay(); setMuted(false); }
  };
  return <VoiceButton corner={corner} muted={muted} onClick={onClick}/>;
};

// ============================================================
// MASKOT — Diqqat tulkichasi: do'mboqcha, katta quvnoq ko'zlar,
// boshida DETEKTIV SHLYAPASI, qo'lida katta lupa (muqova spetsi).
// mood: smile | cheer
// ============================================================
const FoxSVG = ({ mood = 'smile', hat = true, className = '' }) => (
  <svg viewBox="0 0 200 218" className={className} aria-hidden="true">
    <g transform="translate(0 8)">
      {/* dum */}
      <path d="M158 158 q34 -6 30 -40 q22 34 -10 56 q-16 10 -28 2 Z" fill="#FF8A50"/>
      <path d="M183 132 q14 20 -8 36 q-8 5 -14 2 q20 -14 16 -34 Z" fill="#FFFFFF" opacity="0.9"/>
      {/* tana */}
      <ellipse cx="100" cy="162" rx="52" ry="42" fill="#FF8A50"/>
      <ellipse cx="100" cy="172" rx="30" ry="26" fill="#FFF4E8"/>
      {/* oyoqchalar */}
      <ellipse cx="72" cy="198" rx="14" ry="9" fill="#E8703A"/>
      <ellipse cx="128" cy="198" rx="14" ry="9" fill="#E8703A"/>
      {/* quloqlar */}
      <path d="M48 44 L62 8 L84 38 Z" fill="#FF8A50"/>
      <path d="M56 38 L63 20 L74 35 Z" fill="#5C4033"/>
      <path d="M152 44 L138 8 L116 38 Z" fill="#FF8A50"/>
      <path d="M144 38 L137 20 L126 35 Z" fill="#5C4033"/>
      {/* bosh */}
      <circle cx="100" cy="78" r="54" fill="#FF8A50"/>
      {/* DETEKTIV SHLYAPA — jigarrang gumbaz + ikki tomonlama soyabon */}
      {hat && (
        <g>
          <path d="M52 52 Q100 -12 148 52 Z" fill="#8A5A3C"/>
          <path d="M60 46 Q100 -2 140 46 Z" fill="#A06B47" opacity="0.55"/>
          <ellipse cx="100" cy="52" rx="58" ry="11" fill="#6E4226"/>
          <path d="M64 34 h72" stroke="#5C3620" strokeWidth="6" strokeLinecap="round" opacity="0.5"/>
        </g>
      )}
      {/* yonoq-tumshuq oq qismi */}
      <path d="M100 132 q-44 0 -46 -36 q14 14 30 10 q10 16 16 16 q6 0 16 -16 q16 4 30 -10 q-2 36 -46 36 Z" fill="#FFF4E8"/>
      {/* ko'zlar — katta, quvnoq */}
      {mood === 'cheer' ? (
        <g stroke="#3D3A50" strokeWidth="5" strokeLinecap="round" fill="none">
          <path d="M68 74 q10 -12 20 0"/>
          <path d="M112 74 q10 -12 20 0"/>
        </g>
      ) : (
        <g>
          <circle cx="78" cy="74" r="12" fill="#3D3A50"/>
          <circle cx="82" cy="70" r="4.4" fill="#FFFFFF"/>
          <circle cx="122" cy="74" r="12" fill="#3D3A50"/>
          <circle cx="126" cy="70" r="4.4" fill="#FFFFFF"/>
        </g>
      )}
      {/* burun + tabassum */}
      <ellipse cx="100" cy="96" rx="7" ry="5.5" fill="#5C4033"/>
      <path d="M86 106 q14 12 28 0" stroke="#5C4033" strokeWidth="4" fill="none" strokeLinecap="round"/>
      {/* yonoq qizillik */}
      <circle cx="60" cy="92" r="8" fill="#FFB48A" opacity="0.85"/>
      <circle cx="140" cy="92" r="8" fill="#FFB48A" opacity="0.85"/>
      {/* LUPA — qo'lida */}
      <g transform="rotate(18 158 120)">
        <circle cx="158" cy="108" r="22" fill="#CDEFFF" stroke="#7A5230" strokeWidth="6"/>
        <circle cx="151" cy="101" r="7" fill="#FFFFFF" opacity="0.75"/>
        <rect x="152" y="128" width="12" height="34" rx="6" fill="#7A5230"/>
      </g>
      <ellipse cx="150" cy="140" rx="11" ry="9" fill="#FF8A50"/>
    </g>
  </svg>
);

// ============================================================
// EMOJI-ART — belgini konteynerga moslab chizadi (SVG matn orqali — o'lcham
// boshqa elementlar bilan bir xil masshtablanadi). Barcha rasm-obyektlar
// (tulkicha maskotidan tashqari) emoji bilan ko'rsatiladi.
// hue: rang tusini burish (masalan, qizil 🎈 ni ko'k sharga aylantirish);
// rot: burish (masalan, ag'darilgan piyola);
// white: belgini to'liq OQ siluetga aylantiradi (oq bulut uslubi) —
// oq fonda ham ko'rinsin uchun yumshoq kulrang kontur-soya beriladi.
// ============================================================
const EmojiArt = ({ ch, hue, rot, white }) => {
  const style = {};
  if (hue) style.filter = `hue-rotate(${hue}deg) saturate(1.15)`;
  if (white) style.filter = 'brightness(0) invert(1) drop-shadow(0 0 2px rgba(148, 163, 184, 0.95)) drop-shadow(0 3px 4px rgba(61, 58, 80, 0.22))';
  if (rot) style.transform = `rotate(${rot}deg)`;
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true"
      style={(hue || rot || white) ? style : undefined}>
      <text x="50" y="56" textAnchor="middle" dominantBaseline="central" fontSize="80">{ch}</text>
    </svg>
  );
};

// Oltin yulduzcha (uchuvchi + hisoblagich + sertifikat) — emoji
const GoldStar = () => <EmojiArt ch="⭐"/>;

// ============================================================
// KONFETTI — to'g'ri javob nuqtasida kichik portlash (12 bo'lakcha)
// ============================================================
const BURST = [
  { a: 10,  d: 46, cl: '#FF5A8A' }, { a: 40,  d: 60, cl: '#FFD34D' },
  { a: 75,  d: 48, cl: '#5AC8FA' }, { a: 110, d: 62, cl: '#43C465' },
  { a: 145, d: 46, cl: '#8E5AE8' }, { a: 180, d: 58, cl: '#FF7043' },
  { a: 215, d: 48, cl: '#FFD34D' }, { a: 250, d: 62, cl: '#FF5A8A' },
  { a: 285, d: 46, cl: '#43C465' }, { a: 320, d: 58, cl: '#5AC8FA' },
  { a: 345, d: 52, cl: '#8E5AE8' }, { a: 60,  d: 40, cl: '#FF7043' },
];
const ConfettiBurst = () => (
  <span className="d2-burst" aria-hidden="true">
    {BURST.map(({ a, d, cl }, i) => {
      const rad = (a * Math.PI) / 180;
      const dx = Math.cos(rad) * d;
      const dy = Math.sin(rad) * d;
      return (
        <i key={i} style={{
          background: cl,
          '--bx': `${dx.toFixed(1)}px`,
          '--by': `${dy.toFixed(1)}px`,
          animationDelay: `${(i % 4) * 0.03}s`,
        }}/>
      );
    })}
  </span>
);

// ============================================================
// YULDUZ PARVOZI API — sahifa to'g'ri javob nuqtasini ildizga uzatadi
// ============================================================
const FlightCtx = React.createContext({ onCorrect: () => {} });
const useFlightApi = () => React.useContext(FlightCtx);

// Fisher-Yates aralashtirish (faqat mount paytida, render'da emas)
const shuffleArr = (a) => {
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
};

// ============================================================
// THEME BG — karta ichidagi tematik fon: gradient + xira EMOJI bezaklar
// ============================================================
const ThemeBg = ({ theme }) => (
  <div className="d2-theme" style={{ background: theme.bg }} aria-hidden="true">
    {theme.decor.map((d, i) => (
      <span key={i} className="d2-theme-ic"
        style={{
          left: `${d.x}%`, top: `${d.y}%`,
          width: `clamp(${Math.round(d.s * 0.6)}px, ${d.s / 7}vw, ${d.s}px)`,
          opacity: d.o,
          transform: `translate(-50%, -50%) rotate(${d.r || 0}deg)`,
        }}>
        <EmojiArt ch={d.ch}/>
      </span>
    ))}
  </div>
);

// ============================================================
// PAGE SHELL — sarlavha + kontent + futer (Orqaga / Keyingi)
// ============================================================
const PageShell = ({ title, children, onBack, onNext, nextOk }) => (
  <div className="d2-page fade-up">
    {title && <h2 className="d2-page-title">{title}</h2>}
    {children}
    <div className="d2-footer">
      <button type="button" className="d2-nav-back" onClick={onBack}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M11 6l-6 6 6 6"/>
        </svg>
        Orqaga
      </button>
      <button type="button" className="d2-nav-next" disabled={!nextOk} onClick={onNext}>
        Keyingi
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6"/>
        </svg>
      </button>
    </div>
  </div>
);

// Yumshoq silkinish hooki (noto'g'ri javobda karta tebranadi)
function useShake() {
  const [shaking, setShaking] = useState(false);
  const t = useRef(null);
  useEffect(() => () => clearTimeout(t.current), []);
  const shake = useCallback(() => {
    sfxHmm();
    setShaking(false);
    clearTimeout(t.current);
    requestAnimationFrame(() => {
      setShaking(true);
      t.current = setTimeout(() => setShaking(false), 500);
    });
  }, []);
  return [shaking, shake];
}

// ============================================================
// O'YIN YADROSI — "Ortiqchasini top" universal komponenti.
// cfg: {
//   voice, theme,
//   items: [{ node, odd?, scale? }]      — qator uchun
//   layout: 'row' (standart) | 'scene'   — scene: items da x/y/w (%) bor
//   backdrop?  — sahna orqasidagi qo'shimcha JSX (masalan, divan)
//   fixedOrder? — items aralashtirilmasin (scene har doim fixed)
//   exitOdd?   — topilgach ortiqcha obyekt "uyiga ketadi" (sigir)
// }
// onSolved() — yulduz hisoblagichga yetib bo'lgach chaqiriladi.
// ============================================================
const OddCore = ({ cfg, onSolved, extra }) => {
  const voice = useVoice(cfg.voice);
  const { onCorrect } = useFlightApi();
  const [items] = useState(() => {
    if (cfg.buildItems) return cfg.buildItems();
    return (cfg.layout === 'scene' || cfg.fixedOrder) ? [...cfg.items] : shuffleArr([...cfg.items]);
  });
  const [okIdx, setOkIdx] = useState(null);
  const [exiting, setExiting] = useState(false);
  const [shaking, shake] = useShake();
  const [shakeIdx, setShakeIdx] = useState(null);
  const timers = useRef([]);
  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const pick = (it, i, el) => {
    if (okIdx !== null) return;
    if (it.odd) {
      voice.stop();
      setOkIdx(i);
      sfxDingDing();
      const r = el.getBoundingClientRect();
      onCorrect({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, true);
      if (cfg.exitOdd) {
        // sigir yumshoq "muu" bilan uyiga qarab yuradi (yulduz yetib borgach)
        later(() => { setExiting(true); sfxMoo(); }, 1550);
        later(onSolved, 3100);
      } else {
        later(onSolved, 1700);
      }
    } else {
      shake();
      setShakeIdx(null);
      requestAnimationFrame(() => {
        setShakeIdx(i);
        later(() => setShakeIdx(null), 500);
      });
    }
  };

  return (
    <div className={`d2-card themed ${shaking ? 'd2-shake' : ''}`}>
      <ThemeBg theme={cfg.theme}/>
      {extra}
      {cfg.backdrop}
      {cfg.layout === 'scene' ? (
        <div className="d2-scene">
          {items.map((it, i) => (
            <button key={i} type="button"
              className={`d2-scene-item ${okIdx === i ? 'ok' : ''} ${shakeIdx === i ? 'd2-shake' : ''} ${exiting && it.odd ? 'd2-exit' : ''}`}
              style={{ left: `${it.x}%`, top: `${it.y}%`, width: `${it.w}%` }}
              onClick={(e) => pick(it, i, e.currentTarget)}
              aria-label={it.label || 'obyekt'}>
              {it.node}
              {okIdx === i && <ConfettiBurst/>}
            </button>
          ))}
        </div>
      ) : (
        <div className="d2-odd-row">
          {items.map((it, i) => (
            <button key={i} type="button"
              className={`d2-odd-item ${okIdx === i ? 'ok' : ''} ${shakeIdx === i ? 'd2-shake' : ''}`}
              onClick={(e) => pick(it, i, e.currentTarget)}
              aria-label={it.label || 'obyekt'}>
              <span className="d2-odd-icon" style={{ width: `${Math.round((it.scale || 1) * 62)}%` }}>
                {it.node}
              </span>
              {okIdx === i && <ConfettiBurst/>}
            </button>
          ))}
        </div>
      )}
      <PageVoice voice={voice}/>
    </div>
  );
};

// Bitta raundli "Ortiqchasini top" sahifasi: yadro + qobiq.
// Topilgach: yulduz va AVTOMATIK keyingi sahifa.
const OddGamePage = ({ cfg, onBack, onNext }) => {
  const [done, setDone] = useState(false);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const solved = () => {
    setDone(true);
    timers.current.push(setTimeout(onNext, 600));
  };

  return (
    <PageShell onBack={onBack} onNext={onNext} nextOk={done}>
      <OddCore cfg={cfg} onSolved={solved}/>
    </PageShell>
  );
};

// ============================================================
// SAHIFALARGA XOS INTERAKTIV SAN'AT
// ============================================================
// Ochiq quti + ichida sanash mumkin bo'lgan EMOJI nuqtalar (12-sahifa).
// Har nuqta bosilganda yoritiladi (🔵 -> 🟠) va ovoz sanaydi:
// "bir... ikki... uch..."
const NUM_WORDS = ['Bir', 'Ikki', 'Uch', "To'rt", 'Besh'];
const DOT_POS = {
  3: [[50, 40], [34, 70], [66, 70]],
  5: [[33, 34], [67, 34], [50, 53], [33, 73], [67, 73]],
};
const EmojiDotBox = ({ n }) => {
  const [lit, setLit] = useState(() => new Set());
  const tap = (i) => (e) => {
    e.stopPropagation();
    setLit((prev) => {
      if (prev.has(i)) return prev;
      const next = new Set(prev); next.add(i);
      speakNow(NUM_WORDS[next.size - 1]);
      return next;
    });
  };
  return (
    <span className="d2-dotbox" aria-label={`${n} ta nuqtali quti`}>
      {DOT_POS[n].map(([x, y], i) => (
        <button key={i} type="button" className="d2-dotbox-dot"
          style={{ left: `${x}%`, top: `${y}%` }}
          onClick={tap(i)} aria-label={`nuqta ${i + 1}`}>
          {lit.has(i) ? '🟠' : '🔵'}
        </button>
      ))}
    </span>
  );
};

// ============================================================
// O'YIN SAHIFALARI KONFIGURATSIYALARI (dars_2.pdf tartibida)
// ============================================================
// Barcha o'yin sahifalari uchun YAGONA orqa fon — tinch och ko'k-kulrang
// yumshoq gradient (5-sahifadagi bilan bir xil); oq katakcha/doirachalar
// undan aniq ajralib turadi. Tematik emoji bezaklar har sahifada o'ziniki.
const GAME_BG = 'linear-gradient(180deg, #E4ECF9 0%, #DDE6F5 55%, #D3DFF2 100%)';
// SAHIFA 2 — Guruh A-1: Sharlar (RANG). Bayram manzarasi: bayroqchalar, konfetti.
const CFG_BALLOONS = {
  voice: "Qarang — sharlar! Uchtasi bir xil rangda. Lekin bittasi boshqa rangda. Qaysi biri ekan? Uni topgan bolsanig ustiga bosing!",
  items: [
    { node: <EmojiArt ch="🎈"/>, label: 'qizil shar' },
    { node: <EmojiArt ch="🎈"/>, label: 'qizil shar' },
    { node: <EmojiArt ch="🎈" hue={200}/>, label: "ko'k shar", odd: true },
    { node: <EmojiArt ch="🎈"/>, label: 'qizil shar' },
  ],
  theme: {
    bg: GAME_BG,
    decor: [
      { ch: '🪁', x: 7,  y: 12, s: 52, o: 0.4, r: -12 },
      { ch: '⭐', x: 28, y: 6,  s: 28, o: 0.42 },
      { ch: '🎁', x: 50, y: 8,  s: 34, o: 0.36 },
      { ch: '⭐', x: 72, y: 6,  s: 26, o: 0.4 },
      { ch: '🪁', x: 93, y: 12, s: 48, o: 0.4, r: 14 },
      { ch: '🟡', x: 12, y: 92, s: 18, o: 0.5 },
      { ch: '🔵', x: 32, y: 96, s: 15, o: 0.45 },
      { ch: '🔴', x: 55, y: 93, s: 17, o: 0.5 },
      { ch: '🟢', x: 74, y: 96, s: 14, o: 0.45 },
      { ch: '🟣', x: 92, y: 92, s: 18, o: 0.5 },
    ],
  },
};
// SAHIFA 3 — Guruh B-1: Bulutlar (SHAKL). Ko'k osmon, qushchalar, quyoshcha.
const CFG_CLOUDS = {
  voice:"Osmonga qarang! Bulutchalar suzib yuribdi. Uchtasi yumshoq va yumaloq. Lekin bittasi — o'tkir uchli. Qaysi biri ekan?",
  items: [
    { node: <EmojiArt ch="☁️" />, label: "yumaloq bulut" },
    { node: <EmojiArt ch="☁️" />, label: "yumaloq bulut" },
    { node: <EmojiArt ch="⭐" white />, label: "yulduz shaklidagi bulut", odd: true },
    { node: <EmojiArt ch="☁️" />, label: "yumaloq bulut" },
  ],
  theme: {
    bg: GAME_BG,
    decor: [
      { ch: "☀️", x: 91, y: 10, s: 64, o: 0.55 },
      { ch: "🐦", x: 10, y: 88, s: 30, o: 0.5 },
      { ch: "🐦", x: 24, y: 94, s: 24, o: 0.45 },
      { ch: "🐦", x: 68, y: 92, s: 26, o: 0.48 },
      { ch: "🐦", x: 86, y: 88, s: 22, o: 0.42 },
    ],
  },
};
// SAHIFA 4 — Guruh C-1: Meva va sabzavot (MA'NO). Yog'och stol, oshxona.
const CFG_FRUITS = {
  voice: "Endi diqqat! Bu yerda uchta meva bor. Lekin bittasi meva emas. Qaysi biri ekan? Uni toping!",
  items: [
    { node: <EmojiArt ch="🍎" />, label: "olma" },
    { node: <EmojiArt ch="🍌" />, label: "banan" },
    { node: <EmojiArt ch="🍇" />, label: "uzum" },
    { node: <EmojiArt ch="🥕" />, label: "sabzi", odd: true },
  ],
  theme: {
    bg: GAME_BG,
    decor: [
      { ch: "🌿", x: 7, y: 12, s: 44, o: 0.4 },
      { ch: "☕", x: 30, y: 8, s: 36, o: 0.4 },
      { ch: "🫖", x: 70, y: 8, s: 44, o: 0.38 },
      { ch: "🌸", x: 93, y: 13, s: 40, o: 0.4 },
      { ch: "🟤", x: 12, y: 93, s: 14, o: 0.3 },
      { ch: "🟤", x: 50, y: 95, s: 12, o: 0.3 },
      { ch: "🟤", x: 88, y: 93, s: 14, o: 0.3 },
    ],
  },
};
// ============================================================
// SAHIFA 5 — "O'XSHASH JUFTLIKNI TOP" (hasharotlar).
// Fon: tinch och ko'k-kulrang yumshoq gradient, bezak yo'q.
// 6 ta oq yumaloq-kvadrat katakcha (ekranga qarab 112–172px),
// 2 qatorda 3 tadan; markazda katta emoji (64–106px).
// Tarkib: 🦋 🦋 🐛 🐝 🐞 🐌 — ikkita kapalak bir xil (juftlik),
// qolgan 4 hasharot bir-biridan farq qiladi. Juftlik hech qachon
// yonma-yon turmaydi (har kirganda aralashadi).
// Mexanika: bola bitta katakni bosadi (ko'k belgilanadi), keyin
// o'xshashini topadi: to'g'ri -> ikkalasi yashil ramka + konfetti +
// yulduz + avto-o'tish; noto'g'ri -> yumshoq silkinish + "hmm",
// belgilash bekor bo'ladi, cheklovsiz urinish.
// ============================================================
const PAIR_VOICE = "Bu — yangi o'yin! Bu yerda hasharotlar bor. Ikkitasi bir xil. Ularni topib, ikkalasini ham bosing!";
const PAIR_EMOJI = ['🦋', '🦋', '🐛', '🐝', '🐞', '🐌'];
// 2×3 katakda ikki o'rin yonma-yonmi? (gorizontal yoki vertikal qo'shni)
const pairAdjacent = (a, b) => {
  const r1 = Math.floor(a / 3); const c1 = a % 3;
  const r2 = Math.floor(b / 3); const c2 = b % 3;
  return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
};
// juftlik (ikki 🦋) yonma-yon tushmaguncha aralashtiramiz
const buildPairGrid = () => {
  let grid;
  do {
    grid = shuffleArr([...PAIR_EMOJI]);
  } while (pairAdjacent(grid.indexOf('🦋'), grid.lastIndexOf('🦋')));
  return grid;
};

const PairMatchPage = ({ onBack, onNext }) => {
  const voice = useVoice(PAIR_VOICE);
  const { onCorrect } = useFlightApi();
  const [grid] = useState(buildPairGrid);
  const [sel, setSel] = useState(null);        // birinchi belgilangan katak
  const [badPair, setBadPair] = useState([]);  // noto'g'ri juftlik (silkinadi)
  const [solved, setSolved] = useState(false);
  const [shaking, shake] = useShake();
  const timers = useRef([]);
  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const pick = (i, el) => {
    if (solved) return;
    if (sel === null) { setSel(i); return; }
    if (sel === i) { setSel(null); return; }        // qayta bosilsa — bekor
    if (grid[sel] === grid[i]) {
      voice.stop();
      setSel(null);
      setSolved(true);
      sfxDingDing();
      const r = el.getBoundingClientRect();
      onCorrect({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, true);
      later(onNext, 1900);
    } else {
      const first = sel;
      setSel(null);
      shake();
      setBadPair([]);
      requestAnimationFrame(() => {
        setBadPair([first, i]);
        later(() => setBadPair([]), 500);
      });
    }
  };

  return (
    <PageShell onBack={onBack} onNext={onNext} nextOk={solved}>
      <div className={`d2-card d2-pair-card ${shaking ? 'd2-shake' : ''}`}>
        <div className="d2-pair-grid">
          {grid.map((ch, i) => {
            const ok = solved && ch === '🦋';
            return (
              <button key={i} type="button"
                className={`d2-pair-cell ${sel === i ? 'sel' : ''} ${ok ? 'ok' : ''} ${badPair.includes(i) ? 'd2-shake' : ''}`}
                onClick={(e) => pick(i, e.currentTarget)}
                aria-label={ch}>
                <span className="d2-pair-emoji">{ch}</span>
                {ok && <ConfettiBurst/>}
              </button>
            );
          })}
        </div>
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

// ============================================================
// SAHIFA 6 — "YODLAB TOP" (flip-xotira o'yini).
// HAR KIRGANDA ALMASHADI: 4 ta to'plamdan biri tasodifiy tanlanadi
// (transportlar / mevalar / hayvonlar / o'yinchoqlar juftligi) va
// 5 katakchaning joylashuvi ham har safar aralashadi.
// 1-BOSQICH (3 soniya) — "Yodlang 👀": 5 ta obyekt bir qatorda ochiq
//   ko'rinadi (masalan: 🚗 🍎 🐶 🍌 🚌). Ovoz vazifani aytadi; pastda
//   3 ta nuqta-taymer sekin so'nadi (har soniyada bittasi).
// 2-BOSQICH (0.4s) — barcha katakchalar "ag'darilib" ❓ ga aylanadi
//   (3D flip animatsiya, ketma-ket 80ms farq bilan).
// 3-BOSQICH — "Toping: [juftlik]" (IKKITA obyekt). Yuqorida 2 ta bo'sh
//   doiracha — hisob. Bola katakchani bosadi -> u ochiladi:
//   to'g'ri -> ochiq qoladi + yashil ramka + ⭐ + "ding-ding!";
//   noto'g'ri -> 1 soniya ochiq turadi (bola ko'rib qoladi), keyin
//   yana yopiladi + "hmm", cheklovsiz qayta urinish.
// ============================================================
// to'plamlar: 2 ta izlanadigan juftlik + 3 ta chalg'ituvchi + ovozdagi nomi
const MEMFLIP_SETS = [
  { targets: ['🚗', '🚌'], extras: ['🍎', '🐶', '🍌'], say: 'mashina va avtobus' },
  { targets: ['🍎', '🍌'], extras: ['🚗', '🐱', '⚽'], say: 'olma va banan' },
  { targets: ['🐶', '🐱'], extras: ['🍌', '🚌', '⭐'], say: 'kuchukcha va mushukcha' },
  { targets: ['⚽', '🎈'], extras: ['🍎', '🐶', '🚗'], say: "koptok va shar" },
];
const buildMemRound = () => {
  const set = MEMFLIP_SETS[Math.floor(Math.random() * MEMFLIP_SETS.length)];
  return { set, items: shuffleArr([...set.targets, ...set.extras]) };
};

const MemoryFlipPage = ({ onBack, onNext }) => {
  // har kirganda: tasodifiy to'plam + aralashgan joylashuv
  const [{ set, items }] = useState(buildMemRound);
  const voice = useVoice(
    "Bu narsalarga diqqat bilan qarang va yodlab oling... uch... ikki... bir! " +
    `Endi hammasi berkinib oldi. Ayting-chi, ${set.say} qaysi kataklarda edi? ` +
    "Ikkalasini ham topib bering!"
  );
  const { onCorrect } = useFlightApi();
  const [phase, setPhase] = useState('show');                       // show -> quiz
  const [dots, setDots] = useState(3);                              // taymer nuqtalari
  const [covered, setCovered] = useState(() => items.map(() => false));
  const [found, setFound] = useState(() => new Set());              // topilgan kataklar
  const [peek, setPeek] = useState(null);                           // xato ochilgan katak
  const [shaking, shake] = useShake();
  const timers = useRef([]);
  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const setCov = (i, v) => setCovered((c) => { const n = [...c]; n[i] = v; return n; });

  // 3 soniya yodlash -> nuqtalar so'nadi -> kataklar ketma-ket yopiladi
  useEffect(() => {
    later(() => setDots(2), 1000);
    later(() => setDots(1), 2000);
    later(() => {
      setDots(0);
      items.forEach((_, i) => later(() => setCov(i, true), i * 80));
      later(() => setPhase('quiz'), items.length * 80 + 400);
    }, 3000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allDone = found.size === set.targets.length;

  const pick = (i, el) => {
    if (phase !== 'quiz' || found.has(i) || peek !== null || allDone) return;
    if (set.targets.includes(items[i])) {
      voice.stop();
      const next = new Set(found); next.add(i);
      setFound(next);
      setCov(i, false);
      sfxDingDing();
      const r = el.getBoundingClientRect();
      onCorrect({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, next.size === set.targets.length);
      if (next.size === set.targets.length) later(onNext, 2100);
    } else {
      // xato: katak 1 soniya ochiq qoladi — bola ichini ko'rib qoladi
      setCov(i, false);
      setPeek(i);
      shake();
      later(() => { setCov(i, true); setPeek(null); }, 1000);
    }
  };

  return (
    <PageShell onBack={onBack} onNext={onNext} nextOk={allDone}>
      <div className={`d2-card d2-mem-card ${shaking ? 'd2-shake' : ''}`}>
        {/* sarlavha: yodlash yoki qidiruv vazifasi */}
        <div className="d2-mem-title" aria-live="polite">
          {phase === 'show'
            ? <>Eslab qoling <span aria-hidden="true">👀</span></>
            : <>Toping: {set.targets.map((t) => (
                <span key={t} className="d2-mem-target">{t}</span>
              ))} <span aria-hidden="true">🔍</span></>}
        </div>
        {/* quiz: hisob doirachalari */}
        {phase === 'quiz' && (
          <div className="d2-mini-dots" aria-label={`${found.size} / ${set.targets.length} topildi`}>
            {set.targets.map((_, i) => (
              <span key={i} className={`d2-mini-dot ${i < found.size ? 'on' : ''}`}>
                {i < found.size ? '✓' : ''}
              </span>
            ))}
          </div>
        )}
        {/* 5 katakcha bir qatorda */}
        <div className="d2-mem-row">
          {items.map((ch, i) => (
            <button key={i} type="button"
              className={`d2-mem-cell ${covered[i] ? 'cov' : ''} ${found.has(i) ? 'ok' : ''}`}
              onClick={(e) => pick(i, e.currentTarget)}
              disabled={phase !== 'quiz' || found.has(i)}
              aria-label={covered[i] ? 'yopiq katak' : ch}>
              <span className="d2-mem-inner">
                <span className="d2-mem-face front">{ch}</span>
                <span className="d2-mem-face back">❓</span>
              </span>
              {found.has(i) && <ConfettiBurst/>}
            </button>
          ))}
        </div>
        {/* yodlash taymeri: 3 ta nuqta pastda sekin so'nadi */}
        {phase === 'show' && (
          <div className="d2-mem-dots" aria-label={`${dots} soniya qoldi`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={`d2-mem-dot ${i < dots ? 'on' : ''}`}/>
            ))}
          </div>
        )}
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};
// SAHIFA 7 — Guruh E-1: Quyonchalar (HARAKAT). Bittasi havoda sakrab turibdi.
const CFG_BUNNIES = {
  voice: "O'tloqda quyonchalar o'ynayapti. Ularning uchtasi bir xil ish qilyapti, bittasi esa boshqacha. Qaysi biri ekan?",
  items: [
    { node: <EmojiArt ch="🐰"/>, label: "o'tirgan quyoncha" },
    { node: <EmojiArt ch="🐰"/>, label: "o'tirgan quyoncha" },
    { node: <EmojiArt ch="🐇"/>, label: 'sakrayotgan quyoncha', odd: true },
    { node: <EmojiArt ch="🐰"/>, label: "o'tirgan quyoncha" },
  ],
  theme: {
    bg: GAME_BG,
    decor: [
      { ch: '☁️', x: 12, y: 10, s: 62, o: 0.8 },
      { ch: '☀️', x: 90, y: 9,  s: 58, o: 0.5 },
      { ch: '☁️', x: 55, y: 7,  s: 46, o: 0.6 },
      { ch: '🌳', x: 5,  y: 74, s: 76, o: 0.35 },
      { ch: '🌳', x: 95, y: 70, s: 66, o: 0.32 },
      { ch: '🌸', x: 20, y: 94, s: 30, o: 0.5 },
      { ch: '🌼', x: 50, y: 96, s: 26, o: 0.45 },
      { ch: '🌺', x: 80, y: 94, s: 28, o: 0.5 },
    ],
  },
};
// SAHIFA 8 — Guruh A-2: Gullar (RANG). Uchta qizil qizg'aldoq + bitta sariq.
const CFG_FLOWERS = {
  voice: "Bog'da chiroyli gullar o'sibdi. Ularning orasida bittasi boshqalariga o'xshamaydi. Uni topib bera olasizmi?",
  items: [
    { node: <EmojiArt ch="🌹"/>, label: 'qizil gul' },
    { node: <EmojiArt ch="🌹"/>, label: 'qizil gul' },
    { node: <EmojiArt ch="🌹"/>, label: 'qizil gul' },
    { node: <EmojiArt ch="🌹" hue={60}/>, label: 'sariq gul', odd: true },
  ],
  theme: {
    bg: GAME_BG,
    decor: [
      { ch: '☀️', x: 8,  y: 10, s: 58, o: 0.5 },
      { ch: '🦋', x: 50, y: 7,  s: 36, o: 0.5, r: -10 },
      { ch: '🌳', x: 93, y: 14, s: 66, o: 0.32 },
      { ch: '🍄', x: 10, y: 94, s: 28, o: 0.4 },
      { ch: '🌸', x: 90, y: 94, s: 30, o: 0.45 },
    ],
  },
};
// SAHIFA 9 — Guruh C-2: Uchadigan va suzadigan (MA'NO). Ekran ikkiga bo'lingan:
// tepada osmon (qushcha, ari, kapalak), pastda suv (baliq). Joylashuvning o'zi
// ma'noviy farqni ko'rsatib turadi.
const CFG_FLYSWIM = {
  layout: 'scene',
  voice: "Bu yerda to'rtta jonivor bor. Ularning uchtasi bir xil ish qila oladi, bittasi esa yo'q. Diqqat bilan qarang va ortiqchasini topib bering.",
  items: [
    { node: <EmojiArt ch="🐦"/>, label: 'qushcha', x: 20, y: 24, w: 17 },
    { node: <EmojiArt ch="🐝"/>, label: 'ari', x: 50, y: 16, w: 15 },
    { node: <EmojiArt ch="🦋"/>, label: 'kapalak', x: 78, y: 26, w: 16 },
    { node: <EmojiArt ch="🐠"/>, label: 'baliq', x: 48, y: 74, w: 17, odd: true },
  ],
  theme: {
    bg: GAME_BG,
    decor: [
      { ch: '☁️', x: 10, y: 10, s: 58, o: 0.85 },
      { ch: '☁️', x: 88, y: 8,  s: 48, o: 0.75 },
      { ch: '☀️', x: 64, y: 6,  s: 40, o: 0.5 },
      { ch: '🫧', x: 22, y: 66, s: 10, o: 0.5 },
      { ch: '🫧', x: 27, y: 74, s: 7,  o: 0.45 },
      { ch: '🫧', x: 74, y: 68, s: 9,  o: 0.5 },
      { ch: '🫧', x: 79, y: 78, s: 6,  o: 0.45 },
      { ch: '🐟', x: 12, y: 90, s: 34, o: 0.35 },
      { ch: '🐟', x: 88, y: 92, s: 30, o: 0.32 },
    ],
  },
};
// ============================================================
// SAHIFA 10 — "ANALOGIYA": kim bizga nima beradi?
// Fon: yagona o'yin foni, bezak yo'q.
// TUZILISH (yuqoridan pastga):
//  1-qator (namuna, tayyor):  [🐝] → [🍯]
//    chap katakcha oq; o'q kulrang; o'ng katakcha OCH YASHIL fonda,
//    yashil 2px ramka, o'ng yuqori burchakda kichik ✅.
//  2-qator (savol):  [🐮] → [ ? ]
//    o'ng katakcha shaffof, ko'k PUNKTIR 2px ramka, markazda katta "?".
//  3-qator (variantlar): 🚜 🏠 🌿 🥛 — 4 ta oq katakcha yonma-yon.
// To'g'ri javob: 🥛 (sut). Chalg'ituvchilar sigirga bog'liq, lekin
// "beradi" emas: traktor (ferma), uy (yashaydi), o't (yeydi).
// To'g'ri tanlansa "?" katakchaga 🥛 joylashib, namunadagidek
// yashil bo'ladi + konfetti + yulduz + avto-o'tish.
// ============================================================
const ANALOGY_VOICE = "Qarang — ari bizga asal beradi. Endi o'ylab ko'ring: sigir bizga nima beradi? To'g'ri javobni pastdan tanlab bering.";
const ANALOGY_OPTIONS = [
  { ch: '🚜', label: 'traktor' },
  { ch: '🏠', label: 'uy' },
  { ch: '🌿', label: "o't" },
  { ch: '🥛', label: 'sut', ok: true },
];

const AnalogyPage = ({ onBack, onNext }) => {
  const voice = useVoice(ANALOGY_VOICE);
  const { onCorrect } = useFlightApi();
  const [opts] = useState(() => shuffleArr([...ANALOGY_OPTIONS]));
  const [solved, setSolved] = useState(false);
  const [shaking, shake] = useShake();
  const [shakeIdx, setShakeIdx] = useState(null);
  const timers = useRef([]);
  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const pick = (opt, i, el) => {
    if (solved) return;
    if (opt.ok) {
      voice.stop();
      setSolved(true);
      sfxDingDing();
      const r = el.getBoundingClientRect();
      onCorrect({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, true);
      later(onNext, 1900);
    } else {
      shake();
      setShakeIdx(null);
      requestAnimationFrame(() => {
        setShakeIdx(i);
        later(() => setShakeIdx(null), 500);
      });
    }
  };

  return (
    <PageShell onBack={onBack} onNext={onNext} nextOk={solved}>
      <div className={`d2-card d2-ana-card ${shaking ? 'd2-shake' : ''}`}>
        {/* 1-qator: tayyor namuna — ari asal beradi */}
        <div className="d2-ana-row">
          <span className="d2-ana-cell"><span className="d2-ana-emoji">🐝</span></span>
          <span className="d2-ana-arrow" aria-hidden="true">→</span>
          <span className="d2-ana-cell sample">
            <span className="d2-ana-emoji">🍯</span>
            <span className="d2-ana-check" aria-hidden="true">✅</span>
          </span>
        </div>
        {/* 2-qator: savol — sigir nima beradi? */}
        <div className="d2-ana-row">
          <span className="d2-ana-cell"><span className="d2-ana-emoji">🐮</span></span>
          <span className="d2-ana-arrow" aria-hidden="true">→</span>
          <span className={`d2-ana-cell ${solved ? 'sample' : 'quest'}`}>
            {solved ? (
              <span className="d2-ana-emoji fade-up">🥛</span>
            ) : (
              <span className="d2-ana-q" aria-label="nima?">?</span>
            )}
            {solved && <span className="d2-ana-check" aria-hidden="true">✅</span>}
            {solved && <ConfettiBurst/>}
          </span>
        </div>
        {/* 3-qator: variantlar */}
        <div className="d2-ana-opts">
          {opts.map((opt, i) => (
            <button key={opt.ch} type="button"
              className={`d2-ana-opt ${solved && opt.ok ? 'ok' : ''} ${shakeIdx === i ? 'd2-shake' : ''}`}
              disabled={solved}
              onClick={(e) => pick(opt, i, e.currentTarget)}
              aria-label={opt.label}>
              <span className="d2-ana-emoji">{opt.ch}</span>
            </button>
          ))}
        </div>
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};
// SAHIFA 12 — Guruh D-2: Qutilardagi nuqtalar (MIQDOR). 3 ta qutida 3 tadan,
// bittasida 5 ta. Nuqtalarni bosib sanash mumkin — ovoz sanaydi.
const CFG_DOTS = {
  voice: "Qutilar ichidagi nuqtalarni birga sanab ko'raylik. Qaysi qutida nuqtalar soni boshqalardan farq qiladi?",
  items: [
    { node: <EmojiDotBox n={3}/>, label: '3 nuqtali quti' },
    { node: <EmojiDotBox n={3}/>, label: '3 nuqtali quti' },
    { node: <EmojiDotBox n={5}/>, label: '5 nuqtali quti', odd: true },
    { node: <EmojiDotBox n={3}/>, label: '3 nuqtali quti' },
  ],
  theme: {
    bg: GAME_BG,
    decor: [
      { ch: '⭐', x: 8,  y: 12, s: 26, o: 0.4 },
      { ch: '🟢', x: 50, y: 8,  s: 20, o: 0.35 },
      { ch: '⭐', x: 92, y: 12, s: 24, o: 0.4 },
    ],
  },
};
// ============================================================
// SAHIFA 13 — "GURUHNI TO'LDIR" (TESKARI klassifikatsiya).
// Nima uchun yangi: ortiqchani topish emas — YETISHMAYOTGANINI qo'shish.
// Bola guruhning qoidasini tushunib, unga mos obyektni tanlaydi.
// YUQORI QATOR — 4 katakcha: 3 ta bir turkumdagi obyekt oq kataklarda +
//   4-chisi ko'k PUNKTIR ramkali bo'sh joy, markazda katta "?".
// PAST QATOR — 4 variant: bittasi guruh turkumidan (to'g'ri), qolgan
//   uchtasi har biri BOSHQA turkumdan (chalg'ituvchi).
// To'g'ri -> variant "?" o'rniga UCHIB BORADI, yashil ramka, ⭐,
//   avto-o'tish. Noto'g'ri -> variant silkinadi, joyida qoladi, "hmm".
// HAR KIRGANDA ALMASHADI: 4 turkumdan biri guruh bo'ladi, guruh a'zolari,
// to'g'ri javob va chalg'ituvchilar ham zaxiradan tasodifiy tanlanadi.
// ============================================================
const FILL_CATS = [
  { name: 'mevalar', one: 'meva', pool: ['🍎', '🍌', '🍇', '🍓', '🍊', '🍉'] },
  { name: 'hayvonlar', one: 'hayvon', pool: ['🐶', '🐱', '🐰', '🐟', '🐦', '🐭'] },
  { name: 'transportlar', one: 'transport', pool: ['🚗', '🚌', '✈️', '🚲', '🚕'] },
  { name: 'kiyimlar', one: 'kiyim', pool: ['👕', '🧢', '🧣', '🧤', '👟'] },
];
const buildFillRound = () => {
  const cats = shuffleArr([...FILL_CATS]);
  const target = cats[0];
  const pool = shuffleArr([...target.pool]);
  const group = pool.slice(0, 3);          // yuqoridagi 3 ta a'zo
  const answer = pool[3];                  // to'g'ri javob — shu turkumdan
  const options = shuffleArr([
    answer,
    ...cats.slice(1).map((c) => c.pool[Math.floor(Math.random() * c.pool.length)]),
  ]);
  return { target, group, answer, options };
};

const FillGroupPage = ({ onBack, onNext }) => {
  const [{ target, group, answer, options }] = useState(buildFillRound);
  const voice = useVoice(
    `Qarang — bu yerda ${target.name} bor. Lekin bittasi yetishmayapti! ` +
    `Pastdan ${target.one} topib, bo'sh joyga qo'ying!`
  );
  const { onCorrect } = useFlightApi();
  const [solved, setSolved] = useState(false);
  const [flown, setFlown] = useState(false);   // javob uchib bo'ldi — katak to'ldi
  const [flyer, setFlyer] = useState(null);    // { x, y, tx, ty, go }
  const [shaking, shake] = useShake();
  const [shakeIdx, setShakeIdx] = useState(null);
  const questRef = useRef(null);
  const timers = useRef([]);
  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const pick = (ch, i, el) => {
    if (solved) return;
    if (ch === answer) {
      voice.stop();
      setSolved(true);
      const r = el.getBoundingClientRect();
      const q = questRef.current ? questRef.current.getBoundingClientRect() : r;
      const from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const to = { x: q.left + q.width / 2, y: q.top + q.height / 2 };
      // variant "?" katagiga uchib boradi
      setFlyer({ ...from, tx: to.x, ty: to.y, go: false });
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setFlyer((f) => (f ? { ...f, go: true } : f)))
      );
      later(() => {
        setFlyer(null);
        setFlown(true);
        sfxDingDing();
        onCorrect(to, true);
      }, 600);
      later(onNext, 2600);
    } else {
      shake();
      setShakeIdx(null);
      requestAnimationFrame(() => {
        setShakeIdx(i);
        later(() => setShakeIdx(null), 500);
      });
    }
  };

  return (
    <PageShell onBack={onBack} onNext={onNext} nextOk={flown}>
      <div className={`d2-card d2-ana-card d2-fill-card ${shaking ? 'd2-shake' : ''}`}>
        {/* yuqori qator: 3 a'zo + bo'sh "?" katak */}
        <div className="d2-ana-row">
          {group.map((ch, i) => (
            <span key={i} className="d2-ana-cell"><span className="d2-ana-emoji">{ch}</span></span>
          ))}
          <span ref={questRef} className={`d2-ana-cell ${flown ? 'sample' : 'quest'}`}>
            {flown ? (
              <span className="d2-ana-emoji fade-up">{answer}</span>
            ) : (
              <span className="d2-ana-q" aria-label="yetishmayotgan obyekt">?</span>
            )}
            {flown && <span className="d2-ana-check" aria-hidden="true">✅</span>}
            {flown && <ConfettiBurst/>}
          </span>
        </div>
        {/* pastki qator: 4 variant */}
        <div className="d2-ana-opts">
          {options.map((ch, i) => (
            <button key={ch} type="button"
              className={`d2-ana-opt ${shakeIdx === i ? 'd2-shake' : ''}`}
              style={solved && ch === answer ? { visibility: 'hidden' } : undefined}
              disabled={solved}
              onClick={(e) => pick(ch, i, e.currentTarget)}
              aria-label={ch}>
              <span className="d2-ana-emoji">{ch}</span>
            </button>
          ))}
        </div>
        {/* uchayotgan variant — fixed qatlamda "?" katak tomon suzadi */}
        {flyer && createPortal(
          <span className={`d2-fill-fly ${flyer.go ? 'go' : ''}`}
            style={{ left: flyer.go ? flyer.tx : flyer.x, top: flyer.go ? flyer.ty : flyer.y }}
            aria-hidden="true">
            {answer}
          </span>,
          document.body
        )}
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};
// SAHIFA 14 — Guruh C-3: Oshxona buyumlari (MA'NO). Uchta oshxona buyumi +
// bitta o'yinchoq mashina.
const CFG_KITCHEN = {
  voice: "Oshxona stolida narsalar turibdi. Ularning uchtasi oshxonaga kerak, bittasi esa umuman boshqa joyga tegishli. Ortiqchasini topib bering.",
  items: [
    { node: <EmojiArt ch="🥄"/>, label: 'qoshiq' },
    { node: <EmojiArt ch="☕"/>, label: 'piyola' },
    { node: <EmojiArt ch="🫖"/>, label: 'choynak' },
    { node: <EmojiArt ch="🚗"/>, label: "o'yinchoq mashina", odd: true },
  ],
  theme: {
    bg: GAME_BG,
    decor: [
      { ch: '🏠', x: 8,  y: 12, s: 50, o: 0.35 },
      { ch: '🌿', x: 30, y: 7,  s: 36, o: 0.4 },
      { ch: '☀️', x: 70, y: 8,  s: 40, o: 0.4 },
      { ch: '🌸', x: 92, y: 13, s: 38, o: 0.4 },
    ],
  },
};
// ============================================================
// SAHIFA 16 — "KIM NIMA YEYDI?" (juftlab ULASH o'yini).
// Mantiq: ikki ustunni juftlab bog'lash. Analogiyaga o'xshaydi, lekin
// bola bitta emas — BIR NECHTA bog'lanishni topadi.
// CHAP USTUN: 3 ta hayvon · O'NG USTUN: 3 ta ovqat (aralash tartibda).
// Bola chapdan bittasini bosadi -> o'ngdan juftini bosadi:
//   to'g'ri -> ular orasida YASHIL CHIZIQ chiziladi + ⭐;
//   noto'g'ri -> ikkalasi silkinadi, "hmm", qayta urinish.
// 3 juftlik ham ulangach — avto-o'tish.
// HAR KIRGANDA ALMASHADI: 6 juftlikdan tasodifiy 3 tasi tanlanadi,
// ustunlar tartibi aralashadi (o'ng ustun hech qachon to'liq
// chapga mos tartibda kelmaydi).
// ============================================================
const FEED_POOL = [
  { a: '🐰', f: '🥕', al: 'quyoncha', fl: 'sabzi' },
  { a: '🐱', f: '🐟', al: 'mushukcha', fl: 'baliq' },
  { a: '🐝', f: '🍯', al: 'ari', fl: 'asal' },
  { a: '🐶', f: '🦴', al: 'kuchukcha', fl: 'suyak' },
  { a: '🐵', f: '🍌', al: 'maymuncha', fl: 'banan' },
  { a: '🐭', f: '🧀', al: 'sichqoncha', fl: 'pishloq' },
];
const buildFeedRound = () => {
  const pairs = shuffleArr([...FEED_POOL]).slice(0, 3);
  const left = shuffleArr([...pairs]);
  let right;
  do {
    right = shuffleArr([...pairs]);
  } while (right.every((r, i) => r.f === left[i].f));   // to'liq tekis mos kelmasin
  return { left, right };
};

const FEED_VOICE = "Hayvonlar och qolibdi! Kim nima yeydi? Har birini o'z ovqatiga ulang!";

const FeedMatchPage = ({ onBack, onNext }) => {
  const voice = useVoice(FEED_VOICE);
  const { onCorrect } = useFlightApi();
  const [{ left, right }] = useState(buildFeedRound);
  const [sel, setSel] = useState(null);                 // { side:'L'|'R', idx }
  const [doneL, setDoneL] = useState(() => new Set());  // ulangan chap indekslar
  const [doneR, setDoneR] = useState(() => new Set());
  const [lines, setLines] = useState([]);               // { x1,y1,x2,y2 } — % da
  const [shakePair, setShakePair] = useState(null);     // ['L-0','R-2'] xatoda
  const [shaking, shake] = useShake();
  const wrapRef = useRef(null);
  const cellRefs = useRef({});                          // 'L-0' -> el
  const timers = useRef([]);
  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const allDone = doneL.size === left.length;

  // ulangan juftlik orasiga yashil chiziq (koordinatalar % da — moslashuvchan)
  const addLine = (li, ri) => {
    const wrap = wrapRef.current;
    const a = cellRefs.current[`L-${li}`];
    const b = cellRefs.current[`R-${ri}`];
    if (!wrap || !a || !b) return { x: 0, y: 0 };
    const w = wrap.getBoundingClientRect();
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const x1 = ((ra.right - w.left) / w.width) * 100;
    const y1 = ((ra.top + ra.height / 2 - w.top) / w.height) * 100;
    const x2 = ((rb.left - w.left) / w.width) * 100;
    const y2 = ((rb.top + rb.height / 2 - w.top) / w.height) * 100;
    setLines((ls) => [...ls, { x1, y1, x2, y2 }]);
    return { x: (ra.right + rb.left) / 2, y: (ra.top + ra.height / 2 + rb.top + rb.height / 2) / 2 };
  };

  const pick = (side, idx) => {
    if (allDone) return;
    if (side === 'L' && doneL.has(idx)) return;
    if (side === 'R' && doneR.has(idx)) return;
    if (!sel || sel.side === side) { setSel({ side, idx }); return; }
    const li = side === 'L' ? idx : sel.idx;
    const ri = side === 'R' ? idx : sel.idx;
    setSel(null);
    if (left[li].f === right[ri].f) {
      voice.stop();
      const nextL = new Set(doneL); nextL.add(li); setDoneL(nextL);
      setDoneR((s) => { const n = new Set(s); n.add(ri); return n; });
      const pt = addLine(li, ri);
      sfxDingDing();
      const last = nextL.size === left.length;
      onCorrect(pt, last);
      if (last) later(onNext, 2100);
    } else {
      shake();
      setShakePair(null);
      requestAnimationFrame(() => {
        setShakePair([`L-${li}`, `R-${ri}`]);
        later(() => setShakePair(null), 500);
      });
    }
  };

  const cell = (side, idx, ch, label) => {
    const key = `${side}-${idx}`;
    const done = side === 'L' ? doneL.has(idx) : doneR.has(idx);
    const isSel = sel && sel.side === side && sel.idx === idx;
    return (
      <button key={key} type="button"
        ref={(el) => { cellRefs.current[key] = el; }}
        className={`d2-feed-cell ${isSel ? 'sel' : ''} ${done ? 'ok' : ''} ${shakePair && shakePair.includes(key) ? 'd2-shake' : ''}`}
        disabled={done}
        onClick={() => pick(side, idx)}
        aria-label={label}>
        <span className="d2-feed-emoji">{ch}</span>
      </button>
    );
  };

  return (
    <PageShell onBack={onBack} onNext={onNext} nextOk={allDone}>
      <div className={`d2-card d2-feed-card ${shaking ? 'd2-shake' : ''}`}>
        <div className="d2-feed-wrap" ref={wrapRef}>
          {/* ulangan juftliklar orasidagi yashil chiziqlar */}
          <svg className="d2-feed-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {lines.map((l, i) => (
              <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                pathLength="1" vectorEffect="non-scaling-stroke"/>
            ))}
          </svg>
          <div className="d2-feed-col">
            {left.map((it, i) => cell('L', i, it.a, it.al))}
          </div>
          <div className="d2-feed-col">
            {right.map((it, i) => cell('R', i, it.f, it.fl))}
          </div>
        </div>
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

// SAHIFA 18 — Guruh C-4: O'rmon va uy hayvonlari (MA'NO — katta manzara).
// HAR KIRGANDA ALMASHADI: 6 o'rmon hayvonidan tasodifiy 4 tasi + uy
// hayvonlaridan tasodifiy bittasi (u o'rmonga to'g'ri kelmaydi!),
// joylashuvi ham aralashadi. Topilgach ortiqcha hayvon yumshoq tovush
// bilan uyiga qarab yurib ketadi.
const FOREST_SPOTS = [
  { x: 15, y: 40, w: 15 }, { x: 36, y: 68, w: 14 }, { x: 66, y: 34, w: 13 },
  { x: 84, y: 72, w: 13 }, { x: 55, y: 58, w: 16 },
];
const FOREST_WILD = [
  { ch: '🐻', label: 'ayiqcha' }, { ch: '🦊', label: 'tulki' },
  { ch: '🐺', label: "bo'ri" }, { ch: '🦔', label: 'tipratikan' },
  { ch: '🦉', label: 'boyqush' }, { ch: '🐿️', label: 'olmaxon' },
];
const FOREST_ODD = [
  { ch: '🐄', label: 'sigir' }, { ch: '🐑', label: "qo'y" },
  { ch: '🐔', label: 'tovuq' }, { ch: '🐐', label: 'echki' },
];
const buildForestItems = () => {
  const wild = shuffleArr([...FOREST_WILD]).slice(0, 4)
    .map((a) => ({ node: <EmojiArt ch={a.ch}/>, label: a.label }));
  const odd = FOREST_ODD[Math.floor(Math.random() * FOREST_ODD.length)];
  return shuffleArr([...wild, { node: <EmojiArt ch={odd.ch}/>, label: odd.label, odd: true }])
    .map((it, i) => ({ ...it, ...FOREST_SPOTS[i] }));
};
const CFG_FOREST = {
  layout: 'scene',
  exitOdd: true,
  buildItems: buildForestItems,
  voice: "Bu chiroyli o'rmonga qarang. Bu yerda hayvonlar yashaydi. Lekin ulardan bittasi o'rmonda emas, boshqa joyda yashaydi. Qaysi biri ekan?",
  theme: {
    bg: GAME_BG,
    decor: [
      { ch: '🌲', x: 7,  y: 22, s: 110, o: 0.55 },
      { ch: '🌳', x: 26, y: 12, s: 84,  o: 0.5 },
      { ch: '☀️', x: 50, y: 6,  s: 44,  o: 0.55 },
      { ch: '🌲', x: 78, y: 12, s: 96,  o: 0.5 },
      { ch: '🌳', x: 94, y: 26, s: 80,  o: 0.55 },
      { ch: '🍄', x: 8,  y: 90, s: 34,  o: 0.6 },
      { ch: '🌸', x: 28, y: 94, s: 28,  o: 0.5 },
      { ch: '🍄', x: 68, y: 94, s: 28,  o: 0.55 },
      { ch: '🌼', x: 92, y: 92, s: 30,  o: 0.5 },
    ],
  },
};

// ============================================================
// SAHIFA 15 — ARALASH MINI-TEST: 3 ta panel KETMA-KET ochiladi
// (rang -> shakl -> ma'no), yuqorida bosqich hisoblagichi (3 doiracha).
// Har panel umumiy qoida bilan ishlaydi: javob -> keyingi panel.
// ============================================================
const MINI_PANELS = [
  {
    // 1-PANEL (rang): 4 ta yulduz, bittasi ko'k
    voice: "Endi biz uchta topshiriqni ketma-ket bajaramiz. Har safar ortiqchasini toping. Birinchisidan boshlaymiz!",
    items: [
      { node: <EmojiArt ch="⭐"/>, label: 'sariq yulduz' },
      { node: <EmojiArt ch="⭐"/>, label: 'sariq yulduz' },
      { node: <EmojiArt ch="⭐" hue={175}/>, label: "ko'k yulduz", odd: true },
      { node: <EmojiArt ch="⭐"/>, label: 'sariq yulduz' },
    ],
  },
  {
    // 2-PANEL (shakl): 3 ta dumaloq koptok, bittasi oval (shakli boshqacha)
    voice: "Zo'r! Endi ikkinchisi — ortiqchasini toping.",
    items: [
      { node: <EmojiArt ch="⚽"/>, label: 'dumaloq koptok' },
      { node: <EmojiArt ch="⚽"/>, label: 'dumaloq koptok' },
      { node: <EmojiArt ch="🏈"/>, label: 'oval koptok', odd: true },
      { node: <EmojiArt ch="⚽"/>, label: 'dumaloq koptok' },
    ],
  },
  {
    // 3-PANEL (ma'no): shapka, ko'ylak, sharf (kiyim) + olma (meva)
    voice: "Ajoyib! Va oxirgisi — ortiqchasini toping.",
    items: [
      { node: <EmojiArt ch="🧢"/>, label: 'shapka' },
      { node: <EmojiArt ch="👕"/>, label: "ko'ylak" },
      { node: <EmojiArt ch="🧣"/>, label: 'sharf' },
      { node: <EmojiArt ch="🍎"/>, label: 'olma', odd: true },
    ],
  },
];
// Mini-test kartasining neytral foni (spets: och kulrang-ko'k, yengil naqsh)
const MINI_THEME = {
  bg: GAME_BG,
  decor: [
    { ch: '⭐', x: 6,  y: 10, s: 24, o: 0.4 },
    { ch: '⚪', x: 30, y: 6,  s: 16, o: 0.35 },
    { ch: '⭐', x: 70, y: 7,  s: 20, o: 0.35 },
    { ch: '⚪', x: 93, y: 11, s: 18, o: 0.4 },
    { ch: '⚪', x: 10, y: 92, s: 16, o: 0.35 },
    { ch: '⭐', x: 50, y: 95, s: 20, o: 0.35 },
    { ch: '⚪', x: 90, y: 93, s: 16, o: 0.35 },
  ],
};

const MiniTestPage = ({ onBack, onNext }) => {
  const [panel, setPanel] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const allDone = doneCount === MINI_PANELS.length;

  const panelSolved = () => {
    const n = doneCount + 1;
    setDoneCount(n);
    if (n < MINI_PANELS.length) {
      timers.current.push(setTimeout(() => setPanel(n), 500));
    } else {
      timers.current.push(setTimeout(onNext, 700));
    }
  };

  // bosqich hisoblagichi: bajarilgani yashil to'ladi
  const dots = (
    <div className="d2-mini-dots" aria-label={`${doneCount} / 3 bosqich bajarildi`}>
      {MINI_PANELS.map((_, i) => (
        <span key={i} className={`d2-mini-dot ${i < doneCount ? 'on' : ''}`}>
          {i < doneCount ? '✓' : i + 1}
        </span>
      ))}
    </div>
  );

  return (
    <PageShell onBack={onBack} onNext={onNext} nextOk={allDone}>
      <OddCore key={panel}
        cfg={{ ...MINI_PANELS[panel], theme: MINI_THEME }}
        onSolved={panelSolved}
        extra={dots}/>
    </PageShell>
  );
};

// ============================================================
// SAHIFA 17 — BONUS: "IKKITA ortiqchani top". 5 ta obyekt yarim doira
// bo'ylab: 3 ta yashil olma + apelsin + uzum. Har ortiqcha alohida
// belgilanadi (bosish -> yulduz -> keyingisi). Yuqoridagi 2 doiracha
// ketma-ket to'ladi. Ikkalasi topilgach sahifa yakunlanadi.
// ============================================================
const BONUS_VOICE = "E'tibor bering — bu safar ortiqcha bitta emas, ikkita ekan! Har ikkalasini ham topa olasizmi?";
const BONUS_POS = [
  { x: 13, y: 62 }, { x: 31, y: 36 }, { x: 50, y: 26 }, { x: 69, y: 36 }, { x: 87, y: 62 },
];
const BONUS_THEME = {
  bg: GAME_BG,
  decor: [
    { ch: '⭐', x: 6,  y: 10, s: 26, o: 0.45 },
    { ch: '🔴', x: 26, y: 6,  s: 14, o: 0.4 },
    { ch: '⭐', x: 50, y: 8,  s: 22, o: 0.4 },
    { ch: '🟢', x: 72, y: 6,  s: 13, o: 0.4 },
    { ch: '⭐', x: 93, y: 11, s: 24, o: 0.45 },
    { ch: '🟡', x: 10, y: 92, s: 15, o: 0.4 },
    { ch: '⭐', x: 40, y: 95, s: 20, o: 0.35 },
    { ch: '🟣', x: 68, y: 93, s: 14, o: 0.4 },
    { ch: '⭐', x: 91, y: 92, s: 22, o: 0.4 },
  ],
};

const BonusTwoPage = ({ onBack, onNext }) => {
  const voice = useVoice(BONUS_VOICE);
  const { onCorrect } = useFlightApi();
  // har kirganda obyektlar yarim doira bo'ylab tasodifiy taqsimlanadi
  const [items] = useState(() =>
    shuffleArr([
      { node: <EmojiArt ch="🍏"/>, label: 'yashil olma' },
      { node: <EmojiArt ch="🍏"/>, label: 'yashil olma' },
      { node: <EmojiArt ch="🍏"/>, label: 'yashil olma' },
      { node: <EmojiArt ch="🍊"/>, label: 'apelsin', odd: true },
      { node: <EmojiArt ch="🍇"/>, label: 'uzum', odd: true },
    ]).map((it, i) => ({ ...it, ...BONUS_POS[i] }))
  );
  const [found, setFound] = useState(() => new Set());   // topilgan indekslar
  const [shaking, shake] = useShake();
  const [shakeIdx, setShakeIdx] = useState(null);
  const timers = useRef([]);
  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const allDone = found.size === 2;

  const pick = (it, i, el) => {
    if (found.has(i) || allDone) return;
    if (it.odd) {
      voice.stop();
      const next = new Set(found); next.add(i);
      setFound(next);
      sfxDingDing();
      const r = el.getBoundingClientRect();
      onCorrect({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, next.size === 2);
      if (next.size === 2) later(onNext, 2100);
    } else {
      shake();
      setShakeIdx(null);
      requestAnimationFrame(() => {
        setShakeIdx(i);
        later(() => setShakeIdx(null), 500);
      });
    }
  };

  return (
    <PageShell onBack={onBack} onNext={onNext} nextOk={allDone}>
      <div className={`d2-card themed ${shaking ? 'd2-shake' : ''}`}>
        <ThemeBg theme={BONUS_THEME}/>
        {/* topilganlar hisobi: 2 ta doiracha */}
        <div className="d2-mini-dots" aria-label={`${found.size} / 2 ortiqcha topildi`}>
          {[0, 1].map((i) => (
            <span key={i} className={`d2-mini-dot ${i < found.size ? 'on' : ''}`}>
              {i < found.size ? '✓' : ''}
            </span>
          ))}
        </div>
        <div className="d2-scene">
          {items.map((it, i) => (
            <button key={i} type="button"
              className={`d2-scene-item circ ${found.has(i) ? 'ok' : ''} ${shakeIdx === i ? 'd2-shake' : ''}`}
              style={{ left: `${it.x}%`, top: `${it.y}%`, width: '15%' }}
              onClick={(e) => pick(it, i, e.currentTarget)}
              aria-label={it.label}>
              {it.node}
              {found.has(i) && <ConfettiBurst/>}
            </button>
          ))}
        </div>
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

// ============================================================
// SAHIFA 19 — YAKUNIY KATTA O'YIN: "Uchta guruhni tartibga sol".
// Yuqorida 3 ta ochiq quti (har kirganda 5 turkumdan tasodifiy 3 tasi:
// meva / hayvon / o'yinchoq / kiyim / transport — belgilari bilan),
// pastda tartibsiz 6 ta obyekt. Obyekt bosib olinadi va qutiga OLIB BORIB
// tashlanadi (yoki: obyektni bosib, keyin qutini bosish ham mumkin).
// To'g'ri -> qutiga "sakrab" kiradi + yulduz + "Ajoyib, davom eting!".
// Noto'g'ri -> joyiga qaytadi, yumshoq "hmm". SABAB EKRANI YO'Q —
// joylashtirishning o'zi klassifikatsiyani ko'rsatadi. 6/6 = katta tabrik.
// ============================================================
const SORT_VOICE = "Bu — eng oxirgi katta topshiriq! Bu yerda uchta quti va oltita narsa bor. Har bir narsani o'zining qutisiga joylashtirib bering. Tayyormisiz?";
// HAR KIRGANDA ALMASHADI: 5 turkumdan tasodifiy 3 tasi tanlanadi,
// har turkumdan tasodifiy 2 tadan obyekt olinadi va aralashtiriladi.
const SORT_CATS = [
  { cat: 'fruit', badge: '🍎', label: 'Meva qutisi', pool: [
    { ch: '🍎', label: 'olma' }, { ch: '🍌', label: 'banan' },
    { ch: '🍇', label: 'uzum' }, { ch: '🍓', label: 'qulupnay' },
    { ch: '🍊', label: 'apelsin' },
  ] },
  { cat: 'animal', badge: '🐱', label: 'Hayvon qutisi', pool: [
    { ch: '🐶', label: 'kuchukcha' }, { ch: '🐱', label: 'mushukcha' },
    { ch: '🐦', label: 'qushcha' }, { ch: '🐰', label: 'quyoncha' },
    { ch: '🐟', label: 'baliqcha' },
  ] },
  { cat: 'toy', badge: '⚽', label: "O'yinchoq qutisi", pool: [
    { ch: '⚽', label: 'koptok' }, { ch: '🎈', label: 'shar' },
    { ch: '🪆', label: "qo'g'irchoq" }, { ch: '🧸', label: 'ayiqcha' },
    { ch: '🎲', label: 'kubik' },
  ] },
  { cat: 'clothes', badge: '👕', label: 'Kiyim qutisi', pool: [
    { ch: '👕', label: "ko'ylak" }, { ch: '🧢', label: 'shapka' },
    { ch: '🧣', label: 'sharf' }, { ch: '🧤', label: "qo'lqop" },
  ] },
  { cat: 'transport', badge: '🚗', label: 'Transport qutisi', pool: [
    { ch: '🚗', label: 'mashina' }, { ch: '🚌', label: 'avtobus' },
    { ch: '🚲', label: 'velosiped' }, { ch: '✈️', label: 'samolyot' },
  ] },
];
const SORT_COLORS = ['#43C465', '#4A90E2', '#FFB03A'];
const buildSortRound = () => {
  const cats = shuffleArr([...SORT_CATS]).slice(0, 3);
  const boxes = cats.map((c, i) => ({ cat: c.cat, c: SORT_COLORS[i], badge: c.badge, label: c.label }));
  const items = shuffleArr(cats.flatMap((c) =>
    shuffleArr([...c.pool]).slice(0, 2).map((it) => ({ id: `${c.cat}-${it.ch}`, ch: it.ch, cat: c.cat, label: it.label }))
  ));
  return { boxes, items };
};
const SORT_THEME = {
  bg: GAME_BG,
  decor: [
    { ch: '⭐', x: 5,  y: 8,  s: 24, o: 0.4 },
    { ch: '⭐', x: 95, y: 8,  s: 22, o: 0.4 },
    { ch: '⚪', x: 8,  y: 93, s: 16, o: 0.35 },
    { ch: '⚪', x: 92, y: 93, s: 16, o: 0.35 },
  ],
};
// Konfetti yomg'iri pozitsiyalari (motivatsiya/sertifikat/saralash yakuni)
const RAIN = [
  { x: 4,  d: 0,   c: '#FF5A8A' }, { x: 12, d: 1.4, c: '#FFD34D' },
  { x: 22, d: 0.6, c: '#5AC8FA' }, { x: 30, d: 2.0, c: '#43C465' },
  { x: 40, d: 0.2, c: '#8E5AE8' }, { x: 48, d: 1.7, c: '#FF7043' },
  { x: 58, d: 0.9, c: '#FFD34D' }, { x: 66, d: 2.3, c: '#FF5A8A' },
  { x: 76, d: 0.4, c: '#43C465' }, { x: 84, d: 1.2, c: '#5AC8FA' },
  { x: 92, d: 1.9, c: '#8E5AE8' }, { x: 97, d: 0.7, c: '#FF7043' },
];

const SortGamePage = ({ onBack, onNext }) => {
  const voice = useVoice(SORT_VOICE);
  const { onCorrect } = useFlightApi();
  // har kirganda: tasodifiy 3 turkum + har biridan 2 tadan obyekt
  const [{ boxes, items }] = useState(buildSortRound);
  const [placed, setPlaced] = useState({});             // id -> true
  const [drag, setDrag] = useState(null);               // { id, x, y }
  const [sel, setSel] = useState(null);                 // bosib tanlangan obyekt
  const [hoverBox, setHoverBox] = useState(null);
  const [shakeBox, setShakeBox] = useState(null);
  const [celebrate, setCelebrate] = useState(false);
  const boxRefs = useRef({});
  const downPt = useRef(null);
  const timers = useRef([]);
  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const doneCount = Object.keys(placed).length;
  const allDone = doneCount === items.length;
  const dragItem = drag ? items.find(i => i.id === drag.id) : null;

  const boxAt = (x, y) => boxes.find((b) => {
    const el = boxRefs.current[b.cat];
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  });

  const place = (item, box) => {
    if (item.cat === box.cat) {
      const nextPlaced = { ...placed, [item.id]: true };
      setPlaced(nextPlaced);
      setSel(null);
      sfxDingDing();
      const r = boxRefs.current[box.cat].getBoundingClientRect();
      const isLast = Object.keys(nextPlaced).length === items.length;
      onCorrect({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, isLast);
      if (isLast) {
        // barcha guruh tabriklash uslublari birlashgan katta animatsiya
        later(() => { setCelebrate(true); sfxFanfare(); }, 1500);
        later(onNext, 4600);
      } else {
        later(() => speakNow('Ajoyib, davom eting!'), 900);
      }
    } else {
      sfxHmm();
      setShakeBox(null);
      requestAnimationFrame(() => {
        setShakeBox(box.cat);
        later(() => setShakeBox(null), 500);
      });
    }
  };

  const startDrag = (e, id) => {
    if (placed[id] || allDone) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* no-op */ }
    downPt.current = { x: e.clientX, y: e.clientY };
    setDrag({ id, x: e.clientX, y: e.clientY });
  };
  const moveDrag = (e) => {
    if (!drag) return;
    const b = boxAt(e.clientX, e.clientY);
    setHoverBox(b ? b.cat : null);
    setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
  };
  const cancelDrag = () => { setDrag(null); setHoverBox(null); };
  const endDrag = (e) => {
    if (!drag) return;
    const item = items.find(i => i.id === drag.id);
    const box = boxAt(e.clientX, e.clientY);
    const dp = downPt.current;
    const moved = dp ? Math.hypot(e.clientX - dp.x, e.clientY - dp.y) : 99;
    cancelDrag();
    if (box) { place(item, box); return; }
    // deyarli qimirlamagan — bu "bosib tanlash": obyekt tanlangan holda qoladi,
    // endi bola qutini bossa ham joylasha oladi
    if (moved < 10) setSel((s) => (s === item.id ? null : item.id));
  };
  const boxClick = (box) => {
    if (!sel) return;
    const item = items.find(i => i.id === sel);
    if (item && !placed[item.id]) place(item, box);
  };

  return (
    <PageShell onBack={onBack} onNext={onNext} nextOk={allDone}>
      <div className="d2-card themed d2-sort-card">
        <ThemeBg theme={SORT_THEME}/>
        {/* 3 ta belgili quti */}
        <div className="d2-sort-boxes">
          {boxes.map((box) => {
            const inside = items.filter(i => placed[i.id] && i.cat === box.cat);
            return (
              <div key={box.cat}
                ref={(el) => { boxRefs.current[box.cat] = el; }}
                className={`d2-box ${hoverBox === box.cat ? 'hover' : ''} ${shakeBox === box.cat ? 'd2-shake' : ''}`}
                style={{ '--boxc': box.c }}
                onClick={() => boxClick(box)}
                aria-label={box.label}>
                <span className="d2-box-badge" style={{ background: box.c }}>
                  <EmojiArt ch={box.badge}/>
                </span>
                <span className="d2-box-lid" style={{ background: box.c }}/>
                <span className="d2-box-slot">
                  {inside.map(i => (
                    <span key={i.id} className="d2-box-item fade-up">
                      <EmojiArt ch={i.ch}/>
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
        {/* tartibsiz 6 obyekt */}
        <div className="d2-sort-items">
          {items.map((i) => placed[i.id] ? (
            <span key={i.id} className="d2-sort-item done" aria-hidden="true"/>
          ) : (
            <button key={i.id} type="button"
              className={`d2-sort-item ${drag && drag.id === i.id ? 'lift' : ''} ${sel === i.id ? 'sel' : ''}`}
              onPointerDown={(e) => startDrag(e, i.id)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={cancelDrag}
              aria-label={i.label}>
              <EmojiArt ch={i.ch}/>
            </button>
          ))}
        </div>
        {/* barmoq ostidagi "ko'tarilgan" nusxa */}
        {dragItem && createPortal(
          <span className="d2-drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
            <EmojiArt ch={dragItem.ch}/>
          </span>,
          document.body
        )}
        {/* 6/6 — birlashgan katta tabrik */}
        {celebrate && (
          <div className="d2-sort-cel fade-up" aria-hidden="true">
            <div className="d2-rain">
              {RAIN.map(({ x, d, c }, i) => (
                <i key={i} style={{ left: `${x}%`, background: c, animationDelay: `${d}s` }}/>
              ))}
            </div>
            <span className="d2-sort-cel-fox"><FoxSVG mood="cheer"/></span>
          </div>
        )}
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

// ============================================================
// SAHIFA 1 — MUQOVA: markazda detektiv tulkicha, atrofida havoda
// aylanib yurgan 6 ta obyekt (ko'k shar kattaroq va porlab turibdi —
// "ortiqchasini top" g'oyasiga ishora). "Boshlash" tugmasi pastda.
// ============================================================
const COVER_VOICE = "Salom! Men — tulkicha detektivman. Keling, birga o'ynaymiz! Men sizga rasmlar ko'rsataman, siz esa boshqacha bo'lganini topasiz. Tayyormisiz? Boshladik!";

// tulkicha atrofida aylanib yuruvchi 6 obyekt (spets ro'yxati);
// ko'k shar (qizil 🎈 + hue-rotate) kattaroq va porlab turibdi
const COVER_ORBIT = [
  { ch: '🍎', x: 14, y: 30, s: 54, d: 0 },
  { ch: '🎈', hue: 200, x: 82, y: 24, s: 84, d: 0.5, glow: true },
  { ch: '⭐', x: 22, y: 62, s: 46, d: 1.1 },
  { ch: '🟩', x: 80, y: 62, s: 48, d: 0.3 },
  { ch: '🌸', x: 10, y: 82, s: 50, d: 0.8 },
  { ch: '☁️', x: 88, y: 84, s: 62, d: 1.5 },
];
const COVER_CLOUDS = [
  { x: 13, y: 12, s: 96,  d: 0 },
  { x: 78, y: 8,  s: 116, d: 1.2 },
  { x: 45, y: 16, s: 74,  d: 0.5 },
];

const TITLE_TEXT = 'Ortiqchasini toping!';
const TITLE_COLORS = ['#FF7043', '#FFB03A', '#43C465', '#5AC8FA', '#8E5AE8', '#FF5A8A'];

const CoverTitle = () => (
  <h1 className="d2-cover-title" aria-label={TITLE_TEXT}>
    {TITLE_TEXT.split('').map((ch, i) => (
      ch === ' '
        ? <span key={i} className="d2-title-space"> </span>
        : (
          <span
            key={i}
            className="d2-title-ch"
            style={{
              color: TITLE_COLORS[i % TITLE_COLORS.length],
              animationDelay: `${0.15 + i * 0.06}s`,
              transform: `rotate(${(i % 2 === 0 ? -1 : 1) * 3}deg)`,
            }}
          >
            {ch}
          </span>
        )
    ))}
  </h1>
);

const CoverPage = ({ onStart }) => {
  const { replay: replayVoice, stop: stopVoice } = useVoice(COVER_VOICE, null);
  const [voiceOn, setVoiceOn] = useState(true);
  const toggleVoice = () => {
    if (voiceOn) { stopVoice(); setVoiceOn(false); }
    else { replayVoice(); setVoiceOn(true); }
  };

  return (
    <div className="d2-cover fade-up">
      <VoiceButton muted={!voiceOn} onClick={toggleVoice}/>
      {COVER_CLOUDS.map((cl, i) => (
        <span key={`c${i}`} className="d2-cover-cloud" style={{ left: `${cl.x}%`, top: `${cl.y}%`, width: cl.s, animationDelay: `${cl.d}s` }}>
          <EmojiArt ch="☁️"/>
        </span>
      ))}
      {/* YUQORI: katta yumaloq o'yinchoqdek harflar */}
      <div className="d2-cover-top">
        <CoverTitle/>
      </div>
      {/* MARKAZ: detektiv tulkicha + atrofida aylanib yurgan 6 obyekt */}
      <div className="d2-cover-mid">
        <span className="d2-cover-glow" aria-hidden="true"/>
        {COVER_ORBIT.map((o, i) => (
          <span key={i}
            className={`d2-cover-orbit ${o.glow ? 'glow' : ''}`}
            style={{ left: `${o.x}%`, top: `${o.y}%`, width: `clamp(${Math.round(o.s * 0.6)}px, ${o.s / 8}vw, ${o.s}px)`, animationDelay: `${o.d}s` }}>
            <EmojiArt ch={o.ch} hue={o.hue}/>
          </span>
        ))}
        <div className="d2-cover-fox">
          <FoxSVG mood="smile"/>
        </div>
      </div>
      {/* PAST: Boshlash */}
      <div className="d2-cover-bottom">
        <button type="button" className="d2-start-btn" onClick={onStart}>
          Boshlash
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

// ============================================================
// ORALIQ MOTIVATSIYA EKRANLARI (5- va 11-sahifalar).
// #1 — sakrayotgan tulkicha + katta yulduz ichida hisob.
// #2 — tulkicha yulduzni ko'tarib turibdi + "yarim yo'l" chizig'i.
// ============================================================
const MOTIV1_VOICE = "Voy, siz juda ajoyib bajaryapsiz! Qarang, allaqachon nechta yulduzcha yig'dingiz. Men siz bilan g'ururlanaman. Davom etamizmi?";
const MOTIV2_VOICE = "Ajoyib! Siz yarim yo'lni bosib o'tdingiz. Sizning diqqatingiz kuchayib boryapti. Endi keyingi topshiriqlarga o'tamizmi?";

const MotivationPage = ({ stars, onNext, half }) => {
  useVoice(half ? MOTIV2_VOICE : MOTIV1_VOICE);
  useEffect(() => { const id = setTimeout(sfxFanfare, 500); return () => clearTimeout(id); }, []);
  return (
    <div className={`d2-final fade-up ${half ? 'd2-motiv2' : ''}`}>
      <div className="d2-rain" aria-hidden="true">
        {RAIN.map(({ x, d, c }, i) => (
          <i key={i} style={{ left: `${x}%`, background: c, animationDelay: `${d}s` }}/>
        ))}
      </div>
      <h1 className="d2-final-title">Ajoyib!</h1>
      {/* katta oltin yulduz ichida yig'ilgan yulduzchalar soni */}
      <div className="d2-motiv-star-wrap">
        <span className="d2-motiv-star"><GoldStar/></span>
        <span className="d2-motiv-num">{stars}</span>
      </div>
      <div className="d2-final-fox"><FoxSVG mood="cheer"/></div>
      {/* #2: rangli "yo'l" chizig'i — yarmi bosib o'tilgan */}
      {half && (
        <div className="d2-path" aria-label="Yarim yo'l bosib o'tildi">
          <span className="d2-path-fill"/>
          <span className="d2-path-flag">
            <EmojiArt ch="🚩"/>
          </span>
        </div>
      )}
      <button type="button" className="d2-start-btn" onClick={onNext}>
        Davom etish
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6"/>
        </svg>
      </button>
    </div>
  );
};

// ============================================================
// SAHIFA 20 — YAKUN / SERTIFIKAT: oltin naqshli ramka, medalli detektiv
// tulkicha, ism uchun chiziq, yulduzlar soni KATTA animatsiya bilan sanaladi,
// bayram musiqasi. "Qaytadan o'ynash" + "Keyingi darslik".
// ============================================================
const CERT_VOICE = "Tabriklayman, azizim! Siz bugun barcha topshiriqlarni juda chiroyli bajardingiz. " +
  "Siz barcha ortiqcha narsalarni topa oldingiz. " +
  "Endi siz — haqiqiy Klassifikatsiya ustasisiz! Men siz bilan juda g'ururlanaman!";

// Oltin medal — emoji (tulkichaga taqiladi)

const CertificatePage = ({ stars, total, onReplay, onBack, onNextLesson }) => {
  useVoice(CERT_VOICE);
  // yulduz soni katta animatsiya bilan sanaladi
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const music = setTimeout(sfxFestive, 700);
    let v = 0;
    const iv = setInterval(() => {
      v += 1;
      if (v >= stars) { v = stars; clearInterval(iv); }
      setShown(v);
    }, Math.max(40, 1600 / Math.max(1, stars)));
    return () => { clearTimeout(music); clearInterval(iv); };
  }, [stars]);

  return (
    <div className="d2-final fade-up">
      <div className="d2-rain" aria-hidden="true">
        {RAIN.map(({ x, d, c }, i) => (
          <i key={i} style={{ left: `${x}%`, background: c, animationDelay: `${d}s` }}/>
        ))}
      </div>
      <div className="d2-cert">
        <p className="d2-cert-eyebrow">✦ KLASSIFIKATSIYA USTASI — 2-daraja ✦</p>
        <h1 className="d2-cert-title">Tabriklaymiz!</h1>
        <div className="d2-cert-fox">
          <FoxSVG mood="cheer"/>
          <span className="d2-cert-medal"><EmojiArt ch="🏅"/></span>
        </div>
        <div className="d2-cert-name">
          <span className="d2-cert-name-label">Ism:</span>
          <span className="d2-cert-name-line"/>
        </div>
        <div className="d2-cert-stars">
          <span className="d2-cert-star"><GoldStar/></span>
          <span className="d2-cert-count">{shown} / {total}</span>
          <span className="d2-cert-sub">ta yulduzcha yig'dingiz!</span>
        </div>
      </div>
      <div className="d2-cert-actions">
        <button type="button" className="d2-nav-back" onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6"/>
          </svg>
          Orqaga
        </button>
        <button type="button" className="d2-nav-back" onClick={onReplay}>Qaytadan o'ynash</button>
        <button type="button" className="d2-start-btn" onClick={onNextLesson}>
          Keyingi darslik
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

// ============================================================
// ILDIZ KOMPONENT — 20 sahifa (spets: dars_2.pdf):
//  0 Muqova · 1 Sharlar-rang · 2 Bulutlar-shakl · 3 Meva-sabzavot-ma'no ·
//  4 Juftlikni-top (hasharotlar) · 5 Yodlab-top (flip, transportlar) · 6 Quyonchalar-harakat ·
//  7 Gullar-rang · 8 Uchadigan-suzadigan · 9 Analogiya (ari→asal, sigir→sut) ·
//  10 Motivatsiya#2 · 11 Nuqtalar-miqdor · 12 Guruhni-to'ldir (teskari) ·
//  13 Oshxona-ma'no · 14 Aralash mini-test · 15 Kim-nima-yeydi (ulash) ·
//  16 Bonus: ikkita ortiqcha · 17 O'rmon-uy hayvonlari · 18 Saralash ·
//  19 Sertifikat.
// Yulduzlar: har o'yin sahifasida 1 ta (topish); yodlab-top 2;
// mini-test 3; kim-nima-yeydi 3; bonus 2; saralash 6. Jami: 28.
// ============================================================
const PAGE_MAX = {
  1: 1, 2: 1, 3: 1, 4: 1, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1, 10: 0,
  11: 1, 12: 1, 13: 1, 14: 3, 15: 3, 16: 2, 17: 1, 18: 6, 19: 0,
};
const TOTAL_STARS = Object.values(PAGE_MAX).reduce((a, b) => a + b, 0); // 28
const LAST_PAGE = 19;

export default function Dars02({ ttsApiBase, voiceGender, onFinished }) {
  configureLesson({ ttsApiBase: ttsApiBase || '', voiceGender: voiceGender || 'f' });

  const [page, setPage] = useState(0);
  const [stars, setStars] = useState(0);
  const [flight, setFlight] = useState(null);   // { x, y, phase:'init'|'pop'|'go', tx, ty }
  const [bump, setBump] = useState(false);
  const counterRef = useRef(null);
  const timersRef = useRef([]);
  const pageRef = useRef(0);
  const starsByRef = useRef({});                // sahifa -> olingan yulduzlar (limit)
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);
  const later = (fn, ms) => { timersRef.current.push(setTimeout(fn, ms)); };

  // Yulduz parvozi: pop -> hisoblagichga uchadi -> +1 ("chiling!")
  const startFlight = useCallback((pt) => {
    // yulduz QAYSI sahifada topilgan bo'lsa — o'sha sahifa hisobiga yoziladi
    // (parvoz tugaguncha bola keyingi sahifaga o'tib ketsa ham adashmaydi)
    const startPage = pageRef.current;
    setFlight({ x: pt.x, y: pt.y, phase: 'init', tx: pt.x, ty: pt.y });
    later(() => setFlight(f => (f ? { ...f, phase: 'pop' } : f)), 30);
    later(() => {
      setFlight(f => {
        if (!f) return f;
        const el = counterRef.current;
        const r = el ? el.getBoundingClientRect() : null;
        return { ...f, phase: 'go', tx: r ? r.left + r.width / 2 : f.x, ty: r ? r.top + r.height / 2 : 40 };
      });
    }, 560);
    later(() => {
      setFlight(null);
      sfxChiling();
      setBump(true);
      later(() => setBump(false), 550);
      const p = startPage;
      const got = starsByRef.current[p] || 0;
      if (got < (PAGE_MAX[p] || 0)) {
        starsByRef.current[p] = got + 1;
        setStars(s => s + 1);
      }
    }, 1460);
  }, []);

  const flightApi = React.useMemo(() => ({ onCorrect: startFlight }), [startFlight]);

  const replay = () => { setStars(0); starsByRef.current = {}; setPage(0); };

  const finishedRef = useRef(false);
  useEffect(() => {
    if (page === LAST_PAGE && !finishedRef.current) {
      finishedRef.current = true;
      if (typeof onFinished === 'function') {
        onFinished({ lessonId: 'log-2-01-v1', stars, total: TOTAL_STARS });
      }
    }
    if (page === 0) finishedRef.current = false;
  }, [page, stars, onFinished]);

  const inGame = page >= 1 && page <= LAST_PAGE - 1;
  const nav = { onBack: () => setPage(p => Math.max(0, p - 1)), onNext: () => setPage(p => Math.min(LAST_PAGE, p + 1)) };

  const view = (() => {
    switch (page) {
      case 0:  return <CoverPage onStart={() => setPage(1)}/>;
      case 1:  return <OddGamePage key={page} cfg={CFG_BALLOONS} {...nav}/>;
      case 2:  return <OddGamePage key={page} cfg={CFG_CLOUDS} {...nav}/>;
      case 3:  return <OddGamePage key={page} cfg={CFG_FRUITS} {...nav}/>;
      case 4:  return <PairMatchPage key={page} {...nav}/>;
      case 5:  return <MemoryFlipPage key={page} {...nav}/>;
      case 6:  return <OddGamePage key={page} cfg={CFG_BUNNIES} {...nav}/>;
      case 7:  return <OddGamePage key={page} cfg={CFG_FLOWERS} {...nav}/>;
      case 8:  return <OddGamePage key={page} cfg={CFG_FLYSWIM} {...nav}/>;
      case 9:  return <AnalogyPage key={page} {...nav}/>;
      case 10: return <MotivationPage key={page} stars={stars} onNext={nav.onNext} half/>;
      case 11: return <OddGamePage key={page} cfg={CFG_DOTS} {...nav}/>;
      case 12: return <FillGroupPage key={page} {...nav}/>;
      case 13: return <OddGamePage key={page} cfg={CFG_KITCHEN} {...nav}/>;
      case 14: return <MiniTestPage key={page} {...nav}/>;
      case 15: return <FeedMatchPage key={page} {...nav}/>;
      case 16: return <BonusTwoPage key={page} {...nav}/>;
      case 17: return <OddGamePage key={page} cfg={CFG_FOREST} {...nav}/>;
      case 18: return <SortGamePage key={page} {...nav}/>;
      default: return (
        <CertificatePage stars={stars} total={TOTAL_STARS} onReplay={replay} onBack={nav.onBack}
          onNextLesson={() => {
            if (typeof onFinished === 'function') onFinished({ lessonId: 'log-2-01-v1', stars, total: TOTAL_STARS, next: true });
          }}/>
      );
    }
  })();

  const flyStyle = flight ? (
    flight.phase === 'go'
      ? { left: flight.tx, top: flight.ty, transform: 'translate(-50%, -50%) scale(0.42)' }
      : { left: flight.x, top: flight.y, transform: `translate(-50%, -50%) scale(${flight.phase === 'pop' ? 1.25 : 0.1})` }
  ) : null;

  return (
    <FlightCtx.Provider value={flightApi}>
      <style>{STYLES}</style>
      <div className="d2-root">
        {/* sahifa progressi: eng tepada to'liq enli chiziq */}
        {inGame && (
          <div className="d2-pageline" aria-hidden="true">
            <span className="d2-pageline-fill" style={{ width: `${((page + 1) / (LAST_PAGE + 1)) * 100}%` }}/>
          </div>
        )}
        {/* yuqori panel: maskot + sahifa soni + yulduz-hisoblagich */}
        {inGame && (
          <div className="d2-topbar">
            <div className="d2-brand">
              <span className="d2-brand-fox"><FoxSVG mood="smile"/></span>
              <span className="d2-brand-txt" aria-label="Kichkina detektiv">
                {'Kichkina detektiv'.split('').map((ch, i) => (
                  <span key={i} className="d2-brand-ch" aria-hidden="true"
                    style={{ animationDelay: `${i * 0.12}s` }}>
                    {ch === ' ' ? ' ' : ch}
                  </span>
                ))}
              </span>
            </div>
            <div className="d2-top-right">
              <span className="d2-pagenum" aria-label={`Sahifa ${page + 1} / ${LAST_PAGE + 1}`}>
                {String(page + 1).padStart(2, '0')} / {LAST_PAGE + 1}
              </span>
              <div ref={counterRef} className={`d2-counter ${bump ? 'bump' : ''}`}>
                <span className="d2-counter-star"><GoldStar/></span>
                <span className="d2-counter-num">x{stars}</span>
              </div>
            </div>
          </div>
        )}

        {view}

        {/* uchuvchi yulduzcha (fixed overlay) */}
        {flight && (
          <span className={`d2-fly ${flight.phase === 'go' ? 'go' : ''}`} style={flyStyle} aria-hidden="true">
            <GoldStar/>
          </span>
        )}
      </div>
    </FlightCtx.Provider>
  );
}

// ============================================================
// STILLAR — flat, yumaloq burchaklar, yumshoq soyalar, bolalar kitobi uslubi
// (Dars01 palitrasining davomi: fon #EFF3F9, matn #3D3A50, yashil #2FA45C)
// ============================================================
const STYLES = `
html, body { margin: 0; padding: 0; }
.d2-root, .d2-root * { box-sizing: border-box; }
.d2-root {
  font-family: 'Manrope', 'Nunito', system-ui, sans-serif;
  color: #3D3A50;
  position: fixed;
  inset: 0;
  overflow: hidden;
  overscroll-behavior: none;
  -webkit-font-smoothing: antialiased;
  background: #EFF3F9;
  display: flex;
  flex-direction: column;
}
.d2-root h1, .d2-root h2, .d2-root p { margin: 0; }
.d2-root button { -webkit-tap-highlight-color: transparent; }

@keyframes d2fadeup { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
.fade-up { animation: d2fadeup 0.45s ease-out both; }

/* ===== YUQORI PANEL ===== */
.d2-topbar {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between;
  padding: clamp(10px, 2vw, 16px) clamp(14px, 3vw, 28px) 0;
  z-index: 20;
}
.d2-pageline {
  flex-shrink: 0;
  width: 100%; height: clamp(6px, 1vh, 9px);
  background: #E1E6F0;
}
.d2-pageline-fill {
  display: block; height: 100%;
  border-radius: 0 999px 999px 0;
  background: linear-gradient(90deg, #7FB8E8, #4A90E2);
  box-shadow: 0 0 10px 2px rgba(74, 144, 226, 0.45);
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}
.d2-top-right { display: flex; align-items: center; gap: clamp(8px, 1.6vw, 14px); }
.d2-pagenum {
  font-weight: 800; font-size: clamp(13px, 2vh, 16px);
  letter-spacing: 0.08em; color: #6E6A85;
  background: #FFFFFF; border-radius: 999px;
  padding: clamp(7px, 1.2vh, 10px) clamp(12px, 1.8vw, 18px);
  box-shadow: 0 6px 16px -6px rgba(61, 58, 80, 0.2);
  white-space: nowrap;
}
.d2-brand { display: flex; align-items: center; gap: 8px; }
.d2-brand-fox {
  width: clamp(36px, 5.4vw, 48px); display: inline-flex;
  transform-origin: 50% 88%;
  animation: d2foxbob 3s ease-in-out infinite;
}
@keyframes d2foxbob {
  0%, 100% { transform: rotate(0deg) translateY(0); }
  20%      { transform: rotate(-5deg) translateY(-2px); }
  40%      { transform: rotate(3deg) translateY(0); }
  60%      { transform: rotate(-2deg) translateY(-1px); }
  80%      { transform: rotate(4deg) translateY(0); }
}
.d2-brand-txt { font-weight: 800; font-size: clamp(14px, 2.1vw, 18px); letter-spacing: 0.02em; }
.d2-brand-ch {
  display: inline-block;
  animation: d2chwave 3s ease-in-out infinite;
}
@keyframes d2chwave {
  0%, 30%, 100% { transform: translateY(0); color: #3D3A50; }
  10% { transform: translateY(-4px) scale(1.08); color: #4A90E2; }
  20% { transform: translateY(0.5px) scale(1); color: #3D3A50; }
}
.d2-counter {
  display: flex; align-items: center; gap: 7px;
  background: #FFFFFF;
  border-radius: 999px;
  padding: clamp(5px, 1vw, 8px) clamp(12px, 2vw, 18px);
  box-shadow: 0 6px 18px -6px rgba(61, 58, 80, 0.28);
}
.d2-counter-star { width: clamp(22px, 3.4vw, 28px); display: inline-flex; }
.d2-counter-num { font-weight: 800; font-size: clamp(16px, 2.6vw, 21px); }
@keyframes d2bump { 0% { transform: scale(1); } 45% { transform: scale(1.32) rotate(-4deg); } 100% { transform: scale(1); } }
.d2-counter.bump { animation: d2bump 0.5s cubic-bezier(0.34, 1.6, 0.64, 1); }

/* karnaycha — ovoz tugmasi */
.d2-voice-btn {
  position: absolute; top: clamp(12px, 2vh, 20px); right: clamp(12px, 2vw, 22px); z-index: 6;
  width: clamp(46px, 7vh, 58px); aspect-ratio: 1;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(145deg, #7FB8E8 0%, #4A90E2 100%);
  color: #FFFFFF;
  border: none; border-radius: 50%; cursor: pointer;
  box-shadow: 0 8px 18px -6px rgba(74, 144, 226, 0.6), inset 0 -3px 0 rgba(24, 70, 130, 0.2), inset 0 2px 0 rgba(255, 255, 255, 0.35);
  transition: transform 0.15s, box-shadow 0.15s;
}
.d2-voice-btn::before {
  content: '';
  position: absolute; inset: -3px;
  border-radius: 50%;
  border: 3px solid rgba(74, 144, 226, 0.55);
  animation: d2voiceping 2.2s ease-out infinite;
  pointer-events: none;
}
@keyframes d2voiceping {
  0%   { transform: scale(1); opacity: 0.8; }
  70%  { transform: scale(1.45); opacity: 0; }
  100% { transform: scale(1.45); opacity: 0; }
}
.d2-voice-btn:hover { transform: scale(1.1); }
.d2-voice-btn:active { transform: scale(0.92); }
.d2-voice-btn.off {
  background: linear-gradient(145deg, #D9D6E4 0%, #B9B5CC 100%);
  box-shadow: 0 6px 14px -6px rgba(61, 58, 80, 0.35), inset 0 -3px 0 rgba(61, 58, 80, 0.15);
}
.d2-voice-btn.off::before { animation: none; opacity: 0; }
.d2-voice-btn.bl {
  position: absolute;
  top: auto; right: auto;
  left: clamp(10px, 2vw, 16px); bottom: clamp(10px, 2vh, 16px);
  width: clamp(42px, 6.5vh, 52px);
}

/* ===== MUQOVA ===== */
.d2-cover {
  position: relative; flex: 1; overflow: hidden;
  display: flex; flex-direction: column; align-items: center;
  background: linear-gradient(180deg, #FFF3C8 0%, #F3F8D8 40%, #CDEBC4 100%);
}
.d2-cover-cloud { position: absolute; opacity: 0.9; z-index: 0; animation: d2drift 7s ease-in-out infinite alternate; }
@keyframes d2drift { from { transform: translateX(-8px); } to { transform: translateX(14px); } }
.d2-cover-top {
  position: relative; z-index: 2;
  flex-shrink: 0;
  display: flex; flex-direction: column; align-items: center;
  padding: clamp(18px, 4vh, 40px) 16px 0;
  text-align: center;
}
.d2-cover-title {
  font-size: clamp(34px, 8vw, 76px);
  font-weight: 800;
  letter-spacing: 0.02em;
  line-height: 1;
  white-space: nowrap;
}
.d2-title-ch {
  display: inline-block;
  text-shadow: 0 4px 0 #FFFFFF, 0 9px 20px rgba(61, 58, 80, 0.22);
  animation: d2titlepop 0.55s cubic-bezier(0.34, 1.6, 0.64, 1) both;
}
.d2-title-space { display: inline-block; width: 0.35em; }
@keyframes d2titlepop {
  0% { opacity: 0; transform: translateY(22px) scale(0.3); }
  70% { opacity: 1; transform: translateY(-6px) scale(1.15); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.d2-cover-mid {
  position: relative; z-index: 2;
  flex: 1; min-height: 0;
  display: flex; align-items: center; justify-content: center;
  width: 100%; max-width: 900px;
}
.d2-cover-glow {
  position: absolute; left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  width: clamp(230px, 44vh, 400px); aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0.35) 55%, rgba(255, 255, 255, 0) 72%);
}
.d2-cover-fox { position: relative; width: clamp(180px, 36vh, 320px); animation: d2bob 2.6s ease-in-out infinite; }
@keyframes d2bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
/* tulkicha atrofida aylanib yuruvchi obyektlar */
.d2-cover-orbit {
  position: absolute; aspect-ratio: 1;
  transform: translate(-50%, -50%);
  animation: d2orbitbob 3.2s ease-in-out infinite;
  filter: drop-shadow(0 5px 8px rgba(61, 58, 80, 0.18));
}
@keyframes d2orbitbob {
  0%, 100% { transform: translate(-50%, -50%) translateY(0) rotate(-3deg); }
  50% { transform: translate(-50%, -50%) translateY(-12px) rotate(4deg); }
}
.d2-cover-orbit.glow {
  filter: drop-shadow(0 0 14px rgba(74, 144, 226, 0.8)) drop-shadow(0 5px 8px rgba(61, 58, 80, 0.18));
  animation-duration: 2.4s;
}
.d2-cover-bottom {
  position: relative; z-index: 2;
  flex-shrink: 0;
  width: 100%;
  display: flex; justify-content: center;
  padding: clamp(10px, 2vh, 18px) 20px calc(clamp(18px, 4vh, 36px) + env(safe-area-inset-bottom, 0px));
}
.d2-start-btn {
  display: inline-flex; align-items: center; gap: 10px;
  font-family: inherit; font-weight: 800;
  font-size: clamp(18px, 3vw, 24px);
  color: #FFFFFF;
  background: linear-gradient(180deg, #4FC46B, #2FA45C);
  border: none; cursor: pointer;
  border-radius: 999px;
  padding: clamp(13px, 2.2vh, 18px) clamp(34px, 6vw, 54px);
  box-shadow: 0 8px 0 #1F7A42, 0 16px 30px -8px rgba(47, 164, 92, 0.55);
  transition: transform 0.15s, box-shadow 0.15s;
}
.d2-start-btn:hover { transform: translateY(-2px); }
.d2-start-btn:active { transform: translateY(4px); box-shadow: 0 3px 0 #1F7A42, 0 8px 16px -8px rgba(47, 164, 92, 0.5); }

/* ===== O'YIN SAHIFASI QOLIPI ===== */
.d2-page {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column; align-items: center;
  padding: clamp(4px, 1vh, 12px) 16px 0;
  width: 100%; max-width: min(1100px, 96vw); margin: 0 auto;
}
.d2-page-title {
  flex-shrink: 0;
  font-size: clamp(18px, 3.4vw, 28px); font-weight: 800;
  color: #3D3A50; text-align: center;
  padding: clamp(2px, 0.8vh, 8px) 0 clamp(8px, 1.6vh, 14px);
}
/* katta o'yin kartasi — qalin oq ramka + orqasida qiya "stiker" qatlamlari */
.d2-card {
  position: relative;
  flex: 1; min-height: 0;
  width: 100%;
  background: #FFFFFF;
  border: clamp(8px, 1.4vw, 12px) solid #FFFFFF;
  border-radius: clamp(26px, 4vw, 40px);
  box-shadow: 0 22px 55px -18px rgba(61, 58, 80, 0.35);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: clamp(8px, 2vh, 18px);
  padding: clamp(10px, 2.2vh, 20px) clamp(14px, 3vw, 28px) clamp(40px, 7vh, 56px);
}
.d2-card::before,
.d2-card::after {
  content: '';
  position: absolute;
  inset: -12px;
  border-radius: clamp(30px, 4.4vw, 46px);
  z-index: -1;
}
.d2-card::before { background: #FFFFFF; opacity: 0.75; transform: rotate(-1.4deg) scale(1.008); }
.d2-card::after  { background: #E2E8F2; opacity: 0.85; transform: rotate(1.1deg) scale(1.004); }

/* tematik fon qatlami */
.d2-theme {
  position: absolute; inset: 0; z-index: 0;
  border-radius: clamp(18px, 2.8vw, 30px);
  overflow: hidden;
  pointer-events: none;
}
.d2-theme-ic { position: absolute; aspect-ratio: 1; display: block; }
/* kontent fon ustida tursin (karta flex — z-index flex-item'larga ishlaydi) */
.d2-card.themed > *:not(.d2-theme) { z-index: 1; }

/* pastki panel: Orqaga / Keyingi */
.d2-footer {
  flex-shrink: 0;
  width: 100%;
  display: flex; align-items: center; justify-content: space-between;
  padding: clamp(10px, 2vh, 16px) 2px calc(clamp(12px, 2.4vh, 20px) + env(safe-area-inset-bottom, 0px));
}
.d2-nav-back {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: inherit; font-weight: 800;
  font-size: clamp(14px, 2.2vw, 17px);
  color: #6E6A85;
  background: #FFFFFF;
  border: none; cursor: pointer;
  border-radius: 999px;
  padding: clamp(10px, 1.8vh, 14px) clamp(18px, 3vw, 26px);
  box-shadow: 0 6px 16px -6px rgba(61, 58, 80, 0.25);
  transition: transform 0.15s, box-shadow 0.15s;
}
.d2-nav-back:hover { transform: translateY(-2px); box-shadow: 0 10px 22px -6px rgba(61, 58, 80, 0.32); }
.d2-nav-next {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: inherit; font-weight: 800;
  font-size: clamp(14px, 2.2vw, 17px);
  color: #FFFFFF;
  background: linear-gradient(180deg, #4FC46B, #2FA45C);
  border: none; cursor: pointer;
  border-radius: 999px;
  padding: clamp(10px, 1.8vh, 14px) clamp(20px, 3.4vw, 30px);
  box-shadow: 0 6px 0 #1F7A42, 0 12px 24px -8px rgba(47, 164, 92, 0.5);
  transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
}
.d2-nav-next:hover:not(:disabled) { transform: translateY(-2px); }
.d2-nav-next:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 2px 0 #1F7A42; }
.d2-nav-next:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; background: #B9B5C9; animation: none; }
@keyframes d2nextpulse {
  0%, 100% { transform: scale(1); box-shadow: 0 6px 0 #1F7A42, 0 12px 24px -8px rgba(47, 164, 92, 0.5); }
  50% { transform: scale(1.06); box-shadow: 0 6px 0 #1F7A42, 0 14px 30px -6px rgba(47, 164, 92, 0.75); }
}
.d2-nav-next:not(:disabled) { animation: d2nextpulse 1.3s ease-in-out infinite; }

/* NOTO'G'RI: yumshoq chapga-o'ngga silkinish (qizil YO'Q) */
@keyframes d2shake {
  0%, 100% { transform: translateX(0); }
  18% { transform: translateX(-7px) rotate(-0.4deg); }
  38% { transform: translateX(6px) rotate(0.4deg); }
  58% { transform: translateX(-4px); }
  78% { transform: translateX(3px); }
}
.d2-shake { animation: d2shake 0.5s ease; }

/* konfetti portlashi */
.d2-burst { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
.d2-burst i {
  position: absolute; left: 50%; top: 50%;
  width: 9px; height: 9px; border-radius: 2.5px;
  animation: d2burst 0.75s ease-out both;
}
@keyframes d2burst {
  0% { transform: translate(-50%, -50%) scale(1) rotate(0deg); opacity: 1; }
  100% { transform: translate(calc(-50% + var(--bx)), calc(-50% + var(--by))) scale(0.5) rotate(220deg); opacity: 0; }
}

/* uchuvchi yulduzcha */
.d2-fly {
  position: fixed; z-index: 90;
  width: clamp(42px, 6vw, 56px); aspect-ratio: 1;
  pointer-events: none;
  filter: drop-shadow(0 0 10px rgba(255, 194, 60, 0.9));
  transition: transform 0.4s cubic-bezier(0.34, 1.8, 0.64, 1);
}
.d2-fly.go {
  transition:
    left 0.8s cubic-bezier(0.5, -0.15, 0.55, 1),
    top 0.8s cubic-bezier(0.3, 0.7, 0.5, 1),
    transform 0.8s ease-in;
}

/* ===== ORTIQCHASINI TOP: QATOR ===== */
.d2-odd-row {
  display: flex; align-items: center; justify-content: center;
  gap: clamp(12px, 2.6vw, 30px); width: 100%; flex-wrap: wrap;
}
.d2-odd-item {
  position: relative;
  width: clamp(110px, 21vh, 190px); aspect-ratio: 1;
  border: none; border-radius: 50%; cursor: pointer;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 24px -10px rgba(61, 58, 80, 0.28), inset 0 0 0 4px rgba(255, 255, 255, 0.9);
  display: flex; align-items: center; justify-content: center;
  transition: transform 0.15s, box-shadow 0.15s;
}
.d2-odd-item:hover { transform: translateY(-4px); box-shadow: 0 16px 30px -12px rgba(61, 58, 80, 0.35); }
.d2-odd-item:active { transform: scale(0.96); }
.d2-odd-icon { display: inline-flex; aspect-ratio: 1; align-items: center; justify-content: center; }
.d2-odd-icon > * { width: 100%; height: 100%; }
/* TO'G'RI: yashil yorqin ramka (spets 1-band) */
.d2-odd-item.ok {
  cursor: default;
  background: #E0F6E8;
  box-shadow: 0 0 0 4px #2FA45C, 0 0 0 8px rgba(47, 164, 92, 0.35), 0 0 26px 6px rgba(80, 220, 130, 0.7);
}

/* nuqtali quti (12-sahifa): oq ochiq quti + bosib sanaladigan emoji nuqtalar */
.d2-dotbox {
  position: relative; display: block;
  width: 100%; height: 100%;
  background: #FFFFFF;
  border: 3px solid #C9CFDD; border-radius: 14px;
  box-shadow: inset 0 9px 0 rgba(201, 207, 221, 0.35);
}
.d2-dotbox-dot {
  position: absolute; transform: translate(-50%, -50%);
  background: none; border: none; padding: 2px; margin: 0;
  cursor: pointer; line-height: 1;
  font-size: clamp(15px, 3vh, 27px);
  transition: transform 0.15s;
}
.d2-dotbox-dot:hover { transform: translate(-50%, -50%) scale(1.18); }

/* ===== JUFTLIKNI TOP (5-sahifa) ===== */
/* orqa fon: tinch och ko'k-kulrang, yumshoq gradient — oq katakchalar
   undan aniq ajralib turadi; bezak yo'q */
.d2-pair-card {
  background: linear-gradient(180deg, #E4ECF9 0%, #DDE6F5 55%, #D3DFF2 100%);
}
/* 2 qator × 3 katakcha — ekranga qarab kattalashadi */
.d2-pair-grid {
  display: grid;
  grid-template-columns: repeat(3, clamp(112px, 19vh, 172px));
  gap: clamp(16px, 2.8vh, 28px);
  justify-content: center;
  align-content: center;
}
/* oq yumaloq-kvadrat katakcha */
.d2-pair-cell {
  position: relative;
  width: 100%; aspect-ratio: 1;
  border-radius: clamp(20px, 2.8vh, 28px);
  background: #FFFFFF;
  border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8px 20px -8px rgba(61, 58, 80, 0.3), inset 0 -4px 0 rgba(61, 58, 80, 0.06);
  transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
}
.d2-pair-cell:hover { transform: translateY(-3px); box-shadow: 0 12px 24px -10px rgba(61, 58, 80, 0.35), inset 0 -3px 0 rgba(61, 58, 80, 0.06); }
.d2-pair-cell:active { transform: scale(0.94); }
/* birinchi belgilangan katak — ko'k halqa, yumshoq tebranish */
.d2-pair-cell.sel {
  box-shadow: 0 0 0 4px #4A90E2, 0 0 18px 4px rgba(74, 144, 226, 0.5);
  animation: d2selbob 1s ease-in-out infinite;
}
/* topilgan juftlik — yashil yorqin ramka (umumiy qoida) */
.d2-pair-cell.ok {
  cursor: default;
  background: #E0F6E8;
  box-shadow: 0 0 0 4px #2FA45C, 0 0 0 8px rgba(47, 164, 92, 0.35), 0 0 26px 6px rgba(80, 220, 130, 0.7);
  animation: d2bump 0.5s cubic-bezier(0.34, 1.6, 0.64, 1);
}
/* markazda emoji — katakchaga mos kattalashadi */
.d2-pair-emoji { font-size: clamp(64px, 11.5vh, 106px); line-height: 1; }
/* kichik ekranlarda ham sig'sin */
@media (max-height: 640px), (max-width: 420px) {
  .d2-pair-grid { grid-template-columns: repeat(3, 88px); gap: 12px; }
  .d2-pair-cell { border-radius: 16px; }
  .d2-pair-emoji { font-size: 52px; }
}

/* ===== ORTIQCHASINI TOP: SAHNA (osmon-suv, o'rmon, bonus) ===== */
.d2-scene {
  position: relative;
  align-self: stretch; flex: 1; min-height: 0;
}
.d2-scene-item {
  position: absolute; aspect-ratio: 1;
  transform: translate(-50%, -50%);
  background: transparent; border: none; padding: 4px; margin: 0;
  cursor: pointer; border-radius: 22px;
  animation: d2float 3.4s ease-in-out infinite;
  transition: filter 0.15s;
}
@keyframes d2float {
  0%, 100% { transform: translate(-50%, -50%) translateY(0); }
  50% { transform: translate(-50%, -50%) translateY(-6px); }
}
.d2-scene-item:hover { filter: brightness(1.08) drop-shadow(0 0 6px rgba(255, 255, 255, 0.8)); }
.d2-scene-item.circ {
  background: rgba(255, 255, 255, 0.92);
  border-radius: 50%;
  padding: 10px;
  box-shadow: 0 10px 24px -10px rgba(61, 58, 80, 0.28);
}
.d2-scene-item.ok {
  animation: none;
  transform: translate(-50%, -50%);
  background: rgba(224, 246, 232, 0.5);
  box-shadow: 0 0 0 4px #2FA45C, 0 0 0 8px rgba(47, 164, 92, 0.35), 0 0 26px 6px rgba(80, 220, 130, 0.75);
}
.d2-scene-item.circ.ok { background: #E0F6E8; }
/* sigir "muu" bilan uyiga ketadi */
.d2-scene-item.d2-exit {
  animation: d2cowexit 1.5s ease-in both;
  pointer-events: none;
}
@keyframes d2cowexit {
  0%   { opacity: 1; transform: translate(-50%, -50%) translateX(0); }
  30%  { transform: translate(-50%, -50%) translateX(-8%) translateY(-3%); }
  100% { opacity: 0; transform: translate(-50%, -50%) translateX(-260%); }
}

/* ===== ANALOGIYA (10-sahifa): [🐝]→[🍯] · [🐮]→[?] · variantlar ===== */
.d2-ana-card {
  background: linear-gradient(180deg, #E4ECF9 0%, #DDE6F5 55%, #D3DFF2 100%);
  justify-content: center;
  gap: clamp(12px, 2.6vh, 26px);
}
.d2-ana-row {
  display: flex; align-items: center;
  gap: clamp(12px, 2.4vw, 22px);
}
/* katakcha: oq, yumaloq-kvadrat (ekranga qarab 88–120px) */
.d2-ana-cell {
  position: relative;
  width: clamp(88px, 12.5vh, 120px); aspect-ratio: 1;
  border-radius: 20px;
  background: #FFFFFF;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 6px 16px -8px rgba(61, 58, 80, 0.28);
}
/* namuna javobi: och yashil fon + yashil 2px ramka + burchakda ✅ */
.d2-ana-cell.sample {
  background: #DCFCE7;
  box-shadow: inset 0 0 0 2px #34C77B, 0 6px 16px -8px rgba(61, 58, 80, 0.25);
}
.d2-ana-check {
  position: absolute; top: 4px; right: 5px;
  font-size: clamp(14px, 2.3vh, 21px); line-height: 1;
}
/* savol katakchasi: shaffof, ko'k punktir ramka, markazda "?" */
.d2-ana-cell.quest {
  background: transparent;
  box-shadow: none;
  border: 2px dashed #93C5FD;
}
.d2-ana-q {
  font-size: clamp(32px, 5.6vh, 54px);
  font-weight: 800; line-height: 1;
  color: #93C5FD;
}
/* o'q belgisi — kulrang */
.d2-ana-arrow {
  font-size: clamp(24px, 4vh, 38px);
  font-weight: 800; line-height: 1;
  color: #94A3B8;
}
/* variantlar qatori: 4 ta oq katakcha-tugma */
.d2-ana-opts {
  display: flex; gap: clamp(12px, 1.8vw, 20px);
  padding-top: clamp(4px, 1.2vh, 12px);
}
.d2-ana-opt {
  position: relative;
  width: clamp(88px, 12.5vh, 120px); aspect-ratio: 1;
  border-radius: 20px;
  background: #FFFFFF;
  border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 6px 16px -8px rgba(61, 58, 80, 0.28), inset 0 -4px 0 rgba(61, 58, 80, 0.06);
  transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
}
.d2-ana-opt:hover:not(:disabled) { transform: translateY(-3px); box-shadow: 0 12px 24px -10px rgba(61, 58, 80, 0.35); }
.d2-ana-opt:active:not(:disabled) { transform: scale(0.94); }
.d2-ana-opt:disabled { cursor: default; }
/* to'g'ri variant: yashil yorqin ramka (umumiy qoida) */
.d2-ana-opt.ok {
  background: #E0F6E8;
  box-shadow: 0 0 0 4px #2FA45C, 0 0 0 8px rgba(47, 164, 92, 0.35), 0 0 26px 6px rgba(80, 220, 130, 0.7);
}
.d2-ana-emoji { font-size: clamp(48px, 7.4vh, 74px); line-height: 1; }
/* "guruhni to'ldir": tanlangan variant "?" katagiga uchib boradi */
.d2-fill-fly {
  position: fixed; z-index: 95;
  transform: translate(-50%, -50%) scale(1.15);
  font-size: clamp(48px, 7.4vh, 74px); line-height: 1;
  pointer-events: none;
  filter: drop-shadow(0 10px 16px rgba(61, 58, 80, 0.35));
}
.d2-fill-fly.go {
  transition: left 0.55s cubic-bezier(0.4, 0, 0.2, 1), top 0.55s cubic-bezier(0.3, 0.6, 0.4, 1), transform 0.55s ease;
  transform: translate(-50%, -50%) scale(1);
}
/* "guruhni to'ldir" (13-sahifa): YUQORI qator katakchalari pastdagi
   variantlardan kattaroq — guruh asosiy diqqat markazida */
.d2-fill-card .d2-ana-row .d2-ana-cell {
  width: clamp(108px, 16vh, 156px);
  border-radius: 24px;
}
.d2-fill-card .d2-ana-row .d2-ana-emoji { font-size: clamp(60px, 9.6vh, 98px); }
.d2-fill-card .d2-ana-q { font-size: clamp(40px, 7vh, 68px); }
@media (max-height: 640px), (max-width: 560px) {
  .d2-fill-card .d2-ana-row .d2-ana-cell { width: 88px; border-radius: 18px; }
  .d2-fill-card .d2-ana-row .d2-ana-emoji { font-size: 52px; }
}
@media (max-height: 640px), (max-width: 480px) {
  .d2-ana-cell, .d2-ana-opt { width: 76px; border-radius: 16px; }
  .d2-ana-emoji { font-size: 44px; }
}

/* ===== KIM NIMA YEYDI? (16-sahifa): ustunlarni ulash ===== */
.d2-feed-card {
  background: linear-gradient(180deg, #E4ECF9 0%, #DDE6F5 55%, #D3DFF2 100%);
  justify-content: center;
}
.d2-feed-wrap {
  position: relative;
  display: flex;
  gap: clamp(110px, 22vw, 260px);   /* chiziq chiziladigan keng oraliq */
}
.d2-feed-col {
  display: flex; flex-direction: column;
  gap: clamp(14px, 2.8vh, 28px);
}
.d2-feed-cell {
  position: relative;
  width: clamp(96px, 14vh, 136px); aspect-ratio: 1;
  border-radius: 24px;
  background: #FFFFFF;
  border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8px 20px -8px rgba(61, 58, 80, 0.3), inset 0 -4px 0 rgba(61, 58, 80, 0.06);
  transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
}
.d2-feed-cell:hover:not(:disabled) { transform: translateY(-3px); box-shadow: 0 14px 26px -10px rgba(61, 58, 80, 0.38); }
.d2-feed-cell:active:not(:disabled) { transform: scale(0.94); }
.d2-feed-cell:disabled { cursor: default; }
/* tanlangan katak — ko'k halqa, yumshoq tebranish */
.d2-feed-cell.sel {
  box-shadow: 0 0 0 4px #4A90E2, 0 0 18px 4px rgba(74, 144, 226, 0.5);
  animation: d2selbob 1s ease-in-out infinite;
}
/* ulangan juftlik — yashil ramka */
.d2-feed-cell.ok {
  background: #E0F6E8;
  box-shadow: 0 0 0 4px #2FA45C, 0 0 14px 3px rgba(80, 220, 130, 0.55);
  animation: d2bump 0.5s cubic-bezier(0.34, 1.6, 0.64, 1);
}
.d2-feed-emoji { font-size: clamp(56px, 8.6vh, 84px); line-height: 1; }
/* yashil chiziqlar — chizilish animatsiyasi bilan */
.d2-feed-lines {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  pointer-events: none;
  overflow: visible;
}
.d2-feed-lines line {
  stroke: #2FA45C;
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: 1;
  animation: d2feeddraw 0.45s ease-out both;
  filter: drop-shadow(0 2px 4px rgba(47, 164, 92, 0.4));
}
@keyframes d2feeddraw {
  from { stroke-dashoffset: 1; }
  to { stroke-dashoffset: 0; }
}
@media (max-height: 640px), (max-width: 560px) {
  .d2-feed-wrap { gap: 80px; }
  .d2-feed-cell { width: 76px; border-radius: 18px; }
  .d2-feed-emoji { font-size: 44px; }
}

/* ===== YODLAB TOP (6-sahifa): flip-xotira o'yini ===== */
.d2-mem-card {
  background: linear-gradient(180deg, #E4ECF9 0%, #DDE6F5 55%, #D3DFF2 100%);
  justify-content: center;
  gap: clamp(12px, 2.6vh, 26px);
}
.d2-mem-title {
  display: flex; align-items: center; gap: 12px;
  font-size: clamp(24px, 4.4vh, 40px); font-weight: 800;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 999px;
  padding: clamp(6px, 1.2vh, 10px) clamp(18px, 3vw, 30px);
  box-shadow: 0 6px 16px -8px rgba(61, 58, 80, 0.25);
}
.d2-mem-target { font-size: 1.15em; line-height: 1; }
/* 5 katakcha bir qatorda */
.d2-mem-row {
  display: flex; gap: clamp(12px, 2vw, 22px);
  justify-content: center;
}
.d2-mem-cell {
  position: relative;
  width: clamp(96px, 15.5vh, 148px); aspect-ratio: 1;
  background: transparent; border: none; padding: 0; margin: 0;
  cursor: pointer;
  perspective: 500px;
}
.d2-mem-cell:disabled { cursor: default; }
/* 3D flip: ichki qatlam aylanadi, old/orqa yuzlar */
.d2-mem-inner {
  position: absolute; inset: 0;
  transform-style: preserve-3d;
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.d2-mem-cell.cov .d2-mem-inner { transform: rotateY(180deg); }
.d2-mem-face {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 22px;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  font-size: clamp(56px, 9.4vh, 92px); line-height: 1;
  box-shadow: 0 6px 16px -8px rgba(61, 58, 80, 0.3);
}
.d2-mem-face.front { background: #FFFFFF; }
.d2-mem-face.back {
  background: linear-gradient(160deg, #7FB8E8, #4A90E2);
  transform: rotateY(180deg);
  font-size: clamp(40px, 6.6vh, 64px);
}
.d2-mem-cell:not(.cov):not(:disabled):hover .d2-mem-inner,
.d2-mem-cell.cov:not(:disabled):hover .d2-mem-inner { filter: brightness(1.05); }
.d2-mem-cell:not(:disabled):active { transform: scale(0.95); }
/* topilgan katak: yashil yorqin ramka (umumiy qoida) */
.d2-mem-cell.ok .d2-mem-face.front {
  background: #E0F6E8;
  box-shadow: 0 0 0 4px #2FA45C, 0 0 0 8px rgba(47, 164, 92, 0.35), 0 0 26px 6px rgba(80, 220, 130, 0.7);
}
/* yodlash taymeri: 3 nuqta sekin so'nadi */
.d2-mem-dots { display: flex; gap: clamp(10px, 1.8vw, 16px); }
.d2-mem-dot {
  width: clamp(16px, 2.8vh, 26px); aspect-ratio: 1;
  border-radius: 50%;
  background: #B9C6DC;
  opacity: 0.35;
  transition: opacity 0.6s, background 0.6s, transform 0.6s;
}
.d2-mem-dot.on {
  background: #4A90E2;
  opacity: 1;
  transform: scale(1.12);
}
@media (max-height: 640px), (max-width: 560px) {
  .d2-mem-cell { width: 76px; }
  .d2-mem-face { font-size: 44px; border-radius: 16px; }
  .d2-mem-face.back { font-size: 32px; }
}

/* maskot sakrashi — saralash yakunidagi tabrik uchun */
@keyframes d2foxjump {
  0%, 100% { transform: translateY(0); }
  45% { transform: translateY(-26px); }
}

/* ===== MINI-TEST / BONUS HISOBLAGICHI ===== */
.d2-mini-dots {
  display: flex; gap: clamp(8px, 1.6vw, 14px);
  background: rgba(255, 255, 255, 0.85);
  border-radius: 999px;
  padding: clamp(5px, 1vh, 8px) clamp(12px, 2vw, 18px);
  box-shadow: 0 6px 16px -8px rgba(61, 58, 80, 0.25);
}
.d2-mini-dot {
  width: clamp(26px, 4.6vh, 38px); aspect-ratio: 1;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: clamp(13px, 2.2vh, 17px);
  background: #E8E5F0; color: #8B87A0;
  transition: background 0.3s, color 0.3s;
}
.d2-mini-dot.on {
  background: #2FA45C; color: #FFFFFF;
  animation: d2bump 0.5s cubic-bezier(0.34, 1.6, 0.64, 1);
}

/* ===== SARALASH (19-sahifa) ===== */
/* hamma narsa karta ichida ixcham tursin: markazga yig'ilgan, oradagi
   masofa kichik; qutilar ustidagi belgilar endi tashqariga chiqmaydi */
.d2-sort-card {
  justify-content: center;
  gap: clamp(20px, 4.2vh, 46px);
  padding: clamp(8px, 1.6vh, 14px) clamp(14px, 3vw, 28px) clamp(14px, 2.6vh, 24px);
}
.d2-sort-boxes {
  display: flex; gap: clamp(22px, 4vw, 50px);
  justify-content: center; width: 100%;
  /* belgi (badge) qutining tepasidan yarim chiqib turadi — shunga joy */
  padding-top: clamp(30px, 5.4vh, 48px);
}
.d2-box {
  position: relative;
  width: clamp(112px, 19vw, 215px);
  aspect-ratio: 1 / 0.74;
  background: #FFFFFF;
  border-radius: 16px;
  border: 4px solid var(--boxc);
  box-shadow: 0 10px 24px -10px rgba(61, 58, 80, 0.3);
  transition: transform 0.15s, box-shadow 0.15s;
  cursor: pointer;
}
.d2-box.hover { transform: scale(1.06); box-shadow: 0 0 0 5px var(--boxc), 0 14px 30px -10px rgba(61, 58, 80, 0.4); }
.d2-box-lid {
  position: absolute; left: -6%; top: -11px;
  width: 112%; height: 12px;
  border-radius: 6px;
  filter: brightness(1.08);
}
/* quti ustidagi rasmli belgi (MEVA / HAYVON / O'YINCHOQ) —
   qutining tepa chetiga yarim mingan holda turadi */
.d2-box-badge {
  position: absolute; left: 50%; top: 0;
  transform: translate(-50%, -58%);
  width: clamp(42px, 6.8vh, 60px); aspect-ratio: 1;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  padding: 5px;
  box-shadow: 0 6px 14px -6px rgba(61, 58, 80, 0.35), inset 0 0 0 3px rgba(255, 255, 255, 0.7);
  z-index: 1;
}
.d2-box-slot {
  position: absolute; inset: 14px 6px 6px;
  display: flex; align-items: flex-end; justify-content: center; gap: 4px;
  overflow: hidden;
}
.d2-box-item { width: 42%; aspect-ratio: 1; display: inline-flex; }
@keyframes d2popin {
  0% { transform: translateY(-26px) scale(0.6); opacity: 0; }
  70% { transform: translateY(2px) scale(1.08); opacity: 1; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}
.d2-box-item.fade-up { animation: d2popin 0.5s cubic-bezier(0.34, 1.6, 0.64, 1) both; }
.d2-sort-items {
  display: flex; gap: clamp(16px, 3vw, 32px);
  justify-content: center; align-items: center; flex-wrap: wrap;
  width: 100%;
  padding: 0 clamp(44px, 7vw, 64px);  /* chap-pastdagi karnaycha bilan urishmasin */
}
.d2-sort-item {
  width: clamp(72px, 12.5vh, 122px); aspect-ratio: 1;
  border: none; border-radius: 24px; cursor: grab;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 8px 18px -8px rgba(61, 58, 80, 0.3);
  padding: clamp(8px, 1.7vh, 14px);
  transition: transform 0.15s, box-shadow 0.15s, opacity 0.2s;
  touch-action: none;
}
.d2-sort-item:hover { transform: translateY(-3px); }
.d2-sort-item.lift { opacity: 0.35; cursor: grabbing; }
.d2-sort-item.sel {
  box-shadow: 0 0 0 4px #4A90E2, 0 0 18px 4px rgba(74, 144, 226, 0.5);
  animation: d2selbob 1s ease-in-out infinite;
}
@keyframes d2selbob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
.d2-sort-item.done { visibility: hidden; }
.d2-drag-ghost {
  position: fixed; z-index: 95;
  width: clamp(70px, 12vh, 110px); aspect-ratio: 1;
  transform: translate(-50%, -60%) scale(1.15) rotate(-4deg);
  pointer-events: none;
  filter: drop-shadow(0 14px 18px rgba(61, 58, 80, 0.35));
}
/* 6/6 birlashgan tabrik */
.d2-sort-cel {
  position: absolute; inset: 0; z-index: 7;
  display: flex; align-items: center; justify-content: center;
  border-radius: clamp(18px, 2.8vw, 30px);
  background: rgba(255, 255, 255, 0.55);
  overflow: hidden;
  pointer-events: none;
}
.d2-sort-cel-fox {
  width: clamp(150px, 30vh, 260px); display: inline-flex;
  animation: d2foxjump 0.7s cubic-bezier(0.34, 1.4, 0.64, 1) infinite;
}

/* ===== MOTIVATSIYA / SERTIFIKAT ===== */
.d2-final {
  position: relative; flex: 1; overflow: hidden;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: clamp(8px, 1.6vh, 16px);
  padding: 20px; text-align: center;
  background: linear-gradient(180deg, #FFE2EC 0%, #FFF2D9 55%, #FFE9C4 100%);
}
.d2-final.d2-motiv2 { background: linear-gradient(180deg, #D9E4FA 0%, #E6E0F8 55%, #D9CBF2 100%); }
.d2-final-title {
  font-size: clamp(36px, 8vw, 64px); font-weight: 800; color: #FF7043;
  text-shadow: 0 4px 0 #FFFFFF, 0 9px 22px rgba(255, 112, 67, 0.35);
}
.d2-motiv2 .d2-final-title { color: #8E5AE8; text-shadow: 0 4px 0 #FFFFFF, 0 9px 22px rgba(142, 90, 232, 0.35); }
.d2-final-fox { width: clamp(140px, 24vh, 230px); animation: d2bob 2.2s ease-in-out infinite; }
/* katta oltin yulduz ichida hisob */
.d2-motiv-star-wrap {
  position: relative;
  width: clamp(110px, 20vh, 170px); aspect-ratio: 1;
  display: flex; align-items: center; justify-content: center;
  animation: d2twinkle 2.4s ease-in-out infinite;
}
@keyframes d2twinkle { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1) rotate(4deg); } }
.d2-motiv-star { position: absolute; inset: 0; }
.d2-motiv-num {
  position: relative; z-index: 1;
  font-weight: 800; font-size: clamp(26px, 5.4vh, 44px);
  color: #8A5A00; text-shadow: 0 2px 0 rgba(255, 255, 255, 0.6);
  padding-top: clamp(6px, 1.4vh, 12px);
}
/* yarim yo'l chizig'i (motivatsiya #2) */
.d2-path {
  position: relative;
  width: min(78vw, 460px); height: clamp(12px, 2vh, 16px);
  background: #E4DFF2;
  border-radius: 999px;
  box-shadow: inset 0 2px 4px rgba(61, 58, 80, 0.15);
}
.d2-path-fill {
  position: absolute; left: 0; top: 0; bottom: 0;
  width: 50%;
  border-radius: 999px;
  background: linear-gradient(90deg, #4FC46B, #2FA45C);
  box-shadow: 0 0 12px 2px rgba(47, 164, 92, 0.5);
}
.d2-path-flag {
  position: absolute; left: 50%; bottom: 90%;
  width: clamp(22px, 4vh, 32px); aspect-ratio: 24 / 30;
  transform: translateX(-30%);
  display: inline-flex;
}
/* konfetti yomg'iri */
.d2-rain { position: absolute; inset: 0; pointer-events: none; }
.d2-rain i {
  position: absolute; top: -20px;
  width: 10px; height: 14px; border-radius: 3px;
  animation: d2rainfall 3.6s linear infinite;
}
@keyframes d2rainfall {
  0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(105vh) rotate(340deg); opacity: 0.75; }
}
/* sertifikat kartasi */
.d2-cert {
  position: relative; z-index: 1;
  width: min(94vw, 560px);
  background: linear-gradient(180deg, #FFFDF6 0%, #FFF6E2 100%);
  border-radius: clamp(22px, 3.4vw, 34px);
  border: clamp(6px, 1vw, 9px) solid #FFC23C;
  outline: 3px dashed #E0992A;
  outline-offset: -14px;
  box-shadow: 0 24px 55px -18px rgba(61, 58, 80, 0.4);
  display: flex; flex-direction: column; align-items: center;
  gap: clamp(6px, 1.4vh, 14px);
  padding: clamp(18px, 3.4vh, 32px) clamp(18px, 4vw, 36px);
}
.d2-cert-eyebrow {
  font-size: clamp(11px, 1.7vw, 14px); font-weight: 800;
  letter-spacing: 0.18em; color: #8A6B2F;
}
.d2-cert-title {
  font-size: clamp(30px, 6vw, 48px); font-weight: 800; color: #E0992A;
  text-shadow: 0 3px 0 #FFFFFF;
}
.d2-cert-fox { position: relative; width: clamp(120px, 21vh, 190px); }
.d2-cert-medal {
  position: absolute; right: -6%; bottom: -4%;
  width: 34%; aspect-ratio: 60 / 80;
  display: inline-flex;
  animation: d2twinkle 2.6s ease-in-out infinite;
}
.d2-cert-name {
  display: flex; align-items: flex-end; gap: 10px;
  width: 84%;
}
.d2-cert-name-label { font-weight: 800; color: #8A6B2F; font-size: clamp(14px, 2.4vh, 18px); }
.d2-cert-name-line { flex: 1; border-bottom: 3px dashed #C9A96A; height: clamp(20px, 3.4vh, 28px); }
.d2-cert-stars { display: flex; align-items: center; gap: 10px; }
.d2-cert-star { width: clamp(34px, 6vh, 50px); display: inline-flex; }
.d2-cert-count { font-weight: 800; font-size: clamp(24px, 4.6vh, 38px); color: #2FA45C; }
.d2-cert-sub { font-weight: 700; color: #6E6A85; font-size: clamp(13px, 2.2vh, 17px); }
.d2-cert-actions {
  position: relative; z-index: 1;
  display: flex; align-items: center; gap: clamp(10px, 2vw, 18px);
  flex-wrap: wrap; justify-content: center;
}

/* past ekranlarda hamma narsa sig'sin */
@media (max-height: 720px) {
  .d2-odd-item { width: clamp(92px, 17vh, 150px); }
  .d2-cert-fox { width: clamp(96px, 16vh, 150px); }
}

/* ===== REDUCED MOTION ===== */
@media (prefers-reduced-motion: reduce) {
  .d2-root *, .d2-root *::before, .d2-root *::after {
    animation-duration: 0.001s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001s !important;
  }
}
`;
