import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

const COMBO_LABELS = {
  single:"Carte seule", pair:"Paire", triple:"Brelan",
  straight:"Suite", flush:"Couleur", full_house:"Full House",
  four_of_a_kind:"Carré", straight_flush:"Quinte Flush"
};
const SUIT_COLOR = { "♥":"#dc2626", "♦":"#dc2626", "♣":"#111827", "♠":"#111827" };
const FIVE_ORDER = ["straight","flush","full_house","four_of_a_kind","straight_flush"];
const VALUES = ["3","4","5","6","7","8","9","10","J","Q","K","A","2"];
const SUIT_RANK = { "♦":0, "♣":1, "♥":2, "♠":3 };
const VALUE_RANK = Object.fromEntries(VALUES.map((v,i)=>[v,i]));

function cs(c){ return VALUE_RANK[c.value]*4+SUIT_RANK[c.suit]; }

function detectCombo(cards){
  if(cards.length===1) return {type:"single",rank:cs(cards[0])};
  if(cards.length===2){
    if(cards[0].value===cards[1].value){
      const best=cards.reduce((a,b)=>cs(a)>cs(b)?a:b);
      return {type:"pair",rank:VALUE_RANK[cards[0].value]*4+SUIT_RANK[best.suit]};
    } return null;
  }
  if(cards.length===3){
    if(cards.every(c=>c.value===cards[0].value)){
      const best=cards.reduce((a,b)=>cs(a)>cs(b)?a:b);
      return {type:"triple",rank:VALUE_RANK[cards[0].value]*4+SUIT_RANK[best.suit]};
    } return null;
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
  if(counts[0]===4){
    const qv=Object.keys(vc).find(v=>vc[v]===4);
    const qCards=sorted.filter(c=>VALUE_RANK[c.value]===parseInt(qv));
    const best=qCards.reduce((a,b)=>cs(a)>cs(b)?a:b);
    return {type:"four_of_a_kind",rank:parseInt(qv)*4+SUIT_RANK[best.suit]+80000};
  }
  const best=sorted[sorted.length-1]; const rank=cs(best);
  if(isFlush&&isStraight) return {type:"straight_flush",rank:rank+100000};
  if(counts[0]===3&&counts[1]===2) return {type:"full_house",rank:rank+60000};
  if(isFlush) return {type:"flush",rank:rank+40000};
  if(isStraight) return {type:"straight",rank:rank+20000};
  return null;
}
function canBeat(cur,att){
  if(!cur) return true;
  if(FIVE_ORDER.includes(cur.type)&&FIVE_ORDER.includes(att.type)){
    const ci=FIVE_ORDER.indexOf(cur.type),ai=FIVE_ORDER.indexOf(att.type);
    return ai>ci||(ai===ci&&att.rank>cur.rank);
  }
  if(cur.type!==att.type) return false;
  return att.rank>cur.rank;
}

// ── TUTORIEL ─────────────────────────────────────────────────────
const TUTORIAL_STEPS = [
  {
    title: "Bienvenue dans Le Vide-Main ! 🃏",
    text: "Le but est simple : être le premier à se débarrasser de toutes ses cartes. Le joueur qui vide sa main en premier gagne la manche !",
    highlight: null,
    demo: null,
  },
  {
    title: "L'ordre des cartes",
    text: "Les cartes vont du plus faible au plus fort : 3 < 4 < 5 … < Roi < As < 2. Et pour les couleurs : ♦ < ♣ < ♥ < ♠. Le 2 de Pique est la carte la plus forte du jeu !",
    highlight: "hand",
    demo: ["3♦","7♥","J♠","A♣","2♠"],
  },
  {
    title: "Jouer une carte seule",
    text: "Cliquez sur une carte pour la sélectionner, puis appuyez sur Jouer. Vous devez battre la carte sur la table avec une carte plus forte. Si vous ne pouvez pas, passez votre tour.",
    highlight: "hand",
    demo: ["5♦","8♥","Q♠"],
  },
  {
    title: "Les paires et brelans",
    text: "Sélectionnez 2 cartes de même valeur pour jouer une paire, ou 3 pour un brelan. On ne peut battre une paire que par une paire plus forte, jamais par une carte seule !",
    highlight: "hand",
    demo: ["7♦","7♥","K♣","K♠"],
  },
  {
    title: "Les combinaisons de 5 cartes",
    text: "Avec 5 cartes, vous pouvez jouer des combinaisons puissantes. Du plus faible au plus fort : Suite < Couleur < Full House < Carré+kicker < Quinte Flush. Ces combos battent tout !",
    highlight: "table",
    demo: ["5♠","6♠","7♠","8♠","9♠"],
  },
  {
    title: "Le score et les manches",
    text: "La partie dure 7 manches. Celui qui vide sa main en premier marque 0 point. Les autres marquent autant de points que de cartes restantes. Le joueur avec le MOINS de points gagne !",
    highlight: "scores",
    demo: null,
  },
  {
    title: "Vous êtes prêt ! 🎉",
    text: "Créez un salon et invitez vos amis via le lien d'invitation. Les cases vides sont remplies automatiquement par des bots. Bonne chance !",
    highlight: null,
    demo: null,
  },
];

function Tutorial({ onClose }) {
  const [step, setStep] = useState(0);
  const current = TUTORIAL_STEPS[step];
  const isLast = step === TUTORIAL_STEPS.length - 1;

  const demoCards = current.demo ? current.demo.map(str => {
    const suit = str.slice(-1);
    const value = str.slice(0, -1);
    return { value, suit };
  }) : [];

  return (
    <div style={{
      position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",
      display:"flex",alignItems:"center",justifyContent:"center",
      zIndex:1000,padding:20,fontFamily:"Georgia,serif",
    }}>
      <div style={{
        background:"linear-gradient(135deg,#120b2e,#0a0015)",
        borderRadius:20,padding:32,maxWidth:420,width:"100%",
        border:"1px solid rgba(139,92,246,0.4)",color:"#fff",
        position:"relative",
      }}>
        {/* Progress */}
        <div style={{display:"flex",gap:6,marginBottom:24}}>
          {TUTORIAL_STEPS.map((_,i)=>(
            <div key={i} style={{
              flex:1,height:3,borderRadius:2,
              background:i<=step?"linear-gradient(90deg,#7c3aed,#ec4899)":"rgba(255,255,255,0.1)",
              transition:"background 0.3s",
            }}/>
          ))}
        </div>

        <div style={{fontSize:22,marginBottom:8}}>{current.title}</div>
        <p style={{color:"#94a3b8",fontSize:14,lineHeight:1.7,marginBottom:20}}>{current.text}</p>

        {/* Démo cartes */}
        {demoCards.length>0&&(
          <div style={{
            display:"flex",gap:6,justifyContent:"center",
            padding:"16px",background:"rgba(0,0,0,0.3)",
            borderRadius:12,marginBottom:20,flexWrap:"wrap",
          }}>
            {demoCards.map((card,i)=>(
              <div key={i} style={{
                width:48,height:70,borderRadius:7,
                background:"linear-gradient(160deg,#fff,#f8fafc)",
                border:`1.5px solid ${SUIT_COLOR[card.suit]}`,
                display:"flex",flexDirection:"column",justifyContent:"space-between",
                padding:"4px 5px",
              }}>
                <div>
                  <div style={{fontSize:10,fontWeight:800,color:SUIT_COLOR[card.suit],lineHeight:1}}>{card.value}</div>
                  <div style={{fontSize:10,color:SUIT_COLOR[card.suit],lineHeight:1}}>{card.suit}</div>
                </div>
                <div style={{fontSize:18,textAlign:"center",color:SUIT_COLOR[card.suit]}}>{card.suit}</div>
                <div style={{transform:"rotate(180deg)"}}>
                  <div style={{fontSize:10,fontWeight:800,color:SUIT_COLOR[card.suit],lineHeight:1}}>{card.value}</div>
                  <div style={{fontSize:10,color:SUIT_COLOR[card.suit],lineHeight:1}}>{card.suit}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Navigation */}
        <div style={{display:"flex",gap:10}}>
          {step>0&&(
            <button onClick={()=>setStep(s=>s-1)} style={{
              flex:1,padding:"11px",borderRadius:10,
              border:"1px solid rgba(255,255,255,0.1)",
              background:"rgba(255,255,255,0.05)",color:"#94a3b8",
              fontWeight:700,cursor:"pointer",fontSize:14,
            }}>← Précédent</button>
          )}
          {!isLast?(
            <button onClick={()=>setStep(s=>s+1)} style={{
              flex:2,padding:"11px",borderRadius:10,border:"none",
              background:"linear-gradient(135deg,#7c3aed,#a855f7)",
              color:"#fff",fontWeight:700,cursor:"pointer",fontSize:14,
            }}>Suivant →</button>
          ):(
            <button onClick={onClose} style={{
              flex:2,padding:"11px",borderRadius:10,border:"none",
              background:"linear-gradient(135deg,#7c3aed,#a855f7,#ec4899)",
              color:"#fff",fontWeight:700,cursor:"pointer",fontSize:14,
            }}>🎮 Commencer à jouer !</button>
          )}
        </div>

        <button onClick={onClose} style={{
          position:"absolute",top:16,right:16,
          background:"transparent",border:"none",color:"#334155",
          cursor:"pointer",fontSize:18,lineHeight:1,
        }}>✕</button>
      </div>
    </div>
  );
}

// ── CARTE ─────────────────────────────────────────────────────────
function Card({ card, selected, onClick, disabled }) {
  const sc = SUIT_COLOR[card.suit];
  return (
    <div onClick={disabled?undefined:onClick} style={{
      width:52,height:76,borderRadius:8,
      background:selected?"linear-gradient(160deg,#faf5ff,#ede9fe)":"linear-gradient(160deg,#fff,#f8fafc)",
      border:selected?`2px solid ${sc}`:"1.5px solid #e2e8f0",
      boxShadow:selected?`0 -10px 0 0 ${sc}44,0 6px 18px ${sc}33`:"0 2px 6px rgba(0,0,0,0.12)",
      display:"flex",flexDirection:"column",justifyContent:"space-between",
      cursor:disabled?"default":"pointer",
      transform:selected?"translateY(-14px) scale(1.06)":"none",
      transition:"all 0.18s cubic-bezier(0.34,1.56,0.64,1)",
      userSelect:"none",flexShrink:0,padding:"4px 5px",
    }}>
      <div>
        <div style={{fontSize:11,fontWeight:800,color:sc,lineHeight:1}}>{card.value}</div>
        <div style={{fontSize:11,color:sc,lineHeight:1}}>{card.suit}</div>
      </div>
      <div style={{fontSize:20,textAlign:"center",color:sc,lineHeight:1}}>{card.suit}</div>
      <div style={{transform:"rotate(180deg)"}}>
        <div style={{fontSize:11,fontWeight:800,color:sc,lineHeight:1}}>{card.value}</div>
        <div style={{fontSize:11,color:sc,lineHeight:1}}>{card.suit}</div>
      </div>
    </div>
  );
}

function CardBack({ count }) {
  return (
    <div style={{display:"flex"}}>
      {Array.from({length:Math.min(count,13)}).map((_,i)=>(
        <div key={i} style={{
          width:9,height:14,borderRadius:2,
          background:"linear-gradient(135deg,#334155,#1e293b)",
          border:"1px solid rgba(255,255,255,0.08)",
          marginLeft:i>0?-3:0,
        }}/>
      ))}
    </div>
  );
}

// ── APP PRINCIPALE ────────────────────────────────────────────────
export default function App() {
  const [socket,setSocket]=useState(null);
  const [screen,setScreen]=useState("home");
  const [playerName,setPlayerName]=useState("");
  const [roomCode,setRoomCode]=useState("");
  const [joinCode,setJoinCode]=useState("");
  const [lobbyPlayers,setLobbyPlayers]=useState([]);
  const [playerIndex,setPlayerIndex]=useState(null);
  const [gameState,setGameState]=useState(null);
  const [selected,setSelected]=useState([]);
  const [error,setError]=useState("");
  const [isHost,setIsHost]=useState(false);
  const [showTutorial,setShowTutorial]=useState(false);
  const [chatMessages,setChatMessages]=useState([]);
  const [chatInput,setChatInput]=useState("");
  const [showChat,setShowChat]=useState(false);
  const [inviteCopied,setInviteCopied]=useState(false);
  const chatEndRef=useRef(null);

  // Lire le code depuis l'URL au chargement (liens d'invitation)
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const code=params.get("join");
    if(code) setJoinCode(code.toUpperCase());
  },[]);

  useEffect(()=>{
    const s=io(SERVER_URL);
    setSocket(s);
    s.on("room:joined",({code,playerIndex:idx})=>{
      setRoomCode(code); setPlayerIndex(idx);
      setIsHost(idx===0); setScreen("lobby");
      // Nettoyer l'URL après avoir rejoint
      window.history.replaceState({},"",window.location.pathname);
    });
    s.on("lobby:update",({players})=>setLobbyPlayers(players));
    s.on("game:state",(state)=>{
      setGameState(state);
      if(state.phase==="game"||state.phase==="end") setScreen("game");
    });
    s.on("room:error",(msg)=>setError(msg));
    s.on("game:chat",(msg)=>{
      setChatMessages(prev=>[...prev,msg].slice(-50));
      setTimeout(()=>chatEndRef.current?.scrollIntoView({behavior:"smooth"}),50);
    });
    return ()=>s.disconnect();
  },[]);

  function createRoom(){
    if(!playerName.trim()){setError("Entrez votre prénom.");return;}
    setError(""); socket.emit("room:create",{playerName:playerName.trim()});
  }
  function joinRoom(){
    if(!playerName.trim()){setError("Entrez votre prénom.");return;}
    if(!joinCode.trim()){setError("Entrez le code du salon.");return;}
    setError(""); socket.emit("room:join",{code:joinCode.trim().toUpperCase(),playerName:playerName.trim()});
  }
  function startGame(){ socket.emit("game:start",{code:roomCode}); }

  // Lien d'invitation
  function copyInviteLink(){
    const url=`${window.location.origin}${window.location.pathname}?join=${roomCode}`;
    navigator.clipboard.writeText(url).then(()=>{
      setInviteCopied(true);
      setTimeout(()=>setInviteCopied(false),2000);
    });
  }

  function toggleCard(card){
    if(!gameState||gameState.curPlayer!==playerIndex) return;
    setSelected(prev=>{
      const exists=prev.some(c=>c.value===card.value&&c.suit===card.suit);
      return exists?prev.filter(c=>!(c.value===card.value&&c.suit===card.suit)):[...prev,card];
    });
  }

  function getHint(sel){
    if(!gameState) return {combo:null,valid:false,msg:"",htype:"idle"};
    if(sel.length===0) return {combo:null,valid:false,msg:"",htype:"idle"};
    if(sel.length===4&&sel.every(c=>c.value===sel[0].value))
      return {combo:null,valid:false,msg:"Carré — ajoutez 1 kicker",htype:"warn"};
    const combo=detectCombo(sel);
    if(!combo) return {combo:null,valid:false,msg:"Combinaison invalide",htype:"error"};
    if(!canBeat(gameState.curCombo,combo)) return {combo,valid:false,msg:`${COMBO_LABELS[combo.type]} — trop faible`,htype:"error"};
    return {combo,valid:true,msg:`✓ ${COMBO_LABELS[combo.type]}`,htype:"ok"};
  }

  function playCards(){
    const {valid,combo}=getHint(selected);
    if(!valid||!combo) return;
    socket.emit("game:play",{code:roomCode,cards:selected});
    setSelected([]);
  }
  function pass(){
    socket.emit("game:pass",{code:roomCode});
    setSelected([]);
  }
  function sendChat(){
    if(!chatInput.trim()) return;
    socket.emit("game:chat",{code:roomCode,message:chatInput.trim()});
    setChatInput("");
  }

  const hint=getHint(selected);
  const hintStyle={
    ok:{bg:"rgba(22,163,74,0.12)",border:"#16a34a55",color:"#86efac"},
    error:{bg:"rgba(159,18,57,0.12)",border:"#9f123955",color:"#fda4af"},
    warn:{bg:"rgba(217,119,6,0.12)",border:"#d9770655",color:"#fcd34d"},
    idle:{bg:"transparent",border:"transparent",color:"transparent"},
  };
  const hs=hintStyle[hint.htype]||hintStyle.idle;
  const isMyTurn=gameState?.curPlayer===playerIndex;

  // ── ÉCRAN ACCUEIL ─────────────────────────────────────────────
  if(screen==="home") return (
    <div style={{
      minHeight:"100vh",
      background:"radial-gradient(ellipse at 25% 40%,#1a0533 0%,#0a0015 45%,#000c20 100%)",
      display:"flex",alignItems:"center",justifyContent:"center",
      fontFamily:"Georgia,serif",padding:20,
    }}>
      <style>{`
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        @keyframes glow{0%,100%{box-shadow:0 0 30px #7c3aed44}50%{box-shadow:0 0 70px #a855f788}}
        input::placeholder{color:#3d2a5e}
      `}</style>

      {showTutorial&&<Tutorial onClose={()=>setShowTutorial(false)}/>}

      <div style={{textAlign:"center",maxWidth:400,width:"100%"}}>
        <div style={{fontSize:70,animation:"float 3s ease-in-out infinite",display:"block",marginBottom:6}}>🃏</div>
        <h1 style={{
          fontSize:42,fontWeight:900,margin:"0 0 4px",letterSpacing:-1,
          background:"linear-gradient(135deg,#c084fc,#f472b6,#818cf8)",
          WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
        }}>Le Vide-Main</h1>
        <p style={{color:"#3d2a5e",fontSize:11,letterSpacing:3,marginBottom:28,textTransform:"uppercase"}}>
          Multijoueur en ligne
        </p>

        <input placeholder="Votre prénom" value={playerName}
          onChange={e=>setPlayerName(e.target.value)} maxLength={16}
          onKeyDown={e=>e.key==="Enter"&&(joinCode?joinRoom():createRoom())}
          style={{
            width:"100%",boxSizing:"border-box",
            background:"rgba(255,255,255,0.05)",
            border:"1px solid rgba(139,92,246,0.35)",
            borderRadius:10,color:"#fff",padding:"12px 14px",
            fontSize:14,outline:"none",fontFamily:"Georgia,serif",marginBottom:12,
          }}/>

        <button onClick={createRoom} style={{
          display:"block",width:"100%",marginBottom:10,
          background:"linear-gradient(135deg,#7c3aed,#a855f7,#ec4899)",
          color:"#fff",border:"none",borderRadius:12,padding:"14px",
          fontSize:16,fontWeight:900,cursor:"pointer",letterSpacing:0.5,
          animation:"glow 2.5s ease-in-out infinite",
        }}>+ Créer un salon</button>

        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <input placeholder="Code du salon" value={joinCode}
            onChange={e=>setJoinCode(e.target.value.toUpperCase())} maxLength={4}
            onKeyDown={e=>e.key==="Enter"&&joinRoom()}
            style={{
              flex:1,background:"rgba(255,255,255,0.05)",
              border:"1px solid rgba(139,92,246,0.2)",
              borderRadius:10,color:"#fff",padding:"12px 14px",
              fontSize:14,outline:"none",fontFamily:"Georgia,serif",
              textTransform:"uppercase",letterSpacing:3,textAlign:"center",
            }}/>
          <button onClick={joinRoom} style={{
            padding:"12px 18px",borderRadius:10,
            border:"1px solid rgba(139,92,246,0.3)",
            background:"rgba(139,92,246,0.1)",color:"#c084fc",
            fontWeight:700,fontSize:14,cursor:"pointer",
          }}>Rejoindre</button>
        </div>

        {error&&<p style={{color:"#fda4af",fontSize:12,marginBottom:12}}>{error}</p>}

        <button onClick={()=>setShowTutorial(true)} style={{
          background:"transparent",color:"#4c3a6e",
          border:"1px solid rgba(139,92,246,0.15)",borderRadius:8,
          padding:"8px 18px",cursor:"pointer",fontSize:12,marginBottom:8,
        }}>📖 Comment jouer ?</button>

        <p style={{color:"#1e1535",fontSize:11,marginTop:12,lineHeight:1.8}}>
          Créez un salon et partagez le lien à vos amis.<br/>
          Les cases vides sont remplies par des bots.
        </p>
      </div>
    </div>
  );

  // ── LOBBY ─────────────────────────────────────────────────────
  if(screen==="lobby") return (
    <div style={{
      minHeight:"100vh",
      background:"radial-gradient(ellipse at 25% 40%,#1a0533 0%,#0a0015 45%,#000c20 100%)",
      display:"flex",alignItems:"center",justifyContent:"center",
      fontFamily:"Georgia,serif",padding:20,color:"#fff",
    }}>
      <div style={{textAlign:"center",maxWidth:400,width:"100%"}}>
        <div style={{fontSize:40,marginBottom:8}}>🃏</div>
        <h2 style={{
          fontSize:26,fontWeight:900,margin:"0 0 6px",
          background:"linear-gradient(135deg,#c084fc,#f472b6)",
          WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
        }}>Salon d'attente</h2>

        {/* Code + lien d'invitation */}
        <div style={{
          background:"rgba(139,92,246,0.12)",
          border:"1px solid rgba(139,92,246,0.35)",
          borderRadius:16,padding:"18px",marginBottom:20,
        }}>
          <p style={{color:"#6d5a8a",fontSize:10,letterSpacing:2,marginBottom:4,textTransform:"uppercase"}}>Code du salon</p>
          <div style={{fontSize:38,fontWeight:900,letterSpacing:8,color:"#c084fc",marginBottom:12}}>{roomCode}</div>

          {/* Bouton copier le lien */}
          <button onClick={copyInviteLink} style={{
            width:"100%",padding:"10px",borderRadius:10,
            background:inviteCopied?"rgba(22,163,74,0.2)":"rgba(139,92,246,0.15)",
            border:inviteCopied?"1px solid #16a34a55":"1px solid rgba(139,92,246,0.3)",
            color:inviteCopied?"#86efac":"#c084fc",
            fontWeight:700,fontSize:13,cursor:"pointer",transition:"all 0.3s",
          }}>
            {inviteCopied?"✓ Lien copié !":"🔗 Copier le lien d'invitation"}
          </button>
          <p style={{color:"#2a1f40",fontSize:10,marginTop:8}}>
            Envoyez ce lien à vos amis — ils rejoindront automatiquement !
          </p>
        </div>

        {/* Joueurs */}
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
          {[0,1,2,3].map(i=>(
            <div key={i} style={{
              display:"flex",alignItems:"center",gap:12,
              padding:"10px 14px",borderRadius:10,
              background:lobbyPlayers[i]?"rgba(139,92,246,0.1)":"rgba(255,255,255,0.02)",
              border:lobbyPlayers[i]?"1px solid rgba(139,92,246,0.3)":"1px solid rgba(255,255,255,0.05)",
            }}>
              <span style={{fontSize:18}}>{lobbyPlayers[i]?"🙋":"⏳"}</span>
              <span style={{color:lobbyPlayers[i]?"#e9d5ff":"#2a1f40",fontSize:13,fontWeight:600}}>
                {lobbyPlayers[i]?.name||"En attente…"}
              </span>
              {i===playerIndex&&<span style={{marginLeft:"auto",color:"#7c3aed",fontSize:10}}>vous</span>}
              {i===0&&i!==playerIndex&&lobbyPlayers[i]&&<span style={{marginLeft:"auto",color:"#6d5a8a",fontSize:10}}>hôte</span>}
            </div>
          ))}
        </div>

        {error&&<p style={{color:"#fda4af",fontSize:12,marginBottom:12}}>{error}</p>}

        {isHost?(
          <button onClick={startGame} style={{
            width:"100%",
            background:lobbyPlayers.length>=2
              ?"linear-gradient(135deg,#7c3aed,#a855f7,#ec4899)"
              :"rgba(255,255,255,0.05)",
            color:lobbyPlayers.length>=2?"#fff":"#2a1f40",
            border:"none",borderRadius:12,padding:"14px",
            fontSize:16,fontWeight:900,
            cursor:lobbyPlayers.length>=2?"pointer":"not-allowed",
          }}>
            {lobbyPlayers.length>=2?`▶ Lancer la partie (${lobbyPlayers.length}/4)`:"En attente d'un autre joueur…"}
          </button>
        ):(
          <p style={{color:"#3d2a5e",fontSize:13}}>En attente que l'hôte lance la partie…</p>
        )}
      </div>
    </div>
  );

  if(!gameState) return (
    <div style={{color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",fontFamily:"Georgia,serif"}}>
      Chargement…
    </div>
  );

  // ── FIN ───────────────────────────────────────────────────────
  if(gameState.phase==="end"){
    const sorted=[...gameState.players].sort((a,b)=>a.score-b.score);
    return (
      <div style={{
        minHeight:"100vh",
        background:"radial-gradient(ellipse at 50% 30%,#1a0533 0%,#0a0015 60%)",
        display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Georgia,serif",
      }}>
        <div style={{
          background:"rgba(255,255,255,0.04)",backdropFilter:"blur(20px)",
          borderRadius:20,padding:36,minWidth:320,maxWidth:380,width:"90%",
          border:"1px solid rgba(139,92,246,0.4)",textAlign:"center",color:"#fff",
        }}>
          <div style={{fontSize:56,marginBottom:8}}>🏆</div>
          <h2 style={{fontSize:28,margin:"0 0 4px",background:"linear-gradient(135deg,#c084fc,#f472b6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
            Partie terminée !
          </h2>
          <p style={{color:"#a78bfa",fontSize:15,marginBottom:24}}>{sorted[0].name} remporte la victoire !</p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:28}}>
            {sorted.map((p,i)=>(
              <div key={p.id} style={{
                display:"flex",alignItems:"center",justifyContent:"space-between",
                padding:"12px 16px",borderRadius:10,
                background:i===0?"rgba(139,92,246,0.18)":"rgba(255,255,255,0.03)",
                border:i===0?"1px solid rgba(139,92,246,0.4)":"1px solid rgba(255,255,255,0.05)",
              }}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:18}}>{["🥇","🥈","🥉","4️⃣"][i]}</span>
                  <span style={{color:i===0?"#e9d5ff":"#94a3b8",fontWeight:600}}>{p.name}</span>
                </div>
                <span style={{fontSize:18,fontWeight:800,color:i===0?"#c084fc":"#475569"}}>
                  {p.score} <span style={{fontSize:11,fontWeight:400}}>pts</span>
                </span>
              </div>
            ))}
          </div>
          <button onClick={()=>window.location.reload()} style={{
            width:"100%",background:"linear-gradient(135deg,#7c3aed,#a855f7)",
            color:"#fff",border:"none",borderRadius:10,padding:"13px",fontSize:15,fontWeight:700,cursor:"pointer",
          }}>Rejouer</button>
        </div>
      </div>
    );
  }

  // ── JEU ───────────────────────────────────────────────────────
  const myHand=gameState.myHand||[];

  return (
    <div style={{
      minHeight:"100vh",
      background:"radial-gradient(ellipse at 20% 20%,#1a0533 0%,#0a0015 50%,#000c20 100%)",
      fontFamily:"Georgia,serif",padding:"12px 14px",
      color:"#fff",maxWidth:520,margin:"0 auto",position:"relative",
    }}>
      <style>{`
        @keyframes shimmer{0%{background-position:0% 50%}100%{background-position:200% 50%}}
        @keyframes fadeSlideIn{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}
        @keyframes blink{0%,100%{opacity:0.4}50%{opacity:1}}
        input::placeholder{color:#3d2a5e}
      `}</style>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div>
          <div style={{fontWeight:900,fontSize:17,background:"linear-gradient(90deg,#c084fc,#f472b6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
            🃏 Le Vide-Main
          </div>
          <div style={{color:"#3d2a5e",fontSize:9,letterSpacing:2,marginTop:1,textTransform:"uppercase"}}>
            Manche {gameState.round}/7 · {roomCode}
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {/* Scores */}
          {gameState.players.map((p,i)=>(
            <div key={p.id} style={{textAlign:"center"}}>
              <div style={{fontSize:8,color:"#2a1f40",textTransform:"uppercase",letterSpacing:1}}>{p.name.slice(0,4)}</div>
              <div style={{fontSize:14,fontWeight:800,color:i===playerIndex?"#c084fc":"#334155"}}>{p.score}</div>
            </div>
          ))}
          {/* Bouton chat */}
          <button onClick={()=>setShowChat(s=>!s)} style={{
            width:32,height:32,borderRadius:8,
            background:showChat?"rgba(139,92,246,0.3)":"rgba(255,255,255,0.05)",
            border:"1px solid rgba(139,92,246,0.3)",
            color:"#c084fc",cursor:"pointer",fontSize:14,
            display:"flex",alignItems:"center",justifyContent:"center",
          }}>💬</button>
        </div>
      </div>

      {/* Chat */}
      {showChat&&(
        <div style={{
          background:"rgba(0,0,0,0.5)",backdropFilter:"blur(8px)",
          borderRadius:12,padding:12,marginBottom:12,
          border:"1px solid rgba(139,92,246,0.2)",
          animation:"fadeSlideIn 0.2s ease",
        }}>
          <div style={{maxHeight:100,overflowY:"auto",marginBottom:8,scrollbarWidth:"none"}}>
            {chatMessages.length===0?(
              <p style={{color:"#2a1f40",fontSize:11,textAlign:"center",margin:0}}>Pas encore de messages…</p>
            ):chatMessages.map((m,i)=>(
              <div key={i} style={{fontSize:11,lineHeight:1.8}}>
                <span style={{color:"#7c3aed",fontWeight:700}}>{m.name} : </span>
                <span style={{color:"#94a3b8"}}>{m.message}</span>
              </div>
            ))}
            <div ref={chatEndRef}/>
          </div>
          <div style={{display:"flex",gap:6}}>
            <input value={chatInput} onChange={e=>setChatInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&sendChat()}
              placeholder="Votre message…" maxLength={100}
              style={{
                flex:1,background:"rgba(255,255,255,0.05)",
                border:"1px solid rgba(139,92,246,0.2)",
                borderRadius:8,color:"#fff",padding:"7px 10px",fontSize:12,outline:"none",
              }}/>
            <button onClick={sendChat} style={{
              padding:"7px 12px",borderRadius:8,border:"none",
              background:"linear-gradient(135deg,#7c3aed,#a855f7)",
              color:"#fff",fontWeight:700,cursor:"pointer",fontSize:12,
            }}>→</button>
          </div>
        </div>
      )}

      {/* Adversaires */}
      <div style={{display:"grid",gridTemplateColumns:`repeat(${gameState.players.length-1},1fr)`,gap:8,marginBottom:12}}>
        {gameState.players.map((p,i)=>{
          if(i===playerIndex) return null;
          const isActive=gameState.curPlayer===i;
          const hasPassed=gameState.passed[i];
          return (
            <div key={p.id} style={{
              padding:"10px",borderRadius:12,
              background:isActive?"rgba(139,92,246,0.12)":"rgba(255,255,255,0.03)",
              border:isActive?"1.5px solid #8b5cf6":"1.5px solid rgba(255,255,255,0.07)",
              transition:"all 0.3s",position:"relative",overflow:"hidden",
            }}>
              {isActive&&<div style={{position:"absolute",top:0,left:0,right:0,height:2,background:"linear-gradient(90deg,#8b5cf6,#ec4899,#8b5cf6)",backgroundSize:"200% 100%",animation:"shimmer 1.5s infinite linear"}}/>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                <span style={{color:isActive?"#e9d5ff":"#94a3b8",fontSize:11,fontWeight:600}}>{p.name}</span>
                {isActive&&<span style={{background:"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",fontSize:8,padding:"2px 5px",borderRadius:20,fontWeight:700}}>JOUE</span>}
                {hasPassed&&!isActive&&<span style={{color:"#334155",fontSize:9,fontStyle:"italic"}}>passé</span>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <CardBack count={p.cardCount}/>
                <span style={{color:"#475569",fontSize:9}}>{p.cardCount}</span>
              </div>
              <div style={{textAlign:"right",marginTop:4}}>
                <span style={{color:"#6366f1",fontSize:10,fontWeight:700}}>{p.score}pts</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div style={{
        background:"rgba(0,0,0,0.35)",backdropFilter:"blur(8px)",
        borderRadius:16,padding:"16px 14px",marginBottom:12,
        border:gameState.curCombo?"1px solid rgba(139,92,246,0.25)":"1px solid rgba(255,255,255,0.04)",
        minHeight:108,display:"flex",flexDirection:"column",
        alignItems:"center",justifyContent:"center",gap:10,
        position:"relative",
      }}>
        {gameState.curCombo?(
          <>
            <div style={{fontSize:10,letterSpacing:1.5,color:"#5a4478",display:"flex",alignItems:"center",gap:6}}>
              <span style={{background:"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",padding:"2px 8px",borderRadius:20,fontSize:9,fontWeight:700}}>
                {COMBO_LABELS[gameState.curCombo.type]}
              </span>
              {gameState.lastBy!==null&&<span>par {gameState.players[gameState.lastBy]?.name}</span>}
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center",animation:"fadeSlideIn 0.3s ease"}}>
              {gameState.tableCards.map(c=><Card key={c.value+c.suit} card={c} disabled/>)}
            </div>
          </>
        ):(
          <div style={{color:"#1e1535",fontSize:12,letterSpacing:3,textTransform:"uppercase"}}>— Nouveau pli —</div>
        )}
        {!isMyTurn&&gameState.phase==="game"&&(
          <div style={{position:"absolute",bottom:8,right:12,color:"#7c3aed",fontSize:11,animation:"blink 1s ease-in-out infinite"}}>
            {gameState.players[gameState.curPlayer]?.name} joue…
          </div>
        )}
      </div>

      {/* Main joueur */}
      <div style={{
        padding:"14px",borderRadius:16,marginBottom:10,
        background:isMyTurn?"rgba(139,92,246,0.08)":"rgba(255,255,255,0.02)",
        border:isMyTurn?"1.5px solid rgba(139,92,246,0.4)":"1.5px solid rgba(255,255,255,0.05)",
        transition:"all 0.4s",position:"relative",overflow:"hidden",
      }}>
        {isMyTurn&&<div style={{position:"absolute",top:0,left:0,right:0,height:2,background:"linear-gradient(90deg,#8b5cf6,#ec4899,#8b5cf6)",backgroundSize:"200% 100%",animation:"shimmer 2s infinite linear"}}/>}
        <div style={{fontSize:11,fontWeight:700,marginBottom:10,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{color:"#a78bfa"}}>🙋 {gameState.players[playerIndex]?.name}</span>
          <span style={{
            fontSize:10,color:isMyTurn?"#c084fc":"#3d2a5e",
            background:isMyTurn?"rgba(139,92,246,0.2)":"transparent",
            padding:isMyTurn?"2px 8px":"0",borderRadius:20,
            border:isMyTurn?"1px solid rgba(139,92,246,0.3)":"none",transition:"all 0.3s",
          }}>{isMyTurn?"À VOTRE TOUR":`${myHand.length} cartes`}</span>
        </div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",minHeight:80,alignItems:"flex-end"}}>
          {myHand.map(card=>(
            <Card key={card.value+card.suit} card={card}
              selected={selected.some(c=>c.value===card.value&&c.suit===card.suit)}
              onClick={()=>toggleCard(card)} disabled={!isMyTurn}/>
          ))}
        </div>
      </div>

      {/* Hint */}
      <div style={{
        padding:"7px 14px",borderRadius:8,marginBottom:10,fontSize:12,
        background:hs.bg,border:`1px solid ${hs.border}`,color:hs.color,
        minHeight:32,display:"flex",alignItems:"center",transition:"all 0.2s",
        opacity:hint.msg?1:0,
      }}>{hint.msg||" "}</div>

      {/* Boutons */}
      {isMyTurn&&(
        <div style={{display:"flex",gap:10,marginBottom:12}}>
          <button onClick={playCards} disabled={!hint.valid} style={{
            flex:1,padding:"14px",borderRadius:12,border:"none",
            background:hint.valid?"linear-gradient(135deg,#7c3aed,#a855f7,#ec4899)":"rgba(255,255,255,0.04)",
            color:hint.valid?"#fff":"#1e1535",fontWeight:700,fontSize:14,
            cursor:hint.valid?"pointer":"not-allowed",
            boxShadow:hint.valid?"0 4px 20px rgba(124,58,237,0.4)":"none",transition:"all 0.2s",
          }}>
            {selected.length===0?"Sélectionnez vos cartes"
              :hint.valid?`🎯 Jouer — ${COMBO_LABELS[hint.combo?.type]}`
              :"Combinaison invalide"}
          </button>
          <button onClick={pass} disabled={!gameState.curCombo} style={{
            padding:"14px 18px",borderRadius:12,
            border:"1px solid rgba(255,255,255,0.07)",
            background:gameState.curCombo?"rgba(255,255,255,0.06)":"rgba(255,255,255,0.02)",
            color:gameState.curCombo?"#94a3b8":"#1e293b",
            fontWeight:700,fontSize:14,cursor:gameState.curCombo?"pointer":"not-allowed",transition:"all 0.2s",
          }}>⏭ Passer</button>
        </div>
      )}

      {/* Journal */}
      <div style={{
        background:"rgba(0,0,0,0.25)",borderRadius:10,padding:"10px 12px",
        maxHeight:85,overflowY:"auto",border:"1px solid rgba(255,255,255,0.03)",
        scrollbarWidth:"none",
      }}>
        {gameState.log.map((l,i)=>(
          <div key={i} style={{color:i===0?"#c4b5fd":"#2a1f40",fontSize:10,lineHeight:2}}>{l}</div>
        ))}
      </div>
    </div>
  );
}
