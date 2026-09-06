import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getDatabase, ref, set, get, update, remove, onValue, onDisconnect, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

const firebaseConfig={
  apiKey:"AIzaSyBhPwBFWgqeSfN8zSM4Pu6Dg-8suzeqHus",
  authDomain:"versatil-sala-de-jogos.firebaseapp.com",
  databaseURL:"https://versatil-sala-de-jogos-default-rtdb.firebaseio.com",
  projectId:"versatil-sala-de-jogos",
  storageBucket:"versatil-sala-de-jogos.firebasestorage.app",
  messagingSenderId:"345907094201",
  appId:"1:345907094201:web:ef4dff6b6084fecc197168"
};

const fb=initializeApp(firebaseConfig), auth=getAuth(fb), db=getDatabase(fb);
const $=s=>document.querySelector(s);

const BOT_WAIT_MS=8000;
const QUEUE_MAX_AGE_MS=20000;

let uid=null,nick='',sessionId='',roomId=null,unsub=null,room=null;
let botTimer=null,matching=false,botBusy=false,seekTimer=null;

const views=[$('#homeView'),$('#queueView'),$('#gameView')];
function show(v){views.forEach(x=>x.classList.add('hidden'));v.classList.remove('hidden')}
function clean(v){return ((v||'').trim().replace(/[.#$\[\]\/]/g,'').slice(0,18)||'Jogador')}
function randomNick(){let a=['Tucano','Lobo','Sol','Atlas','Brisa','Nuvem','Falcão','Luna','Rio','Orion'];return a[Math.floor(Math.random()*a.length)]+Math.floor(10+Math.random()*90)}
function makeSession(){return Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10)}
function win(b){for(const [a,c,d] of [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]])if(b[a]&&b[a]===b[c]&&b[a]===b[d])return b[a];return b.every(Boolean)?'draw':''}
function mine(r){return r?.players?.X?.uid===uid&&r?.players?.X?.sessionId===sessionId?'X':r?.players?.O?.uid===uid&&r?.players?.O?.sessionId===sessionId?'O':''}
function opp(r){return mine(r)==='X'?r.players.O:r.players.X}
function clearSeek(){if(seekTimer){clearTimeout(seekTimer);seekTimer=null}}
function scheduleSeek(ms=800){clearSeek();seekTimer=setTimeout(seek,ms)}
function queueRefFor(id=uid){return ref(db,'queues/tictactoe/'+id)}

async function boot(){
  try{
    $('#connBadge').textContent='Autenticando…';
    let c=await signInAnonymously(auth);
    uid=c.user.uid;
    let p=ref(db,'presence/'+uid);
    await set(p,{online:true,updatedAt:serverTimestamp()});
    onDisconnect(p).remove();
    $('#connBadge').textContent='Firebase online'
  }catch(e){
    console.error(e);
    $('#connBadge').textContent='Falha na conexão';
    alert('Falha ao conectar ao Firebase.')
  }
}

async function refreshPresence(){
  if(!uid)return;
  await set(ref(db,'presence/'+uid),{online:true,updatedAt:serverTimestamp()});
}

async function savePlayer(){
  await set(ref(db,'players/'+uid),{nick,lastSeen:serverTimestamp(),sessionId});
}

async function cleanupInvalidQueueEntries(entries){
  const now=Date.now();
  const checks=entries.map(async x=>{
    if(!x?.uid)return null;
    if(now-(Number(x.createdAt)||0)>QUEUE_MAX_AGE_MS){
      try{await remove(queueRefFor(x.uid))}catch{}
      return null;
    }
    try{
      const ps=await get(ref(db,'presence/'+x.uid));
      if(!ps.exists()||ps.val()?.online!==true){
        try{await remove(queueRefFor(x.uid))}catch{}
        return null;
      }
    }catch{return null}
    return x;
  });
  return (await Promise.all(checks)).filter(Boolean);
}

async function join(){
  if(!uid||matching)return;
  matching=true;
  nick=clean($('#nick').value);
  $('#nick').value=nick;
  sessionId=makeSession();
  await refreshPresence();
  await savePlayer();
  show($('#queueView'));
  $('#queueMsg').textContent='Procurando outro jogador online…';

  // Uma única entrada de fila por usuário. A sessão atual substitui qualquer fila antiga do mesmo navegador/usuário.
  const qr=queueRefFor();
  await set(qr,{uid,nick,sessionId,createdAt:Date.now(),status:'waiting'});
  onDisconnect(qr).remove();

  seek();
  botTimer=setTimeout(()=>{if(matching&&!roomId)makeBot()},BOT_WAIT_MS);
}

async function seek(){
  if(!matching||roomId)return;

  const s=await get(ref(db,'queues/tictactoe'));
  let entries=Object.values(s.val()||{})
    .filter(x=>x&&x.status==='waiting'&&x.uid&&x.sessionId);

  entries=await cleanupInvalidQueueEntries(entries);

  // Confirma que a nossa própria sessão ainda é a fila válida.
  const mineQ=entries.find(x=>x.uid===uid&&x.sessionId===sessionId);
  if(!mineQ){
    if(matching&&!roomId){
      await set(queueRefFor(),{uid,nick,sessionId,createdAt:Date.now(),status:'waiting'});
      scheduleSeek(700);
    }
    return;
  }

  const candidates=entries
    .filter(x=>x.uid!==uid)
    .sort((a,b)=>(Number(a.createdAt)||0)-(Number(b.createdAt)||0));

  if(!candidates.length){
    scheduleSeek(800);
    return;
  }

  const o=candidates[0];

  // Reconfirma a fila do adversário no instante do pareamento:
  const liveOther=await get(queueRefFor(o.uid));
  const ov=liveOther.val();
  if(!liveOther.exists()||ov?.status!=='waiting'||ov?.sessionId!==o.sessionId||ov?.nick!==o.nick){
    scheduleSeek(400);
    return;
  }

  const pair=[uid,o.uid].sort();
  if(uid!==pair[0]){
    scheduleSeek(500);
    return;
  }

  // ID de sala depende das SESSÕES atuais, impedindo a reutilização de sala antiga.
  const sessionPair=[
    {uid,sessionId},
    {uid:o.uid,sessionId:o.sessionId}
  ].sort((a,b)=>a.uid.localeCompare(b.uid));

  const rid='ttt_'+sessionPair.map(x=>x.sessionId).join('__');
  const rr=ref(db,'rooms/'+rid);

  const tx=await runTransaction(rr,r=>{
    if(r)return r;
    return {
      game:'tictactoe',
      status:'active',
      createdAt:Date.now(),
      players:{
        X:{uid,nick,sessionId,type:'human'},
        O:{uid:o.uid,nick:o.nick,sessionId:o.sessionId,type:'human'}
      },
      board:['','','','','','','','',''],
      turn:'X',
      winner:'',
      rematch:{}
    };
  });

  const rv=tx.snapshot?.val();
  const belongs=rv&&Object.values(rv.players||{}).some(p=>p?.uid===uid&&p?.sessionId===sessionId);
  if(!belongs){
    scheduleSeek(400);
    return;
  }

  await Promise.allSettled([
    remove(queueRefFor(uid)),
    remove(queueRefFor(o.uid))
  ]);
  enter(rid);
}

async function makeBot(){
  if(!matching||roomId)return;

  // Última checagem de humano antes do fallback.
  const s=await get(ref(db,'queues/tictactoe'));
  let entries=await cleanupInvalidQueueEntries(
    Object.values(s.val()||{}).filter(x=>x&&x.status==='waiting'&&x.uid&&x.sessionId)
  );
  if(entries.some(x=>x.uid!==uid)){
    seek();
    botTimer=setTimeout(()=>{if(matching&&!roomId)makeBot()},1500);
    return;
  }

  const rid='ttt_bot_'+sessionId;
  const names=['Orion','Atlas','Luna','Nexus'];
  await set(ref(db,'rooms/'+rid),{
    game:'tictactoe',
    status:'active',
    createdAt:Date.now(),
    players:{
      X:{uid,nick,sessionId,type:'human'},
      O:{uid:'bot',nick:names[Math.floor(Math.random()*names.length)],sessionId:'bot',type:'bot'}
    },
    board:['','','','','','','','',''],
    turn:'X',
    winner:'',
    rematch:{}
  });
  await remove(queueRefFor());
  enter(rid);
}

function enter(rid){
  roomId=rid;
  matching=false;
  clearTimeout(botTimer);
  clearSeek();
  show($('#gameView'));
  $('#matchInfo').textContent='Sala '+rid.slice(-10);
  if(unsub)unsub();
  unsub=onValue(ref(db,'rooms/'+rid),s=>{
    if(!s.exists())return;
    const incoming=s.val();
    // Ignora qualquer sala que não pertença à sessão corrente.
    if(!Object.values(incoming.players||{}).some(p=>p?.uid===uid&&p?.sessionId===sessionId))return;
    room=incoming;
    render();
    botMove()
  })
}

function render(){
  let m=mine(room),o=opp(room),b=Array.isArray(room.board)?room.board:['','','','','','','','',''];
  $('#meBox').innerHTML='<strong>'+nick+' ('+m+')</strong><small>Você</small>';
  $('#oppBox').innerHTML='<strong>'+(o?.nick||'Adversário')+' ('+(m==='X'?'O':'X')+')</strong><small>'+(o?.type==='bot'?'Jogador virtual':'Jogador online')+'</small>';
  let el=$('#board');el.innerHTML='';
  b.forEach((v,i)=>{
    let bt=document.createElement('button');
    bt.className='cell';bt.textContent=v;
    bt.disabled=!!room.winner||room.turn!==m||!!v;
    bt.onclick=()=>move(i);
    el.appendChild(bt)
  });
  if(room.winner){
    let title=room.winner==='draw'?'Empate':room.winner===m?'Você venceu!':'Você perdeu!';
    $('#status').textContent=title;
    $('#endTitle').textContent=title;
    $('#endText').textContent=room.winner==='draw'?'A partida terminou empatada.':room.winner===m?'Boa partida.':'O adversário venceu esta rodada.';
    $('#endModal').classList.remove('hidden')
  }else{
    $('#status').textContent=room.turn===m?'Sua vez':'Vez de '+(o?.nick||'adversário')
  }
}

async function move(i){
  await runTransaction(ref(db,'rooms/'+roomId),r=>{
    if(!r||r.winner)return r;
    let m=r.players?.X?.uid===uid&&r.players?.X?.sessionId===sessionId?'X':
          r.players?.O?.uid===uid&&r.players?.O?.sessionId===sessionId?'O':'';
    if(!m||r.turn!==m||r.board[i])return r;
    let b=[...r.board];b[i]=m;r.board=b;
    let w=win(b);if(w)r.winner=w;else r.turn=m==='X'?'O':'X';
    r.updatedAt=Date.now();
    return r
  })
}

function botPick(b,mark,human){
  let cells=b.map((v,i)=>v?null:i).filter(i=>i!==null);
  for(let i of cells){let x=[...b];x[i]=mark;if(win(x)===mark)return i}
  for(let i of cells){let x=[...b];x[i]=human;if(win(x)===human)return i}
  if(!b[4])return 4;
  return cells[Math.floor(Math.random()*cells.length)]
}

function botMove(){
  if(botBusy||!room||room.winner)return;
  let side=room.players?.O?.type==='bot'?'O':'';
  if(!side||room.turn!==side)return;
  botBusy=true;
  setTimeout(async()=>{
    await runTransaction(ref(db,'rooms/'+roomId),r=>{
      if(!r||r.winner||r.turn!==side)return r;
      let b=[...r.board],i=botPick(b,side,'X');
      if(i===undefined)return r;
      b[i]=side;r.board=b;
      let w=win(b);if(w)r.winner=w;else r.turn='X';
      r.updatedAt=Date.now();
      return r
    });
    botBusy=false
  },900)
}

async function rematch(){
  $('#endModal').classList.add('hidden');
  let o=opp(room);
  if(o?.type==='bot'){
    return update(ref(db,'rooms/'+roomId),{board:['','','','','','','','',''],turn:'X',winner:'',rematch:{},updatedAt:Date.now()})
  }
  await set(ref(db,'rooms/'+roomId+'/rematch/'+uid),{sessionId,accepted:true});
  $('#status').textContent='Pedido de revanche enviado…';
  let s=await get(ref(db,'rooms/'+roomId+'/rematch')),v=s.val()||{};
  let ids=Object.values(room.players).filter(p=>p.type==='human').map(p=>({uid:p.uid,sessionId:p.sessionId}));
  if(ids.every(x=>v[x.uid]?.accepted===true&&v[x.uid]?.sessionId===x.sessionId)){
    await update(ref(db,'rooms/'+roomId),{board:['','','','','','','','',''],turn:'X',winner:'',rematch:{},updatedAt:Date.now()})
  }
}

async function back(){
  clearTimeout(botTimer);
  clearSeek();
  matching=false;
  if(uid)try{
    const qs=await get(queueRefFor());
    if(qs.exists()&&qs.val()?.sessionId===sessionId)await remove(queueRefFor())
  }catch{}
  if(unsub){unsub();unsub=null}
  roomId=null;room=null;sessionId='';
  $('#endModal').classList.add('hidden');
  show($('#homeView'))
}

$('#randomNick').onclick=()=>$('#nick').value=randomNick();
$('#playTTT').onclick=join;
$('#cancelQueue').onclick=back;
$('#leaveGame').onclick=back;
$('#backBtn').onclick=back;
$('#rematchBtn').onclick=rematch;

boot();
