import { useState, useEffect, useRef } from 'preact/hooks';

// ==================== PERSISTENCE ====================
function load<T>(k: string, fb: T): T { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } }
function save(k: string, v: any) { localStorage.setItem(k, JSON.stringify(v)); }

// ==================== TYPES ====================
type GoalKind = 'weekly_train' | 'monthly_train' | 'monthly_noff' | 'streak' | 'custom';
interface Goal { id: string; kind: GoalKind; title: string; emoji: string; target: number; current: number; done: boolean; doneAt: number | null; }
interface WE { date: string; kg: number; }
interface TM { id: string; date: string; opponent: string; myScore: string; oppScore: string; won: boolean; notes: string; }
interface D {
  name: string; onboarded: boolean; xp: number; level: number;
  trainingDays: string[]; noFastfoodDays: string[];
  weightEntries: WE[]; goals: Goal[]; tennisSessions: TM[];
}
const DEF: D = { name: '', onboarded: false, xp: 0, level: 1, trainingDays: [], noFastfoodDays: [], weightEntries: [], goals: [], tennisSessions: [] };

// migrate from gs2
function loadData(): D {
  const d3 = load<D | null>('gs3', null);
  if (d3) return d3;
  const d2 = load<any>('gs2', null);
  if (d2) return { ...DEF, ...d2, tennisSessions: [] };
  return DEF;
}

// ==================== HELPERS ====================
function td() { return new Date().toISOString().split('T')[0]; }
function dl(d: string) { return new Date(d + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'short' }); }
function l7(): string[] { const r: string[] = []; for (let i = 6; i >= 0; i--) r.push(new Date(Date.now() - i * 864e5).toISOString().split('T')[0]); return r; }
function weekDates(d: string): string[] {
  const dt = new Date(d + 'T12:00:00'); const day = dt.getDay();
  const mon = new Date(dt); mon.setDate(dt.getDate() - ((day + 6) % 7));
  const r: string[] = []; for (let i = 0; i < 7; i++) { const x = new Date(mon); x.setDate(mon.getDate() + i); r.push(x.toISOString().split('T')[0]); } return r;
}
function gm(d: string) { return d.substring(0, 7); }
function rid() { return Math.random().toString(36).slice(2, 10); }

// ==================== XP / LEVEL ====================
function lvl4xp(xp: number) { let l = 1, n = 100, t = 0; while (t + n <= xp) { t += n; l++; n = 100 + (l - 1) * 50; } return l; }
function xpInLvl(xp: number) { let l = 1, n = 100, t = 0; while (t + n <= xp) { t += n; l++; n = 100 + (l - 1) * 50; } return { i: xp - t, n }; }

// ==================== STREAKS ====================
function miniStreak(train: string[], noff: string[]): number {
  const all = new Set([...train, ...noff]);
  const t = td();
  let count = 0;
  // count back from yesterday
  let d = new Date(t + 'T12:00:00'); d.setDate(d.getDate() - 1);
  while (all.has(d.toISOString().split('T')[0])) { count++; d.setDate(d.getDate() - 1); }
  // if today also has activity, count it
  if (all.has(t)) count++;
  return count;
}

function superStreak(train: string[]): number {
  const ts = new Set(train);
  let count = 0;
  const now = new Date();
  // find last completed week's Sunday
  const dow = now.getDay(); // 0=Sun
  const lastSun = new Date(now); lastSun.setDate(now.getDate() - (dow === 0 ? 7 : dow));
  lastSun.setHours(12, 0, 0, 0);

  for (let w = 0; ; w++) {
    const sun = new Date(lastSun); sun.setDate(lastSun.getDate() - w * 7);
    const mon = new Date(sun); mon.setDate(sun.getDate() - 6);
    let c = 0;
    for (let i = 0; i < 7; i++) { const x = new Date(mon); x.setDate(mon.getDate() + i); if (ts.has(x.toISOString().split('T')[0])) c++; }
    if (c < 3) break;
    count++;
  }
  return count;
}

function weekTrainCount(train: string[]): number {
  const t = td(); const wk = weekDates(t); const ts = new Set(train);
  return wk.filter(d => ts.has(d)).length;
}

// ==================== GOALS ====================
function updGoals(goals: Goal[], data: D, ms: number): Goal[] {
  const t = td(); const wk = weekDates(t); const ts = new Set(data.trainingDays);
  const mon = gm(t);
  const wt = wk.filter(d => ts.has(d)).length;
  const mt = data.trainingDays.filter(d => gm(d) === mon).length;
  const mn = data.noFastfoodDays.filter(d => gm(d) === mon).length;
  return goals.map(g => {
    if (g.done) return g;
    let cur = g.current;
    switch (g.kind) { case 'weekly_train': cur = wt; break; case 'monthly_train': cur = mt; break; case 'monthly_noff': cur = mn; break; case 'streak': cur = ms; break; case 'custom': break; }
    const done = cur >= g.target;
    return { ...g, current: cur, done, doneAt: done && !g.done ? Date.now() : g.doneAt };
  });
}

const GPRESETS: { kind: GoalKind; emoji: string; label: string; unit: string; def: number }[] = [
  { kind: 'weekly_train', emoji: '🏋️', label: 'Treningi w tygodniu', unit: 'treningi', def: 3 },
  { kind: 'monthly_train', emoji: '📅', label: 'Treningi w miesiącu', unit: 'treningi', def: 12 },
  { kind: 'monthly_noff', emoji: '🥗', label: 'Dni bez FF w miesiącu', unit: 'dni', def: 20 },
  { kind: 'streak', emoji: '🔥', label: 'Streak', unit: 'dni', def: 7 },
  { kind: 'custom', emoji: '⭐', label: 'Własny cel', unit: '', def: 10 },
];

// ==================== COLORS ====================
const C = {
  bg: '#1a1a2e', bg2: '#16213e', card: '#1f2b47', elev: '#2a3a5c', inp: '#162038',
  grn: '#58cc02', grnD: '#46a302', org: '#ff9600', blu: '#1cb0f6', bluD: '#0f9ad8',
  red: '#ff4b4b', yel: '#ffc800', pur: '#ce82ff', cyn: '#00d4aa',
  txt: '#fff', tx2: '#afafbf', mut: '#6b6b80',
  brd: 'rgba(255,255,255,0.08)', brS: 'rgba(255,255,255,0.15)',
};
const safeTop = 'max(env(safe-area-inset-top, 0px), 12px)';

// ==================== CSS ====================
const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
@keyframes slideUp{from{transform:translateY(14px);opacity:.6}to{transform:translateY(0);opacity:1}}
@keyframes bounceIn{0%{transform:scale(.3);opacity:0}50%{transform:scale(1.1);opacity:1}70%{transform:scale(.95)}100%{transform:scale(1);opacity:1}}
@keyframes celBounce{0%{transform:scale(1)}20%{transform:scale(.93)}40%{transform:scale(1.08)}60%{transform:scale(.97)}80%{transform:scale(1.03)}100%{transform:scale(1)}}
@keyframes xpPop{0%{opacity:0;transform:translateX(-50%) scale(.3)}15%{opacity:1;transform:translateX(-50%) scale(1.3)}30%{transform:translateX(-50%) scale(.95)}50%{transform:translateX(-50%) scale(1)}80%{opacity:1;transform:translateX(-50%) translateY(-12px)}100%{opacity:0;transform:translateX(-50%) translateY(-36px) scale(.8)}}
@keyframes flame{0%,100%{transform:scale(1) rotate(0)}20%{transform:scale(1.1) rotate(-3deg)}40%{transform:scale(.93) rotate(2deg)}60%{transform:scale(1.07) rotate(-1.5deg)}80%{transform:scale(.96) rotate(1deg)}}
@keyframes glow{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.15)}}
@keyframes shimmer{0%{transform:translateX(-150%)}100%{transform:translateX(350%)}}
@keyframes cfall{0%{opacity:1;transform:translateY(0) translateX(var(--dx,0)) rotate(0)}40%{opacity:1}100%{opacity:0;transform:translateY(105vh) translateX(calc(var(--dx,0)*-1)) rotate(720deg)}}
@keyframes dotPop{0%{transform:scale(.4)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes tPulse{0%,100%{box-shadow:0 0 0 3px rgba(88,204,2,.15)}50%{box-shadow:0 0 0 6px rgba(88,204,2,.3)}}
@keyframes iFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes lvlUp{0%{opacity:0;transform:scale(.5)}30%{opacity:1;transform:scale(1.2)}60%{transform:scale(.9)}100%{opacity:1;transform:scale(1)}}
.stag{animation:slideUp .3s ease}
button{font-family:inherit;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
button:active{transform:scale(.96)}
input,textarea{font-family:inherit;-webkit-appearance:none}
input::-webkit-inner-spin-button,input::-webkit-outer-spin-button{-webkit-appearance:none}
::-webkit-scrollbar{width:0;height:0}
`;

// ==================== SHARED COMPONENTS ====================
function Tog({ emoji, label, xp, done, bounce, onTap }: { emoji: string; label: string; xp: number; done: boolean; bounce: boolean; onTap: () => void }) {
  return <button onClick={onTap} disabled={done} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 18px', borderRadius: '16px', border: `2px solid ${done ? C.grn : C.brS}`, background: done ? 'rgba(88,204,2,0.1)' : C.card, width: '100%', textAlign: 'left', color: '#fff', cursor: done ? 'default' : 'pointer', transition: 'all .2s cubic-bezier(.34,1.56,.64,1)', boxShadow: done ? '0 0 16px rgba(88,204,2,.12)' : '0 4px 0 rgba(0,0,0,.2)', animation: bounce ? 'celBounce .6s cubic-bezier(.34,1.56,.64,1)' : 'none' }}>
    <span style={{ fontSize: '26px', lineHeight: 1, flexShrink: 0 }}>{emoji}</span>
    <span style={{ flex: 1, fontWeight: 700, fontSize: '16px' }}>{label}</span>
    <span style={{ fontWeight: 700, fontSize: '13px', color: done ? C.grn : C.mut, flexShrink: 0 }}>{done ? '+' : ''}{xp} XP</span>
  </button>;
}
function Hdr({ title, onBack }: { title: string; onBack: () => void }) {
  return <div style={{ display: 'flex', alignItems: 'center', height: '48px', gap: '8px' }}>
    <button onClick={onBack} style={{ width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: '#fff', fontSize: '20px', borderRadius: '50%' }}>←</button>
    <div style={{ flex: 1, fontWeight: 700, fontSize: '17px', textAlign: 'center' }}>{title}</div>
    <div style={{ width: '44px' }} />
  </div>;
}
function Inp({ value, onInput, placeholder, type = 'text' }: { value: string; onInput: (v: string) => void; placeholder: string; type?: string }) {
  return <input type={type} value={value} placeholder={placeholder} onInput={(e: any) => onInput(e.target.value)} style={{ width: '100%', padding: '14px 16px', borderRadius: '14px', border: `2px solid ${C.brS}`, background: C.inp, color: '#fff', fontSize: '16px', outline: 'none' }} />;
}
function GBtn({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return <button onClick={onClick} disabled={disabled} style={{ width: '100%', padding: '16px', borderRadius: '14px', border: 'none', background: disabled ? C.elev : C.grn, color: disabled ? C.mut : '#1a1a2e', fontSize: '16px', fontWeight: 700, boxShadow: disabled ? 'none' : `0 5px 0 ${C.grnD}`, opacity: disabled ? 0.6 : 1 }}>{label}</button>;
}
function Confetti() {
  const ps = Array.from({ length: 40 }, (_, i) => ({ left: `${Math.random() * 100}%`, del: `${Math.random() * .7}s`, dur: `${2 + Math.random() * 1.5}s`, col: [C.grn, C.org, C.pur, C.blu, C.yel, C.red][i % 6], sz: 5 + Math.random() * 8, circ: Math.random() > .5, dx: (Math.random() - .5) * 60 }));
  return <div style={{ position: 'fixed', inset: 0, zIndex: 250, pointerEvents: 'none', overflow: 'hidden' }}>
    {ps.map((p, i) => <div key={i} style={{ position: 'absolute', top: '-15px', left: p.left, width: `${p.sz}px`, height: `${p.sz}px`, background: p.col, borderRadius: p.circ ? '50%' : '2px', animation: `cfall ${p.dur} ease-out ${p.del} forwards`, '--dx': `${p.dx}px` } as any} />)}
  </div>;
}

// ==================== APP ====================
export function App() {
  const [data, setData] = useState<D>(loadData);
  const [page, setPage] = useState(data.onboarded ? 'home' : 'onboarding');
  const [xpPop, setXpPop] = useState<number | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [lvlUp, setLvlUp] = useState(false);
  const [jt, setJt] = useState<string | null>(null); // just toggled
  const pLvl = useRef(data.level);

  useEffect(() => { save('gs3', data); }, [data]);
  useEffect(() => { if (xpPop !== null) { const t = setTimeout(() => setXpPop(null), 1800); return () => clearTimeout(t); } }, [xpPop]);
  useEffect(() => { if (confetti) { const t = setTimeout(() => setConfetti(false), 3000); return () => clearTimeout(t); } }, [confetti]);
  useEffect(() => { if (lvlUp) { const t = setTimeout(() => setLvlUp(false), 2500); return () => clearTimeout(t); } }, [lvlUp]);
  useEffect(() => { if (jt) { const t = setTimeout(() => setJt(null), 600); return () => clearTimeout(t); } }, [jt]);
  useEffect(() => { if (data.level > pLvl.current) { setLvlUp(true); setConfetti(true); } pLvl.current = data.level; }, [data.level]);

  function axp(a: number) { setData(d => { const nx = d.xp + a; return { ...d, xp: nx, level: lvl4xp(nx) }; }); setXpPop(a); }

  const t = td();
  const hasTr = data.trainingDays.includes(t);
  const hasNf = data.noFastfoodDays.includes(t);
  const hasWt = data.weightEntries.some(e => e.date === t);
  const ms = miniStreak(data.trainingDays, data.noFastfoodDays);
  const ss = superStreak(data.trainingDays);
  const wtc = weekTrainCount(data.trainingDays);
  const { i: xpI, n: xpN } = xpInLvl(data.xp);

  function doTr() { if (hasTr) return; setData(d => { const nd = { ...d, trainingDays: [...d.trainingDays, t] }; const s = miniStreak(nd.trainingDays, nd.noFastfoodDays); nd.goals = updGoals(nd.goals, nd, s); return nd; }); axp(50); setConfetti(true); setJt('tr'); }
  function doNf() { if (hasNf) return; setData(d => { const nd = { ...d, noFastfoodDays: [...d.noFastfoodDays, t] }; const s = miniStreak(nd.trainingDays, nd.noFastfoodDays); nd.goals = updGoals(nd.goals, nd, s); return nd; }); axp(15); setJt('nf'); }
  function doWt(kg: number) { if (hasWt) return; setData(d => ({ ...d, weightEntries: [...d.weightEntries, { date: t, kg }] })); axp(20); }
  function addGoal(g: Goal) { setData(d => { const s = miniStreak(d.trainingDays, d.noFastfoodDays); return { ...d, goals: updGoals([...d.goals, g], d, s) }; }); }
  function incGoal(id: string, delta: number) { setData(d => ({ ...d, goals: d.goals.map(g => { if (g.id !== id || g.done) return g; const nc = Math.max(0, g.current + delta); const dn = nc >= g.target; return { ...g, current: nc, done: dn, doneAt: dn ? Date.now() : null }; }) })); }
  function addTennis(m: TM) { setData(d => ({ ...d, tennisSessions: [...d.tennisSessions, m] })); axp(30); }

  if (page === 'onboarding') return <><style>{CSS}</style><Onboarding onDone={n => { setData(d => ({ ...d, name: n, onboarded: true })); axp(10); setPage('home'); }} /></>;

  const trainSet = new Set(data.trainingDays);
  const noffSet = new Set(data.noFastfoodDays);

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', paddingTop: safeTop, paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 0px))', background: C.bg, color: C.txt }}>
      <style>{CSS}</style>

      {/* ===== HOME ===== */}
      {page === 'home' && <div class="stag" style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
        <div style={{ textAlign: 'center', padding: '2px 0 4px' }}>
          <div style={{ fontSize: '11px', color: C.mut, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 700 }}>GymStreak</div>
          <div style={{ fontSize: '22px', fontWeight: 800 }}>Cześć, {data.name || 'Sportowcu'}!</div>
        </div>

        <Tog emoji={hasTr ? '✅' : '🏋️'} label="Trening" xp={50} done={hasTr} bounce={jt === 'tr'} onTap={doTr} />
        <Tog emoji={hasNf ? '✅' : '🥗'} label="Dzień bez fastfoodu" xp={15} done={hasNf} bounce={jt === 'nf'} onTap={doNf} />

        {/* Streak card */}
        <div style={{ background: C.card, borderRadius: '16px', padding: '16px', border: `1px solid ${C.brd}`, position: 'relative', overflow: 'hidden' }}>
          {/* Streaks row */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginBottom: '10px' }}>
            {/* Mini streak */}
            <div style={{ textAlign: 'center', position: 'relative' }}>
              {ms > 0 && <div style={{ position: 'absolute', top: '-6px', left: '50%', transform: 'translateX(-50%)', width: '50px', height: '50px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,150,0,.25) 0%,transparent 70%)', animation: 'glow 2s ease-in-out infinite', pointerEvents: 'none' }} />}
              <div style={{ fontSize: '36px', lineHeight: 1, position: 'relative', filter: ms > 0 ? 'drop-shadow(0 0 6px rgba(255,150,0,.4))' : 'grayscale(1) opacity(.35)', animation: ms > 0 ? 'flame 1.5s ease-in-out infinite' : 'none' }}>🔥</div>
              <div style={{ fontSize: '26px', fontWeight: 800, position: 'relative' }}>{ms}</div>
              <div style={{ fontSize: '10px', color: C.mut, fontWeight: 600 }}>DNI Z RZĘDU</div>
            </div>
            {/* Super streak */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '36px', lineHeight: 1, filter: ss > 0 ? 'drop-shadow(0 0 6px rgba(206,130,255,.4))' : 'grayscale(1) opacity(.35)' }}>💎</div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: ss > 0 ? C.pur : C.mut }}>{ss}</div>
              <div style={{ fontSize: '10px', color: C.mut, fontWeight: 600 }}>TYGODNI 3+ TREN.</div>
            </div>
          </div>

          {/* Weekly progress */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
              <span style={{ color: C.tx2, fontWeight: 600 }}>Treningi w tym tyg.</span>
              <span style={{ fontWeight: 700, color: wtc >= 3 ? C.grn : C.txt }}>{wtc}/3</span>
            </div>
            <div style={{ height: '8px', borderRadius: '4px', background: C.elev, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: '4px', background: wtc >= 3 ? `linear-gradient(90deg,${C.grn},#7cdb36)` : `linear-gradient(90deg,${C.blu},#49c0f8)`, width: `${Math.min(100, (wtc / 3) * 100)}%`, transition: 'width .6s cubic-bezier(.34,1.56,.64,1)' }} />
            </div>
          </div>

          {/* 7-day dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '5px' }}>
            {l7().map(d => {
              const ht = trainSet.has(d), hn = noffSet.has(d), both = ht && hn, isT = d === t;
              return <div key={d} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                <div style={{ fontSize: '9px', color: C.mut, textTransform: 'uppercase', fontWeight: 700 }}>{dl(d)}</div>
                <div style={{ width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', background: both ? C.grn : ht ? C.blu : hn ? C.org : 'transparent', border: `2px solid ${both ? C.grn : ht ? C.blu : hn ? C.org : isT ? C.grn : C.brS}`, boxShadow: isT && !both && !ht && !hn ? '0 0 0 3px rgba(88,204,2,.15)' : both ? '0 0 6px rgba(88,204,2,.3)' : 'none', animation: both ? 'dotPop .4s cubic-bezier(.34,1.56,.64,1)' : isT && !both && !ht && !hn ? 'tPulse 2s ease-in-out infinite' : 'none', color: '#fff', fontWeight: 700 }}>
                  {both ? '✓' : ht ? '💪' : hn ? '🥗' : ''}
                </div>
              </div>;
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '6px', fontSize: '9px', color: C.mut }}>
            <span><span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: C.grn, marginRight: '3px' }} />Oba</span>
            <span><span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: C.blu, marginRight: '3px' }} />Trening</span>
            <span><span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: C.org, marginRight: '3px' }} />Bez FF</span>
          </div>
        </div>

        {/* XP */}
        <div style={{ background: C.card, borderRadius: '16px', padding: '14px 16px', border: `1px solid ${C.brd}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontWeight: 700, fontSize: '14px' }}>Poziom {data.level}</span>
            <span style={{ color: C.blu, fontWeight: 700, fontSize: '13px' }}>{data.xp} XP</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: `linear-gradient(135deg,${C.blu},${C.bluD})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px', flexShrink: 0, boxShadow: `0 2px 0 ${C.bluD}` }}>{data.level}</div>
            <div style={{ flex: 1 }}>
              <div style={{ height: '10px', borderRadius: '5px', background: C.elev, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: '5px', background: `linear-gradient(90deg,${C.blu},#49c0f8)`, width: `${Math.min(100, (xpI / xpN) * 100)}%`, transition: 'width .8s cubic-bezier(.34,1.56,.64,1)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, width: '40%', height: '100%', background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.2),transparent)', animation: 'shimmer 2.5s ease-in-out infinite 1s' }} />
                </div>
              </div>
              <div style={{ fontSize: '10px', color: C.mut, marginTop: '3px' }}>{xpI}/{xpN} XP</div>
            </div>
          </div>
        </div>
      </div>}

      {page === 'weight' && <WPage entries={data.weightEntries} done={hasWt} onAdd={doWt} onBack={() => setPage('home')} />}
      {page === 'goals' && <GPage goals={data.goals} onAdd={addGoal} onInc={incGoal} onBack={() => setPage('home')} />}
      {page === 'tennis' && <TPage sessions={data.tennisSessions} onAdd={addTennis} onBack={() => setPage('home')} />}
      {page === 'settings' && <SPage name={data.name} onName={n => setData(d => ({ ...d, name: n }))} onReset={() => { localStorage.removeItem('gs3'); setData(DEF); setPage('onboarding'); }} onBack={() => setPage('home')} />}

      {data.onboarded && <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100, display: 'flex', background: '#111827', borderTop: '1px solid rgba(255,255,255,.06)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {[{ id: 'home', l: 'Home', e: '🏠' }, { id: 'weight', l: 'Waga', e: '⚖️' }, { id: 'goals', l: 'Cele', e: '🎯' }, { id: 'tennis', l: 'Tenis', e: '🎾' }, { id: 'settings', l: 'Ustawienia', e: '⚙️' }].map(tb =>
          <button key={tb.id} onClick={() => setPage(tb.id)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px', height: '54px', background: 'none', border: 'none', color: page === tb.id ? C.grn : C.mut, fontSize: '9px', fontWeight: 600 }}>
            <span style={{ fontSize: '18px' }}>{tb.e}</span><span>{tb.l}</span>
          </button>
        )}
      </div>}

      {xpPop !== null && <div style={{ position: 'fixed', top: `calc(${safeTop} + 60px)`, left: '50%', zIndex: 300, pointerEvents: 'none', fontSize: '28px', fontWeight: 800, color: C.yel, textShadow: '0 0 20px rgba(255,200,0,.6), 0 2px 4px rgba(0,0,0,.4)', animation: 'xpPop 1.8s cubic-bezier(.34,1.56,.64,1) forwards' }}>+{xpPop} XP</div>}
      {confetti && <Confetti />}
      {lvlUp && <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', animation: 'bounceIn .6s cubic-bezier(.34,1.56,.64,1)' }}>
        <div style={{ fontSize: '64px', animation: 'lvlUp .8s ease both' }}>🎉</div>
        <div style={{ fontSize: '32px', fontWeight: 800, color: C.yel, marginTop: '12px', textShadow: '0 0 30px rgba(255,200,0,.5)' }}>LEVEL UP!</div>
        <div style={{ fontSize: '20px', fontWeight: 700, color: C.tx2, marginTop: '8px' }}>Poziom {data.level}</div>
      </div>}
    </div>
  );
}

// ==================== PAGES ====================

function Onboarding({ onDone }: { onDone: (n: string) => void }) {
  const [name, setName] = useState('');
  return <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px', paddingTop: `calc(${safeTop} + 32px)`, gap: '24px', textAlign: 'center', background: C.bg, color: C.txt }}>
    <div style={{ fontSize: '64px', animation: 'iFloat 3s ease-in-out infinite' }}>🔥</div>
    <h1 style={{ fontSize: '28px', fontWeight: 800 }}>Witaj w GymStreak!</h1>
    <p style={{ color: C.tx2, fontSize: '15px', maxWidth: '280px' }}>Twój motywator do siłowni i zdrowego stylu życia. Buduj streak, zdobywaj XP!</p>
    <Inp value={name} onInput={setName} placeholder="Twoje imię" />
    <GBtn label="Zaczynamy! 🚀" onClick={() => onDone(name.trim())} />
  </div>;
}

function WPage({ entries, done, onAdd, onBack }: { entries: WE[]; done: boolean; onAdd: (kg: number) => void; onBack: () => void }) {
  const [w, setW] = useState(entries.length > 0 ? entries[entries.length - 1].kg : 80);
  return <div class="stag" style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
    <Hdr title="Waga" onBack={onBack} />
    <div style={{ background: C.card, borderRadius: '16px', padding: '24px', textAlign: 'center', border: `1px solid ${C.brd}` }}>
      <div style={{ fontSize: '40px', fontWeight: 800, marginBottom: '16px' }}>{w.toFixed(1)} <span style={{ fontSize: '16px', color: C.mut }}>kg</span></div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
        {[-1, -0.1, 0.1, 1].map(d => <button key={d} onClick={() => setW(v => Math.max(30, +(v + d).toFixed(1)))} style={{ width: '52px', height: '52px', borderRadius: '50%', background: C.elev, border: `1px solid ${C.brd}`, color: '#fff', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{d > 0 ? '+' : ''}{d}</button>)}
      </div>
      {done ? <div style={{ padding: '14px', borderRadius: '14px', background: 'rgba(88,204,2,.1)', border: `1px solid ${C.grn}`, color: C.grn, fontWeight: 700, fontSize: '14px' }}>✅ Już dodano wagę na dziś</div> : <GBtn label="Zapisz wagę 💪" onClick={() => onAdd(w)} />}
    </div>
    <div>
      <div style={{ fontWeight: 700, marginBottom: '8px' }}>Historia</div>
      {entries.length === 0 ? <div style={{ color: C.mut, textAlign: 'center', padding: '24px' }}>Brak wpisów</div> : [...entries].reverse().slice(0, 20).map((e, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${C.brd}`, fontSize: '14px' }}><span style={{ color: C.mut }}>{e.date}</span><span style={{ fontWeight: 700 }}>{e.kg.toFixed(1)} kg</span></div>)}
    </div>
  </div>;
}

function GPage({ goals, onAdd, onInc, onBack }: { goals: Goal[]; onAdd: (g: Goal) => void; onInc: (id: string, d: number) => void; onBack: () => void }) {
  const [sf, setSf] = useState(false); const [step, setStep] = useState<'pick' | 'cfg'>('pick');
  const [pk, setPk] = useState<typeof GPRESETS[0] | null>(null); const [tgt, setTgt] = useState(''); const [cn, setCn] = useState('');
  function hPick(p: typeof GPRESETS[0]) { setPk(p); setTgt(String(p.def)); setCn(''); setStep('cfg'); }
  function hCreate() { if (!pk) return; const v = parseFloat(tgt); if (!v || v <= 0) return; const title = pk.kind === 'custom' ? (cn.trim() || 'Własny cel') : pk.label; onAdd({ id: rid(), kind: pk.kind, title, emoji: pk.emoji, target: v, current: 0, done: false, doneAt: null }); setSf(false); setStep('pick'); setPk(null); }
  const active = goals.filter(g => !g.done), done = goals.filter(g => g.done);
  return <div class="stag" style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
    <Hdr title="Cele" onBack={onBack} />
    {active.length === 0 && !sf && <div style={{ textAlign: 'center', padding: '40px 16px', color: C.mut }}><div style={{ fontSize: '48px', marginBottom: '12px' }}>🎯</div><div>Ustaw sobie cel i śledź postępy!</div></div>}
    {active.map(g => { const pct = g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0; return <div key={g.id} style={{ background: C.card, borderRadius: '16px', padding: '16px', border: `1px solid ${C.brd}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}><span style={{ fontSize: '20px' }}>{g.emoji}</span><span style={{ fontWeight: 700, flex: 1, fontSize: '14px' }}>{g.title}</span><span style={{ fontSize: '13px', color: C.tx2, fontWeight: 600 }}>{g.current}/{g.target}</span></div>
      <div style={{ height: '8px', borderRadius: '4px', background: C.elev, overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: '4px', background: pct >= 100 ? `linear-gradient(90deg,${C.grn},#7cdb36)` : `linear-gradient(90deg,${C.blu},#49c0f8)`, width: `${pct}%`, transition: 'width .6s cubic-bezier(.34,1.56,.64,1)' }} /></div>
      {g.kind === 'custom' && <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '10px' }}>
        <button onClick={() => onInc(g.id, -1)} style={{ width: '44px', height: '44px', borderRadius: '50%', background: C.elev, border: `1px solid ${C.brd}`, color: '#fff', fontWeight: 700, fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
        <button onClick={() => onInc(g.id, 1)} style={{ width: '44px', height: '44px', borderRadius: '50%', background: C.grn, border: 'none', color: '#1a1a2e', fontWeight: 700, fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 3px 0 ${C.grnD}` }}>+</button>
      </div>}
    </div>; })}
    {done.length > 0 && <div><div style={{ fontSize: '13px', fontWeight: 600, color: C.tx2, marginBottom: '6px' }}>✅ Ukończone ({done.length})</div>{done.map(g => <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: `1px solid ${C.brd}`, fontSize: '13px' }}><span>{g.emoji}</span><span style={{ flex: 1, fontWeight: 600 }}>{g.title}</span><span style={{ color: C.grn, fontWeight: 700 }}>✓</span></div>)}</div>}
    {sf ? <div style={{ background: C.card, borderRadius: '16px', padding: '20px', border: `1px solid ${C.brd}`, display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontWeight: 700 }}>Nowy cel</div>
      {step === 'pick' ? GPRESETS.map(p => <button key={p.kind} onClick={() => hPick(p)} style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '52px', padding: '0 14px', background: C.elev, border: `1px solid ${C.brd}`, borderRadius: '12px', color: '#fff', fontSize: '14px', fontWeight: 600, width: '100%', textAlign: 'left' }}><span style={{ fontSize: '18px' }}>{p.emoji}</span>{p.label}</button>) : <>
        {pk?.kind === 'custom' && <Inp value={cn} onInput={setCn} placeholder="Nazwa celu" />}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Inp value={tgt} onInput={setTgt} placeholder="Cel" type="number" /><span style={{ color: C.mut, fontWeight: 600, minWidth: '40px', fontSize: '13px' }}>{pk?.unit}</span></div>
        <div style={{ display: 'flex', gap: '8px' }}><button onClick={() => { setStep('pick'); setPk(null); }} style={{ flex: 1, padding: '14px', borderRadius: '14px', background: 'transparent', border: `2px solid ${C.brS}`, color: '#fff', fontSize: '15px', fontWeight: 700 }}>Wstecz</button><GBtn label="Utwórz" disabled={!parseFloat(tgt)} onClick={hCreate} /></div>
      </>}
      <button onClick={() => { setSf(false); setStep('pick'); setPk(null); }} style={{ padding: '8px', background: 'none', border: 'none', color: C.mut, fontSize: '13px' }}>Anuluj</button>
    </div> : <GBtn label="Dodaj cel ➕" onClick={() => setSf(true)} />}
  </div>;
}

// ==================== TENNIS ====================
function TPage({ sessions, onAdd, onBack }: { sessions: TM[]; onAdd: (m: TM) => void; onBack: () => void }) {
  const [sf, setSf] = useState(false);
  const [opp, setOpp] = useState(''); const [ms, setMs] = useState(''); const [os, setOs] = useState('');
  const [won, setWon] = useState(true); const [notes, setNotes] = useState(''); const [exp, setExp] = useState<string | null>(null);

  function handleAdd() {
    if (!opp.trim()) return;
    onAdd({ id: rid(), date: td(), opponent: opp.trim(), myScore: ms.trim(), oppScore: os.trim(), won, notes: notes.trim() });
    setOpp(''); setMs(''); setOs(''); setWon(true); setNotes(''); setSf(false);
  }

  const total = sessions.length;
  const wins = sessions.filter(s => s.won).length;
  const winPct = total > 0 ? Math.round((wins / total) * 100) : 0;
  // Win streak from newest
  let winStreak = 0;
  for (let i = sessions.length - 1; i >= 0; i--) { if (sessions[i].won) winStreak++; else break; }

  return <div class="stag" style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
    <Hdr title="Tenis 🎾" onBack={onBack} />

    {/* Stats */}
    {total > 0 && <div style={{ display: 'flex', gap: '8px' }}>
      {[{ l: 'Sparingi', v: total, c: C.blu }, { l: 'Wygrane', v: `${wins} (${winPct}%)`, c: C.grn }, { l: 'Seria W', v: winStreak, c: C.yel }].map((s, i) =>
        <div key={i} style={{ flex: 1, background: C.card, borderRadius: '12px', padding: '12px 8px', textAlign: 'center', border: `1px solid ${C.brd}` }}>
          <div style={{ fontSize: '10px', color: C.mut, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{s.l}</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: s.c, marginTop: '2px' }}>{s.v}</div>
        </div>
      )}
    </div>}

    {/* Add form */}
    {sf ? <div style={{ background: C.card, borderRadius: '16px', padding: '20px', border: `1px solid ${C.brd}`, display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontWeight: 700 }}>Nowy sparing</div>
      <Inp value={opp} onInput={setOpp} placeholder="Przeciwnik" />
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1 }}><div style={{ fontSize: '11px', color: C.tx2, fontWeight: 600, marginBottom: '4px' }}>Mój wynik</div><Inp value={ms} onInput={setMs} placeholder="np. 6:3 6:4" /></div>
        <div style={{ flex: 1 }}><div style={{ fontSize: '11px', color: C.tx2, fontWeight: 600, marginBottom: '4px' }}>Wynik przec.</div><Inp value={os} onInput={setOs} placeholder="np. 3:6 4:6" /></div>
      </div>
      <div>
        <div style={{ fontSize: '11px', color: C.tx2, fontWeight: 600, marginBottom: '6px' }}>Wynik</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setWon(true)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: `2px solid ${won ? C.grn : C.brS}`, background: won ? 'rgba(88,204,2,.1)' : 'transparent', color: won ? C.grn : C.tx2, fontWeight: 700, fontSize: '15px' }}>🏆 Wygrana</button>
          <button onClick={() => setWon(false)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: `2px solid ${!won ? C.red : C.brS}`, background: !won ? 'rgba(255,75,75,.1)' : 'transparent', color: !won ? C.red : C.tx2, fontWeight: 700, fontSize: '15px' }}>Przegrana</button>
        </div>
      </div>
      <textarea value={notes} onInput={(e: any) => setNotes(e.target.value)} placeholder="Notatki (opcjonalnie)" style={{ width: '100%', padding: '12px 16px', borderRadius: '14px', border: `2px solid ${C.brS}`, background: C.inp, color: '#fff', fontSize: '15px', outline: 'none', minHeight: '60px', resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={() => setSf(false)} style={{ flex: 1, padding: '14px', borderRadius: '14px', background: 'transparent', border: `2px solid ${C.brS}`, color: '#fff', fontSize: '15px', fontWeight: 700 }}>Anuluj</button>
        <GBtn label="Zapisz (+30 XP)" disabled={!opp.trim()} onClick={handleAdd} />
      </div>
    </div> : <GBtn label="Dodaj sparing ➕" onClick={() => setSf(true)} />}

    {/* History */}
    {sessions.length === 0 && !sf && <div style={{ textAlign: 'center', padding: '40px', color: C.mut }}><div style={{ fontSize: '48px', marginBottom: '12px' }}>🎾</div><div>Zaloguj swój pierwszy sparing!</div></div>}
    {[...sessions].reverse().map(s => <div key={s.id} style={{ background: C.card, borderRadius: '14px', padding: '14px', border: `1px solid ${C.brd}`, cursor: 'pointer' }} onClick={() => setExp(exp === s.id ? null : s.id)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: s.won ? 'rgba(88,204,2,.15)' : 'rgba(255,75,75,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 800, color: s.won ? C.grn : C.red, flexShrink: 0 }}>{s.won ? 'W' : 'L'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '14px' }}>{s.opponent}</div>
          <div style={{ fontSize: '12px', color: C.mut }}>{s.date}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '14px', color: s.won ? C.grn : C.red }}>{s.myScore}</div>
          <div style={{ fontSize: '11px', color: C.mut }}>{s.oppScore}</div>
        </div>
      </div>
      {exp === s.id && s.notes && <div style={{ marginTop: '10px', padding: '10px', background: C.elev, borderRadius: '10px', fontSize: '13px', color: C.tx2 }}>{s.notes}</div>}
    </div>)}
  </div>;
}

function SPage({ name, onName, onReset, onBack }: { name: string; onName: (n: string) => void; onReset: () => void; onBack: () => void }) {
  const [n, setN] = useState(name); const [cfm, setCfm] = useState(false);
  return <div class="stag" style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
    <Hdr title="Ustawienia" onBack={onBack} />
    <div style={{ background: C.card, borderRadius: '16px', padding: '16px', border: `1px solid ${C.brd}`, display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontWeight: 700, color: C.tx2, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.05em' }}>Profil</div>
      <input type="text" value={n} onInput={(e: any) => setN(e.target.value)} onBlur={() => onName(n.trim())} placeholder="Twoje imię" style={{ width: '100%', padding: '14px 16px', borderRadius: '14px', border: `2px solid ${C.brS}`, background: C.inp, color: '#fff', fontSize: '16px', outline: 'none' }} />
    </div>
    <div style={{ background: C.card, borderRadius: '16px', padding: '16px', border: `1px solid ${C.brd}`, borderLeft: `3px solid ${C.red}` }}>
      <div style={{ fontWeight: 700, color: C.tx2, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '12px' }}>Strefa zagrożeń</div>
      {cfm ? <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '14px', color: C.tx2, textAlign: 'center' }}>Na pewno? Dane zostaną usunięte.</div>
        <button onClick={onReset} style={{ width: '100%', padding: '14px', borderRadius: '14px', background: C.red, border: 'none', color: '#fff', fontSize: '16px', fontWeight: 700 }}>Tak, resetuj</button>
        <button onClick={() => setCfm(false)} style={{ width: '100%', padding: '14px', borderRadius: '14px', background: 'transparent', border: `2px solid ${C.brS}`, color: '#fff', fontSize: '16px', fontWeight: 700 }}>Anuluj</button>
      </div> : <button onClick={() => setCfm(true)} style={{ width: '100%', padding: '14px', borderRadius: '14px', background: C.red, border: 'none', color: '#fff', fontSize: '16px', fontWeight: 700, boxShadow: '0 4px 0 #c03030' }}>Resetuj wszystkie dane</button>}
    </div>
    <div style={{ textAlign: 'center', color: C.mut, fontSize: '12px', padding: '12px 0' }}>GymStreak v3.0</div>
  </div>;
}
