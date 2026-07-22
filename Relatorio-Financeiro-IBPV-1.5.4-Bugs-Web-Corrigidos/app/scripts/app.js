import { backend } from './services/backend.js';

window.IBPV_LOGO_DATA='';
fetch(new URL('../assets/logo-ibpv.png',import.meta.url)).then(response=>response.blob()).then(blob=>new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);})).then(data=>{window.IBPV_LOGO_DATA=data;}).catch(console.error);

const screens=[...document.querySelectorAll('.screen')];
const storageKey='ibpv-report-app-v1';
const authKey='ibpv-admin-user-v1';
const usersKey='ibpv-admin-users-v2';
const publishedKey='ibpv-published-reports-v1';
let state=loadState();
let currentUser=null;
let unsubscribeAuthState=()=>{};
let authListenerRegistered=false;
let authStateTask=Promise.resolve();

let pendingTransactionAttachments=[];
let originalTransactionAttachmentIds=new Set();
let activeAttachmentFilter='all';
const ATTACHMENT_DB='ibpv-financeiro-arquivos-v1';
const ATTACHMENT_STORE='files';
const MAX_ATTACHMENT_SIZE=10*1024*1024;
const ALLOWED_ATTACHMENT_TYPES=new Set(['application/pdf','image/jpeg','image/png','image/webp']);

function openAttachmentDb(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(ATTACHMENT_DB,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(ATTACHMENT_STORE)) db.createObjectStore(ATTACHMENT_STORE,{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function storeAttachmentFile(meta,file){
  const db=await openAttachmentDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(ATTACHMENT_STORE,'readwrite');
    tx.objectStore(ATTACHMENT_STORE).put({...meta,blob:file});
    tx.oncomplete=()=>{db.close();resolve(meta);};
    tx.onerror=()=>{db.close();reject(tx.error);};
  });
}
async function getAttachmentFile(id){
  const db=await openAttachmentDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(ATTACHMENT_STORE,'readonly');
    const req=tx.objectStore(ATTACHMENT_STORE).get(id);
    req.onsuccess=()=>{db.close();resolve(req.result||null);};
    req.onerror=()=>{db.close();reject(req.error);};
  });
}
async function removeAttachmentFile(id){
  const db=await openAttachmentDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(ATTACHMENT_STORE,'readwrite');
    tx.objectStore(ATTACHMENT_STORE).delete(id);
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{db.close();reject(tx.error);};
  });
}
function ensureAttachmentState(){
  if(!Array.isArray(state.generalAttachments)) state.generalAttachments=[];
  state.transactions.forEach(item=>{if(!Array.isArray(item.attachments))item.attachments=[];});
}
function attachmentSize(bytes){
  if(bytes<1024)return `${bytes} B`;
  if(bytes<1024*1024)return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
}
function attachmentKind(type){return type==='application/pdf'?'PDF':'IMG';}
function attachmentMeta(file){return{id:crypto.randomUUID(),name:file.name,type:file.type,size:file.size,createdAt:new Date().toISOString()};}
function validateAttachment(file){
  if(!ALLOWED_ATTACHMENT_TYPES.has(file.type))return 'Formato não aceito. Use PDF, JPG, PNG ou WEBP.';
  if(file.size>MAX_ATTACHMENT_SIZE)return `${file.name} ultrapassa o limite de 10 MB.`;
  return '';
}
async function persistSelectedFiles(files,target='transaction'){
  const accepted=[];
  for(const file of [...files]){
    const error=validateAttachment(file);
    if(error){window.IBPVMotion?.toast('Arquivo não adicionado',error);continue;}
    const meta=attachmentMeta(file);
    try{await storeAttachmentFile(meta,file);accepted.push(meta);}catch(err){console.error(err);window.IBPVMotion?.toast('Falha ao anexar',`Não foi possível armazenar ${file.name}.`);}
  }
  if(target==='transaction'){
    pendingTransactionAttachments.push(...accepted);
    renderPendingAttachments();
  }else{
    ensureAttachmentState();state.generalAttachments.push(...accepted);saveState();renderAttachmentManager();
  }
  if(accepted.length)window.IBPVMotion?.toast('Anexos adicionados',`${accepted.length} arquivo(s) armazenado(s) neste computador.`);
}
async function openStoredAttachment(id,download=false){
  const remoteMeta=[...(state.generalAttachments||[]),...state.transactions.flatMap(item=>item.attachments||[])].find(item=>item.id===id);
  if(backend.configured&&remoteMeta?.storagePath){
    const url=await backend.signedAttachmentUrl(remoteMeta.storagePath,remoteMeta.storageBucket);
    if(download){const link=document.createElement('a');link.href=url;link.download=remoteMeta.name;document.body.appendChild(link);link.click();link.remove();}
    else window.open(url,'_blank','noopener');
    return;
  }
  const record=await getAttachmentFile(id);
  if(!record?.blob){alert('O arquivo não foi encontrado neste computador.');return;}
  const url=URL.createObjectURL(record.blob);
  if(download){const link=document.createElement('a');link.href=url;link.download=record.name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  else{window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);}
}
function attachmentItemHtml(meta,context='transaction'){
  return `<div class="attachment-item" data-attachment-id="${meta.id}"><span class="attachment-file-icon">${attachmentKind(meta.type)}</span><span class="attachment-info"><strong title="${escapeHtml(meta.name)}">${escapeHtml(meta.name)}</strong><small>${attachmentSize(meta.size)} • ${new Date(meta.createdAt).toLocaleDateString('pt-BR')}</small></span><span class="attachment-actions"><button type="button" class="attachment-action" data-attachment-view="${meta.id}" title="Visualizar">↗</button><button type="button" class="attachment-action" data-attachment-download="${meta.id}" title="Baixar">↓</button><button type="button" class="attachment-action danger" data-attachment-remove="${meta.id}" data-attachment-context="${context}" title="Remover">×</button></span></div>`;
}
function renderPendingAttachments(){
  const list=document.getElementById('transaction-attachments-list');
  const count=document.getElementById('transaction-attachment-count');
  if(!list||!count)return;
  count.textContent=`${pendingTransactionAttachments.length} arquivo${pendingTransactionAttachments.length===1?'':'s'}`;
  list.innerHTML=pendingTransactionAttachments.length?pendingTransactionAttachments.map(meta=>attachmentItemHtml(meta,'transaction')).join(''):'';
}

function getUsers(){
  let users=[];
  try{users=JSON.parse(localStorage.getItem(usersKey)||'[]');}catch{}
  if(!users.length){
    try{const legacy=JSON.parse(localStorage.getItem(authKey)||'null');if(legacy){users=[{id:crypto.randomUUID(),name:legacy.name,password:legacy.password,role:'Administrador',active:true,lastAccess:null}];localStorage.setItem(usersKey,JSON.stringify(users));}}catch{}
  }
  return users;
}
function saveUsers(users){localStorage.setItem(usersKey,JSON.stringify(users));}
function getFallbackUser(){return currentUser||getUsers().find(u=>u.active)||null;}

const FLOW_SCREENS=['welcome','about','profile','member-identification','restricted','admin-auth'];
const APP_SCREENS=['member-portal','admin-dashboard'];
const appRoot=document.getElementById('app');
let screenTransitionLocked=false;
let selectedFlowRoute=null;

screens.forEach(screen=>{
  const name=screen.dataset.screen;
  screen.classList.add(FLOW_SCREENS.includes(name)?'flow-section':'app-view');
  if(['member-identification','restricted','admin-auth'].includes(name)) screen.classList.add('flow-route-hidden');
});

function prepareScreen(name){
  if(name==='admin-auth')prepareAuth();
  if(name==='member-portal')renderPublishedReports();
  if(name==='admin-dashboard')renderAdmin();
}

function setFlowRoute(target){
  const member=document.querySelector('[data-screen="member-identification"]');
  const restricted=document.querySelector('[data-screen="restricted"]');
  const auth=document.querySelector('[data-screen="admin-auth"]');
  if(target==='member-identification'){
    selectedFlowRoute='member';
    member.classList.remove('flow-route-hidden');
    restricted.classList.add('flow-route-hidden');
    auth.classList.add('flow-route-hidden');
  }else if(target==='restricted'||target==='admin-auth'){
    selectedFlowRoute='admin';
    member.classList.add('flow-route-hidden');
    restricted.classList.remove('flow-route-hidden');
    auth.classList.toggle('flow-route-hidden',target!=='admin-auth');
  }else if(['welcome','about','profile'].includes(target) && target==='profile'){
    selectedFlowRoute=null;
    member.classList.add('flow-route-hidden');
    restricted.classList.add('flow-route-hidden');
    auth.classList.add('flow-route-hidden');
  }
}

function easeInOutCubic(t){
  return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
}

function animateFlowTo(target,instant=false){
  if(window.IBPVMotion){
    window.IBPVMotion.setCurrent(target);
    return window.IBPVMotion.scrollToSection(target,instant);
  }
  const next=screens.find(s=>s.dataset.screen===target);
  if(next) appRoot.scrollTop=next.offsetTop;
}
function enterFlowMode(target='welcome',instant=false){
  appRoot.classList.add('flow-mode');
  document.body.classList.add('flow-page');
  document.body.classList.remove('app-page','is-transitioning');
  screens.filter(s=>s.classList.contains('app-view')).forEach(s=>s.classList.remove('active'));
  setFlowRoute(target);
  const next=screens.find(s=>s.dataset.screen===target);
  if(!next)return;
  prepareScreen(target);
  requestAnimationFrame(()=>requestAnimationFrame(()=>animateFlowTo(target,instant)));
}

function enterAppMode(name){
  const next=screens.find(s=>s.dataset.screen===name);
  if(!next||screenTransitionLocked)return;
  prepareScreen(name);
  screens.filter(s=>s.classList.contains('app-view')).forEach(s=>s.classList.remove('active'));
  screenTransitionLocked=true;
  document.body.classList.add('is-transitioning');
  next.classList.add('active','app-reveal');
  appRoot.classList.remove('flow-mode');
  document.body.classList.remove('flow-page');
  document.body.classList.add('app-page');
  window.scrollTo({top:0,left:0,behavior:'auto'});
  setTimeout(()=>{
    next.classList.remove('app-reveal');
    document.body.classList.remove('is-transitioning');
    screenTransitionLocked=false;
  },520);
}

function showScreen(name){
  if(FLOW_SCREENS.includes(name)){
    enterFlowMode(name);
    return;
  }
  if(APP_SCREENS.includes(name)) enterAppMode(name);
}

document.addEventListener('click',e=>{
  const target=e.target.closest('[data-go]');
  if(!target)return;
  e.preventDefault();
  const destination=target.dataset.go;
  if(window.IBPVMotion?.isAnimating()) return;

  if(destination==='member-identification') setFlowRoute('member-identification');
  if(destination==='restricted'||destination==='admin-auth') setFlowRoute(destination);

  const shouldMorph=target.classList.contains('profile-card') || ['admin-auth','member-portal','admin-dashboard'].includes(destination);
  if(shouldMorph && window.IBPVMotion){
    prepareScreen(destination);
    window.IBPVMotion.morphFrom(target,destination,()=>{
      if(APP_SCREENS.includes(destination)) enterAppMode(destination);
    });
    return;
  }
  showScreen(destination);
});

function loadState(){try{return JSON.parse(localStorage.getItem(storageKey))||defaultState();}catch{return defaultState();}}
function defaultState(){return{frequency:'Mensal',year:'2026',period:'Janeiro',previousBalance:6847.5,status:'Em elaboração',generalAttachments:[],transactions:[{id:crypto.randomUUID(),type:'entrada',date:'2026-01-05',description:'Dízimos',category:'Dízimos',method:'Depósito bancário',value:2500,notes:'',attachments:[]},{id:crypto.randomUUID(),type:'entrada',date:'2026-01-08',description:'Oferta de gratidão',category:'Ofertas',method:'Dinheiro',value:450,notes:'',attachments:[]},{id:crypto.randomUUID(),type:'saida',date:'2026-01-07',description:'Conta de energia',category:'Contas',method:'Transferência',value:480.2,notes:'',attachments:[]}]};}
function saveState(){localStorage.setItem(storageKey,JSON.stringify(state));document.getElementById('last-update').textContent=new Date().toLocaleString('pt-BR');}
function brl(v){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);}

const MONTHS=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const PERIOD_LENGTHS={Mensal:1,Bimestral:2,Trimestral:3,Quadrimestral:4,Semestral:6,Anual:12};
function getPeriodOptions(frequency){
  const length=PERIOD_LENGTHS[frequency]||1;
  if(length===12)return [{label:'Janeiro a Dezembro',value:'Janeiro a Dezembro',startMonth:0,endMonth:11}];
  const options=[];
  for(let start=0;start<12;start+=length){
    const end=Math.min(11,start+length-1);
    const label=length===1?MONTHS[start]:`${MONTHS[start]} a ${MONTHS[end]}`;
    options.push({label,value:label,startMonth:start,endMonth:end});
  }
  return options;
}
function normalizePeriodState(){
  if(!PERIOD_LENGTHS[state.frequency])state.frequency='Mensal';
  const options=getPeriodOptions(state.frequency);
  if(!options.some(option=>option.value===state.period))state.period=options[0].value;
}
function populatePeriodSelect(){
  normalizePeriodState();
  const select=document.getElementById('report-period');
  select.innerHTML=getPeriodOptions(state.frequency).map(option=>`<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join('');
  select.value=state.period;
  select.disabled=state.frequency==='Anual';
}
function getCurrentPeriod(){
  normalizePeriodState();
  return getPeriodOptions(state.frequency).find(option=>option.value===state.period)||getPeriodOptions(state.frequency)[0];
}
function formatReportPeriod(includeYear=true){
  const base=state.period;
  return includeYear?`${base} de ${state.year}`:base;
}
function getPeriodFileLabel(){return cleanFileName(`${state.period}-${state.year}`);}
function getReportTransactions(){
  const range=getCurrentPeriod();
  const year=Number(state.year);
  return state.transactions.filter(item=>{
    if(!item.date)return false;
    const date=new Date(item.date+'T00:00:00');
    return date.getFullYear()===year&&date.getMonth()>=range.startMonth&&date.getMonth()<=range.endMonth;
  });
}
function dateBelongsToCurrentPeriod(dateValue){
  if(!dateValue)return false;
  const range=getCurrentPeriod();
  const date=new Date(dateValue+'T00:00:00');
  return date.getFullYear()===Number(state.year)&&date.getMonth()>=range.startMonth&&date.getMonth()<=range.endMonth;
}
function defaultTransactionDate(){
  const range=getCurrentPeriod();
  return `${state.year}-${String(range.startMonth+1).padStart(2,'0')}-01`;
}
function currentPeriodDates(){
  const range=getCurrentPeriod();
  const year=Number(state.year);
  const startDate=`${year}-${String(range.startMonth+1).padStart(2,'0')}-01`;
  const lastDay=new Date(year,range.endMonth+1,0).getDate();
  const endDate=`${year}-${String(range.endMonth+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
  return {startDate,endDate};
}
async function syncEntries(){
  if(!backend.configured)return;
  const {startDate,endDate}=currentPeriodDates();
  state.transactions=await backend.entries(startDate,endDate);
  renderAdmin();
}

function isMemberProfile(user){return user?.role==='membro';}

function showLanding(){
  currentUser=null;
  enterFlowMode('welcome',true);
}

function authenticatedAreaIsOpen(user){
  const screenName=isMemberProfile(user)?'member-portal':'admin-dashboard';
  return document.body.classList.contains('app-page')
    && document.querySelector(`[data-screen="${screenName}"]`)?.classList.contains('active');
}

async function openAuthenticatedArea(user,{sync=true,navigate=true}={}){
  currentUser=user;
  if(isMemberProfile(user)){
    document.getElementById('member-welcome').textContent=`Bem-vindo, ${user.name}`;
    if(navigate)showScreen('member-portal');
    return;
  }
  if(sync)await syncEntries();
  else renderAdmin();
  if(navigate)showScreen('admin-dashboard');
}

async function restoreAuthenticatedSession(session,{sync=true,navigate=true}={}){
  const user=await backend.currentUser(session);
  if(!user?.active){
    await backend.signOut();
    throw new Error('Este usuário está inativo. Procure o administrador.');
  }
  await openAuthenticatedArea(user,{sync,navigate});
  return user;
}

function handleAuthStateChange(event,session){
  authStateTask=authStateTask.then(async()=>{
    if(event==='TOKEN_REFRESHED')return;
    if(event==='SIGNED_OUT'){
      showLanding();
      return;
    }
    if((event==='INITIAL_SESSION'||event==='SIGNED_IN')&&session?.user){
      if(currentUser?.id===session.user.id&&authenticatedAreaIsOpen(currentUser))return;
      await restoreAuthenticatedSession(session,{sync:true,navigate:true});
      return;
    }
    if(event==='USER_UPDATED'&&session?.user){
      const previousRole=currentUser?.role;
      const user=await backend.currentUser(session);
      if(!user?.active){
        await backend.signOut();
        return;
      }
      const roleChanged=previousRole&&previousRole!==user.role;
      await openAuthenticatedArea(user,{
        sync:Boolean(roleChanged&&!isMemberProfile(user)),
        navigate:Boolean(roleChanged)
      });
    }
  }).catch(error=>{
    console.error('Falha ao atualizar a sessão autenticada:',error);
  });
}

function registerAuthStateListener(){
  if(authListenerRegistered)return;
  unsubscribeAuthState();
  unsubscribeAuthState=backend.onAuthStateChange((event,nextSession)=>{
    setTimeout(()=>handleAuthStateChange(event,nextSession),0);
  });
  authListenerRegistered=true;
}

async function bootstrapApplication(){
  let session=null;
  let releaseInterface=true;
  try{
    if(!backend.configured){
      showLanding();
      return;
    }
    session=await backend.session();
    if(!session?.user){
      registerAuthStateListener();
      showLanding();
      return;
    }
    await restoreAuthenticatedSession(session,{sync:true,navigate:true});
    registerAuthStateListener();
    return;
  }catch(error){
    console.error('Não foi possível restaurar a sessão:',error);
    const remainingSession=session?.user?await backend.session().catch(()=>session):null;
    if(!remainingSession?.user){
      showLanding();
    }else{
      releaseInterface=false;
      const message=document.querySelector('#intro-curtain .intro-mark span');
      if(message)message.textContent='Não foi possível confirmar a sessão. Verifique a internet e pressione F5.';
    }
  }finally{
    if(releaseInterface)window.IBPVSessionGate?.release();
  }
}
function aggregateByMonth(items){
  const range=getCurrentPeriod();
  const labels=[];const entries=[];const expenses=[];
  for(let month=range.startMonth;month<=range.endMonth;month++){
    labels.push(MONTHS[month]);entries.push(0);expenses.push(0);
  }
  items.forEach(item=>{
    const date=new Date(item.date+'T00:00:00');
    const index=date.getMonth()-range.startMonth;
    if(index<0||index>=labels.length)return;
    if(item.type==='entrada')entries[index]+=Number(item.value||0);else expenses[index]+=Number(item.value||0);
  });
  return {labels,entries,expenses};
}

const memberForm=document.getElementById('member-form');
memberForm.addEventListener('submit',async e=>{
  e.preventDefault();
  const email=document.getElementById('member-name').value.trim();
  const password=document.getElementById('member-password').value;
  try{
    currentUser=await backend.signIn(email,password);
    document.getElementById('member-welcome').textContent=`Bem-vindo, ${currentUser.name}`;
    showScreen('member-portal');
  }catch(error){console.error(error);alert(error.message||'Não foi possível entrar.');}
});

function prepareAuth(){document.getElementById('auth-title').textContent='Login';document.getElementById('auth-description').textContent=backend.configured?'Informe seu e-mail e senha para acessar a área administrativa.':'Supabase não configurado; o modo local de compatibilidade está ativo.';document.getElementById('activation-group').style.display='none';document.getElementById('auth-submit').textContent='Entrar';document.getElementById('admin-name').value='';}

document.getElementById('auth-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const email=document.getElementById('admin-name').value.trim();
  const password=document.getElementById('admin-password').value;
  try{
    if(backend.configured){
      currentUser=await backend.signIn(email,password);
      if(currentUser.role==='membro'){
        await backend.signOut();currentUser=null;
        throw new Error('Este perfil não possui acesso à área administrativa.');
      }
      await syncEntries();
    }else{
      const users=getUsers();
      currentUser=users.find(u=>u.active&&u.name.toLowerCase()===email.toLowerCase()&&u.password===password);
      if(!currentUser)throw new Error('Usuário local não encontrado. Configure o Supabase para usar o login online.');
    }
    document.getElementById('auth-form').reset();showScreen('admin-dashboard');
  }catch(error){console.error(error);alert(error.message||'Não foi possível entrar.');}
});

document.getElementById('logout-btn').addEventListener('click',async()=>{
  try{await backend.signOut();}
  catch(error){console.error(error);}
  finally{
    showLanding();
  }
});

const modal=document.getElementById('transaction-modal');
document.querySelectorAll('[data-open-modal]').forEach(btn=>btn.addEventListener('click',()=>openTransactionModal(btn.dataset.openModal)));
async function cancelTransactionModal(){for(const meta of pendingTransactionAttachments){if(!originalTransactionAttachmentIds.has(meta.id))await removeAttachmentFile(meta.id).catch(()=>{});}pendingTransactionAttachments=[];originalTransactionAttachmentIds=new Set();modal.close();}
document.getElementById('close-modal').onclick=cancelTransactionModal;
document.getElementById('cancel-modal').onclick=cancelTransactionModal;
function openTransactionModal(type,item=null){ensureAttachmentState();document.getElementById('transaction-form').reset();document.getElementById('transaction-type').value=type;document.getElementById('editing-id').value=item?.id||'';document.getElementById('modal-title').textContent=item?'Editar lançamento':type==='entrada'?'Adicionar entrada':'Adicionar despesa';document.getElementById('transaction-date').value=item?.date||defaultTransactionDate();document.getElementById('transaction-value').value=item?.value||'';document.getElementById('transaction-description').value=item?.description||'';document.getElementById('transaction-category').value=item?.category||'';document.getElementById('transaction-method').value=item?.method||'';document.getElementById('transaction-notes').value=item?.notes||'';pendingTransactionAttachments=[...(item?.attachments||[])];originalTransactionAttachmentIds=new Set(pendingTransactionAttachments.map(meta=>meta.id));renderPendingAttachments();modal.showModal();}

document.getElementById('transaction-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const item={id:document.getElementById('editing-id').value||null,type:document.getElementById('transaction-type').value,date:document.getElementById('transaction-date').value,description:document.getElementById('transaction-description').value.trim(),category:document.getElementById('transaction-category').value.trim(),method:document.getElementById('transaction-method').value.trim(),value:Number(document.getElementById('transaction-value').value),notes:document.getElementById('transaction-notes').value.trim(),attachments:[...pendingTransactionAttachments]};
  if(!dateBelongsToCurrentPeriod(item.date)){alert(`A data do lançamento deve estar dentro do período ${formatReportPeriod()}.`);return;}
  try{
    if(backend.configured){
      item.id=await backend.saveEntry(item,currentUser.id);
      for(const meta of pendingTransactionAttachments.filter(file=>!file.storagePath)){
        const record=await getAttachmentFile(meta.id);
        if(record?.blob){await backend.uploadAttachment({file:new File([record.blob],record.name,{type:record.type}),entryId:item.id,userId:currentUser.id});await removeAttachmentFile(meta.id);}
      }
      await syncEntries();
      window.IBPVMotion?.toast(`Salvo na nuvem às ${new Date().toLocaleTimeString('pt-BR')}`);
    }
    else{item.id=item.id||crypto.randomUUID();const idx=state.transactions.findIndex(t=>t.id===item.id);if(idx>=0)state.transactions[idx]=item;else state.transactions.push(item);saveState();}
    pendingTransactionAttachments=[];originalTransactionAttachmentIds=new Set();modal.close();renderAdmin();
  }catch(error){console.error(error);alert(error.message||'Não foi possível salvar o lançamento.');}
});

function renderAdmin(){ensureAttachmentState();normalizePeriodState();const user=getFallbackUser();document.getElementById('logged-user').textContent=user?.name||'Usuário';document.getElementById('report-owner').textContent=user?.name||'—';document.getElementById('users-nav').hidden=backend.configured&&user?.role!=='administrador';document.getElementById('report-frequency').value=state.frequency;document.getElementById('report-year').value=state.year;populatePeriodSelect();document.getElementById('previous-balance').value=state.previousBalance;document.getElementById('report-title').textContent=`Relatório Financeiro — ${formatReportPeriod()}`;renderTransactions();updateSummary();}
function renderTransactions(){const q=document.getElementById('search-transaction').value.toLowerCase();const transactions=getReportTransactions();renderList('entries-list',transactions.filter(t=>t.type==='entrada'&&matches(t,q)));renderList('expenses-list',transactions.filter(t=>t.type==='saida'&&matches(t,q)));}
function matches(t,q){return !q||[t.description,t.category,t.method].some(v=>(v||'').toLowerCase().includes(q));}
function renderList(id,items){const el=document.getElementById(id);if(!items.length){el.innerHTML='<div class="empty-state">Nenhum lançamento encontrado.</div>';return;}el.innerHTML='<div class="transaction-row header"><span>Data</span><span>Descrição</span><span>Categoria</span><span>Forma</span><span>Valor</span><span>Ações</span></div>'+items.map(t=>{const attachmentCount=(t.attachments||[]).length;return `<div class="transaction-row"><span>${new Date(t.date+'T00:00:00').toLocaleDateString('pt-BR')}</span><span><strong>${escapeHtml(t.description)}</strong>${attachmentCount?`<button class="attachment-badge" data-open-transaction-attachments="${t.id}" title="Abrir anexos">📎 ${attachmentCount}</button>`:''}</span><span>${escapeHtml(t.category||'—')}</span><span>${escapeHtml(t.method||'—')}</span><span class="amount">${brl(t.value)}</span><span class="actions"><button class="mini-btn" data-edit="${t.id}" title="Editar">✎</button><button class="mini-btn delete" data-delete="${t.id}" title="Excluir lançamento" aria-label="Excluir lançamento"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-.7 11H7.7L7 9Zm3 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z"/></svg></button></span></div>`;}).join('');}
function escapeHtml(v){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
document.addEventListener('click',async e=>{const edit=e.target.closest('[data-edit]');if(edit){const item=state.transactions.find(t=>t.id===edit.dataset.edit);openTransactionModal(item.type,item);}const attachmentOpen=e.target.closest('[data-open-transaction-attachments]');if(attachmentOpen){const item=state.transactions.find(t=>t.id===attachmentOpen.dataset.openTransactionAttachments);if(item)openTransactionModal(item.type,item);}const del=e.target.closest('[data-delete]');if(del&&confirm('Deseja excluir este lançamento e todos os anexos vinculados?')){try{if(backend.configured){await backend.deleteEntry(del.dataset.delete);await syncEntries();}else{const item=state.transactions.find(t=>t.id===del.dataset.delete);for(const meta of item?.attachments||[])await removeAttachmentFile(meta.id).catch(()=>{});state.transactions=state.transactions.filter(t=>t.id!==del.dataset.delete);saveState();renderAdmin();}}catch(error){console.error(error);alert(error.message||'Não foi possível excluir o lançamento.');}}});
function updateSummary(){const transactions=getReportTransactions();const entries=transactions.filter(t=>t.type==='entrada').reduce((s,t)=>s+t.value,0);const expenses=transactions.filter(t=>t.type==='saida').reduce((s,t)=>s+t.value,0);document.getElementById('summary-previous').textContent=brl(state.previousBalance);document.getElementById('summary-entries').textContent=brl(entries);document.getElementById('summary-expenses').textContent=brl(expenses);document.getElementById('summary-final').textContent=brl(state.previousBalance+entries-expenses);}
document.getElementById('report-frequency').addEventListener('change',async()=>{state.frequency=document.getElementById('report-frequency').value;state.period=getPeriodOptions(state.frequency)[0].value;saveState();renderAdmin();await syncEntries().catch(console.error);});
document.getElementById('report-year').addEventListener('change',async()=>{state.year=document.getElementById('report-year').value;saveState();renderAdmin();await syncEntries().catch(console.error);});
document.getElementById('report-period').addEventListener('change',async()=>{state.period=document.getElementById('report-period').value;saveState();renderAdmin();await syncEntries().catch(console.error);});
document.getElementById('previous-balance').addEventListener('change',()=>{state.previousBalance=Number(document.getElementById('previous-balance').value)||0;saveState();renderAdmin();});
document.getElementById('search-transaction').addEventListener('input',renderTransactions);
document.getElementById('save-report').onclick=()=>{saveState();window.IBPVMotion?.toast('Relatório salvo',backend.configured?'Os lançamentos estão sincronizados com o Supabase.':'Os dados foram armazenados neste computador.');};


const transactionFiles=document.getElementById('transaction-files');
const transactionDropzone=document.getElementById('transaction-dropzone');
transactionDropzone.addEventListener('click',()=>transactionFiles.click());
transactionFiles.addEventListener('change',async()=>{await persistSelectedFiles(transactionFiles.files,'transaction');transactionFiles.value='';});
['dragenter','dragover'].forEach(name=>transactionDropzone.addEventListener(name,e=>{e.preventDefault();transactionDropzone.classList.add('drag-over');}));
['dragleave','drop'].forEach(name=>transactionDropzone.addEventListener(name,e=>{e.preventDefault();transactionDropzone.classList.remove('drag-over');}));
transactionDropzone.addEventListener('drop',e=>persistSelectedFiles(e.dataTransfer.files,'transaction'));

document.addEventListener('click',async e=>{
  const view=e.target.closest('[data-attachment-view]');if(view)await openStoredAttachment(view.dataset.attachmentView,false);
  const download=e.target.closest('[data-attachment-download]');if(download)await openStoredAttachment(download.dataset.attachmentDownload,true);
  const remove=e.target.closest('[data-attachment-remove]');
  if(remove){
    const id=remove.dataset.attachmentRemove;if(!confirm('Deseja remover este anexo?'))return;
    if(remove.dataset.attachmentContext==='transaction'){
      pendingTransactionAttachments=pendingTransactionAttachments.filter(meta=>meta.id!==id);renderPendingAttachments();
    }else{
      await removeAttachmentFile(id).catch(()=>{});
      ensureAttachmentState();state.generalAttachments=state.generalAttachments.filter(meta=>meta.id!==id);
      state.transactions.forEach(item=>item.attachments=item.attachments.filter(meta=>meta.id!==id));saveState();renderAttachmentManager();renderAdmin();
    }
  }
});

const attachmentsModal=document.getElementById('attachments-modal');
const generalFiles=document.getElementById('general-files');
const generalDropzone=document.getElementById('general-dropzone');
document.querySelector('[data-admin-tab="attachments"]').addEventListener('click',()=>{renderAttachmentManager();attachmentsModal.showModal();});
document.getElementById('close-attachments').addEventListener('click',()=>attachmentsModal.close());
generalDropzone.addEventListener('click',()=>generalFiles.click());
generalFiles.addEventListener('change',async()=>{await persistSelectedFiles(generalFiles.files,'general');generalFiles.value='';});
['dragenter','dragover'].forEach(name=>generalDropzone.addEventListener(name,e=>{e.preventDefault();generalDropzone.classList.add('drag-over');}));
['dragleave','drop'].forEach(name=>generalDropzone.addEventListener(name,e=>{e.preventDefault();generalDropzone.classList.remove('drag-over');}));
generalDropzone.addEventListener('drop',e=>persistSelectedFiles(e.dataTransfer.files,'general'));
document.querySelectorAll('[data-attachment-filter]').forEach(button=>button.addEventListener('click',()=>{activeAttachmentFilter=button.dataset.attachmentFilter;document.querySelectorAll('[data-attachment-filter]').forEach(item=>item.classList.toggle('active',item===button));renderAttachmentManager();}));
function renderAttachmentManager(){
  ensureAttachmentState();const list=document.getElementById('all-attachments-list');const groups=[];
  if(activeAttachmentFilter==='all'||activeAttachmentFilter==='general')groups.push({title:'Documentos gerais',subtitle:`${state.generalAttachments.length} arquivo(s)`,items:state.generalAttachments});
  getReportTransactions().filter(item=>activeAttachmentFilter==='all'||item.type===activeAttachmentFilter).forEach(item=>{if((item.attachments||[]).length)groups.push({title:item.description,subtitle:`${item.type==='entrada'?'Entrada':'Despesa'} • ${new Date(item.date+'T00:00:00').toLocaleDateString('pt-BR')}`,items:item.attachments});});
  const visible=groups.filter(group=>group.items.length);
  list.innerHTML=visible.length?visible.map(group=>`<section class="attachment-manager-group"><header class="attachment-manager-title"><strong>${escapeHtml(group.title)}</strong><small>${escapeHtml(group.subtitle)}</small></header>${group.items.map(meta=>attachmentItemHtml(meta,'manager')).join('')}</section>`).join(''):'<div class="attachment-empty">Nenhum anexo encontrado para este filtro.</div>';
}

const previewModal=document.getElementById('preview-modal');
function previewRows(items, type){
  if(!items.length) return `<tr><td colspan="5" class="report-empty">Nenhum lançamento registrado.</td></tr>`;
  return items.map(t=>`<tr>
    <td>${new Date(t.date+'T00:00:00').toLocaleDateString('pt-BR')}</td>
    <td><strong>${escapeHtml(t.description)}</strong></td>
    <td>${escapeHtml(t.category||'—')}</td>
    <td>${escapeHtml(t.method||'—')}</td>
    <td class="report-value">${brl(t.value)}</td>
  </tr>`).join('');
}
function buildPreview(){
  const reportTransactions=getReportTransactions();
  const entries=reportTransactions.filter(t=>t.type==='entrada');
  const expenses=reportTransactions.filter(t=>t.type==='saida');
  const totalIn=entries.reduce((s,t)=>s+t.value,0);
  const totalOut=expenses.reduce((s,t)=>s+t.value,0);
  const finalBalance=state.previousBalance+totalIn-totalOut;
  const user=getFallbackUser();
  const generatedAt=new Date().toLocaleString('pt-BR');
  document.getElementById('preview-content').innerHTML=`
    <div class="report-document">
      <header class="report-header">
        <div class="report-brand">
          <img class="report-brand-logo" src="assets/logo-ibpv.png" alt="Igreja Batista Palavra da Vida" />
        </div>
        <div class="report-heading">
          <span>RELATÓRIO FINANCEIRO</span>
          <h1>Relatório Financeiro</h1>
          <p>${escapeHtml(formatReportPeriod())}</p>
        </div>
      </header>

      <section class="report-meta">
        <div><span>Saldo anterior</span><strong>${brl(state.previousBalance)}</strong></div>
        <div><span>Periodicidade</span><strong>${escapeHtml(state.frequency)}</strong></div>
        <div><span>Período</span><strong>${escapeHtml(formatReportPeriod())}</strong></div>
        <div><span>Responsável</span><strong>${escapeHtml(user?.name||'Tesouraria')}</strong></div>
        <div><span>Gerado em</span><strong>${generatedAt}</strong></div>
      </section>

      <section class="report-section report-section-entry">
        <div class="report-section-title"><span class="report-section-icon">↓</span><strong>Entradas</strong></div>
        <table class="report-table">
          <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Forma de recebimento</th><th>Valor</th></tr></thead>
          <tbody>${previewRows(entries,'entrada')}</tbody>
          <tfoot><tr><td colspan="4">Total de entradas</td><td>${brl(totalIn)}</td></tr></tfoot>
        </table>
      </section>

      <section class="report-section report-section-expense">
        <div class="report-section-title"><span class="report-section-icon">↑</span><strong>Despesas</strong></div>
        <table class="report-table">
          <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Forma de pagamento</th><th>Valor</th></tr></thead>
          <tbody>${previewRows(expenses,'saida')}</tbody>
          <tfoot><tr><td colspan="4">Total de despesas</td><td>${brl(totalOut)}</td></tr></tfoot>
        </table>
      </section>

      <section class="report-summary-strip">
        <div><span>Saldo anterior</span><strong>${brl(state.previousBalance)}</strong></div>
        <span class="report-operator">+</span>
        <div class="positive"><span>Entradas</span><strong>${brl(totalIn)}</strong></div>
        <span class="report-operator">−</span>
        <div class="negative"><span>Despesas</span><strong>${brl(totalOut)}</strong></div>
        <span class="report-operator">=</span>
        <div class="final"><span>Saldo final</span><strong>${brl(finalBalance)}</strong></div>
      </section>

      <footer class="report-footer">
        <p>“Tudo deve ser feito de forma decente e organizada.”</p>
        <strong>1 Coríntios 14:40</strong>
      </footer>
    </div>`;
  previewModal.showModal();
}
document.getElementById('preview-report').onclick=buildPreview;document.getElementById('close-preview').onclick=()=>previewModal.close();
function waitForReportImages(report){
  return Promise.all([...report.querySelectorAll('img')].map(image=>{
    if(image.complete&&image.naturalWidth>0)return Promise.resolve();
    return new Promise(resolve=>{
      image.addEventListener('load',resolve,{once:true});
      image.addEventListener('error',resolve,{once:true});
    });
  }));
}

async function printReport(){
  let source=document.querySelector('#preview-content .report-document');
  if(!source){
    buildPreview();
    source=document.querySelector('#preview-content .report-document');
  }
  if(!source)return;
  document.body.classList.add('is-printing-report');
  try{
    if(document.fonts?.ready)await document.fonts.ready;
    await waitForReportImages(source);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    window.print();
  }finally{
    document.body.classList.remove('is-printing-report');
  }
}
document.getElementById('print-report').onclick=printReport;
document.getElementById('publish-report').onclick=async()=>{
  saveState();
  try{
    if(backend.configured){
      const items=getReportTransactions();const totalIncome=items.filter(t=>t.type==='entrada').reduce((sum,t)=>sum+t.value,0);const totalExpense=items.filter(t=>t.type==='saida').reduce((sum,t)=>sum+t.value,0);const {startDate,endDate}=currentPeriodDates();
      const periodTypes={Mensal:'mensal',Bimestral:'bimestral',Trimestral:'trimestral',Semestral:'semestral',Anual:'anual'};
      await backend.publishReport({title:`Relatório Financeiro — ${formatReportPeriod()}`,periodType:periodTypes[state.frequency]||'personalizado',startDate,endDate,totalIncome,totalExpense,openingBalance:state.previousBalance,closingBalance:state.previousBalance+totalIncome-totalExpense},currentUser.id);
    }else{
      const list=JSON.parse(localStorage.getItem(publishedKey)||'[]');const report={id:crypto.randomUUID(),title:`Relatório Financeiro — ${formatReportPeriod()}`,year:state.year,frequency:state.frequency,period:state.period,publishedAt:new Date().toLocaleDateString('pt-BR'),snapshot:structuredClone(state)};list.unshift(report);localStorage.setItem(publishedKey,JSON.stringify(list));
    }
    alert('Relatório publicado para a área dos membros.');
  }catch(error){console.error(error);alert(error.message||'Não foi possível publicar o relatório.');}
};
async function renderPublishedReports(){
  const grid=document.getElementById('published-reports');
  try{
    const list=backend.configured?await backend.publishedReports():JSON.parse(localStorage.getItem(publishedKey)||'[]');
    if(!list.length){grid.innerHTML='<div class="report-card"><span class="pdf-icon">📄</span><h3>Nenhum relatório publicado</h3><p>Os documentos publicados pela Tesouraria aparecerão aqui.</p></div>';return;}
    grid.innerHTML=list.map(r=>`<article class="report-card"><span class="pdf-icon">📄</span><h3>${escapeHtml(r.title)}</h3><p>${escapeHtml(r.period_type||r.frequency)} • Publicado em ${new Date(r.published_at||r.publishedAt).toLocaleDateString('pt-BR')}</p>${r.snapshot?`<button class="primary-btn" data-open-published="${r.id}">Visualizar relatório</button>`:''}</article>`).join('');
  }catch(error){console.error(error);grid.innerHTML='<div class="report-card"><h3>Não foi possível carregar os relatórios</h3><p>Verifique sua conexão e tente novamente.</p></div>';}
}
document.addEventListener('click',e=>{const open=e.target.closest('[data-open-published]');if(!open)return;const report=JSON.parse(localStorage.getItem(publishedKey)||'[]').find(r=>r.id===open.dataset.openPublished);if(!report)return;const old=state;state=report.snapshot;buildPreview();state=old;});

// Apresentação PowerPoint dinâmica para a assembleia

const usersModal=document.getElementById('users-modal');
const userEditModal=document.getElementById('user-edit-modal');
function renderUsers(){const list=document.getElementById('users-list');const users=getUsers();list.innerHTML=users.map(u=>`<div class="user-row"><div class="user-avatar">${escapeHtml(u.name.charAt(0).toUpperCase())}</div><div><strong>${escapeHtml(u.name)}</strong><span>${escapeHtml(u.role)}</span></div><div><span class="user-status ${u.active?'active':'inactive'}">${u.active?'Ativo':'Inativo'}</span><small>${u.lastAccess?'Último acesso: '+new Date(u.lastAccess).toLocaleString('pt-BR'):'Nunca acessou'}</small></div><div class="user-actions"><button class="mini-btn" data-user-edit="${u.id}" title="Editar usuário">✎</button><button class="mini-btn delete" data-user-delete="${u.id}" title="Excluir usuário"><svg viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-.7 11H7.7L7 9Zm3 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z"/></svg></button></div></div>`).join('')||'<div class="empty-state">Nenhum usuário cadastrado.</div>'; }
function openUserEditor(user=null){document.getElementById('user-edit-form').reset();document.getElementById('user-edit-id').value=user?.id||'';document.getElementById('user-edit-title').textContent=user?'Editar usuário':'Novo usuário';document.getElementById('user-edit-name').value=user?.name||'';document.getElementById('user-edit-role').value=user?.role||'Tesouraria';document.getElementById('user-edit-status').value=String(user?.active??true);userEditModal.showModal();}
document.getElementById('users-nav').onclick=()=>{if(backend.configured){alert('Por segurança, crie contas em Authentication → Users no Supabase e altere o perfil na tabela profiles.');return;}renderUsers();usersModal.showModal();};
document.getElementById('profile-menu-btn').onclick=()=>{if(backend.configured){alert(`${currentUser?.name||'Usuário'}\nPerfil: ${currentUser?.role||'—'}`);return;}const u=currentUser;if(u)openUserEditor(u);};
document.getElementById('close-users').onclick=()=>usersModal.close();
document.getElementById('new-user-btn').onclick=()=>openUserEditor();
document.getElementById('close-user-edit').onclick=()=>userEditModal.close();
document.getElementById('cancel-user-edit').onclick=()=>userEditModal.close();
document.getElementById('user-edit-form').addEventListener('submit',e=>{e.preventDefault();const users=getUsers();const id=document.getElementById('user-edit-id').value;const name=document.getElementById('user-edit-name').value.trim();const password=document.getElementById('user-edit-password').value;const role=document.getElementById('user-edit-role').value;const active=document.getElementById('user-edit-status').value==='true';if(!name){return;}let user=users.find(u=>u.id===id);if(user){user.name=name;user.role=role;user.active=active;if(password){if(password.length<4){alert('A senha deve ter pelo menos 4 caracteres.');return;}user.password=password;}if(currentUser?.id===user.id)currentUser=user;}else{if(password.length<4){alert('Informe uma senha com pelo menos 4 caracteres.');return;}user={id:crypto.randomUUID(),name,password,role,active,lastAccess:null};users.push(user);}saveUsers(users);userEditModal.close();renderUsers();renderAdmin();});
document.addEventListener('click',e=>{const edit=e.target.closest('[data-user-edit]');if(edit){const u=getUsers().find(x=>x.id===edit.dataset.userEdit);if(u)openUserEditor(u);}const del=e.target.closest('[data-user-delete]');if(del){const users=getUsers();if(users.length<=1){alert('É necessário manter pelo menos um usuário cadastrado.');return;}const u=users.find(x=>x.id===del.dataset.userDelete);if(u&&confirm(`Deseja excluir o usuário ${u.name}?`)){saveUsers(users.filter(x=>x.id!==u.id));renderUsers();}}});

const presentationModal=document.getElementById('presentation-modal');
function openPresentationModal(){presentationModal.showModal();}
document.getElementById('generate-pptx').addEventListener('click',openPresentationModal);
document.getElementById('presentation-nav').addEventListener('click',openPresentationModal);
document.getElementById('close-presentation').addEventListener('click',()=>presentationModal.close());
document.getElementById('cancel-presentation').addEventListener('click',()=>presentationModal.close());

function aggregateBy(items,key='category'){
  const result={};
  items.forEach(item=>{const label=(item[key]||'Outros').trim()||'Outros';result[label]=(result[label]||0)+Number(item.value||0);});
  return Object.entries(result).sort((a,b)=>b[1]-a[1]);
}
function groupByWeek(items){
  const weeks=[0,0,0,0,0];
  items.forEach(item=>{const day=new Date(item.date+'T00:00:00').getDate();weeks[Math.min(4,Math.floor((day-1)/7))]+=Number(item.value||0);});
  return weeks;
}
function cleanFileName(value){return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/-+/g,'-');}

function addPresentationHeader(slide,pptx,title,subtitle=''){
  slide.background={color:'F7F3ED'};
  slide.addShape(pptx.ShapeType.rect,{x:0,y:0,w:13.333,h:.18,fill:{color:'8B4B27'},line:{color:'8B4B27'}});
  slide.addImage({data:window.IBPV_LOGO_DATA,x:.52,y:.25,w:1.75,h:1.13,transparency:0});
  slide.addText(title,{x:2.55,y:.42,w:10.15,h:.45,fontFace:'Aptos Display',fontSize:24,bold:true,color:'3B261D',margin:0});
  if(subtitle)slide.addText(subtitle,{x:2.57,y:.92,w:9.8,h:.28,fontFace:'Aptos',fontSize:10.5,color:'76665B',margin:0});
  slide.addShape(pptx.ShapeType.line,{x:.45,y:1.42,w:12.35,h:0,line:{color:'DCCDC2',width:1}});
}
function addPresentationFooter(slide,pptx,index){
  slide.addShape(pptx.ShapeType.line,{x:.45,y:7.12,w:12.35,h:0,line:{color:'DCCDC2',width:1}});
  slide.addText('Igreja Batista Palavra da Vida • Relatório Financeiro',{x:.5,y:7.2,w:8.5,h:.18,fontFace:'Aptos',fontSize:8,color:'77685D',margin:0});
  slide.addText(String(index).padStart(2,'0'),{x:12.15,y:7.18,w:.55,h:.2,fontFace:'Aptos',fontSize:8,bold:true,color:'8B4B27',align:'right',margin:0});
}
function addMetricCard(slide,pptx,x,y,w,label,value,accent){
  slide.addShape(pptx.ShapeType.roundRect,{x,y,w,h:1.35,rectRadius:.08,fill:{color:'FFFFFF'},line:{color:'E0D5CC',width:1},shadow:{type:'outer',color:'A68D7C',opacity:.12,blur:1,angle:45,distance:1}});
  slide.addShape(pptx.ShapeType.rect,{x,y,w:.08,h:1.35,fill:{color:accent},line:{color:accent}});
  slide.addText(label.toUpperCase(),{x:x+.25,y:y+.22,w:w-.45,h:.22,fontFace:'Aptos',fontSize:9,bold:true,color:'796B61',charSpacing:1,margin:0});
  slide.addText(value,{x:x+.25,y:y+.62,w:w-.45,h:.42,fontFace:'Aptos Display',fontSize:21,bold:true,color:accent,margin:0,fit:'shrink'});
}
function addTableSlide(pptx,title,subtitle,items,type,startIndex){
  const perSlide=10;
  const pages=Math.max(1,Math.ceil(items.length/perSlide));
  let slideNumber=startIndex;
  for(let page=0;page<pages;page++){
    const slide=pptx.addSlide();
    addPresentationHeader(slide,pptx,title,pages>1?`${subtitle} • Página ${page+1} de ${pages}`:subtitle);
    const rows=items.slice(page*perSlide,(page+1)*perSlide);
    const data=[
      [{text:'Data'},{text:'Descrição'},{text:'Categoria'},{text:type==='entrada'?'Recebimento':'Pagamento'},{text:'Valor'}],
      ...rows.map(item=>[
        {text:new Date(item.date+'T00:00:00').toLocaleDateString('pt-BR')},
        {text:item.description},
        {text:item.category||'—'},
        {text:item.method||'—'},
        {text:brl(item.value)}
      ])
    ];
    slide.addTable(data,{x:.55,y:1.65,w:12.2,h:4.95,border:{type:'solid',color:'DED4CC',pt:.6},fill:'FFFFFF',color:'3C302A',fontFace:'Aptos',fontSize:10,margin:.08,rowH:.38,colW:[1.15,4,2.1,2.7,1.55],bold:false,autoFit:false,
      paraSpaceAfterPt:0,
      valign:'mid',
      fillHeader:'EFE4DB'});
    addPresentationFooter(slide,pptx,slideNumber++);
  }
  return slideNumber;
}

async function generatePowerPoint(){
  if(typeof PptxGenJS==='undefined'){alert('O módulo de PowerPoint não foi carregado. Reabra o programa e tente novamente.');return;}
  const button=document.getElementById('download-presentation');
  const oldText=button.textContent;button.disabled=true;button.textContent='Gerando apresentação...';
  try{
    const duration=Number(document.querySelector('input[name="presentation-duration"]:checked').value);
    const reportTransactions=getReportTransactions();
    const entries=reportTransactions.filter(t=>t.type==='entrada').sort((a,b)=>a.date.localeCompare(b.date));
    const expenses=reportTransactions.filter(t=>t.type==='saida').sort((a,b)=>a.date.localeCompare(b.date));
    const totalIn=entries.reduce((sum,item)=>sum+Number(item.value||0),0);
    const totalOut=expenses.reduce((sum,item)=>sum+Number(item.value||0),0);
    const finalBalance=Number(state.previousBalance||0)+totalIn-totalOut;
    const entryCategories=aggregateBy(entries);
    const expenseCategories=aggregateBy(expenses);
    const user=getFallbackUser();
    const pptx=new PptxGenJS();
    pptx.layout='LAYOUT_WIDE';
    pptx.author='Igreja Batista Palavra da Vida';
    pptx.company='Igreja Batista Palavra da Vida';
    pptx.subject='Relatório financeiro da assembleia';
    pptx.title=`Relatório Financeiro — ${formatReportPeriod()}`;
    pptx.lang='pt-BR';
    pptx.theme={headFontFace:'Aptos Display',bodyFontFace:'Aptos',lang:'pt-BR'};
    pptx.defineSlideMaster({title:'IBPV',background:{color:'F7F3ED'},objects:[]});
    let slideIndex=1;

    // Capa
    let slide=pptx.addSlide();
    slide.background={color:'F8F5F1'};
    slide.addShape(pptx.ShapeType.rect,{x:0,y:0,w:13.333,h:.18,fill:{color:'8B4B27'},line:{color:'8B4B27'}});
    slide.addShape(pptx.ShapeType.arc,{x:8.7,y:-2.1,w:6.4,h:6.4,adjustPoint:.28,rotate:18,fill:{color:'D8B79F',transparency:35},line:{color:'D8B79F',transparency:100}});
    slide.addImage({data:window.IBPV_LOGO_DATA,x:.72,y:.52,w:3.15,h:2.05,transparency:0});
    slide.addText('RELATÓRIO FINANCEIRO',{x:.82,y:3.02,w:8.8,h:.62,fontFace:'Aptos Display',fontSize:32,bold:true,color:'3B261D',margin:0,charSpacing:.8});
    slide.addText(`${formatReportPeriod()}`,{x:.84,y:3.78,w:6.8,h:.48,fontFace:'Aptos Display',fontSize:23,bold:true,color:'8B4B27',margin:0});
    slide.addText('Apresentação para a Assembleia da Igreja',{x:.84,y:4.43,w:6.5,h:.35,fontFace:'Aptos',fontSize:14,color:'66564D',margin:0});
    slide.addShape(pptx.ShapeType.line,{x:.84,y:5.13,w:3.1,h:0,line:{color:'CDA98F',width:2}});
    slide.addText(`Responsável: ${user?.name||'Tesouraria / Conselho Fiscal'} • ${user?.role||''}`,{x:.84,y:6.62,w:7.4,h:.22,fontFace:'Aptos',fontSize:9.5,color:'78695F',margin:0});
    slideIndex++;

    // Resumo financeiro
    slide=pptx.addSlide();addPresentationHeader(slide,pptx,'Resumo financeiro',`${state.frequency} • ${formatReportPeriod()}`);
    addMetricCard(slide,pptx,.62,1.78,2.8,'Saldo anterior',brl(state.previousBalance),'704128');
    addMetricCard(slide,pptx,3.72,1.78,2.8,'Entradas',brl(totalIn),'258A50');
    addMetricCard(slide,pptx,6.82,1.78,2.8,'Despesas',brl(totalOut),'C84545');
    addMetricCard(slide,pptx,9.92,1.78,2.8,'Saldo final',brl(finalBalance),'3B261D');
    slide.addChart(pptx.ChartType.bar,[{name:'Movimentação',labels:['Entradas','Despesas'],values:[totalIn,totalOut]}],{x:.72,y:3.55,w:5.8,h:2.75,catAxisLabelFontSize:11,valAxisLabelFontSize:9,showLegend:false,showTitle:false,showValue:true,showCatName:false,chartColors:['8B4B27','C84545'],showValue:false,gridLine:{color:'E6DCD4',width:1},showBorder:false});
    slide.addText(finalBalance>=0?'O período encerrou com saldo positivo.':'O período encerrou com saldo negativo.',{x:7.05,y:3.72,w:5.2,h:.42,fontFace:'Aptos Display',fontSize:21,bold:true,color:finalBalance>=0?'258A50':'C84545',margin:0});
    slide.addText(`As entradas totalizaram ${brl(totalIn)} e as despesas somaram ${brl(totalOut)}. O saldo disponível para o próximo período é ${brl(finalBalance)}.`,{x:7.05,y:4.38,w:5.25,h:1.15,fontFace:'Aptos',fontSize:14,color:'574A42',breakLine:false,margin:0.02,fit:'shrink'});
    addPresentationFooter(slide,pptx,slideIndex++);

    // Distribuição de entradas
    slide=pptx.addSlide();addPresentationHeader(slide,pptx,'De onde vieram as entradas?',`Distribuição por categoria • Total ${brl(totalIn)}`);
    if(entryCategories.length){
      slide.addChart(pptx.ChartType.doughnut,[{name:'Entradas',labels:entryCategories.map(x=>x[0]),values:entryCategories.map(x=>x[1])}],{x:.55,y:1.62,w:6.1,h:4.95,holeSize:55,showLegend:true,legendPos:'b',showPercent:true,showTitle:false,showValue:false,chartColors:['8B4B27','D79562','3B261D','B98562','6A7C59','D1AD8B'],showBorder:false});
      entryCategories.slice(0,6).forEach(([label,value],i)=>{const y=1.8+i*.72;slide.addText(label,{x:7.1,y,w:3.4,h:.25,fontSize:12,bold:true,color:'3B261D',margin:0});slide.addText(brl(value),{x:10.45,y,w:1.85,h:.25,fontSize:12,bold:true,color:'258A50',align:'right',margin:0});slide.addShape(pptx.ShapeType.line,{x:7.1,y:y+.35,w:5.2,h:0,line:{color:'E4D8CF',width:.7}});});
    }else slide.addText('Nenhuma entrada foi registrada neste período.',{x:1,y:3,w:11.3,h:.6,fontSize:22,bold:true,color:'796A61',align:'center'});
    addPresentationFooter(slide,pptx,slideIndex++);

    // Distribuição de despesas
    slide=pptx.addSlide();addPresentationHeader(slide,pptx,'Onde os recursos foram aplicados?',`Distribuição das despesas por categoria • Total ${brl(totalOut)}`);
    if(expenseCategories.length){
      slide.addChart(pptx.ChartType.doughnut,[{name:'Despesas',labels:expenseCategories.map(x=>x[0]),values:expenseCategories.map(x=>x[1])}],{x:.55,y:1.62,w:6.1,h:4.95,holeSize:55,showLegend:true,legendPos:'b',showPercent:true,showTitle:false,showValue:false,chartColors:['C84545','8B4B27','D79562','3B261D','B98562','7B6A60'],showBorder:false});
      expenseCategories.slice(0,6).forEach(([label,value],i)=>{const y=1.8+i*.72;slide.addText(label,{x:7.1,y,w:3.4,h:.25,fontSize:12,bold:true,color:'3B261D',margin:0});slide.addText(brl(value),{x:10.45,y,w:1.85,h:.25,fontSize:12,bold:true,color:'C84545',align:'right',margin:0});slide.addShape(pptx.ShapeType.line,{x:7.1,y:y+.35,w:5.2,h:0,line:{color:'E4D8CF',width:.7}});});
    }else slide.addText('Nenhuma despesa foi registrada neste período.',{x:1,y:3,w:11.3,h:.6,fontSize:22,bold:true,color:'796A61',align:'center'});
    addPresentationFooter(slide,pptx,slideIndex++);

    if(duration>=10){
      // Maiores despesas
      slide=pptx.addSlide();addPresentationHeader(slide,pptx,'Maiores despesas do período','Itens de maior impacto financeiro');
      const top=expenses.slice().sort((a,b)=>b.value-a.value).slice(0,8);
      if(top.length){slide.addChart(pptx.ChartType.bar,[{name:'Valor',labels:top.map(x=>x.description),values:top.map(x=>x.value)}],{x:.65,y:1.72,w:12,h:4.9,barDir:'bar',catAxisLabelFontSize:10,valAxisLabelFontSize:9,showLegend:false,showTitle:false,showValue:true,chartColors:['8B4B27'],gridLine:{color:'E7DDD5',width:1},showBorder:false});}
      else slide.addText('Nenhuma despesa registrada.',{x:1,y:3,w:11.3,h:.5,fontSize:22,bold:true,color:'796A61',align:'center'});
      addPresentationFooter(slide,pptx,slideIndex++);

      // Evolução semanal
      const flowData=state.frequency==='Mensal'
        ?{labels:['Semana 1','Semana 2','Semana 3','Semana 4','Semana 5'],entries:groupByWeek(entries),expenses:groupByWeek(expenses)}
        :aggregateByMonth(reportTransactions);
      slide=pptx.addSlide();addPresentationHeader(slide,pptx,'Movimentação ao longo do período',state.frequency==='Mensal'?'Entradas e despesas agrupadas por semana':'Entradas e despesas agrupadas por mês');
      slide.addChart(pptx.ChartType.line,[{name:'Entradas',labels:flowData.labels,values:flowData.entries},{name:'Despesas',labels:flowData.labels,values:flowData.expenses}],{x:.72,y:1.75,w:11.9,h:4.75,showLegend:true,legendPos:'b',showTitle:false,showValue:false,chartColors:['258A50','C84545'],lineSize:3,showMarker:true,catAxisLabelFontSize:10,valAxisLabelFontSize:9,gridLine:{color:'E7DDD5',width:1},showBorder:false});
      addPresentationFooter(slide,pptx,slideIndex++);
    }

    if(duration>=20){
      slideIndex=addTableSlide(pptx,'Entradas detalhadas',`${entries.length} lançamento(s) registrado(s)`,entries,'entrada',slideIndex);
      slideIndex=addTableSlide(pptx,'Despesas detalhadas',`${expenses.length} lançamento(s) registrado(s)`,expenses,'saida',slideIndex);
    }

    // Encerramento — fundo claro e contraste alto
    slide=pptx.addSlide();slide.background={color:'F8F5F1'};
    slide.addShape(pptx.ShapeType.rect,{x:0,y:0,w:13.333,h:.18,fill:{color:'8B4B27'},line:{color:'8B4B27'}});
    slide.addShape(pptx.ShapeType.arc,{x:-2.2,y:4.45,w:5.8,h:5.8,adjustPoint:.28,rotate:205,fill:{color:'E5CBB8',transparency:48},line:{color:'E5CBB8',transparency:100}});
    slide.addImage({data:window.IBPV_LOGO_DATA,x:4.75,y:.55,w:3.82,h:2.48});
    slide.addText('TRANSPARÊNCIA, RESPONSABILIDADE E FIDELIDADE',{x:1.05,y:3.45,w:11.25,h:.52,fontFace:'Aptos Display',fontSize:22,bold:true,color:'3B261D',align:'center',margin:0});
    slide.addShape(pptx.ShapeType.line,{x:5.15,y:4.22,w:3.05,h:0,line:{color:'CDA98F',width:2}});
    slide.addText('“Pois estamos tendo o cuidado de fazer o que é correto, não apenas aos olhos do Senhor, mas também aos olhos dos homens.”',{x:2.05,y:4.72,w:9.25,h:.9,fontFace:'Aptos',fontSize:14,italic:true,color:'5E5048',align:'center',valign:'mid',margin:0});
    slide.addText('2 Coríntios 8:21',{x:4.8,y:5.82,w:3.7,h:.3,fontFace:'Aptos',fontSize:12,bold:true,color:'8B4B27',align:'center',margin:0});
    slide.addText(`${state.frequency} • ${formatReportPeriod()}`,{x:3.2,y:6.62,w:6.9,h:.22,fontFace:'Aptos',fontSize:9.5,color:'78695F',align:'center',margin:0});

    const fileName=`Relatorio-Financeiro-IBPV-${getPeriodFileLabel()}.pptx`;
    await pptx.writeFile({fileName});
    presentationModal.close();
  }catch(error){console.error(error);alert('Não foi possível gerar a apresentação. Detalhes: '+error.message);}
  finally{button.disabled=false;button.textContent=oldText;}
}
document.getElementById('download-presentation').addEventListener('click',generatePowerPoint);

ensureAttachmentState();saveState();
window.addEventListener('beforeunload',()=>unsubscribeAuthState(),{once:true});
bootstrapApplication();
