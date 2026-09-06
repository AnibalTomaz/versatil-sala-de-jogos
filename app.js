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

const BOT_WAIT_MS=12000;
const QUEUE_MAX_AGE_MS=30000;

let uid=null,nick='',sessionId='',roomId=null,roomUnsub=null,queueUnsub=null,room=null;
let botTimer=null,matching=false,botBusy=false,seekTimer=null,enteringRoom=false;

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
function qRef(id=uid){return ref(db,'queues/tictactoe/'+id)}

async function boot(){
  try{
    $('#connBadge').textContent='Autenticando…';
    const c=await signInAnonymously(auth);
    uid=c.user.uid;
    const p=ref(db,'presence/'+uid);
    await set(p,{online:true,updatedAt:serverTimestamp()});
    onDisconnect(p).remove();
    $('#connBadge').textContent='Firebase online';
  }catch(e){
    console.error(e);
    $('#connBadge').textContent='Falha na conexão';
    alert('Falha ao conectar ao Firebase.');
  }
}
async function refreshPresence(){if(uid)await set(ref(db,'presence/'+uid),{online:true,updatedAt:serverTimestamp()})}
async function savePlayer(){await set(ref(db,'players/'+uid),{nick,lastSeen:serverTimestamp(),sessionId})}

function stopQueueListener(){
  if(queueUnsub){queueUnsub();queueUnsub=null}
}
function listenMyQueue(){
  stopQueueListener();
  queueUnsub=onValue(qRef(),snap=>{
    const q=snap.val();
    if(!q || q.sessionId!==sessionId) return;
    if(q.status==='matched' && q.roomId){
      clearTimeout(botTimer);
      clearSeek();
      matching=false;
      $('#queueMsg').textContent='Adversário encontrado! Abrindo partida…';
      enter(q.roomId);
    }
  });
}

async function cleanupInvalid(entries){
  const now=Date.now();
  return (await Promise.all(entries.map(async x=>{
    if(!x?.uid||!x?.sessionId)return null;
    if(now-(Number(x.createdAt)||0)>QUEUE_MAX_AGE_MS){
      try{await remove(qRef(x.uid))}catch{}
      return null;
    }
    try{
      const ps=await get(ref(db,'presence/'+x.uid));
      if(!ps.exists()||ps.val()?.online!==true){
        try{await remove(qRef(x.uid))}catch{}
        return null;
      }
    }catch{return null}
    return x;
  }))).filter(Boolean);
}

async function join(){
  if(!uid||matching||roomId)return;
  matching=true;
  enteringRoom=false;
  nick=clean($('#nick').value);
  $('#nick').value=nick;
  sessionId=makeSession();
  await refreshPresence();
  await savePlayer();
  show($('#queueView'));
  $('#queueMsg').textContent='Procurando outro jogador online…';

  await set(qRef(),{uid,nick,sessionId,createdAt:Date.now(),status:'waiting',roomId:''});
  onDisconnect(qRef()).remove();
  listenMyQueue();

  seek();
  botTimer=setTimeout(()=>{if(matching&&!roomId)makeBot()},BOT_WAIT_MS);
}

async function seek(){
  if(!matching||roomId||enteringRoom)return;

  // Se já fomos associados por outro jogador, não fazemos mais nada.
  const mineSnap=await get(qRef());
  const mineVal=mineSnap.val();
  if(mineVal?.sessionId===sessionId && mineVal?.status==='matched' && mineVal?.roomId){
    clearTimeout(botTimer); clearSeek(); matching=false;
    return enter(mineVal.roomId);
  }

  const s=await get(ref(db,'queues/tictactoe'));
  let entries=Object.values(s.val()||{}).filter(x=>x&&x.status==='waiting'&&x.uid&&x.sessionId);
  entries=await cleanupInvalid(entries);

  const me=entries.find(x=>x.uid===uid&&x.sessionId===sessionId);
  if(!me){
    if(matching&&!roomId){
      await set(qRef(),{uid,nick,sessionId,createdAt:Date.now(),status:'waiting',roomId:''});
      listenMyQueue();
      scheduleSeek(600);
    }
    return;
  }

  const candidates=entries.filter(x=>x.uid!==uid).sort((a,b)=>(Number(a.createdAt)||0)-(Number(b.createdAt)||0));
  if(!candidates.length){scheduleSeek(700);return}

  const o=candidates[0];

  // Confirma fila e sessão do outro jogador imediatamente antes da criação.
  const os=await get(qRef(o.uid)), ov=os.val();
  if(!os.exists()||ov?.status!=='waiting'||ov?.sessionId!==o.sessionId){
    scheduleSeek(350);return;
  }

  // Apenas um lado cria a sala.
  const pair=[uid,o.uid].sort();
  if(uid!==pair[0]){scheduleSeek(350);return}

  const sessionPair=[
    {uid,sessionId},
    {uid:o.uid,sessionId:o.sessionId}
  ].sort((a,b)=>a.uid.localeCompare(b.uid));

  const rid='ttt_'+sessionPair.map(x=>x.sessionId).join('__');
  const rr=ref(db,'rooms/'+rid);

  const tx=await runTransaction(rr,r=>{
    if(r)return r;
    return {
      game:'tictactoe',status:'active',createdAt:Date.now(),
      players:{
        X:{uid,nick,sessionId,type:'human'},
        O:{uid:o.uid,nick:o.nick,sessionId:o.sessionId,type:'human'}
      },
      board:['','','','','','','','',''],turn:'X',winner:'',rematch:{}
    };
  });

  const rv=tx.snapshot?.val();
  const valid=rv &&
    Object.values(rv.players||{}).some(p=>p?.uid===uid&&p?.sessionId===sessionId) &&
    Object.values(rv.players||{}).some(p=>p?.uid===o.uid&&p?.sessionId===o.sessionId);
  if(!valid){scheduleSeek(350);return}

  // CRÍTICO v0.7:
  // Primeiro avisa os DOIS clientes qual é a sala; só depois cada cliente remove sua própria fila.
  await Promise.all([
    update(qRef(uid),{status:'matched',roomId:rid,matchedAt:Date.now()}),
    update(qRef(o.uid),{status:'matched',roomId:rid,matchedAt:Date.now()})
  ]);

  clearTimeout(botTimer);
  clearSeek();
  matching=false;
  enter(rid);
}

async function makeBot(){
  if(!matching||roomId||enteringRoom)return;

  // Antes do bot, verifica se esta sessão já foi pareada.
  const mineSnap=await get(qRef());
  const mv=mineSnap.val();
  if(mv?.sessionId===sessionId && mv?.status==='matched' && mv?.roomId){
    clearTimeout(botTimer); clearSeek(); matching=false;
    return enter(mv.roomId);
  }

  // Última verificação de humano válido.
  const s=await get(ref(db,'queues/tictactoe'));
  let entries=await cleanupInvalid(Object.values(s.val()||{}).filter(x=>x&&x.status==='waiting'&&x.uid&&x.sessionId));
  const human=entries.find(x=>x.uid!==uid);
  if(human){
    $('#queueMsg').textContent='Adversário humano encontrado. Sincronizando partida…';
    seek();
    botTimer=setTimeout(()=>{if(matching&&!roomId)makeBot()},2000);
    return;
  }

  const rid='ttt_bot_'+sessionId;
  const names=['Orion','Atlas','Luna','Nexus'];
  await set(ref(db,'rooms/'+rid),{
    game:'tictactoe',status:'active',createdAt:Date.now(),
    players:{
      X:{uid,nick,sessionId,type:'human'},
      O:{uid:'bot',nick:names[Math.floor(Math.random()*names.length)],sessionId:'bot',type:'bot'}
    },
    board:['','','','','','','','',''],turn:'X',winner:'',rematch:{}
  });
  clearTimeout(botTimer); clearSeek(); matching=false;
  enter(rid);
}

async function enter(rid){
  if(!rid || enteringRoom || roomId===rid)return;
  enteringRoom=true;
  clearTimeout(botTimer); clearSeek();

  // Valida que a sala realmente contém ESTA sessão.
  const rs=await get(ref(db,'rooms/'+rid));
  const rv=rs.val();
  if(!rv || !Object.values(rv.players||{}).some(p=>p?.uid===uid&&p?.sessionId===sessionId)){
    enteringRoom=false;
    if(matching)scheduleSeek(500);
    return;
  }

  roomId=rid;
  matching=false;
  show($('#gameView'));
  $('#matchInfo').textContent='Sala '+rid.slice(-10);

  // Agora sim removemos somente a NOSSA fila.
  try{
    const qs=await get(qRef());
    if(qs.exists()&&qs.val()?.sessionId===sessionId)await remove(qRef());
  }catch{}
  stopQueueListener();

  if(roomUnsub)roomUnsub();
  roomUnsub=onValue(ref(db,'rooms/'+rid),s=>{
    if(!s.exists())return;
    const incoming=s.val();
    if(!Object.values(incoming.players||{}).some(p=>p?.uid===uid&&p?.sessionId===sessionId))return;
    room=incoming;render();botMove();
  });
  enteringRoom=false;
}

function render(){
  const m=mine(room),o=opp(room),b=Array.isArray(room.board)?room.board:['','','','','','','','',''];
  $('#meBox').innerHTML='<strong>'+nick+' ('+m+')</strong><small>Você</small>';
  $('#oppBox').innerHTML='<strong>'+(o?.nick||'Adversário')+' ('+(m==='X'?'O':'X')+')</strong><small>'+(o?.type==='bot'?'Jogador virtual':'Jogador online')+'</small>';
  const el=$('#board');el.innerHTML='';
  b.forEach((v,i)=>{
    const bt=document.createElement('button');
    bt.className='cell';bt.textContent=v;
    bt.disabled=!!room.winner||room.turn!==m||!!v;
    bt.onclick=()=>move(i);el.appendChild(bt);
  });
  if(room.winner){
    const title=room.winner==='draw'?'Empate':room.winner===m?'Você venceu!':'Você perdeu!';
    $('#status').textContent=title;$('#endTitle').textContent=title;
    $('#endText').textContent=room.winner==='draw'?'A partida terminou empatada.':room.winner===m?'Boa partida.':'O adversário venceu esta rodada.';
    $('#endModal').classList.remove('hidden');
  }else $('#status').textContent=room.turn===m?'Sua vez':'Vez de '+(o?.nick||'adversário');
}

async function move(i){
  await runTransaction(ref(db,'rooms/'+roomId),r=>{
    if(!r||r.winner)return r;
    const m=r.players?.X?.uid===uid&&r.players?.X?.sessionId===sessionId?'X':
            r.players?.O?.uid===uid&&r.players?.O?.sessionId===sessionId?'O':'';
    if(!m||r.turn!==m||r.board[i])return r;
    const b=[...r.board];b[i]=m;r.board=b;
    const w=win(b);if(w)r.winner=w;else r.turn=m==='X'?'O':'X';
    r.updatedAt=Date.now();return r;
  });
}

function botPick(b,mark,human){
  const cells=b.map((v,i)=>v?null:i).filter(i=>i!==null);
  for(const i of cells){const x=[...b];x[i]=mark;if(win(x)===mark)return i}
  for(const i of cells){const x=[...b];x[i]=human;if(win(x)===human)return i}
  if(!b[4])return 4;
  return cells[Math.floor(Math.random()*cells.length)];
}
function botMove(){
  if(botBusy||!room||room.winner)return;
  const side=room.players?.O?.type==='bot'?'O':'';
  if(!side||room.turn!==side)return;
  botBusy=true;
  setTimeout(async()=>{
    await runTransaction(ref(db,'rooms/'+roomId),r=>{
      if(!r||r.winner||r.turn!==side)return r;
      const b=[...r.board],i=botPick(b,side,'X');
      if(i===undefined)return r;
      b[i]=side;r.board=b;
      const w=win(b);if(w)r.winner=w;else r.turn='X';
      r.updatedAt=Date.now();return r;
    });
    botBusy=false;
  },900);
}
async function rematch(){
  $('#endModal').classList.add('hidden');
  const o=opp(room);
  if(o?.type==='bot')return update(ref(db,'rooms/'+roomId),{board:['','','','','','','','',''],turn:'X',winner:'',rematch:{},updatedAt:Date.now()});
  await set(ref(db,'rooms/'+roomId+'/rematch/'+uid),{sessionId,accepted:true});
  $('#status').textContent='Pedido de revanche enviado…';
  const s=await get(ref(db,'rooms/'+roomId+'/rematch')),v=s.val()||{};
  const ids=Object.values(room.players).filter(p=>p.type==='human').map(p=>({uid:p.uid,sessionId:p.sessionId}));
  if(ids.every(x=>v[x.uid]?.accepted===true&&v[x.uid]?.sessionId===x.sessionId)){
    await update(ref(db,'rooms/'+roomId),{board:['','','','','','','','',''],turn:'X',winner:'',rematch:{},updatedAt:Date.now()});
  }
}
async function back(){
  clearTimeout(botTimer);clearSeek();matching=false;enteringRoom=false;
  try{
    const qs=await get(qRef());
    if(qs.exists()&&qs.val()?.sessionId===sessionId)await remove(qRef());
  }catch{}
  stopQueueListener();
  if(roomUnsub){roomUnsub();roomUnsub=null}
  roomId=null;room=null;sessionId='';
  $('#endModal').classList.add('hidden');show($('#homeView'));
}

$('#randomNick').onclick=()=>$('#nick').value=randomNick();
$('#playTTT').onclick=join;
$('#cancelQueue').onclick=back;
$('#leaveGame').onclick=back;
$('#backBtn').onclick=back;
$('#rematchBtn').onclick=rematch;
boot();
