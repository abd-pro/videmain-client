import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

const COMBO_LABELS = {
  single:"Carte seule",pair:"Paire",triple:"Brelan",
  straight:"Suite",flush:"Couleur",full_house:"Full House",
  four_of_a_kind:"Carré",straight_flush:"Quinte Flush"
};
const SUIT_COLOR = {"♥":"#dc2626","♦":"#dc2626","♣":"#1e293b","♠":"#1e293b"};
const SUIT_BG    = {"♥":"#fff1f2","♦":"#fff1f2","♣":"#f8fafc","♠":"#f8fafc"};
const FIVE_ORDER = ["straight","flush","full_house","four_of_a_kind","straight_flush"];
const VALUES     = ["3","4","5","6","7","8","9","10","J","Q","K","A","2"];
const SUIT_RANK  = {"♦":0,"♣":1,"♥":2,"♠":3};
const VALUE_RANK = Object.fromEntries(VALUES.map((v,i)=>[v,i]));

// ── THÈMES ────────────────────────────────────────────────────────
const THEMES = {
  violet:  { name:"Violet",    felt:"#0f3320", feltInner:"#123d25", wood:"#3d2200", room:"#0a0010", card:"#3730a3", cardBorder:"#4338ca", accent:"#7c3aed" },
  ocean:   { name:"Océan",     felt:"#0c2a3d", feltInner:"#0f3550", wood:"#1a3a2a", room:"#020c14", card:"#0369a1", cardBorder:"#0284c7", accent:"#0ea5e9" },
  rouge:   { name:"Rouge",     felt:"#3d0f0f", feltInner:"#501515", wood:"#2d1200", room:"#100005", card:"#991b1b", cardBorder:"#dc2626", accent:"#ef4444" },
  nuit:    { name:"Nuit",      felt:"#1a1a2e", feltInner:"#16213e", wood:"#0a0a1a", room:"#050510", card:"#1e1b4b", cardBorder:"#3730a3", accent:"#818cf8" },
  foret:   { name:"Forêt",     felt:"#14301a", feltInner:"#1a3d22", wood:"#2d1f00", room:"#050f05", card:"#14532d", cardBorder:"#166534", accent:"#22c55e" },
};

const SKINS = [
  { id:"default", name:"Classique",  body:"#7c3aed", pants:"#4c1d95", shoes:"#1e1b4b", hair:"#1e1b4b", skin:"#fbbf24" },
  { id:"cool",    name:"Cool",       body:"#0891b2", pants:"#0e7490", shoes:"#164e63", hair:"#92400e", skin:"#fbbf24" },
  { id:"fire",    name:"Feu",        body:"#dc2626", pants:"#991b1b", shoes:"#450a0a", hair:"#78350f", skin:"#fde68a" },
  { id:"nature",  name:"Nature",     body:"#16a34a", pants:"#15803d", shoes:"#14532d", hair:"#431407", skin:"#fbbf24" },
  { id:"galaxy",  name:"Galaxy",     body:"#7e22ce", pants:"#581c87", shoes:"#1e1b4b", hair:"#312e81", skin:"#c4b5fd" },
  { id:"sunset",  name:"Coucher",    body:"#ea580c", pants:"#c2410c", shoes:"#431407", hair:"#1c1917", skin:"#fed7aa" },
];

const CARD_BACKS = [
  { id:"blue",   name:"Bleu",    color:"#3730a3", border:"#4338ca" },
  { id:"red",    name:"Rouge",   color:"#991b1b", border:"#dc2626" },
  { id:"green",  name:"Vert",    color:"#14532d", border:"#166534" },
  { id:"purple", name:"Violet",  color:"#581c87", border:"#7e22ce" },
  { id:"gold",   name:"Or",      color:"#92400e", border:"#d97706" },
  { id:"black",  name:"Noir",    color:"#0f172a", border:"#334155" },
];

function cs(c){ return VALUE_RANK[c.value]*4+SUIT_RANK[c.suit]; }

function detectCombo(cards){
  if(cards.length===1) return {type:"single",rank:cs(cards[0])};
  if(cards.length===2){
    if(cards[0].value===cards[1].value){const best=cards.reduce((a,b)=>cs(a)>cs(b)?a:b);return {type:"pair",rank:VALUE_RANK[cards[0].value]*4+SUIT_RANK[best.suit]};}
    return null;
  }
  if(cards.length===3){
    if(cards.every(c=>c.value===cards[0].value)){const best=cards.reduce((a,b)=>cs(a)>cs(b)?a:b);return {type:"triple",rank:VALUE_RANK[cards[0].value]*4+SUIT_RANK[best.suit]};}
    return null;
  }
  if(cards.length===5) return detect5(cards);
  return null;
}
function detect5(cards){
  const sorted=[...cards].sort((a,b)=>cs(a)-cs(b));
  const vals=sorted.map(c=>VALUE_RANK[c.value]);
  const suits=sorted.map(c=>c.suit);
  const isFlush=suits.every(s=>s===suits[0]);
  const isStraight=vals.every((v,i)=>i===0||v===vals[i-1]+1);
  const vc={};vals.forEach(v=>vc[v]=(vc[v]||0)+1);
  const counts=Object.values(vc).sort((a,b)=>b-a);
  if(counts[0]===4){const qv=Object.keys(vc).find(v=>vc[v]===4);const qCards=sorted.filter(c=>VALUE_RANK[c.value]===parseInt(qv));const best=qCards.reduce((a,b)=>cs(a)>cs(b)?a:b);return {type:"four_of_a_kind",rank:parseInt(qv)*4+SUIT_RANK[best.suit]+80000};}
  const best=sorted[sorted.length-1];const rank=cs(best);
  if(isFlush&&isStraight) return {type:"straight_flush",rank:rank+100000};
  if(counts[0]===3&&counts[1]===2) return {type:"full_house",rank:rank+60000};
  if(isFlush) return {type:"flush",rank:rank+40000};
  if(isStraight) return {type:"straight",rank:rank+20000};
  return null;
}
function canBeat(cur,att){
  if(!cur) return true;
  if(FIVE_ORDER.includes(cur.type)&&FIVE_ORDER.includes(att.type)){const ci=FIVE_ORDER.indexOf(cur.type),ai=FIVE_ORDER.indexOf(att.type);return ai>ci||(ai===ci&&att.rank>cur.rank);}
  if(cur.type!==att.type) return false;
  return att.rank>cur.rank;
}

// ── AVATAR SVG CARTOON ───────────────────────────────────────────
// mood: "idle" | "confident" | "worried" | "triumph" | "sad" | "thinking"
function AvatarSVG({ skin=SKINS[0], mood="idle", size=80, isActive=false }) {
  const s = skin;
  const scale = size / 120;
  const expressions = {
    idle: {
      leftBrow: "M-13,0 Q-9,-2 -5,0",
      rightBrow: "M5,0 Q9,-2 13,0",
      leftEye: {rx:5,ry:5,py:7},
      rightEye: {rx:5,ry:5,py:7},
      mouth: <path d="M-7,20 Q0,24 7,20" fill="none" stroke="#92400e" strokeWidth="2" strokeLinecap="round"/>,
      extras: null,
      hairStyle: "normal",
    },
    confident: {
      leftBrow: "M-13,-2 Q-9,-6 -5,-2",
      rightBrow: "M5,-2 Q9,-6 13,-2",
      leftEye: {rx:5,ry:3.5,py:7.5},
      rightEye: {rx:5,ry:3.5,py:7.5},
      mouth: <><path d="M-10,18 Q0,30 10,18" fill="#e07b39" stroke="#92400e" strokeWidth="1.5"/><path d="M-10,18 Q0,28 10,18" fill="white"/></>,
      extras: <><ellipse cx="-16" cy="16" rx="7" ry="5" fill="#f87171" opacity="0.4"/><ellipse cx="16" cy="16" rx="7" ry="5" fill="#f87171" opacity="0.4"/></>,
      hairStyle: "normal",
    },
    worried: {
      leftBrow: "M-15,-1 L-5,3",
      rightBrow: "M15,-1 L5,3",
      leftEye: {rx:7,ry:7,py:7},
      rightEye: {rx:7,ry:7,py:7},
      mouth: <path d="M-8,20 Q-4,17 0,20 Q4,23 8,20" fill="none" stroke="#92400e" strokeWidth="2" strokeLinecap="round"/>,
      extras: <path d="M22,-10 Q24,-6 22,-2 Q20,-6 22,-10" fill="#60a5fa"/>,
      hairStyle: "up",
    },
    triumph: {
      leftBrow: "M-14,2 Q-9,-3 -4,2",
      rightBrow: "M4,2 Q9,-3 14,2",
      leftEye: {rx:5,ry:2,py:6},
      rightEye: {rx:5,ry:2,py:6},
      mouth: <><path d="M-12,18 Q0,33 12,18" fill="#e07b39" stroke="#92400e" strokeWidth="1.5"/><path d="M-12,18 Q0,30 12,18" fill="white"/></>,
      extras: <><ellipse cx="-16" cy="16" rx="8" ry="6" fill="#f87171" opacity="0.5"/><ellipse cx="16" cy="16" rx="8" ry="6" fill="#f87171" opacity="0.5"/><rect x="-22" y="-28" width="6" height="6" rx="1" fill="#f59e0b" transform="rotate(20,-19,-25)"/><rect x="14" y="-30" width="5" height="5" rx="1" fill="#ec4899" transform="rotate(-15,16,-27)"/><rect x="-32" y="-10" width="5" height="5" rx="1" fill="#60a5fa" transform="rotate(35,-29,-7)"/></>,
      hairStyle: "crown",
    },
    sad: {
      leftBrow: "M-13,1 Q-9,4 -5,1",
      rightBrow: "M5,1 Q9,4 13,1",
      leftEye: {rx:5,ry:5,py:8},
      rightEye: {rx:5,ry:5,py:8},
      mouth: <path d="M-8,22 Q0,17 8,22" fill="none" stroke="#92400e" strokeWidth="2" strokeLinecap="round"/>,
      extras: <path d="M-14,14 Q-16,20 -14,24 Q-12,20 -14,14" fill="#60a5fa"/>,
      hairStyle: "down",
    },
    thinking: {
      leftBrow: "M-13,-1 Q-9,-4 -5,-1",
      rightBrow: "M5,-3 Q9,-6 13,-3",
      leftEye: {rx:5,ry:5,py:7},
      rightEye: {rx:5,ry:3,py:7},
      mouth: <path d="M-5,20 Q2,22 8,19" fill="none" stroke="#92400e" strokeWidth="2" strokeLinecap="round"/>,
      extras: <><text x="22" y="-15" fill="#fbbf24" fontSize="14" fontWeight="bold">?</text></>,
      hairStyle: "normal",
    },
  };
  const expr = expressions[mood] || expressions.idle;

  return (
    <svg viewBox="-45 -45 90 155" width={size} height={size*2} style={{overflow:"visible",display:"block"}}>
      {/* Halo si actif */}
      {isActive && <ellipse cx="0" cy="115" rx="32" ry="8" fill={s.body} opacity="0.3"/>}

      {/* Corps */}
      <rect x="-22" y="30" width="44" height="52" rx="10" fill={s.body}/>

      {/* Bras selon mood */}
      {mood==="triumph"
        ? <><rect x="-46" y="8" width="26" height="10" rx="5" fill={s.body} transform="rotate(-60,-33,13)"/><rect x="24" y="4" width="26" height="10" rx="5" fill={s.body} transform="rotate(60,37,9)"/></>
        : mood==="worried"
        ? <><rect x="-42" y="16" width="22" height="10" rx="5" fill={s.body} transform="rotate(-45,-31,21)"/><rect x="24" y="10" width="22" height="10" rx="5" fill={s.body} transform="rotate(45,35,15)"/></>
        : mood==="sad"
        ? <><rect x="-40" y="50" width="20" height="10" rx="5" fill={s.body} transform="rotate(25,-30,55)"/><rect x="22" y="50" width="20" height="10" rx="5" fill={s.body} transform="rotate(-25,32,55)"/></>
        : <><rect x="-38" y="34" width="18" height="10" rx="5" fill={s.body}/><rect x="22" y="34" width="18" height="10" rx="5" fill={s.body}/></>
      }

      {/* Jambes */}
      <rect x="-18" y="78" width="14" height="28" rx="7" fill={s.pants}/>
      <rect x="4" y="78" width="14" height="28" rx="7" fill={s.pants}/>
      <ellipse cx="-11" cy="107" rx="10" ry="6" fill={s.shoes}/>
      <ellipse cx="11" cy="107" rx="10" ry="6" fill={s.shoes}/>

      {/* Tête */}
      <circle cx="0" cy="10" r="28" fill={s.skin}/>
      <circle cx="0" cy="10" r="28" fill="none" stroke="#f59e0b" strokeWidth="1.5"/>

      {/* Oreilles */}
      <ellipse cx="-28" cy="10" rx="5" ry="7" fill={s.skin}/>
      <ellipse cx="28" cy="10" rx="5" ry="7" fill={s.skin}/>

      {/* Cheveux */}
      {expr.hairStyle==="crown"
        ? <polygon points="0,-18 -18,-8 -12,-22 0,-14 12,-22 18,-8" fill="#f59e0b" stroke="#d97706" strokeWidth="1"/>
        : expr.hairStyle==="up"
        ? <><path d="M-15,-8 L-18,-28 L-10,-12" fill={s.hair}/><path d="M0,-10 L0,-32 L6,-12" fill={s.hair}/><path d="M12,-8 L16,-28 L10,-12" fill={s.hair}/></>
        : <rect x="-20" y="-18" width="40" height="14" rx="7" fill={s.hair}/>
      }

      {/* Yeux */}
      <ellipse cx="-9" cy={expr.leftEye.py} rx={expr.leftEye.rx} ry={expr.leftEye.ry} fill="white"/>
      <ellipse cx="9" cy={expr.rightEye.py} rx={expr.rightEye.rx} ry={expr.rightEye.ry} fill="white"/>
      <ellipse cx="-9" cy={expr.leftEye.py+1} rx={expr.leftEye.rx-2} ry={expr.leftEye.ry-1.5} fill={s.hair}/>
      <ellipse cx="9" cy={expr.rightEye.py+1} rx={expr.rightEye.rx-2} ry={expr.rightEye.ry-1.5} fill={s.hair}/>
      <circle cx="-8" cy={expr.leftEye.py-0.5} r="1.2" fill="white"/>
      <circle cx="10" cy={expr.rightEye.py-0.5} r="1.2" fill="white"/>

      {/* Sourcils */}
      <path d={expr.leftBrow} fill="none" stroke={s.hair} strokeWidth="2.5" strokeLinecap="round"/>
      <path d={expr.rightBrow} fill="none" stroke={s.hair} strokeWidth="2.5" strokeLinecap="round"/>

      {/* Bouche */}
      {expr.mouth}

      {/* Extras (larmes, sueur, confettis...) */}
      {expr.extras}
    </svg>
  );
}

// ── CARTE ─────────────────────────────────────────────────────────
function Card({card,selected,onClick,disabled,size="md",cardBack=CARD_BACKS[0]}){
  const sc=SUIT_COLOR[card.suit];
  const bg=selected?"#ede9fe":SUIT_BG[card.suit];
  const w=size==="sm"?36:size==="xs"?22:52;
  const h=size==="sm"?52:size==="xs"?32:76;
  const fs=size==="sm"?9:size==="xs"?7:12;
  const fi=size==="sm"?14:size==="xs"?9:20;
  return (
    <div onClick={disabled?undefined:onClick} style={{
      width:w,height:h,borderRadius:6,
      background:bg,
      border:selected?`2px solid ${sc}`:"1.5px solid #e2e8f0",
      boxShadow:selected?`0 -12px 0 0 ${sc}55,0 4px 12px ${sc}33`:"0 2px 6px rgba(0,0,0,0.12)",
      display:"flex",flexDirection:"column",justifyContent:"space-between",
      cursor:disabled?"default":"pointer",
      transform:selected?"translateY(-16px) scale(1.07)":"none",
      transition:"all 0.18s cubic-bezier(0.34,1.56,0.64,1)",
      userSelect:"none",flexShrink:0,padding:"3px 4px",
    }}>
      <div>
        <div style={{fontSize:fs,fontWeight:800,color:sc,lineHeight:1}}>{card.value}</div>
        <div style={{fontSize:fs,color:sc,lineHeight:1}}>{card.suit}</div>
      </div>
      <div style={{fontSize:fi,textAlign:"center",color:sc,lineHeight:1}}>{card.suit}</div>
      <div style={{transform:"rotate(180deg)"}}>
        <div style={{fontSize:fs,fontWeight:800,color:sc,lineHeight:1}}>{card.value}</div>
        <div style={{fontSize:fs,color:sc,lineHeight:1}}>{card.suit}</div>
      </div>
    </div>
  );
}

function CardBackDisplay({cardBack,count,horiz=true}){
  return (
    <div style={{display:"flex",flexDirection:horiz?"row":"column",gap:2}}>
      {Array.from({length:Math.min(count,horiz?9:5)}).map((_,i)=>(
        <div key={i} style={{
          width:horiz?11:16,height:horiz?16:11,borderRadius:2,
          background:cardBack.color,border:`0.5px solid ${cardBack.border}`,
        }}/>
      ))}
    </div>
  );
}

// ── MAIN TRIABLE ──────────────────────────────────────────────────
function SortableHand({hand,selected,onToggle,onReorder,disabled,cardBack}){
  const [dragIdx,setDragIdx]=useState(null);
  const [overIdx,setOverIdx]=useState(null);
  const touchRef=useRef({idx:null,moved:false,startX:0,startY:0});

  function onDragStart(e,i){if(disabled)return;setDragIdx(i);e.dataTransfer.effectAllowed="move";}
  function onDragOver(e,i){e.preventDefault();if(i!==overIdx)setOverIdx(i);}
  function onDrop(e,i){e.preventDefault();if(dragIdx===null||dragIdx===i){setDragIdx(null);setOverIdx(null);return;}const h=[...hand];const[card]=h.splice(dragIdx,1);h.splice(i,0,card);onReorder(h);setDragIdx(null);setOverIdx(null);}
  function onDragEnd(){setDragIdx(null);setOverIdx(null);}
  function onTouchStart(e,i){if(disabled)return;const t=e.touches[0];touchRef.current={idx:i,moved:false,startX:t.clientX,startY:t.clientY};setDragIdx(i);}
  function onTouchMove(e){if(touchRef.current.idx===null)return;e.preventDefault();const t=e.touches[0];if(Math.abs(t.clientX-touchRef.current.startX)>5||Math.abs(t.clientY-touchRef.current.startY)>5)touchRef.current.moved=true;const el=document.elementFromPoint(t.clientX,t.clientY);const cardEl=el?.closest("[data-ci]");if(cardEl){const idx=parseInt(cardEl.dataset.ci);if(!isNaN(idx))setOverIdx(idx);}}
  function onTouchEnd(e,i){const{moved,idx}=touchRef.current;if(!moved){onToggle(hand[i]);}else if(overIdx!==null&&overIdx!==idx){const h=[...hand];const[card]=h.splice(idx,1);h.splice(overIdx,0,card);onReorder(h);}setDragIdx(null);setOverIdx(null);touchRef.current={idx:null,moved:false,startX:0,startY:0};}

  return (
    <div style={{display:"flex",gap:5,flexWrap:"wrap",minHeight:86,alignItems:"flex-end",position:"relative",paddingBottom:20}}>
      {hand.map((card,i)=>{
        const isSel=selected.some(c=>c.value===card.value&&c.suit===card.suit);
        const isDragging=dragIdx===i;
        const isOver=overIdx===i&&dragIdx!==null&&dragIdx!==i;
        return (
          <div key={`${card.value}${card.suit}`} data-ci={i}
            draggable={!disabled}
            onDragStart={e=>onDragStart(e,i)} onDragOver={e=>onDragOver(e,i)} onDrop={e=>onDrop(e,i)} onDragEnd={onDragEnd}
            onTouchStart={e=>onTouchStart(e,i)} onTouchMove={onTouchMove} onTouchEnd={e=>onTouchEnd(e,i)}
            style={{opacity:isDragging?0.3:1,transition:"transform 0.1s",transform:isOver?"translateX(10px)":"none",paddingLeft:isOver?2:0,borderLeft:isOver?"2px solid #8b5cf6":"none",cursor:disabled?"default":"grab"}}>
            <Card card={card} selected={isSel} onClick={disabled?undefined:()=>onToggle(card)} disabled={disabled} cardBack={cardBack}/>
          </div>
        );
      })}
      {!disabled&&hand.length>1&&<div style={{position:"absolute",bottom:0,left:0,right:0,textAlign:"center",fontSize:10,color:"#3d2a5e"}}>↔ glisser pour trier · cliquer pour sélectionner</div>}
    </div>
  );
}

// ── PANNEAU PERSONNALISATION ──────────────────────────────────────
function CustomizePanel({theme,skin,cardBack,onTheme,onSkin,onCardBack,onClose}){
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:16,fontFamily:"Georgia,serif"}}>
      <div style={{background:"linear-gradient(135deg,#120b2e,#0a0015)",borderRadius:20,padding:24,maxWidth:420,width:"100%",border:"1px solid rgba(139,92,246,0.4)",color:"#fff",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontSize:18,fontWeight:800,background:"linear-gradient(90deg,#c084fc,#f472b6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>🎨 Personnaliser</div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:18}}>✕</button>
        </div>

        {/* Thème salle */}
        <div style={{marginBottom:20}}>
          <div style={{color:"#7c6fa0",fontSize:11,letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>🏠 Thème de la salle</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {Object.entries(THEMES).map(([k,t])=>(
              <button key={k} onClick={()=>onTheme(k)} style={{
                padding:"8px 14px",borderRadius:10,border:theme===k?"2px solid #c084fc":"1px solid rgba(255,255,255,0.1)",
                background:theme===k?"rgba(192,132,252,0.15)":"rgba(255,255,255,0.04)",
                color:theme===k?"#c084fc":"#94a3b8",fontSize:12,cursor:"pointer",fontWeight:theme===k?700:400,
                display:"flex",alignItems:"center",gap:6,
              }}>
                <div style={{width:14,height:14,borderRadius:3,background:t.felt,border:`2px solid ${t.accent}`}}/>
                {t.name}
              </button>
            ))}
          </div>
        </div>

        {/* Skin avatar */}
        <div style={{marginBottom:20}}>
          <div style={{color:"#7c6fa0",fontSize:11,letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>👤 Tenue de l'avatar</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
            {SKINS.map(s=>(
              <button key={s.id} onClick={()=>onSkin(s.id)} style={{
                padding:"10px 8px",borderRadius:12,border:skin===s.id?"2px solid #c084fc":"1px solid rgba(255,255,255,0.08)",
                background:skin===s.id?"rgba(192,132,252,0.12)":"rgba(255,255,255,0.03)",
                cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4,
              }}>
                <AvatarSVG skin={s} mood="idle" size={48}/>
                <span style={{color:skin===s.id?"#c084fc":"#94a3b8",fontSize:10,fontWeight:skin===s.id?700:400}}>{s.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Dos des cartes */}
        <div style={{marginBottom:20}}>
          <div style={{color:"#7c6fa0",fontSize:11,letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>🃏 Dos des cartes</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {CARD_BACKS.map(cb=>(
              <button key={cb.id} onClick={()=>onCardBack(cb.id)} style={{
                padding:"10px 12px",borderRadius:10,border:cardBack===cb.id?"2px solid #c084fc":"1px solid rgba(255,255,255,0.1)",
                background:cardBack===cb.id?"rgba(192,132,252,0.12)":"rgba(255,255,255,0.03)",
                cursor:"pointer",display:"flex",alignItems:"center",gap:8,
              }}>
                <div style={{display:"flex",gap:1}}>
                  {[0,1,2].map(i=><div key={i} style={{width:10,height:14,borderRadius:2,background:cb.color,border:`0.5px solid ${cb.border}`}}/>)}
                </div>
                <span style={{color:cardBack===cb.id?"#c084fc":"#94a3b8",fontSize:11}}>{cb.name}</span>
              </button>
            ))}
          </div>
        </div>

        <button onClick={onClose} style={{width:"100%",padding:"12px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>
          ✓ Appliquer
        </button>
      </div>
    </div>
  );
}

// ── TUTORIEL ─────────────────────────────────────────────────────
const TSTEPS=[
  {title:"Bienvenue ! 🃏",text:"Soyez le premier à vider votre main pour gagner la manche. La partie dure 7 manches — le moins de points gagne !",demo:null},
  {title:"Ordre des cartes",text:"3 < 4 < … < A < 2, et ♦ < ♣ < ♥ < ♠. Le 2♠ est la carte la plus forte du jeu.",demo:["3♦","8♥","J♠","A♣","2♠"]},
  {title:"Combos valides",text:"Carte seule, Paire (2 identiques), Brelan (3 identiques). Pour 5 cartes : Suite < Couleur < Full House < Carré+kicker < Quinte Flush.",demo:["7♦","7♥","K♣","K♠"]},
  {title:"Trier votre main",text:"Glissez vos cartes pour les réorganiser. Bouton ↕ pour trier automatiquement par ordre croissant.",demo:null},
  {title:"Personnaliser",text:"Cliquez sur 🎨 pour changer les couleurs de la salle, votre tenue et le dos des cartes. Chaque joueur a ses propres préférences !",demo:null},
  {title:"Prêt à jouer ! 🎉",text:"Créez un salon, partagez le lien et défiez vos amis !",demo:null},
];
function Tutorial({onClose}){
  const [step,setStep]=useState(0);
  const cur=TSTEPS[step];
  const isLast=step===TSTEPS.length-1;
  const demo=cur.demo?cur.demo.map(s=>({suit:s.slice(-1),value:s.slice(0,-1)})):[];
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20,fontFamily:"Georgia,serif"}}>
      <div style={{background:"linear-gradient(135deg,#120b2e,#0a0015)",borderRadius:20,padding:28,maxWidth:400,width:"100%",border:"1px solid rgba(139,92,246,0.4)",color:"#fff",position:"relative"}}>
        <div style={{display:"flex",gap:5,marginBottom:20}}>
          {TSTEPS.map((_,i)=><div key={i} style={{flex:1,height:3,borderRadius:2,background:i<=step?"linear-gradient(90deg,#7c3aed,#ec4899)":"rgba(255,255,255,0.1)"}}/>)}
        </div>
        <div style={{fontSize:19,marginBottom:8}}>{cur.title}</div>
        <p style={{color:"#94a3b8",fontSize:14,lineHeight:1.7,marginBottom:18}}>{cur.text}</p>
        {demo.length>0&&<div style={{display:"flex",gap:5,justifyContent:"center",padding:14,background:"rgba(0,0,0,0.3)",borderRadius:10,marginBottom:18,flexWrap:"wrap"}}>{demo.map((c,i)=><Card key={i} card={c} disabled/>)}</div>}
        <div style={{display:"flex",gap:10}}>
          {step>0&&<button onClick={()=>setStep(s=>s-1)} style={{flex:1,padding:10,borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",color:"#94a3b8",fontWeight:700,cursor:"pointer",fontSize:14}}>← Retour</button>}
          {!isLast?<button onClick={()=>setStep(s=>s+1)} style={{flex:2,padding:10,borderRadius:10,border:"none",background:"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:14}}>Suivant →</button>
                  :<button onClick={onClose} style={{flex:2,padding:10,borderRadius:10,border:"none",background:"linear-gradient(135deg,#7c3aed,#a855f7,#ec4899)",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:14}}>🎮 Jouer !</button>}
        </div>
        <button onClick={onClose} style={{position:"absolute",top:14,right:14,background:"transparent",border:"none",color:"#334155",cursor:"pointer",fontSize:16}}>✕</button>
      </div>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────
export default function App(){
  const [socket,setSocket]=useState(null);
  const [screen,setScreen]=useState("home");
  const [playerName,setPlayerName]=useState("");
  const [roomCode,setRoomCode]=useState("");
  const [joinCode,setJoinCode]=useState("");
  const [lobbyPlayers,setLobbyPlayers]=useState([]);
  const [playerIndex,setPlayerIndex]=useState(null);
  const [gameState,setGameState]=useState(null);
  const [hand,setHand]=useState([]);
  const [selected,setSelected]=useState([]);
  const [error,setError]=useState("");
  const [isHost,setIsHost]=useState(false);
  const [showTutorial,setShowTutorial]=useState(false);
  const [showCustomize,setShowCustomize]=useState(false);
  const [chatMessages,setChatMessages]=useState([]);
  const [chatInput,setChatInput]=useState("");
  const [showChat,setShowChat]=useState(false);
  const [inviteCopied,setInviteCopied]=useState(false);
  const chatEndRef=useRef(null);

  // Préférences de personnalisation
  const [themeKey,setThemeKey]=useState("violet");
  const [skinId,setSkinId]=useState("default");
  const [cardBackId,setCardBackId]=useState("blue");

  // Humeur des adversaires (simulée selon contexte)
  const [opponentMoods,setOpponentMoods]=useState({});
  // Humeur du joueur local
  const [myMood,setMyMood]=useState("idle");

  const theme=THEMES[themeKey]||THEMES.violet;
  const skin=SKINS.find(s=>s.id===skinId)||SKINS[0];
  const cardBack=CARD_BACKS.find(c=>c.id===cardBackId)||CARD_BACKS[0];

  // Mettre à jour les humeurs selon le contexte
  useEffect(()=>{
    if(!gameState) return;
    const myPlayer=gameState.players[playerIndex];
    if(!myPlayer) return;
    // Mon humeur
    if(gameState.lastBy===playerIndex) setMyMood("confident");
    else if(gameState.passed[playerIndex]) setMyMood("sad");
    else if(gameState.curPlayer===playerIndex) setMyMood("thinking");
    else if(myPlayer.cardCount<=3) setMyMood("worried");
    else setMyMood("idle");
    // Humeurs adversaires
    const moods={};
    gameState.players.forEach((p,i)=>{
      if(i===playerIndex) return;
      if(gameState.lastBy===i) moods[p.id]="triumph";
      else if(gameState.passed[i]) moods[p.id]="sad";
      else if(p.cardCount<=3) moods[p.id]="worried";
      else if(gameState.curPlayer===i) moods[p.id]="thinking";
      else moods[p.id]="idle";
    });
    setOpponentMoods(moods);
  },[gameState,playerIndex]);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const code=params.get("join");
    if(code) setJoinCode(code.toUpperCase());
  },[]);

  useEffect(()=>{
    const s=io(SERVER_URL);
    setSocket(s);
    s.on("room:joined",({code,playerIndex:idx})=>{
      setRoomCode(code);setPlayerIndex(idx);setIsHost(idx===0);setScreen("lobby");
      window.history.replaceState({},"",window.location.pathname);
    });
    s.on("lobby:update",({players})=>setLobbyPlayers(players));
    s.on("game:state",(state)=>{
      setGameState(state);
      if(state.myHand){
        setHand(prev=>{
          const kept=prev.filter(c=>state.myHand.some(nc=>nc.value===c.value&&nc.suit===c.suit));
          const added=state.myHand.filter(nc=>!prev.some(c=>c.value===nc.value&&c.suit===nc.suit));
          return [...kept,...added];
        });
      }
      if(state.phase==="game"||state.phase==="end") setScreen("game");
    });
    s.on("room:error",(msg)=>setError(msg));
    s.on("game:chat",(msg)=>{
      setChatMessages(prev=>[...prev,msg].slice(-50));
      setTimeout(()=>chatEndRef.current?.scrollIntoView({behavior:"smooth"}),50);
    });
    return ()=>s.disconnect();
  },[]);

  function createRoom(){if(!playerName.trim()){setError("Entrez votre prénom.");return;}setError("");socket.emit("room:create",{playerName:playerName.trim()});}
  function joinRoom(){if(!playerName.trim()){setError("Entrez votre prénom.");return;}if(!joinCode.trim()){setError("Entrez le code.");return;}setError("");socket.emit("room:join",{code:joinCode.trim().toUpperCase(),playerName:playerName.trim()});}
  function startGame(){socket.emit("game:start",{code:roomCode});}
  function copyInviteLink(){const url=`${window.location.origin}${window.location.pathname}?join=${roomCode}`;navigator.clipboard.writeText(url).then(()=>{setInviteCopied(true);setTimeout(()=>setInviteCopied(false),2000);});}
  function sortAuto(){setHand(prev=>[...prev].sort((a,b)=>cs(a)-cs(b)));setSelected([]);}

  function toggleCard(card){
    if(!gameState||gameState.curPlayer!==playerIndex) return;
    setSelected(prev=>{
      const exists=prev.some(c=>c.value===card.value&&c.suit===card.suit);
      return exists?prev.filter(c=>!(c.value===card.value&&c.suit===card.suit)):[...prev,card];
    });
  }
  function getHint(sel){
    if(!gameState||sel.length===0) return {combo:null,valid:false,msg:"",htype:"idle"};
    if(sel.length===4&&sel.every(c=>c.value===sel[0].value)) return {combo:null,valid:false,msg:"Carré — ajoutez 1 kicker",htype:"warn"};
    const combo=detectCombo(sel);
    if(!combo) return {combo:null,valid:false,msg:"Combinaison invalide",htype:"error"};
    if(!canBeat(gameState.curCombo,combo)) return {combo,valid:false,msg:`${COMBO_LABELS[combo.type]} — trop faible`,htype:"error"};
    return {combo,valid:true,msg:`✓ ${COMBO_LABELS[combo.type]}`,htype:"ok"};
  }
  function playCards(){const{valid,combo}=getHint(selected);if(!valid||!combo)return;socket.emit("game:play",{code:roomCode,cards:selected});setSelected([]);}
  function pass(){socket.emit("game:pass",{code:roomCode});setSelected([]);}
  function sendChat(){if(!chatInput.trim())return;socket.emit("game:chat",{code:roomCode,message:chatInput.trim()});setChatInput("");}

  const hint=getHint(selected);
  const hs={ok:{bg:"rgba(22,163,74,0.12)",border:"#16a34a55",color:"#86efac"},error:{bg:"rgba(159,18,57,0.12)",border:"#9f123955",color:"#fda4af"},warn:{bg:"rgba(217,119,6,0.12)",border:"#d9770655",color:"#fcd34d"},idle:{bg:"transparent",border:"transparent",color:"transparent"}}[hint.htype]||{bg:"transparent",border:"transparent",color:"transparent"};
  const isMyTurn=gameState?.curPlayer===playerIndex;

  // ── ACCUEIL ───────────────────────────────────────────────────
  if(screen==="home") return (
    <div style={{minHeight:"100vh",background:`radial-gradient(ellipse at 25% 40%,${theme.accent}33 0%,${theme.room} 45%,#000c20 100%)`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Georgia,serif",padding:20}}>
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}} @keyframes glow{0%,100%{box-shadow:0 0 30px ${theme.accent}44}50%{box-shadow:0 0 70px ${theme.accent}88}} input::placeholder{color:#3d2a5e}`}</style>
      {showTutorial&&<Tutorial onClose={()=>setShowTutorial(false)}/>}
      {showCustomize&&<CustomizePanel theme={themeKey} skin={skinId} cardBack={cardBackId} onTheme={setThemeKey} onSkin={setSkinId} onCardBack={setCardBackId} onClose={()=>setShowCustomize(false)}/>}
      <div style={{textAlign:"center",maxWidth:400,width:"100%"}}>
        {/* Avatar personnalisé sur l'écran d'accueil */}
        <div style={{display:"flex",justifyContent:"center",marginBottom:8,animation:"float 3s ease-in-out infinite"}}>
          <AvatarSVG skin={skin} mood="confident" size={70}/>
        </div>
        <h1 style={{fontSize:38,fontWeight:900,margin:"0 0 4px",letterSpacing:-1,background:`linear-gradient(135deg,${theme.accent},#f472b6)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Le Vide-Main</h1>
        <p style={{color:"#3d2a5e",fontSize:11,letterSpacing:3,marginBottom:24,textTransform:"uppercase"}}>Multijoueur en ligne</p>
        <input placeholder="Votre prénom" value={playerName} onChange={e=>setPlayerName(e.target.value)} maxLength={16} onKeyDown={e=>e.key==="Enter"&&(joinCode?joinRoom():createRoom())}
          style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.05)",border:`1px solid ${theme.accent}55`,borderRadius:10,color:"#fff",padding:"12px 14px",fontSize:14,outline:"none",fontFamily:"Georgia,serif",marginBottom:12}}/>
        <button onClick={createRoom} style={{display:"block",width:"100%",marginBottom:10,background:`linear-gradient(135deg,${theme.accent},#ec4899)`,color:"#fff",border:"none",borderRadius:12,padding:"14px",fontSize:16,fontWeight:900,cursor:"pointer",animation:"glow 2.5s ease-in-out infinite"}}>+ Créer un salon</button>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          <input placeholder="Code salon" value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} maxLength={4} onKeyDown={e=>e.key==="Enter"&&joinRoom()}
            style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${theme.accent}33`,borderRadius:10,color:"#fff",padding:"12px 14px",fontSize:14,outline:"none",fontFamily:"Georgia,serif",textTransform:"uppercase",letterSpacing:3,textAlign:"center"}}/>
          <button onClick={joinRoom} style={{padding:"12px 18px",borderRadius:10,border:`1px solid ${theme.accent}55`,background:`${theme.accent}22`,color:"#c084fc",fontWeight:700,fontSize:14,cursor:"pointer"}}>Rejoindre</button>
        </div>
        {error&&<p style={{color:"#fda4af",fontSize:12,marginBottom:12}}>{error}</p>}
        <div style={{display:"flex",gap:8,justifyContent:"center"}}>
          <button onClick={()=>setShowTutorial(true)} style={{background:"transparent",color:"#4c3a6e",border:"1px solid rgba(139,92,246,0.15)",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:12}}>📖 Règles</button>
          <button onClick={()=>setShowCustomize(true)} style={{background:"transparent",color:"#4c3a6e",border:`1px solid ${theme.accent}33`,borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:12}}>🎨 Personnaliser</button>
        </div>
      </div>
    </div>
  );

  // ── LOBBY ─────────────────────────────────────────────────────
  if(screen==="lobby") return (
    <div style={{minHeight:"100vh",background:`radial-gradient(ellipse at 25% 40%,${theme.accent}22 0%,${theme.room} 45%,#000c20 100%)`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Georgia,serif",padding:20,color:"#fff"}}>
      {showCustomize&&<CustomizePanel theme={themeKey} skin={skinId} cardBack={cardBackId} onTheme={setThemeKey} onSkin={setSkinId} onCardBack={setCardBackId} onClose={()=>setShowCustomize(false)}/>}
      <div style={{textAlign:"center",maxWidth:400,width:"100%"}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:8}}><AvatarSVG skin={skin} mood="idle" size={60}/></div>
        <h2 style={{fontSize:26,fontWeight:900,margin:"0 0 20px",background:`linear-gradient(135deg,${theme.accent},#f472b6)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Salon d'attente</h2>
        <div style={{background:`${theme.accent}22`,border:`1px solid ${theme.accent}55`,borderRadius:16,padding:18,marginBottom:20}}>
          <p style={{color:"#6d5a8a",fontSize:10,letterSpacing:2,marginBottom:4,textTransform:"uppercase"}}>Code du salon</p>
          <div style={{fontSize:38,fontWeight:900,letterSpacing:8,color:"#c084fc",marginBottom:12}}>{roomCode}</div>
          <button onClick={copyInviteLink} style={{width:"100%",padding:10,borderRadius:10,background:inviteCopied?"rgba(22,163,74,0.2)":`${theme.accent}22`,border:inviteCopied?"1px solid #16a34a55":`1px solid ${theme.accent}44`,color:inviteCopied?"#86efac":"#c084fc",fontWeight:700,fontSize:13,cursor:"pointer",transition:"all 0.3s"}}>
            {inviteCopied?"✓ Lien copié !":"🔗 Copier le lien d'invitation"}
          </button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
          {[0,1,2,3].map(i=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,background:lobbyPlayers[i]?`${theme.accent}15`:"rgba(255,255,255,0.02)",border:lobbyPlayers[i]?`1px solid ${theme.accent}44`:"1px solid rgba(255,255,255,0.05)"}}>
              <span style={{fontSize:18}}>{lobbyPlayers[i]?"🙋":"⏳"}</span>
              <span style={{color:lobbyPlayers[i]?"#e9d5ff":"#2a1f40",fontSize:13,fontWeight:600}}>{lobbyPlayers[i]?.name||"En attente…"}</span>
              {i===playerIndex&&<span style={{marginLeft:"auto",color:theme.accent,fontSize:10}}>vous</span>}
            </div>
          ))}
        </div>
        {error&&<p style={{color:"#fda4af",fontSize:12,marginBottom:12}}>{error}</p>}
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <button onClick={()=>setShowCustomize(true)} style={{padding:"10px 14px",borderRadius:10,border:`1px solid ${theme.accent}33`,background:`${theme.accent}11`,color:"#c084fc",fontWeight:700,fontSize:13,cursor:"pointer"}}>🎨</button>
          {isHost
            ?<button onClick={startGame} style={{flex:1,background:lobbyPlayers.length>=2?`linear-gradient(135deg,${theme.accent},#ec4899)`:"rgba(255,255,255,0.05)",color:lobbyPlayers.length>=2?"#fff":"#2a1f40",border:"none",borderRadius:10,padding:"12px",fontSize:15,fontWeight:900,cursor:lobbyPlayers.length>=2?"pointer":"not-allowed"}}>
                {lobbyPlayers.length>=2?`▶ Lancer (${lobbyPlayers.length}/4)`:"En attente…"}
              </button>
            :<div style={{flex:1,textAlign:"center",padding:"12px",color:"#3d2a5e",fontSize:13}}>En attente que l'hôte lance…</div>
          }
        </div>
      </div>
    </div>
  );

  if(!gameState) return <div style={{color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",fontFamily:"Georgia,serif"}}>Chargement…</div>;

  // ── FIN ───────────────────────────────────────────────────────
  if(gameState.phase==="end"){
    const sorted=[...gameState.players].sort((a,b)=>a.score-b.score);
    return (
      <div style={{minHeight:"100vh",background:`radial-gradient(ellipse at 50% 30%,${theme.accent}33 0%,${theme.room} 60%)`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Georgia,serif"}}>
        <div style={{background:"rgba(255,255,255,0.04)",borderRadius:20,padding:36,minWidth:320,maxWidth:380,width:"90%",border:`1px solid ${theme.accent}66`,textAlign:"center",color:"#fff"}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:8}}><AvatarSVG skin={skin} mood="triumph" size={70}/></div>
          <h2 style={{fontSize:28,margin:"0 0 4px",background:`linear-gradient(135deg,${theme.accent},#f472b6)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Partie terminée !</h2>
          <p style={{color:"#a78bfa",fontSize:15,marginBottom:24}}>{sorted[0].name} remporte la victoire !</p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:28}}>
            {sorted.map((p,i)=>(
              <div key={p.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderRadius:10,background:i===0?`${theme.accent}22`:"rgba(255,255,255,0.03)",border:i===0?`1px solid ${theme.accent}44`:"1px solid rgba(255,255,255,0.05)"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:18}}>{["🥇","🥈","🥉","4️⃣"][i]}</span>
                  <span style={{color:i===0?"#e9d5ff":"#94a3b8",fontWeight:600}}>{p.name}</span>
                </div>
                <span style={{fontSize:18,fontWeight:800,color:i===0?"#c084fc":"#475569"}}>{p.score}<span style={{fontSize:11,fontWeight:400}}> pts</span></span>
              </div>
            ))}
          </div>
          <button onClick={()=>window.location.reload()} style={{width:"100%",background:`linear-gradient(135deg,${theme.accent},#a855f7)`,color:"#fff",border:"none",borderRadius:10,padding:"13px",fontSize:15,fontWeight:700,cursor:"pointer"}}>Rejouer</button>
        </div>
      </div>
    );
  }

  // ── JEU ───────────────────────────────────────────────────────
  const opponents=gameState.players.filter((_,i)=>i!==playerIndex);

  function OpponentSlot({player,position}){
    if(!player) return null;
    const realIdx=gameState.players.findIndex(p=>p.id===player.id);
    const isActive=gameState.curPlayer===realIdx;
    const mood=opponentMoods[player.id]||"idle";
    const opIdx=opponents.indexOf(player);
    const opSkins=[SKINS[1],SKINS[2],SKINS[3]];
    const opSkin=opSkins[opIdx]||SKINS[1];
    const horiz=position==="top";
    return (
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
        {isActive&&<div style={{background:`linear-gradient(135deg,${theme.accent},#ec4899)`,color:"#fff",fontSize:8,padding:"2px 8px",borderRadius:10,fontWeight:700,animation:"blink 1s infinite"}}>JOUE</div>}
        {/* Avatar bonhomme */}
        <div style={{filter:isActive?`drop-shadow(0 0 8px ${theme.accent})`:"none",transition:"filter 0.3s"}}>
          <AvatarSVG skin={opSkin} mood={mood} size={position==="top"?52:42} isActive={isActive}/>
        </div>
        <div style={{background:"rgba(0,0,0,0.6)",borderRadius:8,padding:"2px 8px",fontSize:9,color:"#94a3b8",whiteSpace:"nowrap"}}>
          {player.name} · {player.cardCount}🃏
        </div>
        <CardBackDisplay cardBack={cardBack} count={player.cardCount} horiz={horiz}/>
        <div style={{color:"#6366f1",fontSize:9,fontWeight:700}}>{player.score}pts</div>
      </div>
    );
  }

  return (
    <div style={{minHeight:"100vh",background:theme.room,fontFamily:"Georgia,serif",color:"#fff",display:"flex",flexDirection:"column",maxWidth:520,margin:"0 auto"}}>
      <style>{`
        @keyframes shimmer{0%{background-position:0% 50%}100%{background-position:200% 50%}}
        @keyframes blink{0%,100%{opacity:0.4}50%{opacity:1}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
        input::placeholder{color:#3d2a5e}
      `}</style>

      {showCustomize&&<CustomizePanel theme={themeKey} skin={skinId} cardBack={cardBackId} onTheme={setThemeKey} onSkin={setSkinId} onCardBack={setCardBackId} onClose={()=>setShowCustomize(false)}/>}

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px",background:"rgba(0,0,0,0.5)",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
        <div>
          <div style={{fontWeight:900,fontSize:15,background:`linear-gradient(90deg,${theme.accent},#f472b6)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>🃏 Le Vide-Main</div>
          <div style={{color:"#2a1f40",fontSize:9,letterSpacing:2}}>MANCHE {gameState.round}/7 · {roomCode}</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {gameState.players.map((p,i)=>(
            <div key={p.id} style={{textAlign:"center"}}>
              <div style={{fontSize:8,color:"#2a1f40",textTransform:"uppercase"}}>{p.name.slice(0,4)}</div>
              <div style={{fontSize:13,fontWeight:800,color:i===playerIndex?"#c084fc":"#334155"}}>{p.score}</div>
            </div>
          ))}
          <button onClick={()=>setShowChat(s=>!s)} style={{width:28,height:28,borderRadius:6,background:showChat?`${theme.accent}44`:"rgba(255,255,255,0.04)",border:`1px solid ${theme.accent}33`,color:"#c084fc",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>💬</button>
          <button onClick={()=>setShowCustomize(true)} style={{width:28,height:28,borderRadius:6,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#94a3b8",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>🎨</button>
        </div>
      </div>

      {/* Chat */}
      {showChat&&(
        <div style={{position:"absolute",top:54,right:10,width:250,background:"rgba(8,0,15,0.97)",borderRadius:12,padding:12,border:`1px solid ${theme.accent}44`,zIndex:100,animation:"fadeIn 0.2s ease"}}>
          <div style={{maxHeight:110,overflowY:"auto",marginBottom:8,scrollbarWidth:"none"}}>
            {chatMessages.length===0?<p style={{color:"#2a1f40",fontSize:11,textAlign:"center",margin:0}}>Aucun message</p>
              :chatMessages.map((m,i)=>(
                <div key={i} style={{fontSize:11,lineHeight:1.8}}>
                  <span style={{color:theme.accent,fontWeight:700}}>{m.name} : </span>
                  <span style={{color:"#94a3b8"}}>{m.message}</span>
                </div>
              ))}
            <div ref={chatEndRef}/>
          </div>
          <div style={{display:"flex",gap:6}}>
            <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendChat()} placeholder="Message…" maxLength={100}
              style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${theme.accent}33`,borderRadius:8,color:"#fff",padding:"6px 9px",fontSize:12,outline:"none"}}/>
            <button onClick={sendChat} style={{padding:"6px 10px",borderRadius:8,border:"none",background:`linear-gradient(135deg,${theme.accent},#a855f7)`,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:12}}>→</button>
          </div>
        </div>
      )}

      {/* Table perspective */}
      <div style={{flex:1,position:"relative",background:`linear-gradient(180deg,${theme.room} 0%,${theme.room}dd 100%)`,overflow:"hidden"}}>
        {/* Lampe */}
        <div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:6,height:28,background:"#1a0e35",borderRadius:"0 0 3px 3px",zIndex:2}}/>
        <div style={{position:"absolute",top:26,left:"50%",transform:"translateX(-50%)",width:80,height:12,background:`${theme.accent}44`,borderRadius:8,filter:"blur(5px)",zIndex:1}}/>

        {/* Table SVG */}
        <svg viewBox="0 0 500 300" style={{position:"absolute",top:20,left:0,right:0,width:"100%",pointerEvents:"none"}}>
          <ellipse cx="250" cy="180" rx="230" ry="105" fill={theme.wood}/>
          <ellipse cx="250" cy="170" rx="215" ry="93" fill={theme.felt}/>
          <ellipse cx="250" cy="170" rx="215" ry="93" fill="none" stroke="#b8860b" strokeWidth="2"/>
          <ellipse cx="250" cy="163" rx="196" ry="81" fill={theme.feltInner}/>
          <ellipse cx="250" cy="138" rx="85" ry="30" fill={theme.accent} opacity="0.08"/>
          <ellipse cx="250" cy="163" rx="196" ry="81" fill="none" stroke="#b8860b" strokeWidth="0.8" opacity="0.4"/>
          <text x="250" y="156" textAnchor="middle" fill="#b8860b" fontSize="10" opacity="0.35" fontStyle="italic" fontFamily="Georgia,serif">Le Vide-Main</text>
          <text x="250" y="170" textAnchor="middle" fill="#b8860b" fontSize="8" opacity="0.25" fontFamily="Georgia,serif">♦  ♣  ♥  ♠</text>
        </svg>

        {/* Adversaire face */}
        <div style={{position:"absolute",top:14,left:"50%",transform:"translateX(-50%)",zIndex:5}}>
          {opponents[0]&&<OpponentSlot player={opponents[0]} position="top"/>}
        </div>
        {/* Adversaire gauche */}
        <div style={{position:"absolute",left:4,top:"50%",transform:"translateY(-55%)",zIndex:5}}>
          {opponents[1]&&<OpponentSlot player={opponents[1]} position="left"/>}
        </div>
        {/* Adversaire droite */}
        <div style={{position:"absolute",right:4,top:"50%",transform:"translateY(-55%)",zIndex:5}}>
          {opponents[2]&&<OpponentSlot player={opponents[2]} position="right"/>}
        </div>

        {/* Cartes jouées */}
        <div style={{position:"absolute",left:"50%",top:"55%",transform:"translate(-50%,-50%)",zIndex:6,textAlign:"center",minWidth:120}}>
          {gameState.curCombo?(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
              <div style={{display:"flex",gap:4,justifyContent:"center"}}>
                {gameState.tableCards.map(c=><Card key={c.value+c.suit} card={c} disabled size="sm" cardBack={cardBack}/>)}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap",justifyContent:"center"}}>
                <span style={{background:`linear-gradient(135deg,${theme.accent},#a855f7)`,color:"#fff",padding:"2px 7px",borderRadius:10,fontSize:9,fontWeight:700}}>{COMBO_LABELS[gameState.curCombo.type]}</span>
                {gameState.lastBy!==null&&<span style={{color:"#5a4478",fontSize:9}}>par {gameState.players[gameState.lastBy]?.name}</span>}
              </div>
            </div>
          ):(
            <div style={{color:"#1e1535",fontSize:10,letterSpacing:2}}>— nouveau pli —</div>
          )}
          {!isMyTurn&&<div style={{color:theme.accent,fontSize:9,marginTop:4,animation:"blink 1s infinite"}}>{gameState.players[gameState.curPlayer]?.name} joue…</div>}
        </div>

        {/* Bord avant */}
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:22,background:theme.wood,borderRadius:"6px 6px 0 0",zIndex:4}}>
          <div style={{margin:"3px 8px",height:16,background:theme.feltInner,borderRadius:"4px 4px 0 0",border:"0.5px solid #b8860b44"}}/>
        </div>
      </div>

      {/* Votre main */}
      <div style={{background:`${theme.room}ee`,padding:"10px 14px 16px",borderTop:"1px solid rgba(255,255,255,0.04)"}}>
        {/* Avatar joueur + nom */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
          <div style={{filter:isMyTurn?`drop-shadow(0 0 6px ${theme.accent})`:"none",transition:"filter 0.3s"}}>
            <AvatarSVG skin={skin} mood={myMood} size={44} isActive={isMyTurn}/>
          </div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{color:"#a78bfa",fontSize:11,fontWeight:700}}>{gameState.players[playerIndex]?.name}</span>
              {isMyTurn&&<span style={{background:`linear-gradient(135deg,${theme.accent},#a855f7)`,color:"#fff",fontSize:8,padding:"2px 8px",borderRadius:10,fontWeight:700}}>À VOTRE TOUR</span>}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:2}}>
              <span style={{color:"#6366f1",fontSize:10}}>{hand.length} cartes</span>
              <button onClick={sortAuto} style={{padding:"2px 8px",borderRadius:6,border:`1px solid ${theme.accent}33`,background:`${theme.accent}11`,color:"#7c6fa0",fontSize:9,cursor:"pointer"}}>↕ Trier auto</button>
            </div>
          </div>
        </div>

        {/* Hint */}
        <div style={{padding:"5px 12px",borderRadius:8,marginBottom:8,fontSize:11,background:hs.bg,border:`1px solid ${hs.border}`,color:hs.color,minHeight:26,display:"flex",alignItems:"center",transition:"all 0.2s",opacity:hint.msg?1:0}}>
          {hint.msg||" "}
        </div>

        {/* Main triable */}
        <SortableHand hand={hand} selected={selected} onToggle={toggleCard} onReorder={setHand} disabled={!isMyTurn} cardBack={cardBack}/>

        {/* Boutons */}
        {isMyTurn&&(
          <div style={{display:"flex",gap:10,marginTop:14}}>
            <button onClick={playCards} disabled={!hint.valid} style={{
              flex:1,padding:"13px",borderRadius:12,border:"none",
              background:hint.valid?`linear-gradient(135deg,${theme.accent},#a855f7,#ec4899)`:"rgba(255,255,255,0.04)",
              color:hint.valid?"#fff":"#1e1535",fontWeight:700,fontSize:14,
              cursor:hint.valid?"pointer":"not-allowed",
              boxShadow:hint.valid?`0 4px 20px ${theme.accent}44`:"none",transition:"all 0.2s",
            }}>
              {selected.length===0?"Sélectionnez vos cartes":hint.valid?`🎯 Jouer — ${COMBO_LABELS[hint.combo?.type]}`:"Invalide"}
            </button>
            <button onClick={pass} disabled={!gameState.curCombo} style={{
              padding:"13px 18px",borderRadius:12,border:"1px solid rgba(255,255,255,0.07)",
              background:gameState.curCombo?"rgba(255,255,255,0.06)":"rgba(255,255,255,0.02)",
              color:gameState.curCombo?"#94a3b8":"#1e293b",
              fontWeight:700,fontSize:14,cursor:gameState.curCombo?"pointer":"not-allowed",
            }}>⏭ Passer</button>
          </div>
        )}

        {/* Journal */}
        <div style={{marginTop:10,background:"rgba(0,0,0,0.3)",borderRadius:8,padding:"8px 12px",maxHeight:55,overflowY:"auto",border:"1px solid rgba(255,255,255,0.03)",scrollbarWidth:"none"}}>
          {gameState.log.map((l,i)=>(
            <div key={i} style={{color:i===0?"#c4b5fd":"#2a1f40",fontSize:10,lineHeight:1.9}}>{l}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
