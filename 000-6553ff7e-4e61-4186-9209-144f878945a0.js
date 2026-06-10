/* ===== LEARNING app logic ===== */
const SK='vocab_v5';
const CATS=[
  {key:'all',en:'ALL',zh:'全部'},
  {key:'idiom',en:'IDIOM',zh:'慣用語'},
  {key:'phrase',en:'PHRASE',zh:'片語'},
  {key:'word',en:'WORD',zh:'單字'},
  {key:'slang',en:'SLANG',zh:'俚語'}
];
let S={words:[],lF:'all',qF:'all',qType:'em',quiz:null,cF:'all',cMode:'due',cards:null,doneToday:[],cardDay:'',opened:false,quizLog:{},startDate:'',accent:'en-US'};
const IMP=window.LEXIS_SEED||[];
function todayStr(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}

/* ---- persistence ---- */
const IDB_NAME='lexis_indexeddb_v1',IDB_STORE='kv';
function packState(){return{words:S.words,doneToday:S.doneToday,cardDay:S.cardDay,quizLog:S.quizLog,startDate:S.startDate,accent:S.accent};}
function applyState(p){p=p||{};S.words=Array.isArray(p.words)?p.words:[];S.doneToday=Array.isArray(p.doneToday)?p.doneToday:[];S.cardDay=p.cardDay||'';S.quizLog=p.quizLog&&typeof p.quizLog==='object'?p.quizLog:{};S.startDate=p.startDate||'';S.accent=p.accent||'en-US';}
function canIDB(){return !!(window.indexedDB);}
function idbOpen(){return new Promise((resolve,reject)=>{if(!canIDB())return reject(new Error('IndexedDB unavailable'));const r=window.indexedDB.open(IDB_NAME,1);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(IDB_STORE))db.createObjectStore(IDB_STORE);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('IndexedDB open failed'));});}
async function idbGet(k){const db=await idbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction(IDB_STORE,'readonly'),st=tx.objectStore(IDB_STORE),r=st.get(k);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error||new Error('IndexedDB read failed'));tx.oncomplete=()=>db.close();tx.onerror=()=>{try{db.close();}catch(_){}};});}
async function idbSet(k,v){const db=await idbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction(IDB_STORE,'readwrite'),st=tx.objectStore(IDB_STORE),r=st.put(v,k);r.onerror=()=>reject(r.error||new Error('IndexedDB write failed'));tx.oncomplete=()=>{db.close();resolve(true);};tx.onerror=()=>{try{db.close();}catch(_){}reject(tx.error||new Error('IndexedDB transaction failed'));};});}
async function load(){try{let p=null;if(canIDB())p=await idbGet(SK);if(!p){const d=localStorage.getItem(SK);if(d){p=JSON.parse(d);if(canIDB())idbSet(SK,p).catch(e=>console.warn('LEARNING migration warning:',e));}}applyState(p);}catch(e){console.error('LEARNING 載入失敗:',e);S.words=[];}if(S.cardDay!==todayStr()){S.cardDay=todayStr();S.doneToday=[];}if(!S.startDate)S.startDate=todayStr();}
let saveErrorShown=false;
async function saveLocalOnly(payload){try{if(canIDB()){await idbSet(SK,payload);saveErrorShown=false;return true;}localStorage.setItem(SK,JSON.stringify(payload));saveErrorShown=false;return true;}catch(e){console.error('LEARNING 儲存失敗:',e);if(!saveErrorShown){saveErrorShown=true;alert('資料無法儲存。請立即匯出完整 JSON 備份，並確認瀏覽器允許網站儲存資料。');}return false;}}
function save(){const payload=packState();try{if(canIDB()){idbSet(SK,payload).then(()=>{saveErrorShown=false;}).catch(e=>{console.error('LEARNING 儲存失敗:',e);if(!saveErrorShown){saveErrorShown=true;alert('資料無法儲存。請立即匯出完整 JSON 備份，並確認瀏覽器允許網站儲存資料。');}});scheduleCloudSync();return true;}localStorage.setItem(SK,JSON.stringify(payload));saveErrorShown=false;scheduleCloudSync();return true;}catch(e){console.error('LEARNING 儲存失敗:',e);if(!saveErrorShown){saveErrorShown=true;alert('資料無法儲存。請立即匯出完整 JSON 備份，並確認瀏覽器允許網站儲存資料。');}return false;}}


/* ===== Supabase cloud sync ===== */
const SUPABASE_URL='https://zlbwphlnxqtiwbvpakvi.supabase.co',SUPABASE_KEY='sb_publishable_cdC2_IdfeWo-AYmI3ImSwg_mPktF4qd',CLOUD_SESSION_KEY='lexis_supabase_session_v1',CLOUD_META_KEY='lexis_cloud_meta_v1';
let cloudSession=null,cloudTimer=null,cloudBusy=false,cloudApplying=false,cloudDirty=false,cloudLastUpdated='',cloudLastMessage='尚未登入';
function readCloudMeta(){try{const m=JSON.parse(localStorage.getItem(CLOUD_META_KEY)||'{}');cloudLastUpdated=m.updated_at||'';cloudDirty=m.dirty===true;}catch(e){}}
function writeCloudMeta(v,dirty=cloudDirty){cloudLastUpdated=v||'';cloudDirty=dirty===true;try{localStorage.setItem(CLOUD_META_KEY,JSON.stringify({updated_at:cloudLastUpdated,dirty:cloudDirty}));}catch(e){}}
function readCloudSession(){try{cloudSession=JSON.parse(localStorage.getItem(CLOUD_SESSION_KEY)||'null');}catch(e){cloudSession=null;}return cloudSession;}
function writeCloudSession(s){cloudSession=s||null;try{s?localStorage.setItem(CLOUD_SESSION_KEY,JSON.stringify(s)):localStorage.removeItem(CLOUD_SESSION_KEY);}catch(e){}renderCloudUI();}
function cloudUser(){return cloudSession&&cloudSession.user?cloudSession.user:null;}
function cloudHeaders(json=true){const h={apikey:SUPABASE_KEY,Authorization:'Bearer '+cloudSession.access_token};if(json)h['Content-Type']='application/json';return h;}
function cloudSetStatus(msg,kind){cloudLastMessage=msg;const el=document.getElementById('cloud-status');if(el){el.textContent=msg;el.className='cloud-status '+(kind||'');}const dot=document.getElementById('cloud-dot');if(dot)dot.className='cloud-dot '+(kind||'');}
function cloudErrorMessage(e){const m=(e&&e.message)||String(e||'未知錯誤');if(/Failed to fetch|NetworkError|Load failed/i.test(m))return '目前離線，資料已保存在本機，連線後會自動同步。';return m;}
async function authFetch(path,body){const r=await fetch(SUPABASE_URL+'/auth/v1/'+path,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.msg||j.message||j.error_description||('登入服務錯誤 '+r.status));return j;}
async function ensureCloudSession(){if(!cloudSession)return false;const exp=(cloudSession.expires_at||0)*1000;if(exp>Date.now()+60000)return true;if(!cloudSession.refresh_token){writeCloudSession(null);return false;}try{const s=await authFetch('token?grant_type=refresh_token',{refresh_token:cloudSession.refresh_token});writeCloudSession(s);return true;}catch(e){writeCloudSession(null);cloudSetStatus('登入已過期，請重新登入','err');return false;}}
function mergeWords(a,b){const map=new Map();[...(a||[]),...(b||[])].forEach(w=>{if(!w||!w.term)return;const k=(w.type||'word')+'|'+w.term.trim().toLowerCase(),old=map.get(k);if(!old){map.set(k,{...w});return;}const newer=String(w.lastSeen||'')>=String(old.lastSeen||'')?w:old;map.set(k,{...old,...newer,id:old.id||w.id,correct:Math.max(old.correct||0,w.correct||0),wrong:Math.max(old.wrong||0,w.wrong||0),qmiss:old.qmiss===true||w.qmiss===true});});return [...map.values()];}
function mergeState(local,remote){local=local||{};remote=remote||{};const q={...(remote.quizLog||{})};Object.entries(local.quizLog||{}).forEach(([k,v])=>q[k]=Math.max(Number(q[k])||0,Number(v)||0));return{...remote,...local,words:mergeWords(remote.words,local.words),doneToday:[...new Set([...(remote.doneToday||[]),...(local.doneToday||[])])],quizLog:q,startDate:[local.startDate,remote.startDate].filter(Boolean).sort()[0]||todayStr(),cardDay:local.cardDay||remote.cardDay||todayStr(),accent:local.accent||remote.accent||'en-US'};}
function refreshAfterCloud(){ttsAccent=S.accent||'en-US';updH();renderFan();renderList();renderCalendar();syncAccentUI();checkImport();const ec=document.getElementById('exp-count');if(ec)ec.textContent=S.words.length;}
async function cloudGet(){const ok=await ensureCloudSession();if(!ok)return null;const uid=encodeURIComponent(cloudUser().id);const r=await fetch(SUPABASE_URL+'/rest/v1/lexis_data?select=data,updated_at&user_id=eq.'+uid+'&limit=1',{headers:cloudHeaders(false)});if(!r.ok)throw new Error('雲端讀取失敗 '+r.status);const rows=await r.json();return rows[0]||null;}
async function cloudPut(payload){const ok=await ensureCloudSession();if(!ok)return null;const now=new Date().toISOString();const r=await fetch(SUPABASE_URL+'/rest/v1/lexis_data?on_conflict=user_id',{method:'POST',headers:{...cloudHeaders(true),Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify([{user_id:cloudUser().id,data:payload,updated_at:now}])});if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.message||('雲端寫入失敗 '+r.status));}const rows=await r.json();cloudDirty=false;writeCloudMeta((rows[0]&&rows[0].updated_at)||now,false);return rows[0]||null;}
async function syncCloud(force=false){if(cloudBusy||!cloudSession)return;cloudBusy=true;cloudSetStatus('同步中…','busy');try{const row=await cloudGet(),local=packState();if(!row){await cloudPut(local);cloudSetStatus('已建立雲端備份','ok');}
  else if(!cloudLastUpdated){const merged=mergeState(local,row.data);cloudApplying=true;applyState(merged);cloudApplying=false;await saveLocalOnly(merged);refreshAfterCloud();await cloudPut(merged);cloudSetStatus('首次同步完成，已合併本機與雲端資料','ok');}
  else if(row.updated_at>cloudLastUpdated){if(cloudDirty){const merged=mergeState(local,row.data);cloudApplying=true;applyState(merged);cloudApplying=false;await saveLocalOnly(merged);refreshAfterCloud();await cloudPut(merged);cloudSetStatus('已合併兩台裝置的變更','ok');}else{cloudApplying=true;applyState(row.data);cloudApplying=false;await saveLocalOnly(packState());writeCloudMeta(row.updated_at);refreshAfterCloud();cloudSetStatus('已下載最新雲端資料','ok');}}
  else if(cloudDirty||force){await cloudPut(local);cloudSetStatus('已同步至雲端','ok');}else cloudSetStatus('資料已是最新','ok');
}catch(e){console.error('LEARNING cloud sync:',e);cloudSetStatus(cloudErrorMessage(e),'err');}finally{cloudBusy=false;renderCloudUI();}}
function scheduleCloudSync(){if(cloudApplying||!cloudSession)return;cloudDirty=true;writeCloudMeta(cloudLastUpdated,true);clearTimeout(cloudTimer);cloudTimer=setTimeout(()=>syncCloud(),1400);cloudSetStatus(navigator.onLine===false?'離線使用中，等待同步':'等待同步…','busy');}
async function cloudSignIn(){const email=(document.getElementById('cloud-email').value||'').trim(),password=document.getElementById('cloud-password').value;if(!email||!password){cloudSetStatus('請輸入 Email 與密碼','err');return;}cloudSetStatus('登入中…','busy');try{const s=await authFetch('token?grant_type=password',{email,password});writeCloudSession(s);writeCloudMeta('');cloudDirty=S.words.length>0;await syncCloud(true);closeCloudPanel();}catch(e){cloudSetStatus(cloudErrorMessage(e),'err');}}
async function cloudSignUp(){const email=(document.getElementById('cloud-email').value||'').trim(),password=document.getElementById('cloud-password').value;if(!email||password.length<6){cloudSetStatus('請輸入 Email，密碼至少 6 個字元','err');return;}cloudSetStatus('建立帳號中…','busy');try{const s=await authFetch('signup',{email,password});if(s.access_token){writeCloudSession(s);writeCloudMeta('');cloudDirty=S.words.length>0;await syncCloud(true);closeCloudPanel();}else cloudSetStatus('註冊成功，請先到信箱點擊驗證連結，再回來登入。','ok');}catch(e){cloudSetStatus(cloudErrorMessage(e),'err');}}
async function cloudSignOut(){try{if(await ensureCloudSession())await fetch(SUPABASE_URL+'/auth/v1/logout',{method:'POST',headers:cloudHeaders(false)});}catch(e){}writeCloudSession(null);writeCloudMeta('');cloudDirty=false;cloudSetStatus('已登出；本機資料仍會保留','ok');}
function openCloudPanel(){document.getElementById('cloudov').classList.add('show');document.documentElement.classList.add('modal-open');renderCloudUI();}
function closeCloudPanel(){document.getElementById('cloudov').classList.remove('show');document.documentElement.classList.remove('modal-open');}
function renderCloudUI(){const user=cloudUser(),guest=document.getElementById('cloud-guest'),signed=document.getElementById('cloud-signed'),email=document.getElementById('cloud-user-email'),label=document.getElementById('cloud-label');if(guest)guest.style.display=user?'none':'';if(signed)signed.style.display=user?'':'none';if(email)email.textContent=user?user.email:'';if(label)label.textContent=user?'已登入':'雲端';const st=document.getElementById('cloud-status');if(st&&!st.textContent)st.textContent=cloudLastMessage;}
function initCloudSync(){readCloudMeta();readCloudSession();renderCloudUI();if(window.addEventListener){window.addEventListener('online',()=>syncCloud());window.addEventListener('focus',()=>syncCloud());}document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncCloud();});if(typeof setInterval==='function')setInterval(()=>syncCloud(),60000);if(cloudSession)syncCloud();}

/* ---- helpers ---- */
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function bC(t){return{idiom:'bi',phrase:'bp',word:'bw',slang:'bs'}[t]||'bw';}
function bL(t){return{idiom:'慣用語',phrase:'片語',word:'單字',slang:'俚語'}[t]||t;}
function shuf(a){const r=[...a];for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r[i],r[j]]=[r[j],r[i]];}return r;}
function catCount(k){return k==='all'?S.words.length:S.words.filter(w=>w.type===k).length;}

function updH(){const scores=Object.values(S.quizLog||{}).map(Number).filter(Number.isFinite),avg=scores.length?Math.round(scores.reduce((a,n)=>a+n,0)/scores.length):null;document.getElementById('ht').textContent=S.words.length;document.getElementById('hr').textContent=avg===null?'—':avg+'%';}

/* ---- import ---- */
function checkImport(){const ex=new Set(S.words.map(w=>w.term.toLowerCase()));const n=IMP.filter(w=>!ex.has(w.term.toLowerCase())).length;const el=document.getElementById('ibar');if(n>0)el.innerHTML=`<div class="ibar"><p>檔案庫尚有 <strong>${n} 個詞彙</strong>未匯入</p><button onclick="doImport(this)">一鍵匯入</button></div>`;else el.innerHTML='';}
function doImport(btn){btn.disabled=true;btn.textContent='匯入中…';const ex=new Set(S.words.map(w=>w.term.toLowerCase()));const toAdd=IMP.filter(w=>!ex.has(w.term.toLowerCase())).map((w,i)=>({...w,id:'v2_'+Date.now()+'_'+i,correct:0,wrong:0}));S.words=[...toAdd,...S.words];save();updH();document.getElementById('ibar').innerHTML=`<div class="ibar"><p>✓ 已匯入 <strong>${toAdd.length}</strong> 個詞彙！</p></div>`;renderFan();renderList();setTimeout(()=>{document.getElementById('ibar').innerHTML='';},2200);}

/* ---- navigation ---- */
function go(t){const order=['library','cards','quiz','add','export'];document.querySelectorAll('.rb').forEach(b=>b.classList.toggle('active',b.getAttribute('data-t')===t));document.querySelectorAll('.scr').forEach(s=>s.classList.remove('active'));document.getElementById('scr-'+t).classList.add('active');if(t==='library'){renderFan();renderList();}if(t==='quiz')renderQSetup();if(t==='cards')renderCSetup();if(t==='export'){const ec=document.getElementById('exp-count');if(ec)ec.textContent=S.words.length;}if(typeof closeRail==='function')closeRail();}

/* ---- right-side nav rail ---- */
function openRail(){document.getElementById('rail').classList.add('show');document.getElementById('rail-scrim').classList.add('on');document.getElementById('rail-handle').classList.add('open');}
function closeRail(){const r=document.getElementById('rail');if(!r)return;r.classList.remove('show');document.getElementById('rail-scrim').classList.remove('on');document.getElementById('rail-handle').classList.remove('open');}
function toggleRail(){document.getElementById('rail').classList.contains('show')?closeRail():openRail();}
function initRail(){
  const h=document.getElementById('rail-handle');if(!h)return;let sx=0,sy=0;
  function hs(x,y){sx=x;sy=y;}
  function he(x,y){const dx=x-sx,dy=y-sy;if(Math.abs(dx)<10&&Math.abs(dy)<10){toggleRail();return;}if(dx<-26&&Math.abs(dx)>Math.abs(dy))openRail();else if(dx>26)closeRail();}
  h.addEventListener('touchstart',e=>hs(e.touches[0].clientX,e.touches[0].clientY),{passive:true});
  h.addEventListener('touchend',e=>he(e.changedTouches[0].clientX,e.changedTouches[0].clientY),{passive:true});
  h.addEventListener('mousedown',e=>{e.preventDefault();hs(e.clientX,e.clientY);const up=e2=>{he(e2.clientX,e2.clientY);window.removeEventListener('mouseup',up);};window.addEventListener('mouseup',up);});
  const rail=document.getElementById('rail');let rx=0;
  rail.addEventListener('touchstart',e=>{rx=e.touches[0].clientX;},{passive:true});
  rail.addEventListener('touchend',e=>{if(e.changedTouches[0].clientX-rx>40)closeRail();},{passive:true});
  const sc=document.getElementById('rail-scrim');let cx=0;
  sc.addEventListener('touchstart',e=>{cx=e.touches[0].clientX;},{passive:true});
  sc.addEventListener('touchend',e=>{if(e.changedTouches[0].clientX-cx>30)closeRail();},{passive:true});
}

/* ===== LIBRARY: continuous fan archive ===== */
const FAN_STEP=120;
const nextFrame=window.requestAnimationFrame?fn=>window.requestAnimationFrame(fn):fn=>fn();
let fanPos=0,fanDrag=null,fanFrame=0,fanQueuedPos=null,lastFanTouch=0;
function selIndex(){return Math.max(0,CATS.findIndex(c=>c.key===S.lF));}
function positionFolders(pos,animate){
  document.querySelectorAll('#fan .folder').forEach((f,i)=>{
    const off=i-pos,a=Math.abs(off),s=off<0?-1:1;
    /* natural fan spread for the sides; centre folder stays centred, archive clips overflow */
    const tx=off*112,tz=-a*135,ry=off*-24,sc=Math.max(0.6,1-a*0.09),op=Math.max(0.16,1-a*0.28),z=100-Math.round(a*10);
    f.style.transition=animate?'transform .5s cubic-bezier(.22,1,.36,1),opacity .42s':'none';
    f.style.transform=`translate3d(${tx.toFixed(1)}px,0,${tz}px) rotateY(${ry}deg) scale(${sc.toFixed(3)})`;
    f.style.opacity=op;f.style.zIndex=z;f.classList.toggle('sel',a<0.5);
  });
}
function setCat(key){S.lF=key;fanPos=selIndex();positionFolders(fanPos,true);if(S.opened){updateOpenHead();renderList();}}
function moveCat(dir){const i=selIndex(),ni=Math.max(0,Math.min(CATS.length-1,i+dir));if(ni!==i)setCat(CATS[ni].key);}
function updateOpenHead(){const c=CATS.find(x=>x.key===S.lF)||CATS[0];const el=document.getElementById('open-title');if(el)el.innerHTML=`<span class="badge ${c.key==='all'?'bp':bC(c.key)}">${c.zh}</span><b>${catCount(c.key)}</b> 詞`;}
function markOpenFolder(){document.querySelectorAll('#fan .folder').forEach(f=>f.classList.toggle('open',S.opened&&f.getAttribute('data-k')===S.lF));}
function openFolder(key){S.lF=key;S.opened=true;fanPos=selIndex();positionFolders(fanPos,true);markOpenFolder();const d=document.getElementById('lib-open');if(d)d.classList.add('show');const h=document.getElementById('fan-hint');if(h)h.style.display='none';updateOpenHead();renderList();}
function closeFolder(){S.opened=false;markOpenFolder();const d=document.getElementById('lib-open');if(d)d.classList.remove('show');const h=document.getElementById('fan-hint');if(h)h.style.display='';}
function toggleFolder(key){if(S.opened&&key===S.lF)closeFolder();else{listLimit=LIST_BATCH;openFolder(key);}}
function initFanSwipe(){
  const ar=document.querySelector('.archive');if(!ar)return;
  const down=(x,y,target)=>{const fo=target&&target.closest?target.closest('.folder'):null;fanDrag={x,y,start:selIndex(),maxX:0,maxY:0,axis:null,key:fo?fo.getAttribute('data-k'):null};};
  const move=(x,y,e)=>{if(!fanDrag)return;const dx=x-fanDrag.x,dy=y-fanDrag.y;
    fanDrag.maxX=Math.max(fanDrag.maxX,Math.abs(dx));fanDrag.maxY=Math.max(fanDrag.maxY,Math.abs(dy));
    if(!fanDrag.axis&&(Math.abs(dx)>14||Math.abs(dy)>14))fanDrag.axis=Math.abs(dx)>Math.abs(dy)*1.15?'x':'y';
    if(fanDrag.axis==='y')return;
    if(fanDrag.axis==='x'){ar.classList.add('dragging');if(e&&e.cancelable)e.preventDefault();}
    if(fanDrag.axis!=='x')return;
    let p=fanDrag.start-dx/FAN_STEP;p=Math.max(0,Math.min(CATS.length-1,p));fanPos=p;fanQueuedPos=p;if(!fanFrame)fanFrame=nextFrame(()=>{fanFrame=0;if(fanQueuedPos!==null){positionFolders(fanQueuedPos,false);fanQueuedPos=null;}});
  };
  const up=(x,y,target)=>{if(!fanDrag)return;const dx=x-fanDrag.x,dy=y-fanDrag.y,total=Math.hypot(dx,dy),horizontal=Math.abs(dx)>32&&Math.abs(dx)>Math.abs(dy)*.8;
    if(total<=32){const fo=target&&target.closest?target.closest('.folder'):null,k=fanDrag.key||(fo?fo.getAttribute('data-k'):null);if(k)toggleFolder(k);else positionFolders(selIndex(),true);}
    else if(horizontal){if(S.opened)closeFolder();let ns=Math.max(0,Math.min(CATS.length-1,Math.round(fanPos)));setCat(CATS[ns].key);}
    else positionFolders(selIndex(),true);
    ar.classList.remove('dragging');fanQueuedPos=null;fanDrag=null;
  };
  ar.addEventListener('touchstart',e=>{lastFanTouch=Date.now();down(e.touches[0].clientX,e.touches[0].clientY,e.target);},{passive:true});
  ar.addEventListener('touchmove',e=>move(e.touches[0].clientX,e.touches[0].clientY,e),{passive:false});
  ar.addEventListener('touchend',e=>up(e.changedTouches[0].clientX,e.changedTouches[0].clientY,e.target),{passive:true});
  ar.addEventListener('touchcancel',()=>{ar.classList.remove('dragging');fanQueuedPos=null;fanDrag=null;positionFolders(selIndex(),true);},{passive:true});
  ar.addEventListener('mousedown',e=>{if(Date.now()-lastFanTouch<700)return;e.preventDefault();down(e.clientX,e.clientY,e.target);});
  window.addEventListener('mousemove',e=>{if(fanDrag)move(e.clientX,e.clientY,e);});
  window.addEventListener('mouseup',e=>{if(Date.now()-lastFanTouch<700)return;if(fanDrag)up(e.clientX,e.clientY,e.target);});
  ar.addEventListener('keydown',e=>{const fo=e.target&&e.target.closest?e.target.closest('.folder'):null;if(!fo||!['Enter',' '].includes(e.key))return;e.preventDefault();toggleFolder(fo.getAttribute('data-k'));});
}
/* familiarity tint driven by 不熟 占比 of the whole category */
/* folder colour driven by QUIZ wrong answers (占比 of whole category) */
function catTint(key){
  const ws=S.words.filter(w=>key==='all'||w.type===key);const total=ws.length;if(!total)return '';
  const touched=ws.filter(w=>'qmiss' in w);if(!touched.length)return '';
  const miss=ws.filter(w=>w.qmiss===true).length;
  const ratio=miss/total;let top,bot;
  if(ratio>=0.40){top='rgba(212,70,66,0.96)';bot='rgba(146,38,38,0.80)';}        /* 深紅 */
  else if(ratio>=0.30){top='rgba(244,118,110,0.95)';bot='rgba(196,66,62,0.76)';}  /* 紅 */
  else if(ratio>=0.20){top='rgba(250,176,160,0.95)';bot='rgba(216,118,106,0.72)';} /* 淺紅 */
  else if(ratio>=0.10){top='rgba(250,228,150,0.95)';bot='rgba(212,180,94,0.72)';}  /* 淺黃 */
  else{top='rgba(178,212,255,0.95)';bot='rgba(120,170,238,0.72)';}                /* <10% 已熟淺藍 */
  return `background:linear-gradient(180deg,${top},${bot})`;
}
function renderFan(){
  const fan=document.getElementById('fan');if(!fan)return;
  fan.innerHTML=CATS.map((c,i)=>{const cnt=catCount(c.key);const ti=(t=>t?` style="${t}"`:'')(catTint(c.key));return `<div class="folder" data-i="${i}" data-k="${c.key}" role="button" tabindex="0" aria-label="${c.zh}，${cnt} 個詞彙">
      <div class="glassbody"></div>
      <div class="docs"><div class="sheet s1"${ti}></div><div class="sheet s2"${ti}></div><div class="sheet s3"${ti}><div class="ln"></div><div class="ln"></div><div class="ln"></div><div class="ln"></div><div class="ln"></div></div></div>
      <div class="pocket">
        <div class="pk-top"><div class="pk-cnt"><b>${cnt}</b><span>詞</span></div></div>
        <div class="pk-bot"><div class="pk-en">${c.en}</div><div class="pk-zh">${c.zh}</div></div>
        <div class="pk-doc">${cnt} entries</div>
      </div>
    </div>`;}).join('');
  fanPos=selIndex();positionFolders(fanPos,true);markOpenFolder();
}
const LIST_BATCH=120;
let listLimit=LIST_BATCH;
function resetList(){listLimit=LIST_BATCH;renderList();}
function loadMoreWords(){listLimit+=LIST_BATCH;renderList();}
function renderList(){
  if(!S.opened)return;
  const q=(document.getElementById('lsrch')||{}).value||'';
  const list=S.words.filter(w=>(S.lF==='all'||w.type===S.lF)&&(!q||w.term.toLowerCase().includes(q.toLowerCase())||w.meaning.includes(q)));
  const el=document.getElementById('llist');if(!el)return;
  if(!list.length){el.innerHTML=`<div class="empty">— 無符合項目 —</div>`;return;}
  const visible=list.slice(0,listLimit);
  const rows=visible.map(w=>{const tot=w.correct+w.wrong,pct=tot?Math.round(w.correct/tot*100):0;const dots=Array.from({length:5},(_,i)=>`<div class="md${i<Math.round(pct/20)?' on':''}"></div>`).join('');const sc=w.status==='unknown'?'<span class="badge bs" style="margin-bottom:2px">不熟</span>':w.status==='known'?'<span class="badge bw" style="margin-bottom:2px">已記住</span>':'';return`<div class="wrow" onclick="openD('${w.id}')"><div style="flex:1;min-width:0"><div class="wen">${esc(w.term)}</div><div class="wzh">${esc(w.meaning)}</div>${w.note?`<div class="wnote">${esc(w.note)}</div>`:''}<div class="mdots">${dots}</div></div><button class="wspk" onclick="event.stopPropagation();speakWord('${w.id}','term',this)" aria-label="發音">${SPK_SVG}</button><div class="rt">${sc}<span class="badge ${bC(w.type)}">${bL(w.type)}</span><span class="chev">›</span></div></div>`;}).join('');
  const more=visible.length<list.length?`<button class="sbtn list-more" onclick="loadMoreWords()">顯示更多（${visible.length} / ${list.length}）</button>`:'';
  el.innerHTML=rows+more;
}

/* ---- detail overlay ---- */
function openD(id){const w=S.words.find(x=>x.id===id);if(!w)return;const tot=w.correct+w.wrong,pct=tot?Math.round(w.correct/tot*100):0;document.getElementById('dc').innerHTML=`<div style="margin-bottom:8px"><span class="badge ${bC(w.type)}">${bL(w.type)}</span></div><div style="display:flex;align-items:flex-start;gap:11px;margin:12px 0 10px"><div class="d-term" style="flex:1;margin:0">${esc(w.term)}</div><button class="spk dspk" onclick="speakWord('${w.id}','term',this)" aria-label="發音">${SPK_SVG}</button></div><div class="d-zh">${esc(w.meaning)}</div>${w.example?`<div class="d-ex" style="display:flex;align-items:flex-start;gap:10px"><span style="flex:1">${esc(w.example)}</span><button class="spk dspk" style="width:34px;height:34px" onclick="speakWord('${w.id}','example',this)" aria-label="發音例句">${SPK_SVG}</button></div>`:''}${w.note?`<div class="d-note">${esc(w.note)}</div>`:''}<div class="slbl" style="margin-bottom:8px">掌握度 · Mastery</div><div style="display:flex;align-items:center;gap:11px;margin-bottom:14px"><div class="d-mtrack"><div class="d-mfill" style="width:${pct}%"></div></div><span style="font-family:var(--mono);font-size:calc(var(--fs)*0.82);color:var(--ink3);min-width:38px;text-align:right">${tot?pct+'%':'—'}</span></div><p style="font-family:var(--mono);font-size:calc(var(--fs)*0.78);color:var(--ink3);margin-bottom:20px">${tot?`答對 ${w.correct} · 答錯 ${w.wrong}`:'尚未測驗'}</p><button class="del-btn" onclick="delW('${w.id}')">刪除此詞彙</button>`;document.getElementById('ov').classList.add('show');document.documentElement.classList.add('modal-open');}
function closeD(){document.getElementById('ov').classList.remove('show');document.documentElement.classList.remove('modal-open');}
function delW(id){uiConfirm('確定要刪除這個詞彙嗎？刪除後無法復原。','刪除',function(){S.words=S.words.filter(w=>w.id!==id);save();updH();renderFan();renderList();closeD();});}
/* in-UI confirm */
let cfYes=null;
function uiConfirm(msg,okLabel,onYes){document.getElementById('cf-msg').textContent=msg;document.getElementById('cf-ok').textContent=okLabel||'確定';cfYes=onYes;document.getElementById('cfov').classList.add('show');}
function cfClose(){document.getElementById('cfov').classList.remove('show');cfYes=null;}
function cfOk(){const fn=cfYes;cfClose();if(fn)fn();}

/* ===== TTS (browser built-in speech, no API) ===== */
const SPK_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.8 6a8 8 0 0 1 0 12"/></svg>';
let ttsAccent='en-US',_voices=[];
function syncAccentUI(){['us','uk'].forEach(k=>{const el=document.getElementById('acc-'+k);if(el)el.classList.toggle('sel',(k==='us'?'en-US':'en-GB')===ttsAccent);});}
function loadVoices(){try{_voices=window.speechSynthesis.getVoices()||[];}catch(e){}}
function pickVoice(){const vs=_voices.length?_voices:((window.speechSynthesis&&speechSynthesis.getVoices())||[]);return vs.find(v=>v.lang===ttsAccent)||vs.find(v=>v.lang&&v.lang.toLowerCase().slice(0,2)===ttsAccent.slice(0,2))||vs.find(v=>v.lang&&v.lang.toLowerCase().slice(0,2)==='en')||null;}
function speak(text,btn){try{if(!('speechSynthesis'in window)||!text)return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=ttsAccent;u.rate=0.94;const v=pickVoice();if(v)u.voice=v;if(btn){u.onstart=()=>btn.classList.add('on');u.onend=()=>btn.classList.remove('on');u.onerror=()=>btn.classList.remove('on');}speechSynthesis.speak(u);}catch(e){}}
function speakCurrent(which,btn){if(!S.cards)return;const w=S.cards.pool[S.cards.idx];if(!w)return;speak(which==='example'?(w.example||w.term):w.term,btn);}
function speakWord(id,which,btn){const w=S.words.find(x=>x.id===id);if(!w)return;speak(which==='example'?(w.example||w.term):w.term,btn);}
function setAccent(a){ttsAccent=a;S.accent=a;save();syncAccentUI();}

/* ===== FLASHCARDS (flip · known/unknown banks · daily) ===== */
let cFlip=false;
function statusOf(w){return w.status==='unknown'?{t:'不熟 · 優先複習',c:'st-no'}:w.status==='known'?{t:'已記住',c:'st-ok'}:{t:'新單字',c:'st-new'};}
function setCF(f){S.cF=f;['all','idiom','phrase','word','slang'].forEach(k=>{const el=document.getElementById('cf-'+k);if(el)el.classList.toggle('sel',k===f);});renderCSetup();}
function setCM(m){S.cMode=m;['due','weak','all'].forEach(k=>{const el=document.getElementById('cm-'+k);if(el)el.classList.toggle('sel',k===m);});renderCSetup();}
function inScope(w){return S.cF==='all'||w.type===S.cF;}
/* 不熟(0) → 新(1) → 已記住(2) ，同層維持洗牌順序 */
function rankW(w){return w.status==='unknown'?0:w.status==='known'?2:1;}
function buildCardPool(){
  let pool=shuf(S.words.filter(inScope));
  if(S.cMode==='weak')pool=pool.filter(w=>w.status==='unknown');
  else if(S.cMode==='due')pool=pool.filter(w=>!S.doneToday.includes(w.id));
  pool.sort((a,b)=>rankW(a)-rankW(b));
  return pool;
}
function renderCSetup(){
  const scope=S.words.filter(inScope);
  const unknown=scope.filter(w=>w.status==='unknown').length;
  const known=scope.filter(w=>w.status==='known').length;
  const due=scope.filter(w=>!S.doneToday.includes(w.id)).length;
  document.getElementById('cs-unknown').textContent=unknown;
  document.getElementById('cs-known').textContent=known;
  document.getElementById('cs-today').textContent=due;
  const note=document.getElementById('cs-note');
  if(S.cMode==='due'&&due===0&&scope.length)note.innerHTML=`<div class="cs-note">🎉 今日這個範圍已全部翻完！<br>改用「只複習不熟」或「全部重來」再練一次。</div>`;
  else if(S.cMode==='weak'&&unknown===0&&scope.length)note.innerHTML=`<div class="cs-note">這個範圍目前沒有「不熟」的單字 👍</div>`;
  else note.innerHTML='';
  document.getElementById('cs-setup').style.display='';
  document.getElementById('cs-active').style.display='none';
  document.getElementById('cs-result').style.display='none';
  syncAccentUI();
}
function startCards(){
  const pool=buildCardPool();
  if(!pool.length){
    if(S.cMode==='due')alert('今日這個範圍已全部複習完畢！可改用其他模式。');
    else if(S.cMode==='weak')alert('目前沒有標記為「不熟」的單字。');
    else alert('此範圍沒有詞彙！');
    return;
  }
  S.cards={pool,idx:0,seen:0,known:0,unknown:0,total:pool.length};
  document.getElementById('cs-setup').style.display='none';
  document.getElementById('cs-active').style.display='';
  document.getElementById('cs-result').style.display='none';
  showCard();
}
function faceFront(w){return `<div class="fc-face fc-front"><button class="spk" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation();speakCurrent('term',this)" aria-label="播放發音">${SPK_SVG}</button><div class="fc-stat ${statusOf(w).c}">${statusOf(w).t}</div><div class="fc-stamp stamp-yes">記住 ✓</div><div class="fc-stamp stamp-no">不熟 ✕</div><div class="fc-type">${bL(w.type)}</div><div class="fc-word">${esc(w.term)}</div><div class="fc-tap">點左側看正面 · 點右側看背面</div></div>`;}
function faceBack(w){return `<div class="fc-face fc-back">${w.example?`<button class="spk" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation();speakCurrent('example',this)" aria-label="播放例句">${SPK_SVG}</button>`:''}<div class="fc-type">${bL(w.type)}</div><div class="fc-zh">${esc(w.meaning)}</div>${w.example?`<div class="fc-ex">${esc(w.example)}</div>`:''}${w.note?`<div class="fc-note">${esc(w.note)}</div>`:''}<div class="fc-tap" style="margin-top:18px">按住卡片左右滑 · 左=不熟　右=記住</div></div>`;}
function showCard(){
  cFlip=false;const{pool,idx}=S.cards;
  document.getElementById('cprog').textContent=`${idx+1} / ${pool.length}　·　不熟優先`;
  const area=document.getElementById('carea');area.innerHTML='';
  const defs=[{w:pool[idx],cls:'main'},{w:pool[idx+1],cls:'b1'},{w:pool[idx+2],cls:'b2'}];
  [...defs].reverse().forEach(({w,cls})=>{
    if(!w)return;
    const card=document.createElement('div');card.className=`fc ${cls}`;
    card.innerHTML=`<div class="fc-inner">${faceFront(w)}${cls==='main'?faceBack(w):''}</div>`;
    if(cls==='main')attachCardGestures(card);
    area.appendChild(card);
  });
}
function attachCardGestures(card){
  let sx=0,sy=0,st=0,drag=false,moved=false,axis=null,cardFrame=0,pendingDx=0;
  const stampY=card.querySelector('.stamp-yes'),stampN=card.querySelector('.stamp-no');
  function showStamp(dx){const t=Math.min(1,Math.abs(dx)/95);if(dx>0){if(stampY)stampY.style.opacity=t;if(stampN)stampN.style.opacity=0;}else{if(stampN)stampN.style.opacity=t;if(stampY)stampY.style.opacity=0;}}
  function clrStamp(){if(stampY)stampY.style.opacity=0;if(stampN)stampN.style.opacity=0;}
  function start(x,y){if(card.dataset.gone)return;sx=x;sy=y;st=Date.now();drag=true;moved=false;axis=null;card.classList.add('dragging');card.style.transition='none';}
  function move(x,y,e){if(!drag)return;const dx=x-sx,dy=y-sy,ax=Math.abs(dx),ay=Math.abs(dy);if(e&&e.cancelable)e.preventDefault();if(!axis&&(ax>5||ay>5)){const rightDiagonal=dx>0&&ax>=8&&ax>=ay*.32;if(rightDiagonal||ax>=ay*.65)axis='x';else if(ay>20&&ax<ay*.28)axis='y';}if(axis==='y')return;if(axis==='x'){moved=true;pendingDx=dx;if(!cardFrame)cardFrame=nextFrame(()=>{cardFrame=0;const d=pendingDx;card.style.transform=`translate3d(${d}px,0,0) rotate(${d/24}deg)`;card.style.opacity=String(Math.max(0.5,1-Math.abs(d)/700));showStamp(d);});}}
  function end(x,y){if(!drag)return;drag=false;card.classList.remove('dragging');const dx=x-sx,dy=y-sy,elapsed=Math.max(1,Date.now()-st),vx=Math.abs(dx)/elapsed;
    if(axis==='y'){card.style.transition='transform .3s,opacity .3s';card.style.transform='';card.style.opacity='';clrStamp();return;}
    if(Math.abs(dx)>(dx>0?52:64)||(Math.abs(dx)>34&&vx>.42)){cAns(dx>0);return;}
    if(!moved){const r=card.getBoundingClientRect();const right=x>r.left+r.width/2;cFlip=right;card.classList.toggle('flipped',right);}
    card.style.transition='transform .34s cubic-bezier(.22,1,.36,1),opacity .3s';card.style.transform='';card.style.opacity='';clrStamp();
  }
  card.addEventListener('pointerdown',e=>{if(e.cancelable)e.preventDefault();try{card.setPointerCapture(e.pointerId);}catch(_){}start(e.clientX,e.clientY);});
  card.addEventListener('pointermove',e=>move(e.clientX,e.clientY,e));
  card.addEventListener('pointerup',e=>end(e.clientX,e.clientY));
  card.addEventListener('pointercancel',()=>{if(drag){drag=false;card.classList.remove('dragging');card.style.transition='transform .3s,opacity .3s';card.style.transform='';card.style.opacity='';clrStamp();}});
}
function flipCard(){const m=document.querySelector('.fc.main');if(!m)return;cFlip=!cFlip;m.classList.toggle('flipped',cFlip);}
function flyOut(m,known){m.dataset.gone='1';m.style.transition='transform .28s cubic-bezier(.4,0,.6,1),opacity .22s';m.style.opacity='0';m.style.transform=`translate3d(${known?'135%':'-135%'},0,0) rotate(${known?'11deg':'-11deg'})`;}
function saveCardProgress(){const run=()=>{save();updH();};if(window.requestIdleCallback)window.requestIdleCallback(run,{timeout:900});else setTimeout(run,360);}
function cAns(known){
  const m=document.querySelector('.fc.main');if(!m||m.dataset.gone)return;
  const w=S.cards.pool[S.cards.idx];
  w.status=known?'known':'unknown';w.lastSeen=todayStr();
  if(known){w.correct++;S.cards.known++;}else{w.wrong++;S.cards.unknown++;}
  if(!S.doneToday.includes(w.id))S.doneToday.push(w.id);
  S.cards.seen++;
  flyOut(m,known);
  saveCardProgress();
  setTimeout(()=>{S.cards.idx++;if(S.cards.idx>=S.cards.pool.length){endCards();return;}showCard();},280);
}
function endCards(){
  document.getElementById('cs-active').style.display='none';
  document.getElementById('cs-result').style.display='';
  const{known,unknown,seen}=S.cards,pct=seen?Math.round(known/seen*100):0;
  const c=pct>=80?'sh':pct>=50?'sm':'sl';
  const stillWeak=S.words.filter(w=>inScope(w)&&w.status==='unknown').length;
  const tail=unknown>0?`<button class="sbtn em" onclick="setCM('weak');startCards()" style="margin-bottom:10px">複習這次不熟的 ${stillWeak} 個</button>`:`<button class="sbtn em" onclick="startCards()" style="margin-bottom:10px">再來一次</button>`;
  document.getElementById('cs-result').innerHTML=`<div class="gc" style="text-align:center;padding:34px 18px"><div class="score-big ${c}">${pct}%</div><div class="score-sub">記住 ${known} · 不熟 ${unknown}</div><p style="font-family:var(--mono);font-size:calc(var(--fs)*0.78);color:var(--ink3);margin-bottom:20px">不熟的字已存入專屬區，下次自動優先出現</p>${tail}<button class="gbtn" onclick="renderCSetup()">回到設定</button></div>`;
}

/* ===== QUIZ ===== */
function setQT(t){S.qType=t;['em','me','mix'].forEach(k=>{const el=document.getElementById('qt-'+k);if(el)el.classList.toggle('sel',k===t);});}
function setQF(f){S.qF=f;['all','idiom','phrase','word','slang'].forEach(k=>{const el=document.getElementById('qf-'+k);if(el)el.classList.toggle('sel',k===f);});document.getElementById('qp').textContent=S.words.filter(w=>f==='all'||w.type===f).length;}
function updateQToday(){const el=document.getElementById('qtoday');if(el)el.textContent=(todayStr() in S.quizLog)?S.quizLog[todayStr()]:'—';}
function renderQSetup(){document.getElementById('qt').textContent=S.words.length;document.getElementById('qp').textContent=S.words.filter(w=>S.qF==='all'||w.type===S.qF).length;updateQToday();renderCalendar();const qs=document.getElementById('qstart');if(qs){if(todayStr() in S.quizLog){qs.textContent='今日已完成 ✓ ('+S.quizLog[todayStr()]+' 分)';qs.disabled=true;qs.style.opacity='0.45';qs.style.cursor='default';}else{qs.textContent='開始測驗 · 100 題';qs.disabled=false;qs.style.opacity='';qs.style.cursor='';}}document.getElementById('qs-setup').style.display='';document.getElementById('qs-active').style.display='none';document.getElementById('qs-result').style.display='none';}
function startQuiz(){if(todayStr() in S.quizLog){alert('今天已經測驗過囉！每天只能測驗一次，明天再來 💪');renderQSetup();return;}const base=S.words.filter(w=>S.qF==='all'||w.type===S.qF);if(base.length<6){alert('此範圍至少需要 6 個詞彙才能出題！');return;}const TOTAL=100;let ql=[];while(ql.length<TOTAL)ql=ql.concat(shuf(base));ql=ql.slice(0,TOTAL);S.quiz={pool:ql,idx:0,correct:0,wrong:0,total:TOTAL};document.getElementById('qs-setup').style.display='none';document.getElementById('qs-active').style.display='';document.getElementById('qs-result').style.display='none';showQ();}
function showQ(){const{pool,idx,total}=S.quiz,w=pool[idx];document.getElementById('qprog').style.width=Math.round(idx/total*100)+'%';document.getElementById('qctr').textContent=`第 ${idx+1} 題 / ${total}　·　${S.quiz.correct} 分`;document.getElementById('qnext').style.display='none';document.getElementById('qfb').innerHTML='';const isEM=S.qType==='em'?true:S.qType==='me'?false:Math.random()<0.5;S.quiz.isEM=isEM;if(isEM){document.getElementById('qcard').innerHTML=`<div class="qlbl">這個詞的中文意思是？</div><div class="qword">${esc(w.term)}</div>${w.note?`<div style="font-family:var(--mono);font-size:calc(var(--fs)*0.78);color:var(--ink3);margin-top:8px">${esc(w.note)}</div>`:''}`;S.quiz.answer=w.meaning;}else{document.getElementById('qcard').innerHTML=`<div class="qlbl">「${esc(w.meaning)}」的英文是？</div>`;S.quiz.answer=w.term;}const ca=S.quiz.answer;const others=shuf(S.words.filter(x=>(S.qF==='all'||x.type===S.qF)&&x.id!==w.id&&(isEM?x.meaning!==ca:x.term!==ca))).slice(0,5);const opts=shuf([{t:ca,ok:true},...others.map(d=>({t:isEM?d.meaning:d.term,ok:false}))]);document.getElementById('qopts').innerHTML=opts.map((o,i)=>`<button class="opt" id="op${i}" onclick="chkO(${i},${o.ok},'${esc(ca).replace(/'/g,"\\'")}')">${esc(o.t)}</button>`).join('');}
function chkO(i,ok,ca){document.querySelectorAll('.opt').forEach(b=>b.style.pointerEvents='none');document.getElementById('op'+i).classList.add(ok?'ok':'no');if(!ok)document.querySelectorAll('.opt').forEach(b=>{if(b.textContent===ca)b.classList.add('ok');});const w=S.quiz.pool[S.quiz.idx];if(ok)w.correct++;else w.wrong++;w.qmiss=!ok;S.quiz[ok?'correct':'wrong']++;save();updH();const ex=w.example?`<br><em style="opacity:.85;font-size:calc(var(--fs)*0.85)">${esc(w.example)}</em>`:'';document.getElementById('qfb').innerHTML=`<div class="fb ${ok?'fb-ok':'fb-no'}">${ok?'✓ 正確！':`✗ 正確答案：${esc(ca)}`}${ex}</div>`;if(S.quiz.idx<S.quiz.pool.length-1)document.getElementById('qnext').style.display='';else setTimeout(endQuiz,1200);}
function nextQ(){S.quiz.idx++;showQ();}
function endQuiz(){const{correct,total}=S.quiz;const tStr=todayStr();S.quizLog[tStr]=Math.max(S.quizLog[tStr]||0,correct);save();const c=correct>=80?'sh':correct>=50?'sm':'sl';document.getElementById('qs-active').style.display='none';document.getElementById('qs-result').style.display='';document.getElementById('qs-result').innerHTML=`<div class="gc" style="text-align:center;padding:34px 18px"><div class="score-sub" style="margin:0 0 6px">${tStr} 今日成績</div><div class="score-big ${c}">${correct}<span style="font-size:0.4em;color:var(--ink3);font-weight:400"> 分</span></div><div class="score-sub">答對 ${correct} / ${total} 題</div><p style="font-family:var(--mono);font-size:calc(var(--fs)*0.78);color:var(--ink3);margin-bottom:22px">成績已記錄到日曆 · 明天再來挑戰</p><button class="sbtn" onclick="renderQSetup()">回到測驗首頁</button></div>`;}

/* ===== CALENDAR ===== */
const WD=['日','一','二','三','四','五','六'];
let calView=(function(){const d=new Date();d.setDate(1);return d;})();
function renderCalendar(){
  const el=document.getElementById('cal');if(!el)return;
  const y=calView.getFullYear(),m=calView.getMonth();
  const startWd=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate(),today=todayStr();
  let cells='';
  for(let i=0;i<startWd;i++)cells+='<div class="cal-cell cell-empty"></div>';
  for(let d=1;d<=days;d++){
    const key=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    let cls='cal-cell',val='';
    if(key in S.quizLog){cls+=' cell-score';val=`<span class="cv">${S.quizLog[key]}</span>`;}
    else if(key>today){cls+=' cell-future';}
    else if(S.startDate&&key<S.startDate){cls+=' cell-pre';}
    else {cls+=' cell-absent';val='<span class="cv">曠課</span>';}
    if(key===today)cls+=' today';
    cells+=`<div class="${cls}"><span class="cd">${d}</span>${val}</div>`;
  }
  el.innerHTML=`<div class="cal-head"><button class="cal-nav" onclick="calMove(-1)">‹</button><div class="cal-title">${y} · ${String(m+1).padStart(2,'0')} 月</div><button class="cal-nav" onclick="calMove(1)">›</button></div><div class="cal-grid">${WD.map(w=>`<div class="cal-wd">${w}</div>`).join('')}${cells}</div>`;
}
function calMove(d){calView.setMonth(calView.getMonth()+d);renderCalendar();}

/* ===== ADD ===== */
function addWord(){const term=document.getElementById('ae').value.trim(),meaning=document.getElementById('am').value.trim();const example=document.getElementById('aex').value.trim(),note=document.getElementById('an').value.trim();const type=document.getElementById('at').value,fb=document.getElementById('afb');if(!term||!meaning){fb.innerHTML='<div class="fb-r">請填寫英文詞彙和中文意思</div>';return;}S.words.unshift({id:'w'+Date.now(),type,term,meaning,example,note,correct:0,wrong:0});save();['ae','am','aex','an'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});fb.innerHTML=`<div class="fb-g">✓ 已加入：${esc(term)}</div>`;updH();renderFan();setTimeout(()=>{fb.innerHTML='';},2400);}

/* ===== IMPORT FROM FILE (csv / txt) ===== */
function typeFromLabel(s){s=(s||'').trim();const m={'慣用語':'idiom','片語':'phrase','單字':'word','俚語':'slang','idiom':'idiom','phrase':'phrase','word':'word','slang':'slang'};return m[s]||m[s.toLowerCase()]||'';}
function parseCSVLine(line){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(q){if(ch==='"'){if(line[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=ch;}else{if(ch==='"')q=true;else if(ch===','){out.push(cur);cur='';}else cur+=ch;}}out.push(cur);return out;}
function parseCSVRows(text){const rows=[];let row=[],cur='',q=false;for(let i=0;i<text.length;i++){const ch=text[i];if(q){if(ch==='"'){if(text[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=ch;}else if(ch==='"')q=true;else if(ch===','){row.push(cur);cur='';}else if(ch==='\n'){row.push(cur);rows.push(row);row=[];cur='';}else cur+=ch;}row.push(cur);if(row.some(v=>v!==''))rows.push(row);return rows;}
function parseStructuredTxt(text){const items=[];let curType='word';text.split(/\n\s*\n/).forEach(b=>{const tm=b.match(/\[(慣用語|片語|單字|俚語)\]/);if(tm)curType=typeFromLabel(tm[1]);const term=(b.match(/英文[：:]\s*(.+)/)||[])[1];const meaning=(b.match(/中文[：:]\s*(.+)/)||[])[1];if(term&&meaning){const ex=(b.match(/例句[：:]\s*(.+)/)||[])[1]||'';const note=(b.match(/備[注註][：:]\s*(.+)/)||[])[1]||'';items.push({type:curType||'word',term:term.trim(),meaning:meaning.trim(),example:ex.trim(),note:note.trim()});}});return items;}
function parseImport(text,name){
  text=text.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  const lower=(name||'').toLowerCase();
  if(text.indexOf('英文：')>=0&&text.indexOf('中文：')>=0)return parseStructuredTxt(text);
  const lines=text.split('\n').filter(l=>l.trim());
  if(!lines.length)return [];
  if(lower.endsWith('.csv')||lines[0].indexOf(',')>=0){
    const rows=parseCSVRows(text);
    const col={type:-1,term:-1,meaning:-1,example:-1,note:-1};let start=0;
    const head=rows[0].map(s=>s.trim());
    const isHead=head.some(h=>/英文|term|中文|meaning|類型|type/i.test(h));
    if(isHead){start=1;head.forEach((h,i)=>{if(/類型|type/i.test(h))col.type=i;else if(/英文|term/i.test(h))col.term=i;else if(/中文|meaning/i.test(h))col.meaning=i;else if(/例句|example/i.test(h))col.example=i;else if(/備[注註]|note/i.test(h))col.note=i;});}
    else{col.term=0;col.meaning=1;col.example=2;col.note=3;col.type=4;}
    const items=[];
    for(let i=start;i<rows.length;i++){const r=rows[i];const term=(r[col.term]||'').trim();const meaning=(col.meaning>=0?(r[col.meaning]||''):'').trim();if(!term||!meaning)continue;items.push({type:typeFromLabel(col.type>=0?r[col.type]:'')||'word',term,meaning,example:(col.example>=0?(r[col.example]||''):'').trim(),note:(col.note>=0?(r[col.note]||''):'').trim()});}
    return items;
  }
  return lines.map(l=>{let p=l.split('\t');if(p.length<2)p=l.split(/\s*[,，]\s*/);if(p.length<2)p=l.split(/\s*[-—–:：]\s*/);const term=(p[0]||'').trim();const meaning=(p.slice(1).join(' ')||'').trim();return{type:'word',term,meaning,example:'',note:''};}).filter(x=>x.term&&x.meaning);
}
function importFile(input){
  const f=input.files&&input.files[0];if(!f)return;
  const fb=document.getElementById('imp-fb');
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const items=parseImport(String(e.target.result),f.name);
      if(!items.length){fb.innerHTML='<div class="fb-r">找不到可匯入的內容，請確認檔案格式（CSV 或 TXT）。</div>';input.value='';return;}
      const ex=new Set(S.words.map(w=>w.term.toLowerCase()));let added=0,dup=0;
      items.forEach(it=>{if(!it.term||!it.meaning)return;const k=it.term.toLowerCase();if(ex.has(k)){dup++;return;}ex.add(k);S.words.unshift({id:'imp'+Date.now()+'_'+(added),type:it.type||'word',term:it.term,meaning:it.meaning,example:it.example||'',note:it.note||'',correct:0,wrong:0});added++;});
      save();updH();renderFan();renderList();
      fb.innerHTML=`<div class="fb-g">✓ 已匯入 ${added} 個新詞彙${dup?`（略過 ${dup} 個重複）`:''}</div>`;
    }catch(err){fb.innerHTML='<div class="fb-r">匯入失敗：'+esc(err.message||'格式錯誤')+'</div>';}
    input.value='';
  };
  reader.onerror=()=>{fb.innerHTML='<div class="fb-r">讀取檔案失敗</div>';};
  reader.readAsText(f,'utf-8');
}

/* ===== EXPORT ===== */
function exportTxt(){
  if(!S.words.length){alert('詞庫是空的！');return;}
  var types={idiom:'慣用語',phrase:'片語',word:'單字',slang:'俚語'};
  var lines=['LEARNING 英文詞庫匯出 — '+new Date().toLocaleDateString('zh-TW'),'==================================================',''];
  ['idiom','phrase','word','slang'].forEach(function(type){
    var ws=S.words.filter(function(w){return w.type===type;});
    if(!ws.length)return;
    lines.push('['+types[type]+'] ('+ws.length+'個)');
    lines.push('------------------------------');
    ws.forEach(function(w){
      lines.push('英文：'+w.term);
      lines.push('中文：'+w.meaning);
      if(w.example)lines.push('例句：'+w.example);
      if(w.note)lines.push('備注：'+w.note);
      var tot=w.correct+w.wrong;
      if(tot)lines.push('掌握度：'+Math.round(w.correct/tot*100)+'% (答對'+w.correct+'，答錯'+w.wrong+')');
      lines.push('');
    });
    lines.push('');
  });
  lines.push('共 '+S.words.length+' 個詞彙');
  var blob=new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='LEARNING_詞庫_'+todayStr()+'.txt';a.click();URL.revokeObjectURL(a.href);
  document.getElementById('exp-fb').innerHTML='<div class="fb-g">✓ TXT 已匯出！</div>';setTimeout(function(){document.getElementById('exp-fb').innerHTML='';},3000);
}
function exportJSON(){
  if(!S.words.length){alert('詞庫是空的！');return;}
  var payload={app:'LEARNING',version:1,exportedAt:new Date().toISOString(),data:packState()};
  var blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='LEARNING_完整備份_'+todayStr()+'.json';a.click();URL.revokeObjectURL(a.href);
  document.getElementById('exp-fb').innerHTML='<div class="fb-g">✓ 完整 JSON 備份已匯出！</div>';setTimeout(function(){document.getElementById('exp-fb').innerHTML='';},3000);
}
function importJSON(input){
  const f=input.files&&input.files[0];if(!f)return;const fb=document.getElementById('exp-fb');const reader=new FileReader();
  reader.onload=e=>{try{const raw=JSON.parse(String(e.target.result));const data=raw.data||raw;if(!data||!Array.isArray(data.words))throw new Error('JSON 缺少 words 陣列');uiConfirm('還原完整備份會覆蓋目前詞庫、複習狀態與測驗紀錄。建議先匯出目前備份。確定要還原嗎？','還原備份',function(){applyState(data);if(S.cardDay!==todayStr()){S.cardDay=todayStr();S.doneToday=[];}if(!S.startDate)S.startDate=todayStr();save();updH();renderFan();renderList();renderCalendar();updateQToday();const ec=document.getElementById('exp-count');if(ec)ec.textContent=S.words.length;fb.innerHTML='<div class="fb-g">✓ 已還原完整備份：'+S.words.length+' 個詞彙</div>';});}catch(err){fb.innerHTML='<div class="fb-r">JSON 還原失敗：'+esc(err.message||'格式錯誤')+'</div>';}input.value='';};
  reader.onerror=()=>{fb.innerHTML='<div class="fb-r">讀取 JSON 備份失敗</div>';input.value='';};reader.readAsText(f,'utf-8');
}
function exportExcel(){
  if(!S.words.length){alert('詞庫是空的！');return;}
  var types={idiom:'慣用語',phrase:'片語',word:'單字',slang:'俚語'};
  var rows=[['類型','英文詞彙','中文意思','例句','用法備注','答對次數','答錯次數','掌握度%']];
  S.words.forEach(function(w){var tot=w.correct+w.wrong;rows.push([types[w.type]||w.type,w.term,w.meaning,w.example||'',w.note||'',w.correct,w.wrong,tot?Math.round(w.correct/tot*100):'']);});
  function cell(v){var s=String(v);if(/^[=+\-@]/.test(s))s="'"+s;if(s.indexOf(',')>=0||s.indexOf('"')>=0||s.indexOf('\n')>=0)return '"'+s.replace(/"/g,'""')+'"';return s;}
  var csv='\ufeff'+rows.map(function(r){return r.map(cell).join(',');}).join('\n');
  var blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='LEARNING_詞庫_'+todayStr()+'.csv';a.click();URL.revokeObjectURL(a.href);
  document.getElementById('exp-fb').innerHTML='<div class="fb-g">✓ Excel 檔案已匯出！<br><span style="font-size:calc(var(--fs)*0.82);opacity:.7">用 Excel 或 Numbers 開啟 .csv 檔案即可</span></div>';setTimeout(function(){document.getElementById('exp-fb').innerHTML='';},3000);
}

function initDetailGestures(){const ov=document.getElementById('ov'),panel=document.querySelector('#ov .dp');if(!ov||!panel)return;let sy=0,drag=false;
  ov.addEventListener('click',e=>{if(e.target===ov)closeD();});
  panel.addEventListener('touchstart',e=>{sy=e.touches[0].clientY;drag=panel.scrollTop<=0;},{passive:true});
  panel.addEventListener('touchend',e=>{if(drag&&e.changedTouches[0].clientY-sy>70)closeD();drag=false;},{passive:true});
}

document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const cf=document.getElementById('cfov'),ov=document.getElementById('ov'),rail=document.getElementById('rail');if(cf&&cf.classList.contains('show'))cfClose();else if(document.getElementById('cloudov')&&document.getElementById('cloudov').classList.contains('show'))closeCloudPanel();else if(ov&&ov.classList.contains('show'))closeD();else if(rail&&rail.classList.contains('show')&&typeof closeRail==='function')closeRail();});

/* ---- boot ---- */
if('speechSynthesis'in window){loadVoices();try{speechSynthesis.onvoiceschanged=loadVoices;}catch(e){}}
(async function boot(){await load();ttsAccent=S.accent||'en-US';updH();renderFan();renderList();checkImport();initFanSwipe();initRail();initDetailGestures();renderCalendar();syncAccentUI();initCloudSync();})();
