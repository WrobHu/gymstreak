import { useState, useEffect, useRef } from 'preact/hooks';

// ==================== PERSISTENCE ====================
function ld<T>(k: string, fb: T): T { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } }
function sv(k: string, v: any) { localStorage.setItem(k, JSON.stringify(v)); }

// ==================== TYPES ====================
type GK = 'weekly_gym' | 'monthly_gym' | 'monthly_noff' | 'streak' | 'custom';
interface Goal { id: string; kind: GK; title: string; emoji: string; target: number; current: number; done: boolean; doneAt: number | null; }
interface WE { date: string; kg: number; }
interface TM { id: string; date: string; opponent: string; myScore: string; oppScore: string; won: boolean; notes: string; }
interface D {
  name: string; onboarded: boolean; xp: number; level: number;
  gymDays: string[]; noFastfoodDays: string[]; tennisDays: string[];
  weightEntries: WE[]; goals: Goal[]; tennisSessions: TM[]; badges: string[];
}
const DEF: D = { name:'', onboarded:false, xp:0, level:1, gymDays:[], noFastfoodDays:[], tennisDays:[], weightEntries:[], goals:[], tennisSessions:[], badges:[] };

function loadData(): D {
  const d4 = ld<D|null>('gs4', null); if (d4) return d4;
  const d3 = ld<any>('gs3', null);
  if (d3) return { ...DEF, ...d3, gymDays: d3.trainingDays||[], tennisDays:[], badges:[] };
  return DEF;
}

// ==================== HELPERS ====================
function td() { return new Date().toISOString().split('T')[0]; }
function dl(d: string) { return new Date(d+'T12:00:00').toLocaleDateString('pl-PL',{weekday:'short'}); }
function fmtDate(d: string) { return new Date(d+'T12:00:00').toLocaleDateString('pl-PL',{day:'numeric',month:'short'}); }
function l7(): string[] { const r:string[]=[]; for(let i=6;i>=0;i--) r.push(new Date(Date.now()-i*864e5).toISOString().split('T')[0]); return r; }
function prevDays(n:number): string[] { const r:string[]=[]; for(let i=1;i<=n;i++) r.push(new Date(Date.now()-i*864e5).toISOString().split('T')[0]); return r; }
function wkDates(d:string):string[] { const dt=new Date(d+'T12:00:00'); const day=dt.getDay(); const m=new Date(dt); m.setDate(dt.getDate()-((day+6)%7)); const r:string[]=[]; for(let i=0;i<7;i++){const x=new Date(m);x.setDate(m.getDate()+i);r.push(x.toISOString().split('T')[0]);} return r; }
function gm(d:string){return d.substring(0,7);}
function rid(){return Math.random().toString(36).slice(2,10);}

// ==================== XP / LEVEL ====================
function lv(xp:number){let l=1,n=100,t=0;while(t+n<=xp){t+=n;l++;n=100+(l-1)*50;}return l;}
function xpLv(xp:number){let l=1,n=100,t=0;while(t+n<=xp){t+=n;l++;n=100+(l-1)*50;}return{i:xp-t,n};}

// ==================== STREAKS ====================
function miniStreak(gym:string[],noff:string[],tennis:string[]):number {
  const all=new Set([...gym,...noff,...tennis]); const t=td(); let c=0;
  let d=new Date(t+'T12:00:00'); d.setDate(d.getDate()-1);
  while(all.has(d.toISOString().split('T')[0])){c++;d.setDate(d.getDate()-1);}
  if(all.has(t))c++; return c;
}
function superStreak(gym:string[]):number {
  const ts=new Set(gym); let c=0; const now=new Date();
  const dow=now.getDay(); const ls=new Date(now); ls.setDate(now.getDate()-(dow===0?7:dow)); ls.setHours(12,0,0,0);
  for(let w=0;;w++){const s=new Date(ls);s.setDate(ls.getDate()-w*7);const m=new Date(s);m.setDate(s.getDate()-6);let cnt=0;for(let i=0;i<7;i++){const x=new Date(m);x.setDate(m.getDate()+i);if(ts.has(x.toISOString().split('T')[0]))cnt++;}if(cnt<3)break;c++;}
  return c;
}
function wkGymCount(gym:string[]):number{const t=td();const w=wkDates(t);const s=new Set(gym);return w.filter(d=>s.has(d)).length;}

// ==================== GOALS ====================
function updGoals(goals:Goal[],data:D,ms:number):Goal[]{
  const t=td();const wk=wkDates(t);const gs=new Set(data.gymDays);const mon=gm(t);
  const wt=wk.filter(d=>gs.has(d)).length; const mt=data.gymDays.filter(d=>gm(d)===mon).length;
  const mn=data.noFastfoodDays.filter(d=>gm(d)===mon).length;
  return goals.map(g=>{if(g.done)return g;let cur=g.current;
    switch(g.kind){case'weekly_gym':cur=wt;break;case'monthly_gym':cur=mt;break;case'monthly_noff':cur=mn;break;case'streak':cur=ms;break;case'custom':break;}
    const done=cur>=g.target;return{...g,current:cur,done,doneAt:done&&!g.done?Date.now():g.doneAt};});
}

// ==================== BADGES ====================
interface Badge{id:string;name:string;emoji:string;desc:string;check:(d:D,ms:number,ss:number)=>boolean;}
const BADGES:Badge[]=[
  {id:'first_step',name:'Pierwszy Krok',emoji:'👟',desc:'Pierwszy trening',check:(d)=>d.gymDays.length>=1},
  {id:'week_warrior',name:'Tygodniowy Wojownik',emoji:'🗓️',desc:'3 treningi w tygodniu',check:(d)=>wkGymCount(d.gymDays)>=3},
  {id:'streak_3',name:'Ogień',emoji:'🔥',desc:'Streak ≥ 3 dni',check:(_,ms)=>ms>=3},
  {id:'streak_7',name:'Tydzień Mocy',emoji:'💪',desc:'Streak ≥ 7 dni',check:(_,ms)=>ms>=7},
  {id:'streak_30',name:'Miesiąc Żelaza',emoji:'⚡',desc:'Streak ≥ 30 dni',check:(_,ms)=>ms>=30},
  {id:'lvl_5',name:'Poziom 5',emoji:'⭐',desc:'Osiągnij lvl 5',check:(d)=>d.level>=5},
  {id:'lvl_10',name:'Poziom 10',emoji:'🌟',desc:'Osiągnij lvl 10',check:(d)=>d.level>=10},
  {id:'lvl_20',name:'Poziom 20',emoji:'👑',desc:'Osiągnij lvl 20',check:(d)=>d.level>=20},
  {id:'xp_500',name:'500 Club',emoji:'💎',desc:'Zdobądź 500 XP',check:(d)=>d.xp>=500},
  {id:'xp_1000',name:'Tysiącznik',emoji:'🏆',desc:'Zdobądź 1000 XP',check:(d)=>d.xp>=1000},
  {id:'super_4',name:'Miesiąc Dyscypliny',emoji:'🏅',desc:'Super streak ≥ 4 tyg.',check:(_,__,ss)=>ss>=4},
  {id:'tennis_10',name:'Tenisista',emoji:'🎾',desc:'10 treningów tenisa',check:(d)=>d.tennisDays.length>=10},
  {id:'noff_20',name:'Czyste Jedzenie',emoji:'🥗',desc:'20 dni bez FF w miesiącu',check:(d)=>d.noFastfoodDays.filter(x=>gm(x)===gm(td())).length>=20},
  {id:'weight_10',name:'Kontroler Wagi',emoji:'⚖️',desc:'10 wpisów wagi',check:(d)=>d.weightEntries.length>=10},
];
function checkBadges(d:D,ms:number,ss:number):string[]{return BADGES.filter(b=>!d.badges.includes(b.id)&&b.check(d,ms,ss)).map(b=>b.id);}

const GPRESETS:{kind:GK;emoji:string;label:string;unit:string;def:number}[]=[
  {kind:'weekly_gym',emoji:'🏋️',label:'Siłownia w tygodniu',unit:'treningi',def:3},
  {kind:'monthly_gym',emoji:'📅',label:'Siłownia w miesiącu',unit:'treningi',def:12},
  {kind:'monthly_noff',emoji:'🥗',label:'Dni bez FF w miesiącu',unit:'dni',def:20},
  {kind:'streak',emoji:'🔥',label:'Streak',unit:'dni',def:7},
  {kind:'custom',emoji:'⭐',label:'Własny cel',unit:'',def:10},
];

// ==================== COLORS ====================
const C={bg:'#1a1a2e',bg2:'#16213e',card:'#1f2b47',elev:'#2a3a5c',inp:'#162038',
  grn:'#58cc02',grnD:'#46a302',org:'#ff9600',blu:'#1cb0f6',bluD:'#0f9ad8',
  red:'#ff4b4b',yel:'#ffc800',pur:'#ce82ff',cyn:'#00d4aa',pink:'#ff6b9d',
  txt:'#fff',tx2:'#afafbf',mut:'#6b6b80',brd:'rgba(255,255,255,0.08)',brS:'rgba(255,255,255,0.15)'};
const sT='max(env(safe-area-inset-top,0px),12px)';

// ==================== CSS ====================
const CSS=`*{box-sizing:border-box;margin:0;padding:0}
@keyframes sU{from{transform:translateY(14px);opacity:.6}to{transform:translateY(0);opacity:1}}
@keyframes bI{0%{transform:scale(.3);opacity:0}50%{transform:scale(1.1);opacity:1}70%{transform:scale(.95)}100%{transform:scale(1);opacity:1}}
@keyframes cB{0%{transform:scale(1)}20%{transform:scale(.93)}40%{transform:scale(1.08)}60%{transform:scale(.97)}80%{transform:scale(1.03)}100%{transform:scale(1)}}
@keyframes xP{0%{opacity:0;transform:translateX(-50%) scale(.3)}15%{opacity:1;transform:translateX(-50%) scale(1.3)}30%{transform:translateX(-50%) scale(.95)}50%{transform:translateX(-50%) scale(1)}80%{opacity:1;transform:translateX(-50%) translateY(-12px)}100%{opacity:0;transform:translateX(-50%) translateY(-36px) scale(.8)}}
@keyframes fl{0%,100%{transform:scale(1) rotate(0)}20%{transform:scale(1.1) rotate(-3deg)}40%{transform:scale(.93) rotate(2deg)}60%{transform:scale(1.07) rotate(-1.5deg)}80%{transform:scale(.96) rotate(1deg)}}
@keyframes gl{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.15)}}
@keyframes sh{0%{transform:translateX(-150%)}100%{transform:translateX(350%)}}
@keyframes cf{0%{opacity:1;transform:translateY(0) translateX(var(--dx,0)) rotate(0)}40%{opacity:1}100%{opacity:0;transform:translateY(105vh) translateX(calc(var(--dx,0)*-1)) rotate(720deg)}}
@keyframes dP{0%{transform:scale(.4)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes tP{0%,100%{box-shadow:0 0 0 3px rgba(88,204,2,.15)}50%{box-shadow:0 0 0 6px rgba(88,204,2,.3)}}
@keyframes iF{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes lU{0%{opacity:0;transform:scale(.5)}30%{opacity:1;transform:scale(1.2)}60%{transform:scale(.9)}100%{opacity:1;transform:scale(1)}}
@keyframes bdgUnlock{0%{opacity:0;transform:scale(0) rotate(-15deg)}50%{opacity:1;transform:scale(1.2) rotate(5deg)}70%{transform:scale(.9) rotate(-2deg)}100%{opacity:1;transform:scale(1) rotate(0)}}
.st{animation:sU .3s ease}
button{font-family:inherit;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
button:active{transform:scale(.96)}
input,textarea{font-family:inherit;-webkit-appearance:none}
input::-webkit-inner-spin-button,input::-webkit-outer-spin-button{-webkit-appearance:none}
::-webkit-scrollbar{width:0;height:0}`;

// ==================== SHARED ====================
function Hdr({title,onBack}:{title:string;onBack:()=>void}){return<div style={{display:'flex',alignItems:'center',height:'48px',gap:'8px'}}><button onClick={onBack} style={{width:'44px',height:'44px',display:'flex',alignItems:'center',justifyContent:'center',background:'none',border:'none',color:'#fff',fontSize:'20px',borderRadius:'50%'}}>←</button><div style={{flex:1,fontWeight:700,fontSize:'17px',textAlign:'center'}}>{title}</div><div style={{width:'44px'}}/></div>;}
function Inp({value,onInput,placeholder,type='text'}:{value:string;onInput:(v:string)=>void;placeholder:string;type?:string}){return<input type={type} value={value} placeholder={placeholder} onInput={(e:any)=>onInput(e.target.value)} style={{width:'100%',padding:'14px 16px',borderRadius:'14px',border:`2px solid ${C.brS}`,background:C.inp,color:'#fff',fontSize:'16px',outline:'none'}}/>;}
function GB({label,disabled,onClick}:{label:string;disabled?:boolean;onClick:()=>void}){return<button onClick={onClick} disabled={disabled} style={{width:'100%',padding:'16px',borderRadius:'14px',border:'none',background:disabled?C.elev:C.grn,color:disabled?C.mut:'#1a1a2e',fontSize:'16px',fontWeight:700,boxShadow:disabled?'none':`0 5px 0 ${C.grnD}`,opacity:disabled?.6:1}}>{label}</button>;}
function Confetti(){const ps=Array.from({length:40},(_,i)=>({l:`${Math.random()*100}%`,dl:`${Math.random()*.7}s`,du:`${2+Math.random()*1.5}s`,co:[C.grn,C.org,C.pur,C.blu,C.yel,C.red][i%6],sz:5+Math.random()*8,ci:Math.random()>.5,dx:(Math.random()-.5)*60}));return<div style={{position:'fixed',inset:0,zIndex:250,pointerEvents:'none',overflow:'hidden'}}>{ps.map((p,i)=><div key={i} style={{position:'absolute',top:'-15px',left:p.l,width:`${p.sz}px`,height:`${p.sz}px`,background:p.co,borderRadius:p.ci?'50%':'2px',animation:`cf ${p.du} ease-out ${p.dl} forwards`,'--dx':`${p.dx}px`} as any}/>)}</div>;}

// ==================== APP ====================
export function App(){
  const[data,setData]=useState<D>(loadData);
  const[page,setPage]=useState(data.onboarded?'home':'onboarding');
  const[xpPop,setXpPop]=useState<number|null>(null);
  const[confetti,setConfetti]=useState(false);
  const[lvlUpS,setLvlUpS]=useState(false);
  const[jt,setJt]=useState<string|null>(null);
  const[undoGym,setUndoGym]=useState(false);
  const[undoNoff,setUndoNoff]=useState(false);
  const[showBackfill,setShowBackfill]=useState(false);
  const[newBadge,setNewBadge]=useState<Badge|null>(null);
  const pL=useRef(data.level);

  useEffect(()=>{sv('gs4',data);},[data]);
  useEffect(()=>{if(xpPop!==null){const t=setTimeout(()=>setXpPop(null),1800);return()=>clearTimeout(t);};},[xpPop]);
  useEffect(()=>{if(confetti){const t=setTimeout(()=>setConfetti(false),3000);return()=>clearTimeout(t);};},[confetti]);
  useEffect(()=>{if(lvlUpS){const t=setTimeout(()=>setLvlUpS(false),2500);return()=>clearTimeout(t);};},[lvlUpS]);
  useEffect(()=>{if(jt){const t=setTimeout(()=>setJt(null),600);return()=>clearTimeout(t);};},[jt]);
  useEffect(()=>{if(data.level>pL.current){setLvlUpS(true);setConfetti(true);}pL.current=data.level;},[data.level]);
  useEffect(()=>{if(undoGym){const t=setTimeout(()=>setUndoGym(false),10000);return()=>clearTimeout(t);};},[undoGym]);
  useEffect(()=>{if(undoNoff){const t=setTimeout(()=>setUndoNoff(false),10000);return()=>clearTimeout(t);};},[undoNoff]);
  useEffect(()=>{if(newBadge){const t=setTimeout(()=>setNewBadge(null),2500);return()=>clearTimeout(t);};},[newBadge]);

  function axp(a:number){setData(d=>{const nx=d.xp+a;return{...d,xp:nx,level:lv(nx)};});setXpPop(a);}

  function runBadges(nd:D){
    const ms=miniStreak(nd.gymDays,nd.noFastfoodDays,nd.tennisDays);
    const ss=superStreak(nd.gymDays);
    const newB=checkBadges(nd,ms,ss);
    if(newB.length>0){
      nd={...nd,badges:[...nd.badges,...newB]};
      const b=BADGES.find(x=>x.id===newB[0]);
      if(b)setNewBadge(b);
    }
    return nd;
  }

  const t=td();
  const hasGym=data.gymDays.includes(t);
  const hasNoff=data.noFastfoodDays.includes(t);
  const hasTennis=data.tennisDays.includes(t);
  const hasWt=data.weightEntries.some(e=>e.date===t);
  const ms=miniStreak(data.gymDays,data.noFastfoodDays,data.tennisDays);
  const ss=superStreak(data.gymDays);
  const wtc=wkGymCount(data.gymDays);
  const{i:xI,n:xN}=xpLv(data.xp);
  const gymSet=new Set(data.gymDays);const noffSet=new Set(data.noFastfoodDays);const tennisSet=new Set(data.tennisDays);

  function doGym(){if(hasGym)return;setData(d=>{let nd={...d,gymDays:[...d.gymDays,t]};const s=miniStreak(nd.gymDays,nd.noFastfoodDays,nd.tennisDays);nd.goals=updGoals(nd.goals,nd,s);nd=runBadges(nd);return nd;});axp(50);setConfetti(true);setJt('gym');setUndoGym(true);}
  function undoGymF(){setData(d=>{const nd={...d,gymDays:d.gymDays.filter(x=>x!==t),xp:Math.max(0,d.xp-50)};nd.level=lv(nd.xp);return nd;});setUndoGym(false);}
  function doNoff(){if(hasNoff)return;setData(d=>{let nd={...d,noFastfoodDays:[...d.noFastfoodDays,t]};const s=miniStreak(nd.gymDays,nd.noFastfoodDays,nd.tennisDays);nd.goals=updGoals(nd.goals,nd,s);nd=runBadges(nd);return nd;});axp(15);setJt('nf');setUndoNoff(true);}
  function undoNoffF(){setData(d=>{const nd={...d,noFastfoodDays:d.noFastfoodDays.filter(x=>x!==t),xp:Math.max(0,d.xp-15)};nd.level=lv(nd.xp);return nd;});setUndoNoff(false);}
  function doTennis(){if(hasTennis)return;setData(d=>{let nd={...d,tennisDays:[...d.tennisDays,t]};nd=runBadges(nd);return nd;});axp(30);setConfetti(true);setJt('tn');}
  function doWt(kg:number){if(hasWt)return;setData(d=>({...d,weightEntries:[...d.weightEntries,{date:t,kg}]}));axp(20);}
  function addGoal(g:Goal){setData(d=>{const s=miniStreak(d.gymDays,d.noFastfoodDays,d.tennisDays);return{...d,goals:updGoals([...d.goals,g],d,s)};});}
  function delGoal(id:string){setData(d=>({...d,goals:d.goals.filter(g=>g.id!==id)}));}
  function incGoal(id:string,delta:number){setData(d=>({...d,goals:d.goals.map(g=>{if(g.id!==id||g.done)return g;const nc=Math.max(0,g.current+delta);const dn=nc>=g.target;return{...g,current:nc,done:dn,doneAt:dn?Date.now():null};})}));}
  function addTennisMatch(m:TM){setData(d=>{let nd={...d,tennisSessions:[...d.tennisSessions,m]};nd=runBadges(nd);return nd;});axp(30);}
  function backfill(date:string,type:'gym'|'noff'|'tennis'){
    const xpMap={gym:25,noff:8,tennis:15};
    const field=type==='gym'?'gymDays':type==='noff'?'noFastfoodDays':'tennisDays';
    setData(d=>{if((d as any)[field].includes(date))return d;let nd={...d,[field]:[...(d as any)[field],date]};const s=miniStreak(nd.gymDays,nd.noFastfoodDays,nd.tennisDays);nd.goals=updGoals(nd.goals,nd,s);nd=runBadges(nd);return nd;});
    axp(xpMap[type]);
  }
  function backfillRemove(date:string,type:'gym'|'noff'|'tennis'){
    const xpMap={gym:25,noff:8,tennis:15};
    const field=type==='gym'?'gymDays':type==='noff'?'noFastfoodDays':'tennisDays';
    setData(d=>{if(!(d as any)[field].includes(date))return d;return{...d,[field]:(d as any)[field].filter((x:string)=>x!==date),xp:Math.max(0,d.xp-xpMap[type]),level:lv(Math.max(0,d.xp-xpMap[type]))};});
  }

  if(page==='onboarding')return<><style>{CSS}</style><Onboarding onDone={n=>{setData(d=>({...d,name:n,onboarded:true}));axp(10);setPage('home');}}/></>;

  // ==================== RENDER ====================
  return(
  <div style={{minHeight:'100dvh',display:'flex',flexDirection:'column',paddingTop:sT,paddingBottom:'calc(64px + env(safe-area-inset-bottom,0px))',background:C.bg,color:C.txt}}>
  <style>{CSS}</style>

  {/* HOME */}
  {page==='home'&&<div class="st" style={{padding:'0 16px 16px',display:'flex',flexDirection:'column',gap:'12px',flex:1}}>
    <div style={{textAlign:'center',padding:'2px 0 4px'}}>
      <div style={{fontSize:'11px',color:C.mut,letterSpacing:'.08em',textTransform:'uppercase',fontWeight:700}}>GymStreak</div>
      <div style={{fontSize:'22px',fontWeight:800}}>Cześć, {data.name||'Sportowcu'}!</div>
    </div>

    {/* Toggles */}
    <div>
      <TogBtn emoji={hasGym?'✅':'🏋️'} label="Siłownia" xp={50} done={hasGym} bounce={jt==='gym'} onTap={doGym}/>
      {undoGym&&hasGym&&<button onClick={undoGymF} style={{width:'100%',padding:'8px',background:'none',border:'none',color:C.red,fontSize:'13px',fontWeight:600,marginTop:'4px'}}>↩️ Cofnij (10s)</button>}
    </div>
    <div>
      <TogBtn emoji={hasNoff?'✅':'🥗'} label="Dzień bez fastfoodu" xp={15} done={hasNoff} bounce={jt==='nf'} onTap={doNoff}/>
      {undoNoff&&hasNoff&&<button onClick={undoNoffF} style={{width:'100%',padding:'8px',background:'none',border:'none',color:C.red,fontSize:'13px',fontWeight:600,marginTop:'4px'}}>↩️ Cofnij (10s)</button>}
    </div>

    {/* Backfill link */}
    <button onClick={()=>setShowBackfill(!showBackfill)} style={{background:'none',border:'none',color:C.blu,fontSize:'13px',fontWeight:600,padding:'4px 0',textAlign:'left'}}>
      {showBackfill?'▲ Schowaj':'📅 Uzupełnij poprzednie dni'}
    </button>
    {showBackfill&&<BackfillSection data={data} onToggle={backfill} onRemove={backfillRemove}/>}

    {/* Streaks */}
    <div style={{background:C.card,borderRadius:'16px',padding:'16px',border:`1px solid ${C.brd}`,position:'relative',overflow:'hidden'}}>
      <div style={{display:'flex',justifyContent:'center',gap:'24px',marginBottom:'10px'}}>
        <div style={{textAlign:'center',position:'relative'}}>
          {ms>0&&<div style={{position:'absolute',top:'-6px',left:'50%',transform:'translateX(-50%)',width:'50px',height:'50px',borderRadius:'50%',background:'radial-gradient(circle,rgba(255,150,0,.25) 0%,transparent 70%)',animation:'gl 2s ease-in-out infinite',pointerEvents:'none'}}/>}
          <div style={{fontSize:'36px',lineHeight:1,position:'relative',filter:ms>0?'drop-shadow(0 0 6px rgba(255,150,0,.4))':'grayscale(1) opacity(.35)',animation:ms>0?'fl 1.5s ease-in-out infinite':'none'}}>🔥</div>
          <div style={{fontSize:'26px',fontWeight:800,position:'relative'}}>{ms}</div>
          <div style={{fontSize:'10px',color:C.mut,fontWeight:600}}>DNI Z RZĘDU</div>
        </div>
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:'36px',lineHeight:1,filter:ss>0?'drop-shadow(0 0 6px rgba(206,130,255,.4))':'grayscale(1) opacity(.35)'}}>💎</div>
          <div style={{fontSize:'26px',fontWeight:800,color:ss>0?C.pur:C.mut}}>{ss}</div>
          <div style={{fontSize:'10px',color:C.mut,fontWeight:600}}>TYGODNI 3+ SIŁ.</div>
        </div>
      </div>
      <div style={{marginBottom:'10px'}}>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',marginBottom:'4px'}}>
          <span style={{color:C.tx2,fontWeight:600}}>Siłownia w tym tyg.</span>
          <span style={{fontWeight:700,color:wtc>=3?C.grn:C.txt}}>{wtc}/3</span>
        </div>
        <div style={{height:'8px',borderRadius:'4px',background:C.elev,overflow:'hidden'}}>
          <div style={{height:'100%',borderRadius:'4px',background:wtc>=3?`linear-gradient(90deg,${C.grn},#7cdb36)`:`linear-gradient(90deg,${C.blu},#49c0f8)`,width:`${Math.min(100,(wtc/3)*100)}%`,transition:'width .6s cubic-bezier(.34,1.56,.64,1)'}}/>
        </div>
      </div>
      <div style={{display:'flex',justifyContent:'center',gap:'5px'}}>
        {l7().map(d=>{const hg=gymSet.has(d),hn=noffSet.has(d),ht=tennisSet.has(d);const any=hg||hn||ht;const isT=d===t;
          return<div key={d} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'2px'}}>
            <div style={{fontSize:'9px',color:C.mut,textTransform:'uppercase',fontWeight:700}}>{dl(d)}</div>
            <div style={{width:'30px',height:'30px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',
              background:hg&&hn?C.grn:hg?C.blu:ht?C.cyn:hn?C.org:'transparent',
              border:`2px solid ${hg&&hn?C.grn:hg?C.blu:ht?C.cyn:hn?C.org:isT?C.grn:C.brS}`,
              boxShadow:any?'0 0 6px rgba(88,204,2,.3)':isT?'0 0 0 3px rgba(88,204,2,.15)':'none',
              animation:any?'dP .4s cubic-bezier(.34,1.56,.64,1)':isT?'tP 2s ease-in-out infinite':'none',
              color:'#fff',fontWeight:700}}>
              {hg&&hn?'✓':hg?'💪':ht?'🎾':hn?'🥗':''}
            </div>
          </div>;})}
      </div>
      <div style={{display:'flex',justifyContent:'center',gap:'8px',marginTop:'6px',fontSize:'9px',color:C.mut}}>
        <span>🟢 Sił+FF</span><span>🔵 Siłownia</span><span>🟡 Bez FF</span><span style={{color:C.cyn}}>● Tenis</span>
      </div>
    </div>

    {/* XP */}
    <div style={{background:C.card,borderRadius:'16px',padding:'14px 16px',border:`1px solid ${C.brd}`}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'6px'}}>
        <span style={{fontWeight:700,fontSize:'14px'}}>Poziom {data.level}</span>
        <span style={{color:C.blu,fontWeight:700,fontSize:'13px'}}>{data.xp} XP</span>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
        <div style={{width:'30px',height:'30px',borderRadius:'50%',background:`linear-gradient(135deg,${C.blu},${C.bluD})`,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:'13px',flexShrink:0,boxShadow:`0 2px 0 ${C.bluD}`}}>{data.level}</div>
        <div style={{flex:1}}>
          <div style={{height:'10px',borderRadius:'5px',background:C.elev,overflow:'hidden'}}>
            <div style={{height:'100%',borderRadius:'5px',background:`linear-gradient(90deg,${C.blu},#49c0f8)`,width:`${Math.min(100,(xI/xN)*100)}%`,transition:'width .8s cubic-bezier(.34,1.56,.64,1)',position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',top:0,left:0,width:'40%',height:'100%',background:'linear-gradient(90deg,transparent,rgba(255,255,255,.2),transparent)',animation:'sh 2.5s ease-in-out infinite 1s'}}/>
            </div>
          </div>
          <div style={{fontSize:'10px',color:C.mut,marginTop:'3px'}}>{xI}/{xN} XP</div>
        </div>
      </div>
    </div>
  </div>}

  {page==='weight'&&<WPage entries={data.weightEntries} done={hasWt} onAdd={doWt} onBack={()=>setPage('home')}/>}
  {page==='goals'&&<GPage goals={data.goals} onAdd={addGoal} onDel={delGoal} onInc={incGoal} onBack={()=>setPage('home')}/>}
  {page==='tennis'&&<TPage sessions={data.tennisSessions} tennisDays={data.tennisDays} hasTodayTennis={hasTennis} onTrain={doTennis} onAdd={addTennisMatch} jt={jt} onBack={()=>setPage('home')}/>}
  {page==='profile'&&<ProfilePage data={data} ms={ms} ss={ss} setPage={setPage}/>}
  {page==='settings'&&<SPage name={data.name} onName={n=>setData(d=>({...d,name:n}))} onReset={()=>{localStorage.removeItem('gs4');setData(DEF);setPage('onboarding');}} onBack={()=>setPage('profile')}/>}

  {data.onboarded&&<div style={{position:'fixed',bottom:0,left:0,right:0,zIndex:100,display:'flex',background:'#111827',borderTop:'1px solid rgba(255,255,255,.06)',paddingBottom:'env(safe-area-inset-bottom,0px)'}}>
    {[{id:'home',l:'Home',e:'🏠'},{id:'weight',l:'Waga',e:'⚖️'},{id:'goals',l:'Cele',e:'🎯'},{id:'tennis',l:'Tenis',e:'🎾'},{id:'profile',l:'Profil',e:'👤'}].map(tb=>
      <button key={tb.id} onClick={()=>setPage(tb.id)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'1px',height:'54px',background:'none',border:'none',color:page===tb.id?C.grn:C.mut,fontSize:'9px',fontWeight:600}}>
        <span style={{fontSize:'18px'}}>{tb.e}</span><span>{tb.l}</span>
      </button>)}
  </div>}

  {xpPop!==null&&<div style={{position:'fixed',top:`calc(${sT} + 60px)`,left:'50%',zIndex:300,pointerEvents:'none',fontSize:'28px',fontWeight:800,color:C.yel,textShadow:'0 0 20px rgba(255,200,0,.6),0 2px 4px rgba(0,0,0,.4)',animation:'xP 1.8s cubic-bezier(.34,1.56,.64,1) forwards'}}>+{xpPop} XP</div>}
  {confetti&&<Confetti/>}
  {lvlUpS&&<div style={{position:'fixed',inset:0,zIndex:400,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,.7)',animation:'bI .6s cubic-bezier(.34,1.56,.64,1)'}}><div style={{fontSize:'64px',animation:'lU .8s ease both'}}>🎉</div><div style={{fontSize:'32px',fontWeight:800,color:C.yel,marginTop:'12px',textShadow:'0 0 30px rgba(255,200,0,.5)'}}>LEVEL UP!</div><div style={{fontSize:'20px',fontWeight:700,color:C.tx2,marginTop:'8px'}}>Poziom {data.level}</div></div>}
  {newBadge&&<div style={{position:'fixed',inset:0,zIndex:400,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,.75)',animation:'bI .5s ease'}}><div style={{fontSize:'72px',animation:'bdgUnlock .8s cubic-bezier(.34,1.56,.64,1) both'}}>{newBadge.emoji}</div><div style={{fontSize:'22px',fontWeight:800,color:C.yel,marginTop:'12px'}}>Nowa odznaka!</div><div style={{fontSize:'18px',fontWeight:700,color:C.txt,marginTop:'8px'}}>{newBadge.name}</div><div style={{fontSize:'14px',color:C.tx2,marginTop:'4px'}}>{newBadge.desc}</div></div>}
  </div>);
}

// ==================== TOGGLE BUTTON ====================
function TogBtn({emoji,label,xp,done,bounce,onTap}:{emoji:string;label:string;xp:number;done:boolean;bounce:boolean;onTap:()=>void}){
  return<button onClick={onTap} disabled={done} style={{display:'flex',alignItems:'center',gap:'14px',padding:'16px 18px',borderRadius:'16px',border:`2px solid ${done?C.grn:C.brS}`,background:done?'rgba(88,204,2,0.1)':C.card,width:'100%',textAlign:'left',color:'#fff',cursor:done?'default':'pointer',transition:'all .2s cubic-bezier(.34,1.56,.64,1)',boxShadow:done?'0 0 16px rgba(88,204,2,.12)':'0 4px 0 rgba(0,0,0,.2)',animation:bounce?'cB .6s cubic-bezier(.34,1.56,.64,1)':'none'}}>
    <span style={{fontSize:'26px',lineHeight:1,flexShrink:0}}>{emoji}</span>
    <span style={{flex:1,fontWeight:700,fontSize:'16px'}}>{label}</span>
    <span style={{fontWeight:700,fontSize:'13px',color:done?C.grn:C.mut,flexShrink:0}}>{done?'+':''}{xp} XP</span>
  </button>;
}

// ==================== BACKFILL ====================
function BackfillSection({data,onToggle,onRemove}:{data:D;onToggle:(d:string,t:'gym'|'noff'|'tennis')=>void;onRemove:(d:string,t:'gym'|'noff'|'tennis')=>void}){
  const days=prevDays(7);
  return<div style={{background:C.card,borderRadius:'14px',padding:'14px',border:`1px solid ${C.brd}`,display:'flex',flexDirection:'column',gap:'8px'}}>
    <div style={{fontSize:'13px',fontWeight:700,color:C.tx2}}>Uzupełnij poprzednie dni <span style={{color:C.mut,fontWeight:500}}>(mniej XP)</span></div>
    {days.map(d=>{
      const hg=data.gymDays.includes(d),hn=data.noFastfoodDays.includes(d),ht=data.tennisDays.includes(d);
      return<div key={d} style={{display:'flex',alignItems:'center',gap:'6px',padding:'6px 0',borderBottom:`1px solid ${C.brd}`}}>
        <div style={{fontSize:'12px',color:C.mut,fontWeight:600,minWidth:'60px'}}>{fmtDate(d)}</div>
        <BfChip label="🏋️" active={hg} onTap={()=>hg?onRemove(d,'gym'):onToggle(d,'gym')}/>
        <BfChip label="🥗" active={hn} onTap={()=>hn?onRemove(d,'noff'):onToggle(d,'noff')}/>
        <BfChip label="🎾" active={ht} onTap={()=>ht?onRemove(d,'tennis'):onToggle(d,'tennis')}/>
      </div>;
    })}
  </div>;
}
function BfChip({label,active,onTap}:{label:string;active:boolean;onTap:()=>void}){
  return<button onClick={onTap} style={{padding:'6px 10px',borderRadius:'20px',border:`1.5px solid ${active?C.grn:C.brS}`,background:active?'rgba(88,204,2,.1)':'transparent',fontSize:'14px',color:active?C.grn:C.mut,fontWeight:600,minWidth:'44px',minHeight:'36px',display:'flex',alignItems:'center',justifyContent:'center'}}>{label}{active?'✓':''}</button>;
}

// ==================== PAGES ====================
function Onboarding({onDone}:{onDone:(n:string)=>void}){const[name,setName]=useState('');return<div style={{minHeight:'100dvh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'32px',paddingTop:`calc(${sT}+32px)`,gap:'24px',textAlign:'center',background:C.bg,color:C.txt}}><div style={{fontSize:'64px',animation:'iF 3s ease-in-out infinite'}}>🔥</div><h1 style={{fontSize:'28px',fontWeight:800}}>Witaj w GymStreak!</h1><p style={{color:C.tx2,fontSize:'15px',maxWidth:'280px'}}>Twój motywator do siłowni i zdrowego stylu życia. Buduj streak, zdobywaj XP!</p><Inp value={name} onInput={setName} placeholder="Twoje imię"/><GB label="Zaczynamy! 🚀" onClick={()=>onDone(name.trim())}/></div>;}

function WPage({entries,done,onAdd,onBack}:{entries:WE[];done:boolean;onAdd:(kg:number)=>void;onBack:()=>void}){
  const[w,setW]=useState(entries.length>0?entries[entries.length-1].kg:80);
  return<div class="st" style={{padding:'0 16px 16px',display:'flex',flexDirection:'column',gap:'16px'}}>
    <Hdr title="Waga" onBack={onBack}/>
    <div style={{background:C.card,borderRadius:'16px',padding:'24px',textAlign:'center',border:`1px solid ${C.brd}`}}>
      <div style={{fontSize:'40px',fontWeight:800,marginBottom:'16px'}}>{w.toFixed(1)} <span style={{fontSize:'16px',color:C.mut}}>kg</span></div>
      <div style={{display:'flex',justifyContent:'center',gap:'8px',marginBottom:'16px'}}>
        {[-1,-.1,.1,1].map(d=><button key={d} onClick={()=>setW(v=>Math.max(30,+(v+d).toFixed(1)))} style={{width:'52px',height:'52px',borderRadius:'50%',background:C.elev,border:`1px solid ${C.brd}`,color:'#fff',fontSize:'14px',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>{d>0?'+':''}{d}</button>)}
      </div>
      {done?<div style={{padding:'14px',borderRadius:'14px',background:'rgba(88,204,2,.1)',border:`1px solid ${C.grn}`,color:C.grn,fontWeight:700,fontSize:'14px'}}>✅ Już dodano wagę na dziś</div>:<GB label="Zapisz wagę 💪" onClick={()=>onAdd(w)}/>}
    </div>
    <div><div style={{fontWeight:700,marginBottom:'8px'}}>Historia</div>{entries.length===0?<div style={{color:C.mut,textAlign:'center',padding:'24px'}}>Brak wpisów</div>:[...entries].reverse().slice(0,20).map((e,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:`1px solid ${C.brd}`,fontSize:'14px'}}><span style={{color:C.mut}}>{e.date}</span><span style={{fontWeight:700}}>{e.kg.toFixed(1)} kg</span></div>)}</div>
  </div>;
}

function GPage({goals,onAdd,onDel,onInc,onBack}:{goals:Goal[];onAdd:(g:Goal)=>void;onDel:(id:string)=>void;onInc:(id:string,d:number)=>void;onBack:()=>void}){
  const[sf,setSf]=useState(false);const[step,setStep]=useState<'pick'|'cfg'>('pick');
  const[pk,setPk]=useState<typeof GPRESETS[0]|null>(null);const[tgt,setTgt]=useState('');const[cn,setCn]=useState('');
  function hPick(p:typeof GPRESETS[0]){setPk(p);setTgt(String(p.def));setCn('');setStep('cfg');}
  function hCreate(){if(!pk)return;const v=parseFloat(tgt);if(!v||v<=0)return;const title=pk.kind==='custom'?(cn.trim()||'Własny cel'):pk.label;onAdd({id:rid(),kind:pk.kind,title,emoji:pk.emoji,target:v,current:0,done:false,doneAt:null});setSf(false);setStep('pick');setPk(null);}
  const active=goals.filter(g=>!g.done),done=goals.filter(g=>g.done);
  return<div class="st" style={{padding:'0 16px 16px',display:'flex',flexDirection:'column',gap:'14px'}}>
    <Hdr title="Cele" onBack={onBack}/>
    {active.length===0&&!sf&&<div style={{textAlign:'center',padding:'40px 16px',color:C.mut}}><div style={{fontSize:'48px',marginBottom:'12px'}}>🎯</div><div>Ustaw sobie cel i śledź postępy!</div></div>}
    {active.map(g=>{const pct=g.target>0?Math.min(100,(g.current/g.target)*100):0;return<div key={g.id} style={{background:C.card,borderRadius:'16px',padding:'14px',border:`1px solid ${C.brd}`}}>
      <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}}>
        <span style={{fontSize:'18px'}}>{g.emoji}</span><span style={{fontWeight:700,flex:1,fontSize:'14px'}}>{g.title}</span>
        <span style={{fontSize:'13px',color:C.tx2,fontWeight:600}}>{g.current}/{g.target}</span>
        <button onClick={()=>onDel(g.id)} style={{width:'32px',height:'32px',borderRadius:'50%',background:'none',border:'none',color:C.mut,fontSize:'14px',display:'flex',alignItems:'center',justifyContent:'center'}}>🗑️</button>
      </div>
      <div style={{height:'8px',borderRadius:'4px',background:C.elev,overflow:'hidden'}}><div style={{height:'100%',borderRadius:'4px',background:pct>=100?`linear-gradient(90deg,${C.grn},#7cdb36)`:`linear-gradient(90deg,${C.blu},#49c0f8)`,width:`${pct}%`,transition:'width .6s cubic-bezier(.34,1.56,.64,1)'}}/></div>
      {g.kind==='custom'&&<div style={{display:'flex',justifyContent:'center',gap:'12px',marginTop:'10px'}}>
        <button onClick={()=>onInc(g.id,-1)} style={{width:'44px',height:'44px',borderRadius:'50%',background:C.elev,border:`1px solid ${C.brd}`,color:'#fff',fontWeight:700,fontSize:'18px',display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
        <button onClick={()=>onInc(g.id,1)} style={{width:'44px',height:'44px',borderRadius:'50%',background:C.grn,border:'none',color:'#1a1a2e',fontWeight:700,fontSize:'18px',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:`0 3px 0 ${C.grnD}`}}>+</button>
      </div>}
    </div>;})}
    {done.length>0&&<div><div style={{fontSize:'13px',fontWeight:600,color:C.tx2,marginBottom:'6px'}}>✅ Ukończone ({done.length})</div>{done.map(g=><div key={g.id} style={{display:'flex',alignItems:'center',gap:'8px',padding:'8px 0',borderBottom:`1px solid ${C.brd}`,fontSize:'13px'}}><span>{g.emoji}</span><span style={{flex:1,fontWeight:600}}>{g.title}</span><span style={{color:C.grn,fontWeight:700}}>✓</span></div>)}</div>}
    {sf?<div style={{background:C.card,borderRadius:'16px',padding:'20px',border:`1px solid ${C.brd}`,display:'flex',flexDirection:'column',gap:'12px'}}>
      <div style={{fontWeight:700}}>Nowy cel</div>
      {step==='pick'?GPRESETS.map(p=><button key={p.kind} onClick={()=>hPick(p)} style={{display:'flex',alignItems:'center',gap:'12px',height:'52px',padding:'0 14px',background:C.elev,border:`1px solid ${C.brd}`,borderRadius:'12px',color:'#fff',fontSize:'14px',fontWeight:600,width:'100%',textAlign:'left'}}><span style={{fontSize:'18px'}}>{p.emoji}</span>{p.label}</button>):<>
        {pk?.kind==='custom'&&<Inp value={cn} onInput={setCn} placeholder="Nazwa celu"/>}
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}><Inp value={tgt} onInput={setTgt} placeholder="Cel" type="number"/><span style={{color:C.mut,fontWeight:600,minWidth:'40px',fontSize:'13px'}}>{pk?.unit}</span></div>
        <div style={{display:'flex',gap:'8px'}}><button onClick={()=>{setStep('pick');setPk(null);}} style={{flex:1,padding:'14px',borderRadius:'14px',background:'transparent',border:`2px solid ${C.brS}`,color:'#fff',fontSize:'15px',fontWeight:700}}>Wstecz</button><GB label="Utwórz" disabled={!parseFloat(tgt)} onClick={hCreate}/></div>
      </>}
      <button onClick={()=>{setSf(false);setStep('pick');setPk(null);}} style={{padding:'8px',background:'none',border:'none',color:C.mut,fontSize:'13px'}}>Anuluj</button>
    </div>:<GB label="Dodaj cel ➕" onClick={()=>setSf(true)}/>}
  </div>;
}

function TPage({sessions,tennisDays,hasTodayTennis,onTrain,onAdd,jt,onBack}:{sessions:TM[];tennisDays:string[];hasTodayTennis:boolean;onTrain:()=>void;onAdd:(m:TM)=>void;jt:string|null;onBack:()=>void}){
  const[sf,setSf]=useState(false);const[opp,setOpp]=useState('');const[ms,setMs]=useState('');const[os,setOs]=useState('');
  const[won,setWon]=useState(true);const[notes,setNotes]=useState('');const[exp,setExp]=useState<string|null>(null);
  function hAdd(){if(!opp.trim())return;onAdd({id:rid(),date:td(),opponent:opp.trim(),myScore:ms.trim(),oppScore:os.trim(),won,notes:notes.trim()});setOpp('');setMs('');setOs('');setWon(true);setNotes('');setSf(false);}
  const total=sessions.length,wins=sessions.filter(s=>s.won).length,winPct=total>0?Math.round((wins/total)*100):0;
  let winStr=0;for(let i=sessions.length-1;i>=0;i--){if(sessions[i].won)winStr++;else break;}
  return<div class="st" style={{padding:'0 16px 16px',display:'flex',flexDirection:'column',gap:'14px'}}>
    <Hdr title="Tenis 🎾" onBack={onBack}/>
    <TogBtn emoji={hasTodayTennis?'✅':'🎾'} label="Trening tenisowy" xp={30} done={hasTodayTennis} bounce={jt==='tn'} onTap={onTrain}/>
    {total>0&&<div style={{display:'flex',gap:'8px'}}>{[{l:'Sparingi',v:total,c:C.blu},{l:'Wygrane',v:`${wins} (${winPct}%)`,c:C.grn},{l:'Seria W',v:winStr,c:C.yel}].map((s,i)=><div key={i} style={{flex:1,background:C.card,borderRadius:'12px',padding:'10px 6px',textAlign:'center',border:`1px solid ${C.brd}`}}><div style={{fontSize:'10px',color:C.mut,fontWeight:600,textTransform:'uppercase'}}>{s.l}</div><div style={{fontSize:'18px',fontWeight:800,color:s.c as string,marginTop:'2px'}}>{s.v}</div></div>)}</div>}
    {sf?<div style={{background:C.card,borderRadius:'16px',padding:'18px',border:`1px solid ${C.brd}`,display:'flex',flexDirection:'column',gap:'10px'}}>
      <div style={{fontWeight:700}}>Nowy sparing</div>
      <Inp value={opp} onInput={setOpp} placeholder="Przeciwnik"/>
      <div style={{display:'flex',gap:'8px'}}><div style={{flex:1}}><div style={{fontSize:'11px',color:C.tx2,fontWeight:600,marginBottom:'4px'}}>Mój wynik</div><Inp value={ms} onInput={setMs} placeholder="np. 6:3 6:4"/></div><div style={{flex:1}}><div style={{fontSize:'11px',color:C.tx2,fontWeight:600,marginBottom:'4px'}}>Wynik przec.</div><Inp value={os} onInput={setOs} placeholder="np. 3:6 4:6"/></div></div>
      <div><div style={{fontSize:'11px',color:C.tx2,fontWeight:600,marginBottom:'6px'}}>Wynik</div><div style={{display:'flex',gap:'8px'}}><button onClick={()=>setWon(true)} style={{flex:1,padding:'12px',borderRadius:'12px',border:`2px solid ${won?C.grn:C.brS}`,background:won?'rgba(88,204,2,.1)':'transparent',color:won?C.grn:C.tx2,fontWeight:700,fontSize:'14px'}}>🏆 Wygrana</button><button onClick={()=>setWon(false)} style={{flex:1,padding:'12px',borderRadius:'12px',border:`2px solid ${!won?C.red:C.brS}`,background:!won?'rgba(255,75,75,.1)':'transparent',color:!won?C.red:C.tx2,fontWeight:700,fontSize:'14px'}}>Przegrana</button></div></div>
      <textarea value={notes} onInput={(e:any)=>setNotes(e.target.value)} placeholder="Notatki (opcjonalnie)" style={{width:'100%',padding:'12px 16px',borderRadius:'14px',border:`2px solid ${C.brS}`,background:C.inp,color:'#fff',fontSize:'15px',outline:'none',minHeight:'50px',resize:'vertical'}}/>
      <div style={{display:'flex',gap:'8px'}}><button onClick={()=>setSf(false)} style={{flex:1,padding:'14px',borderRadius:'14px',background:'transparent',border:`2px solid ${C.brS}`,color:'#fff',fontSize:'15px',fontWeight:700}}>Anuluj</button><GB label="Zapisz (+30 XP)" disabled={!opp.trim()} onClick={hAdd}/></div>
    </div>:<GB label="Dodaj sparing ➕" onClick={()=>setSf(true)}/>}
    {sessions.length===0&&!sf&&<div style={{textAlign:'center',padding:'40px',color:C.mut}}><div style={{fontSize:'48px',marginBottom:'12px'}}>🎾</div><div>Zaloguj swój pierwszy sparing!</div></div>}
    {[...sessions].reverse().map(s=><div key={s.id} style={{background:C.card,borderRadius:'14px',padding:'12px',border:`1px solid ${C.brd}`,cursor:'pointer'}} onClick={()=>setExp(exp===s.id?null:s.id)}>
      <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
        <div style={{width:'34px',height:'34px',borderRadius:'50%',background:s.won?'rgba(88,204,2,.15)':'rgba(255,75,75,.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px',fontWeight:800,color:s.won?C.grn:C.red,flexShrink:0}}>{s.won?'W':'L'}</div>
        <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:'14px'}}>{s.opponent}</div><div style={{fontSize:'12px',color:C.mut}}>{s.date}</div></div>
        <div style={{textAlign:'right',flexShrink:0}}><div style={{fontWeight:700,fontSize:'14px',color:s.won?C.grn:C.red}}>{s.myScore}</div><div style={{fontSize:'11px',color:C.mut}}>{s.oppScore}</div></div>
      </div>
      {exp===s.id&&s.notes&&<div style={{marginTop:'8px',padding:'8px',background:C.elev,borderRadius:'8px',fontSize:'13px',color:C.tx2}}>{s.notes}</div>}
    </div>)}
  </div>;
}

function ProfilePage({data,ms,ss,setPage}:{data:D;ms:number;ss:number;setPage:(p:string)=>void}){
  const{i:xI,n:xN}=xpLv(data.xp);const pct=Math.min(100,(xI/xN)*100);
  const initial=data.name?data.name.charAt(0).toUpperCase():'?';
  return<div class="st" style={{padding:'0 16px 16px',display:'flex',flexDirection:'column',gap:'14px'}}>
    {/* Avatar header */}
    <div style={{background:`linear-gradient(135deg,${C.bg2},${C.card})`,borderRadius:'20px',padding:'24px 16px',textAlign:'center',border:`1px solid ${C.brd}`}}>
      <div style={{position:'relative',display:'inline-block'}}>
        {/* Progress ring */}
        <svg width="80" height="80" style={{transform:'rotate(-90deg)'}}>
          <circle cx="40" cy="40" r="36" fill="none" stroke={C.elev} strokeWidth="4"/>
          <circle cx="40" cy="40" r="36" fill="none" stroke={C.blu} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${2*Math.PI*36}`} strokeDashoffset={`${2*Math.PI*36*(1-pct/100)}`} style={{transition:'stroke-dashoffset .8s cubic-bezier(.34,1.56,.64,1)'}}/>
        </svg>
        <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{width:'60px',height:'60px',borderRadius:'50%',background:`linear-gradient(135deg,${C.pur},${C.blu})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'28px',fontWeight:800,color:'#fff'}}>{initial}</div>
        </div>
      </div>
      <div style={{fontSize:'22px',fontWeight:800,marginTop:'12px'}}>{data.name||'Sportowcu'}</div>
      <div style={{fontSize:'14px',color:C.blu,fontWeight:700,marginTop:'4px'}}>Poziom {data.level} • {data.xp} XP</div>
    </div>

    {/* Stats */}
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
      {[{l:'Total XP',v:data.xp,c:C.blu,e:'⚡'},{l:'Poziom',v:data.level,c:C.pur,e:'🎖️'},{l:'Streak 🔥',v:`${ms} dni`,c:C.org,e:''},{l:'Super 💎',v:`${ss} tyg.`,c:C.pink,e:''}].map((s,i)=>
        <div key={i} style={{background:C.card,borderRadius:'14px',padding:'14px',border:`1px solid ${C.brd}`,textAlign:'center'}}>
          <div style={{fontSize:'10px',color:C.mut,fontWeight:600,textTransform:'uppercase',letterSpacing:'.04em'}}>{s.l}</div>
          <div style={{fontSize:'22px',fontWeight:800,color:s.c,marginTop:'4px'}}>{s.e}{s.v}</div>
        </div>)}
    </div>

    {/* Badges */}
    <div style={{fontWeight:700,fontSize:'16px',marginTop:'4px'}}>Odznaki <span style={{color:C.mut,fontWeight:500,fontSize:'13px'}}>({data.badges.length}/{BADGES.length})</span></div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px'}}>
      {BADGES.map(b=>{const unlocked=data.badges.includes(b.id);return<div key={b.id} style={{background:C.card,borderRadius:'12px',padding:'12px 6px',textAlign:'center',border:`1px solid ${unlocked?C.grn:C.brd}`,opacity:unlocked?1:.4}}>
        <div style={{fontSize:'28px',lineHeight:1,filter:unlocked?'none':'grayscale(1)'}}>{unlocked?b.emoji:'❓'}</div>
        <div style={{fontSize:'11px',fontWeight:600,color:unlocked?C.txt:C.mut,marginTop:'6px',lineHeight:1.2}}>{unlocked?b.name:'???'}</div>
      </div>;})}
    </div>

    {/* Settings button */}
    <button onClick={()=>setPage('settings')} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'8px',width:'100%',padding:'14px',borderRadius:'14px',background:C.card,border:`1px solid ${C.brS}`,color:C.tx2,fontSize:'15px',fontWeight:600}}>⚙️ Ustawienia</button>
  </div>;
}

function SPage({name,onName,onReset,onBack}:{name:string;onName:(n:string)=>void;onReset:()=>void;onBack:()=>void}){
  const[n,setN]=useState(name);const[cfm,setCfm]=useState(false);
  return<div class="st" style={{padding:'0 16px 16px',display:'flex',flexDirection:'column',gap:'16px'}}>
    <Hdr title="Ustawienia" onBack={onBack}/>
    <div style={{background:C.card,borderRadius:'16px',padding:'16px',border:`1px solid ${C.brd}`,display:'flex',flexDirection:'column',gap:'12px'}}>
      <div style={{fontWeight:700,color:C.tx2,fontSize:'11px',textTransform:'uppercase',letterSpacing:'.05em'}}>Profil</div>
      <input type="text" value={n} onInput={(e:any)=>setN(e.target.value)} onBlur={()=>onName(n.trim())} placeholder="Twoje imię" style={{width:'100%',padding:'14px 16px',borderRadius:'14px',border:`2px solid ${C.brS}`,background:C.inp,color:'#fff',fontSize:'16px',outline:'none'}}/>
    </div>
    <div style={{background:C.card,borderRadius:'16px',padding:'16px',border:`1px solid ${C.brd}`,borderLeft:`3px solid ${C.red}`}}>
      <div style={{fontWeight:700,color:C.tx2,fontSize:'11px',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'12px'}}>Strefa zagrożeń</div>
      {cfm?<div style={{display:'flex',flexDirection:'column',gap:'8px'}}><div style={{fontSize:'14px',color:C.tx2,textAlign:'center'}}>Na pewno? Dane zostaną usunięte.</div><button onClick={onReset} style={{width:'100%',padding:'14px',borderRadius:'14px',background:C.red,border:'none',color:'#fff',fontSize:'16px',fontWeight:700}}>Tak, resetuj</button><button onClick={()=>setCfm(false)} style={{width:'100%',padding:'14px',borderRadius:'14px',background:'transparent',border:`2px solid ${C.brS}`,color:'#fff',fontSize:'16px',fontWeight:700}}>Anuluj</button></div>:
      <button onClick={()=>setCfm(true)} style={{width:'100%',padding:'14px',borderRadius:'14px',background:C.red,border:'none',color:'#fff',fontSize:'16px',fontWeight:700,boxShadow:'0 4px 0 #c03030'}}>Resetuj wszystkie dane</button>}
    </div>
    <div style={{textAlign:'center',color:C.mut,fontSize:'12px',padding:'12px 0'}}>GymStreak v4.0</div>
  </div>;
}
