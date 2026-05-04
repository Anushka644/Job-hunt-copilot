import { useState, useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// THEME — self-contained, no CSS vars needed
// ─────────────────────────────────────────────────────────────────────────────
const T = {
  bg: "#ffffff", bgSurf: "#f8f8f6", bgHover: "#f2f2ef",
  border: "#e6e6e0", borderMid: "#c8c8c0",
  text: "#1a1a18", textMid: "#52524a", textMute: "#98988e",
  accent: "#1a1a18", accentFg: "#ffffff",
  blue: "#1d6fb8", blueBg: "#eaf2fb", blueFg: "#0d4a8a",
  green: "#2d7d46", greenBg: "#e8f5ec", greenFg: "#1a5230",
  amber: "#b87010", amberBg: "#fdf4dc", amberFg: "#7a4d06",
  purple: "#6b4fbb", purpleBg: "#f0ecfc", purpleFg: "#3d2a8a",
  red: "#c0392b", redBg: "#fdecea", redFg: "#8b1a10",
  r: "10px", rSm: "6px", rLg: "16px", rFull: "999px",
  sh: "0 1px 3px rgba(0,0,0,0.07),0 1px 2px rgba(0,0,0,0.04)",
  shMd: "0 4px 16px rgba(0,0,0,0.08),0 2px 4px rgba(0,0,0,0.04)",
};

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE — applications history + coaching notes
// ─────────────────────────────────────────────────────────────────────────────
const APPS_KEY  = "jhc_applications_v1";
const DRAFT_KEY = "jhc_draft_v1";

const getApps  = () => { try { return JSON.parse(localStorage.getItem(APPS_KEY)||"[]"); } catch { return []; } };
const saveApp  = (app) => {
  const apps = getApps();
  const updated = [app, ...apps].slice(0, 20);
  localStorage.setItem(APPS_KEY, JSON.stringify(updated));
};
const getDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)||"null"); } catch { return null; } };
const saveDraft = (d) => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch {} };
const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch {} };

// ─────────────────────────────────────────────────────────────────────────────
// FULL APPLICATION PERSISTENCE — stores all generated fields with stable keys
// ─────────────────────────────────────────────────────────────────────────────
const FULL_APPS_KEY = "applications";

const getFullApps = () => {
  try { return JSON.parse(localStorage.getItem(FULL_APPS_KEY) || "[]"); }
  catch { return []; }
};

function saveApplication({ res, role, company, fitLevel }) {
  const record = {
    id:           Date.now(),
    createdAt:    new Date().toISOString(),
    role:         role || "",
    company:      company || "",
    fit:          fitLevel || "",
    summary:      res.rewritten_summary || "",
    bullets:      Array.isArray(res.all_bullets) ? res.all_bullets : [],
    bulletAnnotations: Array.isArray(res.bullet_annotations) ? res.bullet_annotations : [],
    coverLetter:  res.cover_letter_opener || "",
    interviewPrep: Array.isArray(res.interview_questions) ? res.interview_questions : [],
    coachingNote: res.session_observation || "",
    sessionClose: res.session_close || "",
    quickWinBullet: res.quick_win_bullet || "",
    quickWinExplanation: res.quick_win_explanation || "",
    gapStrengths: Array.isArray(res.gap_strengths) ? res.gap_strengths : [],
    gapImprovements: Array.isArray(res.gap_improvements) ? res.gap_improvements : [],
  };
  const existing = getFullApps();
  localStorage.setItem(FULL_APPS_KEY, JSON.stringify([record, ...existing].slice(0, 30)));
}

// ─────────────────────────────────────────────────────────────────────────────
// API KEY — stored in localStorage, never sent to any server except Groq
// ─────────────────────────────────────────────────────────────────────────────
const GROQ_KEY_SK = "jhc_groq_key";
const getGroqKey  = () => { try { return localStorage.getItem(GROQ_KEY_SK) || ""; } catch { return ""; } };
const saveGroqKey = (k) => { try { localStorage.setItem(GROQ_KEY_SK, k.trim()); } catch {} };
const clearGroqKey = () => { try { localStorage.removeItem(GROQ_KEY_SK); } catch {} };

// ─────────────────────────────────────────────────────────────────────────────
// API — Groq (OpenAI-compatible endpoint, free tier)
// Model: llama-3.3-70b-versatile
// ─────────────────────────────────────────────────────────────────────────────
async function callClaude(messages, system) {
  const key = getGroqKey();
  if (!key) throw new Error("No API key");
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1800,
      messages: [
        { role: "system", content: system },
        ...messages,
      ],
    }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API ${r.status}`);
  }
  const d = await r.json();
  const t = d.choices?.[0]?.message?.content || "";
  try { return JSON.parse(t.replace(/```json[\s\S]*?```|```[\s\S]*?```/g, "").trim()); }
  catch { const m = t.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); throw new Error("Parse failed"); }
}

// ─── SYSTEM PROMPTS ───────────────────────────────────────────────────────────
// S1: analysis — observation + ALL clarifying questions at once
const S1 = `You are Job Hunt Copilot, a sharp career coach for fresh graduates. The user submitted their resume/experience and a job description.

Your job in this response:
1. Write ONE specific "first impression" observation proving you read their content. Name something specific from their resume, connect it to a JD requirement, note one improvement opportunity. 2-3 sentences. Warm and direct.
2. Assess fit: strong / moderate / stretch — based on how well the resume maps to the JD requirements.
3. Write a 1-sentence fit rationale explaining the score.
4. Generate 2-3 clarifying questions to ask the user SIMULTANEOUSLY (not one at a time). Each question must have a one-sentence hiring-logic reason. Focus on gaps between resume and JD, or experiences that need more detail.

Return ONLY valid JSON:
{
  "observation": "...",
  "fit_level": "strong" | "moderate" | "stretch",
  "fit_rationale": "...",
  "questions": [
    {"question": "...", "reason": "Because [hiring logic]"},
    {"question": "...", "reason": "Because [hiring logic]"}
  ]
}`;

// S2: generation — full tailored output
const S2 = `You are Job Hunt Copilot generating a tailored job application. 

CRITICAL RULES:
- Only use information the user explicitly provided. Never fabricate metrics, skills, or outcomes.
- Use [ADD: specific detail needed] as a placeholder where user should fill in.
- Every bullet must start with a strong action verb.
- Explanations must reference the specific JD requirement each bullet addresses — this is the core differentiator.

Return ONLY valid JSON:
{
  "quick_win_bullet": "Single strongest bullet",
  "quick_win_explanation": "Exactly why this works for THIS role (cite the JD requirement it addresses)",
  "all_bullets": ["bullet 1","bullet 2","bullet 3","bullet 4"],
  "rewritten_summary": "2-3 sentence tailored professional summary opening with strongest positioning",
  "bullet_annotations": ["JD requirement addressed + why this framing works","...","...","..."],
  "cover_letter_opener": "One strong opening paragraph for a cover letter — conversational, specific, not generic",
  "gap_strengths": ["What you did well in framing your experience","Second strength"],
  "gap_improvements": ["One specific thing to develop or add for roles like this","Second improvement"],
  "interview_questions": ["Likely interview question based on bullet 1","Likely question based on bullet 2","Likely question based on bullet 3"],
  "session_observation": "One specific pattern about how this user describes their experience — what they consistently do or miss. Actionable.",
  "session_close": "Warm, specific, forward-looking close referencing the observation"
}`;

// S3: refinement
const S3 = `You are Job Hunt Copilot. Refine the bullets exactly as requested. Only use information from the conversation. Never fabricate.
Return ONLY valid JSON: {"refined_bullets":["...","...","...","..."]}`;

// ─────────────────────────────────────────────────────────────────────────────
// ICONS
// ─────────────────────────────────────────────────────────────────────────────
const Svg = ({ d, s = 16, sw = 1.75, fill = "none", vb = "0 0 24 24" }) => (
  <svg width={s} height={s} viewBox={vb} fill={fill} stroke="currentColor" strokeWidth={sw}
    strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}>
    <path d={d} />
  </svg>
);
const IArrow    = ({ s }) => <Svg s={s} d="M5 12h14M12 5l7 7-7 7" />;
const ICheck    = ({ s }) => <Svg s={s} d="M20 6L9 17l-5-5" />;
const ICopy     = ({ s }) => <Svg s={s} d="M8 4H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2M8 4a2 2 0 012-2h4a2 2 0 012 2M8 4h8" />;
const IRefresh  = ({ s }) => <Svg s={s} d="M1 4v6h6M3.51 15a9 9 0 102.13-9.36L1 10" />;
const IChevD    = ({ s }) => <Svg s={s} d="M6 9l6 6 6-6" />;
const IChevU    = ({ s }) => <Svg s={s} d="M18 15l-6-6-6 6" />;
const IClose    = ({ s }) => <Svg s={s} d="M18 6L6 18M6 6l12 12" />;
const IHistory  = ({ s }) => <Svg s={s} d="M12 8v4l3 3M3.05 11a9 9 0 109.9-8.95" />;
const IDoc      = ({ s }) => <Svg s={s} d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6M16 13H8M16 17H8M10 9H8" />;
const IBriefcase= ({ s }) => <Svg s={s} d="M20 7H4a2 2 0 00-2 2v11a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />;
const IZap      = ({ s }) => <Svg s={s} d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />;
const IStar     = ({ s }) => <svg width={s||16} height={s||16} viewBox="0 0 24 24" fill="currentColor" stroke="none" style={{ display: "block", flexShrink: 0 }}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>;
const IPlus     = ({ s }) => <Svg s={s} d="M12 5v14M5 12h14" />;
const IChat     = ({ s }) => <Svg s={s} d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />;
const ITarget   = ({ s }) => <Svg s={s} d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 18a6 6 0 100-12 6 6 0 000 12zM12 14a2 2 0 100-4 2 2 0 000 4z" />;
const IDownload = ({ s }) => <Svg s={s} d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />;

// ─────────────────────────────────────────────────────────────────────────────
// BASE COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function Card({ children, hi, flat, style = {} }) {
  const base = flat
    ? { background: T.bgSurf, borderRadius: T.r, padding: "16px 20px" }
    : { background: T.bg, border: `1px solid ${hi ? T.blue : T.border}`, borderRadius: T.rLg, padding: "20px", boxShadow: hi ? T.shMd : T.sh };
  if (hi) base.borderWidth = "1.5px";
  return <div style={{ ...base, ...style }}>{children}</div>;
}

function Badge({ children, color = "gray", dot }) {
  const map = {
    gray:   { bg: T.bgSurf,    fg: T.textMid },
    green:  { bg: T.greenBg,   fg: T.greenFg },
    blue:   { bg: T.blueBg,    fg: T.blueFg },
    amber:  { bg: T.amberBg,   fg: T.amberFg },
    purple: { bg: T.purpleBg,  fg: T.purpleFg },
    red:    { bg: T.redBg,     fg: T.redFg },
  };
  const { bg, fg } = map[color] || map.gray;
  return (
    <span style={{ background: bg, color: fg, fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: T.rFull, letterSpacing: "0.02em", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "5px" }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: fg, display: "inline-block" }} />}
      {children}
    </span>
  );
}

function FitBadge({ level }) {
  const map = { strong: ["green", "Strong fit"], moderate: ["amber", "Moderate fit"], stretch: ["red", "Stretch role"] };
  const [color, label] = map[level] || map.moderate;
  return <Badge color={color} dot>{label}</Badge>;
}

function Btn({ children, onClick, disabled, loading: btnLoading, variant = "primary", size = "md", full, style = {} }) {
  const [hov, setHov] = useState(false);
  const isDisabled = disabled || btnLoading;
  const sz = size === "sm" ? { padding: "6px 14px", fontSize: "13px" } : size === "lg" ? { padding: "11px 22px", fontSize: "14px" } : { padding: "9px 18px", fontSize: "14px" };
  const vs = {
    primary: { background: isDisabled ? T.bgSurf : T.accent, color: isDisabled ? T.textMute : T.accentFg, border: "none" },
    ghost:   { background: "transparent", color: T.textMid, border: `1px solid ${T.border}` },
    blue:    { background: T.blueBg, color: T.blueFg, border: `1px solid rgba(29,111,184,0.2)` },
    green:   { background: T.greenBg, color: T.greenFg, border: "none" },
  };
  const hoverTransform = hov && !isDisabled && variant === "primary"
    ? { transform: "translateY(-1px)", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }
    : { transform: "translateY(0px)", boxShadow: "none" };
  return (
    <button disabled={isDisabled} onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ ...sz, ...vs[variant], ...hoverTransform, borderRadius: T.r, fontWeight: 500, cursor: isDisabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: "8px", transition: "all 0.18s ease", opacity: isDisabled ? 0.45 : 1, fontFamily: "inherit", width: full ? "100%" : undefined, justifyContent: full ? "center" : undefined, ...style }}>
      {btnLoading ? (
        <>
          <style>{`@keyframes btnSpin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "rgba(255,255,255,0.9)", borderRadius: "50%", animation: "btnSpin 0.7s linear infinite", flexShrink: 0 }} />
          Generating your application...
        </>
      ) : children}
    </button>
  );
}

function TextArea({ value, onChange, placeholder, minH = 120, style = {}, autoSave }) {
  function handleChange(e) {
    onChange(e.target.value);
    if (autoSave) autoSave(e.target.value);
  }
  return (
    <textarea value={value} onChange={handleChange} placeholder={placeholder}
      onFocus={e => { e.target.style.borderColor = T.blue; e.target.style.boxShadow = `0 0 0 3px ${T.blueBg}`; }}
      onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = "none"; }}
      style={{ width: "100%", boxSizing: "border-box", minHeight: minH, resize: "vertical", fontSize: "14px", lineHeight: 1.75, border: `1px solid ${T.border}`, borderRadius: T.r, padding: "14px 16px", background: T.bg, color: T.text, fontFamily: "inherit", outline: "none", transition: "border-color 0.15s, box-shadow 0.15s", ...style }} />
  );
}

// ── Progress-based staged loader with animated step transitions ──────────────
const ANALYSE_STEPS = [
  { label: "Understanding your experience", sub: "Reading resume and background..." },
  { label: "Matching with job requirements", sub: "Mapping skills to the JD..." },
  { label: "Generating tailored bullets", sub: "Crafting role-specific framing..." },
  { label: "Polishing the output", sub: "Final review underway..." },
];
const GENERATE_STEPS = [
  { label: "Understanding your answers", sub: "Processing your context..." },
  { label: "Tailoring every bullet", sub: "Grounding each line in the JD..." },
  { label: "Writing your summary", sub: "Opening with your strongest angle..." },
  { label: "Adding coaching notes", sub: "Building your improvement loop..." },
];

function Loader({ phase }) {
  const steps = phase === "generate" ? GENERATE_STEPS : ANALYSE_STEPS;
  const [stepIdx, setStepIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setStepIdx(0); setVisible(true);
    const timers = steps.slice(1).map((_, i) =>
      setTimeout(() => {
        setVisible(false);
        setTimeout(() => { setStepIdx(i + 1); setVisible(true); }, 200);
      }, (i + 1) * 3000)
    );
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  const step = steps[stepIdx] || steps[steps.length - 1];
  const pct = Math.round(((stepIdx + 1) / steps.length) * 100);

  return (
    <div style={{ padding: "24px 0" }}>
      <style>{`
        @keyframes jhcPulse{0%,100%{opacity:.25}50%{opacity:1}}
        @keyframes jhcProgressIn{from{width:0}to{width:100%}}
        @keyframes jhcFadeUp{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* Step dots */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "20px" }}>
        {steps.map((_, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{
              width: i === stepIdx ? "22px" : "8px", height: "8px", borderRadius: "4px",
              background: i < stepIdx ? T.green : i === stepIdx ? T.accent : T.border,
              transition: "all 0.3s ease", flexShrink: 0,
            }} />
            {i < steps.length - 1 && <div style={{ width: "20px", height: "1.5px", background: i < stepIdx ? T.green : T.border, transition: "background 0.3s" }} />}
          </div>
        ))}
        <span style={{ fontSize: "11px", color: T.textMute, marginLeft: "8px", fontWeight: 600 }}>{pct}%</span>
      </div>

      {/* Active step text */}
      <div style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(4px)", transition: "all 0.2s ease" }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: T.text, marginBottom: "4px" }}>{step.label}</div>
        <div style={{ fontSize: "12px", color: T.textMute }}>{step.sub}</div>
      </div>

      {/* Animated progress bar */}
      <div style={{ marginTop: "16px", height: "3px", background: T.border, borderRadius: "2px", overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: "2px", background: T.accent, width: `${pct}%`, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function CopyBtn({ text, label }) {
  const [done, setDone] = useState(false);
  function go() { navigator.clipboard.writeText(text).catch(() => {}); setDone(true); setTimeout(() => setDone(false), 1800); }
  return (
    <button onClick={go} title="Copy to clipboard"
      style={{ background: done ? T.greenBg : "transparent", color: done ? T.greenFg : T.textMute, border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", fontWeight: 500, padding: "5px 8px", borderRadius: T.rSm, transition: "all 0.15s", fontFamily: "inherit", flexShrink: 0 }}>
      {done ? <ICheck s={13} /> : <ICopy s={13} />}
      {label && <span>{done ? "Copied!" : label}</span>}
    </button>
  );
}

// "Why this works" — collapsible; pass startOpen=true for first instance
function WhyItWorks({ text, startOpen = false }) {
  const [collapsed, setCollapsed] = useState(!startOpen);
  return (
    <div style={{ marginTop: "12px", background: T.blueBg, borderRadius: T.rSm, padding: "10px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: collapsed ? 0 : "6px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, color: T.blueFg, letterSpacing: "0.04em" }}>WHY THIS WORKS (WHAT RECRUITERS NOTICE)</span>
        <button onClick={() => setCollapsed(c => !c)} style={{ background: "none", border: "none", cursor: "pointer", color: T.blue, padding: 0, display: "flex" }}>
          {collapsed ? <IChevD s={13} /> : <IChevU s={13} />}
        </button>
      </div>
      {!collapsed && <p style={{ fontSize: "12px", color: T.blueFg, margin: 0, lineHeight: 1.75 }}>{text}</p>}
    </div>
  );
}

function Divider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "24px 0" }}>
      <div style={{ flex: 1, height: "1px", background: T.border }} />
      {label && <span style={{ fontSize: "11px", color: T.textMute, fontWeight: 600, letterSpacing: "0.05em" }}>{label}</span>}
      <div style={{ flex: 1, height: "1px", background: T.border }} />
    </div>
  );
}

// Character quality signal on textareas
function QualityHint({ length, thresholds = [50, 200, 400] }) {
  if (length === 0) return null;
  const [lo, med, hi] = thresholds;
  if (length < lo)  return <span style={{ fontSize: "11px", color: T.amber }}>Add more detail for better results</span>;
  if (length < med) return <span style={{ fontSize: "11px", color: T.textMute }}>Good start — more context helps</span>;
  if (length < hi)  return <span style={{ fontSize: "11px", color: T.green }}>Great amount of detail</span>;
  return <span style={{ fontSize: "11px", color: T.green }}>Excellent — this will produce strong output</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOME / DASHBOARD SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function HomeCTABtn({ onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width: "100%", background: T.accent, color: T.accentFg, border: "none", borderRadius: T.r, padding: "13px 20px", fontSize: "14px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "20px", fontFamily: "inherit", transition: "all 0.18s ease", transform: hov ? "translateY(-1px)" : "translateY(0)", boxShadow: hov ? "0 6px 16px rgba(0,0,0,0.18)" : "0 1px 3px rgba(0,0,0,0.1)" }}>
      <IZap s={15} /> Tailor a new application
    </button>
  );
}

function HomeScreen({ onNewApp, onViewApp }) {
  const apps = getApps();
  const thisWeek = apps.filter(a => Date.now() - new Date(a.date) < 7 * 86400000).length;
  const latestNote = apps.find(a => a.session_observation)?.session_observation;

  return (
    <div>
      {/* Coaching note — if exists, show first */}
      {latestNote && (
        <div style={{ background: T.amberBg, border: `1px solid rgba(184,112,16,0.2)`, borderRadius: T.r, padding: "12px 16px", marginBottom: "20px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <IStar s={14} style={{ color: T.amber, flexShrink: 0, marginTop: "1px" }} />
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: T.amber, letterSpacing: "0.04em", marginBottom: "3px" }}>FROM LAST SESSION</div>
            <p style={{ fontSize: "13px", color: T.amberFg, margin: 0, lineHeight: 1.6 }}>{latestNote}</p>
          </div>
        </div>
      )}

      {/* Stats — only when there are apps */}
      {apps.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "20px" }}>
          {[
            ["Applications", apps.length],
            ["This week", thisWeek],
            ["Roles", [...new Set(apps.map(a => a.role).filter(Boolean))].length || apps.length],
          ].map(([label, value]) => (
            <div key={label} style={{ background: T.bgSurf, borderRadius: T.r, padding: "12px 14px" }}>
              <div style={{ fontSize: "11px", color: T.textMute, fontWeight: 500, marginBottom: "4px" }}>{label}</div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: T.text, lineHeight: 1 }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state — stronger onboarding */}
      {apps.length === 0 && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 0" }}>
          <div style={{ background: T.bgSurf, borderRadius: T.rLg, padding: "36px 32px", textAlign: "center", width: "100%" }}>
            <div style={{ width: "44px", height: "44px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.r, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: T.textMid }}>
              <IZap s={20} />
            </div>
            <p style={{ fontSize: "17px", color: T.text, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.01em" }}>Start your job hunt system</p>
            <p style={{ fontSize: "13px", color: T.textMid, margin: "0 0 20px", lineHeight: 1.65, maxWidth: "260px", marginLeft: "auto", marginRight: "auto" }}>
              Tailored bullets and a cover letter opener in under 2 minutes — and it gets smarter every session.
            </p>
            <div style={{ textAlign: "left", display: "inline-flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
              {[
                ["Get bullets tailored to the exact JD", T.green],
                ["Understand why each line works", T.blue],
                ["Build a coaching note across sessions", T.amber],
              ].map(([text, color]) => (
                <div key={text} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: color + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <ICheck s={10} />
                  </div>
                  <span style={{ fontSize: "13px", color: T.textMid }}>{text}</span>
                </div>
              ))}
            </div>
            <div>
              <Btn variant="primary" size="lg" onClick={onNewApp}>
                <IZap s={14} /> Tailor my first application
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* CTA — only when apps exist */}
      {apps.length > 0 && (
        <HomeCTABtn onClick={onNewApp} />
      )}

      {/* Recent applications */}
      {apps.length > 0 && (
        <div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: T.textMute, letterSpacing: "0.05em", marginBottom: "10px" }}>RECENT</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {apps.slice(0, 5).map((app, i) => {
              const age = Math.round((Date.now() - new Date(app.date)) / 86400000);
              const ageStr = age === 0 ? "Today" : age === 1 ? "Yesterday" : `${age}d ago`;
              return (
                <button key={i} onClick={() => onViewApp(app)}
                  style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.r, padding: "12px 14px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: "10px", transition: "border-color 0.15s, background 0.15s", fontFamily: "inherit", width: "100%" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = T.borderMid; e.currentTarget.style.background = T.bgSurf; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.bg; }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: T.rSm, background: T.bgSurf, display: "flex", alignItems: "center", justifyContent: "center", color: T.textMute, flexShrink: 0 }}>
                    <IDoc s={14} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {app.role || "Untitled"}{app.company ? ` · ${app.company}` : ""}
                    </div>
                    <div style={{ fontSize: "11px", color: T.textMute, marginTop: "2px" }}>{ageStr}</div>
                  </div>
                  {app.fit_level && <FitBadge level={app.fit_level} />}
                  <div style={{ color: T.textMute, flexShrink: 0 }}><IArrow s={13} /></div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STICKY SUBMIT BUTTON — animated, responds to canGo state
// ─────────────────────────────────────────────────────────────────────────────
function StickySubmitBtn({ canGo, onClick }) {
  const [hov, setHov] = useState(false);
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={!canGo}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        background: canGo ? T.accent : T.bgSurf,
        color: canGo ? T.accentFg : T.textMute,
        border: "none", borderRadius: T.r,
        padding: "12px 24px", fontSize: "14px", fontWeight: 600,
        cursor: canGo ? "pointer" : "not-allowed",
        display: "inline-flex", alignItems: "center", gap: "8px",
        fontFamily: "inherit",
        transition: "all 0.18s ease",
        transform: pressed ? "scale(0.97)" : hov && canGo ? "translateY(-1px)" : "none",
        boxShadow: canGo
          ? pressed ? "0 1px 4px rgba(0,0,0,0.1)" : hov ? "0 6px 20px rgba(0,0,0,0.18)" : "0 2px 8px rgba(0,0,0,0.12)"
          : "none",
        opacity: canGo ? 1 : 0.5,
      }}>
      <IZap s={15} /> Tailor this application
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INPUT SCREEN — simplified, no path selection, Path A by default
// "No resume" is a secondary option
// ─────────────────────────────────────────────────────────────────────────────
function InputScreen({ onSubmit, loading, loadPhase }) {
  const draft = getDraft() || {};
  const [resume, setResume]     = useState(draft.resume || "");
  const [jd, setJd]             = useState(draft.jd || "");
  const [noResume, setNoResume] = useState(draft.noResume || false);
  const [company, setCompany]   = useState(draft.company || "");
  const [role, setRole]         = useState(draft.role || "");

  // Auto-save draft on every keystroke — never lose a paste
  useEffect(() => {
    saveDraft({ resume, jd, noResume, company, role });
  }, [resume, jd, noResume, company, role]);

  const canGo = noResume ? jd.trim().length > 30 : resume.trim().length > 20 && jd.trim().length > 30;

  function submit() {
    if (!canGo || loading) return;
    onSubmit({ resume, jd, noResume, company, role });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
  }

  // Intelligence preview — heuristic analysis of JD + resume overlap
  const jdPreview = (() => {
    if (jd.trim().length < 60) return null;
    const lower = jd.toLowerCase();
    const resumeLower = resume.toLowerCase();

    const allSkills = ["python","sql","react","java","typescript","javascript","figma","excel","tableau","jira","aws","gcp","azure","node","django","flask","spark","kubernetes","docker","postgres","mongodb","redis","kafka","tensorflow","pytorch"];
    const jdSkills = allSkills.filter(s => lower.includes(s));
    const resumeSkills = allSkills.filter(s => resumeLower.includes(s));
    const matched = jdSkills.filter(s => resumeSkills.includes(s));
    const missing = jdSkills.filter(s => !resumeSkills.includes(s));

    const seniorityMap = [["senior","Senior"],["lead","Lead"],["junior","Junior"],["intern","Intern"],["entry","Entry-level"],["manager","Manager"],["director","Director"],["principal","Principal"]];
    const seniority = seniorityMap.find(([k]) => lower.includes(k))?.[1] || null;

    // Detect role from JD
    const roleKeywords = [["product manager","Product Manager"],["software engineer","Software Engineer"],["data scientist","Data Scientist"],["data analyst","Data Analyst"],["frontend","Frontend Engineer"],["backend","Backend Engineer"],["fullstack","Fullstack Engineer"],["designer","Designer"],["marketing","Marketing"],["operations","Operations"],["finance","Finance"]];
    const detectedRole = roleKeywords.find(([k]) => lower.includes(k))?.[1] || null;

    // Simple fit estimate
    let fitEst = "Analysing...";
    if (jdSkills.length > 0) {
      const overlap = matched.length / Math.min(jdSkills.length, 6);
      fitEst = overlap >= 0.6 ? "Likely strong" : overlap >= 0.3 ? "Moderate — gaps exist" : "Stretch — prepare your framing";
    }

    return { skills: jdSkills.slice(0, 5), matched, missing: missing.slice(0, 3), seniority, detectedRole, fitEst };
  })();

  const sectionCard = { background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.rLg, padding: "18px 20px", marginBottom: "14px", boxShadow: T.sh };
  const fieldLabel = { fontSize: "12px", fontWeight: 600, color: T.textMid, display: "block", marginBottom: "6px", letterSpacing: "0.04em", textTransform: "uppercase" };

  return (
    <div onKeyDown={handleKeyDown}>

      {/* Section 1: Role + Company */}
      <div style={sectionCard}>
        <div style={{ fontSize: "11px", fontWeight: 700, color: T.textMute, letterSpacing: "0.06em", marginBottom: "14px" }}>TARGET ROLE</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          {[
            ["Role", role, setRole, "e.g. Product Manager"],
            ["Company", company, setCompany, "e.g. Stripe"],
          ].map(([lbl, val, setter, ph]) => (
            <div key={lbl}>
              <label style={fieldLabel}>{lbl}</label>
              <input value={val} onChange={e => setter(e.target.value)} placeholder={ph}
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: "14px", border: `1px solid ${T.border}`, borderRadius: T.r, background: T.bg, color: T.text, fontFamily: "inherit", outline: "none", transition: "border-color 0.15s, box-shadow 0.15s" }}
                onFocus={e => { e.target.style.borderColor = T.blue; e.target.style.boxShadow = `0 0 0 3px ${T.blueBg}`; }}
                onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = "none"; }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Resume */}
      {!noResume && (
        <div style={sectionCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: T.textMute, letterSpacing: "0.06em" }}>YOUR EXPERIENCE</div>
            <QualityHint length={resume.trim().length} />
          </div>
          <TextArea value={resume} onChange={setResume} minH={150}
            placeholder="Paste your resume, CV, or rough bullet points — internships, projects, coursework, part-time work. Rough notes are fine." />
          <p style={{ fontSize: "12px", color: T.textMid, margin: "10px 0 0", lineHeight: 1.5 }}>
            💡 Include numbers, tools, and outcomes (e.g. <em>improved onboarding by 30%, built with React + Postgres</em>)
          </p>
          <button onClick={() => setNoResume(true)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: T.textMute, padding: "10px 0 0", fontFamily: "inherit", textDecoration: "underline" }}>
            I don't have a resume ready
          </button>
        </div>
      )}

      {noResume && (
        <div style={{ ...sectionCard, background: T.bgSurf }}>
          <p style={{ fontSize: "13px", color: T.textMid, margin: "0 0 10px", lineHeight: 1.6 }}>
            No problem — paste the JD below and I'll ask you a few targeted questions about your experience.
          </p>
          <button onClick={() => setNoResume(false)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: T.textMute, padding: 0, fontFamily: "inherit", textDecoration: "underline" }}>
            I do have a resume after all
          </button>
        </div>
      )}

      {/* Section 3: Job Description */}
      <div style={sectionCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: T.textMute, letterSpacing: "0.06em" }}>JOB DESCRIPTION</div>
          <QualityHint length={jd.trim().length} thresholds={[50, 300, 600]} />
        </div>
        <TextArea value={jd} onChange={setJd} minH={160}
          placeholder="Paste the full job description here. The more complete, the more precisely I can tailor your application." />
        <p style={{ fontSize: "12px", color: T.textMid, margin: "10px 0 0", lineHeight: 1.5 }}>
          💡 Paste full job description — key signals (skills, seniority, must-haves) will be extracted automatically
        </p>

        {/* Intelligence card — role + skill match + fit estimate */}
        {jdPreview && (jdPreview.skills.length > 0 || jdPreview.seniority || jdPreview.detectedRole) && (
          <div style={{ marginTop: "14px", background: T.bg, borderRadius: T.r, border: `1px solid ${T.border}`, overflow: "hidden", animation: "jhcFadeIn 0.25s ease" }}>
            {/* Header row */}
            <div style={{ background: T.blueBg, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid rgba(29,111,184,0.12)` }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <ITarget s={13} />
                <span style={{ fontSize: "11px", fontWeight: 700, color: T.blueFg, letterSpacing: "0.04em" }}>
                  {jdPreview.detectedRole ? `Detected: ${jdPreview.detectedRole}` : "JD ANALYSIS"}
                  {jdPreview.seniority ? ` · ${jdPreview.seniority}` : ""}
                </span>
              </div>
              <span style={{
                fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: T.rFull,
                background: jdPreview.fitEst.includes("strong") ? T.greenBg : jdPreview.fitEst.includes("Stretch") ? T.redBg : T.amberBg,
                color: jdPreview.fitEst.includes("strong") ? T.greenFg : jdPreview.fitEst.includes("Stretch") ? T.redFg : T.amberFg,
              }}>{jdPreview.fitEst}</span>
            </div>
            {/* Skill rows */}
            <div style={{ padding: "10px 14px" }}>
              {jdPreview.matched.length > 0 && (
                <div style={{ marginBottom: "8px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: T.greenFg, letterSpacing: "0.04em", marginBottom: "5px" }}>MATCHED FROM YOUR RESUME</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                    {jdPreview.matched.map(s => (
                      <span key={s} style={{ background: T.greenBg, color: T.greenFg, fontSize: "11px", fontWeight: 500, padding: "2px 9px", borderRadius: T.rFull, textTransform: "capitalize" }}>✓ {s}</span>
                    ))}
                  </div>
                </div>
              )}
              {jdPreview.missing.length > 0 && (
                <div>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: T.amberFg, letterSpacing: "0.04em", marginBottom: "5px" }}>MENTIONED IN JD, NOT IN RESUME</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                    {jdPreview.missing.map(s => (
                      <span key={s} style={{ background: T.amberBg, color: T.amberFg, fontSize: "11px", fontWeight: 500, padding: "2px 9px", borderRadius: T.rFull, textTransform: "capitalize" }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {jdPreview.matched.length === 0 && jdPreview.missing.length === 0 && jdPreview.skills.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                  {jdPreview.skills.map(s => (
                    <span key={s} style={{ background: T.blueBg, color: T.blueFg, fontSize: "11px", fontWeight: 500, padding: "2px 9px", borderRadius: T.rFull, textTransform: "capitalize" }}>{s}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Pre-action confidence block — shown when form is complete */}
      {canGo && !loading && (
        <div style={{ background: T.bgSurf, borderRadius: T.r, padding: "14px 16px", marginBottom: "14px", border: `1px solid ${T.border}`, animation: "jhcFadeIn 0.2s ease" }}>
          <style>{`@keyframes jhcFadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}`}</style>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: T.text }}>You'll get:</span>
            <span style={{ fontSize: "11px", color: T.textMute, background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.rFull, padding: "2px 10px" }}>~90 seconds</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {[
              ["Tailored bullets matched to this JD", T.green],
              ["A rewritten professional summary", T.blue],
              ["Explanation for why each line works", T.purple],
              ["Cover letter opener + interview questions", T.amber],
            ].map(([item, col]) => (
              <div key={item} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "16px", height: "16px", borderRadius: "50%", background: col + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <ICheck s={9} />
                </div>
                <span style={{ fontSize: "12px", color: T.textMid }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sticky CTA — shadow separates from form content */}
      <div style={{ position: "sticky", bottom: 0, background: T.bg, paddingTop: "12px", paddingBottom: "4px", marginTop: "4px", boxShadow: canGo && !loading ? "0 -8px 24px rgba(0,0,0,0.06)" : "none", transition: "box-shadow 0.2s" }}>
        {loading ? <Loader phase={loadPhase} /> : (
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <StickySubmitBtn canGo={canGo} onClick={submit} />
            {!canGo && (
              <span style={{ fontSize: "12px", color: T.textMute }}>
                {!noResume && resume.trim().length < 20 ? "Add your experience to continue" : "Add a job description to continue"}
              </span>
            )}
          </div>
        )}
        {!loading && <p style={{ fontSize: "11px", color: T.textMute, margin: "8px 0 0" }}>⌘ + Enter to submit</p>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYSIS SCREEN — fit score + first impression + ALL questions at once
// ─────────────────────────────────────────────────────────────────────────────
function AnalysisScreen({ analysis, onSubmitAnswers, loading, loadPhase }) {
  const [answers, setAnswers] = useState(
    (analysis.questions || []).map(() => "")
  );

  const canSubmit = answers.every(a => a.trim().length > 5);

  function submit() {
    if (!canSubmit || loading) return;
    onSubmitAnswers(answers);
  }

  return (
    <div>
      {/* Fit score — prominent, above the fold */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px 20px", background: T.bgSurf, borderRadius: T.r, marginBottom: "20px", border: `1px solid ${T.border}` }}>
        <ITarget s={20} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            <span style={{ fontSize: "14px", fontWeight: 600, color: T.text }}>Fit assessment</span>
            <FitBadge level={analysis.fit_level} />
          </div>
          <p style={{ fontSize: "13px", color: T.textMid, margin: "0 0 4px", lineHeight: 1.55 }}>{analysis.fit_rationale}</p>
          <p style={{ fontSize: "11px", color: T.textMute, margin: 0, lineHeight: 1.5 }}>Based on match across skills, tools, and experience depth</p>
        </div>
      </div>

      {/* First impression */}
      <Card hi style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
          <div style={{ flexShrink: 0, width: "36px", height: "36px", borderRadius: "50%", background: T.blueBg, display: "flex", alignItems: "center", justifyContent: "center", color: T.blue }}>
            <IStar s={16} />
          </div>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: T.blue, letterSpacing: "0.04em", marginBottom: "8px" }}>FIRST IMPRESSION</div>
            <p style={{ fontSize: "15px", color: T.text, lineHeight: 1.75, margin: 0 }}>{analysis.observation}</p>
          </div>
        </div>
      </Card>

      {/* ALL questions at once — no sequential API roundtrips */}
      {(analysis.questions || []).length > 0 && (
        <div>
          <div style={{ fontSize: "13px", color: T.textMid, marginBottom: "20px", lineHeight: 1.6 }}>
            Answer {analysis.questions.length === 1 ? "this question" : `these ${analysis.questions.length} questions`} to get your tailored output:
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginBottom: "24px" }}>
            {(analysis.questions || []).map((q, i) => (
              <div key={i}>
                <div style={{ marginBottom: "8px" }}>
                  <p style={{ fontSize: "14px", fontWeight: 600, color: T.text, margin: "0 0 4px", lineHeight: 1.5 }}>{q.question}</p>
                  <p style={{ fontSize: "12px", color: T.textMid, margin: 0, fontStyle: "italic" }}>{q.reason}</p>
                </div>
                <TextArea value={answers[i]} onChange={v => setAnswers(ans => ans.map((a, j) => j === i ? v : a))}
                  placeholder="Your answer..." minH={80} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            {loading ? <Loader phase={loadPhase} /> : (
              <>
                <Btn variant="primary" size="lg" onClick={submit} disabled={!canSubmit} loading={false}>
                  Generate my application <IArrow s={15} />
                </Btn>
                {!canSubmit && <span style={{ fontSize: "12px", color: T.textMute }}>Answer all questions to continue</span>}
              </>
            )}
          </div>
        </div>
      )}

      {(analysis.questions || []).length === 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          {loading ? <Loader phase={loadPhase} /> : (
            <Btn variant="primary" size="lg" onClick={() => onSubmitAnswers([])} loading={false}>
              Generate my application <IArrow s={15} />
            </Btn>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT SCREEN — all sections visible, coaching inline, cover letter added
// ─────────────────────────────────────────────────────────────────────────────
function OutputScreen({ output, fitLevel, convHistory, onNewApp }) {
  const [rfOpen, setRfOpen]       = useState(false);
  const [rfDraft, setRfDraft]     = useState("");
  const [rfCount, setRfCount]     = useState(0);
  const [rfBullets, setRfBullets] = useState(null);
  const [rfLoading, setRfLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("output"); // output | cover | coaching | prep
  const [showClose, setShowClose] = useState(false);

  const bullets = rfBullets || output.all_bullets || [];
  const allOutputText = [
    "PROFESSIONAL SUMMARY", output.rewritten_summary || "",
    "", "EXPERIENCE BULLETS", ...bullets.map(b => `• ${b}`),
  ].join("\n");

  async function refine() {
    if (!rfDraft.trim() || rfCount >= 3) return;
    setRfLoading(true);
    try {
      const prompt = `Current bullets:\n${bullets.map((b, i) => `${i + 1}. ${b}`).join("\n")}\nRequest: "${rfDraft}"\nOnly use info from conversation. Never fabricate.`;
      const res = await callClaude([...convHistory, { role: "user", content: prompt }], S3);
      if (res?.refined_bullets?.length) setRfBullets(res.refined_bullets);
      setRfCount(c => c + 1);
      setRfDraft("");
      if (rfCount + 1 >= 3) setRfOpen(false);
    } catch {}
    setRfLoading(false);
  }

  const tabs = [
    { id: "output", label: "Application", icon: <IDoc s={13} /> },
    { id: "cover", label: "Cover letter", icon: <IChat s={13} /> },
    { id: "coaching", label: "Coaching", icon: <IStar s={13} /> },
    { id: "prep", label: "Interview prep", icon: <ITarget s={13} /> },
  ];

  return (
    <div>
      {/* Success header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: T.greenBg, display: "flex", alignItems: "center", justifyContent: "center", color: T.green }}>
            <ICheck s={14} />
          </div>
          <span style={{ fontSize: "15px", fontWeight: 600, color: T.text }}>Application ready</span>
          {fitLevel && <FitBadge level={fitLevel} />}
        </div>
        <CopyBtn text={allOutputText} label="Copy all" />
      </div>

      {/* Tab nav */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "24px", background: T.bgSurf, padding: "4px", borderRadius: T.r }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ flex: 1, background: activeTab === t.id ? T.bg : "transparent", color: activeTab === t.id ? T.text : T.textMute, border: "none", borderRadius: T.rSm, padding: "8px 4px", fontSize: "12px", fontWeight: activeTab === t.id ? 600 : 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", transition: "all 0.15s", fontFamily: "inherit", boxShadow: activeTab === t.id ? T.sh : "none" }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── OUTPUT TAB ── */}
      {activeTab === "output" && (
        <div>
          {/* Quick win — prominent at top */}
          <Card hi style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <Badge color="green">Strongest bullet</Badge>
              <span style={{ fontSize: "11px", color: T.textMid }}>Use this first</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
              <p style={{ fontSize: "16px", fontWeight: 500, color: T.text, lineHeight: 1.7, margin: 0 }}>• {output.quick_win_bullet}</p>
              <CopyBtn text={"• " + output.quick_win_bullet} />
            </div>
            <WhyItWorks text={output.quick_win_explanation} startOpen={true} />
          </Card>

          {/* Summary */}
          <Card style={{ marginBottom: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: T.textMute, letterSpacing: "0.05em" }}>PROFESSIONAL SUMMARY</span>
              <CopyBtn text={output.rewritten_summary || ""} />
            </div>
            <p style={{ fontSize: "14px", color: T.text, lineHeight: 1.75, margin: 0 }}>{output.rewritten_summary}</p>
          </Card>

          {/* All bullets */}
          <Card style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: T.textMute, letterSpacing: "0.05em" }}>TAILORED BULLETS</span>
              <CopyBtn text={bullets.map(b => `• ${b}`).join("\n")} label="Copy all bullets" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {bullets.map((b, i) => (
                <div key={i} style={{ paddingBottom: i < bullets.length - 1 ? "20px" : 0, borderBottom: i < bullets.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                    <p style={{ fontSize: "14px", color: T.text, lineHeight: 1.7, margin: 0 }}>• {b}</p>
                    <CopyBtn text={"• " + b} />
                  </div>
                  {output.bullet_annotations?.[i] && (
                    <WhyItWorks text={output.bullet_annotations[i]} />
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Inline refinement */}
          <Card style={{ marginBottom: "0" }}>
            {rfCount >= 3 ? (
              <p style={{ fontSize: "13px", color: T.textMid, margin: 0, lineHeight: 1.6 }}>
                This is looking strong. Copy it and submit — you can start a new application for the next role.
              </p>
            ) : !rfOpen ? (
              <button onClick={() => setRfOpen(true)}
                style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", color: T.textMid, fontSize: "13px", fontWeight: 500, padding: 0, fontFamily: "inherit" }}>
                <IRefresh s={15} /> Adjust something
                <Badge color="gray">{3 - rfCount} left</Badge>
              </button>
            ) : (
              <div>
                <p style={{ fontSize: "13px", fontWeight: 600, color: T.text, margin: "0 0 10px" }}>What would you like to change?</p>
                <TextArea value={rfDraft} onChange={setRfDraft} minH={70}
                  placeholder={`e.g. "Make this more confident" or "I didn't actually lead the team — change it to 'contributed to'"`}
                  style={{ marginBottom: "12px" }} />
                <div style={{ display: "flex", gap: "8px" }}>
                  {rfLoading ? <Loader phase="refine" /> : (
                    <><Btn onClick={refine} disabled={!rfDraft.trim()}>Refine</Btn><Btn variant="ghost" onClick={() => setRfOpen(false)}>Cancel</Btn></>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── COVER LETTER TAB ── */}
      {activeTab === "cover" && (
        <div>
          <Card style={{ marginBottom: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div>
                <span style={{ fontSize: "12px", fontWeight: 700, color: T.textMute, letterSpacing: "0.05em" }}>OPENING PARAGRAPH</span>
                <p style={{ fontSize: "12px", color: T.textMute, margin: "4px 0 0" }}>Strong, specific, not generic — ready to paste and build on</p>
              </div>
              <CopyBtn text={output.cover_letter_opener || ""} />
            </div>
            <p style={{ fontSize: "14px", color: T.text, lineHeight: 1.8, margin: 0 }}>
              {output.cover_letter_opener || "Cover letter opener not generated — try regenerating the application."}
            </p>
          </Card>
          <Card flat>
            <p style={{ fontSize: "13px", color: T.textMid, margin: 0, lineHeight: 1.65 }}>
              <strong style={{ color: T.text }}>How to build the rest:</strong> After this opener, use 1-2 paragraphs drawing from your tailored bullets (in the Application tab). Close with a specific reason you want this role at this company. Keep the whole letter under 300 words.
            </p>
          </Card>
        </div>
      )}

      {/* ── COACHING TAB ── */}
      {activeTab === "coaching" && (
        <div>
          <Card style={{ marginBottom: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
              <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: T.greenBg, display: "flex", alignItems: "center", justifyContent: "center", color: T.green, flexShrink: 0 }}>
                <ICheck s={12} />
              </div>
              <span style={{ fontSize: "12px", fontWeight: 700, color: T.greenFg, letterSpacing: "0.04em" }}>WHAT LANDED WELL</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {(output.gap_strengths || []).map((s, i) => (
                <div key={i} style={{ display: "flex", gap: "12px", alignItems: "flex-start", paddingBottom: i < (output.gap_strengths||[]).length - 1 ? "16px" : 0, borderBottom: i < (output.gap_strengths||[]).length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: T.green, flexShrink: 0, marginTop: "9px" }} />
                  <p style={{ fontSize: "14px", color: T.text, lineHeight: 1.8, margin: 0 }}>{s}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card style={{ marginBottom: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
              <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: T.bgSurf, display: "flex", alignItems: "center", justifyContent: "center", color: T.textMid, flexShrink: 0 }}>
                <IPlus s={12} />
              </div>
              <span style={{ fontSize: "12px", fontWeight: 700, color: T.textMut, letterSpacing: "0.04em" }}>FOR NEXT TIME</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {(output.gap_improvements || []).map((g, i) => (
                <div key={i} style={{ display: "flex", gap: "12px", alignItems: "flex-start", paddingBottom: i < (output.gap_improvements||[]).length - 1 ? "16px" : 0, borderBottom: i < (output.gap_improvements||[]).length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: T.borderMid, flexShrink: 0, marginTop: "9px" }} />
                  <p style={{ fontSize: "14px", color: T.text, lineHeight: 1.8, margin: 0 }}>{g}</p>
                </div>
              ))}
            </div>
          </Card>
          {/* Saved coaching note */}
          {output.session_observation && (
            <Card flat style={{ borderLeft: `3px solid ${T.amber}`, borderRadius: "0 10px 10px 0" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: T.amber, letterSpacing: "0.04em", marginBottom: "6px" }}>SAVED FOR YOUR NEXT SESSION</div>
              <p style={{ fontSize: "13px", color: T.textMid, margin: 0, lineHeight: 1.65, fontStyle: "italic" }}>"{output.session_observation}"</p>
            </Card>
          )}
        </div>
      )}

      {/* ── INTERVIEW PREP TAB ── */}
      {activeTab === "prep" && (
        <div>
          <Card flat style={{ marginBottom: "16px" }}>
            <p style={{ fontSize: "13px", color: T.textMid, margin: 0, lineHeight: 1.6 }}>
              Based on your tailored bullets, here are the questions you're most likely to face. Prepare a specific answer for each — use the STAR framework (Situation, Task, Action, Result).
            </p>
          </Card>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {(output.interview_questions || []).map((q, i) => (
              <Card key={i}>
                <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                  <div style={{ flexShrink: 0, width: "24px", height: "24px", borderRadius: "50%", background: T.purpleBg, display: "flex", alignItems: "center", justifyContent: "center", color: T.purpleFg, fontSize: "11px", fontWeight: 700 }}>
                    {i + 1}
                  </div>
                  <p style={{ fontSize: "14px", color: T.text, lineHeight: 1.65, margin: 0 }}>{q}</p>
                </div>
              </Card>
            ))}
          </div>
          {(!output.interview_questions || output.interview_questions.length === 0) && (
            <Card flat>
              <p style={{ fontSize: "13px", color: T.textMute, margin: 0 }}>No interview questions generated — try regenerating the application with more detail.</p>
            </Card>
          )}
        </div>
      )}

      {/* Session close — inline at bottom, not a gated screen */}
      <Divider />
      {!showClose ? (
        <div style={{ display: "flex", gap: "10px" }}>
          <Btn onClick={onNewApp}><IZap s={14} /> Apply this now</Btn>
          <Btn variant="ghost" onClick={() => setShowClose(true)}>Create another application</Btn>
        </div>
      ) : (
        <Card hi>
          <div style={{ display: "flex", gap: "14px", alignItems: "flex-start", marginBottom: "16px" }}>
            <div style={{ flexShrink: 0, width: "36px", height: "36px", borderRadius: "50%", background: T.blueBg, display: "flex", alignItems: "center", justifyContent: "center", color: T.blue }}>
              <IStar s={16} />
            </div>
            <p style={{ fontSize: "15px", color: T.text, lineHeight: 1.75, margin: 0 }}>{output.session_close}</p>
          </div>
          <Btn onClick={onNewApp}><IZap s={14} /> Start next application</Btn>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APPLICATION DETAIL SCREEN — full view of a saved application
// Uses the new "applications" key with explicit field names
// ─────────────────────────────────────────────────────────────────────────────
function ApplicationDetailScreen({ app, onBack }) {
  const [activeSection, setActiveSection] = useState("summary");

  const allText = [
    "ROLE", app.role || "", app.company ? `Company: ${app.company}` : "",
    "", "PROFESSIONAL SUMMARY", app.summary || "",
    "", "TAILORED BULLETS", ...(app.bullets || []).map(b => `• ${b}`),
    "", "COVER LETTER OPENER", app.coverLetter || "",
  ].filter(Boolean).join("\n");

  const sections = [
    { id: "summary",   label: "Summary"   },
    { id: "bullets",   label: "Bullets"   },
    { id: "cover",     label: "Cover"     },
    { id: "interview", label: "Interview" },
    { id: "coaching",  label: "Coaching"  },
  ];

  const dateStr = app.createdAt || "";
  const dateLabel = dateStr ? new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

  return (
    <div style={{ animation: "jhcFadeIn 0.18s ease" }}>
      {/* Back button */}
      <button onClick={onBack}
        style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", color: T.textMid, fontSize: "13px", fontFamily: "inherit", padding: "0 0 18px", fontWeight: 500 }}>
        <Svg s={14} d="M19 12H5M12 19l-7-7 7-7" /> Back to history
      </button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 5px", color: T.text, letterSpacing: "-0.01em" }}>
            {app.role || "Untitled application"}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {app.company && <span style={{ fontSize: "13px", color: T.textMid }}>{app.company}</span>}
            {app.fit && <FitBadge level={app.fit} />}
            {dateLabel && <span style={{ fontSize: "11px", color: T.textMute }}>{dateLabel}</span>}
          </div>
        </div>
        <CopyBtn text={allText} label="Copy all" />
      </div>

      {/* Section tab pills */}
      <div style={{ display: "flex", gap: "5px", marginBottom: "20px", flexWrap: "wrap" }}>
        {sections.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            style={{
              background: activeSection === s.id ? T.accent : T.bgSurf,
              color: activeSection === s.id ? T.accentFg : T.textMid,
              border: `1px solid ${activeSection === s.id ? T.accent : T.border}`,
              borderRadius: T.rFull, padding: "5px 14px", fontSize: "12px", fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
            }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── SUMMARY SECTION ── */}
      {activeSection === "summary" && (
        <div style={{ animation: "jhcFadeIn 0.15s ease" }}>
          {app.summary ? (
            <Card style={{ marginBottom: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: T.textMute, letterSpacing: "0.05em" }}>PROFESSIONAL SUMMARY</span>
                <CopyBtn text={app.summary} />
              </div>
              <p style={{ fontSize: "14px", color: T.text, lineHeight: 1.75, margin: 0 }}>{app.summary}</p>
            </Card>
          ) : (
            <Card flat><p style={{ fontSize: "13px", color: T.textMute, margin: 0 }}>No summary saved.</p></Card>
          )}
          {app.quickWinBullet && (
            <Card hi style={{ marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                <Badge color="green">Strongest bullet</Badge>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                <p style={{ fontSize: "15px", fontWeight: 500, color: T.text, lineHeight: 1.7, margin: 0 }}>• {app.quickWinBullet}</p>
                <CopyBtn text={"• " + app.quickWinBullet} />
              </div>
              {app.quickWinExplanation && (
                <div style={{ marginTop: "10px", background: T.blueBg, borderRadius: T.rSm, padding: "9px 12px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: T.blueFg, letterSpacing: "0.04em" }}>WHY THIS WORKS · </span>
                  <span style={{ fontSize: "12px", color: T.blueFg }}>{app.quickWinExplanation}</span>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ── BULLETS SECTION ── */}
      {activeSection === "bullets" && (
        <div style={{ animation: "jhcFadeIn 0.15s ease" }}>
          {(app.bullets || []).length > 0 ? (
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: T.textMute, letterSpacing: "0.05em" }}>TAILORED BULLETS</span>
                <CopyBtn text={(app.bullets || []).map(b => `• ${b}`).join("\n")} label="Copy all" />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                {(app.bullets || []).map((b, i) => (
                  <div key={i} style={{ paddingBottom: i < app.bullets.length - 1 ? "18px" : 0, borderBottom: i < app.bullets.length - 1 ? `1px solid ${T.border}` : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                      <p style={{ fontSize: "14px", color: T.text, lineHeight: 1.7, margin: 0 }}>• {b}</p>
                      <CopyBtn text={"• " + b} />
                    </div>
                    {app.bulletAnnotations?.[i] && (
                      <div style={{ marginTop: "8px", background: T.blueBg, borderRadius: T.rSm, padding: "8px 12px" }}>
                        <span style={{ fontSize: "11px", color: T.blueFg, lineHeight: 1.55 }}>{app.bulletAnnotations[i]}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card flat><p style={{ fontSize: "13px", color: T.textMute, margin: 0 }}>No bullets saved.</p></Card>
          )}
        </div>
      )}

      {/* ── COVER LETTER SECTION ── */}
      {activeSection === "cover" && (
        <div style={{ animation: "jhcFadeIn 0.15s ease" }}>
          {app.coverLetter ? (
            <>
              <Card style={{ marginBottom: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: T.textMute, letterSpacing: "0.05em" }}>COVER LETTER OPENER</span>
                  <CopyBtn text={app.coverLetter} />
                </div>
                <p style={{ fontSize: "14px", color: T.text, lineHeight: 1.8, margin: 0 }}>{app.coverLetter}</p>
              </Card>
              <Card flat>
                <p style={{ fontSize: "13px", color: T.textMid, margin: 0, lineHeight: 1.65 }}>
                  <strong style={{ color: T.text }}>How to build the rest:</strong> Use 1-2 paragraphs from your bullets above. Close with a specific reason you want this role. Keep under 300 words.
                </p>
              </Card>
            </>
          ) : (
            <Card flat><p style={{ fontSize: "13px", color: T.textMute, margin: 0 }}>No cover letter saved.</p></Card>
          )}
        </div>
      )}

      {/* ── INTERVIEW PREP SECTION ── */}
      {activeSection === "interview" && (
        <div style={{ animation: "jhcFadeIn 0.15s ease" }}>
          {(app.interviewPrep || []).length > 0 ? (
            <>
              <Card flat style={{ marginBottom: "14px" }}>
                <p style={{ fontSize: "13px", color: T.textMid, margin: 0, lineHeight: 1.6 }}>
                  Based on your bullets, these are the questions you're most likely to face. Use the STAR framework to prepare each answer.
                </p>
              </Card>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {(app.interviewPrep || []).map((q, i) => (
                  <Card key={i}>
                    <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                      <div style={{ flexShrink: 0, width: "24px", height: "24px", borderRadius: "50%", background: T.purpleBg, display: "flex", alignItems: "center", justifyContent: "center", color: T.purpleFg, fontSize: "11px", fontWeight: 700 }}>{i + 1}</div>
                      <p style={{ fontSize: "14px", color: T.text, lineHeight: 1.65, margin: 0 }}>{q}</p>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <Card flat><p style={{ fontSize: "13px", color: T.textMute, margin: 0 }}>No interview questions saved.</p></Card>
          )}
        </div>
      )}

      {/* ── COACHING SECTION ── */}
      {activeSection === "coaching" && (
        <div style={{ animation: "jhcFadeIn 0.15s ease" }}>
          {(app.gapStrengths || []).length > 0 && (
            <Card style={{ marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: T.greenBg, display: "flex", alignItems: "center", justifyContent: "center", color: T.green, flexShrink: 0 }}><ICheck s={11} /></div>
                <span style={{ fontSize: "11px", fontWeight: 700, color: T.greenFg, letterSpacing: "0.04em" }}>WHAT LANDED WELL</span>
              </div>
              {(app.gapStrengths || []).map((s, i) => (
                <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginBottom: i < app.gapStrengths.length - 1 ? "10px" : 0 }}>
                  <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: T.green, flexShrink: 0, marginTop: "7px" }} />
                  <p style={{ fontSize: "14px", color: T.text, lineHeight: 1.65, margin: 0 }}>{s}</p>
                </div>
              ))}
            </Card>
          )}
          {(app.gapImprovements || []).length > 0 && (
            <Card style={{ marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: T.bgSurf, display: "flex", alignItems: "center", justifyContent: "center", color: T.textMid, flexShrink: 0 }}>+</div>
                <span style={{ fontSize: "11px", fontWeight: 700, color: T.textMute, letterSpacing: "0.04em" }}>FOR NEXT TIME</span>
              </div>
              {(app.gapImprovements || []).map((g, i) => (
                <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginBottom: i < app.gapImprovements.length - 1 ? "10px" : 0 }}>
                  <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: T.borderMid, flexShrink: 0, marginTop: "7px" }} />
                  <p style={{ fontSize: "14px", color: T.text, lineHeight: 1.65, margin: 0 }}>{g}</p>
                </div>
              ))}
            </Card>
          )}
          {app.coachingNote ? (
            <Card flat style={{ borderLeft: `3px solid ${T.amber}`, borderRadius: "0 10px 10px 0" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: T.amber, letterSpacing: "0.04em", marginBottom: "6px" }}>COACHING NOTE</div>
              <p style={{ fontSize: "13px", color: T.amberFg, margin: 0, lineHeight: 1.65, fontStyle: "italic" }}>"{app.coachingNote}"</p>
            </Card>
          ) : (app.gapStrengths || []).length === 0 && (app.gapImprovements || []).length === 0 ? (
            <Card flat><p style={{ fontSize: "13px", color: T.textMute, margin: 0 }}>No coaching notes saved.</p></Card>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SAVED APPLICATION VIEW — history detail
// ─────────────────────────────────────────────────────────────────────────────
function SavedAppScreen({ app, onBack }) {
  const bullets = app.all_bullets || [];
  const allText = ["PROFESSIONAL SUMMARY", app.rewritten_summary || "", "", "BULLETS", ...bullets.map(b => `• ${b}`)].join("\n");
  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", color: T.textMid, fontSize: "13px", fontFamily: "inherit", padding: "0 0 20px", fontWeight: 500 }}>
        <Svg s={14} d="M19 12H5M12 19l-7-7 7-7" /> Back to dashboard
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: 600, margin: "0 0 4px", color: T.text }}>{app.role || "Untitled"}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "13px", color: T.textMute }}>{app.company || "Unknown"}</span>
            {app.fit_level && <FitBadge level={app.fit_level} />}
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}><CopyBtn text={allText} label="Copy all" /></div>
      </div>
      {app.rewritten_summary && (
        <Card style={{ marginBottom: "14px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: T.textMute, letterSpacing: "0.05em", marginBottom: "10px" }}>PROFESSIONAL SUMMARY</div>
          <p style={{ fontSize: "14px", color: T.text, lineHeight: 1.75, margin: 0 }}>{app.rewritten_summary}</p>
        </Card>
      )}
      {bullets.length > 0 && (
        <Card style={{ marginBottom: "14px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: T.textMute, letterSpacing: "0.05em", marginBottom: "14px" }}>TAILORED BULLETS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {bullets.map((b, i) => (
              <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start", paddingBottom: i < bullets.length - 1 ? "14px" : 0, borderBottom: i < bullets.length - 1 ? `1px solid ${T.border}` : "none" }}>
                <p style={{ fontSize: "14px", color: T.text, lineHeight: 1.7, margin: 0, flex: 1 }}>• {b}</p>
                <CopyBtn text={"• " + b} />
              </div>
            ))}
          </div>
        </Card>
      )}
      {app.session_observation && (
        <Card flat style={{ borderLeft: `3px solid ${T.amber}`, borderRadius: "0 10px 10px 0" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: T.amber, letterSpacing: "0.04em", marginBottom: "6px" }}>COACHING NOTE FROM THIS SESSION</div>
          <p style={{ fontSize: "13px", color: T.textMid, margin: 0, lineHeight: 1.65, fontStyle: "italic" }}>"{app.session_observation}"</p>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BOTTOM NAV
// ─────────────────────────────────────────────────────────────────────────────
function BottomNav({ active, onChange }) {
  const items = [
    { id: "home", label: "Home", icon: <IBriefcase s={18} /> },
    { id: "apply", label: "Apply", icon: <IZap s={18} /> },
    { id: "history", label: "History", icon: <IHistory s={18} /> },
  ];
  return (
    <div style={{ borderTop: `1px solid ${T.border}`, display: "flex", marginTop: "32px", paddingTop: "0" }}>
      {items.map(item => (
        <button key={item.id} onClick={() => onChange(item.id)}
          style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "12px 4px 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", color: active === item.id ? T.accent : T.textMute, fontFamily: "inherit", transition: "color 0.15s" }}>
          {item.icon}
          <span style={{ fontSize: "10px", fontWeight: active === item.id ? 700 : 500, letterSpacing: "0.03em" }}>{item.label.toUpperCase()}</span>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// API KEY GATE — shown before the app if no key is stored
// Key lives in localStorage only. Never sent anywhere except Groq's API.
// ─────────────────────────────────────────────────────────────────────────────
function ApiKeyGate({ onKeySet }) {
  const [val, setVal] = useState("");
  const [testing, setTesting] = useState(false);
  const [err, setErr] = useState("");
  const [show, setShow] = useState(false);

  async function handleSubmit() {
    const trimmed = val.trim();
    if (!trimmed.startsWith("gsk_")) {
      setErr("Groq keys start with gsk_ — check you copied the full key.");
      return;
    }
    setTesting(true); setErr("");
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${trimmed}` },
        body: JSON.stringify({ model: "llama-3.3-70b-versatile", max_tokens: 10, messages: [{ role: "user", content: "hi" }] }),
      });
      if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e?.error?.message || `Status ${r.status}`); }
      saveGroqKey(trimmed);
      onKeySet();
    } catch (e) {
      setErr(`Key test failed: ${e.message}`);
    }
    setTesting(false);
  }

  return (
    <div style={{ fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif", minHeight: "100vh", background: T.bgSurf, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; }`}</style>
      <div style={{ background: T.bg, borderRadius: T.rLg, border: `1px solid ${T.border}`, padding: "36px 32px", width: "100%", maxWidth: "480px", boxShadow: T.shMd }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "28px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: T.accent, display: "flex", alignItems: "center", justifyContent: "center", color: T.accentFg }}>
            <IStar s={15} />
          </div>
          <span style={{ fontSize: "16px", fontWeight: 700, color: T.text }}>Job Hunt Copilot</span>
        </div>

        <h2 style={{ fontSize: "18px", fontWeight: 700, color: T.text, margin: "0 0 8px" }}>Add your Groq API key</h2>
        <p style={{ fontSize: "14px", color: T.textMid, margin: "0 0 24px", lineHeight: 1.65 }}>
          Your key is stored only in your browser. It never leaves your device except to call Groq's API directly.
        </p>

        {/* Steps to get a key */}
        <div style={{ background: T.bgSurf, borderRadius: T.r, padding: "14px 16px", marginBottom: "20px", border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: T.textMute, letterSpacing: "0.05em", marginBottom: "10px" }}>HOW TO GET A FREE KEY</div>
          {[
            ["1", "Go to", "console.groq.com", "https://console.groq.com"],
            ["2", "Sign up (free) and go to", "API Keys", "https://console.groq.com/keys"],
            ["3", "Click Create API key, copy it, paste below", "", ""],
          ].map(([n, pre, link, href]) => (
            <div key={n} style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginBottom: "8px" }}>
              <div style={{ flexShrink: 0, width: "18px", height: "18px", borderRadius: "50%", background: T.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 700, color: T.textMid, marginTop: "1px" }}>{n}</div>
              <span style={{ fontSize: "13px", color: T.textMid, lineHeight: 1.5 }}>
                {pre}{" "}
                {href ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: T.blue, textDecoration: "none", fontWeight: 500 }}>{link}</a> : link}
              </span>
            </div>
          ))}
        </div>

        {/* Key input */}
        <div style={{ marginBottom: "14px" }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: T.textMid, display: "block", marginBottom: "6px", letterSpacing: "0.03em" }}>YOUR GROQ API KEY</label>
          <div style={{ position: "relative" }}>
            <input
              type={show ? "text" : "password"}
              value={val}
              onChange={e => { setVal(e.target.value); setErr(""); }}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              placeholder="gsk_..."
              style={{ width: "100%", padding: "11px 44px 11px 14px", fontSize: "14px", border: `1px solid ${err ? T.red : T.border}`, borderRadius: T.r, background: T.bg, color: T.text, fontFamily: "inherit", outline: "none", transition: "border-color 0.15s" }}
              onFocus={e => { if (!err) e.target.style.borderColor = T.blue; e.target.style.boxShadow = `0 0 0 3px ${T.blueBg}`; }}
              onBlur={e => { if (!err) e.target.style.borderColor = T.border; e.target.style.boxShadow = "none"; }}
            />
            <button onClick={() => setShow(s => !s)}
              style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: T.textMute, padding: "4px", display: "flex" }}>
              <Svg s={15} d={show ? "M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22" : "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 100 6 3 3 0 000-6z"} />
            </button>
          </div>
          {err && <p style={{ fontSize: "12px", color: T.red, margin: "6px 0 0", lineHeight: 1.5 }}>{err}</p>}
        </div>

        {/* Submit */}
        <button onClick={handleSubmit} disabled={!val.trim() || testing}
          style={{ width: "100%", background: val.trim() && !testing ? T.accent : T.bgSurf, color: val.trim() && !testing ? T.accentFg : T.textMute, border: "none", borderRadius: T.r, padding: "12px 20px", fontSize: "14px", fontWeight: 600, cursor: val.trim() && !testing ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontFamily: "inherit", transition: "all 0.15s", marginBottom: "16px" }}>
          {testing ? (
            <>
              <style>{`@keyframes kspin{to{transform:rotate(360deg)}}`}</style>
              <div style={{ width: 14, height: 14, border: "2px solid rgba(0,0,0,0.15)", borderTopColor: T.textMute, borderRadius: "50%", animation: "kspin 0.7s linear infinite" }} />
              Testing key…
            </>
          ) : <><IZap s={15}/> Save key and start</>}
        </button>

        {/* Privacy note */}
        <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
          <ICheck s={13} />
          <p style={{ fontSize: "11px", color: T.textMute, margin: 0, lineHeight: 1.6 }}>
            Your key is stored in <strong>your browser only</strong> (localStorage). It is never sent to any server we control. Requests go directly from your browser → Groq's API.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────────────────────────────────────
function AppInner() {
  const [nav, setNav]             = useState("home");   // home | apply | history
  const [appStage, setAppStage]   = useState("input");  // input | analysis | output
  const [analysis, setAnalysis]   = useState(null);
  const [output, setOutput]       = useState(null);
  const [fitLevel, setFitLevel]   = useState(null);
  const [convHistory, setConvHistory] = useState([]);
  const [inputPayload, setInputPayload] = useState(null);
  const [loading, setLoading]     = useState(false);
  const [loadPhase, setLoadPhase] = useState("analyse");
  const [error, setError]         = useState(null);
  const [savedApp, setSavedApp]   = useState(null);     // legacy: for HomeScreen onViewApp
  const [selectedApplication, setSelectedApplication] = useState(null); // full detail view

  // Step 1: analyse resume + JD → get fit score + first impression + questions
  async function handleInputSubmit(payload) {
    setLoading(true); setError(null); setLoadPhase("analyse");
    setInputPayload(payload);
    try {
      let content = "";
      if (payload.noResume) {
        content = `No resume provided.\nJOB DESCRIPTION:\n${payload.jd}`;
      } else {
        content = `RESUME/EXPERIENCE:\n${payload.resume}\n\nJOB DESCRIPTION:\n${payload.jd}`;
      }
      const msgs = [{ role: "user", content }];
      const res = await callClaude(msgs, S1);
      if (!res) throw new Error("No analysis response");
      setAnalysis(res);
      setFitLevel(res.fit_level);
      setConvHistory([...msgs, { role: "assistant", content: JSON.stringify(res) }]);
      setAppStage("analysis");
    } catch (e) {
      setError("Couldn't analyse your application — your content is saved. Check your API key and try again.");
    }
    setLoading(false);
  }

  // Step 2: user answers all questions → generate full output
  async function handleAnswersSubmit(answers) {
    setLoading(true); setError(null); setLoadPhase("generate");
    try {
      const answerText = (analysis.questions || []).length > 0
        ? (analysis.questions || []).map((q, i) => `Q: ${q.question}\nA: ${answers[i] || "(skipped)"}`).join("\n\n")
        : "No additional questions — please generate based on the resume and JD.";
      const msgs = [
        ...convHistory,
        { role: "user", content: answerText },
      ];
      const res = await callClaude([...msgs, { role: "user", content: "Now generate the full tailored application output." }], S2);
      if (!res) throw new Error("No generation response");

      // Save to history — two stores: legacy (saveApp) + full detail (saveApplication)
      const app = {
        ...res,
        fit_level: fitLevel,
        role: inputPayload?.role || "",
        company: inputPayload?.company || "",
        date: new Date().toISOString(),
      };
      saveApp(app);
      saveApplication({ res, role: inputPayload?.role, company: inputPayload?.company, fitLevel });
      clearDraft();

      setOutput(res);
      setConvHistory(msgs);
      setAppStage("output");
    } catch (e) {
      setError("Something went wrong generating your output. Your answers are saved — try again.");
    }
    setLoading(false);
  }

  function startNewApp() {
    setAppStage("input");
    setAnalysis(null);
    setOutput(null);
    setFitLevel(null);
    setConvHistory([]);
    setInputPayload(null);
    setError(null);
    setNav("apply");
  }

  function goHome() {
    setNav("home");
    setSavedApp(null);
  }

  // Reset history selection whenever the user switches to the history tab
  useEffect(() => {
    if (nav === "history") {
      setSelectedApplication(null);
      setSavedApp(null);
    }
  }, [nav]);

  // Section title for header
  const sectionTitle = {
    home: "Job Hunt Copilot",
    apply: appStage === "input" ? "New application" : appStage === "analysis" ? "Review & refine" : "Your output",
    history: selectedApplication
      ? (selectedApplication.role || "Application")
      : savedApp
        ? (savedApp.role || "Application")
        : "Past applications",
  }[nav];

  // Step indicator for apply flow
  const applyStep = { input: 1, analysis: 2, output: 3 }[appStage];

  return (
    <div className="app-container" style={{ fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif", color: T.text, background: T.bg, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{`* { box-sizing: border-box; } textarea { font-family: inherit; } button { font-family: inherit; } input { font-family: inherit; } ::placeholder { color: ${T.textMute}; } body { margin: 0; background: ${T.bgSurf}; } button { -webkit-font-smoothing: antialiased; } input, textarea { -webkit-font-smoothing: antialiased; } *:focus-visible { outline: 2px solid ${T.blue}; outline-offset: 2px; } @keyframes fadeSlideIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } } @keyframes jhcFadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } } .jhc-screen { animation: fadeSlideIn 0.2s ease; } .app-container { width: 100%; max-width: 1100px; margin-left: auto; margin-right: auto; padding-left: 48px; padding-right: 48px; box-sizing: border-box; } @media (max-width: 900px) { .app-container { padding-left: 24px; padding-right: 24px; } } @media (max-width: 600px) { .app-container { padding-left: 16px; padding-right: 16px; } }`}</style>

      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bg, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "28px", height: "28px", borderRadius: "7px", background: T.accent, display: "flex", alignItems: "center", justifyContent: "center", color: T.accentFg, flexShrink: 0 }}>
            <IStar s={13} />
          </div>
          <span style={{ fontSize: "14px", fontWeight: 700, color: T.text }}>{sectionTitle}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {nav === "apply" && appStage !== "input" && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              {[1, 2, 3].map(s => (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: s < applyStep ? T.accent : s === applyStep ? T.bg : T.bgSurf, border: s <= applyStep ? `2px solid ${T.accent}` : `1.5px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", fontWeight: 700, color: s < applyStep ? T.accentFg : s === applyStep ? T.accent : T.textMute }}>
                    {s < applyStep ? <ICheck s={9} /> : s}
                  </div>
                  {s < 3 && <div style={{ width: "12px", height: "1.5px", background: s < applyStep ? T.accent : T.border }} />}
                </div>
              ))}
            </div>
          )}
          {nav === "apply" && appStage !== "input" && (
            <button onClick={startNewApp} style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: T.rSm, padding: "5px 10px", fontSize: "12px", color: T.textMid, cursor: "pointer", fontFamily: "inherit" }}>
              New
            </button>
          )}
          <button onClick={() => { clearGroqKey(); window.location.reload(); }}
            title="Change API key"
            style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: T.rSm, padding: "5px 8px", cursor: "pointer", color: T.textMute, display: "flex", alignItems: "center", fontFamily: "inherit" }}>
            <Svg s={13} d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 0", display: "flex", flexDirection: "column" }}>
        {error && (
          <div style={{ background: T.redBg, color: T.redFg, border: `1px solid rgba(192,57,43,0.18)`, borderRadius: T.r, padding: "11px 14px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", fontSize: "13px", lineHeight: 1.5 }}>
            <span>{error}</span>
            <button onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: "0 0 0 10px", display: "flex", flexShrink: 0 }}><IClose s={15} /></button>
          </div>
        )}

        {nav === "home" && (
          <div className="jhc-screen"><HomeScreen onNewApp={startNewApp} onViewApp={app => { setSavedApp(app); setNav("history"); }} /></div>
        )}
        {nav === "apply" && appStage === "input" && (
          <div className="jhc-screen"><InputScreen onSubmit={handleInputSubmit} loading={loading} loadPhase={loadPhase} /></div>
        )}
        {nav === "apply" && appStage === "analysis" && analysis && (
          <AnalysisScreen analysis={analysis} onSubmitAnswers={handleAnswersSubmit} loading={loading} loadPhase={loadPhase} />
        )}
        {nav === "apply" && appStage === "output" && output && (
          <OutputScreen output={output} fitLevel={fitLevel} convHistory={convHistory} onNewApp={startNewApp} />
        )}
        {nav === "history" && (
          selectedApplication ? (
            <ApplicationDetailScreen
              app={selectedApplication}
              onBack={() => setSelectedApplication(null)}
            />
          ) : savedApp ? (
            <SavedAppScreen app={savedApp} onBack={() => setSavedApp(null)} />
          ) : (
            <div>
              {(() => {
                const fullApps = getFullApps();
                const legacyApps = getApps();
                const apps = fullApps.length > 0 ? fullApps : legacyApps;
                const isFullFormat = fullApps.length > 0;

                if (apps.length === 0) return (
                  <div style={{ animation: "jhcFadeIn 0.2s ease" }}>
                    <div style={{ background: T.bgSurf, borderRadius: T.rLg, padding: "28px 24px", marginBottom: "16px", textAlign: "center" }}>
                      <div style={{ width: "44px", height: "44px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.r, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: T.textMid }}>
                        <IHistory s={20} />
                      </div>
                      <p style={{ fontSize: "15px", fontWeight: 700, color: T.text, margin: "0 0 8px" }}>Your application archive</p>
                      <p style={{ fontSize: "13px", color: T.textMid, margin: "0 0 20px", lineHeight: 1.65, maxWidth: "260px", marginLeft: "auto", marginRight: "auto" }}>
                        Every application you tailor is saved here — with its fit score, bullets, and coaching note. Your job hunt, documented.
                      </p>
                      <Btn onClick={startNewApp}><IZap s={14} /> Create your first application</Btn>
                    </div>
                    <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r, padding: "16px 18px" }}>
                      <div style={{ fontSize: "11px", fontWeight: 700, color: T.textMute, letterSpacing: "0.05em", marginBottom: "12px" }}>WHAT GETS SAVED</div>
                      {[
                        ["Tailored bullets for each role", T.blue],
                        ["Fit score: strong / moderate / stretch", T.green],
                        ["Cover letter opener", T.purple],
                        ["Coaching note for next session", T.amber],
                      ].map(([item, col]) => (
                        <div key={item} style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "9px" }}>
                          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: col, flexShrink: 0 }} />
                          <span style={{ fontSize: "13px", color: T.textMid }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {apps.map((app, i) => {
                      const dateStr = app.createdAt || app.date || "";
                      const age = dateStr ? Math.round((Date.now() - new Date(dateStr)) / 86400000) : null;
                      const ageStr = age === null ? "" : age === 0 ? "Today" : age === 1 ? "Yesterday" : `${age} days ago`;
                      const fitLevel = app.fit || app.fit_level || "";
                      return (
                        <button key={app.id || i}
                          onClick={() => isFullFormat ? setSelectedApplication(app) : setSavedApp(app)}
                          style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.r, padding: "12px 14px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: "10px", transition: "border-color 0.15s, background 0.15s", width: "100%", fontFamily: "inherit" }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = T.borderMid; e.currentTarget.style.background = T.bgSurf; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.bg; }}>
                          <div style={{ width: "32px", height: "32px", borderRadius: T.rSm, background: T.bgSurf, display: "flex", alignItems: "center", justifyContent: "center", color: T.textMute, flexShrink: 0 }}>
                            <IDoc s={14} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "13px", fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {app.role || "Untitled"}{app.company ? ` · ${app.company}` : ""}
                            </div>
                            <div style={{ fontSize: "11px", color: T.textMute, marginTop: "2px" }}>{ageStr}</div>
                          <div style={{ fontSize: "11px", color: T.textMute, marginTop: "3px" }}>Includes: bullets, cover letter, interview prep</div>
                          </div>
                          {fitLevel && <FitBadge level={fitLevel} />}
                          <IArrow s={13} />
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )
        )}
        {/* Bottom padding so content clears the nav */}
        <div style={{ height: "80px" }} />
      </div>

      {/* Bottom nav — fixed to bottom of the container */}
      <div style={{ borderTop: `1px solid ${T.border}`, background: T.bg, flexShrink: 0 }}>
        <div style={{ display: "flex" }}>
          {[
            { id: "home", label: "Home", icon: <IBriefcase s={19} /> },
            { id: "apply", label: "Apply", icon: <IZap s={19} /> },
            { id: "history", label: "History", icon: <IHistory s={19} /> },
          ].map(item => (
            <button key={item.id}
              onClick={() => { setNav(item.id); if (item.id === "apply") { setAppStage("input"); setError(null); } }}
              style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "10px 4px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", color: nav === item.id ? T.accent : T.textMute, fontFamily: "inherit", transition: "color 0.15s", borderTop: `2px solid ${nav === item.id ? T.accent : "transparent"}` }}>
              {item.icon}
              <span style={{ fontSize: "10px", fontWeight: nav === item.id ? 700 : 500, letterSpacing: "0.04em" }}>{item.label.toUpperCase()}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [hasKey, setHasKey] = useState(() => !!getGroqKey());
  if (!hasKey) return <ApiKeyGate onKeySet={() => setHasKey(true)} />;
  return <AppInner />;
}
