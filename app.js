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

const fb=initializeApp(firebaseConfig),auth=getAuth(fb),db=getDatabase(fb);
const $=s=>document.querySelector(s);
const BOT_WAIT_MS=15000,QUEUE_MAX_AGE_MS=45000;
const GAME_NAMES={tictactoe:'Jogo da Velha',connect4:'Quatro em Linha',battleship:'Batalha Naval',chess:'Xadrez',poker:'Poker — Texas Hold’em (+18)'};

let uid=null,nick='',nickKey='',sessionId='',gameKey='',roomId=null,room=null;
let matching=false,enteringRoom=false,botTimer=null,seekTimer=null,roomUnsub=null,assignUnsub=null;
let chessSelected=null,pokerAgeApproved=false;

const views=[$('#homeView'),$('#queueView'),$('#gameView')];
function show(v){views.forEach(x=>x.classList.add('hidden'));v.classList.remove('hidden')}
function makeSession(){return Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10)}
function makeNick(n){return 'SHV'+String(n).padStart(3,'0')}
function randomNickNumber(){return Math.floor(Math.random()*999)+1}
function clearSeek(){if(seekTimer){clearTimeout(seekTimer);seekTimer=null}}
function scheduleSeek(ms=700){clearSeek();seekTimer=setTimeout(seekOpponent,ms)}
function qRef(id=uid){return ref(db,`queues/${gameKey}/${id}`)}
function assignmentRef(id=uid){return ref(db,`queues/assignments/${gameKey}/${id}`)}
function nickRef(key=nickKey){return ref(db,'queues/nickReservations/'+key)}
function sideOf(r){
  if(r?.players?.blue?.uid===uid&&r?.players?.blue?.sessionId===sessionId)return 'blue';
  if(r?.players?.red?.uid===uid&&r?.players?.red?.sessionId===sessionId)return 'red';
  return '';
}
function opponentOf(r){
  const s=sideOf(r); return s==='blue'?r?.players?.red:r?.players?.blue;
}
function otherSide(s){return s==='blue'?'red':'blue'}
function scoreOf(r,s){return Number(r?.score?.[s]||0)}

async function boot(){
  const buttons=['#playTTT','#playC4','#playBattle','#playChess','#playPoker'].map($);
  buttons.forEach(b=>b.disabled=true);
  $('#nick').value='Gerando…';
  try{
    $('#connBadge').textContent='Autenticando…';
    const c=await signInAnonymously(auth); uid=c.user.uid;
    const p=ref(db,'presence/'+uid);
    await set(p,{online:true,updatedAt:serverTimestamp()}); onDisconnect(p).remove();
    await assignFreshAutomaticNick();
    $('#connBadge').textContent='Firebase online';
    buttons.forEach(b=>b.disabled=false);
  }catch(e){
    console.error(e); $('#nick').value='Indisponível'; $('#connBadge').textContent='Falha na conexão';
  }
}
async function releasePreviousNickFromProfile(){
  try{
    const ps=await get(ref(db,'players/'+uid)),pv=ps.val(),previousKey=pv?.nickKey;
    if(previousKey){
      const rs=await get(ref(db,'queues/nickReservations/'+previousKey));
      if(rs.val()?.uid===uid)await remove(ref(db,'queues/nickReservations/'+previousKey));
    }
  }catch{}
}
async function reserveAutomaticNick(candidate){
  const key=candidate.toLowerCase(),r=ref(db,'queues/nickReservations/'+key);
  const tx=await runTransaction(r,current=>{
    if(current===null||current?.uid===uid)return {uid,nick:candidate,updatedAt:Date.now()};
    return;
  });
  if(!tx.committed)return false;
  nick=candidate;nickKey=key;$('#nick').value=nick;onDisconnect(r).remove();
  await set(ref(db,'players/'+uid),{nick,nickKey,lastSeen:serverTimestamp(),sessionId:''});
  return true;
}
async function assignFreshAutomaticNick(){
  await releasePreviousNickFromProfile();
  const previousLocal=localStorage.getItem('versatil_last_shv_nick')||'',tried=new Set();
  for(let i=0;i<999;i++){
    let n;do{n=randomNickNumber()}while(tried.has(n)&&tried.size<999);tried.add(n);
    const candidate=makeNick(n);if(candidate===previousLocal)continue;
    if(await reserveAutomaticNick(candidate)){localStorage.setItem('versatil_last_shv_nick',candidate);return}
  }
  throw new Error('Sem nick disponível');
}

function initialGameState(key,blue,red){
  const base={game:key,status:'active',createdAt:Date.now(),players:{blue,red},score:{blue:0,red:0},winner:'',rematch:{}};
  if(key==='tictactoe')return {...base,board:Array(9).fill(''),turn:'blue'};
  if(key==='connect4')return {...base,board:Array(42).fill(''),turn:'blue'};
  if(key==='battleship')return {...base,ships:{blue:makeFleet(),red:makeFleet()},shots:{blue:[],red:[]},turn:'blue'};
  if(key==='chess')return {...base,board:initialChessBoard(),turn:'blue',lastMove:null};
  if(key==='poker')return buildPokerHand(base);
  return base;
}

function stopAssignmentListener(){if(assignUnsub){assignUnsub();assignUnsub=null}}
function listenAssignment(){
  stopAssignmentListener();
  assignUnsub=onValue(assignmentRef(),snap=>{
    const a=snap.val();
    if(!a||a.sessionId!==sessionId||!a.roomId)return;
    clearTimeout(botTimer);clearSeek();matching=false;enter(a.roomId);
  });
}
async function cleanupInvalid(entries){
  const now=Date.now();
  return (await Promise.all(entries.map(async x=>{
    if(!x?.uid||!x?.sessionId)return null;
    if(now-(Number(x.createdAt)||0)>QUEUE_MAX_AGE_MS){try{await remove(qRef(x.uid))}catch{};return null}
    try{
      const ps=await get(ref(db,'presence/'+x.uid));
      if(!ps.exists()||ps.val()?.online!==true){try{await remove(qRef(x.uid))}catch{};return null}
    }catch{return null}
    return x;
  }))).filter(Boolean);
}

async function startGame(key){
  if(!uid||matching||roomId)return;
  gameKey=key;sessionId=makeSession();matching=true;enteringRoom=false;
  await set(ref(db,'players/'+uid),{nick,nickKey,lastSeen:serverTimestamp(),sessionId});
  try{await remove(assignmentRef())}catch{}
  show($('#queueView'));$('#queueTitle').textContent='Procurando adversário…';$('#queueMsg').textContent=`Entrando na fila de ${GAME_NAMES[key]}.`;
  await set(qRef(),{uid,nick,sessionId,createdAt:Date.now(),status:'waiting'});
  onDisconnect(qRef()).remove();onDisconnect(assignmentRef()).remove();
  listenAssignment();seekOpponent();
  botTimer=setTimeout(()=>{if(matching&&!roomId)makeBotOpponent()},BOT_WAIT_MS);
}

async function seekOpponent(){
  if(!matching||roomId||enteringRoom)return;
  const as=await get(assignmentRef()),av=as.val();
  if(av?.sessionId===sessionId&&av?.roomId){matching=false;return enter(av.roomId)}
  const s=await get(ref(db,`queues/${gameKey}`));
  let entries=Object.values(s.val()||{}).filter(x=>x&&x.status==='waiting'&&x.uid&&x.sessionId);
  entries=await cleanupInvalid(entries);
  const me=entries.find(x=>x.uid===uid&&x.sessionId===sessionId);
  if(!me){await set(qRef(),{uid,nick,sessionId,createdAt:Date.now(),status:'waiting'});scheduleSeek(600);return}
  const candidates=entries.filter(x=>x.uid!==uid).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  if(!candidates.length){scheduleSeek();return}
  const o=candidates[0];
  const [os,ps]=await Promise.all([get(qRef(o.uid)),get(ref(db,'presence/'+o.uid))]);
  if(!os.exists()||os.val()?.status!=='waiting'||os.val()?.sessionId!==o.sessionId||ps.val()?.online!==true){scheduleSeek(350);return}
  const pair=[uid,o.uid].sort(); if(uid!==pair[0]){scheduleSeek(350);return}
  const sessionPair=[{uid,sessionId},{uid:o.uid,sessionId:o.sessionId}].sort((a,b)=>a.uid.localeCompare(b.uid));
  const rid=`${gameKey}_${sessionPair.map(x=>x.sessionId).join('__')}`;
  const blue={uid,nick,sessionId,type:'human'},red={uid:o.uid,nick:o.nick,sessionId:o.sessionId,type:'human'};
  const tx=await runTransaction(ref(db,'rooms/'+rid),r=>r||initialGameState(gameKey,blue,red));
  const rv=tx.snapshot.val();
  if(!rv)return scheduleSeek(400);
  await Promise.all([
    set(assignmentRef(uid),{uid,sessionId,roomId:rid,createdAt:Date.now()}),
    set(assignmentRef(o.uid),{uid:o.uid,sessionId:o.sessionId,roomId:rid,createdAt:Date.now()})
  ]);
  await Promise.allSettled([remove(qRef(uid)),remove(qRef(o.uid))]);
  matching=false;enter(rid);
}

async function makeBotOpponent(){
  if(!matching||roomId||enteringRoom)return;
  const as=await get(assignmentRef()),av=as.val();
  if(av?.sessionId===sessionId&&av?.roomId){matching=false;return enter(av.roomId)}
  const s=await get(ref(db,`queues/${gameKey}`));
  let entries=await cleanupInvalid(Object.values(s.val()||{}).filter(x=>x&&x.status==='waiting'));
  if(entries.some(x=>x.uid!==uid)){seekOpponent();botTimer=setTimeout(()=>makeBotOpponent(),2500);return}
  await new Promise(r=>setTimeout(r,1000));
  const botNames=['BOT101','BOT247','BOT388','BOT512','BOT764','BOT903'];
  const rid=`${gameKey}_bot_${sessionId}`;
  const blue={uid,nick,sessionId,type:'human'};
  const red={uid:'bot',nick:botNames[Math.floor(Math.random()*botNames.length)],sessionId:'bot',type:'bot'};
  await set(ref(db,'rooms/'+rid),initialGameState(gameKey,blue,red));
  await set(assignmentRef(),{uid,sessionId,roomId:rid,createdAt:Date.now()});
  try{await remove(qRef())}catch{}
  matching=false;enter(rid);
}

async function enter(rid){
  if(!rid||enteringRoom||roomId===rid)return;
  enteringRoom=true;clearTimeout(botTimer);clearSeek();
  const rs=await get(ref(db,'rooms/'+rid)),rv=rs.val();
  if(!rv||!Object.values(rv.players||{}).some(p=>p?.uid===uid&&p?.sessionId===sessionId)){enteringRoom=false;return}
  roomId=rid;gameKey=rv.game;matching=false;show($('#gameView'));$('#gameTitle').textContent=GAME_NAMES[gameKey];$('#matchInfo').textContent='';
  stopAssignmentListener();
  if(roomUnsub)roomUnsub();
  roomUnsub=onValue(ref(db,'rooms/'+rid),s=>{
    if(!s.exists())return;room=s.val();renderGame();maybeBotMove();maybeStartHumanRematch(room);
  });
  enteringRoom=false;
}

function renderPlayersTwo(){
  const side=sideOf(room),opp=opponentOf(room);
  $('#playersArea').classList.remove('hidden');
  $('#meBox').className='playerBox playerBlue';
  $('#oppBox').className='playerBox playerRed';
  $('#meBox').innerHTML=`<strong>${nick}</strong><small>Você • Azul</small><div class="scoreNumber">${scoreOf(room,side)}</div>`;
  $('#oppBox').innerHTML=`<strong>${opp?.nick||'Adversário'}</strong><small>${opp?.type==='bot'?'Jogador virtual':'Jogador online'} • Vermelho</small><div class="scoreNumber">${scoreOf(room,otherSide(side))}</div>`;
}
function renderGame(){
  if(!room)return;
  if(gameKey==='poker')return renderPoker();
  renderPlayersTwo();
  if(gameKey==='tictactoe')renderTTT();
  if(gameKey==='connect4')renderConnect4();
  if(gameKey==='battleship')renderBattleship();
  if(gameKey==='chess')renderChess();
  renderEndState();
}
function winnerText(){
  const s=sideOf(room);
  if(room.winner==='draw')return 'Empate';
  return room.winner===s?'Você venceu!':'Você perdeu!';
}
function renderEndState(){
  if(!room.winner){$('#endModal').classList.add('hidden');$('#rematchBtn').disabled=false;return}
  const title=winnerText(),opp=opponentOf(room),humanGame=opp?.type!=='bot';
  const myVote=humanGame&&room.rematch?.[uid]?.accepted===true&&room.rematch?.[uid]?.sessionId===sessionId;
  $('#endTitle').textContent=title;$('#endText').textContent=room.winner==='draw'?'A partida terminou empatada.':room.winner===sideOf(room)?'Boa partida.':'O adversário venceu esta rodada.';
  if(myVote){$('#endModal').classList.add('hidden');$('#status').textContent='Aguardando o adversário aceitar jogar de novo…';$('#rematchBtn').disabled=true}
  else{$('#endModal').classList.remove('hidden');$('#rematchBtn').disabled=false}
}
function awardWinner(r,w){
  r.winner=w;
  if(w&&w!=='draw'){r.score=r.score||{blue:0,red:0};r.score[w]=(Number(r.score[w])||0)+1}
}

/* JOGO DA VELHA */
function tttWin(b){
  for(const [a,c,d] of [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]])if(b[a]&&b[a]===b[c]&&b[a]===b[d])return b[a];
  return b.every(Boolean)?'draw':'';
}
function renderTTT(){
  const side=sideOf(room),b=room.board||Array(9).fill('');
  $('#status').textContent=room.winner?winnerText():room.turn===side?'Sua vez':'Vez do adversário';
  const el=$('#board');el.className='board ttt';el.innerHTML='';$('#extraGameArea').innerHTML='';
  b.forEach((v,i)=>{
    const bt=document.createElement('button');bt.className='cell '+(v==='blue'?'markX':v==='red'?'markO':'');bt.textContent=v==='blue'?'X':v==='red'?'O':'';
    bt.disabled=!!room.winner||room.turn!==side||!!v;bt.onclick=()=>tttMove(i);el.appendChild(bt);
  });
}
async function tttMove(i){
  await runTransaction(ref(db,'rooms/'+roomId),r=>{
    const s=r&&sideOf(r);if(!r||r.winner||r.turn!==s||r.board[i])return r;
    r.board[i]=s;const w=tttWin(r.board);if(w)awardWinner(r,w);else r.turn=otherSide(s);r.updatedAt=Date.now();return r;
  });
}
function tttBotPick(b){
  const free=b.map((v,i)=>v?null:i).filter(x=>x!==null);
  for(const i of free){const c=[...b];c[i]='red';if(tttWin(c)==='red')return i}
  for(const i of free){const c=[...b];c[i]='blue';if(tttWin(c)==='blue')return i}
  if(!b[4])return 4;return free[Math.floor(Math.random()*free.length)];
}

/* QUATRO EM LINHA */
function c4Winner(b){
  const at=(r,c)=>b[r*7+c];
  for(let r=0;r<6;r++)for(let c=0;c<7;c++){
    const s=at(r,c);if(!s)continue;
    for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
      let ok=true;for(let k=1;k<4;k++){const rr=r+dr*k,cc=c+dc*k;if(rr<0||rr>=6||cc<0||cc>=7||at(rr,cc)!==s){ok=false;break}}
      if(ok)return s;
    }
  }
  return b.every(Boolean)?'draw':'';
}
function c4Drop(b,col,side){
  for(let r=5;r>=0;r--){const i=r*7+col;if(!b[i]){b[i]=side;return i}}return -1;
}
function renderConnect4(){
  const side=sideOf(room),b=room.board||Array(42).fill('');
  $('#status').textContent=room.winner?winnerText():room.turn===side?'Sua vez — escolha uma coluna':'Vez do adversário';
  const el=$('#board');el.className='board connect4';el.innerHTML='';$('#extraGameArea').innerHTML='';
  b.forEach((v,i)=>{
    const bt=document.createElement('button');bt.className='c4cell '+(v==='blue'?'c4blue':v==='red'?'c4red':'');
    bt.disabled=!!room.winner||room.turn!==side||!!b[i%7];bt.onclick=()=>c4Move(i%7);el.appendChild(bt);
  });
}
async function c4Move(col){
  await runTransaction(ref(db,'rooms/'+roomId),r=>{
    const s=r&&sideOf(r);if(!r||r.winner||r.turn!==s)return r;
    const b=[...r.board];if(c4Drop(b,col,s)<0)return r;r.board=b;const w=c4Winner(b);if(w)awardWinner(r,w);else r.turn=otherSide(s);r.updatedAt=Date.now();return r;
  });
}
function c4BotColumn(b){
  const valid=[0,1,2,3,4,5,6].filter(c=>!b[c]);
  for(const c of valid){const x=[...b];c4Drop(x,c,'red');if(c4Winner(x)==='red')return c}
  for(const c of valid){const x=[...b];c4Drop(x,c,'blue');if(c4Winner(x)==='blue')return c}
  return valid[Math.floor(Math.random()*valid.length)];
}

/* BATALHA NAVAL */
function makeFleet(){
  const sizes=[3,2,2],occupied=new Set(),fleet=[];
  for(const size of sizes){
    let placed=false;
    for(let tries=0;tries<200&&!placed;tries++){
      const horiz=Math.random()<.5,r=Math.floor(Math.random()*8),c=Math.floor(Math.random()*8);
      const cells=[];for(let k=0;k<size;k++){const rr=r+(horiz?0:k),cc=c+(horiz?k:0);if(rr>=8||cc>=8){cells.length=0;break}cells.push(rr*8+cc)}
      if(cells.length===size&&cells.every(x=>!occupied.has(x))){cells.forEach(x=>occupied.add(x));fleet.push(...cells);placed=true}
    }
  }return fleet.sort((a,b)=>a-b);
}
function warshipSegmentClass(fleet,index){
  if(!fleet.includes(index))return '';
  const r=Math.floor(index/8),c=index%8;
  const left=c>0&&fleet.includes(index-1);
  const right=c<7&&fleet.includes(index+1);
  const up=r>0&&fleet.includes(index-8);
  const down=r<7&&fleet.includes(index+8);

  // Classificação visual aproximada do trecho do casco.
  if((right&&!left)||(down&&!up))return 'warship3d warshipBow';
  if((left&&!right)||(up&&!down))return 'warship3d warshipStern';
  return 'warship3d warshipMid';
}

function renderBattleship(){
  const side=sideOf(room),opp=otherSide(side);
  const myFleet=Array.isArray(room.ships?.[side])?room.ships[side]:[];
  const myIncoming=Array.isArray(room.shots?.[opp])?room.shots[opp]:[];
  const myShots=Array.isArray(room.shots?.[side])?room.shots[side]:[];
  const oppFleet=Array.isArray(room.ships?.[opp])?room.ships[opp]:[];

  $('#status').textContent=room.winner
    ? winnerText()
    : room.turn===side
      ? 'Sua vez — clique em uma posição no mar adversário'
      : 'Vez do adversário';

  $('#board').className='board';
  $('#board').innerHTML='';

  const extra=$('#extraGameArea');
  extra.innerHTML=
    '<div class="battleWrap">'+
      '<div class="battlePanel"><h3>Seu mar — Azul</h3><div id="mySea" class="battleGrid"></div><div class="battleLegend">Seus navios posicionados sobre o mar</div></div>'+
      '<div class="battlePanel"><h3>Mar adversário — Vermelho</h3><div id="enemySea" class="battleGrid"></div><div class="battleLegend">Água = gota azul • Acerto no navio = vermelho</div></div>'+
    '</div>';

  const my=$('#mySea'),enemy=$('#enemySea');

  for(let i=0;i<64;i++){
    const own=document.createElement('button');
    own.type='button';
    const shipClass=warshipSegmentClass(myFleet,i);
    const ownWasShot=myIncoming.includes(i);
    const ownIsShip=myFleet.includes(i);
    own.className='battleCell '+
      (shipClass?shipClass+' ':'')+
      (ownWasShot&&!ownIsShip?'waterMiss ':'')+
      (ownWasShot&&ownIsShip?'shipHitRed ':'');
    own.disabled=true;
    my.appendChild(own);

    const target=document.createElement('button');
    target.type='button';
    const alreadyShot=myShots.includes(i);
    const hit=alreadyShot&&oppFleet.includes(i);
    target.className='battleCell enemyCell '+
      (alreadyShot&&!hit?'waterMiss ':'')+
      (hit?'enemyShipHit ':'');
    target.setAttribute('aria-label',alreadyShot?'Posição já atacada':'Atacar posição '+(i+1));

    // Define explicitamente o estado clicável em vez de depender de herança/re-render.
    const canShoot=!room.winner && room.turn===side && !alreadyShot;
    target.disabled=!canShoot;

    if(canShoot){
      target.addEventListener('click',ev=>{
        ev.preventDefault();
        ev.stopPropagation();
        battleShot(i);
      },{once:true});
      target.addEventListener('touchend',ev=>{
        ev.preventDefault();
        ev.stopPropagation();
        battleShot(i);
      },{once:true});
    }
    enemy.appendChild(target);
  }
}
async function battleShot(i){
  if(!roomId||!room)return;
  await runTransaction(ref(db,'rooms/'+roomId),r=>{
    if(!r||r.winner)return r;
    const s=sideOf(r);
    if(!s||r.turn!==s)return r;

    r.shots=r.shots||{blue:[],red:[]};
    const shots=Array.isArray(r.shots[s])?[...r.shots[s]]:[];
    if(shots.includes(i))return r;

    shots.push(i);
    r.shots[s]=shots;

    const o=otherSide(s);
    const fleet=Array.isArray(r.ships?.[o])?r.ships[o]:[];
    if(fleet.length&&fleet.every(x=>shots.includes(x)))awardWinner(r,s);
    else r.turn=o;

    r.updatedAt=Date.now();
    return r;
  });
}
function battleBotShot(r){
  const used=r.shots?.red||[];const free=Array.from({length:64},(_,i)=>i).filter(i=>!used.includes(i));return free[Math.floor(Math.random()*free.length)];
}

/* XADREZ */
const PIECE_GLYPH={bK:'♔',bQ:'♕',bR:'♖',bB:'♗',bN:'♘',bP:'♙',rK:'♚',rQ:'♛',rR:'♜',rB:'♝',rN:'♞',rP:'♟'};
function initialChessBoard(){
  return ['rR','rN','rB','rQ','rK','rB','rN','rR',...Array(8).fill('rP'),...Array(32).fill(''),...Array(8).fill('bP'),'bR','bN','bB','bQ','bK','bB','bN','bR'];
}
function chessColor(p){return p?.[0]==='b'?'blue':p?.[0]==='r'?'red':''}
function rc(i){return [Math.floor(i/8),i%8]} function idx(r,c){return r*8+c}
function pseudoMoves(board,from){
  const p=board[from];if(!p)return[];const color=chessColor(p),type=p[1],[r,c]=rc(from),moves=[];
  const add=(rr,cc,slide=false)=>{
    if(rr<0||rr>=8||cc<0||cc>=8)return false;const t=board[idx(rr,cc)];
    if(!t){moves.push(idx(rr,cc));return true}
    if(chessColor(t)!==color)moves.push(idx(rr,cc));return false;
  };
  if(type==='P'){
    const d=color==='blue'?-1:1,start=color==='blue'?6:1,one=r+d;
    if(one>=0&&one<8&&!board[idx(one,c)]){moves.push(idx(one,c));const two=r+2*d;if(r===start&&!board[idx(two,c)])moves.push(idx(two,c))}
    for(const dc of [-1,1]){const rr=r+d,cc=c+dc;if(rr>=0&&rr<8&&cc>=0&&cc<8&&board[idx(rr,cc)]&&chessColor(board[idx(rr,cc)])!==color)moves.push(idx(rr,cc))}
  }else if(type==='N'){
    for(const [dr,dc] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]])add(r+dr,c+dc);
  }else if(type==='K'){
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if(dr||dc)add(r+dr,c+dc);
  }else{
    const dirs=type==='B'?[[1,1],[1,-1],[-1,1],[-1,-1]]:type==='R'?[[1,0],[-1,0],[0,1],[0,-1]]:[[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
    for(const [dr,dc] of dirs){let rr=r+dr,cc=c+dc;while(rr>=0&&rr<8&&cc>=0&&cc<8){if(!add(rr,cc,true))break;rr+=dr;cc+=dc}}
  }
  return moves;
}
function isKingAttacked(board,color){
  const kingPiece=color==='blue'?'bK':'rK',king=board.indexOf(kingPiece);if(king<0)return true;
  const enemy=otherSide(color);
  for(let i=0;i<64;i++)if(chessColor(board[i])===enemy&&pseudoMoves(board,i).includes(king))return true;
  return false;
}
function legalChessMoves(board,from){
  const color=chessColor(board[from]);if(!color)return[];
  return pseudoMoves(board,from).filter(to=>{
    const b=[...board],p=b[from];b[to]=p;b[from]='';
    if(p==='bP'&&Math.floor(to/8)===0)b[to]='bQ';if(p==='rP'&&Math.floor(to/8)===7)b[to]='rQ';
    return !isKingAttacked(b,color);
  });
}
function chessGameResult(board,turn){
  const kingBlue=board.includes('bK'),kingRed=board.includes('rK');if(!kingBlue)return'red';if(!kingRed)return'blue';
  let any=false;for(let i=0;i<64;i++)if(chessColor(board[i])===turn&&legalChessMoves(board,i).length){any=true;break}
  if(any)return'';return isKingAttacked(board,turn)?otherSide(turn):'draw';
}
function renderChess(){
  const side=sideOf(room),b=room.board||initialChessBoard();
  $('#status').textContent=room.winner
    ? winnerText()
    : room.turn===side
      ? (chessSelected===null?'Sua vez — selecione uma peça':'Escolha uma das posições destacadas')
      : 'Vez do adversário';

  $('#extraGameArea').innerHTML='';
  const el=$('#board');
  el.className='board chess';
  el.innerHTML='';

  const legal=chessSelected===null?[]:legalChessMoves(b,chessSelected);

  for(let i=0;i<64;i++){
    const piece=b[i],bt=document.createElement('button'),[r,c]=rc(i);
    const isLegal=legal.includes(i);
    const isCapture=isLegal && !!piece && chessColor(piece)!==side;

    bt.type='button';
    bt.dataset.square=String(i);
    bt.className=
      'chessCell '+
      (((r+c)%2)?'dark ':'')+
      (chessColor(piece)==='blue'?'chessBlue ':chessColor(piece)==='red'?'chessRed ':'')+
      (chessSelected===i?'selectedSquare ':'')+
      (isLegal&&!isCapture?'legalTarget ':'')+
      (isCapture?'legalCapture ':'');
    bt.textContent=PIECE_GLYPH[piece]||'';
    bt.disabled=!!room.winner||room.turn!==side;
    bt.onclick=()=>chessClick(i);
    el.appendChild(bt);
  }
}
async function animateChessPiece(from,to,piece){
  const boardEl=$('#board');
  const fromEl=boardEl?.querySelector(`[data-square="${from}"]`);
  const toEl=boardEl?.querySelector(`[data-square="${to}"]`);
  if(!fromEl||!toEl||!piece)return;

  const a=fromEl.getBoundingClientRect(),b=toEl.getBoundingClientRect();
  const flyer=document.createElement('div');
  flyer.className='chessFlyingPiece '+(chessColor(piece)==='blue'?'blue':'red');
  flyer.textContent=PIECE_GLYPH[piece]||'';
  flyer.style.left=a.left+'px';
  flyer.style.top=a.top+'px';
  flyer.style.width=a.width+'px';
  flyer.style.height=a.height+'px';

  // Esconde visualmente a peça original durante o deslocamento.
  const oldColor=fromEl.style.color;
  fromEl.style.color='transparent';

  document.body.appendChild(flyer);
  await new Promise(requestAnimationFrame);
  flyer.style.transform=`translate(${b.left-a.left}px,${b.top-a.top}px)`;
  await new Promise(resolve=>setTimeout(resolve,360));
  flyer.remove();
  fromEl.style.color=oldColor;
}

async function chessClick(i){
  const side=sideOf(room),b=room.board;
  if(room.turn!==side)return;

  if(chessSelected===null){
    if(chessColor(b[i])===side){
      chessSelected=i;
      renderChess();
    }
    return;
  }

  const from=chessSelected;
  const moves=legalChessMoves(b,from);

  if(!moves.includes(i)){
    if(chessColor(b[i])===side){
      chessSelected=i;
      renderChess();
    }else{
      chessSelected=null;
      renderChess();
    }
    return;
  }

  const movingPiece=b[from];
  chessSelected=null;

  // Primeiro anima localmente, depois confirma a jogada compartilhada no Firebase.
  await animateChessPiece(from,i,movingPiece);

  await runTransaction(ref(db,'rooms/'+roomId),r=>{
    const s=r&&sideOf(r);
    if(!r||r.winner||r.turn!==s)return r;

    const legal=legalChessMoves(r.board,from);
    if(!legal.includes(i))return r;

    const p=r.board[from];
    r.board[i]=p;
    r.board[from]='';

    if(p==='bP'&&Math.floor(i/8)===0)r.board[i]='bQ';
    if(p==='rP'&&Math.floor(i/8)===7)r.board[i]='rQ';

    r.turn=otherSide(s);
    const result=chessGameResult(r.board,r.turn);
    if(result)awardWinner(r,result);
    r.updatedAt=Date.now();
    return r;
  });
}
function chessBotMove(r){
  const moves=[];for(let i=0;i<64;i++)if(chessColor(r.board[i])==='red')for(const to of legalChessMoves(r.board,i))moves.push([i,to]);
  return moves[Math.floor(Math.random()*moves.length)];
}

/* POKER TEXAS HOLD'EM RECREATIVO */
const SUITS=['♠','♥','♦','♣'],RANKS=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
function makeDeck(){const d=[];for(const s of SUITS)for(const r of RANKS)d.push(r+s);for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]]}return d}
function buildPokerHand(base){
  const players={blue:base.players.blue,red:base.players.red,bot2:{uid:'bot2',nick:'BOT618',sessionId:'bot2',type:'bot'},bot3:{uid:'bot3',nick:'BOT842',sessionId:'bot3',type:'bot'}};
  const d=makeDeck(),holes={};for(const s of Object.keys(players))holes[s]=[d.pop(),d.pop()];
  const community=[d.pop(),d.pop(),d.pop(),d.pop(),d.pop()];
  return {...base,players,score:{blue:0,red:0,bot2:0,bot3:0},chips:{blue:990,red:990,bot2:990,bot3:990},pot:40,stage:0,holes,community,winner:'',winnerSeats:[],rematch:{},status:'active'};
}
function cardObj(c){const suit=c.slice(-1),rank=c.slice(0,-1),v=RANKS.indexOf(rank)+2;return{c,suit,rank,v}}
function combos5(arr){const out=[];for(let a=0;a<3;a++)for(let b=a+1;b<4;b++)for(let c=b+1;c<5;c++)for(let d=c+1;d<6;d++)for(let e=d+1;e<7;e++)out.push([arr[a],arr[b],arr[c],arr[d],arr[e]]);return out}
function eval5(cards){
  const o=cards.map(cardObj),vals=o.map(x=>x.v).sort((a,b)=>b-a),counts={};vals.forEach(v=>counts[v]=(counts[v]||0)+1);
  const flush=o.every(x=>x.suit===o[0].suit),uniq=[...new Set(vals)],straightHigh=uniq.includes(14)&&[5,4,3,2].every(v=>uniq.includes(v))?5:uniq.find(v=>[v-1,v-2,v-3,v-4].every(x=>uniq.includes(x)))||0;
  const groups=Object.entries(counts).map(([v,n])=>[Number(v),n]).sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
  if(flush&&straightHigh)return[8,straightHigh];
  if(groups[0][1]===4)return[7,groups[0][0],groups[1][0]];
  if(groups[0][1]===3&&groups[1]?.[1]===2)return[6,groups[0][0],groups[1][0]];
  if(flush)return[5,...vals];
  if(straightHigh)return[4,straightHigh];
  if(groups[0][1]===3)return[3,groups[0][0],...groups.slice(1).map(x=>x[0]).sort((a,b)=>b-a)];
  if(groups[0][1]===2&&groups[1]?.[1]===2){const ps=[groups[0][0],groups[1][0]].sort((a,b)=>b-a);return[2,...ps,groups.find(x=>x[1]===1)[0]]}
  if(groups[0][1]===2)return[1,groups[0][0],...groups.slice(1).map(x=>x[0]).sort((a,b)=>b-a)];
  return[0,...vals];
}
function cmpRank(a,b){for(let i=0;i<Math.max(a.length,b.length);i++){const x=a[i]||0,y=b[i]||0;if(x!==y)return x-y}return 0}
function best7(cards){return combos5(cards).map(eval5).sort((a,b)=>cmpRank(b,a))[0]}
function pokerResolve(r){
  const seats=Object.keys(r.players),ranked=seats.map(s=>[s,best7([...(r.holes[s]||[]),...r.community])]);
  ranked.sort((a,b)=>cmpRank(b[1],a[1]));const best=ranked[0][1],wins=ranked.filter(x=>cmpRank(x[1],best)===0).map(x=>x[0]);
  r.winnerSeats=wins;r.winner=wins.length===1?wins[0]:'draw';
  const share=Math.floor((r.pot||0)/wins.length);wins.forEach(s=>{r.chips[s]=(r.chips[s]||0)+share;r.score[s]=(r.score[s]||0)+1});
}
function cardHtml(c,hidden=false){
  if(hidden)return'<div class="playingCard back">◆</div>';const red=c.includes('♥')||c.includes('♦');return`<div class="playingCard ${red?'redSuit':''}">${c}</div>`;
}
function renderPoker(){
  $('#playersArea').classList.add('hidden');
  $('#board').className='board';
  $('#board').innerHTML='';

  const side=sideOf(room);
  const seats=Object.keys(room.players||{});
  const extra=$('#extraGameArea');

  // Ordena a mesa para manter o usuário sempre na posição inferior.
  const others=seats.filter(s=>s!==side);
  const positions=[
    {seat:others[0],pos:'top'},
    {seat:others[1],pos:'left'},
    {seat:others[2],pos:'right'},
    {seat:side,pos:'bottom'}
  ].filter(x=>x.seat);

  const visibleCount=room.stage===0?0:room.stage===1?3:room.stage===2?4:5;
  const community=(room.community||[]).map((c,i)=>cardHtml(c,i>=visibleCount)).join('');

  let seatHtml='';
  for(const {seat,pos} of positions){
    const p=room.players[seat];
    const you=p.uid===uid&&p.sessionId===sessionId;
    const hole=room.holes?.[seat]||[];
    const holeHtml=you
      ? hole.map(c=>{
          const red=c.includes('♥')||c.includes('♦');
          return `<span class="miniCard face ${red?'redSuit':''}">${c}</span>`;
        }).join('')
      : '<span class="miniCard">◆</span><span class="miniCard">◆</span>';

    seatHtml+=`
      <div class="pokerSeatPos ${pos} ${you?'you':''}">
        <strong>${p.nick}</strong>
        <small>${you?'Você':p.type==='bot'?'Jogador virtual':'Jogador online'}</small>
        <div class="scoreNumber">${Number(room.score?.[seat]||0)}</div>
        <div class="chips">Fichas fictícias: ${Number(room.chips?.[seat]||0)}</div>
        <div class="pokerSeatCards">${holeHtml}</div>
      </div>`;
  }

  let result='';
  if(room.winner){
    const win=room.winnerSeats||[];
    result=win.includes(side)?'Você venceu a mão!':'Mão encerrada.';
  }

  const actionLabel=room.stage===0?'Revelar flop':
                    room.stage===1?'Revelar turn':
                    room.stage===2?'Revelar river':
                    room.stage===3?'Resultado':'Mão encerrada';

  extra.innerHTML=`
    <div class="pokerArena">
      ${seatHtml}
      <div class="pokerOval">
        <div class="pokerCenter">
          <strong>Texas Hold’em • play money</strong>
          <div class="cards">${community}</div>
          <div>Pot fictício: ${Number(room.pot||0)}</div>
          <div class="playMoneyNote">Sem dinheiro real, depósitos, retiradas, prêmios ou conversão de fichas.</div>
          <div class="pokerActionsBelow">
            <button id="pokerNext">${actionLabel}</button>
          </div>
        </div>
      </div>
    </div>`;

  $('#status').textContent=room.winner?result:'Mesa recreativa em andamento';

  const next=$('#pokerNext');
  if(next){
    next.disabled=!!room.winner;
    next.onclick=pokerNextStage;
  }

  if(room.winner)renderPokerEnd();
  else $('#endModal').classList.add('hidden');
}
async function pokerNextStage(){
  await runTransaction(ref(db,'rooms/'+roomId),r=>{
    if(!r||r.winner)return r;r.stage=(r.stage||0)+1;if(r.stage>=4)pokerResolve(r);r.updatedAt=Date.now();return r;
  });
}
function renderPokerEnd(){
  const side=sideOf(room),wins=room.winnerSeats||[],won=wins.includes(side);
  $('#endTitle').textContent=won?'Você venceu!':'Você perdeu!';
  $('#endText').textContent=won?'Você venceu esta mão recreativa.':'Outro participante venceu esta mão.';
  const opp=opponentOf(room),humanGame=opp?.type!=='bot',myVote=humanGame&&room.rematch?.[uid]?.accepted;
  if(myVote){$('#endModal').classList.add('hidden');$('#status').textContent='Aguardando o adversário aceitar jogar de novo…'}
  else $('#endModal').classList.remove('hidden');
}

/* BOT */
let botBusy=false;
async function maybeBotMove(){
  if(botBusy||!room||room.winner||gameKey==='poker')return;
  const red=room.players?.red;if(red?.type!=='bot'||room.turn!=='red')return;
  botBusy=true;setTimeout(async()=>{
    try{
      if(gameKey==='tictactoe'){
        await runTransaction(ref(db,'rooms/'+roomId),r=>{if(!r||r.winner||r.turn!=='red')return r;const i=tttBotPick(r.board);if(i==null)return r;r.board[i]='red';const w=tttWin(r.board);if(w)awardWinner(r,w);else r.turn='blue';return r});
      }else if(gameKey==='connect4'){
        await runTransaction(ref(db,'rooms/'+roomId),r=>{if(!r||r.winner||r.turn!=='red')return r;const c=c4BotColumn(r.board);const b=[...r.board];c4Drop(b,c,'red');r.board=b;const w=c4Winner(b);if(w)awardWinner(r,w);else r.turn='blue';return r});
      }else if(gameKey==='battleship'){
        await runTransaction(ref(db,'rooms/'+roomId),r=>{if(!r||r.winner||r.turn!=='red')return r;const i=battleBotShot(r),shots=[...(r.shots.red||[])];shots.push(i);r.shots.red=shots;if((r.ships.blue||[]).every(x=>shots.includes(x)))awardWinner(r,'red');else r.turn='blue';return r});
      }else if(gameKey==='chess'){
        await runTransaction(ref(db,'rooms/'+roomId),r=>{if(!r||r.winner||r.turn!=='red')return r;const mv=chessBotMove(r);if(!mv){const res=chessGameResult(r.board,'red');if(res)awardWinner(r,res);return r}const[from,to]=mv,p=r.board[from];r.board[to]=p;r.board[from]='';if(p==='rP'&&Math.floor(to/8)===7)r.board[to]='rQ';r.turn='blue';const res=chessGameResult(r.board,'blue');if(res)awardWinner(r,res);return r});
      }
    }finally{botBusy=false}
  },800);
}

/* REVANCHE */
async function maybeStartHumanRematch(r){
  if(!roomId||!r?.winner||gameKey==='poker'&&!(r.winnerSeats||[]).length)return;
  const humans=Object.values(r.players||{}).filter(p=>p?.type==='human');
  if(humans.length<2)return;
  const votes=r.rematch||{},ready=humans.every(p=>votes[p.uid]?.accepted===true&&votes[p.uid]?.sessionId===p.sessionId);
  if(!ready)return;
  await runTransaction(ref(db,'rooms/'+roomId),current=>{
    if(!current?.winner)return current;const hs=Object.values(current.players||{}).filter(p=>p?.type==='human'),v=current.rematch||{};
    if(!hs.every(p=>v[p.uid]?.accepted===true&&v[p.uid]?.sessionId===p.sessionId))return current;
    return resetForRematch(current);
  });
}
function resetForRematch(r){
  const keepScore=r.score,keepPlayers=r.players,keepChips=r.chips;
  if(r.game==='tictactoe')return {...r,board:Array(9).fill(''),turn:'blue',winner:'',rematch:{},score:keepScore,updatedAt:Date.now()};
  if(r.game==='connect4')return {...r,board:Array(42).fill(''),turn:'blue',winner:'',rematch:{},score:keepScore,updatedAt:Date.now()};
  if(r.game==='battleship')return {...r,ships:{blue:makeFleet(),red:makeFleet()},shots:{blue:[],red:[]},turn:'blue',winner:'',rematch:{},score:keepScore,updatedAt:Date.now()};
  if(r.game==='chess')return {...r,board:initialChessBoard(),turn:'blue',winner:'',rematch:{},score:keepScore,lastMove:null,updatedAt:Date.now()};
  if(r.game==='poker'){
    const base={...r,players:keepPlayers,score:keepScore,chips:keepChips||r.chips,winner:'',winnerSeats:[],rematch:{}};
    const d=makeDeck(),holes={};Object.keys(keepPlayers).forEach(s=>holes[s]=[d.pop(),d.pop()]);
    const chips={...base.chips};Object.keys(chips).forEach(s=>{if(chips[s]<10)chips[s]=1000;chips[s]-=10});
    return {...base,holes,community:[d.pop(),d.pop(),d.pop(),d.pop(),d.pop()],stage:0,pot:Object.keys(chips).length*10,chips,updatedAt:Date.now()};
  }
  return r;
}
async function rematch(){
  if(!roomId||!room?.winner)return;
  $('#rematchBtn').disabled=true;$('#endModal').classList.add('hidden');
  const humans=Object.values(room.players||{}).filter(p=>p?.type==='human');
  if(humans.length<=1){await set(ref(db,'rooms/'+roomId),resetForRematch(room));return}
  await set(ref(db,'rooms/'+roomId+'/rematch/'+uid),{sessionId,accepted:true,acceptedAt:Date.now()});
  $('#status').textContent='Aguardando o adversário aceitar jogar de novo…';
}
async function back(){
  clearTimeout(botTimer);clearSeek();matching=false;enteringRoom=false;chessSelected=null;
  try{const q=await get(qRef());if(q.exists()&&q.val()?.sessionId===sessionId)await remove(qRef())}catch{}
  try{const a=await get(assignmentRef());if(a.exists()&&a.val()?.sessionId===sessionId)await remove(assignmentRef())}catch{}
  stopAssignmentListener();if(roomUnsub){roomUnsub();roomUnsub=null}
  roomId=null;room=null;sessionId='';gameKey='';$('#endModal').classList.add('hidden');show($('#homeView'));
}

/* +18 POKER */
function age18OrMore(dateString){
  if(!dateString)return false;const dob=new Date(dateString+'T12:00:00'),today=new Date();if(Number.isNaN(dob.getTime())||dob>today)return false;
  let age=today.getFullYear()-dob.getFullYear(),m=today.getMonth()-dob.getMonth();if(m<0||(m===0&&today.getDate()<dob.getDate()))age--;
  return age>=18;
}
function openPokerGate(){
  pokerAgeApproved=false;$('#pokerAgree').checked=false;$('#birthDate').value='';$('#ageMsg').textContent='';$('#ageMsg').className='ageMsg';$('#pokerGate').classList.remove('hidden');
}
function confirmPokerAccess(){
  const agree=$('#pokerAgree').checked,birth=$('#birthDate').value;
  if(!agree){$('#ageMsg').textContent='É necessário confirmar: Li e me declaro ciente!';$('#ageMsg').className='ageMsg error';return}
  if(!age18OrMore(birth)){$('#ageMsg').textContent='Acesso permitido somente para pessoas com 18 anos completos ou mais.';$('#ageMsg').className='ageMsg error';return}
  pokerAgeApproved=true;$('#ageMsg').textContent='Maioridade confirmada para este acesso.';$('#ageMsg').className='ageMsg ok';
  // A data de nascimento é usada apenas nesta validação local e não é gravada no Firebase.
  setTimeout(()=>{$('#pokerGate').classList.add('hidden');startGame('poker')},250);
}

/* EVENTOS */
$('#playTTT').onclick=()=>startGame('tictactoe');
$('#playC4').onclick=()=>startGame('connect4');
$('#playBattle').onclick=()=>startGame('battleship');
$('#playChess').onclick=()=>startGame('chess');
$('#playPoker').onclick=openPokerGate;
$('#enterPoker').onclick=confirmPokerAccess;
$('#cancelPoker').onclick=()=>$('#pokerGate').classList.add('hidden');
$('#cancelQueue').onclick=back;$('#leaveGame').onclick=back;$('#backBtn').onclick=back;$('#rematchBtn').onclick=rematch;

boot();