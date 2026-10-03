/* ================= ESRO Admin · dados reais (db) ================= */
const BRL = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const fmt = v => BRL.format(+v||0);
const CH = {
  site:{label:'Site',long:'Site / E-commerce',cls:'b-site',icon:'globe',dot:'site'},
  whatsapp:{label:'WhatsApp',long:'WhatsApp',cls:'b-wa',icon:'message-circle',dot:'wa'},
  instagram:{label:'Instagram',long:'Instagram Direct',cls:'b-ig',icon:'instagram',dot:'ig'}
};
const STATUS = [
  {k:'novo',l:'Novo',c:'var(--site)'},
  {k:'orcamento',l:'Orçamento enviado',c:'var(--warn)'},
  {k:'producao',l:'Em produção',c:'var(--primary)'},
  {k:'arte',l:'Aguardando aprovação de arte',c:'var(--ig)'},
  {k:'enviado',l:'Enviado',c:'var(--sage)'},
  {k:'concluido',l:'Concluído',c:'var(--ok)'}
];
const LEAD_ST = [['aberto','Em conversa','b-warn'],['orcamento','Orçamento enviado','b-primary'],['fechado','Virou pedido','b-ok'],['perdido','Não fechou','b-neutral']];
const FILE_ST = {recebido:['b-neutral','Recebido do cliente'],aguardando:['b-warn','Aguardando aprovação'],aprovada:['b-ok','Aprovada'],ajuste:['b-primary','Ajuste pedido']};
const CAT_SHORT = {'01':'Assessoria','02':'Materiais','03':'Planejamentos','04':'Documentos','05':'Resumos','06':'Artes digitais','07':'Papelaria','08':'Combos'};
const PEDAGOGICAL = ['01','02','03','04','05','08'];
const stLabel = k => (STATUS.find(s=>s.k===k)||STATUS[0]).l;
const MONTHS = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const monthKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const shiftMonth = (d,n) => new Date(d.getFullYear(), d.getMonth()+n, 1);

/* ---------- Estado ---------- */
const S = { view:'overview', ch:'todos', q:'', orderMode:'kanban', lead:null, showChat:false, compose:'', pix:null, pixOpen:false, notifOpen:false,
  quote:[], quoteClient:'', quotePhone:'', ready:false, dbOk:null, canWrite:true, artOrder:'', inboxTab:'live', stockTab:'todos', cTab:'todos', cMode:'list', cOrigin:'', cashTab:'lanc', cashM:'', cashAcc:'' };
const D = { orders:[], leads:[], catalog:[], settings:{}, stock:[], clients:[], cash:[], accounts:[] };
let DB=null, ASSETS=null, DL=null, ME=null;
try{ const m=localStorage.getItem('esro-orderMode'); if(m) S.orderMode=m; const c=localStorage.getItem('esro-clientMode'); if(c) S.cMode=c; }catch(e){}

const NAV = [
 ['overview','layout-dashboard','Visão Geral'],
 ['orders','shopping-bag','Pedidos Unificados'],
 ['clients','users','Clientes'],
 ['catalog','book-open','Catálogo & Serviços'],
 ['stock','package','Estoque'],
 ['cash','wallet','Fluxo de Caixa'],
 ['inbox','messages-square','Inbox Multicanal'],
 ['arts','palette','Personalização & Arquivos'],
 ['reports','trending-up','Relatórios & Métricas'],
 ['settings','settings','Configurações & API']
];

const $ = s => document.querySelector(s);
const esc = s => String(s??'').replace(/[&<>"'`]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c]));
const safeUrl = u => { const t=String(u||'').trim(); return /^https?:\/\//i.test(t)?t:''; };
const icons = () => { if(window.lucide) lucide.createIcons({attrs:{'stroke-width':1.6}}); };
const chBadge = (ch, extra) => CH[ch] ? `<span class="badge ${CH[ch].cls}"><i data-lucide="${CH[ch].icon}"></i>${esc(extra||CH[ch].label)}</span>` : '';
const payBadge = s => `<span class="badge ${s==='Pago'?'b-ok':s==='Sinal pago'?'b-primary':'b-warn'}">${esc(s||'Aguardando')}</span>`;
const inCh = o => S.ch==='todos' || o.ch===S.ch;
const digits = s => String(s||'').replace(/\D/g,'');
const dshort = iso => iso ? new Date(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) : '';
const dtime = iso => iso ? new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
const initials = n => esc(String(n||'?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase());
function matchQ(o){ if(!S.q) return true; const t=S.q.toLowerCase(), dq=digits(S.q);
  return [o.client,o.name,o.contact,o.ref,o.item,o.subject].some(x=>x&&String(x).toLowerCase().includes(t)) || (o.num&&String(o.num)===t.replace('#','')) || (dq.length>=4 && digits(o.contact).includes(dq)); }
const openOrders = () => D.orders.filter(o=>o.status!=='concluido');
const openLeads = () => D.leads.filter(l=>l.status==='aberto'||l.status==='orcamento');
const allFiles = () => D.orders.flatMap(o=>(o.files||[]).map((f,i)=>({...f,i,order:o})));
const catItems = () => D.catalog.flatMap(c=>(c.items||[]).map(it=>({...it,catN:c.n,cat:c.t,kind:c.kind})));
const priceTxt = it => !it.min && !it.max ? 'sob consulta' : it.min===it.max ? fmt(it.min) : `${fmt(it.min)} a ${fmt(it.max)}`;

function toast(msg,err){ const r=$('#toastRoot'); r.innerHTML=`<div class="toast" role="status"><i data-lucide="${err?'alert-circle':'check'}"></i>${esc(msg)}</div>`; icons(); clearTimeout(toast.t); toast.t=setTimeout(()=>r.innerHTML='',2800); }
async function copy(text){ try{ await navigator.clipboard.writeText(text); toast('Copiado'); }catch(e){ const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy'); toast('Copiado');}catch(_){toast('Selecione e copie o texto manualmente',1);} ta.remove(); } }
function errMsg(e){ const c=e&&e.code; if(c==='invalid_argument'||c==='not_granted') return 'Você não tem permissão para alterar este painel.'; if(c==='quota_exceeded') return 'O armazenamento do painel está cheio. Apague registros antigos.'; if(c==='too_large') return 'Arquivo grande demais (máx. 20 MB).'; if(c==='unsupported_type') return 'Formato não aceito. Use PNG, JPG, WEBP, SVG, PDF, CSV ou TXT.'; if(c==='declined') return 'Download cancelado.'; return 'Não foi possível salvar. Tente de novo.'; }
async function write(fn, ok){ if(!DB){ toast('Banco de dados indisponível nesta visualização',1); return false; } try{ await fn(); if(ok) toast(ok); return true; }catch(e){ if(e&&e.code==='unavailable'){ try{ await new Promise(r=>setTimeout(r,600+Math.random()*600)); await fn(); if(ok) toast(ok); return true; }catch(e2){ e=e2; } } if(e&&e.code==='invalid_argument') S.canWrite=false; toast(errMsg(e),1); return false; } }

/* ---------- Registro de atividades e backup ---------- */
function logAct(act, detail){ if(!DB||!S.canWrite) return; try{ DB.collection('audit').add({at:new Date().toISOString(),uid:ME||'',act,detail:String(detail||'').slice(0,200)}).catch(()=>{}); }catch(_){} }
const backupAge=()=>{ const b=D.settings.lastBackup; if(!b) return null; return Math.floor((new Date(today())-new Date(b))/864e5); };
const hasData=()=>D.orders.length+D.clients.length+D.cash.length+D.stock.length>0;
async function openAudit(){
  $('#modalRoot').innerHTML=`<div class="overlay" data-close><div class="modal" role="dialog" aria-modal="true" aria-labelledby="au" style="width:min(640px,100%)">
    <div class="modal-head"><div><h3 id="au">Registro de atividades</h3><small style="color:var(--text2)">Exclusões, importações, exportações e mudanças de configuração.</small></div><button class="close" data-x aria-label="Fechar"><i data-lucide="x"></i></button></div>
    <div class="modal-body" style="display:block"><div id="auList" class="list"><p class="hint">Carregando…</p></div></div>
    <div class="modal-foot"><button class="btn" data-x>Fechar</button></div></div></div>`; icons();
  try{ const snap=await DB.collection('audit').orderBy('at','desc').limit(60).get(); const rows=snap.docs.map(d=>d.data()); const el=$('#auList'); if(!el) return;
    el.innerHTML=rows.length?rows.map(r=>`<div class="row"><div class="grow"><b>${esc(r.act)}</b><small style="white-space:normal">${esc(r.detail||'')}</small></div><small style="color:var(--text2);text-align:right;flex:none">${dtime(r.at)}<br>${r.uid&&ME&&r.uid!==ME?'outra pessoa':'você'}</small></div>`).join(''):'<p class="hint">Nenhuma atividade registrada ainda.</p>'; }
  catch(e){ const el=$('#auList'); if(el) el.innerHTML='<p class="hint">Não foi possível carregar o registro.</p>'; }
}

/* ---------- Backup completo (um arquivo com tudo) ---------- */
const STANDALONE=!!window.ESRO_STANDALONE;   // true quando o painel roda no servidor próprio da ESRO, fora do claude.ai
const BK_COLS=[['orders','Pedidos'],['clients','Clientes'],['leads','Atendimentos'],['stock','Estoque'],['cash','Fluxo de caixa e contas fixas'],['accounts','Contas bancárias'],['catalog','Catálogo']];
const BK_ID=/^[A-Za-z0-9_\-.~:@+]{1,200}$/;
async function backupExport(){
  if(!S.ready){ toast('Aguarde os dados carregarem',1); return; }
  const data={app:'esro-admin',version:1,at:new Date().toISOString(),settings:D.settings,collections:{}};
  for(const [c] of BK_COLS) data.collections[c]=D[c];
  try{ await saveFile(`esro-backup-${today()}.json`,new Blob([JSON.stringify(data)],{type:'application/json'})); toast('Backup salvo'); logAct('Backup completo exportado',BK_COLS.map(([c,l])=>`${D[c].length} ${l.toLowerCase()}`).join(', ').slice(0,190));
    if(S.canWrite&&DB){ const full={...D.settings,lastBackup:today()}; try{ await DB.doc('settings/store').set(full); D.settings=full; }catch(_){} } render(); }
  catch(e){ if(e&&e.code!=='declined') toast(e&&e.code?errMsg(e):'Não foi possível gerar o backup',1); }
}
let BK=null;
async function backupFile(file){
  if(!file) return; if(!DB||!S.canWrite){ toast('Restauração indisponível nesta visualização',1); return; }
  let data; try{ data=JSON.parse(await file.text()); }catch(e){ toast('Este arquivo não é um backup do painel',1); return; }
  if(!data||data.app!=='esro-admin'||typeof data.collections!=='object'){ toast('Este arquivo não é um backup do painel',1); return; }
  const plan={file:file.name,at:data.at,settings:data.settings&&typeof data.settings==='object'?data.settings:null,cols:[]};
  for(const [c,l] of BK_COLS){ const rows=(Array.isArray(data.collections[c])?data.collections[c]:[]).filter(r=>r&&typeof r==='object'&&BK_ID.test(String(r.id||'')));
    const ids=new Set(D[c].map(x=>x.id)); plan.cols.push({c,l,rows,novo:rows.filter(r=>!ids.has(r.id)).length,sub:rows.filter(r=>ids.has(r.id)).length}); }
  BK=plan; const n=plan.cols.reduce((a,x)=>a+x.rows.length,0);
  $('#modalRoot').innerHTML=`<div class="overlay" data-close><div class="modal" role="dialog" aria-modal="true" aria-labelledby="bk" style="width:min(560px,100%)">
    <div class="modal-head"><div><h3 id="bk">Restaurar backup</h3><small style="color:var(--text2);overflow-wrap:anywhere">${esc(plan.file)}${plan.at?' · gerado em '+dtime(plan.at):''}</small></div><button class="close" data-x aria-label="Fechar"><i data-lucide="x"></i></button></div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:10px">
      <div class="list">${plan.cols.map(x=>`<div class="row"><div class="grow"><b>${x.l}</b><small>${x.rows.length} no arquivo</small></div><span class="mini"><b>${x.novo}</b> novo(s)</span><span class="mini"><b>${x.sub}</b> substitui(em)</span></div>`).join('')}
        <div class="row"><div class="grow"><b>Configurações</b><small>PIX, mensagens, saldo inicial</small></div><span class="mini">${plan.settings?'substitui as atuais':'não há no arquivo'}</span></div></div>
      <small style="color:var(--text2)">Os registros com o mesmo código são substituídos pelos do arquivo; os demais continuam como estão. Nada é apagado. Imagens e arquivos anexados não fazem parte do backup.</small>
    </div>
    <div class="modal-foot"><button class="btn" data-x>Cancelar</button>${n||plan.settings?`<button class="btn primary" data-bkgo><i data-lucide="upload"></i>Restaurar ${n} registro(s)</button>`:''}</div></div></div>`;
  icons();
}
async function backupApply(btn){
  const plan=BK; if(!plan||!DB) return; BK=null; if(btn) btn.disabled=true; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const jobs=[]; for(const x of plan.cols) for(const r of x.rows){ const {id,...d}=r; jobs.push([x.c+'/'+id,d]); }
  if(plan.settings) jobs.push(['settings/store',plan.settings]);
  let done=0, fail=0, stop='';
  for(const [path,d] of jobs){ if(btn) btn.textContent=`Restaurando ${done+fail+1} de ${jobs.length}…`; let ok=false, err=null;
    for(let t=0;t<4&&!ok;t++){ try{ await DB.doc(path).set(d); ok=true; }catch(e){ err=e; const c=e&&e.code; if(c==='resource_exhausted'||c==='unavailable'){ await wait(1500*(t+1)); continue; } break; } }
    if(ok) done++; else { fail++; const c=err&&err.code; if(['invalid_argument','quota_exceeded','revoked','not_granted'].includes(c)){ stop=errMsg(err); break; } }
    await wait(60); }
  logAct('Backup restaurado',`${done} registro(s) · ${plan.file}`); closeModal();
  toast(stop?`Restauração interrompida após ${done} registro(s): ${stop}`:fail?`${done} restaurado(s), ${fail} com falha. Restaure o arquivo de novo.`:`${done} registro(s) restaurado(s)`,!!(stop||fail)); render();
}

/* ---------- PIX (BR Code estático, padrão Banco Central) ---------- */
const tlv = (id,v) => id + String(v.length).padStart(2,'0') + v;
function crc16(s){ let c=0xFFFF; for(const b of new TextEncoder().encode(s)){ c^=b<<8; for(let i=0;i<8;i++) c=(c&0x8000)?((c<<1)^0x1021)&0xFFFF:(c<<1)&0xFFFF; } return c.toString(16).toUpperCase().padStart(4,'0'); }
const pixNorm = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9 ]/g,'').trim().toUpperCase();
function pixKey(){ const s=D.settings, k=String(s.pixKey||'').trim(); if(!k) return '';
  if(s.pixType==='telefone'){ const d=digits(k); return '+'+(d.startsWith('55')&&d.length>11?d:'55'+d); }
  if(s.pixType==='cpf') return digits(k); if(s.pixType==='email') return k.toLowerCase(); return k; }
function pixPayload(amount, desc, txid){
  const key=pixKey(); if(!key) return null;
  let mai=tlv('00','br.gov.bcb.pix')+tlv('01',key);
  const d=pixNorm(desc).slice(0,Math.max(0,95-mai.length)); if(d) mai+=tlv('02',d);
  let p=tlv('00','01')+tlv('26',mai)+tlv('52','0000')+tlv('53','986')+(amount>0?tlv('54',(+amount).toFixed(2)):'')+tlv('58','BR')+tlv('59',pixNorm(D.settings.pixName||'ESRO PAPELARIA').slice(0,25)||'ESRO')+tlv('60',pixNorm(D.settings.pixCity||'SAO PAULO').slice(0,15)||'SAO PAULO')+tlv('62',tlv('05',(String(txid||'').replace(/[^A-Za-z0-9]/g,'').slice(0,25))||'***'));
  p+='6304'; return p+crc16(p);
}
function drawQR(el, text){ if(!el) return; el.innerHTML=''; try{ new QRCode(el,{text,width:260,height:260,correctLevel:QRCode.CorrectLevel.M}); }catch(e){ el.innerHTML='<small style="color:#7C716A;text-align:center">QR indisponível; use o copia e cola</small>'; } }

/* ---------- Links de canal ---------- */
function waLink(contact, text){ let d=digits(contact); if(d.length<10) return null; if(!(d.startsWith('55')&&d.length>=12)) d='55'+d; return `https://wa.me/${d}${text?`?text=${encodeURIComponent(text)}`:''}`; }
function igLink(contact){ const m=String(contact||'').match(/@?([A-Za-z0-9._]{2,30})/); return m && String(contact).includes('@') ? `https://ig.me/m/${m[1]}` : null; }

/* ---------- Shell ---------- */
function notifItems(){
  const n=[]; const nov=D.orders.filter(o=>o.status==='novo'); const art=allFiles().filter(f=>f.st==='aguardando'); const ol=D.leads.filter(l=>l.status==='aberto');
  if(nov.length) n.push(['orders','shopping-bag',`${nov.length} pedido(s) novo(s) para iniciar`,'Pedidos']);
  const dq=dueOrders(); if(dq.length) n.push(['orders','calendar-clock',`${dq.length} pedido(s) com entrega hoje ou atrasada`,dq.slice(0,2).map(o=>'#'+o.num+' '+o.client).join(', ')]);
  if(art.length) n.push(['arts','palette',`${art.length} arte(s) aguardando aprovação`,'Personalização']);
  if(ol.length) n.push(['inbox','messages-square',`${ol.length} atendimento(s) em conversa`,'Inbox']);
  const u=L.convs.reduce((a,x)=>a+(x.nao_lidas||0),0); if(u) n.unshift(['inbox','message-circle',`${u} mensagem(ns) não lida(s)`,'WhatsApp e Instagram']);
  if(L.site.length) n.push(['orders','globe',`${L.site.length} pedido(s) novo(s) do site para importar`,'Pedidos']);
  const df=dueFollow(); if(df.length) n.push(['clients','bell-ring',`${df.length} cliente(s) para acompanhar`,df.slice(0,2).map(x=>x.name).join(', ')]);
  const db_=dueBills(); if(db_.length) n.push(['cash','wallet',`${db_.length} conta(s) a pagar vencida(s) ou de hoje`,db_.slice(0,2).map(x=>x.desc).join(', ')]);
  const ls=lowStock(); if(ls.length) n.push(['stock','package',`${ls.length} item(ns) do estoque para repor`,ls.slice(0,2).map(x=>x.name).join(', ')]);
  if(S.ready && S.canWrite && hasData() && (backupAge()==null||backupAge()>14)) n.push(['settings','shield-check','Faça um backup: exporte tudo para o Excel',backupAge()==null?'Nenhum backup feito ainda':`Último backup há ${backupAge()} dias`]);
  if(S.ready && !D.settings.pixKey) n.push(['settings','qr-code','Cadastre sua chave PIX para gerar cobranças','Configurações']);
  return n;
}
function renderNav(){
  $('#nav').innerHTML = NAV.map(([k,ic,l])=>{ let c=''; if(k==='orders'&&openOrders().length) c=`<span class="count" style="background:var(--sage)">${openOrders().length}</span>`; if(k==='inbox'){ const u=L.convs.reduce((a,x)=>a+(x.nao_lidas||0),0); if(u) c=`<span class="count">${u}</span>`; } if(k==='clients'&&dueFollow().length) c=`<span class="count" style="background:var(--warn)">${dueFollow().length}</span>`; if(k==='cash'&&dueBills().length) c=`<span class="count" style="background:var(--warn)">${dueBills().length}</span>`; if(k==='stock'&&lowStock().length) c=`<span class="count" style="background:var(--warn)">${lowStock().length}</span>`; if(k==='orders'&&L.site.length) c+=`<span class="count" style="background:var(--site);margin-left:4px">${L.site.length}</span>`;
    return `<button class="${S.view===k?'on':''}" data-nav="${k}"><i data-lucide="${ic}"></i>${l}${c}</button>`; }).join('');
  $('#chSeg').innerHTML = [['todos','Todos'],['site','Site'],['whatsapp','WhatsApp'],['instagram','Instagram']].map(([k,l])=>`<button role="tab" aria-selected="${S.ch===k}" class="${S.ch===k?'on':''}" data-ch="${k}">${k!=='todos'?`<span class="dot ${CH[k].dot}"></span>`:''}${l}</button>`).join('');
  $('#ping').hidden = notifItems().length===0;
}
function renderNotif(){ const n=$('#notif'); n.hidden=!S.notifOpen; if(!S.notifOpen) return; const it=notifItems();
  n.innerHTML='<h4>Notificações</h4>'+(it.length?it.map(([v,ic,t,s])=>`<button data-go="${v}"><i data-lucide="${ic}"></i><span><b>${esc(t)}</b><small>${esc(s)}</small></span></button>`).join(''):'<p class="hint" style="padding:8px">Nada pendente agora.</p>'); icons(); }
function go(v){ S.view=v; closeSide(); render(); window.scrollTo(0,0); }
function closeSide(){ $('#side').classList.remove('open'); $('#scrim').classList.remove('show'); }
const emptyState = (ic,t,p,btn) => `<div class="empty"><span class="em-ico"><i data-lucide="${ic}"></i></span><b>${t}</b><p>${p}</p>${btn||''}</div>`;
const roBanner = () => S.canWrite ? '' : `<div class="banner"><i data-lucide="lock"></i><div><b>Somente leitura.</b> Seu acesso a este painel não permite alterações.</div></div>`;

/* ---------- Charts ---------- */
let charts=[];
function killCharts(){ charts.forEach(c=>c.destroy()); charts=[]; }
const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ---------- Visão geral ---------- */
function vOverview(){
  const now=new Date(), cur=monthKey(now), prevK=monthKey(shiftMonth(now,-1));
  const os=D.orders.filter(inCh);
  const curV=os.filter(o=>o.month===cur).reduce((a,o)=>a+(+o.value||0),0), prevV=os.filter(o=>o.month===prevK).reduce((a,o)=>a+(+o.value||0),0);
  const tr = prevV>0 ? (curV-prevV)/prevV*100 : null;
  const open=os.filter(o=>o.status!=='concluido'); const fis=open.filter(o=>o.kind==='fisico').length;
  const pend=os.filter(o=>PEDAGOGICAL.includes(o.catN)&&(o.status==='novo'||o.status==='orcamento'));
  const convCh = S.ch==='todos'?['whatsapp','instagram']:S.ch==='site'?[]:[S.ch];
  const lm=D.leads.filter(l=>convCh.includes(l.ch)&&l.at&&monthKey(new Date(l.at))===cur);
  const rate=arr=>{ const t=arr.length, c=arr.filter(l=>l.status==='fechado').length; return {t,c,p:t?Math.round(c/t*100):null}; };
  const all=rate(lm);
  const hour=now.getHours(); const hi=hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite';
  const steps=[
    [D.catalog.length>0,'Revise o catálogo','Preços importados do seu site','catalog'],
    [!!D.settings.pixKey,'Cadastre a chave PIX','Para gerar cobranças no atendimento','settings'],
    [D.leads.length>0,'Registre um atendimento','WhatsApp ou Instagram','inbox'],
    [D.orders.length>0,'Registre o primeiro pedido','De qualquer canal','orders']];
  const showSteps = steps.some(s=>!s[0]);
  const recent=[...os].sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,5);
  const attention=[
    ...allFiles().filter(f=>f.st==='aguardando'&&inCh(f.order)).map(f=>({ic:'palette',t:`Arte aguardando aprovação · ${f.order.client}`,s:`#${f.order.num} · ${f.name}`,act:`data-open="${f.order.id}"`})),
    ...dueOrders().filter(inCh).map(o=>({ic:'calendar-clock',t:`${dueState(o)[1]} · ${o.client}`,s:`#${o.num} · ${o.item}`,act:`data-open="${o.id}"`})),
    ...os.filter(o=>o.status==='novo').map(o=>({ic:'sparkles',t:`Pedido novo · ${o.client}`,s:`#${o.num} · ${o.item}`,act:`data-open="${o.id}"`})),
    ...D.leads.filter(l=>(S.ch==='todos'||l.ch===S.ch)&&l.status==='aberto').map(l=>({ic:CH[l.ch]?.icon||'message-circle',t:`Em conversa · ${l.name}`,s:l.subject||CH[l.ch]?.long||'',act:`data-lead-go="${l.id}"`}))
    ,...L.convs.filter(c=>c.nao_lidas&&(S.ch==='todos'||c.canal===S.ch)).map(c=>({ic:CH[c.canal]?.icon||'message-circle',t:`${c.nao_lidas} mensagem(ns) de ${c.nome||c.contato||'cliente'}`,s:c.ultima_mensagem||'',act:`data-live-go="${esc(c.id)}"`}))
    ,...dueFollow().map(c=>({ic:'bell-ring',t:`Acompanhar · ${c.name}`,s:c.followWhy||followState(c)[1],act:`data-cedit="${c.id}"`}))
    ,...dueBills().map(b=>({ic:'wallet',t:`Conta a pagar · ${b.desc}`,s:`${fmt(b.value)} · vence ${dfull(b.date)}`,act:`data-nav="cash"`}))
    ,...lowStock().map(x=>({ic:'package',t:`Repor estoque · ${x.name}`,s:`${stockState(x)[1]} · ${qfmt(x.qty)} ${x.unit||'un'} (mínimo ${qfmt(x.min)})`,act:`data-nav="stock"`}))
  ].slice(0,9);
  return `${roBanner()}
  <div class="page-head"><div><div class="hello">${hi}, ESRO!</div><h2>Visão geral de ${MONTHS[now.getMonth()]}</h2><p>Vendas e pedidos de todos os canais em um só lugar.</p></div>
    <button class="btn primary" data-neworder ${S.canWrite?'':'disabled'}><i data-lucide="plus"></i>Novo pedido</button></div>
  ${showSteps?`<section class="card"><h3>Primeiros passos</h3><p class="hint">O painel começa vazio e vai se preenchendo com o que você registrar.</p><div class="steps">${steps.map(([done,t,s,v],i)=>`<button class="step ${done?'done':''}" data-nav="${v}" style="text-align:left;cursor:pointer;font:inherit;color:inherit"><span class="sn">${done?'✓':i+1}</span><b>${t}</b><small>${s}</small></button>`).join('')}</div></section>`:''}
  <section class="grid kpis">
    <div class="card kpi"><div class="lbl"><span class="ico"><i data-lucide="wallet"></i></span>Vendas do mês</div><div class="val tnum">${fmt(curV)}</div>
      <div class="foot">${tr===null?`<span>Sem vendas em ${MONTHS[shiftMonth(now,-1).getMonth()]} para comparar</span>`:`<span class="trend ${tr>=0?'up':'down'}"><i data-lucide="${tr>=0?'trending-up':'trending-down'}"></i>${tr>=0?'+':''}${tr.toFixed(1).replace('.',',')}%</span> vs. ${MONTHS[shiftMonth(now,-1).getMonth()]} (${fmt(prevV)})`}</div></div>
    <div class="card kpi"><div class="lbl"><span class="ico sage"><i data-lucide="package-open"></i></span>Pedidos em aberto</div><div class="val tnum">${open.length}</div>
      <div class="foot split"><span class="mini">📦 Físicos ${fis}</span><span class="mini">💻 Serviços digitais ${open.length-fis}</span></div></div>
    <div class="card kpi"><div class="lbl"><span class="ico sand"><i data-lucide="heart-handshake"></i></span>Conversões WhatsApp / Instagram</div>
      ${S.ch==='site'?`<div class="val tnum">—</div><div class="foot">O site converte direto no checkout</div>`:`<div class="val tnum">${all.p===null?'—':all.p+'%'}</div>
      <div class="foot split">${convCh.map(c=>{const r=rate(lm.filter(l=>l.ch===c));return `<span class="mini"><span class="dot ${CH[c].dot}"></span> ${CH[c].label} ${r.c}/${r.t}</span>`}).join('')}${all.t?'':'<span>Registre atendimentos para medir</span>'}</div>`}</div>
    <div class="card kpi"><div class="lbl"><span class="ico"><i data-lucide="graduation-cap"></i></span>Orçamentos pedagógicos pendentes</div><div class="val tnum">${pend.length}</div>
      <div class="foot">${fmt(pend.reduce((a,o)=>a+(+o.value||0),0))} em negociação ${pend.length?'<button class="linkish" data-nav="orders">Ver <i data-lucide="arrow-right"></i></button>':''}</div></div>
  </section>
  <section class="grid charts">
    <div class="card"><h3>Vendas por origem</h3><p class="hint">${MONTHS[now.getMonth()]} · participação de cada canal</p>
      ${D.orders.some(o=>o.month===cur)?`<div class="chart-box" style="height:220px"><canvas id="cDonut" aria-label="Vendas por origem"></canvas></div><div class="legend">${['site','whatsapp','instagram'].map(c=>`<span style="opacity:${S.ch==='todos'||S.ch===c?1:.4}"><span class="dot ${CH[c].dot}"></span>${CH[c].label} <b>${fmt(D.orders.filter(o=>o.month===cur&&o.ch===c).reduce((a,o)=>a+(+o.value||0),0))}</b></span>`).join('')}</div>`
      :emptyState('pie-chart','Sem vendas neste mês ainda','O gráfico aparece quando houver pedidos registrados.')}</div>
    <div class="card"><h3>Volume de pedidos por categoria</h3><p class="hint">${MONTHS[now.getMonth()]} · ${S.ch==='todos'?'todos os canais':CH[S.ch].long}</p>
      ${os.some(o=>o.month===cur)?`<div class="chart-box"><canvas id="cBar" aria-label="Pedidos por categoria"></canvas></div>`:emptyState('bar-chart-3','Nenhum pedido neste mês','As barras mostram quantos pedidos cada categoria recebeu.')}</div>
  </section>
  <section class="grid two">
    <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h3>Pedidos recentes</h3>${recent.length?'<button class="linkish" data-nav="orders">Todos os pedidos <i data-lucide="arrow-right"></i></button>':''}</div>
      ${recent.length?`<div class="list" style="margin-top:6px">${recent.map(o=>`<div class="row" data-open="${o.id}" style="cursor:pointer">${chBadge(o.ch)}<div class="grow"><b>${esc(o.item)}</b><small>#${o.num} · ${esc(o.client)} · ${stLabel(o.status)}</small></div><b class="tnum">${fmt(o.value)}</b></div>`).join('')}</div>`
      :emptyState('shopping-bag','Nenhum pedido registrado','Registre pedidos que chegam pelo site, WhatsApp ou Instagram.',S.canWrite?'<button class="btn primary" data-neworder><i data-lucide="plus"></i>Registrar pedido</button>':'')}</div>
    <div class="card"><h3>Precisa da sua atenção</h3><p class="hint">Pedidos novos, artes paradas, conversas e clientes para acompanhar, contas e estoque</p>
      ${attention.length?`<div class="list" style="margin-top:6px">${attention.map(a=>`<div class="row" ${a.act} style="cursor:pointer"><span class="kpi"><span class="ico sand" style="width:30px;height:30px"><i data-lucide="${a.ic}"></i></span></span><div class="grow"><b>${esc(a.t)}</b><small>${esc(a.s)}</small></div><i data-lucide="chevron-right"></i></div>`).join('')}</div>`:emptyState('leaf','Tudo em dia por aqui','Quando algo precisar de você, aparece nesta lista.')}</div>
  </section>`;
}
function drawOverview(){
  if(!window.Chart) return; const cur=monthKey(new Date());
  const text2=tok('--text2'), line=tok('--line'), card=tok('--card'); const keys=['site','whatsapp','instagram']; const cols=[tok('--site'),tok('--wa'),tok('--ig')];
  if($('#cDonut')) charts.push(new Chart($('#cDonut'),{type:'doughnut',data:{labels:['Site','WhatsApp','Instagram'],datasets:[{data:keys.map(k=>D.orders.filter(o=>o.month===cur&&o.ch===k).reduce((a,o)=>a+(+o.value||0),0)),backgroundColor:cols.map((c,i)=>S.ch==='todos'||S.ch===keys[i]?c:c+'44'),borderColor:card,borderWidth:3,hoverOffset:6}]},
    options:{maintainAspectRatio:false,cutout:'66%',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.label}: ${fmt(c.raw)}`}}}}}));
  if($('#cBar')){ const ns=Object.keys(CAT_SHORT); const os=D.orders.filter(o=>inCh(o)&&o.month===cur);
    charts.push(new Chart($('#cBar'),{type:'bar',data:{labels:ns.map(n=>CAT_SHORT[n]),datasets:[{data:ns.map(n=>os.filter(o=>o.catN===n).length),backgroundColor:ns.map(n=>n==='07'?tok('--primary'):n==='06'?tok('--sand'):tok('--sage')),borderRadius:8,maxBarThickness:46}]},
    options:{maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.raw} pedido(s)`}}},scales:{x:{grid:{display:false},ticks:{color:text2,font:{family:'Nunito',size:11}}},y:{beginAtZero:true,grid:{color:line},border:{display:false},ticks:{color:text2,precision:0}}}}})); }
}

/* ---------- Pedidos ---------- */
function vOrders(){
  const list=D.orders.filter(o=>inCh(o)&&matchQ(o)).sort((a,b)=>(b.num||0)-(a.num||0));
  const head=`${roBanner()}<div class="page-head"><div><h2>Pedidos unificados</h2><p>${list.length} pedido(s) ${S.ch==='todos'?'de todos os canais':'via '+CH[S.ch].long}${S.q?` · busca: “${esc(S.q)}”`:''}</p></div>
    <div class="toolbar"><div class="seg"><button class="${S.orderMode==='kanban'?'on':''}" data-mode="kanban"><i data-lucide="columns-3"></i>Kanban</button><button class="${S.orderMode==='table'?'on':''}" data-mode="table"><i data-lucide="table-2"></i>Tabela</button></div><button class="btn" data-xl="orders"><i data-lucide="file-spreadsheet"></i>Exportar</button><button class="btn" data-print ${D.orders.length?'':'disabled'}><i data-lucide="printer"></i>Imprimir produção</button>
    <button class="btn primary" data-neworder ${S.canWrite?'':'disabled'}><i data-lucide="plus"></i>Novo pedido</button></div></div>`;
  const siteCard = L.site.length ? `<section class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><div><h3>Pedidos novos do site</h3><p class="hint">Chegaram pelo checkout; confira e importe para o painel.</p></div>${chBadge('site',L.site.length+' novo(s)')}</div><div class="list" style="margin-top:6px">${L.site.map(o=>{const p=siteOrderPreset(o);return `<div class="row"><div class="grow"><b>${esc(p.item)}</b><small>Web ${esc(p.ref)} · ${esc(p.client||'cliente sem nome')} · ${dtime(o.recebido_em)}</small></div><b class="tnum">${p.value?fmt(p.value):''}</b>${S.canWrite?`<button class="btn sm primary" data-site-import="${o.id}"><i data-lucide="download"></i>Importar</button>`:''}</div>`}).join('')}</div></section>` : '';
  if(!D.orders.length) return head+siteCard+`<div class="card">${emptyState('shopping-bag','Nenhum pedido ainda','Registre cada pedido que chegar pelo site, WhatsApp ou Instagram. Ele aparece aqui, no Kanban e nas métricas.',S.canWrite?'<button class="btn primary" data-neworder><i data-lucide="plus"></i>Registrar primeiro pedido</button>':'')}</div>`;
  const ref=o=>o.ch==='site'?(o.ref?'Web '+o.ref:'Site'):(o.contact||CH[o.ch]?.label);
  if(S.orderMode==='kanban') return head+siteCard+`<p class="hint" style="margin-top:-8px">Arraste os cartões entre as colunas para mudar o status, ou clique para ver e editar.</p><div class="kanban-wrap"><div class="kanban">${STATUS.map(s=>{const it=list.filter(o=>o.status===s.k);
      return `<div class="col" data-col="${s.k}"><div class="col-head"><span class="bar" style="background:${s.c}"></span>${s.l}<span class="n">${it.length}</span></div>
      ${it.map(o=>`<button class="ocard" draggable="${S.canWrite}" data-drag="${o.id}" data-open="${o.id}"><div class="l1"><span class="id">#${o.num} · ${dshort(o.at)}</span>${chBadge(o.ch, ref(o))}</div><div class="item">${esc(o.item)}</div><div class="cl">${esc(o.client)}</div><div class="l3"><span class="v tnum">${fmt(o.value)}</span>${payBadge(o.payS)}</div>${dueState(o)?`<div>${dueBadge(o)}</div>`:''}${(o.files||[]).length?`<small class="cl" style="display:flex;gap:4px;align-items:center"><i data-lucide="paperclip" style="width:13px;height:13px"></i>${o.files.length} anexo(s)</small>`:''}</button>`).join('')||`<div class="empty-col">Nenhum pedido aqui</div>`}</div>`}).join('')}</div></div>`;
  return head+siteCard+`<div class="card" style="padding:0"><div class="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Canal</th><th>Item</th><th>Tipo</th><th class="num">Valor</th><th>Pagamento</th><th>Status</th></tr></thead><tbody>
    ${list.map(o=>`<tr data-open="${o.id}" tabindex="0"><td><b>#${o.num}</b><br><small style="color:var(--text2)">${dshort(o.at)}</small></td><td>${esc(o.client)}${dueState(o)?`<br>${dueBadge(o)}`:''}</td><td>${chBadge(o.ch,ref(o))}</td><td>${o.qty>1?`<b>${qfmt(o.qty)} ×</b> `:''}${esc(o.item)}</td><td><span class="badge b-neutral">${o.kind==='fisico'?'Físico':'Digital'}</span></td><td class="num"><b>${fmt(o.value)}</b></td><td>${esc(o.pay)} ${payBadge(o.payS)}</td><td><span class="badge" style="background:var(--sand-soft);color:var(--text)"><span class="dot" style="background:${(STATUS.find(s=>s.k===o.status)||STATUS[0]).c}"></span>${stLabel(o.status)}</span></td></tr>`).join('')||`<tr><td colspan="8" style="text-align:center;color:var(--text2);padding:28px">Nenhum pedido encontrado.</td></tr>`}
  </tbody></table></div></div>`;
}

let delArm=null;
function openOrder(id, preset){
  const o=id?D.orders.find(x=>x.id===id):null; if(id&&!o) return;
  const v=o||Object.assign({ch:'whatsapp',client:'',contact:'',ref:'',city:'',item:'',catN:'',kind:'digital',value:'',pay:'PIX',payS:'Aguardando',status:'novo',note:'',files:[]},preset||{});
  const dis=S.canWrite?'':'disabled'; delArm=null;
  const opts=(arr,cur)=>arr.map(([k,l])=>`<option value="${esc(k)}" ${k===cur?'selected':''}>${esc(l)}</option>`).join('');
  $('#modalRoot').innerHTML=`<div class="overlay" data-close><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt">
    <div class="modal-head"><div>${o?`<div style="display:flex;gap:8px;flex-wrap:wrap">${chBadge(o.ch)}<span class="badge b-neutral">Pedido #${o.num} · ${dtime(o.at)}</span></div>`:''}<h3 id="mt" style="margin-top:${o?8:0}px">${o?esc(o.item):'Novo pedido'}</h3></div>
      <button class="close" data-x aria-label="Fechar"><i data-lucide="x"></i></button></div>
    <form id="oForm" class="modal-body form" style="display:grid">
      <label>Canal<select class="inp" id="f-ch" ${dis}>${opts(Object.entries(CH).map(([k,c])=>[k,c.long]),v.ch)}</select></label>
      <label>Status<select class="inp" id="f-status" ${dis}>${opts(STATUS.map(s=>[s.k,s.l]),v.status)}</select></label>
      <label><span>Cliente <span class="req">*</span></span><input class="inp" id="f-client" required value="${esc(v.client)}" ${dis}></label>
      <label>Contato (telefone ou @)<input class="inp" id="f-contact" value="${esc(v.contact)}" placeholder="(11) 90000-0000 ou @perfil" ${dis}></label>
      <label>Nº do pedido no site / referência<input class="inp" id="f-ref" value="${esc(v.ref)}" ${dis}></label>
      <label>Cidade<input class="inp" id="f-city" value="${esc(v.city)}" ${dis}></label>
      <label class="full"><span>Item <span class="req">*</span></span><input class="inp" id="f-item" list="dl-items" required value="${esc(v.item)}" placeholder="Comece a digitar: Planner, Pauta de formação…" ${dis}>
        <datalist id="dl-items">${catItems().map(it=>`<option value="${esc(it.name)}">${esc(it.catN+' · '+priceTxt(it))}</option>`).join('')}</datalist></label>
      <label>Quantidade<input class="inp tnum" id="f-qty" type="number" min="1" step="1" value="${esc(v.qty||1)}" ${dis}></label>
      <label>Entregar até<input class="inp" id="f-due" type="date" value="${esc(v.due||'')}" ${dis}></label>
      <label>Categoria<select class="inp" id="f-cat" ${dis}><option value="">—</option>${opts(D.catalog.map(c=>[c.n,c.n+' '+c.t]),v.catN)}</select></label>
      <label>Tipo<select class="inp" id="f-kind" ${dis}>${opts([['digital','Serviço / material digital'],['fisico','Produto físico']],v.kind)}</select></label>
      <label>Valor (R$) <span class="req">*</span><input class="inp tnum" id="f-value" type="number" min="0" step="0.01" required value="${esc(v.value)}" ${dis}></label>
      <label>Forma de pagamento<select class="inp" id="f-pay" ${dis}>${opts([['PIX','PIX'],['Cartão','Cartão'],['Sinal / Orçamento','Sinal / Orçamento'],['Dinheiro','Dinheiro']],v.pay)}</select></label>
      <label>Situação do pagamento<select class="inp" id="f-payS" ${dis}>${opts([['Aguardando','Aguardando'],['Sinal pago','Sinal pago'],['Pago','Pago']],v.payS)}</select></label>
      <label>Valor do sinal (R$)<input class="inp tnum" id="f-sinal" type="number" min="0" step="0.01" value="${esc(v.sinal||'')}" placeholder="Se vazio, conta metade do valor" ${dis}></label>
      ${o?`<label>Recebido até agora<input class="inp tnum" value="${esc(fmt(paidOf(o)))}${dueOf(o)?' · falta '+esc(fmt(dueOf(o))):''}" disabled></label>`:''}
      <label class="full">Observações / briefing<textarea class="inp" id="f-note" rows="3" ${dis}>${esc(v.note)}</textarea></label>
      <div class="fieldset full"><h4>Artes e briefing do cliente</h4>
        ${o?`${(o.files||[]).map((f,i)=>`<div class="file"><span class="thumb">${/^image\//.test(f.type)?`<img src="/_blob/${esc(f.id)}" alt="">`:'<i data-lucide="file-text"></i>'}</span><div class="grow"><a href="/_blob/${esc(f.id)}" target="_blank" rel="noopener" style="color:var(--text);font-weight:700;overflow-wrap:anywhere">${esc(f.name)}</a><small>${FILE_ST[f.st]?.[1]||''} · ${dshort(f.at)}</small></div>
            <select class="inp" style="width:auto" data-fst="${o.id}:${i}" ${dis}>${opts(Object.entries(FILE_ST).map(([k,a])=>[k,a[1]]),f.st)}</select>
            ${S.canWrite&&ASSETS?`<button type="button" class="del" data-fdel="${o.id}:${i}" aria-label="Remover arquivo"><i data-lucide="trash-2"></i></button>`:''}</div>`).join('')||'<p class="hint">Nenhum arquivo anexado.</p>'}
          ${S.canWrite&&ASSETS?`<label class="btn sm" style="align-self:flex-start;cursor:pointer"><i data-lucide="paperclip"></i>Anexar arquivo<input type="file" id="f-files" data-order="${o.id}" multiple hidden accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf,.csv,.txt,.md,.json"></label>`:''}`
        :'<p class="hint">Salve o pedido para anexar artes e briefings.</p>'}</div>
    </form>
    <div class="modal-foot">${o&&S.canWrite?`<button class="btn danger" data-odel="${o.id}" style="margin-right:auto"><i data-lucide="trash-2"></i>Excluir</button>`:''}
      ${o&&waLink(o.contact)?`<a class="btn" href="${waLink(o.contact)}" target="_blank" rel="noopener noreferrer"><i data-lucide="message-circle"></i>WhatsApp</a>`:''}
      ${o&&igLink(o.contact)?`<a class="btn" href="${igLink(o.contact)}" target="_blank" rel="noopener noreferrer"><i data-lucide="instagram"></i>Direct</a>`:''}
      ${o?`<button class="btn" data-oprint="${o.id}"><i data-lucide="printer"></i>Imprimir ficha</button>`:''}
      <button class="btn" data-x>Cancelar</button>${S.canWrite?`<button class="btn primary" data-osave="${o?o.id:''}"><i data-lucide="check"></i>${o?'Salvar alterações':'Registrar pedido'}</button>`:''}</div>
  </div></div>`;
  $('#modalRoot').dataset.lead = preset&&preset.leadId || '';
  $('#modalRoot').dataset.site = preset&&preset.siteOrderId ? String(preset.siteOrderId) : '';
  $('#modalRoot').dataset.client = preset&&preset.clientId || '';
  icons(); const f=$('#f-client'); if(f&&!o) f.focus();
}
function closeModal(){ $('#modalRoot').innerHTML=''; delArm=null; }
async function saveOrder(id){
  const g=k=>$('#f-'+k).value.trim(); const client=g('client'), item=g('item'), value=parseFloat($('#f-value').value);
  if(!client){ $('#f-client').focus(); toast('Informe o nome do cliente',1); return; }
  if(!item){ $('#f-item').focus(); toast('Informe o item do pedido',1); return; }
  if(!(value>=0)){ $('#f-value').focus(); toast('Informe o valor do pedido',1); return; }
  const data={ch:g('ch'),status:g('status'),client,contact:g('contact'),ref:g('ref'),city:g('city'),item,catN:g('cat'),kind:g('kind'),value,pay:g('pay'),payS:g('payS'),note:g('note'),sinal:r2(parseFloat($('#f-sinal').value)||0),qty:Math.max(1,parseFloat($('#f-qty').value)||1),due:$('#f-due').value||''};
  if(id){ const prev=D.orders.find(x=>x.id===id); data.pays=orderPays(prev,data,new Date().toISOString()); if(await write(()=>DB.doc('orders/'+id).update(data),'Pedido atualizado')) closeModal(); return; }
  const now=new Date(); const num=D.orders.reduce((m,o)=>Math.max(m,+o.num||0),1000)+1;
  const leadId=$('#modalRoot').dataset.lead||'', clientPre=$('#modalRoot').dataset.client||'';
  Object.assign(data,{num,at:now.toISOString(),month:monthKey(now),files:[],leadId,pays:orderPays(null,data,now.toISOString())});
  const oref=DB?DB.collection('orders').doc():null;
  const ok=await write(()=>oref.set(data),`Pedido #${num} registrado`);
  if(ok){ const cid=await ensureClient({id:clientPre,name:client,contact:data.contact,ch:data.ch,city:data.city},'comprou',`Comprou: pedido #${num} (${item}, ${fmt(value)}).`); if(cid){ try{ await DB.doc('orders/'+oref.id).update({clientId:cid}); }catch(_){} } }
  if(ok&&leadId){ const l=D.leads.find(x=>x.id===leadId); if(l) await write(()=>DB.doc('leads/'+leadId).update({status:'fechado',updatedAt:now.toISOString(),notes:[...(l.notes||[]),{at:now.toISOString(),text:`Virou o pedido #${num} (${item}, ${fmt(value)}).`}]})); }
  const siteId=$('#modalRoot').dataset.site; if(ok&&siteId&&L.mcp){ try{ await L.mcp.callTool(CONN,'marcar_pedido_importado',{pedido_id:+siteId}); L.mcp.invalidate(CONN,'listar_pedidos_site').catch(()=>{}); L.site=L.site.filter(x=>x.id!==+siteId); }catch(e){ toast('Pedido salvo, mas não foi possível marcar como importado no servidor',1); } }
  if(ok) closeModal();
}
function fillFromItem(){ const name=$('#f-item').value.trim().toLowerCase(); const it=catItems().find(x=>x.name.toLowerCase()===name); if(!it) return;
  $('#f-cat').value=it.catN; $('#f-kind').value=it.kind==='fisico'?'fisico':'digital'; if(!$('#f-value').value) $('#f-value').value=it.max||it.min||''; }

/* ---------- Arquivos (assets) ---------- */
function typeFor(f){ const ext=(f.name.split('.').pop()||'').toLowerCase(); return ({csv:'text/csv',txt:'text/plain',md:'text/markdown',json:'application/json',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml',pdf:'application/pdf'})[ext]||f.type; }
async function uploadTo(orderId, files){
  if(!ASSETS){ toast('Envio de arquivos indisponível nesta visualização',1); return; }
  const o=D.orders.find(x=>x.id===orderId); if(!o||!files.length) return;
  const added=[]; toast('Enviando arquivo(s)…');
  for(const f of files){ try{ const t=typeFor(f); const r=await ASSETS.upload(f,{type:t}); added.push({id:r.id,name:f.name,type:r.contentType,st:'recebido',at:new Date().toISOString()}); }catch(e){ toast(`${f.name}: ${errMsg(e)}`,1); } }
  if(added.length){ const cur=D.orders.find(x=>x.id===orderId); await write(()=>DB.doc('orders/'+orderId).update({files:[...(cur.files||[]),...added]}),`${added.length} arquivo(s) anexado(s)`); if($('#oForm')) setTimeout(()=>openOrder(orderId),250); }
}
async function setFileSt(orderId,i,st){ const o=D.orders.find(x=>x.id===orderId); if(!o) return; const files=(o.files||[]).map((f,j)=>j===+i?{...f,st}:f); await write(()=>DB.doc('orders/'+orderId).update({files}),FILE_ST[st][1]); }
async function delFile(orderId,i){ const o=D.orders.find(x=>x.id===orderId); if(!o) return; const f=o.files[+i]; const files=o.files.filter((_,j)=>j!==+i);
  if(await write(()=>DB.doc('orders/'+orderId).update({files}),'Arquivo removido')){ try{ await ASSETS.delete(f.id); }catch(_){} if($('#oForm')) setTimeout(()=>openOrder(orderId),250); } }

/* ---------- Inbox / atendimentos ---------- */
function quickReplies(){
  const cat=n=>{ const c=D.catalog.find(x=>x.n===n); return c?(c.items||[]).filter(i=>i.on).map(i=>`• ${i.name}: ${priceTxt(i)}`).join('\n'):''; };
  const sig=D.settings.assinatura?`\n\n${D.settings.assinatura}`:'';
  const prazo=D.settings.prazo||'O prazo de produção e entrega é combinado no orçamento.';
  return [
   ['book-open','Assessoria Pedagógica',`Olá! Segue a tabela da nossa Assessoria Pedagógica Online:\n${cat('01')}\nPosso te ajudar a escolher? 💛${sig}`],
   ['presentation','Materiais Pedagógicos',`Nossos Materiais Pedagógicos:\n${cat('02')}\nO valor final depende da extensão e do tema. 🌿${sig}`],
   ['clipboard-list','Planejamentos',`Planejamentos e Avaliações:\n${cat('03')}${sig}`],
   ['package','Prazos da Papelaria',`Nossa papelaria personalizada (agendas, planners, bloquinhos e cadernos em brochura artesanal):\n${cat('07')}\n${prazo}${sig}`],
   ['image','Artes Digitais',`Artes Digitais Personalizadas:\n${cat('06')}\nEntrega em arquivo digital, pronto para imprimir ou enviar. ✨${sig}`],
   ['gift','Combos',`Nossos combos:\n${cat('08')}${sig}`],
   ['pencil','Pedir briefing',`Para começar, me envia: nome, tema ou cores preferidas e a data em que você precisa. Se tiver referência, pode mandar aqui mesmo 🌿${sig}`]
  ];
}
function vInbox(){
  const live=S.inboxTab==='live';
  const unread=L.convs.reduce((a,c)=>a+(c.nao_lidas||0),0);
  return `${roBanner()}<div class="page-head"><div><h2>Inbox multicanal</h2><p>${live?'Mensagens do WhatsApp (11) 99248-1676 e do Direct @esro.papelaria, direto no painel.':'Registre cada atendimento para acompanhar orçamento, PIX e conversão.'}</p></div>
    <div class="toolbar"><div class="seg"><button class="${live?'on':''}" data-itab="live"><i data-lucide="radio"></i>Mensagens${unread?` <span class="count" style="background:var(--primary);color:var(--card);border-radius:99px;padding:0 7px;font-size:11px">${unread}</span>`:''}</button><button class="${live?'':'on'}" data-itab="leads"><i data-lucide="notebook-pen"></i>Atendimentos</button></div>
    ${live?'':`<button class="btn primary" data-newlead ${S.canWrite?'':'disabled'}><i data-lucide="user-plus"></i>Novo atendimento</button>`}</div></div>
  ${live?vLive():vLeads()}`;
}
function vLeads(){
  const list=D.leads.filter(l=>(S.ch==='todos'||l.ch===S.ch)&&matchQ(l)).sort((a,b)=>String(b.updatedAt||b.at).localeCompare(String(a.updatedAt||a.at)));
  if(!list.find(l=>l.id===S.lead)) S.lead=list[0]?.id||null;
  const l=D.leads.find(x=>x.id===S.lead);
  const head='';
  if(!D.leads.length) return head+`<div class="card">${emptyState('messages-square','Nenhum atendimento registrado','Quando alguém chamar no WhatsApp (11) 99248-1676 ou no Direct @esro.papelaria, registre aqui para acompanhar o orçamento, gerar o PIX e medir a conversão.',S.canWrite?'<button class="btn primary" data-newlead><i data-lucide="user-plus"></i>Registrar atendimento</button>':'')}</div>`;
  const wa=l&&waLink(l.contact, S.compose), ig=l&&igLink(l.contact);
  return head+`<section class="card inbox ${S.showChat?'show-chat':''}">
    <div class="convs"><div class="convs-head"><b>Atendimentos</b><small><span><span class="dot wa"></span> (11) 99248-1676</span><span><span class="dot ig"></span> @esro.papelaria</span></small></div>
      <div class="conv-list">${list.map(c=>{const last=(c.notes||[]).slice(-1)[0]; const st=LEAD_ST.find(s=>s[0]===c.status)||LEAD_ST[0];
        return `<button class="conv ${c.id===S.lead?'on':''}" data-lead="${c.id}"><span class="av-ch"><span class="avatar">${initials(c.name)}</span>${CH[c.ch]?`<span class="chi ${CH[c.ch].dot}"><i data-lucide="${CH[c.ch].icon}"></i></span>`:''}</span><span class="grow"><span class="t"><b>${esc(c.name)}</b><small>${dshort(c.updatedAt||c.at)}</small></span><p>${esc(last?last.text:(c.subject||c.contact||''))}</p><span class="badge ${st[2]}" style="margin-top:4px">${st[1]}</span></span></button>`}).join('')||'<p class="hint" style="padding:16px">Nenhum atendimento neste filtro.</p>'}</div></div>
    <div class="chat">${l?`
      <div class="chat-head"><button class="iconbtn back" data-back aria-label="Voltar"><i data-lucide="arrow-left"></i></button><span class="avatar">${initials(l.name)}</span><div class="grow"><b>${esc(l.name)}</b><small>${CH[l.ch]?.long||''} · ${esc(l.contact||'sem contato')}${l.subject?' · '+esc(l.subject):''}</small></div>
        <select class="inp" style="width:auto" id="leadSt" data-leadst="${l.id}" ${S.canWrite?'':'disabled'}>${LEAD_ST.map(s=>`<option value="${s[0]}" ${s[0]===l.status?'selected':''}>${s[1]}</option>`).join('')}</select>
        ${l.orderId&&D.orders.find(o=>o.id===l.orderId)?`<button class="btn sm" data-open="${l.orderId}"><i data-lucide="shopping-bag"></i>Pedido #${D.orders.find(o=>o.id===l.orderId).num}</button>`:S.canWrite?`<button class="btn sm" data-lead-order="${l.id}"><i data-lucide="plus"></i>Criar pedido</button>`:''}
        ${S.canWrite?`<button class="del" data-leaddel="${l.id}" aria-label="Excluir atendimento"><i data-lucide="trash-2"></i></button>`:''}</div>
      <div class="notes" id="notes">${(l.notes||[]).map(n=>`<div class="note"><time>${dtime(n.at)}</time>${esc(n.text)}</div>`).join('')||'<p class="hint">Sem anotações ainda. Use o campo abaixo para registrar o que foi combinado.</p>'}</div>
      <div class="quick">${quickReplies().map(([ic,lb],i)=>`<button class="chip" data-qr="${i}"><i data-lucide="${ic}"></i>${lb}</button>`).join('')}<button class="chip" data-pix style="border-color:var(--sage);color:var(--ok)"><i data-lucide="qr-code"></i>Gerar PIX</button></div>
      ${S.pixOpen?(D.settings.pixKey?`<div class="pixbox"><label>Valor (R$)<input class="inp tnum" id="pixV" type="number" min="0.01" step="0.01" value="${S.pix?.v||''}"></label><label>Descrição<input class="inp" id="pixD" maxlength="40" value="${esc(S.pix?.d||l.subject||'')}"></label><button class="btn primary" data-pixgo><i data-lucide="qr-code"></i>Gerar</button></div>`
        :`<div class="banner" style="margin:10px 14px 0"><i data-lucide="info"></i><div>Cadastre sua chave PIX em <button class="linkish" data-nav="settings">Configurações</button> para gerar cobranças.</div></div>`):''}
      ${S.pix&&S.pix.lead===l.id&&S.pix.code?`<div class="qrwrap"><div class="qr" id="qrBox"></div><div style="min-width:0;display:flex;flex-direction:column;gap:6px"><b>PIX de ${fmt(S.pix.v)}</b><small style="color:var(--text2)">${esc(S.pix.d||'')} · chave ${esc(pixKey())}</small><code>${esc(S.pix.code)}</code><div class="compose-actions"><button class="btn sm" data-copy-pix><i data-lucide="copy"></i>Copiar código</button></div><small style="color:var(--text2)">Confira nome e valor no app do banco antes de enviar.</small></div></div>`:''}
      <div class="compose-box"><textarea class="inp" id="compose" rows="3" placeholder="Escreva a mensagem ou toque numa resposta rápida…">${esc(S.compose)}</textarea>
        <div class="compose-actions">
          ${wa?`<a class="btn primary" id="waSend" href="${esc(wa)}" target="_blank" rel="noopener noreferrer"><i data-lucide="message-circle"></i>Abrir no WhatsApp</a>`:''}
          ${ig?`<a class="btn primary" id="igOpen" href="${esc(ig)}" target="_blank" rel="noopener" style="background:var(--ig);border-color:var(--ig)"><i data-lucide="instagram"></i>Abrir Direct</a>`:''}
          <button class="btn" data-copy-compose><i data-lucide="copy"></i>Copiar</button>
          ${S.canWrite?`<button class="btn" data-note="${l.id}"><i data-lucide="notebook-pen"></i>Registrar como anotação</button>`:''}
        </div>${!wa&&!ig?'<small class="hint">Adicione um telefone ou @ ao atendimento para abrir a conversa direto no app.</small>':ig?'<small class="hint">O Direct não aceita texto pronto: copie a mensagem e cole na conversa.</small>':''}</div>
    `:'<p class="hint" style="padding:24px">Selecione um atendimento.</p>'}</div></section>`;
}
function openLeadForm(){
  $('#modalRoot').innerHTML=`<div class="overlay" data-close><div class="modal" role="dialog" aria-modal="true" aria-labelledby="lt" style="width:min(520px,100%)">
    <div class="modal-head"><h3 id="lt">Novo atendimento</h3><button class="close" data-x aria-label="Fechar"><i data-lucide="x"></i></button></div>
    <div class="modal-body form" style="display:grid">
      <label>Canal<select class="inp" id="l-ch">${Object.entries(CH).map(([k,c])=>`<option value="${k}" ${k==='whatsapp'?'selected':''}>${c.long}</option>`).join('')}</select></label>
      <label><span>Nome <span class="req">*</span></span><input class="inp" id="l-name"></label>
      <label class="full">Contato (telefone ou @)<input class="inp" id="l-contact" placeholder="(11) 90000-0000 ou @perfil"></label>
      <label class="full">Assunto<input class="inp" id="l-subject" placeholder="Ex.: pauta de formação para outubro"></label>
    </div>
    <div class="modal-foot"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-leadsave><i data-lucide="check"></i>Registrar</button></div></div></div>`;
  icons(); $('#l-name').focus();
}
async function saveLead(){
  const name=$('#l-name').value.trim(); if(!name){ $('#l-name').focus(); toast('Informe o nome',1); return; }
  const now=new Date().toISOString(); const ref=DB.collection('leads').doc();
  const ok=await write(()=>ref.set({ch:$('#l-ch').value,name,contact:$('#l-contact').value.trim(),subject:$('#l-subject').value.trim(),status:'aberto',notes:[],at:now,updatedAt:now}),'Atendimento registrado');
  if(ok){ ensureClient({name,contact:$('#l-contact').value.trim(),ch:$('#l-ch').value,interest:$('#l-subject').value.trim()},'info','Pediu informações'+($('#l-subject').value.trim()?': '+$('#l-subject').value.trim():'')+'.'); closeModal(); S.lead=ref.id; S.showChat=true; S.compose=''; S.pix=null; S.pixOpen=false; go('inbox'); }
}
async function addNote(leadId, text){ const l=D.leads.find(x=>x.id===leadId); if(!l||!text.trim()) return false; const now=new Date().toISOString();
  return write(()=>DB.doc('leads/'+leadId).update({notes:[...(l.notes||[]),{at:now,text:text.trim()}].slice(-200),updatedAt:now})); }
function afterInbox(){ const m=$('#notes')||$('#lmsgs'); if(m) m.scrollTop=m.scrollHeight; if(S.pix&&S.pix.code&&$('#qrBox')) drawQR($('#qrBox'),S.pix.code); }

/* ---------- Mensagens ao vivo (conector ESRO Conexões) ---------- */
const liveContact=c=>c.canal==='whatsapp'?(c.contato||''):(c.usuario?'@'+c.usuario:'');
const CONN='ESRO Conexões';
const L={mcp:null,status:'off',msg:'',convs:[],sel:null,msgs:[],msgsFor:null,sending:false,site:[],unsub:null,unsubMsgs:null,unsubSite:null,at:null};
const tfmt = ms => ms ? new Date(ms).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
function mcpMsg(e){ const c=e&&e.code; return ({server_not_connected:`Adicione o conector ${CONN} em claude.ai → Configurações → Conectores.`,server_not_found:`O conector ${CONN} não existe mais; adicione de novo em Configurações → Conectores.`,
  needs_reauth:`Reconecte ${CONN} em claude.ai → Configurações → Conectores.`,not_in_manifest:'O conector não foi permitido para este painel. Recarregue a página e permita o acesso.',selection_required:`Há mais de um conector chamado ${CONN}; escolha qual usar quando o Claude perguntar.`,
  blocked_by_policy:'A política da sua conta bloqueia este conector.',approval_required:'Este conector exige aprovação a cada uso.',server_unavailable:'O servidor de conexões não respondeu (no plano gratuito ele leva até 1 minuto para acordar).',
  tool_error:e?.message||'O servidor recusou a operação.'})[c]||'Não foi possível falar com o servidor de conexões.'; }
function liveErr(e){ const c=e&&e.code;
  if(['server_not_connected','server_not_found'].includes(c)){ L.status='absent'; L.convs=[]; }
  else if(['needs_reauth','not_in_manifest','blocked_by_policy','approval_required','selection_required'].includes(c)){ L.status='denied'; L.msg=mcpMsg(e); L.convs=[]; L.site=[]; }
  else if(['not_granted','capability_disabled','capability_removed'].includes(c)){ L.status='off'; }
  else { L.status='down'; L.msg=mcpMsg(e); } }
async function liveInit(){
  if(!L.mcp){ L.status='off'; soon(); return; }
  try{ const r=await L.mcp.listTools(CONN); const s=(r.servers||[]).find(x=>x.server===CONN);
    if(!s) L.status='absent'; else if(s.authStatus==='needs_reauth'){ L.status='denied'; L.msg=mcpMsg({code:'needs_reauth'}); } else if(s.authStatus==='unknown') L.status='ask'; else liveStart();
  }catch(e){ liveErr(e); } soon();
}
function liveStart(){
  L.status='loading'; soon(); L.unsub?.(); L.unsubSite?.();
  L.unsub=L.mcp.watchTool(CONN,'listar_conversas',{limite:100},ev=>{ if(ev.type==='data'){ L.convs=ev.result.payload?.conversas||[]; L.status='ok'; L.at=ev.result.cache?.storedAt||Date.now(); } else liveErr(ev.error); soon(); },{refetchInterval:30000});
  L.unsubSite=L.mcp.watchTool(CONN,'listar_pedidos_site',{apenas_novos:true},ev=>{ if(ev.type==='data'){ L.site=ev.result.payload?.pedidos||[]; soon(); } },{refetchInterval:60000});
}
function liveSelect(id){
  if(L.sel!==id){ S.compose=''; S.pix=null; S.pixOpen=false; }
  L.sel=id; S.showChat=true; if(L.msgsFor!==id) L.msgs=[]; L.unsubMsgs?.();
  L.unsubMsgs=L.mcp.watchTool(CONN,'ler_conversa',{conversa_id:id,limite:80},ev=>{ if(ev.type==='data'){ L.msgs=ev.result.payload?.mensagens||[]; L.msgsFor=id; } else if(ev.error?.code!=='server_unavailable') toast(mcpMsg(ev.error),1); soon(); },{refetchInterval:30000});
  const c=L.convs.find(x=>x.id===id);
  if(c&&c.nao_lidas) L.mcp.callTool(CONN,'marcar_como_lida',{conversa_id:id}).then(()=>L.mcp.invalidate(CONN,'listar_conversas').catch(()=>{})).catch(()=>{});
  render();
}
async function liveSend(){
  const t=S.compose.trim(); if(!t){ $('#compose')?.focus(); toast('Escreva a mensagem primeiro',1); return; }
  L.sending=true; render();
  try{ await L.mcp.callTool(CONN,'enviar_mensagem',{conversa_id:L.sel,texto:t}); S.compose=''; S.pix=null; toast('Mensagem enviada'); L.mcp.invalidate(CONN).catch(()=>{}); }
  catch(e){ toast(e&&e.code==='server_unavailable'?'Não deu para confirmar o envio. Confira a conversa antes de reenviar.':mcpMsg(e),1); }
  L.sending=false; render();
}
function liveSetup(){
  const box=(ic,t,p,btn)=>`<div class="card">${emptyState(ic,t,p,btn)}</div>`;
  if(L.status==='off') return box('plug','Mensagens ao vivo indisponíveis nesta visualização','Abra o painel pelo claude.ai, logado na sua conta, para ver as conversas do WhatsApp e do Instagram.');
  if(L.status==='ask') return box('radio','Conectar as mensagens','O painel vai pedir permissão para usar o conector ESRO Conexões. Depois disso as conversas aparecem aqui e atualizam sozinhas.','<button class="btn primary" data-live-start><i data-lucide="plug"></i>Conectar mensagens</button>');
  if(L.status==='denied') return box('lock','Conector sem permissão',esc(L.msg),'<button class="btn" data-live-start><i data-lucide="refresh-cw"></i>Tentar de novo</button>');
  if(L.status==='loading') return '<div class="card loading">Carregando conversas…</div>';
  return `<div class="card"><div class="empty"><span class="em-ico"><i data-lucide="plug-zap"></i></span><b>Falta ligar o servidor de conexões</b>
    <p>As mensagens chegam por um pequeno servidor seu, na nuvem, que conversa com o WhatsApp e o Instagram. O passo a passo está no arquivo <b>GUIA.md</b>, na pasta <b>Site Esro/esro-conexoes</b>.</p>
    <div class="steps" style="text-align:left;width:100%;max-width:880px">
      <div class="step"><span class="sn">1</span><b>Publique o servidor</b><small>Supabase + Render, gratuitos</small></div>
      <div class="step"><span class="sn">2</span><b>Ligue a Meta</b><small>WhatsApp (coexistência) e Instagram</small></div>
      <div class="step"><span class="sn">3</span><b>Adicione o conector</b><small>claude.ai → Configurações → Conectores → nome <b>${CONN}</b></small></div>
      <div class="step"><span class="sn">4</span><b>Volte aqui</b><small>e toque em Tentar de novo</small></div></div>
    <button class="btn primary" data-live-start><i data-lucide="refresh-cw"></i>Tentar de novo</button></div></div>`;
}
function vLive(){
  if(!['ok','down'].includes(L.status)) return liveSetup();
  const list=L.convs.filter(c=>(S.ch==='todos'||c.canal===S.ch)&&(!S.q||[c.nome,c.usuario,c.contato,c.ultima_mensagem].some(x=>x&&String(x).toLowerCase().includes(S.q.toLowerCase()))));
  if(L.sel&&!L.convs.find(c=>c.id===L.sel)) L.sel=null;
  const c=L.convs.find(x=>x.id===L.sel);
  const nm=c=>c.nome||(c.usuario?'@'+c.usuario:c.contato)||'Cliente';
  const lead=c&&D.leads.find(l=>digits(l.contact)&&digits(l.contact).slice(-8)===digits(c.contato).slice(-8) || (c.usuario&&String(l.contact).toLowerCase()==='@'+c.usuario.toLowerCase()));
  const fb=c&&(c.canal==='whatsapp'?waLink(c.contato,S.compose):igLink(c.contato));
  const cli=c&&findClient({contact:liveContact(c)});
  return `${L.status==='down'?`<div class="banner"><i data-lucide="wifi-off"></i><div>${esc(L.msg)} ${L.at?`Mostrando a lista de ${tfmt(L.at)}.`:''}</div></div>`:''}
  <section class="card inbox ${S.showChat&&c?'show-chat':''}">
    <div class="convs"><div class="convs-head"><b>Conversas</b><small><span><span class="dot wa"></span> WhatsApp</span><span><span class="dot ig"></span> Instagram</span>${L.at?`<span>atualizado ${tfmt(L.at)}</span>`:''}</small></div>
      <div class="conv-list">${list.map(x=>`<button class="conv ${x.id===L.sel?'on':''}" data-live="${esc(x.id)}"><span class="av-ch"><span class="avatar">${initials(nm(x))}</span>${CH[x.canal]?`<span class="chi ${CH[x.canal].dot}"><i data-lucide="${CH[x.canal].icon}"></i></span>`:''}</span><span class="grow"><span class="t"><b>${esc(nm(x))}</b><small>${dshort(x.ultima_em)}</small></span><p>${esc(x.ultima_mensagem||'')}</p>${x.nao_lidas?`<span class="unread">${x.nao_lidas}</span>`:''}</span></button>`).join('')||`<p class="hint" style="padding:16px">${L.convs.length?'Nenhuma conversa neste filtro.':'Nenhuma mensagem recebida ainda. Assim que um cliente escrever, a conversa aparece aqui.'}</p>`}</div></div>
    <div class="chat">${c?`
      <div class="chat-head"><button class="iconbtn back" data-back aria-label="Voltar"><i data-lucide="arrow-left"></i></button><span class="avatar">${initials(nm(c))}</span><div class="grow"><b>${esc(nm(c))}</b><small>${CH[c.canal]?.long||''} · ${esc(c.contato||'')}</small></div>
        <span class="badge ${c.pode_responder?'b-ok':'b-warn'}" title="O WhatsApp e o Instagram só deixam responder até 24 h depois da última mensagem do cliente">${c.pode_responder?'Janela de 24 h aberta':'Fora da janela de 24 h'}</span>
        ${lead?`<button class="btn sm" data-lead-go="${lead.id}"><i data-lucide="notebook-pen"></i>Atendimento</button>`:S.canWrite?`<button class="btn sm" data-live-lead><i data-lucide="user-plus"></i>Registrar atendimento</button>`:''}
        ${cli?`<button class="btn sm" data-cedit="${cli.id}"><i data-lucide="user-round"></i>Cliente</button>`:S.canWrite?`<button class="btn sm" data-live-client><i data-lucide="user-plus"></i>Cadastrar cliente</button>`:''}
        ${S.canWrite?`<button class="btn sm" data-live-order><i data-lucide="plus"></i>Criar pedido</button>`:''}</div>
      <div class="msgs" id="lmsgs">${L.msgsFor!==c.id?'<p class="hint">Carregando mensagens…</p>':L.msgs.map(m=>`<div class="msg ${m.direcao==='in'?'in':'out'}">${esc(m.texto||'')}<time>${dtime(m.em)}${m.direcao==='out'?` · ${m.origem==='app'?'pelo celular':'pelo painel'}${m.status&&m.status!=='sent'?' · '+({delivered:'entregue',read:'lida',failed:'falhou'}[m.status]||m.status):''}`:''}</time></div>`).join('')}</div>
      <div class="quick">${quickReplies().map(([ic,lb],i)=>`<button class="chip" data-qr="${i}"><i data-lucide="${ic}"></i>${lb}</button>`).join('')}<button class="chip" data-pix style="border-color:var(--sage);color:var(--ok)"><i data-lucide="qr-code"></i>Gerar PIX</button></div>
      ${S.pixOpen?(D.settings.pixKey?`<div class="pixbox"><label>Valor (R$)<input class="inp tnum" id="pixV" type="number" min="0.01" step="0.01" value="${S.pix?.v||''}"></label><label>Descrição<input class="inp" id="pixD" maxlength="40" value="${esc(S.pix?.d||'')}"></label><button class="btn primary" data-pixgo><i data-lucide="qr-code"></i>Gerar</button></div>`
        :`<div class="banner" style="margin:10px 14px 0"><i data-lucide="info"></i><div>Cadastre sua chave PIX em <button class="linkish" data-nav="settings">Configurações</button> para gerar cobranças.</div></div>`):''}
      ${S.pix&&S.pix.lead===c.id&&S.pix.code?`<div class="qrwrap"><div class="qr" id="qrBox"></div><div style="min-width:0;display:flex;flex-direction:column;gap:6px"><b>PIX de ${fmt(S.pix.v)}</b><small style="color:var(--text2)">${esc(S.pix.d||'')} · chave ${esc(pixKey())}</small><code>${esc(S.pix.code)}</code><div class="compose-actions"><button class="btn sm" data-copy-pix><i data-lucide="copy"></i>Copiar código</button></div></div></div>`:''}
      <div class="compose-box"><textarea class="inp" id="compose" rows="3" placeholder="${c.pode_responder?'Escreva a resposta ou toque numa resposta rápida…':'Fora da janela de 24 h: responda pelo app do celular.'}">${esc(S.compose)}</textarea>
        <div class="compose-actions">${c.pode_responder?`<button class="btn primary" data-live-send ${L.sending?'disabled':''}><i data-lucide="send"></i>${L.sending?'Enviando…':'Enviar pelo '+CH[c.canal].label}</button>`:''}
          ${fb?`<a class="btn ${c.pode_responder?'':'primary'}" href="${esc(fb)}" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link"></i>Abrir no app</a>`:''}
          <button class="btn" data-copy-compose><i data-lucide="copy"></i>Copiar</button></div></div>
    `:'<p class="hint" style="padding:24px">Selecione uma conversa.</p>'}</div></section>`;
}
function siteOrderPreset(o){
  const d=o.dados||{}; const itens=Array.isArray(d.itens)?d.itens:Array.isArray(d.items)?d.items:[];
  const iname=i=>i.nome||i.name||i.produto||i.title||'Item'; const total=+(d.total??d.valor??d.amount)||itens.reduce((a,i)=>a+(+(i.valor??i.price??0))*(+(i.qtd??i.quantity??1)),0);
  const item=itens.length===1?iname(itens[0]):itens.length?`Pedido do site (${itens.length} itens)`:'Pedido do site';
  const match=catItems().find(x=>x.name.toLowerCase()===item.toLowerCase());
  const c=d.cliente||d.customer||{}; const client=typeof c==='string'?c:(c.nome||c.name||d.nome||'');
  return {ch:'site',client,contact:d.telefone||d.whatsapp||c.telefone||c.phone||d.email||c.email||'',ref:String(d.numero??d.id??o.referencia),city:d.cidade||c.cidade||'',item,catN:match?.catN||'',kind:match?.kind==='fisico'?'fisico':'digital',value:total||'',
    pay:/pix/i.test(d.pagamento||d.payment||'')?'PIX':'Cartão',payS:(d.pago||/pago|paid|aprovado|approved/i.test(d.status||''))?'Pago':'Aguardando',
    note:itens.length>1?itens.map(i=>`${i.qtd??i.quantity??1}x ${iname(i)}`).join('\n'):(d.observacoes||d.obs||''),siteOrderId:o.id};
}

/* ---------- Estoque ---------- */
const UNITS=['un','folhas','pacote','rolo','m','cm','kg','g','caixa','bloco'];
const MOVE_REASONS={in:['Compra','Produção','Devolução','Outro'],out:['Venda','Uso na produção','Perda ou defeito','Brinde','Outro']};
const stockState=s=>{ const q=+s.qty||0; if(q<=0) return ['b-primary','Zerado',2]; if(q<=(+s.min||0)) return ['b-warn','Abaixo do mínimo',1]; const d=daysLeft(s); if(d!=null&&d<=leadOf(s)) return ['b-warn',`Acaba em ~${Math.max(1,Math.round(d))} dia(s)`,1]; return ['b-ok','OK',0]; };
const lowStock=()=>D.stock.filter(s=>stockState(s)[2]>0);
const qfmt=n=>(+n||0).toLocaleString('pt-BR',{maximumFractionDigits:2});
function vStock(){
  const tab=S.stockTab||'todos';
  const list=D.stock.filter(s=>(tab==='todos'||(tab==='baixo'?stockState(s)[2]>0:s.kind===tab))&&(!S.q||[s.name,s.supplier,s.note].some(x=>x&&x.toLowerCase().includes(S.q.toLowerCase()))))
    .sort((a,b)=>stockState(b)[2]-stockState(a)[2]||String(a.name).localeCompare(String(b.name),'pt-BR'));
  const value=D.stock.reduce((a,s)=>a+(+s.qty>0?+s.qty:0)*(+s.cost||0),0); const low=lowStock();
  const dis=S.canWrite?'':'disabled';
  const head=`${roBanner()}<div class="page-head"><div><h2>Estoque</h2><p>Produtos prontos e insumos de produção, com alerta quando chegam no mínimo.</p></div>
    <div class="toolbar"><button class="btn" data-xl="stock"><i data-lucide="file-spreadsheet"></i>Exportar</button><button class="btn" data-snew="insumo" ${dis}><i data-lucide="scissors"></i>Novo insumo</button><button class="btn primary" data-snew="produto" ${dis}><i data-lucide="package-plus"></i>Novo produto</button></div></div>`;
  if(!D.stock.length) return head+`<div class="card">${emptyState('package','Estoque vazio','Cadastre os produtos que você deixa prontos (agendas, planners, bloquinhos) e os insumos que usa para produzir: papéis, capas, espirais, elásticos, embalagens.',S.canWrite?'<div class="compose-actions" style="justify-content:center"><button class="btn primary" data-snew="produto"><i data-lucide="package-plus"></i>Cadastrar produto</button><button class="btn" data-snew="insumo"><i data-lucide="scissors"></i>Cadastrar insumo</button></div>':'')}</div>`;
  return head+`<section class="grid kpis3">
    <div class="card kpi"><div class="lbl"><span class="ico sage"><i data-lucide="boxes"></i></span>Itens cadastrados</div><div class="val tnum">${D.stock.length}</div><div class="foot split"><span class="mini">📦 Produtos ${D.stock.filter(s=>s.kind==='produto').length}</span><span class="mini">✂️ Insumos ${D.stock.filter(s=>s.kind==='insumo').length}</span></div></div>
    <div class="card kpi"><div class="lbl"><span class="ico"><i data-lucide="alert-triangle"></i></span>Precisam de reposição</div><div class="val tnum" style="color:${low.length?'var(--crit)':'inherit'}">${low.length}</div><div class="foot">${low.length?esc(low.slice(0,3).map(s=>s.name).join(', '))+(low.length>3?'…':''):'Tudo acima do mínimo'}</div></div>
    <div class="card kpi"><div class="lbl"><span class="ico sand"><i data-lucide="coins"></i></span>Valor em estoque</div><div class="val tnum">${fmt(value)}</div><div class="foot">Quantidade × custo unitário</div></div>
  </section>
  ${restockCard()}
  <div class="toolbar"><div class="seg">${[['todos','Todos'],['produto','Produtos'],['insumo','Insumos'],['baixo',`Reposição${low.length?' ('+low.length+')':''}`]].map(([k,l])=>`<button class="${tab===k?'on':''}" data-stab="${k}">${l}</button>`).join('')}</div></div>
  <div class="card" style="padding:0"><div class="table-wrap"><table><thead><tr><th>Item</th><th>Tipo</th><th class="num">Quantidade</th><th class="num">Mínimo</th><th>Situação</th><th class="num">Custo un.</th><th class="num">Valor</th><th></th></tr></thead><tbody>
  ${list.map(s=>{const st=stockState(s);return `<tr data-sedit="${s.id}"><td><b>${esc(s.name)}</b>${s.supplier?`<br><small style="color:var(--text2)">${esc(s.supplier)}</small>`:''}</td><td><span class="badge ${s.kind==='produto'?'b-primary':'b-ok'}">${s.kind==='produto'?'Produto':'Insumo'}</span></td>
    <td class="num"><span style="display:inline-flex;align-items:center;gap:6px">${S.canWrite?`<button class="del" data-sq="${s.id}:-1" aria-label="Tirar 1"><i data-lucide="minus"></i></button>`:''}<b class="tnum">${qfmt(s.qty)}</b> <small style="color:var(--text2)">${esc(s.unit||'un')}</small>${S.canWrite?`<button class="del" data-sq="${s.id}:1" aria-label="Somar 1"><i data-lucide="plus"></i></button>`:''}</span></td>
    <td class="num">${qfmt(s.min)}</td><td><span class="badge ${st[0]}">${st[1]}</span>${(d=>d==null||/^Acaba/.test(st[1])?'':`<br><small style="color:var(--text2)" title="Estimativa pelo consumo dos últimos 30 dias">dura ~${Math.round(d)} dias</small>`)(daysLeft(s))}</td><td class="num">${s.cost?fmt(s.cost):'—'}</td><td class="num">${s.cost?fmt(Math.max(0,+s.qty||0)*s.cost):'—'}</td>
    <td>${S.canWrite?`<button class="btn sm" data-smove="${s.id}"><i data-lucide="arrow-left-right"></i>Movimentar</button>`:''}</td></tr>`}).join('')||`<tr><td colspan="8" style="text-align:center;color:var(--text2);padding:28px">Nenhum item neste filtro.</td></tr>`}
  </tbody></table></div></div>`;
}
function openStock(id, kind){
  const s=id?D.stock.find(x=>x.id===id):null; const v=s||{kind:kind||'produto',name:'',unit:'un',qty:0,min:0,cost:'',lead:7,supplier:'',note:''}; const dis=S.canWrite?'':'disabled'; delArm=null;
  const names=v.kind==='produto'?catItems().filter(i=>i.kind==='fisico').map(i=>i.name):[];
  $('#modalRoot').innerHTML=`<div class="overlay" data-close><div class="modal" role="dialog" aria-modal="true" aria-labelledby="st" style="width:min(620px,100%)">
    <div class="modal-head"><h3 id="st">${s?esc(s.name):v.kind==='produto'?'Novo produto':'Novo insumo'}</h3><button class="close" data-x aria-label="Fechar"><i data-lucide="x"></i></button></div>
    <div class="modal-body form" style="display:grid">
      <label>Tipo<select class="inp" id="s2-kind" ${dis}><option value="produto" ${v.kind==='produto'?'selected':''}>Produto pronto</option><option value="insumo" ${v.kind==='insumo'?'selected':''}>Insumo de produção</option></select></label>
      <label><span>Nome <span class="req">*</span></span><input class="inp" id="s2-name" list="dl-stock" value="${esc(v.name)}" placeholder="${v.kind==='produto'?'Ex.: Planner personalizado A5':'Ex.: Papel pólen 90 g A5'}" ${dis}><datalist id="dl-stock">${names.map(n=>`<option value="${esc(n)}">`).join('')}</datalist></label>
      <label>Unidade<select class="inp" id="s2-unit" ${dis}>${UNITS.map(u=>`<option ${u===(v.unit||'un')?'selected':''}>${u}</option>`).join('')}</select></label>
      <label>${s?'Quantidade atual':'Quantidade inicial'}<input class="inp tnum" id="s2-qty" type="number" step="any" value="${esc(v.qty)}" ${s?'disabled title="Use Movimentar para mudar a quantidade"':dis}></label>
      <label>Estoque mínimo<input class="inp tnum" id="s2-min" type="number" min="0" step="any" value="${esc(v.min)}" ${dis}></label>
      <label>Custo unitário (R$)<input class="inp tnum" id="s2-cost" type="number" min="0" step="0.01" value="${esc(v.cost)}" ${dis}></label>
      <label>Prazo de reposição (dias)<input class="inp tnum" id="s2-lead" type="number" min="0" step="1" value="${esc(v.lead||7)}" title="Quantos dias leva para o item chegar depois de comprar" ${dis}></label>
      <label>Fornecedor<input class="inp" id="s2-supplier" value="${esc(v.supplier)}" ${dis}></label>
      ${s?`<small class="full" style="color:var(--text2)">${(d=>d==null?'Sem saídas nos últimos 30 dias para estimar a duração.':`Pelo consumo dos últimos 30 dias, dura cerca de ${Math.round(d)} dia(s). O painel avisa quando faltar menos que o prazo de reposição.`)(daysLeft(s))}</small>`:''}
      <label class="full">Observações<textarea class="inp" id="s2-note" rows="2" ${dis}>${esc(v.note)}</textarea></label>
      ${s?`<div class="fieldset full"><h4>Últimas movimentações</h4>${(s.moves||[]).slice(-12).reverse().map(m=>`<div class="kv"><span>${dtime(m.at)} · ${esc(m.reason||'')}${m.obs?' · '+esc(m.obs):''}</span><span class="tnum" style="color:${m.delta<0?'var(--crit)':'var(--ok)'}">${m.delta>0?'+':''}${qfmt(m.delta)} → ${qfmt(m.after)}</span></div>`).join('')||'<p class="hint">Nenhuma movimentação ainda.</p>'}</div>`:''}
    </div>
    <div class="modal-foot">${s&&S.canWrite?`<button class="btn danger" data-sdel="${s.id}" style="margin-right:auto"><i data-lucide="trash-2"></i>Excluir</button><button class="btn" data-smove="${s.id}"><i data-lucide="arrow-left-right"></i>Movimentar</button>`:''}
      <button class="btn" data-x>Cancelar</button>${S.canWrite?`<button class="btn primary" data-ssave2="${s?s.id:''}"><i data-lucide="check"></i>${s?'Salvar':'Cadastrar'}</button>`:''}</div></div></div>`;
  icons(); if(!s) $('#s2-name').focus();
}
async function saveStock(id){
  const g=k=>$('#s2-'+k).value.trim(); const name=g('name'); if(!name){ $('#s2-name').focus(); toast('Informe o nome',1); return; }
  const data={kind:g('kind'),name,unit:g('unit'),min:Math.max(0,parseFloat(g('min'))||0),cost:parseFloat(g('cost'))||0,lead:Math.max(0,parseInt(g('lead'))||0)||7,supplier:g('supplier'),note:g('note'),updatedAt:new Date().toISOString()};
  if(id){ if(await write(()=>DB.doc('stock/'+id).update(data),'Item atualizado')) closeModal(); return; }
  const qty=parseFloat(g('qty'))||0; const now=new Date().toISOString();
  Object.assign(data,{qty,moves:qty?[{at:now,delta:qty,after:qty,reason:'Estoque inicial'}]:[]});
  if(await write(()=>DB.collection('stock').add(data),`${name} cadastrado`)) closeModal();
}
function openMove(id){
  const s=D.stock.find(x=>x.id===id); if(!s) return;
  $('#modalRoot').innerHTML=`<div class="overlay" data-close><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mv" style="width:min(480px,100%)">
    <div class="modal-head"><div><h3 id="mv">Movimentar estoque</h3><small style="color:var(--text2)">${esc(s.name)} · agora ${qfmt(s.qty)} ${esc(s.unit||'un')}</small></div><button class="close" data-x aria-label="Fechar"><i data-lucide="x"></i></button></div>
    <div class="modal-body form" style="display:grid">
      <label class="full">Tipo<select class="inp" id="mv-type"><option value="in">Entrada (somar)</option><option value="out">Saída (tirar)</option><option value="set">Ajuste de inventário (definir quantidade)</option></select></label>
      <label><span>Quantidade <span class="req">*</span></span><input class="inp tnum" id="mv-qty" type="number" min="0" step="any"></label>
      <label>Motivo<select class="inp" id="mv-reason">${MOVE_REASONS.in.map(r=>`<option>${r}</option>`).join('')}</select></label>
      <label class="full" id="mv-costL">Valor pago nesta compra (R$)<input class="inp tnum" id="mv-cost" type="number" min="0" step="0.01" data-sid="${s.id}" placeholder="Opcional: lança a despesa no fluxo de caixa"></label>
      <label class="full">Observação<input class="inp" id="mv-obs" placeholder="Ex.: pedido #1052, nota do fornecedor…"></label>
    </div>
    <div class="modal-foot"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-mvgo="${s.id}"><i data-lucide="check"></i>Registrar</button></div></div></div>`;
  icons(); $('#mv-qty').focus();
}
async function moveStock(id, delta, reason, obs, setTo){
  const s=D.stock.find(x=>x.id===id); if(!s) return false; const before=+s.qty||0;
  const after=setTo!=null?setTo:Math.round((before+delta)*1000)/1000; const d=Math.round((after-before)*1000)/1000; if(!d){ toast('A quantidade não mudou'); return true; }
  const now=new Date().toISOString(); const moves=[...(s.moves||[]),{at:now,delta:d,after,reason,obs:obs||''}].slice(-150);
  const ok=await write(()=>DB.doc('stock/'+id).update({qty:after,moves,updatedAt:now}));
  if(ok){ const st=stockState({...s,qty:after}); toast(st[2]>0?`${s.name}: ${qfmt(after)} ${s.unit||'un'} · ${st[1].toLowerCase()}`:`${s.name}: ${qfmt(after)} ${s.unit||'un'}`, st[2]>0); }
  return ok;
}

/* ---------- Catálogo ---------- */
function vCatalog(){
  const cats=D.catalog; const total=cats.reduce((a,c)=>a+(c.items||[]).length,0), on=cats.reduce((a,c)=>a+(c.items||[]).filter(i=>i.on).length,0);
  const qTotal=S.quote.reduce((a,l)=>a+l.qty*l.price,0); const dis=S.canWrite?'':'disabled';
  const phoneLink=waLink(S.quotePhone, S.quote.length?quoteText():'');
  return `${roBanner()}<div class="page-head"><div><h2>Catálogo & serviços</h2><p>${on} de ${total} itens visíveis no site · preços importados do site da ESRO</p></div>
    <div class="toolbar"><span class="pill-note"><span class="dot" style="background:var(--primary)"></span>Físico</span><span class="pill-note"><span class="dot" style="background:var(--sage)"></span>Digital / Assessoria</span></div></div>
  ${!cats.length?`<div class="card">${emptyState('book-open','Catálogo vazio','Os produtos e serviços aparecem aqui assim que forem cadastrados.')}</div>`:`
  <section class="grid cat-layout">
    <div class="grid" style="gap:12px">${cats.map(c=>`<div class="card cat-block ${S['open'+c.n]??(c.n==='01'||c.n==='07')?'open':''}">
      <button class="cat-top" data-cat="${c.n}"><span class="cat-num">${c.n}</span><span class="grow"><b>${esc(c.t)}</b><br><small>${esc(c.d)} · ${(c.items||[]).filter(i=>i.on).length}/${(c.items||[]).length} no site</small></span>
        <span class="badge ${c.kind==='fisico'?'b-primary':c.kind==='digital'?'b-ok':'b-neutral'}">${c.kind==='fisico'?'Físico':c.kind==='digital'?'Digital':'Misto'}</span><i class="chev" data-lucide="chevron-down"></i></button>
      <div class="items">${(c.items||[]).map((it,ii)=>`<div class="it ${it.on?'':'off'}"><div class="nm">${esc(it.name)}<small>${esc(it.desc||(!it.min&&!it.max?'Sob consulta':it.min===it.max?'Preço fixo':'Faixa de preço'))}</small></div>
        <label class="price" title="Preço ou faixa, ex.: 25-45"><span>R$</span><input id="p-${c.n}-${ii}" data-price="${c.n}:${ii}" value="${!it.min&&!it.max?'':it.min===it.max?it.min:it.min+'-'+it.max}" placeholder="consulta" aria-label="Preço de ${esc(it.name)}" ${dis}></label>
        <button class="switch" role="switch" aria-checked="${!!it.on}" data-tog="${c.n}:${ii}" ${dis}><span class="tr"></span>${it.on?'No site':'Oculto'}</button>
        <span style="display:flex;gap:2px"><button class="addq" data-addq="${c.n}:${ii}" aria-label="Adicionar ao orçamento" title="Adicionar ao orçamento"><i data-lucide="plus"></i></button>${S.canWrite?`<button class="del" data-idel="${c.n}:${ii}" aria-label="Remover item" title="Remover item"><i data-lucide="trash-2"></i></button>`:''}</span></div>`).join('')}
        ${S.canWrite?`<div class="it-add"><input class="inp" id="new-${c.n}" placeholder="Novo item em ${esc(c.t)}"><input class="inp tnum" id="newp-${c.n}" placeholder="R$ ex.: 25-45"><button class="btn sm" data-iadd="${c.n}"><i data-lucide="plus"></i>Adicionar</button></div>`:''}</div></div>`).join('')}</div>
    <aside class="card quote"><div><h3>Orçamento rápido</h3><p class="hint">Monte com o botão + e envie pelo WhatsApp ou em PDF.</p></div>
      <input class="inp" id="qClient" placeholder="Nome do cliente" value="${esc(S.quoteClient)}">
      <input class="inp" id="qPhone" placeholder="WhatsApp do cliente (opcional)" value="${esc(S.quotePhone)}">
      <div class="sheet"><div class="sh-head"><div><b>ESRO</b><div class="script">Pequenos detalhes, grandes propósitos.</div></div><small style="color:var(--text2);text-align:right">Orçamento<br>${new Date().toLocaleDateString('pt-BR')}</small></div>
        ${S.quote.length?`<div class="qline" style="color:var(--text2);font-size:11px;font-weight:700"><span>ITEM</span><span>QTD</span><span style="text-align:right">UNIT.</span><span></span></div>`+S.quote.map((l,i)=>`<div class="qline"><span>${esc(l.name)}</span><input type="number" min="1" id="qq-${i}" data-qqty="${i}" value="${l.qty}" aria-label="Quantidade"><input type="number" min="0" step="0.01" id="qp-${i}" data-qprice="${i}" value="${l.price}" aria-label="Valor unitário"><button class="x" data-qdel="${i}" aria-label="Remover"><i data-lucide="x"></i></button></div>`).join('')+`<div class="qtotal"><span>Total</span><span class="tnum" id="qTot">${fmt(qTotal)}</span></div>`:`<p class="hint" style="text-align:center;padding:14px 0">Nenhum item ainda.<br>Use o + ao lado de um produto.</p>`}
        <small style="color:var(--text2)">WhatsApp (11) 99248-1676 · @esro.papelaria</small></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${phoneLink&&S.quote.length?`<a class="btn primary" id="qWa" href="${esc(phoneLink)}" target="_blank" rel="noopener noreferrer"><i data-lucide="message-circle"></i>Enviar no WhatsApp</a>`:''}
        <button class="btn ${phoneLink?'':'primary'}" data-qcopy ${S.quote.length?'':'disabled'}><i data-lucide="copy"></i>Copiar texto</button>
        ${DL&&window.jspdf?`<button class="btn" data-qpdf ${S.quote.length?'':'disabled'}><i data-lucide="file-down"></i>Baixar PDF</button>`:''}
        <button class="btn" data-qclear ${S.quote.length?'':'disabled'}><i data-lucide="eraser"></i>Limpar</button></div>
    </aside>
  </section>`}`;
}
function parsePrice(s){ const n=(String(s).match(/\d+(?:[.,]\d+)?/g)||[]).map(x=>parseFloat(x.replace(',','.'))); return n.length?{min:Math.min(...n),max:Math.max(...n)}:{min:0,max:0}; }
async function setItems(n, items, msg){ await write(()=>DB.doc('catalog/c'+n).update({items}), msg); }
function quoteText(){
  const lines=S.quote.map(l=>`• ${l.qty}x ${l.name}: ${fmt(l.price*l.qty)}`).join('\n'); const tot=S.quote.reduce((a,l)=>a+l.qty*l.price,0);
  return `🌿 *Orçamento ESRO*${S.quoteClient?` para ${S.quoteClient}`:''}\n\n${lines}\n\n*Total: ${fmt(tot)}*\n\n${D.settings.prazo||'Prazo de produção e entrega combinado no orçamento.'}\n${D.settings.assinatura||'Pequenos detalhes, grandes propósitos. 💛'}`;
}
async function quotePdf(){
  const { jsPDF } = window.jspdf; const doc=new jsPDF({unit:'mm',format:'a4'}); const W=210;
  const terra=[156,82,55], cafe=[62,49,43], cinza=[124,113,106], areia=[234,208,195];
  doc.setFillColor(249,246,240); doc.rect(0,0,W,297,'F');
  doc.setTextColor(...cafe); doc.setFont('helvetica','bold'); doc.setFontSize(26); doc.text('ESRO',20,28);
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(...cinza); doc.text('PAPELARIA  •  PERSONALIZADOS  •  SOLUÇÕES EDUCACIONAIS',20,34);
  doc.setFont('times','italic'); doc.setFontSize(13); doc.setTextColor(...terra); doc.text('Pequenos detalhes, grandes propósitos.',20,42);
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(...cafe); doc.text('ORÇAMENTO',W-20,28,{align:'right'});
  doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(...cinza); doc.text(new Date().toLocaleDateString('pt-BR'),W-20,34,{align:'right'});
  doc.setDrawColor(...areia); doc.setLineWidth(.5); doc.line(20,50,W-20,50);
  let y=62; if(S.quoteClient){ doc.setTextColor(...cinza); doc.setFontSize(9); doc.text('PARA',20,y); doc.setTextColor(...cafe); doc.setFontSize(12); doc.text(S.quoteClient,20,y+6); y+=18; }
  doc.setFontSize(8.5); doc.setTextColor(...cinza); doc.text('ITEM',20,y); doc.text('QTD',130,y,{align:'right'}); doc.text('UNITÁRIO',160,y,{align:'right'}); doc.text('TOTAL',W-20,y,{align:'right'}); y+=3; doc.line(20,y,W-20,y); y+=8;
  doc.setFontSize(10.5); doc.setTextColor(...cafe);
  S.quote.forEach(l=>{ const lines=doc.splitTextToSize(l.name,95); doc.text(lines,20,y); doc.text(String(l.qty),130,y,{align:'right'}); doc.text(fmt(l.price),160,y,{align:'right'}); doc.text(fmt(l.price*l.qty),W-20,y,{align:'right'}); y+=6*lines.length+3; if(y>250){ doc.addPage(); doc.setFillColor(249,246,240); doc.rect(0,0,W,297,'F'); y=24; } });
  doc.line(20,y,W-20,y); y+=9; doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(...terra); doc.text('Total',20,y); doc.text(fmt(S.quote.reduce((a,l)=>a+l.qty*l.price,0)),W-20,y,{align:'right'});
  y+=14; doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(...cinza); doc.text(doc.splitTextToSize(D.settings.prazo||'Prazo de produção e entrega combinado no orçamento.',W-40),20,y);
  if(D.settings.pixKey){ y+=10; doc.text(`Pagamento via PIX · chave ${pixKey()}`,20,y); }
  doc.setFontSize(9); doc.text('WhatsApp (11) 99248-1676  •  Instagram @esro.papelaria',W/2,282,{align:'center'});
  const name=`orcamento-esro-${(S.quoteClient||'cliente').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9]+/g,'-').toLowerCase()}.pdf`;
  try{ await DL.save({filename:name,data:doc.output('blob')}); toast('PDF salvo'); }catch(e){ if(e&&e.code!=='declined') toast(errMsg(e),1); }
}

/* ---------- Personalização ---------- */
function vArts(){
  const list=allFiles().filter(f=>inCh(f.order)&&(!S.q||matchQ(f.order)||f.name.toLowerCase().includes(S.q.toLowerCase()))).sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  const orders=[...D.orders].sort((a,b)=>(b.num||0)-(a.num||0));
  return `${roBanner()}<div class="page-head"><div><h2>Personalização & arquivos</h2><p>Artes em aprovação e arquivos que os clientes enviaram, ligados aos pedidos.</p></div></div>
  ${S.canWrite&&ASSETS?(orders.length?`<div class="drop" id="drop"><i data-lucide="upload-cloud"></i><b>Anexar arquivos a um pedido</b>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;width:100%"><select class="inp" id="artOrder" style="max-width:320px"><option value="">Escolha o pedido…</option>${orders.map(o=>`<option value="${o.id}" ${S.artOrder===o.id?'selected':''}>#${o.num} · ${esc(o.client)} · ${esc(o.item)}</option>`).join('')}</select>
      <label class="btn primary" style="cursor:pointer"><i data-lucide="paperclip"></i>Escolher arquivos<input type="file" id="artFiles" multiple hidden accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf,.csv,.txt,.md,.json"></label></div>
      <small>Ou arraste os arquivos para cá · PNG, JPG, WEBP, SVG, PDF, CSV ou TXT, até 20 MB</small></div>`
    :`<div class="card">${emptyState('palette','Nenhum pedido para anexar arquivos','Registre um pedido primeiro; as artes e os briefings ficam ligados a ele.',`<button class="btn primary" data-neworder><i data-lucide="plus"></i>Registrar pedido</button>`)}</div>`):''}
  ${list.length?`<section class="grid arts">${list.map(f=>`<div class="card art"><a class="img" href="/_blob/${esc(f.id)}" target="_blank" rel="noopener" style="background:var(--sand-soft);color:var(--primary)">${/^image\//.test(f.type)?`<img src="/_blob/${esc(f.id)}" alt="${esc(f.name)}" loading="lazy">`:`<i data-lucide="file-text"></i>`}<span class="fmt">${esc((f.name.split('.').pop()||'').toUpperCase())}</span></a>
    <b style="overflow-wrap:anywhere">${esc(f.name)}</b><small>${esc(f.order.client)} · pedido #${f.order.num} · ${dshort(f.at)}</small>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${chBadge(f.order.ch)}<span class="badge ${FILE_ST[f.st]?.[0]||'b-neutral'}">${FILE_ST[f.st]?.[1]||''}</span></div>
    <div class="acts">${S.canWrite&&f.st!=='aprovada'?`<button class="btn sm sage" data-fset="${f.order.id}:${f.i}:aprovada"><i data-lucide="check"></i>Aprovada</button>`:''}${S.canWrite&&f.st==='recebido'?`<button class="btn sm" data-fset="${f.order.id}:${f.i}:aguardando"><i data-lucide="send"></i>Enviada p/ aprovação</button>`:''}${S.canWrite&&f.st==='aguardando'?`<button class="btn sm" data-fset="${f.order.id}:${f.i}:ajuste"><i data-lucide="pencil"></i>Ajuste</button>`:''}<button class="btn sm" data-open="${f.order.id}"><i data-lucide="shopping-bag"></i>Pedido</button></div></div>`).join('')}</section>`
  :orders.length?`<div class="card">${emptyState('image','Nenhum arquivo ainda','Os arquivos anexados aos pedidos aparecem aqui com o status de aprovação.')}</div>`:''}`;
}

/* ---------- Relatórios ---------- */
function vReports(){
  if(!D.orders.length) return `<div class="page-head"><div><h2>Relatórios & métricas</h2><p>Faturamento, mais vendidos e ticket médio.</p></div></div><div class="card">${emptyState('trending-up','Sem dados para relatório','Os relatórios são calculados a partir dos pedidos registrados.')}</div>`;
  const now=new Date(); const ms=[...Array(6)].map((_,i)=>shiftMonth(now,i-5)); const keys=ms.map(monthKey);
  const tot=D.orders.filter(o=>keys.includes(o.month)).reduce((a,o)=>a+(+o.value||0),0);
  const byCh=['site','whatsapp','instagram'].map(c=>{const os=D.orders.filter(o=>o.ch===c);return {c,n:os.length,t:os.reduce((a,o)=>a+(+o.value||0),0)}});
  const cnt={}; D.orders.forEach(o=>{ const k=o.item; cnt[k]=cnt[k]||{n:0,v:0,cat:o.catN}; cnt[k].n++; cnt[k].v+=+o.value||0; });
  const top=Object.entries(cnt).sort((a,b)=>b[1].n-a[1].n||b[1].v-a[1].v).slice(0,6); const mx=top[0]?top[0][1].n:1;
  return `<div class="page-head"><div><h2>Relatórios & métricas</h2><p>${MONTHS[ms[0].getMonth()]} a ${MONTHS[now.getMonth()]} · ${fmt(tot)} em pedidos no período</p></div></div>
  <section class="card"><h3>Faturamento mensal por canal</h3><p class="hint">Soma dos pedidos registrados por mês</p><div class="chart-box" style="height:300px"><canvas id="cLine"></canvas></div>
    <div class="legend">${['site','whatsapp','instagram'].map(c=>`<span><span class="dot ${CH[c].dot}"></span>${CH[c].label}</span>`).join('')}</div></section>
  <section class="grid two">
    <div class="card"><h3>Mais vendidos</h3><p class="hint">Por número de pedidos</p><div class="list" style="margin-top:6px">${top.map(([n,x],i)=>`<div class="row"><span class="cat-num" style="font-size:22px;width:24px">${i+1}</span><div class="grow"><b>${esc(n)}</b><small>${x.cat?'Categoria '+esc(x.cat)+' · ':''}${fmt(x.v)}</small></div><div style="flex:0 0 32%;height:8px;background:var(--sand-soft);border-radius:99px;overflow:hidden"><div style="height:100%;width:${x.n/mx*100}%;background:var(--primary);border-radius:99px"></div></div><b class="tnum" style="width:30px;text-align:right">${x.n}</b></div>`).join('')}</div></div>
    <div class="card"><h3>Ticket médio por canal</h3><p class="hint">Todos os pedidos registrados</p><div class="list" style="margin-top:6px">${byCh.map(x=>`<div class="row">${chBadge(x.c)}<div class="grow"><small>${x.n} pedido(s) · ${fmt(x.t)}</small></div><b class="tnum">${x.n?fmt(x.t/x.n):'—'}</b></div>`).join('')}</div></div>
  </section>`;
}
function drawReports(){ if(!window.Chart||!$('#cLine')) return; const now=new Date(); const ms=[...Array(6)].map((_,i)=>shiftMonth(now,i-5)); const keys=ms.map(monthKey); const text2=tok('--text2'), line=tok('--line');
  const ds=[['site','--site'],['whatsapp','--wa'],['instagram','--ig']].map(([k,t])=>({label:CH[k].label,data:keys.map(m=>D.orders.filter(o=>o.ch===k&&o.month===m).reduce((a,o)=>a+(+o.value||0),0)),borderColor:tok(t),backgroundColor:tok(t),tension:.35,borderWidth:2.2,pointRadius:c=>c.dataIndex===5?5:2,pointHoverRadius:5}));
  charts.push(new Chart($('#cLine'),{type:'line',data:{labels:ms.map(d=>MONTHS[d.getMonth()].slice(0,3)),datasets:ds},options:{maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fmt(c.raw)}`}}},scales:{x:{grid:{display:false},ticks:{color:text2}},y:{beginAtZero:true,grid:{color:line},border:{display:false},ticks:{color:text2,callback:v=>'R$ '+v.toLocaleString('pt-BR')}}}}})); }

/* ---------- Configurações ---------- */
function vSettings(){
  const s=D.settings, dis=S.canWrite?'':'disabled';
  const card=(k,ic,bg,fg,name,sub,badge,body)=>`<div class="card"><div class="int-head"><span class="int-ico" style="background:${bg};color:${fg}"><i data-lucide="${ic}"></i></span><div class="grow"><b>${name}</b><small>${sub}</small></div>${badge}</div><div class="int-body">${body}</div></div>`;
  return `${roBanner()}<div class="page-head"><div><h2>Configurações & integrações</h2><p>O que já está ligado de verdade e o que falta para automatizar.</p></div></div>
  <section class="grid integr">
    ${card('site','globe','var(--site-soft)','var(--site)','Site / E-commerce',esc(s.siteUrl||'esro-papelaria…chatgpt.site'),(L.status==='ok'?'<span class="badge b-ok">Webhook pelo servidor</span>':'<span class="badge b-warn">Registro manual</span>'),
      `<p class="hint">Pedidos feitos no site entram aqui por <b>Pedidos → Novo pedido</b>, com o nº do pedido web na referência. Para chegarem sozinhos, o site precisa enviar cada pedido para um servidor (webhook) que grave neste painel.</p><a class="btn sm" style="align-self:flex-start" href="${esc(safeUrl(s.siteUrl)||'https://esro-papelaria.robert-silvamaia.chatgpt.site/')}" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link"></i>Abrir o site</a>`)}
    ${card('wa','message-circle','var(--wa-soft)','var(--wa)','WhatsApp','(11) 99248-1676',L.status==='ok'?'<span class="badge b-ok">API conectada</span>':'<span class="badge b-ok">Link direto ativo</span>',
      `<p class="hint">No Inbox, “Abrir no WhatsApp” abre a conversa do cliente no seu WhatsApp com a mensagem pronta (wa.me). Para <b>receber</b> as mensagens dentro do painel é preciso a API oficial do WhatsApp Business (Meta) e um servidor com webhook.</p>`)}
    ${card('ig','instagram','var(--ig-soft)','var(--ig)','Instagram Direct','@esro.papelaria',L.status==='ok'?'<span class="badge b-ok">API conectada</span>':'<span class="badge b-ok">Link direto ativo</span>',
      `<p class="hint">“Abrir Direct” leva à conversa com o perfil do cliente (ig.me). Receber as DMs no painel exige a API do Instagram (Meta) numa conta profissional e um servidor com webhook.</p>`)}
    ${card('pix','qr-code','var(--sage-soft)','var(--ok)','PIX','Cobrança com QR Code e copia e cola',s.pixKey?'<span class="badge b-ok">Ativo</span>':'<span class="badge b-warn">Falta a chave</span>',
      `<label>Tipo de chave<select class="inp" id="s-pixType" ${dis}>${[['telefone','Telefone'],['email','E-mail'],['cpf','CPF / CNPJ'],['aleatoria','Chave aleatória']].map(([k,l])=>`<option value="${k}" ${s.pixType===k?'selected':''}>${l}</option>`).join('')}</select></label>
       <label>Chave PIX<input class="inp" id="s-pixKey" value="${esc(s.pixKey||'')}" placeholder="A chave cadastrada no seu banco" ${dis}></label>
       <label>Nome do recebedor (como no banco)<input class="inp" id="s-pixName" maxlength="25" value="${esc(s.pixName||'')}" placeholder="Ex.: ESRO PAPELARIA" ${dis}></label>
       <label>Cidade do recebedor<input class="inp" id="s-pixCity" maxlength="15" value="${esc(s.pixCity||'')}" placeholder="Ex.: SAO PAULO" ${dis}></label>`)}
    ${card('conn','plug-zap','var(--primary-soft)','var(--primary)',CONN,'Servidor que recebe WhatsApp, Instagram e pedidos do site',
      ({ok:'<span class="badge b-ok">Conectado</span>',down:'<span class="badge b-warn">Sem resposta</span>',denied:'<span class="badge b-warn">Sem permissão</span>',ask:'<span class="badge b-neutral">Aguardando permissão</span>',loading:'<span class="badge b-neutral">Conectando…</span>'})[L.status]||'<span class="badge b-warn">Não instalado</span>',
      `<p class="hint">${L.status==='ok'?`Recebendo mensagens · ${L.convs.length} conversa(s) · ${L.site.length} pedido(s) do site para importar.`:L.status==='down'||L.status==='denied'?esc(L.msg):`Publique o servidor da pasta <b>Site Esro/esro-conexoes</b> (veja o GUIA.md) e adicione o conector em claude.ai → Configurações → Conectores com o nome exato <b>${CONN}</b>.`}</p>
       <button class="btn sm" style="align-self:flex-start" data-live-start><i data-lucide="refresh-cw"></i>${L.status==='ok'?'Atualizar':'Verificar conexão'}</button>`)}
  </section>
  <section class="card"><h3><i data-lucide="shield-check" style="color:var(--ok);vertical-align:-3px"></i> Segurança</h3><p class="hint">O que protege os dados do painel e o que depende de você.</p>
    <div class="list" style="margin-top:6px">
      <div class="row"><span class="badge b-ok">Ativo</span><div class="grow"><b>Dados só para administradores</b><small style="white-space:normal">${STANDALONE?'Só entra no painel quem tem a senha. Sem login, nenhum dado de pedidos, clientes, caixa ou extratos é enviado ao navegador.':'Pedidos, clientes, caixa e extratos só são lidos e alterados por quem tem acesso de edição a este painel. Quem só tem o link não vê nenhum dado.'}</small></div></div>
      <div class="row"><span class="badge b-ok">Ativo</span><div class="grow"><b>Conexão criptografada (HTTPS)</b><small style="white-space:normal">O painel, o banco de dados e o servidor de mensagens usam certificado digital válido; nada trafega em texto aberto.</small></div></div>
      <div class="row"><span class="badge b-ok">Ativo</span><div class="grow"><b>Sem código de terceiros carregado da internet</b><small style="white-space:normal">As bibliotecas de gráficos, PDF e Excel ${STANDALONE?'são servidas pelo próprio servidor da ESRO':'ficam embutidas nesta página'}, em versões fixas e conferidas.</small></div></div>
      <div class="row"><span class="badge ${S.canWrite?'b-ok':'b-neutral'}">${S.canWrite?'Administrador':'Leitura'}</span><div class="grow"><b>Seu acesso</b><small style="white-space:normal">${S.canWrite?'Você pode ver e alterar os dados.':'Você pode ver, mas não alterar.'} O painel nunca pede senha de banco, do WhatsApp ou do Instagram.</small></div></div>
      <div class="row"><span class="badge ${backupAge()!=null&&backupAge()<=14?'b-ok':'b-warn'}">${backupAge()==null?'Sem backup':backupAge()===0?'Hoje':`Há ${backupAge()} dia(s)`}</span><div class="grow"><b>Backup dos dados</b><small style="white-space:normal">Exporte tudo para o Excel a cada 15 dias e guarde o arquivo num lugar seguro. O painel avisa quando passar do prazo.</small></div><button class="btn sm" data-xl="all"><i data-lucide="download"></i>Fazer backup</button></div>
      <div class="row"><span class="badge b-neutral">Arquivo</span><div class="grow"><b>Backup completo</b><small style="white-space:normal">Um arquivo só com tudo (inclui contas e configurações), para restaurar aqui ou levar os dados para outro endereço do painel.</small></div><span style="display:inline-flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><button class="btn sm" data-bkexport><i data-lucide="hard-drive-download"></i>Baixar</button>${S.canWrite?`<label class="btn sm" style="cursor:pointer"><i data-lucide="hard-drive-upload"></i>Restaurar<input type="file" id="bkFile" accept=".json,application/json" hidden></label>`:''}</span></div>
      <div class="row"><span class="badge b-neutral">Registro</span><div class="grow"><b>Registro de atividades</b><small style="white-space:normal">Exclusões, importações, exportações e mudanças de configuração ficam anotadas com data e hora.</small></div><button class="btn sm" data-audit><i data-lucide="history"></i>Ver registro</button></div>
    </div>
    <p class="hint" style="margin-top:10px"><b style="color:var(--text)">Depende de você:</b> ${STANDALONE?'use uma senha longa e só deste painel; ative a verificação em duas etapas no GitHub, Render, Supabase, Meta e Nubank; e clique em Sair ao usar o computador de outra pessoa.':`ative a verificação em duas etapas nas contas do Claude, GitHub, Render, Supabase, Meta e Nubank; mantenha o compartilhamento deste painel como privado; e nunca compartilhe o endereço do conector ${CONN}.`}</p></section>
  <section class="card"><h3>Planilhas (Excel)</h3><p class="hint">Leve todos os dados do painel para o Excel e traga de volta: pedidos, clientes, estoque, fluxo de caixa, contas fixas, atendimentos e catálogo.</p>
    <div class="compose-actions" style="margin-top:12px"><button class="btn primary" data-xl="all"><i data-lucide="file-spreadsheet"></i>Exportar tudo (.xlsx)</button>
      ${S.canWrite?`<label class="btn" style="cursor:pointer"><i data-lucide="upload"></i>Importar do Excel<input type="file" id="xlFile" accept=".xlsx" hidden></label>`:''}</div>
    <p class="hint" style="margin-top:10px">Para alterar, edite a linha e mantenha a coluna ID. Para criar, deixe o ID em branco. Antes de gravar, o painel mostra o resumo do que vai mudar. A importação nunca apaga nada.</p></section>
  <section class="card"><h3>Mensagens e prazos</h3><p class="hint">Usados nas respostas rápidas, no orçamento e no PDF.</p><div class="form" style="margin-top:12px">
    <label class="full">Texto de prazo<input class="inp" id="s-prazo" value="${esc(s.prazo||'')}" placeholder="Prazo de produção e entrega combinado no orçamento." ${dis}></label>
    <label>Assinatura das mensagens<input class="inp" id="s-assinatura" value="${esc(s.assinatura||'')}" placeholder="Pequenos detalhes, grandes propósitos. 💛" ${dis}></label>
    <label>Endereço do site<input class="inp" id="s-siteUrl" value="${esc(s.siteUrl||'')}" placeholder="https://…" ${dis}></label></div></section>
  ${S.canWrite?`<div><button class="btn primary" data-ssave><i data-lucide="check"></i>Salvar configurações</button></div>`:''}`;
}
async function saveSettings(){ const g=k=>$('#s-'+k).value.trim(); const data={pixType:g('pixType'),pixKey:g('pixKey'),pixName:g('pixName'),pixCity:g('pixCity'),prazo:g('prazo'),assinatura:g('assinatura'),siteUrl:g('siteUrl')};
  const full={...D.settings,...data}; if(await write(()=>DB.doc('settings/store').set(full),'Configurações salvas')){ D.settings=full; logAct('Configurações alteradas','PIX, mensagens ou endereço do site'); render(); } }

/* ---------- Clientes ---------- */
const ORIGINS={instagram:['Instagram','instagram'],whatsapp:['WhatsApp','message-circle'],site:['Site','globe'],indicacao:['Indicação','heart-handshake'],evento:['Feira / evento','tent'],escola:['Escola / parceria','school'],google:['Google','search'],outro:['Outro','circle-help']};
const C_STAGE=[['info','Pediu informações','b-warn','message-circle-question','var(--warn)'],['link','Recebeu link','b-primary','link','var(--primary)'],['comprou','Já comprou','b-ok','shopping-bag','var(--ok)'],['perdido','Não fechou','b-neutral','circle-slash','var(--text2)']];
const C_RANK={perdido:0,info:1,link:2,comprou:3};
const cStage=k=>C_STAGE.find(s=>s[0]===k)||C_STAGE[0];
const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today=()=>ymd(new Date());
const plusDays=n=>{ const d=new Date(); d.setDate(d.getDate()+n); return ymd(d); };
const dmy=s=>s?`${s.slice(8,10)}/${s.slice(5,7)}`:'';
const isMail=s=>/^\S+@\S+\.\S+$/.test(String(s||'').trim());
const igH=s=>{ const m=String(s||'').match(/(?:^|\s)@([A-Za-z0-9._]{2,30})/); return m?m[1].toLowerCase():''; };
const telKey=s=>{ if(isMail(s)) return ''; const d=digits(String(s||'').replace(/@\S+/g,'')); return d.length>=8?d.slice(-8):''; };
function findClient({id,phone,ig,contact,name}){
  if(id){ const c=D.clients.find(x=>x.id===id); if(c) return c; }
  const t=telKey(phone)||telKey(contact), h=igH(ig)||igH(contact), n=String(name||'').trim().toLowerCase();
  return D.clients.find(c=>(t&&telKey(c.phone)===t)||(h&&igH(c.ig)===h)) || (!t&&!h&&n?D.clients.find(c=>String(c.name||'').trim().toLowerCase()===n):null) || null;
}
const ordersOf=c=>{ const t=telKey(c.phone), h=igH(c.ig); return D.orders.filter(o=>o.clientId===c.id||(!o.clientId&&((t&&telKey(o.contact)===t)||(h&&igH(o.contact)===h)))); };
const stageOf=c=>ordersOf(c).length?'comprou':(cStage(c.stage)[0]);
const followState=c=>!c.follow?null:!c.followAt?['b-warn','Acompanhar',1]:c.followAt<today()?['b-primary','Atrasado · '+dmy(c.followAt),2]:c.followAt===today()?['b-warn','Hoje',1]:['b-neutral','Em '+dmy(c.followAt),0];
const dueFollow=()=>D.clients.filter(c=>{ const f=followState(c); return f&&f[2]>0; });
const originBadge=c=>{ const o=ORIGINS[c.origin]||ORIGINS.outro; return CH[c.origin]?chBadge(c.origin):`<span class="badge b-neutral"><i data-lucide="${o[1]}"></i>${o[0]}</span>`; };
const followBadge=c=>{ const f=followState(c); return f?`<span class="badge ${f[0]}"><i data-lucide="bell-ring"></i>${f[1]}</span>`:''; };
const siteUrl=()=>safeUrl(D.settings.siteUrl)||'https://esro-papelaria.robert-silvamaia.chatgpt.site/';
const linkMsg=c=>`Olá, ${String(c.name||'').trim().split(/\s+/)[0]||'tudo bem'}! 💛 Aqui está o link da ESRO Papelaria, com os produtos e serviços:\n${siteUrl()}\n\nQualquer dúvida é só me chamar.${D.settings.assinatura?'\n\n'+D.settings.assinatura:''}`;
const cNotes=(c,add)=>[...(c.notes||[]),...add].slice(-200);

function unlinkedPeople(){
  const seen=new Set(), out=[]; const key=x=>telKey(x.contact)||igH(x.contact)||String(x.client||x.name||'').trim().toLowerCase();
  for(const o of D.orders){ if(o.clientId&&D.clients.some(c=>c.id===o.clientId)) continue; if(findClient({contact:o.contact,name:o.client})) continue; const k=key(o); if(!k||seen.has(k)) continue; seen.add(k); out.push({name:o.client,contact:o.contact,ch:o.ch,city:o.city,stage:'comprou'}); }
  for(const l of D.leads){ if(findClient({contact:l.contact,name:l.name})) continue; const k=key(l); if(!k||seen.has(k)) continue; seen.add(k); out.push({name:l.name,contact:l.contact,ch:l.ch,stage:l.status==='orcamento'?'link':l.status==='perdido'?'perdido':l.status==='fechado'?'comprou':'info'}); }
  return out;
}
/* Cria o cliente se ainda não existir; se existir, só avança a etapa (nunca volta). Silencioso: não atrapalha o fluxo principal. */
async function ensureClient(info, stage, note){
  if(!DB||!S.canWrite) return null; const now=new Date().toISOString();
  const h=igH(info.contact), mail=isMail(info.contact)?String(info.contact).trim():'', phone=telKey(info.contact)?String(info.contact).replace(/@\S+/g,'').trim():'';
  const ex=findClient({id:info.id,contact:info.contact,name:info.name});
  try{
    if(ex){ const up={updatedAt:now,lastAt:now}; if(C_RANK[stage]>C_RANK[cStage(ex.stage)[0]]) up.stage=stage; if(note) up.notes=cNotes(ex,[{at:now,text:note}]); if(!ex.city&&info.city) up.city=info.city; if(!ex.phone&&phone) up.phone=phone; if(!ex.ig&&h) up.ig='@'+h;
      await DB.doc('clients/'+ex.id).update(up); return ex.id; }
    const ref=DB.collection('clients').doc();
    await ref.set({name:String(info.name||'').trim()||'Cliente',phone,ig:h?'@'+h:'',email:mail,city:info.city||'',origin:CH[info.ch]?info.ch:'outro',originNote:'',stage,interest:info.interest||'',follow:false,followAt:'',followWhy:'',notes:note?[{at:now,text:note}]:[],at:now,updatedAt:now,lastAt:now});
    return ref.id;
  }catch(e){ console.warn('clients',e&&e.code); return null; }
}
async function importClients(){ const p=unlinkedPeople(); if(!p.length) return; let n=0; toast('Importando clientes…');
  for(const x of p){ if(await ensureClient(x,x.stage,x.stage==='comprou'?'Importado dos pedidos.':'Importado dos atendimentos.')) n++; }
  toast(n?`${n} cliente(s) importado(s)`:'Não foi possível importar',!n); }

function vClients(){
  const q=S.q.toLowerCase(), dq=digits(S.q);
  const base=D.clients.filter(c=>(S.ch==='todos'||c.origin===S.ch)&&(!S.cOrigin||c.origin===S.cOrigin)&&(!S.q||[c.name,c.phone,c.ig,c.email,c.city,c.interest,c.originNote].some(x=>x&&String(x).toLowerCase().includes(q))||(dq.length>=4&&digits(c.phone).includes(dq))));
  const cnt=k=>base.filter(c=>stageOf(c)===k).length; const fol=base.filter(c=>c.follow); const due=fol.filter(c=>followState(c)[2]>0);
  const tab=S.cTab||'todos', mode=S.cMode||'list', dis=S.canWrite?'':'disabled';
  const fs=c=>{ const f=followState(c); return f?f[2]:-1; };
  const list=base.filter(c=>tab==='todos'||(tab==='follow'?c.follow:stageOf(c)===tab))
    .sort((a,b)=>tab==='follow'?String(a.followAt||'').localeCompare(String(b.followAt||'')):(fs(b)-fs(a))||String(b.lastAt||b.updatedAt||b.at).localeCompare(String(a.lastAt||a.updatedAt||a.at)));
  const pend=S.canWrite?unlinkedPeople().length:0;
  const impBtn=pend?`<button class="btn" data-cimport><i data-lucide="import"></i>Importar ${pend} de pedidos e atendimentos</button>`:'';
  const head=`${roBanner()}<div class="page-head"><div><h2>Clientes</h2><p>Quem chamou, de onde veio e em que etapa está: pediu informações, recebeu link, já comprou ou precisa de acompanhamento.</p></div>
    <div class="toolbar"><button class="btn" data-xl="clients"><i data-lucide="file-spreadsheet"></i>Exportar</button><button class="btn primary" data-cnew ${dis}><i data-lucide="user-plus"></i>Novo cliente</button></div></div>`;
  if(!D.clients.length) return head+`<div class="card">${emptyState('users','Nenhum cliente cadastrado','Cadastre quem chamou no WhatsApp, no Instagram ou comprou pelo site. Registre de onde veio e em que etapa está, e o painel avisa quem precisa de acompanhamento.',S.canWrite?`<div class="compose-actions" style="justify-content:center"><button class="btn primary" data-cnew><i data-lucide="user-plus"></i>Cadastrar primeiro cliente</button>${impBtn}</div>`:'')}</div>`;
  const kpi=(k,ic,cls,l,n,foot)=>`<button class="card kpi kbtn ${tab===k?'on':''}" data-ctab="${k}" aria-pressed="${tab===k}"><span class="lbl"><span class="ico ${cls}"><i data-lucide="${ic}"></i></span>${l}</span><span class="val tnum">${n}</span><span class="foot">${foot}</span></button>`;
  const pct=n=>base.length?Math.round(n/base.length*100)+'% dos clientes':'—';
  const kpis=`<section class="grid kpis5">
    ${kpi('todos','users','sage','Todos',base.length,S.q||S.cOrigin||S.ch!=='todos'?`de ${D.clients.length} cadastrados`:'cadastrados no painel')}
    ${kpi('info','message-circle-question','sand','Pediram informações',cnt('info'),'ainda sem link ou orçamento')}
    ${kpi('link','link','','Receberam link',cnt('link'),'aguardando decidir')}
    ${kpi('comprou','shopping-bag','sage','Já compraram',cnt('comprou'),pct(cnt('comprou')))}
    ${kpi('follow','bell-ring','','Para acompanhar',fol.length,due.length?`<b style="color:var(--crit)">${due.length} para hoje ou atrasado(s)</b>`:fol.length?'nenhum para hoje':'ninguém marcado')}
  </section>`;
  const tools=`<div class="toolbar"><div class="seg"><button class="${mode==='list'?'on':''}" data-cmode="list"><i data-lucide="list"></i>Lista</button><button class="${mode==='board'?'on':''}" data-cmode="board"><i data-lucide="columns-3"></i>Funil</button></div>
    <select class="inp" id="cOrigin" style="width:auto" aria-label="Filtrar por origem"><option value="">Todas as origens</option>${Object.entries(ORIGINS).map(([k,o])=>`<option value="${k}" ${S.cOrigin===k?'selected':''}>${o[0]}</option>`).join('')}</select>
    <button class="chip ${tab==='perdido'?'on':''}" data-ctab="perdido" aria-pressed="${tab==='perdido'}"><i data-lucide="circle-slash"></i>Não fechou (${cnt('perdido')})</button>${impBtn}</div>`;
  const contactLine=c=>[c.phone,c.ig,c.city].filter(Boolean).map(esc).join(' · ')||'sem contato';
  let body;
  if(mode==='board'){
    body=`<p class="hint" style="margin-top:-8px">Arraste o cliente para a etapa em que ele está, ou clique para abrir o cadastro.</p><div class="kanban-wrap"><div class="kanban k4">${C_STAGE.map(s=>{ const it=base.filter(c=>stageOf(c)===s[0]&&(tab!=='follow'||c.follow)).sort((a,b)=>(fs(b)-fs(a))||String(b.lastAt||b.at).localeCompare(String(a.lastAt||a.at)));
      return `<div class="col" data-ccol="${s[0]}"><div class="col-head"><span class="bar" style="background:${s[4]}"></span>${s[1]}<span class="n">${it.length}</span></div>
      ${it.map(c=>`<button class="ocard" draggable="${S.canWrite}" data-cdrag="${c.id}" data-cedit="${c.id}"><div class="l1"><span class="item">${esc(c.name)}</span>${originBadge(c)}</div><div class="cl">${contactLine(c)}</div>${c.interest?`<div class="cl">${esc(c.interest)}</div>`:''}<div class="l3"><span class="cl">${dshort(c.lastAt||c.updatedAt||c.at)}</span>${followBadge(c)}</div></button>`).join('')||'<div class="empty-col">Ninguém nesta etapa</div>'}</div>`; }).join('')}</div></div>`;
  } else {
    body=`<div class="card" style="padding:0"><div class="table-wrap ctable"><table><thead><tr><th>Cliente</th><th>De onde veio</th><th>Etapa</th><th>Compras</th><th>Último contato</th><th>Acompanhamento</th><th></th></tr></thead><tbody>
    ${list.map(c=>{ const os=ordersOf(c), st=stageOf(c), wa=waLink(c.phone), ig=igLink(c.ig);
      return `<tr data-cedit="${c.id}" tabindex="0"><td><b>${esc(c.name)}</b><br><small style="color:var(--text2)">${contactLine(c)}</small></td>
      <td>${originBadge(c)}${c.originNote?`<br><small style="color:var(--text2)">${esc(c.originNote)}</small>`:''}</td>
      <td>${S.canWrite&&!os.length?`<select class="inp" data-cst="${c.id}" aria-label="Etapa de ${esc(c.name)}">${C_STAGE.map(s=>`<option value="${s[0]}" ${s[0]===st?'selected':''}>${s[1]}</option>`).join('')}</select>`:`<span class="badge ${cStage(st)[2]}"><i data-lucide="${cStage(st)[3]}"></i>${cStage(st)[1]}</span>`}</td>
      <td class="${os.length?'':'c-none'}">${os.length?`<b>${os.length}</b> pedido(s)<br><small style="color:var(--text2)">${fmt(os.reduce((a,o)=>a+(+o.value||0),0))}</small>`:'<span style="color:var(--text2)">—</span>'}</td>
      <td class="c-last">${dshort(c.lastAt||c.updatedAt||c.at)}</td>
      <td><span style="display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap">${c.follow?`${followBadge(c)}${S.canWrite?`<button class="btn sm" data-cdone="${c.id}"><i data-lucide="check"></i>Feito</button>`:''}`:S.canWrite?`<button class="btn sm" data-cfol="${c.id}"><i data-lucide="bell-plus"></i>Acompanhar</button>`:'<span style="color:var(--text2)">—</span>'}</span>${c.follow&&c.followWhy?`<br><small style="color:var(--text2)">${esc(c.followWhy)}</small>`:''}</td>
      <td><span style="display:inline-flex;gap:6px">${wa?`<a class="btn sm" href="${esc(wa)}" target="_blank" rel="noopener" aria-label="Abrir WhatsApp de ${esc(c.name)}"><i data-lucide="message-circle"></i></a>`:''}${ig?`<a class="btn sm" href="${esc(ig)}" target="_blank" rel="noopener" aria-label="Abrir Direct de ${esc(c.name)}"><i data-lucide="instagram"></i></a>`:''}</span></td></tr>`; }).join('')||`<tr><td colspan="7" style="text-align:center;color:var(--text2);padding:28px">Nenhum cliente neste filtro.</td></tr>`}
    </tbody></table></div></div>`;
  }
  const all=D.clients.filter(c=>S.ch==='todos'||c.origin===S.ch); const og=Object.entries(ORIGINS).map(([k,o])=>{ const cs=all.filter(c=>(ORIGINS[c.origin]?c.origin:'outro')===k); return {k,o,n:cs.length,b:cs.filter(c=>stageOf(c)==='comprou').length}; }).filter(x=>x.n).sort((a,b)=>b.n-a.n); const mx=Math.max(1,...og.map(x=>x.n));
  const origins=`<section class="card"><h3>De onde vêm os clientes</h3><p class="hint">Quantos chegaram por cada origem e quantos já compraram.</p><div class="obars">${og.map(x=>`<div class="obar"><span style="display:flex;gap:6px;align-items:center;min-width:0"><i data-lucide="${x.o[1]}"></i>${x.o[0]}</span><span class="tr"><i style="width:${Math.round(x.n/mx*100)}%"></i></span><span class="tnum"><b>${x.n}</b> · ${x.b} compraram</span></div>`).join('')}</div></section>`;
  return head+kpis+tools+body+origins;
}

function openClient(id, preset, focusFollow){
  const c=id?D.clients.find(x=>x.id===id):null; if(id&&!c) return;
  const v=Object.assign({name:'',phone:'',ig:'',email:'',city:'',origin:'instagram',originNote:'',stage:'info',interest:'',follow:false,followAt:'',followWhy:'',notes:[]},c||preset||{});
  if(focusFollow&&!v.follow){ v.follow=true; v.followAt=v.followAt||plusDays(3); }
  const os=c?ordersOf(c).sort((a,b)=>(b.num||0)-(a.num||0)):[]; const st=c?stageOf(c):cStage(v.stage)[0]; const dis=S.canWrite?'':'disabled'; delArm=null;
  const opts=(arr,cur)=>arr.map(([k,l])=>`<option value="${esc(k)}" ${k===cur?'selected':''}>${esc(l)}</option>`).join('');
  const wa=c&&waLink(c.phone), ig=c&&igLink(c.ig), waL=c&&waLink(c.phone,linkMsg(c));
  const noteHtml=n=>`<div class="note"><time>${dtime(n.at)}</time>${esc(n.text)}</div>`;
  $('#modalRoot').innerHTML=`<div class="overlay" data-close><div class="modal" role="dialog" aria-modal="true" aria-labelledby="ct">
    <div class="modal-head"><div>${c?`<div style="display:flex;gap:8px;flex-wrap:wrap">${originBadge(c)}<span class="badge ${cStage(st)[2]}"><i data-lucide="${cStage(st)[3]}"></i>${cStage(st)[1]}</span>${followBadge(c)}</div>`:''}<h3 id="ct" style="margin-top:${c?8:0}px">${c?esc(c.name):'Novo cliente'}</h3>${c?`<small style="color:var(--text2)">Cadastrado em ${dshort(c.at)}</small>`:''}</div>
      <button class="close" data-x aria-label="Fechar"><i data-lucide="x"></i></button></div>
    <div class="modal-body form" style="display:grid">
      <label><span>Nome <span class="req">*</span></span><input class="inp" id="c-name" value="${esc(v.name)}" ${dis}></label>
      <label>Etapa<select class="inp" id="c-stage" ${os.length?'disabled title="Este cliente já tem pedido registrado"':dis}>${opts(C_STAGE.map(s=>[s[0],s[1]]),st)}</select></label>
      <label>WhatsApp / telefone<input class="inp" id="c-phone" inputmode="tel" value="${esc(v.phone)}" placeholder="(11) 90000-0000" ${dis}></label>
      <label>Instagram<input class="inp" id="c-ig" value="${esc(v.ig)}" placeholder="@perfil" ${dis}></label>
      <label>Cidade<input class="inp" id="c-city" value="${esc(v.city)}" ${dis}></label>
      <label>E-mail<input class="inp" id="c-email" type="email" value="${esc(v.email)}" ${dis}></label>
      <label>De onde veio<select class="inp" id="c-origin" ${dis}>${opts(Object.entries(ORIGINS).map(([k,o])=>[k,o[0]]),ORIGINS[v.origin]?v.origin:'outro')}</select></label>
      <label>Detalhe da origem<input class="inp" id="c-originNote" value="${esc(v.originNote)}" placeholder="Ex.: indicada pela Ana, viu um reels, feira da escola" ${dis}></label>
      <label class="full">O que procura<input class="inp" id="c-interest" value="${esc(v.interest)}" placeholder="Ex.: planner personalizado, pauta de formação para outubro" ${dis}></label>
      <div class="fieldset full"><h4>Acompanhamento</h4>
        <label class="chk"><input type="checkbox" id="c-follow" ${v.follow?'checked':''} ${dis}>Precisa de acompanhamento</label>
        <div class="form">
          <label>Quando falar de novo<input class="inp" id="c-followAt" type="date" value="${esc(v.followAt)}" ${dis}></label>
          <label>Motivo<input class="inp" id="c-followWhy" value="${esc(v.followWhy)}" placeholder="Ex.: ficou de ver com a escola" ${dis}></label></div>
        ${S.canWrite?`<div class="compose-actions">${[[1,'Amanhã'],[3,'Em 3 dias'],[7,'Em 7 dias'],[15,'Em 15 dias']].map(([n,l])=>`<button class="chip" data-cfd="${n}">${l}</button>`).join('')}${c&&c.follow?`<button class="chip" data-cdone="${c.id}" style="border-color:var(--sage);color:var(--ok)"><i data-lucide="check"></i>Acompanhamento feito</button>`:''}</div>`:''}
        <small class="hint">Sem data, o cliente já aparece na lista de quem precisa de acompanhamento.</small></div>
      ${c?`<div class="fieldset full"><h4>Ações rápidas</h4><div class="compose-actions">
          ${S.canWrite&&waL?`<a class="btn sm" href="${esc(waL)}" target="_blank" rel="noopener" data-clink="${c.id}"><i data-lucide="link"></i>Enviar link pelo WhatsApp</a>`:''}
          ${S.canWrite?`<button class="btn sm" data-clinkcopy="${c.id}"><i data-lucide="copy"></i>Copiar mensagem com o link</button><button class="btn sm" data-corder="${c.id}"><i data-lucide="plus"></i>Criar pedido</button>`:''}
          ${wa?`<a class="btn sm" href="${esc(wa)}" target="_blank" rel="noopener noreferrer"><i data-lucide="message-circle"></i>WhatsApp</a>`:''}${ig?`<a class="btn sm" href="${esc(ig)}" target="_blank" rel="noopener noreferrer"><i data-lucide="instagram"></i>Direct</a>`:''}</div>
          <small class="hint">Ao enviar ou copiar o link, o cliente passa para “Recebeu link” e fica anotado no histórico.</small></div>
        ${c.siteUser&&STANDALONE?siteAccountBox(c):''}
        <div class="fieldset full"><h4>Pedidos (${os.length})</h4>${os.length?`<div class="list">${os.map(o=>`<div class="row" data-open="${o.id}" style="cursor:pointer"><div class="grow"><b>#${o.num} · ${esc(o.item)}</b><small>${dshort(o.at)} · ${stLabel(o.status)}</small></div><b class="tnum">${fmt(o.value)}</b><i data-lucide="chevron-right"></i></div>`).join('')}</div>`:'<p class="hint">Nenhum pedido registrado para este cliente.</p>'}</div>
        <div class="fieldset full"><h4>Histórico</h4>
          ${S.canWrite?`<div style="display:flex;gap:8px"><input class="inp" id="c-noteNew" placeholder="Anotar um contato, um combinado ou um lembrete…" aria-label="Nova anotação"><button class="btn sm" data-cnote="${c.id}"><i data-lucide="notebook-pen"></i>Anotar</button></div>`:''}
          <div class="cnotes" id="c-notes">${[...(c.notes||[])].reverse().map(noteHtml).join('')||'<p class="hint" id="c-nonotes">Sem anotações ainda.</p>'}</div></div>`
      :`<label class="full">Primeira anotação<textarea class="inp" id="c-note" rows="2" placeholder="Ex.: perguntou o preço do planner e o prazo de entrega" ${dis}></textarea></label>`}
    </div>
    <div class="modal-foot">${c&&S.canWrite?`<button class="btn danger" data-cdel="${c.id}" style="margin-right:auto"><i data-lucide="trash-2"></i>Excluir</button>`:''}
      <button class="btn" data-x>Cancelar</button>${S.canWrite?`<button class="btn primary" data-csave="${c?c.id:''}"><i data-lucide="check"></i>${c?'Salvar alterações':'Cadastrar cliente'}</button>`:''}</div>
  </div></div>`;
  icons(); const f=focusFollow?$('#c-followAt'):(!c?$('#c-name'):null); if(f) f.focus();
}
/* Conta do cliente no site (só no painel do servidor próprio): link de senha nova e união de fichas duplicadas */
function siteAccountBox(c){
  const tk=telKey(c.phone), em=String(c.email||'').trim().toLowerCase();
  const twins=D.clients.filter(x=>x.id!==c.id&&!x.siteUser&&((tk&&telKey(x.phone)===tk)||(em&&String(x.email||'').trim().toLowerCase()===em)));
  return `<div class="fieldset full"><h4>Conta no site</h4>
    <p class="hint" style="margin:0">Este cliente criou login no site. Em “Minha conta” ele vê os pedidos ligados a esta ficha.</p>
    ${S.canWrite?`<div class="compose-actions"><button class="btn sm" data-cpw="${c.id}"><i data-lucide="key-round"></i>Gerar link de senha nova</button></div><div id="c-pwout"></div>
    <small class="hint">Para quando o cliente esquecer a senha. Envie o link só para o WhatsApp desta ficha: ele vale por 2 horas e funciona uma única vez.</small>`:''}
    ${S.canWrite&&twins.length?`<div class="list" style="margin-top:10px">${twins.map(t=>`<div class="row"><div class="grow"><b>${esc(t.name)}</b><small>Ficha antiga com o mesmo ${tk&&telKey(t.phone)===tk?'WhatsApp':'e-mail'} · ${ordersOf(t).length} pedido(s)</small></div><button class="btn sm" data-cjoin="${c.id}" data-to="${t.id}"><i data-lucide="merge"></i>Unir fichas</button></div>`).join('')}</div>
    <small class="hint">Unir leva a conta do site para a ficha antiga, junta as anotações e apaga esta ficha nova. Confira antes se é a mesma pessoa.</small>`:''}
  </div>`;
}
async function clientPwLink(id, btn){
  const c=D.clients.find(x=>x.id===id); if(!c||!window.ESRO_API) return; btn.disabled=true;
  try{
    const r=await window.ESRO_API('POST','/contas/'+encodeURIComponent(id)+'/link-senha',{});
    S.pwMsg=`Olá, ${String(r.nome||c.name).split(' ')[0]}! Este é o link para criar uma senha nova na sua conta ESRO. Ele vale por 2 horas e só funciona uma vez:\n${r.url}`;
    const wa=waLink(c.phone);
    $('#c-pwout').innerHTML=`<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0"><input class="inp" style="flex:1;min-width:180px" readonly value="${esc(r.url)}" aria-label="Link de senha nova"><button class="btn sm" data-cpwcopy><i data-lucide="copy"></i>Copiar mensagem</button>${wa?`<a class="btn sm" href="${esc(wa)}" target="_blank" rel="noopener noreferrer"><i data-lucide="message-circle"></i>Abrir WhatsApp</a>`:''}</div>`;
    icons(); logAct('Link de senha nova gerado',c.name);
  }catch(e){ toast(e&&e.message&&e.code!=='unavailable'?e.message:'Não foi possível gerar o link agora',1); }
  finally{ btn.disabled=false; }
}
async function joinClients(fromId,toId){
  const a=D.clients.find(x=>x.id===fromId), b=D.clients.find(x=>x.id===toId); if(!a||!b||!window.ESRO_API) return;
  try{ await window.ESRO_API('POST','/contas/'+encodeURIComponent(fromId)+'/mover',{para:toId}); }
  catch(e){ toast(e&&e.message&&e.code!=='unavailable'?e.message:'Não foi possível unir as fichas agora',1); return; }
  const now=new Date().toISOString();
  const notes=[...(b.notes||[]),...(a.notes||[])].sort((x,y)=>String(x.at).localeCompare(String(y.at))).concat([{at:now,text:'Conta do site unida a esta ficha.'}]).slice(-200);
  const up={updatedAt:now,lastAt:now,notes}; if(!b.email&&a.email) up.email=a.email; if(!b.phone&&a.phone) up.phone=a.phone;
  if(!await write(()=>DB.doc('clients/'+toId).update(up))) return;
  for(const o of D.orders.filter(o=>o.clientId===fromId)) await write(()=>DB.doc('orders/'+o.id).update({clientId:toId}));
  if(await write(()=>DB.doc('clients/'+fromId).delete(),'Fichas unidas')){ logAct('Fichas de cliente unidas',b.name); closeModal(); }
}
async function saveClient(id){
  const g=k=>$('#c-'+k).value.trim(); const name=g('name'); if(!name){ $('#c-name').focus(); toast('Informe o nome do cliente',1); return; }
  let ig=g('ig').replace(/^https?:\/\/(www\.)?instagram\.com\//i,'').replace(/[\/?\s].*$/,''); if(ig&&!ig.startsWith('@')) ig='@'+ig;
  const now=new Date().toISOString(); const follow=$('#c-follow').checked; const followAt=follow?$('#c-followAt').value:'', followWhy=follow?g('followWhy'):'';
  const data={name,phone:g('phone'),ig,email:g('email'),city:g('city'),origin:g('origin'),originNote:g('originNote'),stage:g('stage'),interest:g('interest'),follow,followAt,followWhy,updatedAt:now};
  const flw=`Marcado para acompanhamento${followAt?' em '+dmy(followAt):''}${followWhy?': '+followWhy:''}.`;
  if(id){ const c=D.clients.find(x=>x.id===id); if(!c) return; const add=[];
    if(cStage(c.stage)[0]!==data.stage){ add.push({at:now,text:'Etapa: '+cStage(data.stage)[1]+'.'}); data.lastAt=now; }
    if(follow&&(!c.follow||c.followAt!==followAt||(c.followWhy||'')!==followWhy)) add.push({at:now,text:flw});
    if(add.length) data.notes=cNotes(c,add);
    if(await write(()=>DB.doc('clients/'+id).update(data),'Cliente atualizado')) closeModal(); return; }
  const dup=findClient({phone:data.phone,ig:data.ig}); if(dup){ toast(`Já existe um cliente com este contato: ${dup.name}`,1); return; }
  const first=g('note'); data.notes=[...(first?[{at:now,text:first}]:[]),...(follow?[{at:now,text:flw}]:[])]; data.at=now; data.lastAt=now;
  if(await write(()=>DB.collection('clients').add(data),`${name} cadastrado(a)`)) closeModal();
}
async function setClientStage(id,k){
  const c=D.clients.find(x=>x.id===id); if(!c||stageOf(c)===k) return;
  if(ordersOf(c).length){ toast('Este cliente já tem pedido registrado e fica em “Já comprou”',1); render(); return; }
  const now=new Date().toISOString();
  if(!await write(()=>DB.doc('clients/'+id).update({stage:k,updatedAt:now,lastAt:now,notes:cNotes(c,[{at:now,text:'Etapa: '+cStage(k)[1]+'.'}])}),`${c.name}: ${cStage(k)[1]}`)) render();
}
async function clientDone(id){ const c=D.clients.find(x=>x.id===id); if(!c) return false; const now=new Date().toISOString();
  return write(()=>DB.doc('clients/'+id).update({follow:false,followAt:'',followWhy:'',updatedAt:now,lastAt:now,notes:cNotes(c,[{at:now,text:'Acompanhamento feito'+(c.followWhy?' ('+c.followWhy+')':'')+'.'}])}),`Acompanhamento de ${c.name} concluído`); }
async function clientLink(id){ const c=D.clients.find(x=>x.id===id); if(!c||!S.canWrite) return; const now=new Date().toISOString();
  const up={updatedAt:now,lastAt:now,notes:cNotes(c,[{at:now,text:'Link do site enviado.'}])}; const st=cStage(c.stage)[0];
  if(!ordersOf(c).length&&(st==='info'||st==='perdido')) up.stage='link';
  if(await write(()=>DB.doc('clients/'+id).update(up))){ const s=$('#c-stage'); if(s&&up.stage) s.value='link'; clientNoteDom({at:now,text:'Link do site enviado.'}); } }
function clientNoteDom(n){ const box=$('#c-notes'); if(!box) return; $('#c-nonotes')?.remove(); box.insertAdjacentHTML('afterbegin',`<div class="note"><time>${dtime(n.at)}</time>${esc(n.text)}</div>`); }
async function clientNote(id,text){ const c=D.clients.find(x=>x.id===id); text=String(text||'').trim(); if(!c||!text) return false; const now=new Date().toISOString();
  const ok=await write(()=>DB.doc('clients/'+id).update({notes:cNotes(c,[{at:now,text}]),updatedAt:now,lastAt:now}),'Anotação registrada'); if(ok) clientNoteDom({at:now,text}); return ok; }

/* ---------- Fluxo de caixa ---------- */
const CASH_CATS={in:['Vendas','Outras receitas','Aporte do dono'],out:['Insumos e materiais','Embalagens','Frete e entregas','Taxas e impostos','Marketing e anúncios','Ferramentas e assinaturas','Aluguel e contas','Retirada / pró-labore','Outros']};
const r2=n=>Math.round((+n||0)*100)/100;
const mOf=s=>String(s||'').slice(0,7);
const isoDay=iso=>{ if(!iso) return ''; const d=new Date(iso); return isNaN(d)?'':ymd(d); };
const dfull=s=>s?`${s.slice(8,10)}/${s.slice(5,7)}/${s.slice(0,4)}`:'';
const mLabel=m=>{ const [y,mo]=m.split('-').map(Number); return `${MONTHS[mo-1]} de ${y}`; };
/* Pagamentos de um pedido: lista {at,value}. Pedidos antigos (sem a lista) contam pela situação do pagamento. */
const paysOf=o=>Array.isArray(o.pays)?o.pays:o.payS==='Pago'?[{at:o.at,value:+o.value||0}]:o.payS==='Sinal pago'?[{at:o.at,value:r2(+o.sinal>0?Math.min(+o.sinal,+o.value||0):(+o.value||0)/2)}]:[];
const paidOf=o=>r2(paysOf(o).reduce((a,p)=>a+(+p.value||0),0));
const dueOf=o=>Math.max(0,r2((+o.value||0)-paidOf(o)));
function orderPays(prev, data, nowIso){
  if(data.payS==='Aguardando') return [];
  const pays=prev?[...paysOf(prev)]:[]; const got=r2(pays.reduce((a,p)=>a+(+p.value||0),0));
  const total=+data.value||0; const target=data.payS==='Pago'?total:r2(+data.sinal>0?Math.min(+data.sinal,total):total/2);
  const diff=r2(target-got); if(diff) pays.push({at:nowIso,value:diff});
  return pays;
}
const cashLanc=()=>D.cash.filter(c=>c.kind!=='fixo');
const cashFixos=()=>D.cash.filter(c=>c.kind==='fixo');
function cashBase(){
  const out=[], td=today(), main=mainAcc();
  for(const o of D.orders){ const def=o.pay==='Dinheiro'?'caixa':main;
    paysOf(o).forEach((p,i)=>{ const v=+p.value||0; if(!v) return; out.push({key:`o:${o.id}:${i}`,src:'order',id:o.id,pi:i,ext:p.ext||'',acc:accOf(p.acc||def),date:isoDay(p.at)||isoDay(o.at)||td,type:v>=0?'in':'out',value:Math.abs(v),desc:`Pedido #${o.num} · ${o.client||''}`,cat:'Vendas',paid:true}); });
    const d=dueOf(o); if(d>0.004){ const od=isoDay(o.at); out.push({key:`o:${o.id}:due`,src:'order',id:o.id,acc:accOf(def),date:od>td?od:td,type:'in',value:d,desc:`Pedido #${o.num} · ${o.client||''}`,cat:'Vendas',paid:false}); }
  }
  for(const c of cashLanc()) out.push({key:'c:'+c.id,src:'cash',id:c.id,ext:c.extId||'',acc:accOf(c.acc),xfer:c.cat===XFER,date:c.date||isoDay(c.at)||td,type:c.type==='in'?'in':'out',value:+c.value||0,desc:c.desc||'',cat:c.cat||'',paid:c.paid!==false,recId:c.recId||''});
  return out;
}
function fixosFor(m, base){
  const [y,mo]=m.split('-').map(Number); const last=new Date(y,mo,0).getDate();
  return cashFixos().filter(f=>f.on!==false&&(!f.start||f.start<=m)&&(!f.end||f.end>=m)&&!base.some(e=>e.recId===f.id&&mOf(e.date)===m))
    .map(f=>({src:'fixo',id:f.id,date:`${m}-${String(Math.min(last,Math.max(1,+f.day||1))).padStart(2,'0')}`,type:f.type==='in'?'in':'out',value:+f.value||0,desc:f.desc||'',cat:f.cat||'',paid:false,acc:accOf(f.acc||mainAcc())}));
}
const cashSaldo=(base,upTo,acc)=>r2(accList().filter(a=>!acc||a.id===acc).reduce((t,a)=>t+(+a.ini||0),0)+base.filter(e=>e.paid&&e.date<=upTo&&(!acc||e.acc===acc)).reduce((a,e)=>a+(e.type==='in'?e.value:-e.value),0));
/* Contas a pagar vencidas ou que vencem hoje (lançamentos previstos e contas fixas do mês). */
function dueBills(){ const base=cashBase(), td=today(), cur=mOf(td); return [...base.filter(e=>e.src==='cash'&&!e.paid&&e.type==='out'&&e.date<=td),...fixosFor(cur,base).filter(e=>e.type==='out'&&e.date<=td)]; }

function cashForecast(n){
  n=n||3; const all=cashBase(), base=all.filter(e=>!e.xfer); const now=new Date(), td=today();
  const sum=(arr,f)=>r2(arr.filter(f).reduce((a,e)=>a+e.value,0));
  const paid=base.filter(e=>e.paid), plan=base.filter(e=>!e.paid);
  const first=paid.map(e=>mOf(e.date)).sort()[0];
  const hist=[1,2,3].map(i=>monthKey(shiftMonth(now,-i))).filter(m=>first&&m>=first);
  const isIn=e=>e.type==='in', isOut=e=>e.type==='out', avgInF=e=>e.type==='in'&&e.cat!=='Aporte do dono', varF=e=>e.type==='out'&&!e.recId;
  const realOf=m=>paid.filter(e=>mOf(e.date)===m); const cur=monthKey(now);
  const avgIn=hist.length?r2(hist.reduce((a,m)=>a+sum(realOf(m),avgInF),0)/hist.length):sum(realOf(cur),avgInF);
  const avgOut=hist.length?r2(hist.reduce((a,m)=>a+sum(realOf(m),varF),0)/hist.length):sum(realOf(cur),varF);
  let saldo=cashSaldo(all,td); const rows=[];
  for(let i=0;i<=n;i++){ const m=monthKey(shiftMonth(now,i));
    const pl=[...plan.filter(e=>mOf(e.date)===m||(i===0&&mOf(e.date)<m)),...fixosFor(m,base)];
    const pIn=sum(pl,isIn), pOut=sum(pl,isOut); let rIn=0,rOut=0,eIn=avgIn,eOut=avgOut;
    if(i===0){ const re=realOf(m); rIn=sum(re,isIn); rOut=sum(re,isOut);
      eIn=Math.max(0,r2(avgIn-sum(re,avgInF)-pIn)); eOut=Math.max(0,r2(avgOut-sum(re,varF)-sum(pl,e=>e.type==='out'&&e.src==='cash'))); }
    const inTot=r2(rIn+pIn+eIn), outTot=r2(rOut+pOut+eOut); saldo=r2(saldo+pIn+eIn-pOut-eOut);
    rows.push({m,i,rIn,pIn,eIn,rOut,pOut,eOut,inTot,outTot,res:r2(inTot-outTot),saldo}); }
  return {rows,avgIn,avgOut,histN:hist.length};
}

function vCash(){
  const now=new Date(), cur=monthKey(now), td=today(); const m=S.cashM||cur; const [y,mo]=m.split('-').map(Number);
  const base=cashBase(); const q=S.q.toLowerCase(); const tab=S.cashTab||'lanc'; const dis=S.canWrite?'':'disabled';
  const acc=S.cashAcc&&accList().some(a=>a.id===S.cashAcc)?S.cashAcc:''; const multi=D.accounts.length>0;
  const ents=[...base.filter(e=>mOf(e.date)===m),...fixosFor(m,base)].filter(e=>!acc||e.acc===acc).sort((a,b)=>a.date.localeCompare(b.date)||String(a.desc).localeCompare(String(b.desc),'pt-BR'));
  const sum=(t,p)=>r2(ents.filter(e=>e.type===t&&e.paid===p&&!e.xfer).reduce((a,e)=>a+e.value,0));
  const inR=sum('in',true), outR=sum('out',true), inP=sum('in',false), outP=sum('out',false); const res=r2(inR-outR);
  const lastDay=`${m}-${String(new Date(y,mo,0).getDate()).padStart(2,'0')}`; const saldo=cashSaldo(base,m<cur?lastDay:td,acc);
  const head=`${roBanner()}<div class="page-head"><div><h2>Fluxo de caixa</h2><p>O que entrou, o que saiu e o que ainda está previsto. Os pagamentos dos pedidos entram sozinhos.</p></div>
    <div class="toolbar"><button class="btn" data-xl="cash"><i data-lucide="file-spreadsheet"></i>Exportar</button>${multi?`<button class="btn" data-kxfer ${dis}><i data-lucide="arrow-left-right"></i>Transferir</button>`:''}<button class="btn" data-knew="out" ${dis}><i data-lucide="minus-circle"></i>Nova despesa</button><button class="btn primary" data-knew="in" ${dis}><i data-lucide="plus-circle"></i>Nova entrada</button></div></div>`;
  const kpis=`<section class="grid kpis">
    <div class="card kpi"><div class="lbl"><span class="ico sage"><i data-lucide="arrow-down-left"></i></span>Entradas de ${MONTHS[mo-1]}</div><div class="val tnum">${fmt(inR)}</div><div class="foot">${inP?`+ ${fmt(inP)} a receber`:'nada a receber no mês'}</div></div>
    <div class="card kpi"><div class="lbl"><span class="ico"><i data-lucide="arrow-up-right"></i></span>Saídas de ${MONTHS[mo-1]}</div><div class="val tnum">${fmt(outR)}</div><div class="foot">${outP?`+ ${fmt(outP)} a pagar`:'nada a pagar no mês'}</div></div>
    <div class="card kpi"><div class="lbl"><span class="ico sand"><i data-lucide="scale"></i></span>Resultado do mês</div><div class="val tnum" style="color:${res<0?'var(--crit)':'inherit'}">${res<0?'− ':''}${fmt(Math.abs(res))}</div><div class="foot">${inP||outP?`com o previsto: ${r2(res+inP-outP)<0?'− ':''}${fmt(Math.abs(r2(res+inP-outP)))}`:'entradas menos saídas'}</div></div>
    <div class="card kpi"><div class="lbl"><span class="ico sage"><i data-lucide="wallet"></i></span>${m<cur?'Saldo no fim de '+MONTHS[mo-1]:acc?'Saldo hoje':multi?'Saldo total hoje':'Saldo em caixa hoje'}</div><div class="val tnum" style="color:${saldo<0?'var(--crit)':'inherit'}">${saldo<0?'− ':''}${fmt(Math.abs(saldo))}</div><div class="foot">${acc?`${esc(accName(acc))} · <button class="linkish" data-kacc="">ver todas</button>`:multi?`soma de ${accList().length} contas`:'caixa da loja'}</div></div>
  </section>`;
  const tools=`<div class="toolbar"><div class="seg">${[['lanc','Lançamentos'],['fixos','Contas fixas'],['est','Estimativa']].map(([k,l])=>`<button class="${tab===k?'on':''}" data-ktab="${k}">${l}</button>`).join('')}</div>
    ${tab==='lanc'?`<span class="mnav"><button class="iconbtn" data-kmonth="-1" aria-label="Mês anterior"><i data-lucide="chevron-left"></i></button><b>${mLabel(m)}</b><button class="iconbtn" data-kmonth="1" aria-label="Próximo mês"><i data-lucide="chevron-right"></i></button>${m!==cur?'<button class="chip" data-kmonth="0">Mês atual</button>':''}</span>`:''}</div>`;
  let body='';
  if(tab==='lanc'){
    const list=ents.filter(e=>!q||[e.desc,e.cat].some(x=>x&&String(x).toLowerCase().includes(q)));
    const srcL=e=>e.src==='order'?'Pedido':e.src==='fixo'||e.recId?'Conta fixa':'';
    body=`<div class="card" style="padding:0"><div class="table-wrap ctable"><table><thead><tr><th>Lançamento</th><th>Categoria</th><th>Situação</th><th class="num">Entrada</th><th class="num">Saída</th><th></th></tr></thead><tbody>
    ${list.map(e=>{ const late=!e.paid&&e.date<td; const st=e.paid?'<span class="badge b-ok">Realizado</span>':`<span class="badge ${late?'b-primary':'b-warn'}">${late?'Atrasado':e.type==='in'?'A receber':'A pagar'}</span>`;
      const btn=!S.canWrite||e.paid?'':e.src==='fixo'?`<button class="btn sm" data-kfix="${e.id}:${e.date}"><i data-lucide="check"></i>${e.type==='in'?'Recebido':'Pago'}</button>`:e.src==='cash'?`<button class="btn sm" data-kpaid="${e.id}"><i data-lucide="check"></i>${e.type==='in'?'Recebido':'Pago'}</button>`:'';
      return `<tr ${e.src==='order'?`data-open="${e.id}"`:e.src==='fixo'?`data-kfedit="${e.id}"`:`data-kedit="${e.id}"`} tabindex="0"><td><b>${esc(e.desc)||'Sem descrição'}</b><br><small style="color:var(--text2)">${dfull(e.date)}${srcL(e)?' · '+srcL(e):''}${multi?' · '+esc(accName(e.acc)):''}</small></td><td>${esc(e.cat)||'—'}</td><td>${st}</td>
        <td class="num ${e.type==='in'?'':'c-none'}">${e.type==='in'?`<b>+ ${fmt(e.value)}</b>`:''}</td><td class="num ${e.type==='out'?'':'c-none'}">${e.type==='out'?`<b style="color:var(--crit)">− ${fmt(e.value)}</b>`:''}</td><td>${btn}</td></tr>`; }).join('')||`<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:28px">${ents.length?'Nenhum lançamento nesta busca.':`Nenhum lançamento em ${mLabel(m)}. Registre uma despesa ou marque um pedido como pago.`}</td></tr>`}
    </tbody>${list.length?`<tfoot><tr><td colspan="3"><b>Total do mês</b> <small style="color:var(--text2)">realizado + previsto</small></td><td class="num"><small class="m-only">Entradas </small><b>${fmt(r2(inR+inP))}</b></td><td class="num"><small class="m-only">Saídas </small><b>${fmt(r2(outR+outP))}</b></td><td></td></tr></tfoot>`:''}</table></div></div>`;
  } else if(tab==='fixos'){
    const fx=cashFixos().sort((a,b)=>(+a.day||1)-(+b.day||1)); const tot=r2(fx.filter(f=>f.on!==false&&f.type!=='in').reduce((a,f)=>a+(+f.value||0),0));
    body=`<section class="card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><div><h3>Contas fixas</h3><p class="hint">O que se repete todo mês: aluguel, internet, MEI, assinaturas. Elas aparecem como “a pagar” em cada mês e entram na estimativa.</p></div>${S.canWrite?'<button class="btn primary" data-kfnew><i data-lucide="plus"></i>Nova conta fixa</button>':''}</div>
      ${fx.length?`<div class="list" style="margin-top:8px">${fx.map(f=>`<div class="row" data-kfedit="${f.id}" style="cursor:pointer"><div class="grow"><b>${esc(f.desc)}</b><small>${esc(f.cat||'')}${f.cat?' · ':''}todo dia ${+f.day||1}${f.type==='in'?' · entrada':''}</small></div>${f.on===false?'<span class="badge b-neutral">Pausada</span>':''}<b class="tnum">${fmt(f.value)}</b><i data-lucide="chevron-right"></i></div>`).join('')}</div><p class="hint" style="margin-top:10px">Total de despesas fixas por mês: <b style="color:var(--text)">${fmt(tot)}</b></p>`
      :emptyState('calendar-clock','Nenhuma conta fixa','Cadastre as despesas que se repetem todo mês para o painel lembrar de cada uma e projetar o caixa.')}</section>`;
  } else {
    const f=cashForecast(3); const sug=restockList(); const sugV=r2(sug.reduce((a,x)=>a+x.cost,0));
    const sgn=v=>`${v<0?'− ':''}${fmt(Math.abs(v))}`;
    body=`<section class="card"><h3>Entradas e saídas: realizado e estimado</h3><p class="hint">Cinco meses passados, o mês atual e os três próximos. A parte hachurada é estimativa.</p>
        <div class="chart-box" style="height:280px"><canvas id="cCash" role="img" aria-label="Gráfico de entradas e saídas por mês, com estimativa dos próximos três meses"></canvas></div>
        <div class="legend"><span><span class="sw" style="background:var(--c-in)"></span>Entradas</span><span><span class="sw" style="background:var(--c-out)"></span>Saídas</span><span><span class="sw hatch"></span>Estimado</span></div></section>
      <section class="grid two">
        <div class="card"><h3>Estimativa mês a mês</h3><p class="hint">Valores previstos até o fim de cada mês</p>
          <div class="est"><div class="est-row est-head"><span>Mês</span><span>Entradas</span><span>Saídas</span><span>Resultado</span><span>Saldo no fim</span></div>
          ${f.rows.map(r=>`<div class="est-row"><div class="est-m"><b>${MONTHS[+r.m.slice(5)-1]}</b>${r.i===0?'<small>mês atual</small>':''}</div>
            <div><small class="lb">Entradas</small><b>${fmt(r.inTot)}</b><small>${r.i===0?`${fmt(r.rIn)} já entrou`:`${fmt(r.pIn)} previsto`}</small></div>
            <div><small class="lb">Saídas</small><b>${fmt(r.outTot)}</b><small>${r.i===0?`${fmt(r.rOut)} já saiu`:`${fmt(r.pOut)} em contas`}</small></div>
            <div><small class="lb">Resultado</small><b style="color:${r.res<0?'var(--crit)':'inherit'}">${sgn(r.res)}</b></div>
            <div><small class="lb">Saldo no fim</small><b style="color:${r.saldo<0?'var(--crit)':'inherit'}">${sgn(r.saldo)}</b></div></div>`).join('')}</div></div>
        <div class="card"><h3>Saldo em caixa no fim de cada mês</h3><p class="hint">Linha tracejada: projeção</p><div class="chart-box" style="height:240px"><canvas id="cSaldo" role="img" aria-label="Gráfico do saldo em caixa no fim de cada mês, com projeção"></canvas></div></div>
      </section>
      <section class="card"><h3>Como a estimativa é calculada</h3><div class="list" style="margin-top:6px">
        <div class="row"><div class="grow"><b>Entradas</b><small style="white-space:normal">O que falta receber dos pedidos + entradas previstas + média mensal de vendas (${fmt(f.avgIn)})</small></div></div>
        <div class="row"><div class="grow"><b>Saídas</b><small style="white-space:normal">Contas fixas + despesas previstas + média mensal das outras despesas (${fmt(f.avgOut)})</small></div></div>
        <div class="row"><div class="grow"><b>Base da média</b><small style="white-space:normal">${f.histN?`Os ${f.histN===1?'último mês fechado':`últimos ${f.histN} meses fechados`}.`:'Ainda não há um mês fechado; por enquanto a média usa só o mês atual, então a projeção melhora com o tempo.'}</small></div></div>
        ${sug.length?`<div class="row" data-nav="stock" style="cursor:pointer"><div class="grow"><b>Reposição de estoque sugerida: ${fmt(sugV)}</b><small style="white-space:normal">${sug.length} item(ns) para repor. Este valor não está somado nas saídas acima.</small></div><i data-lucide="chevron-right"></i></div>`:''}
      </div></section>`;
  }
  return head+kpis+accStrip(base)+tools+body;
}
function hatch(color){ const c=document.createElement('canvas'); c.width=c.height=8; const x=c.getContext('2d'); x.strokeStyle=color; x.lineWidth=2; x.lineCap='square';
  for(const [a,b,e,f] of [[0,8,8,0],[-2,2,2,-2],[6,10,10,6]]){ x.beginPath(); x.moveTo(a,b); x.lineTo(e,f); x.stroke(); } return x.createPattern(c,'repeat'); }
function drawCash(){
  if(!window.Chart||!$('#cCash')) return; const now=new Date(), cur=monthKey(now); const all=cashBase(), base=all.filter(e=>!e.xfer); const f=cashForecast(3);
  const past=[5,4,3,2,1].map(i=>monthKey(shiftMonth(now,-i))); const ms=[...past,...f.rows.map(r=>r.m)];
  const labels=ms.map(m=>MONTHS[+m.slice(5)-1].slice(0,3)+(m>cur?' (est.)':''));
  const real=(m,t)=>r2(base.filter(e=>e.paid&&e.type===t&&mOf(e.date)===m).reduce((a,e)=>a+e.value,0));
  const row=m=>f.rows.find(r=>r.m===m);
  const cIn=tok('--c-in'), cOut=tok('--c-out'), text2=tok('--text2'), line=tok('--line'), card=tok('--card');
  const ds=(label,color,stack,data,est)=>({label,data,stack,backgroundColor:est?hatch(color):color,borderColor:est?color:card,borderWidth:est?1:0,borderRadius:4,maxBarThickness:30,categoryPercentage:.72,barPercentage:.9});
  charts.push(new Chart($('#cCash'),{type:'bar',data:{labels,datasets:[
      ds('Entradas',cIn,'in',ms.map(m=>m<cur?real(m,'in'):m===cur?row(m).rIn:0)),
      ds('Entradas estimadas',cIn,'in',ms.map(m=>m<cur?0:r2(row(m).pIn+row(m).eIn)),true),
      ds('Saídas',cOut,'out',ms.map(m=>m<cur?real(m,'out'):m===cur?row(m).rOut:0)),
      ds('Saídas estimadas',cOut,'out',ms.map(m=>m<cur?0:r2(row(m).pOut+row(m).eOut)),true)]},
    options:{maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{filter:c=>c.raw>0,callbacks:{label:c=>`${c.dataset.label}: ${fmt(c.raw)}`}}},
      scales:{x:{stacked:true,grid:{display:false},ticks:{color:text2,font:{family:'Nunito',size:11}}},y:{stacked:true,beginAtZero:true,grid:{color:line},border:{display:false},ticks:{color:text2,callback:v=>'R$ '+v.toLocaleString('pt-BR')}}}}}));
  if($('#cSaldo')){ const end=m=>{ const [y,mo]=m.split('-').map(Number); return `${m}-${String(new Date(y,mo,0).getDate()).padStart(2,'0')}`; };
    const data=ms.map(m=>m<cur?cashSaldo(all,end(m)):row(m).saldo); const ci=past.length; const prim=tok('--primary');
    charts.push(new Chart($('#cSaldo'),{type:'line',data:{labels,datasets:[{label:'Saldo em caixa',data,borderColor:prim,backgroundColor:prim,borderWidth:2,tension:.25,pointRadius:4,pointHoverRadius:6,pointBorderColor:card,pointBorderWidth:2,segment:{borderDash:c=>c.p1DataIndex>=ci?[6,5]:undefined}}]},
      options:{maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.dataIndex>=ci?'Saldo projetado':'Saldo'}: ${c.raw<0?'− ':''}${fmt(Math.abs(c.raw))}`}}},
        scales:{x:{grid:{display:false},ticks:{color:text2,font:{family:'Nunito',size:11}}},y:{grid:{color:c=>c.tick.value===0?text2:line},border:{display:false},ticks:{color:text2,callback:v=>'R$ '+v.toLocaleString('pt-BR')}}}}})); }
}
function openCash(id, preset){
  const c=id?D.cash.find(x=>x.id===id):null; if(id&&!c) return; const fixo=c?c.kind==='fixo':!!(preset&&preset.fixo);
  const v=Object.assign({type:'out',date:today(),desc:'',cat:'',value:'',paid:true,day:new Date().getDate(),on:true,acc:S.cashAcc||mainAcc()},c||preset||{}); if(c) v.acc=accOf(c.acc||(c.kind==='fixo'?mainAcc():'')); const dis=S.canWrite?'':'disabled'; delArm=null;
  const tIn=v.type==='in'; const title=c?esc(c.desc||'Lançamento'):fixo?'Nova conta fixa':tIn?'Nova entrada':'Nova despesa';
  $('#modalRoot').innerHTML=`<div class="overlay" data-close><div class="modal" role="dialog" aria-modal="true" aria-labelledby="kt" style="width:min(560px,100%)">
    <div class="modal-head"><div><h3 id="kt">${title}</h3>${fixo?'<small style="color:var(--text2)">Repete todo mês</small>':c&&c.recId?'<small style="color:var(--text2)">Pagamento de conta fixa</small>':''}</div><button class="close" data-x aria-label="Fechar"><i data-lucide="x"></i></button></div>
    <div class="modal-body form" style="display:grid">
      <label>Tipo<select class="inp" id="k-type" ${dis}><option value="out" ${tIn?'':'selected'}>Saída (despesa)</option><option value="in" ${tIn?'selected':''}>Entrada (receita)</option></select></label>
      ${fixo?`<label>Dia do mês<input class="inp tnum" id="k-day" type="number" min="1" max="31" value="${esc(v.day)}" ${dis}></label>`:`<label>Data<input class="inp" id="k-date" type="date" value="${esc(v.date)}" ${dis}></label>`}
      <label class="full"><span>Descrição <span class="req">*</span></span><input class="inp" id="k-desc" value="${esc(v.desc)}" placeholder="${fixo?'Ex.: internet, aluguel, DAS do MEI':tIn?'Ex.: venda na feira, reembolso':'Ex.: papel pólen, frete do pedido #1012'}" ${dis}></label>
      <label>Categoria<input class="inp" id="k-cat" list="dl-kcat" value="${esc(v.cat)}" ${dis}><datalist id="dl-kcat">${CASH_CATS[tIn?'in':'out'].map(x=>`<option value="${esc(x)}">`).join('')}</datalist></label>
      <label><span>Valor (R$) <span class="req">*</span></span><input class="inp tnum" id="k-value" type="number" min="0" step="0.01" value="${esc(v.value)}" ${dis}></label>
      ${D.accounts.length?`<label class="full">Conta<select class="inp" id="k-acc" ${dis}>${accOpts(v.acc)}</select></label>`:''}
      ${fixo?`<label class="chk full"><input type="checkbox" id="k-on" ${v.on!==false?'checked':''} ${dis}>Conta ativa (desmarque para pausar)</label>`
        :`<label class="full">Situação<select class="inp" id="k-paid" ${dis}><option value="1" ${v.paid!==false?'selected':''}>Realizado (já entrou ou saiu do caixa)</option><option value="0" ${v.paid===false?'selected':''}>Previsto (ainda vai acontecer)</option></select></label>`}
    </div>
    <div class="modal-foot">${c&&S.canWrite?`<button class="btn danger" data-kdel="${c.id}" style="margin-right:auto"><i data-lucide="trash-2"></i>Excluir</button>`:''}
      <button class="btn" data-x>Cancelar</button>${S.canWrite?`<button class="btn primary" data-ksave="${c?c.id:''}" data-kfixo="${fixo?1:''}"><i data-lucide="check"></i>${c?'Salvar':'Registrar'}</button>`:''}</div></div></div>`;
  icons(); if(!c) $('#k-desc').focus();
}
async function saveCash(id, fixo){
  const g=k=>$('#k-'+k).value.trim(); const desc=g('desc'), value=parseFloat($('#k-value').value);
  if(!desc){ $('#k-desc').focus(); toast('Informe a descrição',1); return; }
  if(!(value>0)){ $('#k-value').focus(); toast('Informe um valor maior que zero',1); return; }
  const now=new Date().toISOString(); const data={type:g('type'),desc,cat:g('cat'),value:r2(value),updatedAt:now}; if($('#k-acc')) data.acc=$('#k-acc').value;
  if(fixo){ Object.assign(data,{kind:'fixo',day:Math.min(31,Math.max(1,parseInt(g('day'))||1)),on:$('#k-on').checked}); if(!id) data.start=monthKey(new Date()); }
  else { const date=$('#k-date').value; if(!date){ $('#k-date').focus(); toast('Informe a data',1); return; } Object.assign(data,{kind:'lanc',date,paid:$('#k-paid').value==='1'}); }
  const ok=id?await write(()=>DB.doc('cash/'+id).update(data),'Lançamento atualizado'):await write(()=>DB.collection('cash').add({...data,at:now}),fixo?'Conta fixa cadastrada':'Lançamento registrado');
  if(ok){ closeModal(); if(!fixo&&!id) S.cashM=mOf(data.date); }
}
async function payFixo(id, date){ const f=D.cash.find(x=>x.id===id); if(!f) return; const now=new Date().toISOString(); const d=mOf(date)===mOf(today())?today():date;
  await write(()=>DB.collection('cash').add({kind:'lanc',type:f.type==='in'?'in':'out',date:d,desc:f.desc,cat:f.cat||'',value:+f.value||0,paid:true,recId:f.id,acc:accOf(f.acc||mainAcc()),at:now,updatedAt:now}),`${f.desc}: ${f.type==='in'?'recebido':'pago'}`); }
function openSaldo(){
  $('#modalRoot').innerHTML=`<div class="overlay" data-close><div class="modal" role="dialog" aria-modal="true" aria-labelledby="sd" style="width:min(440px,100%)">
    <div class="modal-head"><h3 id="sd">Saldo inicial do caixa</h3><button class="close" data-x aria-label="Fechar"><i data-lucide="x"></i></button></div>
    <div class="modal-body form" style="display:grid"><label class="full">Quanto havia em caixa antes do primeiro lançamento (R$)<input class="inp tnum" id="k-ini" type="number" step="0.01" value="${esc(D.settings.caixaInicial||'')}"></label>
      <small class="full" style="color:var(--text2)">O saldo em caixa é este valor mais todas as entradas e menos todas as saídas já realizadas.</small></div>
    <div class="modal-foot"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ksaldosave><i data-lucide="check"></i>Salvar</button></div></div></div>`;
  icons(); $('#k-ini').focus();
}

/* ---------- Aviso de reposição ---------- */
function usagePerDay(s){ const now=Date.now(), mv=s.moves||[]; if(!mv.length) return 0; const since=now-30*864e5;
  const used=mv.filter(m=>m.delta<0&&m.reason!=='Ajuste de inventário'&&new Date(m.at).getTime()>=since).reduce((a,m)=>a-m.delta,0); if(!(used>0)) return 0;
  const first=Math.min(...mv.map(m=>new Date(m.at).getTime()).filter(t=>!isNaN(t))); const span=Math.min(30,Math.max(7,(now-first)/864e5)); return used/span; }
const daysLeft=s=>{ const u=usagePerDay(s); return u>0?Math.max(0,(+s.qty||0)/u):null; };
const leadOf=s=>+s.lead>0?+s.lead:7;
function restockQty(s){ const u=usagePerDay(s); const target=Math.max(2*(+s.min||0),u*30+(+s.min||0)); return Math.max(0,Math.ceil(target-(+s.qty||0))); }
function restockList(){ return lowStock().map(s=>{ const q=restockQty(s); return {s,st:stockState(s),qty:q,cost:r2(q*(+s.cost||0)),days:daysLeft(s)}; }).sort((a,b)=>b.st[2]-a.st[2]||String(a.s.name).localeCompare(String(b.s.name),'pt-BR')); }
function restockText(){ const l=restockList(); const by={}; l.forEach(x=>{ const k=x.s.supplier||'Sem fornecedor'; (by[k]=by[k]||[]).push(x); });
  return `Lista de compras · ESRO Papelaria · ${dfull(today())}\n\n`+Object.entries(by).map(([sup,xs])=>`${sup}\n`+xs.map(x=>`• ${x.s.name}: ${x.qty?qfmt(x.qty)+' '+(x.s.unit||'un'):'definir quantidade'}${x.cost?' (~'+fmt(x.cost)+')':''}`).join('\n')).join('\n\n')+`\n\nTotal estimado: ${fmt(l.reduce((a,x)=>a+x.cost,0))}`; }
function restockCard(){
  const l=restockList(); if(!l.length) return ''; const tot=r2(l.reduce((a,x)=>a+x.cost,0));
  return `<section class="card restock"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><h3><i data-lucide="alert-triangle" style="color:var(--warn);vertical-align:-3px"></i> Aviso de reposição</h3><p class="hint">${l.length} item(ns) zerado(s), abaixo do mínimo ou que acabam antes do prazo de reposição. Compra sugerida: <b style="color:var(--text)">${fmt(tot)}</b></p></div>
    <div class="toolbar"><button class="btn sm" data-rcopy><i data-lucide="copy"></i>Copiar lista de compras</button><button class="btn sm" data-xl="restock"><i data-lucide="file-spreadsheet"></i>Exportar lista</button></div></div>
    <div class="list" style="margin-top:8px">${l.map(x=>`<div class="row" data-sedit="${x.s.id}" style="cursor:pointer"><div class="grow"><b>${esc(x.s.name)}</b><small>${qfmt(x.s.qty)} ${esc(x.s.unit||'un')} em estoque · mínimo ${qfmt(x.s.min)}${x.s.supplier?' · '+esc(x.s.supplier):''}</small></div><span class="badge ${x.st[0]}">${x.st[1]}</span><span class="rq tnum">${x.qty?`<b>comprar ${qfmt(x.qty)} ${esc(x.s.unit||'un')}</b>${x.cost?`<small>~ ${fmt(x.cost)}</small>`:''}`:'<small>defina o mínimo</small>'}</span></div>`).join('')}</div>
    <p class="hint" style="margin-top:10px">Sugestão: repor até o dobro do mínimo ou 30 dias de consumo mais o mínimo, o que for maior.</p></section>`;
}

/* ---------- Excel: exportar e importar ---------- */
function xlLib(){ return window.ExcelJS?Promise.resolve(window.ExcelJS):Promise.reject(new Error('load')); }
const p2=n=>String(n).padStart(2,'0');
const xn=s=>String(s??'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ');
const xh=s=>xn(s).replace(/\s*\(.*\)\s*$/,'');
const xv=v=>{ if(v==null) return ''; if(v instanceof Date) return v; if(typeof v==='object'){ if('result' in v) return xv(v.result); if(Array.isArray(v.richText)) return v.richText.map(t=>t.text).join(''); if('text' in v) return xv(v.text); return ''; } return v; };
const xDate=v=>{ v=xv(v); if(v instanceof Date) return isNaN(v)?'':`${v.getUTCFullYear()}-${p2(v.getUTCMonth()+1)}-${p2(v.getUTCDate())}`;
  if(typeof v==='number') return v>20000&&v<80000?xDate(new Date(Math.round((v-25569)*864e5))):'';
  const s=String(v).trim(); let m=s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/); if(m) return `${m[3].length===2?'20'+m[3]:m[3]}-${p2(m[2])}-${p2(m[1])}`;
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[1]}-${m[2]}-${m[3]}`:''; };
const xStr=v=>{ v=xv(v); return v instanceof Date?xDate(v):String(v).trim(); };
const xNum=v=>{ v=xv(v); if(typeof v==='number') return v; if(v instanceof Date||v==='') return null; let s=String(v).replace(/[R$\s]/g,''); if(s.includes(',')) s=s.replace(/\./g,'').replace(',','.'); const n=parseFloat(s); return isNaN(n)?null:n; };
const xBool=v=>['sim','s','x','1','true','verdadeiro','yes'].includes(xn(xv(v)));
const xEnum=(v,pairs)=>{ const n=xn(xv(v)); if(!n) return null; const p=pairs.find(([k,l])=>xn(k)===n||xn(l)===n); return p?p[0]:undefined; };
const xD=day=>{ if(!day) return ''; const [y,m,d]=day.split('-').map(Number); return new Date(Date.UTC(y,m-1,d)); };
const xIso=day=>{ const [y,m,d]=day.split('-').map(Number); return new Date(y,m-1,d,12).toISOString(); };
const lab=(pairs,k)=>(pairs.find(p=>p[0]===k)||['',k||''])[1];
const XCH=[['site','Site'],['whatsapp','WhatsApp'],['instagram','Instagram']], XKIND=[['digital','Digital'],['fisico','Físico']];
const XPAY=[['PIX','PIX'],['Cartão','Cartão'],['Sinal / Orçamento','Sinal / Orçamento'],['Dinheiro','Dinheiro']], XPAYS=[['Aguardando','Aguardando'],['Sinal pago','Sinal pago'],['Pago','Pago']];
const XST=STATUS.map(s=>[s.k,s.l]), XORI=Object.entries(ORIGINS).map(([k,o])=>[k,o[0]]), XSTG=C_STAGE.map(s=>[s[0],s[1]]), XLEAD=LEAD_ST.map(s=>[s[0],s[1]]);
const XSK=[['produto','Produto'],['insumo','Insumo']], XTYPE=[['in','Entrada'],['out','Saída']], XSIT=[['1','Realizado'],['0','Previsto']], XYN=[['1','Sim'],['0','Não']];
const yn=b=>b?'Sim':'Não';

/* Leitor de uma linha: só mexe nos campos cujas colunas existem na planilha. */
function xReader(r){ const errs=[]; const has=h=>xh(h) in r; return {errs,has,
  s:(h,cur)=>has(h)?xStr(r[xh(h)]):(cur??''),
  n:(h,cur)=>{ if(!has(h)) return cur??null; const raw=xStr(r[xh(h)]); if(raw==='') return null; const n=xNum(r[xh(h)]); if(n==null) errs.push(`${h}: “${raw}” não é um número`); return n; },
  d:(h,cur)=>{ if(!has(h)) return cur??''; const raw=xStr(r[xh(h)]); if(raw==='') return ''; const d=xDate(r[xh(h)]); if(!d) errs.push(`${h}: “${raw}” não é uma data (use DD/MM/AAAA)`); return d; },
  b:(h,cur)=>has(h)&&xStr(r[xh(h)])!==''?xBool(r[xh(h)]):!!cur,
  e:(h,pairs,cur)=>{ if(!has(h)) return cur; const k=xEnum(r[xh(h)],pairs); if(k===undefined){ errs.push(`${h}: “${xStr(r[xh(h)])}” não é uma opção válida`); return cur; } return k==null?cur:k; } }; }

const XS={
  orders:{name:'Pedidos',col:'orders',list:()=>D.orders,
    cols:[['ID','t',12],['Número','i',9],['Data','d',12],['Entregar até','d',13],['Canal','t',12,XCH],['Cliente','t',26],['Contato','t',20],['Cidade','t',16],['Item','t',34],['Quantidade','n',11],['Categoria','t',10],['Tipo','t',10,XKIND],['Valor','m',12],['Forma de pagamento','t',18,XPAY],['Situação do pagamento','t',20,XPAYS],['Valor do sinal','m',13],['Status','t',28,XST],['Referência','t',14],['Observações','t',40],['Já recebido (calculado)','m',16]],
    rows:()=>[...D.orders].sort((a,b)=>(a.num||0)-(b.num||0)).map(o=>[o.id,+o.num||'',xD(isoDay(o.at)),xD(o.due),lab(XCH,o.ch),o.client||'',o.contact||'',o.city||'',o.item||'',+o.qty||1,o.catN||'',lab(XKIND,o.kind),+o.value||0,o.pay||'',o.payS||'',+o.sinal||'',lab(XST,o.status),o.ref||'',o.note||'',paidOf(o)]),
    match:r=>{ const n=xNum(r[xh('Número')]); if(n) return D.orders.filter(o=>+o.num===n); const c=xn(xStr(r[xh('Cliente')])), it=xn(xStr(r[xh('Item')])), v=r2(xNum(r[xh('Valor')])), day=xDate(r[xh('Data')]); return c&&it?D.orders.filter(o=>xn(o.client)===c&&xn(o.item)===it&&r2(o.value)===v&&(!day||isoDay(o.at)===day)):[]; },
    imp(r,ex){ const x=xReader(r), e=ex||{}; const client=x.s('Cliente',e.client), item=x.s('Item',e.item), value=x.n('Valor',e.value);
      if(!client) x.errs.push('Cliente em branco'); if(!item) x.errs.push('Item em branco'); if(!(value>=0)) x.errs.push('Valor em branco ou inválido');
      let cat=x.s('Categoria',e.catN); if(/^\d$/.test(cat)) cat='0'+cat;
      const data={ch:x.e('Canal',XCH,e.ch||'whatsapp'),client,contact:x.s('Contato',e.contact),city:x.s('Cidade',e.city),item,catN:cat,kind:x.e('Tipo',XKIND,e.kind||'digital'),value:r2(value),pay:x.e('Forma de pagamento',XPAY,e.pay||'PIX'),payS:x.e('Situação do pagamento',XPAYS,e.payS||'Aguardando'),sinal:r2(x.n('Valor do sinal',e.sinal)||0),status:x.e('Status',XST,e.status||'novo'),ref:x.s('Referência',e.ref),note:x.s('Observações',e.note),qty:Math.max(1,x.n('Quantidade',e.qty)||1),due:x.d('Entregar até',e.due)};
      if(ex&&e.qty==null&&data.qty===1) delete data.qty;
      const day=x.d('Data',isoDay(e.at)); if(day&&day!==isoDay(e.at)){ data.at=xIso(day); data.month=mOf(day); } else if(!ex){ const now=new Date(); data.at=now.toISOString(); data.month=monthKey(now); }
      const num=x.n('Número',e.num); if(num&&(!ex||+e.num!==num)) data.num=Math.round(num);
      return {data,errs:x.errs}; }},
  clients:{name:'Clientes',col:'clients',list:()=>D.clients,
    cols:[['ID','t',12],['Nome','t',28],['WhatsApp / telefone','t',20],['Instagram','t',18],['E-mail','t',24],['Cidade','t',16],['De onde veio','t',18,XORI],['Detalhe da origem','t',26],['Etapa','t',20,XSTG],['O que procura','t',32],['Precisa de acompanhamento','t',16,XYN],['Acompanhar em','d',14],['Motivo do acompanhamento','t',28],['Cadastrado em (calculado)','d',14],['Pedidos (calculado)','i',10],['Total comprado (calculado)','m',16]],
    rows:()=>[...D.clients].sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR')).map(c=>{ const os=ordersOf(c); return [c.id,c.name||'',c.phone||'',c.ig||'',c.email||'',c.city||'',lab(XORI,ORIGINS[c.origin]?c.origin:'outro'),c.originNote||'',lab(XSTG,stageOf(c)),c.interest||'',yn(c.follow),xD(c.followAt),c.followWhy||'',xD(isoDay(c.at)),os.length,r2(os.reduce((a,o)=>a+(+o.value||0),0))]; }),
    match:r=>{ const c=findClient({phone:xStr(r[xh('WhatsApp / telefone')]),ig:(i=>i&&!i.startsWith('@')?'@'+i:i)(xStr(r[xh('Instagram')])),name:xStr(r[xh('Nome')])}); return c?[c]:[]; },
    imp(r,ex){ const x=xReader(r), e=ex||{}; const name=x.s('Nome',e.name); if(!name) x.errs.push('Nome em branco');
      let ig=x.s('Instagram',e.ig); if(ig&&!ig.startsWith('@')) ig='@'+ig; const follow=x.b('Precisa de acompanhamento',e.follow);
      const data={name,phone:x.s('WhatsApp / telefone',e.phone),ig,email:x.s('E-mail',e.email),city:x.s('Cidade',e.city),origin:x.e('De onde veio',XORI,e.origin||'outro'),originNote:x.s('Detalhe da origem',e.originNote),stage:x.e('Etapa',XSTG,ex?stageOf(ex):'info'),interest:x.s('O que procura',e.interest),follow,followAt:follow?x.d('Acompanhar em',e.followAt):'',followWhy:follow?x.s('Motivo do acompanhamento',e.followWhy):''};
      if(ex&&data.stage===stageOf(ex)) delete data.stage;
      return {data,errs:x.errs}; }},
  stock:{name:'Estoque',col:'stock',list:()=>D.stock,
    cols:[['ID','t',12],['Item','t',32],['Tipo','t',12,XSK],['Unidade','t',10],['Quantidade','n',12],['Mínimo','n',10],['Custo unitário','m',14],['Prazo de reposição (dias)','i',14],['Fornecedor','t',24],['Observações','t',34],['Situação (calculado)','t',20],['Dura quantos dias (calculado)','i',16],['Sugestão de compra (calculado)','n',16]],
    rows:()=>[...D.stock].sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR')).map(s=>{ const d=daysLeft(s); return [s.id,s.name||'',lab(XSK,s.kind),s.unit||'un',+s.qty||0,+s.min||0,+s.cost||'',leadOf(s),s.supplier||'',s.note||'',stockState(s)[1],d==null?'':Math.round(d),stockState(s)[2]>0?restockQty(s):'']; }),
    match:r=>{ const n=xn(xStr(r[xh('Item')])); return n?D.stock.filter(s=>xn(s.name)===n):[]; },
    imp(r,ex){ const x=xReader(r), e=ex||{}; const name=x.s('Item',e.name); if(!name) x.errs.push('Item em branco');
      const data={name,kind:x.e('Tipo',XSK,e.kind||'produto'),unit:x.s('Unidade',e.unit)||'un',qty:x.n('Quantidade',e.qty)||0,min:Math.max(0,x.n('Mínimo',e.min)||0),cost:r2(x.n('Custo unitário',e.cost)||0),lead:Math.max(0,Math.round(x.n('Prazo de reposição',e.lead)||0))||7,supplier:x.s('Fornecedor',e.supplier),note:x.s('Observações',e.note)};
      if(ex&&!e.lead&&data.lead===7) delete data.lead;
      return {data,errs:x.errs}; }},
  cash:{name:'Fluxo de caixa',col:'cash',list:cashLanc,
    cols:[['ID','t',12],['Data','d',12],['Tipo','t',10,XTYPE],['Descrição','t',36],['Categoria','t',24],['Valor','m',12],['Situação','t',12,XSIT],['Conta','t',20]],
    rows:()=>[...cashLanc()].sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(c=>[c.id,xD(c.date),lab(XTYPE,c.type==='in'?'in':'out'),c.desc||'',c.cat||'',+c.value||0,c.paid===false?'Previsto':'Realizado',accName(c.acc)]),
    match:r=>{ const d=xn(xStr(r[xh('Descrição')])), day=xDate(r[xh('Data')]), v=r2(xNum(r[xh('Valor')])), t=xEnum(r[xh('Tipo')],XTYPE)||'out'; return d&&day?cashLanc().filter(c=>xn(c.desc)===d&&c.date===day&&r2(c.value)===v&&(c.type==='in'?'in':'out')===t):[]; },
    imp(r,ex){ const x=xReader(r), e=ex||{}; const desc=x.s('Descrição',e.desc), value=x.n('Valor',e.value), date=x.d('Data',e.date);
      if(!desc) x.errs.push('Descrição em branco'); if(!(value>0)) x.errs.push('Valor em branco ou inválido'); if(!date) x.errs.push('Data em branco');
      const data={kind:'lanc',date,type:x.e('Tipo',XTYPE,e.type||'out'),desc,cat:x.s('Categoria',e.cat),value:r2(value),paid:x.e('Situação',XSIT,e.paid===false?'0':'1')==='1'};
      if(x.has('Conta')&&x.s('Conta')){ const a=accList().find(a=>xn(a.name)===xn(x.s('Conta'))); if(!a) x.errs.push(`Conta: “${x.s('Conta')}” não existe no painel`); else if(a.id!==accOf(e.acc)) data.acc=a.id; }
      return {data,errs:x.errs}; }},
  fixos:{name:'Contas fixas',col:'cash',list:cashFixos,
    cols:[['ID','t',12],['Tipo','t',10,XTYPE],['Descrição','t',36],['Categoria','t',24],['Valor','m',12],['Dia do mês','i',10],['Ativa','t',8,XYN]],
    rows:()=>[...cashFixos()].sort((a,b)=>(+a.day||1)-(+b.day||1)).map(c=>[c.id,lab(XTYPE,c.type==='in'?'in':'out'),c.desc||'',c.cat||'',+c.value||0,+c.day||1,yn(c.on!==false)]),
    match:r=>{ const d=xn(xStr(r[xh('Descrição')])); return d?cashFixos().filter(c=>xn(c.desc)===d):[]; },
    imp(r,ex){ const x=xReader(r), e=ex||{}; const desc=x.s('Descrição',e.desc), value=x.n('Valor',e.value);
      if(!desc) x.errs.push('Descrição em branco'); if(!(value>0)) x.errs.push('Valor em branco ou inválido');
      const data={kind:'fixo',type:x.e('Tipo',XTYPE,e.type||'out'),desc,cat:x.s('Categoria',e.cat),value:r2(value),day:Math.min(31,Math.max(1,Math.round(x.n('Dia do mês',e.day)||1))),on:x.has('Ativa')&&x.s('Ativa')!==''?x.b('Ativa'):e.on!==false};
      if(!ex) data.start=monthKey(new Date()); return {data,errs:x.errs}; }},
  leads:{name:'Atendimentos',col:'leads',list:()=>D.leads,
    cols:[['ID','t',12],['Data','d',12],['Canal','t',12,XCH],['Nome','t',28],['Contato','t',20],['Assunto','t',40],['Status','t',20,XLEAD]],
    rows:()=>[...D.leads].sort((a,b)=>String(a.at).localeCompare(String(b.at))).map(l=>[l.id,xD(isoDay(l.at)),lab(XCH,l.ch),l.name||'',l.contact||'',l.subject||'',lab(XLEAD,l.status)]),
    match:r=>{ const n=xn(xStr(r[xh('Nome')])), c=xn(xStr(r[xh('Contato')])), sub=xn(xStr(r[xh('Assunto')])); return n?D.leads.filter(l=>xn(l.name)===n&&xn(l.contact)===c&&xn(l.subject)===sub):[]; },
    imp(r,ex){ const x=xReader(r), e=ex||{}; const name=x.s('Nome',e.name); if(!name) x.errs.push('Nome em branco');
      const data={ch:x.e('Canal',XCH,e.ch||'whatsapp'),name,contact:x.s('Contato',e.contact),subject:x.s('Assunto',e.subject),status:x.e('Status',XLEAD,e.status||'aberto')};
      const day=x.d('Data',isoDay(e.at)); if(day&&day!==isoDay(e.at)) data.at=xIso(day); else if(!ex) data.at=new Date().toISOString();
      return {data,errs:x.errs}; }}
};
const XCAT={name:'Catálogo',cols:[['Categoria (nº)','t',12],['Nome da categoria','t',34],['Item','t',40],['Preço mínimo','m',14],['Preço máximo','m',14],['Visível no site','t',12,XYN],['Descrição','t',50]],
  rows:()=>D.catalog.flatMap(c=>(c.items||[]).map(it=>[c.n,c.t||'',it.name||'',+it.min||0,+it.max||0,yn(it.on!==false),it.desc||'']))};
const XRO={
  moves:{name:'Movimentos do estoque',cols:[['Item','t',32],['Data','d',12],['Quantidade','n',12],['Saldo depois','n',12],['Motivo','t',22],['Observação','t',34]],
    rows:()=>D.stock.flatMap(s=>(s.moves||[]).map(m=>[s.name||'',xD(isoDay(m.at)),+m.delta||0,+m.after||0,m.reason||'',m.obs||''])).sort((a,b)=>(b[1]||0)-(a[1]||0))},
  caixa:{name:'Caixa completo',cols:[['Data','d',12],['Descrição','t',40],['Categoria','t',24],['Tipo','t',10],['Valor','m',12],['Situação','t',12],['Origem','t',14],['Conta','t',20]],
    rows:()=>{ const b=cashBase(); const cur=monthKey(new Date()); return [...b,...fixosFor(cur,b)].sort((a,c)=>a.date.localeCompare(c.date)).map(e=>[xD(e.date),e.desc,e.cat,e.type==='in'?'Entrada':'Saída',e.value,e.paid?'Realizado':'Previsto',e.src==='order'?'Pedido':e.src==='fixo'||e.recId?'Conta fixa':'Lançamento',accName(e.acc)]); }},
  restock:{name:'Reposição',cols:[['Item','t',32],['Situação','t',22],['Em estoque','n',12],['Unidade','t',10],['Mínimo','n',10],['Dura quantos dias','i',14],['Comprar','n',12],['Custo estimado','m',14],['Fornecedor','t',24]],
    rows:()=>restockList().map(x=>[x.s.name||'',x.st[1],+x.s.qty||0,x.s.unit||'un',+x.s.min||0,x.days==null?'':Math.round(x.days),x.qty,x.cost,x.s.supplier||''])},
  contas:{name:'Contas',cols:[['Conta','t',26],['Banco','t',18],['Saldo inicial','m',14],['Saldo hoje','m',14],['Recebe os pedidos','t',16]],
    rows:()=>{ const b=cashBase(); return accList().map(a=>[a.name,a.virtual?'':a.bank||'',+a.ini||0,accSaldo(b,a.id),yn(!!a.main)]); }}
};
const XL_SETS={all:['orders','clients','stock','cash','fixos','leads','catalog','moves','caixa','contas','restock'],orders:['orders'],clients:['clients'],stock:['stock','moves','restock'],cash:['cash','fixos','caixa','contas'],restock:['restock']};
const XL_NAMES={all:'dados',orders:'pedidos',clients:'clientes',stock:'estoque',cash:'fluxo-de-caixa',restock:'lista-de-compras'};

async function xlBuild(which){
  const X=await xlLib(); const wb=new X.Workbook(); wb.creator='ESRO Admin'; wb.created=new Date();
  const add=(sp,ro)=>{ const rows=sp.rows(); const ws=wb.addWorksheet(sp.name,{views:[{state:'frozen',ySplit:1}]});
    ws.columns=sp.cols.map(c=>({header:c[0],width:c[2]||14})); rows.forEach(r=>ws.addRow(r));
    sp.cols.forEach((c,i)=>{ const col=ws.getColumn(i+1); const calc=/\(calculado\)$/.test(c[0])||c[0]==='ID'; if(c[1]==='d') col.numFmt='dd/mm/yyyy'; if(c[1]==='m') col.numFmt='#,##0.00';
      if(calc&&!ro) col.font={color:{argb:'FF9A8F88'}};
      if(c[3]&&!ro){ const f=['"'+c[3].map(p=>p[1]).join(',')+'"']; for(let r=2;r<=rows.length+300;r++) ws.getCell(r,i+1).dataValidation={type:'list',allowBlank:true,formulae:f}; }
      const h=ws.getCell(1,i+1); h.font={bold:true,color:{argb:'FFFFFFFF'}}; h.fill={type:'pattern',pattern:'solid',fgColor:{argb:ro||calc?'FF7C716A':'FF9C5237'}}; h.alignment={vertical:'middle',wrapText:true}; });
    ws.getRow(1).height=32; ws.autoFilter={from:{row:1,column:1},to:{row:1,column:sp.cols.length}}; };
  const keys=XL_SETS[which]||XL_SETS.all;
  if(which==='all'){ const ws=wb.addWorksheet('Leia-me'); ws.getColumn(1).width=110;
    ['ESRO Papelaria · dados do painel · '+dfull(today()),'','Como usar esta planilha:',
     '1. Cada aba é uma parte do painel: Pedidos, Clientes, Estoque, Fluxo de caixa, Contas fixas, Atendimentos e Catálogo.',
     '2. Para ALTERAR um registro, edite a linha e mantenha a coluna ID como está.',
     '3. Para CRIAR um registro, adicione uma linha nova e deixe a coluna ID em branco.',
     '4. Não mude o nome das abas nem os títulos das colunas. As colunas marcadas com "(calculado)" são só para consulta.',
     '5. Datas no formato DD/MM/AAAA. Nas colunas com lista (Canal, Status, Etapa, Tipo...), escolha uma das opções da lista.',
     '6. No painel, vá em Configurações > Planilhas (Excel) > Importar do Excel. Você confere o resumo antes de gravar.',
     '7. A importação nunca apaga nada: só cria e atualiza. Para excluir, use o painel.',
     '8. As abas em cinza (Movimentos do estoque, Caixa completo, Reposição) são relatórios e não são importadas.'].forEach((t,i)=>{ const c=ws.getCell(i+1,1); c.value=t; if(i===0||i===2) c.font={bold:true,size:i?12:14}; c.alignment={wrapText:true}; }); }
  for(const k of keys){ if(XS[k]) add(XS[k]); else if(k==='catalog') add(XCAT); else add(XRO[k],true); }
  return wb;
}
async function saveFile(name, blob){ if(DL) return DL.save({filename:name,data:blob}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000); }
async function xlExport(which){
  toast('Gerando planilha…');
  try{ const wb=await xlBuild(which); const buf=await wb.xlsx.writeBuffer(); const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    await saveFile(`esro-${XL_NAMES[which]||'dados'}-${today()}.xlsx`,blob); toast('Planilha exportada'); logAct('Exportação para Excel',XL_NAMES[which]||'dados');
    if(which==='all'&&S.canWrite&&DB){ const full={...D.settings,lastBackup:today()}; try{ await DB.doc('settings/store').set(full); D.settings=full; }catch(_){} } }
  catch(e){ if(e&&e.code==='declined') return; toast(e&&e.message==='load'?'O módulo de Excel não carregou. Recarregue a página e tente de novo.':e&&e.code?errMsg(e):'Não foi possível gerar a planilha',1); }
}
function xSame(k,a,b){
  if(typeof a==='boolean') return a===(b===undefined?k!=='follow':!!b);
  if(typeof a==='number') return a===(+b||0);
  if(a&&typeof a==='object') return JSON.stringify(a)===JSON.stringify(b??null);
  return String(a??'')===String(b??'');
}
let XI=null;
async function xlRead(buf, fileName){
  const X=await xlLib(); const wb=new X.Workbook(); await wb.xlsx.load(buf);
  const plan={file:fileName||'',sheets:[],ops:[]}; const find=name=>wb.worksheets.find(w=>xn(w.name)===xn(name));
  const readRows=(ws,fn)=>{ const heads=[]; ws.getRow(1).eachCell({includeEmpty:false},(c,i)=>{ heads[i]=xh(xStr(c.value)); });
    ws.eachRow({includeEmpty:false},(row,n)=>{ if(n===1) return; const r={}; let any=false; heads.forEach((h,i)=>{ if(!h) return; const v=row.getCell(i).value; r[h]=v; if(h!=='id'&&xStr(v)!=='') any=true; }); if(any) fn(r,n); }); };
  for(const key of ['orders','clients','stock','cash','fixos','leads']){ const sp=XS[key]; const ws=find(sp.name); if(!ws) continue;
    const st={name:sp.name,novo:0,upd:0,same:0,err:[]}; const list=sp.list(); const seen=new Set();
    readRows(ws,(r,n)=>{ const id=xStr(r.id); let ex=id?list.find(d=>d.id===id):null; if(!ex&&sp.match) ex=sp.match(r).find(c=>!seen.has(c.id))||null;
      if(ex){ if(seen.has(ex.id)){ st.err.push(`Linha ${n}: repete um registro que já está em outra linha (para criar um novo, apague o ID)`); return; } seen.add(ex.id); }
      const {data,errs}=sp.imp(r,ex); if(errs.length){ st.err.push(`Linha ${n}: ${errs.join('; ')}`); return; }
      if(ex){ const ch={}; for(const k in data) if(!xSame(k,data[k],ex[k])) ch[k]=data[k]; if(!Object.keys(ch).length){ st.same++; return; } st.upd++; plan.ops.push({key,col:sp.col,id:ex.id,ex,data:ch}); }
      else { st.novo++; plan.ops.push({key,col:sp.col,id:null,data}); } });
    plan.sheets.push(st); }
  const wc=find(XCAT.name);
  if(wc){ const st={name:'Catálogo (itens)',novo:0,upd:0,same:0,err:[]}; const by={};
    readRows(wc,(r,n)=>{ const x=xReader(r); let cn=x.s('Categoria'); if(/^\d$/.test(cn)) cn='0'+cn; const cat=D.catalog.find(c=>c.n===cn); const name=x.s('Item');
      if(!cat){ st.err.push(`Linha ${n}: categoria “${cn}” não existe`); return; } if(!name){ st.err.push(`Linha ${n}: item em branco`); return; }
      const items=by[cn]=by[cn]||(cat.items||[]).map(it=>({...it})); const i=items.findIndex(it=>xn(it.name)===xn(name)); const cur=i>=0?items[i]:null;
      const min=x.n('Preço mínimo',cur?.min)||0, max=x.n('Preço máximo',cur?.max)||0; if(x.errs.length){ st.err.push(`Linha ${n}: ${x.errs.join('; ')}`); return; }
      const nv={name:cur?cur.name:name,min:r2(min),max:r2(max),on:x.has('Visível no site')&&x.s('Visível no site')!==''?x.b('Visível no site'):(cur?cur.on!==false:true)}; const desc=x.s('Descrição',cur?.desc); if(desc||(cur&&cur.desc!==undefined)) nv.desc=desc;
      if(!cur){ items.push(nv); st.novo++; return; } const it={...cur}; let ch=false; for(const k in nv) if(!xSame(k,nv[k],cur[k])){ it[k]=nv[k]; ch=true; }
      if(ch){ items[i]=it; st.upd++; } else st.same++; });
    for(const cn in by){ const cat=D.catalog.find(c=>c.n===cn); if(JSON.stringify(by[cn])!==JSON.stringify(cat.items||[])) plan.ops.push({key:'catalog',col:'catalog',id:cat.id,ex:cat,data:{items:by[cn]}}); }
    plan.sheets.push(st); }
  return plan;
}
async function xlImportFile(file){
  if(!file) return; if(!/\.xlsx$/i.test(file.name)){ toast('Use um arquivo .xlsx (Excel). Arquivos .xls ou .csv não são aceitos.',1); return; }
  if(!DB||!S.canWrite){ toast('Importação indisponível nesta visualização',1); return; }
  toast('Lendo planilha…');
  try{ XI=await xlRead(await file.arrayBuffer(),file.name); openXlPreview(); }
  catch(e){ XI=null; toast(e&&e.message==='load'?'O módulo de Excel não carregou. Recarregue a página e tente de novo.':'Não foi possível ler o arquivo. Use um .xlsx exportado pelo painel.',1); }
}
function openXlPreview(){
  const p=XI; if(!p) return; const n=p.ops.length; const errs=p.sheets.reduce((a,s)=>a+s.err.length,0);
  $('#modalRoot').innerHTML=`<div class="overlay" data-close><div class="modal" role="dialog" aria-modal="true" aria-labelledby="xt" style="width:min(620px,100%)">
    <div class="modal-head"><div><h3 id="xt">Conferir importação</h3><small style="color:var(--text2);overflow-wrap:anywhere">${esc(p.file)}</small></div><button class="close" data-x aria-label="Fechar"><i data-lucide="x"></i></button></div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
      ${p.sheets.length?p.sheets.map(s=>`<div class="fieldset"><h4>${esc(s.name)}</h4><div class="split"><span class="mini"><b>${s.novo}</b> novo(s)</span><span class="mini"><b>${s.upd}</b> alterado(s)</span><span class="mini">${s.same} sem mudança</span>${s.err.length?`<span class="badge b-primary">${s.err.length} com erro</span>`:''}</div>
        ${s.err.length?`<div class="xerr">${s.err.slice(0,5).map(e=>`<div>${esc(e)}</div>`).join('')}${s.err.length>5?`<div>… e mais ${s.err.length-5} linha(s)</div>`:''}</div>`:''}</div>`).join('')
        :'<p class="hint">Nenhuma aba reconhecida. A planilha precisa ter abas com estes nomes: Pedidos, Clientes, Estoque, Fluxo de caixa, Contas fixas, Atendimentos ou Catálogo.</p>'}
      ${p.sheets.length?`<small style="color:var(--text2)">${n?'A importação só cria e atualiza registros; nada é apagado.':'Nada para importar: a planilha está igual ao painel.'}${errs?' As linhas com erro ficam de fora; corrija na planilha e importe de novo.':''}</small>`:''}
    </div>
    <div class="modal-foot"><button class="btn" data-x>Cancelar</button>${n?`<button class="btn primary" data-xlgo><i data-lucide="upload"></i>Importar ${n} registro(s)</button>`:''}</div></div></div>`;
  icons();
}
async function xlApply(btn){
  const plan=XI; if(!plan||!DB) return; XI=null; if(btn) btn.disabled=true; const total=plan.ops.length; let done=0, fail=0, stop='';
  let num=D.orders.reduce((m,o)=>Math.max(m,+o.num||0),1000); const now=new Date().toISOString(); const wait=ms=>new Promise(r=>setTimeout(r,ms));
  for(const op of plan.ops){ if(btn) btn.textContent=`Importando ${done+fail+1} de ${total}…`;
    const d={...op.data};
    if(op.key==='orders'){ if(op.id){ if('payS' in d||'value' in d||'sinal' in d) d.pays=orderPays(op.ex,{...op.ex,...d},now); } else { if(d.num) num=Math.max(num,d.num); else d.num=++num; d.files=[]; d.leadId=''; d.pays=orderPays(null,d,d.at); } }
    if(op.key==='stock'){ if(op.id){ if('qty' in d){ const before=+op.ex.qty||0; d.moves=[...(op.ex.moves||[]),{at:now,delta:Math.round((d.qty-before)*1000)/1000,after:d.qty,reason:'Ajuste de inventário',obs:'Importado do Excel'}].slice(-150); } } else d.moves=d.qty?[{at:now,delta:d.qty,after:d.qty,reason:'Estoque inicial',obs:'Importado do Excel'}]:[]; }
    if(op.key==='clients'&&!op.id) Object.assign(d,{notes:[{at:now,text:'Importado do Excel.'}],at:now,lastAt:now});
    if(op.key==='leads'&&!op.id) d.notes=[];
    if((op.key==='cash'||op.key==='fixos')&&!op.id) d.at=now;
    if(op.key!=='catalog') d.updatedAt=now;
    let ok=false, err=null;
    for(let t=0;t<4&&!ok;t++){ try{ if(op.id) await DB.doc(op.col+'/'+op.id).update(d); else await DB.collection(op.col).add(d); ok=true; }
      catch(e){ err=e; const c=e&&e.code; if(c==='resource_exhausted'||c==='unavailable'){ await wait(1500*(t+1)); continue; } break; } }
    if(ok) done++; else { fail++; const c=err&&err.code; if(c==='invalid_argument'||c==='quota_exceeded'||c==='revoked'||c==='not_granted'){ stop=errMsg(err); if(c==='invalid_argument') S.canWrite=false; break; } }
    await wait(90);
  }
  logAct('Importação do Excel',`${done} registro(s) · ${plan.file}`);
  closeModal(); toast(stop?`Importação interrompida após ${done} registro(s): ${stop}`:fail?`${done} importado(s), ${fail} com falha. Tente importar de novo.`:`${done} registro(s) importado(s)`,!!(stop||fail)); render();
}

/* ---------- Impressão para produção (PDF) ---------- */
const P_STEPS={fisico:['Arte aprovada','Material separado','Impressão','Acabamento','Conferência','Embalado','Entregue / enviado'],digital:['Briefing confirmado','Elaboração','Revisão','Arte / diagramação','Aprovado pelo cliente','Enviado ao cliente']};
const P_INK=[40,32,28], P_GRAY=[110,100,94], P_LINE=[190,180,172];
const pt=s=>String(s??'').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[–—]/g,'-').replace(/…/g,'...').replace(/•/g,'·').replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g,'').replace(/[ \t]+/g,' ').trim();
const dueState=o=>{ if(!o.due||o.status==='concluido'||o.status==='enviado') return null; const td=today(); return o.due<td?['b-primary','Atrasado · '+dmy(o.due),2]:o.due===td?['b-warn','Entrega hoje',1]:['b-neutral','Entrega '+dmy(o.due),0]; };
const dueBadge=o=>{ const d=dueState(o); return d?`<span class="badge ${d[0]}"><i data-lucide="calendar-clock"></i>${d[1]}</span>`:''; };
const dueOrders=()=>D.orders.filter(o=>{ const d=dueState(o); return d&&d[2]>0; });
const prodSort=(list,by)=>[...list].sort((a,b)=>by==='num'?(a.num||0)-(b.num||0):String(a.due||'9999').localeCompare(String(b.due||'9999'))||(a.num||0)-(b.num||0));

async function loadThumb(f){
  if(!/^image\//.test(f.type||'')) return null;
  try{ const r=await Promise.race([fetch('/_blob/'+f.id),new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),8000))]); if(!r.ok) return null;
    const url=URL.createObjectURL(await r.blob()); const img=await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=url; });
    if(!img.naturalWidth){ URL.revokeObjectURL(url); return null; }
    const k=Math.min(1,700/Math.max(img.naturalWidth,img.naturalHeight)); const c=document.createElement('canvas'); c.width=Math.max(1,Math.round(img.naturalWidth*k)); c.height=Math.max(1,Math.round(img.naturalHeight*k));
    const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height); x.drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(url);
    return {data:c.toDataURL('image/jpeg',.82),w:c.width,h:c.height,name:f.name}; }catch(e){ return null; }
}
/* Desenha (ou só mede, com draw=false) a ficha de um pedido a partir de y; devolve o y final. */
function pFicha(doc, o, y, draw, thumbs){
  const M=14, W=210, R=W-M, IW=W-2*M, X=M+4, y0=y;
  const font=(st,sz,col)=>{ doc.setFont('helvetica',st); doc.setFontSize(sz); doc.setTextColor(...(col||P_INK)); };
  const T=(s,x,yy,opt)=>{ if(draw) doc.text(s,x,yy,opt); };
  const label=(s,x,yy)=>{ font('bold',7,P_GRAY); T(s.toUpperCase(),x,yy); };
  const hr=yy=>{ if(draw){ doc.setDrawColor(...P_LINE); doc.setLineWidth(.2); doc.line(M,yy,R,yy); } };
  const split=(s,w)=>doc.splitTextToSize(s,w);
  font('bold',20); T(`PEDIDO #${o.num}`,X,y+10);
  font('normal',9,P_GRAY); T(pt(`Recebido em ${dfull(isoDay(o.at))} · ${CH[o.ch]?.long||''}${o.ref?' · ref. '+o.ref:''}`),X,y+15.5);
  const bw=58; if(draw){ doc.setDrawColor(...P_INK); doc.setLineWidth(.5); doc.rect(R-bw-4,y+3.5,bw,13); }
  label('Entregar até',R-bw-1,y+7.8); font('bold',13); T(o.due?dfull(o.due):'____ / ____ / ______',R-bw-1,y+14);
  y+=20; hr(y);
  label('Cliente',X,y+5); label('Contato',X+88,y+5); label('Cidade',X+136,y+5);
  font('bold',11); const cl=split(pt(o.client)||'-',82); T(cl,X,y+10.5); font('normal',10); const ct=split(pt(o.contact)||'-',44), cy=split(pt(o.city)||'-',38); T(ct,X+88,y+10.5); T(cy,X+136,y+10.5);
  y+=10.5+(Math.max(cl.length,ct.length,cy.length)-1)*4.6+4; hr(y);
  label('Item',X,y+5); label('Quantidade',R-30,y+5);
  font('bold',14); const it=split(pt(o.item)||'-',IW-46); T(it,X,y+11.5); font('bold',16); T(qfmt(o.qty||1),R-30,y+12);
  y+=11.5+(it.length-1)*6+3;
  const cat=D.catalog.find(c=>c.n===o.catN); font('normal',9,P_GRAY); T(pt([cat?`${cat.n} ${cat.t}`:'',o.kind==='fisico'?'Produto físico':'Serviço / material digital','Status: '+stLabel(o.status)].filter(Boolean).join(' · ')),X,y+2);
  y+=6; hr(y);
  label('Pagamento',X,y+5.2); font('normal',9.5); T(pt(`${o.payS||'Aguardando'} · ${o.pay||''} · recebido ${fmt(paidOf(o))} de ${fmt(o.value)}`),X+26,y+5.2);
  y+=8; hr(y);
  label('Observações / briefing',X,y+5); font('normal',10.5); let nl=pt(o.note)?split(pt(o.note),IW-8):[]; if(nl.length>44) nl=[...nl.slice(0,43),'(continua no painel)'];
  if(nl.length){ font('normal',10.5); T(nl,X,y+10.5); y+=10.5+(nl.length-1)*4.5+4; }
  else { if(draw){ doc.setDrawColor(...P_LINE); doc.setLineWidth(.2); doc.line(X,y+13,R-4,y+13); doc.line(X,y+20,R-4,y+20); } y+=23; }
  hr(y);
  const files=o.files||[];
  if(files.length){ label('Artes e arquivos',X,y+5); font('normal',9.5); let fy=y+10; files.slice(0,8).forEach(f=>{ T(pt(`· ${f.name} - ${FILE_ST[f.st]?.[1]||''}`).slice(0,110),X,fy); fy+=4.6; }); if(files.length>8){ T(`· e mais ${files.length-8} arquivo(s)`,X,fy); fy+=4.6; }
    y=fy;
    if(thumbs&&thumbs.length){ let tx=X; const mh=40, mw=56; thumbs.slice(0,3).forEach(t=>{ const k=Math.min(mw/t.w,mh/t.h); const w=t.w*k, h=t.h*k; if(draw){ try{ doc.addImage(t.data,'JPEG',tx,y+1,w,h); doc.setDrawColor(...P_LINE); doc.setLineWidth(.2); doc.rect(tx,y+1,w,h); }catch(e){} } tx+=mw+4; }); y+=mh+4; }
    else y+=1;
    hr(y); }
  label('Etapas da produção',X,y+5); const steps=P_STEPS[o.kind==='fisico'?'fisico':'digital']; const colW=(IW-8)/4;
  steps.forEach((s,i)=>{ const sx=X+(i%4)*colW, sy=y+11+Math.floor(i/4)*6.8; if(draw){ doc.setDrawColor(...P_INK); doc.setLineWidth(.35); doc.rect(sx,sy-3.2,4,4); } font('normal',9.5); T(s,sx+5.5,sy); });
  y+=10+Math.ceil(steps.length/4)*6.8; hr(y);
  label('Anotações da produção',X,y+5); if(draw){ doc.setDrawColor(...P_LINE); doc.setLineWidth(.2); doc.line(X,y+11.5,R-4,y+11.5); doc.line(X,y+17.5,R-4,y+17.5); } y+=21;
  if(draw){ doc.setDrawColor(...P_INK); doc.setLineWidth(.6); doc.roundedRect(M,y0,IW,y-y0,2,2); }
  return y;
}
function pHeader(doc, title, sub){
  const M=14, R=196; let x=M; const logo=document.querySelector('.brand .mark img');
  if(logo&&/^data:image\/jpe?g/.test(logo.src||'')){ try{ doc.addImage(logo.src,'JPEG',M,8,11,11); x=M+14; }catch(e){} }
  doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(...P_INK); doc.text('ESRO Papelaria',x,13);
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...P_GRAY); doc.text(pt(title),x,18);
  doc.text(pt(sub),R,13,{align:'right'}); doc.setDrawColor(...P_LINE); doc.setLineWidth(.2); doc.line(M,21.5,R,21.5);
}
function pLista(doc, list, title, sub){
  const M=14, R=196, top=27, bottom=283; const cols=[['',5],['Pedido',14],['Entrega',19],['Cliente',34],['Item',46],['Observações',42],['Status',22]]; const xs=[]; let x=M; cols.forEach(c=>{ xs.push(x); x+=c[1]; });
  const head=y=>{ doc.setFillColor(238,233,228); doc.rect(M,y,R-M,7,'F'); doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(...P_GRAY); cols.forEach((c,i)=>{ if(c[0]) doc.text(c[0].toUpperCase(),xs[i]+1,y+4.7); }); return y+7; };
  pHeader(doc,title,sub); let y=head(top); const td=today();
  list.forEach(o=>{ doc.setFont('helvetica','normal'); doc.setFontSize(8.8);
    const cl=doc.splitTextToSize(pt(o.client)||'-',cols[3][1]-2); doc.setFont('helvetica','bold'); const it=doc.splitTextToSize(pt(`${o.qty>1?qfmt(o.qty)+' x ':''}${o.item||'-'}`),cols[4][1]-2); doc.setFont('helvetica','normal'); let ob=doc.splitTextToSize(pt(o.note).replace(/\n+/g,' / '),cols[5][1]-2); if(ob.length>4) ob=[...ob.slice(0,3),ob[3].slice(0,-3)+'...'];
    const st=doc.splitTextToSize(stLabel(o.status),cols[6][1]-2); const n=Math.max(cl.length,it.length,ob.length,st.length,o.due&&o.due<td?2:1); const h=Math.max(9,n*3.9+4.2);
    if(y+h>bottom){ doc.addPage('a4','p'); pHeader(doc,title,sub); y=head(top); doc.setFont('helvetica','normal'); doc.setFontSize(8.8); }
    doc.setTextColor(...P_INK); doc.setDrawColor(...P_INK); doc.setLineWidth(.35); doc.rect(xs[0]+.5,y+2.4,3.6,3.6);
    doc.setFont('helvetica','bold'); doc.text('#'+o.num,xs[1]+1,y+5.4); doc.text(o.due?dfull(o.due).slice(0,5):'-',xs[2]+1,y+5.4);
    if(o.due&&o.due<td){ doc.setFontSize(6.5); doc.text('ATRASADO',xs[2]+1,y+9); doc.setFontSize(8.8); }
    doc.setFont('helvetica','normal'); doc.text(cl,xs[3]+1,y+5.4); doc.setFont('helvetica','bold'); doc.text(it,xs[4]+1,y+5.4); doc.setFont('helvetica','normal'); doc.setTextColor(...P_GRAY); doc.text(ob,xs[5]+1,y+5.4); doc.setTextColor(...P_INK); doc.text(st,xs[6]+1,y+5.4);
    y+=h; doc.setDrawColor(...P_LINE); doc.setLineWidth(.2); doc.line(M,y,R,y); });
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(...P_GRAY); if(y+8>bottom+6){ doc.addPage('a4','p'); pHeader(doc,title,sub); y=top; } doc.text(`${list.length} pedido(s) nesta lista`,M,y+6);
}
async function prodPdf(orders, opt){
  opt=Object.assign({what:'fichas',onePer:false,imgs:true,by:'due'},opt||{}); if(!orders.length){ toast('Nenhum pedido para imprimir com esses filtros',1); return false; }
  if(!window.jspdf){ toast('Não foi possível carregar o gerador de PDF. Confira a internet e recarregue a página.',1); return false; }
  toast('Gerando PDF…'); const list=prodSort(orders,opt.by);
  const { jsPDF }=window.jspdf; const doc=new jsPDF({unit:'mm',format:'a4'}); const now=new Date(); const sub=`Impresso em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`;
  let first=true;
  if(opt.what==='lista'||opt.what==='ambos'){ pLista(doc,list,'Lista de produção',sub); first=false; }
  if(opt.what==='fichas'||opt.what==='ambos'){
    const top=27, bottom=285; if(!first) doc.addPage('a4','p'); pHeader(doc,list.length>1?'Fichas de produção':'Ficha de produção',sub); let y=top;
    for(let i=0;i<list.length;i++){ const o=list[i]; let thumbs=[];
      if(opt.imgs){ for(const f of (o.files||[]).filter(f=>/^image\//.test(f.type||'')).slice(0,3)){ const t=await loadThumb(f); if(t) thumbs.push(t); } }
      const h=pFicha(doc,o,0,false,thumbs);
      if(i>0&&(opt.onePer||y+h>bottom)){ doc.addPage('a4','p'); pHeader(doc,'Fichas de produção',sub); y=top; }
      else if(i>0){ doc.setDrawColor(...P_LINE); doc.setLineWidth(.2); doc.setLineDashPattern([1.5,1.5],0); doc.line(8,y-4,202,y-4); doc.setLineDashPattern([],0); }
      y=pFicha(doc,o,y,true,thumbs)+8; }
  }
  const pages=doc.getNumberOfPages(); for(let p=1;p<=pages;p++){ doc.setPage(p); doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...P_GRAY); doc.text(`ESRO Papelaria · página ${p} de ${pages}`,105,292,{align:'center'}); }
  const name=list.length===1&&opt.what==='fichas'?`ficha-pedido-${list[0].num}.pdf`:`producao-esro-${today()}.pdf`;
  try{ await saveFile(name,doc.output('blob')); toast('PDF pronto: abra o arquivo e imprima'); return true; }catch(e){ if(e&&e.code!=='declined') toast(errMsg(e),1); return false; }
}
const P_DEF=['novo','producao','arte'];
function printSel(){ const sts=[...document.querySelectorAll('[data-pst]:checked')].map(x=>x.dataset.pst); const kind=$('#p-kind')?.value||''; return D.orders.filter(o=>sts.includes(o.status)&&(!kind||(o.kind==='fisico'?'fisico':'digital')===kind)); }
function printCount(){ const el=$('#p-count'); if(!el) return; const n=printSel().length; el.textContent=n?`${n} pedido(s) selecionado(s)`:'Nenhum pedido com esses filtros'; const b=$('[data-pgo]'); if(b) b.disabled=!n; }
function openPrint(){
  const cnt=k=>D.orders.filter(o=>o.status===k).length;
  $('#modalRoot').innerHTML=`<div class="overlay" data-close><div class="modal" role="dialog" aria-modal="true" aria-labelledby="pr" style="width:min(600px,100%)">
    <div class="modal-head"><div><h3 id="pr">Imprimir para produção</h3><small style="color:var(--text2)">Gera um PDF em A4, em preto e branco, pronto para imprimir.</small></div><button class="close" data-x aria-label="Fechar"><i data-lucide="x"></i></button></div>
    <div class="modal-body form" style="display:grid">
      <label class="full">O que imprimir<select class="inp" id="p-what"><option value="fichas">Fichas de produção (uma ficha completa por pedido)</option><option value="lista">Lista resumida (uma linha por pedido, para conferir)</option><option value="ambos">Lista resumida + fichas</option></select></label>
      <div class="fieldset full"><h4>Pedidos com status</h4><div class="pchecks">${STATUS.map(s=>`<label class="chk"><input type="checkbox" data-pst="${s.k}" ${P_DEF.includes(s.k)?'checked':''}>${s.l} <small style="color:var(--text2)">(${cnt(s.k)})</small></label>`).join('')}</div></div>
      <label>Tipo<select class="inp" id="p-kind"><option value="">Todos</option><option value="fisico">Só produtos físicos</option><option value="digital">Só serviços e digitais</option></select></label>
      <label>Ordenar por<select class="inp" id="p-by"><option value="due">Data de entrega</option><option value="num">Número do pedido</option></select></label>
      <label class="chk full"><input type="checkbox" id="p-one">Uma ficha por página</label>
      <label class="chk full"><input type="checkbox" id="p-imgs" checked>Incluir as imagens das artes anexadas</label>
      <b class="full" id="p-count" style="color:var(--text)"></b>
    </div>
    <div class="modal-foot"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-pgo><i data-lucide="printer"></i>Gerar PDF</button></div></div></div>`;
  icons(); printCount();
}

/* ---------- Contas (caixa e bancos) e extrato bancário ---------- */
const BANKS=['Nubank','Itaú','Bradesco','Banco do Brasil','Caixa Econômica','Santander','Inter','C6 Bank','Mercado Pago','PagBank','Sicredi','Sicoob','Outro'];
const XFER='Transferência entre contas';
const accList=()=>[{id:'caixa',name:'Caixa (dinheiro)',kind:'dinheiro',ini:+D.settings.caixaInicial||0,virtual:true},...[...D.accounts].sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR'))];
const accOf=id=>id&&D.accounts.some(a=>a.id===id)?id:'caixa';
const accName=id=>(accList().find(a=>a.id===accOf(id))||{}).name||'Caixa';
const mainAcc=()=>(D.accounts.find(a=>a.main)||{id:'caixa'}).id;
const accSaldo=(base,id,upTo)=>cashSaldo(base,upTo||today(),id);
const accOpts=cur=>accList().map(a=>`<option value="${esc(a.id)}" ${a.id===accOf(cur)?'selected':''}>${esc(a.name)}</option>`).join('');
function accStrip(base){
  const multi=D.accounts.length>0;
  return `<section class="accs">${accList().map(a=>{ const v=accSaldo(base,a.id); return `<div class="card acc ${S.cashAcc===a.id?'on':''}">
      <button class="acc-main" data-kacc="${esc(a.id)}" aria-pressed="${S.cashAcc===a.id}" title="Ver só os lançamentos desta conta"><span class="acc-ic"><i data-lucide="${a.kind==='dinheiro'?'banknote':'landmark'}"></i></span><span class="grow"><b>${esc(a.name)}</b><small>${a.main?'Recebe os pagamentos dos pedidos':a.virtual?(multi?'Dinheiro em espécie':'Onde entram e saem os valores'):esc(a.bank||'Conta bancária')}</small></span><b class="tnum" style="color:${v<0?'var(--crit)':'inherit'}">${v<0?'− ':''}${fmt(Math.abs(v))}</b></button>
      ${S.canWrite?`<div class="acc-act">${a.virtual?`<button class="linkish" data-ksaldo><i data-lucide="pencil"></i>Saldo inicial</button>`:`${a.kind!=='dinheiro'?`<label class="linkish" style="cursor:pointer"><i data-lucide="file-up"></i>Importar extrato<input type="file" class="stFile" data-acc="${esc(a.id)}" accept=".csv,.ofx,.txt" hidden></label>`:''}<button class="linkish" data-kaccedit="${esc(a.id)}"><i data-lucide="pencil"></i>Editar</button>`}</div>`:''}</div>`; }).join('')}
    ${S.canWrite?`<button class="card acc add" data-kaccnew><i data-lucide="plus"></i><span><b>Adicionar conta</b><small>Nubank ou outro banco</small></span></button>`:''}</section>`;
}
function openAcc(id){
  const a=id?D.accounts.find(x=>x.id===id):null; if(id&&!a) return; const v=a||{bank:'Nubank',name:'Nubank',kind:'banco',ini:'',main:!D.accounts.some(x=>x.main)}; delArm=null;
  $('#modalRoot').innerHTML=`<div class="overlay" data-close><div class="modal" role="dialog" aria-modal="true" aria-labelledby="ac" style="width:min(560px,100%)">
    <div class="modal-head"><div><h3 id="ac">${a?esc(a.name):'Adicionar conta'}</h3><small style="color:var(--text2)">O painel não se conecta ao banco e nunca pede senha: os lançamentos entram pelo extrato que você exporta do app.</small></div><button class="close" data-x aria-label="Fechar"><i data-lucide="x"></i></button></div>
    <div class="modal-body form" style="display:grid">
      <label>Banco<select class="inp" id="a-bank">${BANKS.map(b=>`<option ${b===(v.bank||'Outro')?'selected':''}>${b}</option>`).join('')}</select></label>
      <label><span>Nome da conta <span class="req">*</span></span><input class="inp" id="a-name" value="${esc(v.name)}" placeholder="Ex.: Nubank PJ"></label>
      <label>Saldo inicial (R$)<input class="inp tnum" id="a-ini" type="number" step="0.01" value="${esc(v.ini)}" placeholder="Antes do primeiro lançamento"></label>
      <label>Saldo de hoje no app do banco (R$)<input class="inp tnum" id="a-now" type="number" step="0.01" placeholder="Opcional: acerta o saldo inicial"></label>
      <label class="chk full"><input type="checkbox" id="a-main" ${v.main?'checked':''}>Os pagamentos dos pedidos (PIX e cartão) caem nesta conta</label>
      <small class="full" style="color:var(--text2)">A chave PIX das cobranças fica em Configurações. Pagamentos em dinheiro continuam indo para o Caixa.</small>
    </div>
    <div class="modal-foot">${a?`<button class="btn danger" data-kaccdel="${a.id}" style="margin-right:auto"><i data-lucide="trash-2"></i>Excluir</button>`:''}<button class="btn" data-x>Cancelar</button><button class="btn primary" data-kaccsave="${a?a.id:''}"><i data-lucide="check"></i>${a?'Salvar':'Adicionar conta'}</button></div></div></div>`;
  icons(); if(!a) $('#a-name').select();
}
async function saveAcc(id){
  const name=$('#a-name').value.trim(); if(!name){ $('#a-name').focus(); toast('Informe o nome da conta',1); return; }
  const dup=D.accounts.find(x=>x.id!==id&&xn(x.name)===xn(name)); if(dup||xn(name)===xn('Caixa (dinheiro)')){ toast('Já existe uma conta com este nome',1); return; }
  const now=new Date().toISOString(); let ini=r2(parseFloat($('#a-ini').value)||0); const nowV=$('#a-now').value.trim();
  if(nowV!==''){ const mov=id?r2(cashBase().filter(e=>e.paid&&e.acc===id&&e.date<=today()).reduce((s,e)=>s+(e.type==='in'?e.value:-e.value),0)):0; ini=r2((parseFloat(nowV)||0)-mov); }
  const data={name,bank:$('#a-bank').value,kind:'banco',ini,main:$('#a-main').checked,updatedAt:now};
  const ref=id?DB.doc('accounts/'+id):DB.collection('accounts').doc();
  const ok=await write(()=>id?ref.update(data):ref.set({...data,at:now}),id?'Conta atualizada':`${name} adicionada`); if(!ok) return;
  if(data.main) for(const o of D.accounts.filter(x=>x.main&&x.id!==ref.id)){ try{ await DB.doc('accounts/'+o.id).update({main:false}); }catch(_){} }
  logAct(id?'Conta alterada':'Conta cadastrada',name); closeModal(); if(!id) S.cashAcc=ref.id;
}
function openXfer(){
  $('#modalRoot').innerHTML=`<div class="overlay" data-close><div class="modal" role="dialog" aria-modal="true" aria-labelledby="xf" style="width:min(520px,100%)">
    <div class="modal-head"><div><h3 id="xf">Transferir entre contas</h3><small style="color:var(--text2)">Depósito, saque ou PIX entre as suas contas. Não conta como entrada nem saída.</small></div><button class="close" data-x aria-label="Fechar"><i data-lucide="x"></i></button></div>
    <div class="modal-body form" style="display:grid">
      <label>Sai de<select class="inp" id="x-from">${accOpts(S.cashAcc||'caixa')}</select></label>
      <label>Entra em<select class="inp" id="x-to">${accOpts(accList().find(a=>a.id!==(S.cashAcc||'caixa'))?.id)}</select></label>
      <label><span>Valor (R$) <span class="req">*</span></span><input class="inp tnum" id="x-value" type="number" min="0" step="0.01"></label>
      <label>Data<input class="inp" id="x-date" type="date" value="${today()}"></label>
    </div>
    <div class="modal-foot"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-kxfersave><i data-lucide="check"></i>Transferir</button></div></div></div>`;
  icons(); $('#x-value').focus();
}
async function saveXfer(){
  const from=$('#x-from').value, to=$('#x-to').value, value=r2(parseFloat($('#x-value').value)), date=$('#x-date').value||today();
  if(from===to){ toast('Escolha duas contas diferentes',1); return; } if(!(value>0)){ $('#x-value').focus(); toast('Informe o valor',1); return; }
  const now=new Date().toISOString(); const mk=(type,acc,other)=>({kind:'lanc',type,date,desc:`${type==='out'?'Transferência para':'Transferência de'} ${accName(other)}`,cat:XFER,value,paid:true,acc,at:now,updatedAt:now});
  if(await write(()=>DB.collection('cash').add(mk('out',from,to)))&&await write(()=>DB.collection('cash').add(mk('in',to,from)),'Transferência registrada')) closeModal();
}

/* Extrato: CSV (Nubank: Data,Valor,Identificador,Descrição) ou OFX */
function csvRows(text){ const first=text.split(/\r?\n/).find(l=>l.trim())||''; const sep=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':','; const rows=[]; let row=[], cur='', q=false;
  for(let i=0;i<text.length;i++){ const c=text[i]; if(q){ if(c==='"'){ if(text[i+1]==='"'){ cur+='"'; i++; } else q=false; } else cur+=c; }
    else if(c==='"') q=true; else if(c===sep){ row.push(cur); cur=''; } else if(c==='\n'||c==='\r'){ if(c==='\r'&&text[i+1]==='\n') i++; row.push(cur); cur=''; if(row.some(x=>x.trim()!=='')) rows.push(row); row=[]; } else cur+=c; }
  row.push(cur); if(row.some(x=>x.trim()!=='')) rows.push(row); return rows; }
function parseStatement(text){
  const out={lines:[],balance:null,balDate:'',kind:''};
  if(/<OFX>|<STMTTRN>/i.test(text)){ out.kind='OFX'; const tag=(blk,t)=>{ const m=blk.match(new RegExp('<'+t+'>([^<\\r\\n]*)','i')); return m?m[1].trim():''; };
    for(const blk of text.split(/<STMTTRN>/i).slice(1)){ const b=blk.split(/<\/STMTTRN>/i)[0]; const dt=tag(b,'DTPOSTED'); const date=/^\d{8}/.test(dt)?`${dt.slice(0,4)}-${dt.slice(4,6)}-${dt.slice(6,8)}`:''; const v=xNum(tag(b,'TRNAMT'));
      if(!date||v==null||!v) continue; out.lines.push({date,value:Math.abs(r2(v)),type:v<0?'out':'in',desc:(tag(b,'MEMO')||tag(b,'NAME')||'Lançamento do extrato').replace(/\s+/g,' '),ext:tag(b,'FITID')}); }
    const lb=text.split(/<LEDGERBAL>/i)[1]; if(lb){ const v=xNum(tag(lb,'BALAMT')); const d=tag(lb,'DTASOF'); if(v!=null){ out.balance=r2(v); out.balDate=/^\d{8}/.test(d)?`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`:''; } }
  } else { out.kind='CSV'; const rows=csvRows(text); if(rows.length<2) return out; const head=rows[0].map(xn); const col=names=>head.findIndex(h=>names.includes(h));
    const cd=col(['data','date','data lancamento','data do lancamento','data movimento']), cv=col(['valor','amount','valor (r$)','quantia']), cx=col(['descricao','description','historico','title','lancamento','detalhes']), ci=col(['identificador','id','fitid','codigo']);
    if(cd<0||cv<0) return out;
    rows.slice(1).forEach(r=>{ const date=xDate(r[cd]); const v=xNum(r[cv]); if(!date||v==null||!v) return; out.lines.push({date,value:Math.abs(r2(v)),type:v<0?'out':'in',desc:String(cx>=0?r[cx]||'':'').replace(/\s+/g,' ').trim()||'Lançamento do extrato',ext:ci>=0?String(r[ci]||'').trim():''}); }); }
  const seen={}; out.lines.forEach(l=>{ if(!l.ext){ const k=`${l.date}|${l.type}|${l.value}|${xn(l.desc)}`; seen[k]=(seen[k]||0)+1; l.ext=`h:${k}#${seen[k]}`; } });
  out.lines.sort((a,b)=>a.date.localeCompare(b.date)); return out;
}
function stmtCat(l){ const d=xn(l.desc); if(l.type==='in') return 'Vendas';
  if(/correios|frete|loggi|jadlog|sedex|transportadora|uber/.test(d)) return 'Frete e entregas'; if(/facebook|facebk|instagram|meta |google ads|anuncio|impulsion/.test(d)) return 'Marketing e anúncios';
  if(/das |simples nacional|imposto|receita federal|darf|iof|tarifa|taxa/.test(d)) return 'Taxas e impostos'; if(/embalag|caixa de papel|sacola/.test(d)) return 'Embalagens';
  if(/papel|grafica|kalunga|papelaria|armarinho|encadern|espiral|tinta|cartucho/.test(d)) return 'Insumos e materiais'; if(/canva|adobe|google|microsoft|claude|openai|hostinger|assinatura/.test(d)) return 'Ferramentas e assinaturas';
  if(/aluguel|energia|enel|sabesp|internet|vivo|claro|tim |net /.test(d)) return 'Aluguel e contas'; return 'Outros'; }
let ST=null;
async function stmtFile(file, accId){
  if(!file) return; if(!DB||!S.canWrite){ toast('Importação indisponível nesta visualização',1); return; }
  const acc=D.accounts.find(a=>a.id===accId); if(!acc) return;
  if(/\.pdf$/i.test(file.name)){ toast('O extrato em PDF não é lido. Use o arquivo CSV ou OFX que o banco envia junto.',1); return; }
  let text=''; try{ const buf=await file.arrayBuffer(); try{ text=new TextDecoder('utf-8',{fatal:true}).decode(buf); }catch(_){ text=new TextDecoder('windows-1252').decode(buf); } }catch(e){ toast('Não foi possível ler o arquivo',1); return; }
  const st=parseStatement(text.replace(/^﻿/,'')); if(!st.lines.length){ toast('Não encontrei lançamentos neste arquivo. Use o extrato da conta em CSV ou OFX.',1); return; }
  const base=cashBase(); const known=new Set([...D.cash.filter(c=>c.extId&&accOf(c.acc)===accId).map(c=>c.extId),...D.orders.flatMap(o=>paysOf(o).map(p=>p.ext).filter(Boolean))]);
  const used=new Set(); const dd=(a,b)=>Math.abs((new Date(a)-new Date(b))/864e5); let old=0; const rows=[];
  for(const l of st.lines){ if(known.has(l.ext)){ old++; continue; }
    const m=base.find(e=>e.paid&&!e.ext&&!e.xfer&&e.acc===accId&&e.type===l.type&&Math.abs(e.value-l.value)<0.005&&dd(e.date,l.date)<=3&&!used.has(e.key)); if(m) used.add(m.key);
    const sug=l.type==='in'&&!m?D.orders.filter(o=>Math.abs(dueOf(o)-l.value)<0.005&&isoDay(o.at)<=l.date).slice(0,4):[];
    rows.push({...l,on:true,match:m||null,orders:sug,act:m?'match':sug.length===1?'order:'+sug[0].id:'cat:'+stmtCat(l)}); }
  ST={acc:accId,file:file.name,kind:st.kind,rows,old,balance:st.balance,balDate:st.balDate}; openStmt();
}
function stmtCount(){ const b=$('[data-stgo]'); if(!b||!ST) return; const n=ST.rows.filter(r=>r.on).length; b.disabled=!n; b.innerHTML=`<i data-lucide="check"></i>Importar ${n} lançamento(s)`; icons(); }
function openStmt(){
  const s=ST; if(!s) return; const tin=r2(s.rows.filter(r=>r.type==='in').reduce((a,r)=>a+r.value,0)), tout=r2(s.rows.filter(r=>r.type==='out').reduce((a,r)=>a+r.value,0));
  const opt=(v,l,cur)=>`<option value="${esc(v)}" ${v===cur?'selected':''}>${esc(l)}</option>`;
  $('#modalRoot').innerHTML=`<div class="overlay" data-close><div class="modal" role="dialog" aria-modal="true" aria-labelledby="stt" style="width:min(860px,100%)">
    <div class="modal-head"><div><h3 id="stt">Extrato · ${esc(accName(s.acc))}</h3><small style="color:var(--text2);overflow-wrap:anywhere">${esc(s.file)} · ${s.kind}</small></div><button class="close" data-x aria-label="Fechar"><i data-lucide="x"></i></button></div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
      <div class="split"><span class="mini"><b>${s.rows.length}</b> lançamento(s) novo(s)</span><span class="mini">entradas <b>${fmt(tin)}</b></span><span class="mini">saídas <b>${fmt(tout)}</b></span>${s.old?`<span class="mini">${s.old} já importado(s) antes</span>`:''}${s.rows.some(r=>r.match)?`<span class="mini">${s.rows.filter(r=>r.match).length} já no painel</span>`:''}</div>
      ${s.rows.length?`<small style="color:var(--text2)">Confira como cada linha será lançada. Linhas que já estão no painel (um pedido marcado como pago, por exemplo) são só vinculadas, sem duplicar.</small>
      <div class="stl">${s.rows.map((r,i)=>`<div class="st-row"><input type="checkbox" data-ston="${i}" ${r.on?'checked':''} aria-label="Importar esta linha"><div class="st-d"><b>${esc(r.desc)}</b><small>${dfull(r.date)}</small></div><b class="tnum st-v" style="color:${r.type==='out'?'var(--crit)':'inherit'}">${r.type==='out'?'− ':'+ '}${fmt(r.value)}</b>
        <select class="inp" data-stact="${i}" aria-label="Como lançar">${r.match?opt('match','Já está no painel: '+r.match.desc,r.act):''}${r.orders.map(o=>opt('order:'+o.id,`Pagamento do pedido #${o.num} · ${o.client}`,r.act)).join('')}${CASH_CATS[r.type].map(c=>opt('cat:'+c,c,r.act)).join('')}${opt('cat:'+XFER,XFER,r.act)}</select></div>`).join('')}</div>`
      :'<p class="hint">Todos os lançamentos deste arquivo já foram importados antes.</p>'}
      ${s.balance!=null&&s.rows.length?`<label class="chk"><input type="checkbox" id="st-bal" checked>Acertar o saldo da conta para bater com o extrato (${fmt(s.balance)}${s.balDate?' em '+dfull(s.balDate):''})</label>`:''}
    </div>
    <div class="modal-foot"><button class="btn" data-x>Cancelar</button>${s.rows.length?`<button class="btn primary" data-stgo></button>`:''}</div></div></div>`;
  icons(); stmtCount();
}
async function stmtApply(btn){
  const s=ST; if(!s||!DB) return; ST=null; const rows=s.rows.filter(r=>r.on); const fixBal=$('#st-bal')?.checked; if(btn) btn.disabled=true;
  const now=new Date().toISOString(); const wait=ms=>new Promise(r=>setTimeout(r,ms)); let done=0, fail=0, stop=''; const local={};
  const upTo=s.balDate||today(); let mov=r2(cashBase().filter(e=>e.paid&&e.acc===s.acc&&e.date<=upTo).reduce((x,e)=>x+(e.type==='in'?e.value:-e.value),0));
  const ord=id=>local[id]||(local[id]={...D.orders.find(o=>o.id===id)});
  for(const r of rows){ if(btn) btn.textContent=`Importando ${done+fail+1} de ${rows.length}…`;
    const job=async()=>{
      if(r.act==='match'&&r.match){ if(r.match.src==='cash') return DB.doc('cash/'+r.match.id).update({extId:r.ext,updatedAt:now});
        const o=ord(r.match.id); const pays=paysOf(o).map((p,i)=>i===r.match.pi?{...p,ext:r.ext,acc:s.acc}:p); o.pays=pays; return DB.doc('orders/'+o.id).update({pays}); }
      if(r.act.startsWith('order:')){ const o=ord(r.act.slice(6)); if(o&&o.id){ const pays=[...paysOf(o),{at:xIso(r.date),value:r.value,ext:r.ext,acc:s.acc}]; o.pays=pays; const left=Math.max(0,r2((+o.value||0)-pays.reduce((a,p)=>a+(+p.value||0),0))); o.payS=left<0.005?'Pago':'Sinal pago'; return DB.doc('orders/'+o.id).update({pays,payS:o.payS}); } }
      const cat=r.act.startsWith('cat:')?r.act.slice(4):stmtCat(r);
      return DB.collection('cash').add({kind:'lanc',type:r.type,date:r.date,desc:r.desc,cat,value:r.value,paid:true,acc:s.acc,extId:r.ext,at:now,updatedAt:now}); };
    let ok=false, err=null; for(let t=0;t<4&&!ok;t++){ try{ await job(); ok=true; }catch(e){ err=e; const c=e&&e.code; if(c==='resource_exhausted'||c==='unavailable'){ await wait(1500*(t+1)); continue; } break; } }
    if(ok){ done++; if(!(r.act==='match'&&r.match)&&r.date<=upTo) mov=r2(mov+(r.type==='in'?r.value:-r.value)); } else { fail++; const c=err&&err.code; if(['invalid_argument','quota_exceeded','revoked','not_granted'].includes(c)){ stop=errMsg(err); break; } }
    await wait(90); }
  if(fixBal&&s.balance!=null&&!stop&&!fail){ try{ await DB.doc('accounts/'+s.acc).update({ini:r2(s.balance-mov),updatedAt:now}); }catch(_){} }
  logAct('Extrato bancário importado',`${done} lançamento(s) · ${accName(s.acc)} · ${s.file}`);
  closeModal(); S.cashAcc=s.acc; const last=rows.length?rows[rows.length-1].date:''; if(last) S.cashM=mOf(last); S.cashTab='lanc';
  toast(stop?`Importação interrompida após ${done} lançamento(s): ${stop}`:fail?`${done} importado(s), ${fail} com falha. Importe o arquivo de novo.`:`${done} lançamento(s) do extrato importado(s)`,!!(stop||fail)); render();
}

/* ---------- Render ---------- */
function render(){
  const a=document.activeElement; const keep=(a&&a.id&&$('#view').contains(a))?{id:a.id,v:a.value,s:a.selectionStart,e:a.selectionEnd}:null;
  killCharts(); renderNav(); renderNotif();
  if(S.dbOk===false){ $('#view').innerHTML=`<div class="card">${emptyState('database','Não foi possível abrir os dados do painel',STANDALONE?'Recarregue a página e entre de novo com a sua senha.':'Abra este painel pelo claude.ai com sua conta conectada. Os pedidos, atendimentos e o catálogo ficam guardados lá.')}</div>`; icons(); return; }
  if(!S.ready){ $('#view').innerHTML='<div class="loading">Carregando dados da ESRO…</div>'; return; }
  const V={overview:vOverview,orders:vOrders,clients:vClients,catalog:vCatalog,stock:vStock,cash:vCash,inbox:vInbox,arts:vArts,reports:vReports,settings:vSettings};
  $('#view').innerHTML=V[S.view](); icons();
  if(S.view==='overview') drawOverview(); if(S.view==='reports') drawReports(); if(S.view==='cash') drawCash(); if(S.view==='inbox') afterInbox();
  if(keep){ const el=document.getElementById(keep.id); if(el){ if('value' in el && keep.v!=null && el.tagName!=='SELECT') el.value=keep.v; el.focus(); try{ el.setSelectionRange(keep.s,keep.e); }catch(_){} } }
}
let rT; const soon=()=>{ clearTimeout(rT); rT=setTimeout(()=>{ if(S.view==='settings' && S.ready && $('#s-pixKey')){ renderNav(); return; } render(); },60); };

/* ---------- Eventos ---------- */
document.addEventListener('click',async e=>{
  if(e.target.closest('#bell')){ S.notifOpen=!S.notifOpen; renderNotif(); return; }
  if(S.notifOpen && !e.target.closest('#notif')){ S.notifOpen=false; renderNotif(); }
  const el=e.target.closest('button,[data-open],[data-close],tr,.row,a'); if(!el) return; const d=el.dataset;
  if(el.tagName==='A'){ if(el.id==='waSend'&&S.canWrite&&S.lead&&S.compose.trim()) addNote(S.lead,'Mensagem aberta no WhatsApp:\n'+S.compose.trim()); if(d.clink) clientLink(d.clink); return; }
  if(el.matches('[data-close]')){ if(e.target===el) closeModal(); return; }
  if(d.x!==undefined){ closeModal(); return; }
  if(d.nav){ go(d.nav); return; }
  if(d.go){ S.notifOpen=false; if(d.go==='inbox') S.inboxTab=L.convs.some(x=>x.nao_lidas)?'live':S.inboxTab; go(d.go); return; }
  if(d.ch){ S.ch=d.ch; render(); return; }
  if(d.mode){ S.orderMode=d.mode; try{localStorage.setItem('esro-orderMode',d.mode)}catch(_){ } render(); return; }
  if(d.neworder!==undefined){ openOrder(null); return; }
  if(d.osave!==undefined){ saveOrder(d.osave||null); return; }
  if(d.odel){ if(delArm!==d.odel){ delArm=d.odel; el.innerHTML='<i data-lucide="alert-triangle"></i>Confirmar exclusão'; icons(); return; }
    const o=D.orders.find(x=>x.id===d.odel); if(await write(()=>DB.doc('orders/'+d.odel).delete(),`Pedido #${o?.num} excluído`)){ logAct('Pedido excluído',`#${o?.num} · ${o?.client||''} · ${fmt(o?.value)}`); closeModal(); if(ASSETS&&o) for(const f of (o.files||[])){ try{ await ASSETS.delete(f.id);}catch(_){} } } return; }
  if(d.fdel){ const k='f'+d.fdel; if(delArm!==k){ delArm=k; el.classList.add('danger'); el.title='Clique de novo para remover'; toast('Clique de novo para remover o arquivo'); return; } const [oid,i]=d.fdel.split(':'); delFile(oid,i); return; }
  if(d.fset){ const [oid,i,st]=d.fset.split(':'); setFileSt(oid,i,st); return; }
  if(d.leadGo){ S.inboxTab='leads'; S.lead=d.leadGo; S.showChat=true; S.compose=''; S.pix=null; S.pixOpen=false; go('inbox'); return; }
  if(d.itab){ S.inboxTab=d.itab; S.showChat=false; render(); return; }
  if(d.liveStart!==undefined){ if(L.mcp) liveStart(); else toast(mcpMsg({code:'not_granted'}),1); return; }
  if(d.live){ liveSelect(d.live); return; }
  if(d.liveGo){ S.inboxTab='live'; go('inbox'); liveSelect(d.liveGo); return; }
  if(d.liveSend!==undefined){ liveSend(); return; }
  if(d.liveLead!==undefined){ const c=L.convs.find(x=>x.id===L.sel); if(!c) return; const now=new Date().toISOString(); const ref=DB.collection('leads').doc();
    if(await write(()=>ref.set({ch:c.canal,name:c.nome||c.contato||'Cliente',contact:c.canal==='whatsapp'?c.contato:(c.usuario?'@'+c.usuario:''),subject:(c.ultima_mensagem||'').slice(0,80),status:'aberto',notes:[],at:now,updatedAt:now}),'Atendimento registrado')){ ensureClient({name:c.nome||c.contato||'Cliente',contact:liveContact(c),ch:c.canal,interest:(c.ultima_mensagem||'').slice(0,80)},'info','Pediu informações pelo '+(CH[c.canal]?.label||'canal')+'.'); render(); } return; }
  if(d.liveOrder!==undefined){ const c=L.convs.find(x=>x.id===L.sel); if(!c) return; const lead=D.leads.find(l=>digits(l.contact)&&digits(l.contact).slice(-8)===digits(c.contato).slice(-8));
    openOrder(null,{ch:c.canal,client:c.nome||'',contact:c.canal==='whatsapp'?c.contato:(c.usuario?'@'+c.usuario:''),leadId:lead?.id}); return; }
  if(d.siteImport){ const o=L.site.find(x=>String(x.id)===d.siteImport); if(o) openOrder(null,siteOrderPreset(o)); return; }
  if(d.stab){ S.stockTab=d.stab; render(); return; }
  if(d.snew){ openStock(null,d.snew); return; }
  if(d.ssave2!==undefined){ saveStock(d.ssave2||null); return; }
  if(d.smove){ openMove(d.smove); return; }
  if(d.sq){ const [id,n]=d.sq.split(':'); moveStock(id,+n,+n>0?'Ajuste rápido (+1)':'Ajuste rápido (−1)'); return; }
  if(d.mvgo){ const q=parseFloat($('#mv-qty').value); const t=$('#mv-type').value; if(!(q>=0)||(t!=='set'&&!q)){ $('#mv-qty').focus(); toast('Informe a quantidade',1); return; }
    const paid=t==='in'?r2(parseFloat($('#mv-cost').value)||0):0, sk=D.stock.find(x=>x.id===d.mvgo), obs=$('#mv-obs').value.trim();
    if(await moveStock(d.mvgo,t==='out'?-q:q,t==='set'?'Ajuste de inventário':$('#mv-reason').value,obs,t==='set'?q:null)){ closeModal();
      if(paid>0&&sk){ const now=new Date().toISOString(); await write(()=>DB.collection('cash').add({kind:'lanc',type:'out',date:today(),desc:`Compra · ${sk.name}${obs?' · '+obs:''}`,cat:'Insumos e materiais',value:paid,paid:true,stockId:sk.id,acc:mainAcc(),at:now,updatedAt:now}),`Compra de ${fmt(paid)} lançada no fluxo de caixa`); } } return; }
  if(d.sdel){ if(delArm!=='s'+d.sdel){ delArm='s'+d.sdel; el.innerHTML='<i data-lucide="alert-triangle"></i>Confirmar exclusão'; icons(); return; } const sk=D.stock.find(x=>x.id===d.sdel); if(await write(()=>DB.doc('stock/'+d.sdel).delete(),'Item excluído')){ logAct('Item do estoque excluído',sk?.name||''); closeModal(); } return; }
  if(d.sedit){ openStock(d.sedit); return; }
  if(d.kacc!==undefined){ S.cashAcc=S.cashAcc===d.kacc?'':d.kacc; S.cashTab='lanc'; render(); return; }
  if(d.kaccnew!==undefined){ openAcc(null); return; }
  if(d.kaccedit){ openAcc(d.kaccedit); return; }
  if(d.kaccsave!==undefined){ saveAcc(d.kaccsave||null); return; }
  if(d.kaccdel){ const used=D.cash.some(c=>c.acc===d.kaccdel)||D.orders.some(o=>(o.pays||[]).some(p=>p.acc===d.kaccdel)); if(used){ toast('Esta conta tem lançamentos. Exclua ou mova os lançamentos antes de excluir a conta.',1); return; }
    if(delArm!=='a'+d.kaccdel){ delArm='a'+d.kaccdel; el.innerHTML='<i data-lucide="alert-triangle"></i>Confirmar exclusão'; icons(); return; } const ac=D.accounts.find(x=>x.id===d.kaccdel); if(await write(()=>DB.doc('accounts/'+d.kaccdel).delete(),'Conta excluída')){ logAct('Conta excluída',ac?.name||''); if(S.cashAcc===d.kaccdel) S.cashAcc=''; closeModal(); } return; }
  if(d.kxfer!==undefined){ openXfer(); return; }
  if(d.kxfersave!==undefined){ saveXfer(); return; }
  if(d.stgo!==undefined){ stmtApply(el); return; }
  if(d.audit!==undefined){ openAudit(); return; }
  if(d.bkexport!==undefined){ backupExport(); return; }
  if(d.bkgo!==undefined){ backupApply(el); return; }
  if(d.print!==undefined){ openPrint(); return; }
  if(d.oprint){ const o=D.orders.find(x=>x.id===d.oprint); if(o){ el.disabled=true; await prodPdf([o],{what:'fichas'}); el.disabled=false; } return; }
  if(d.pgo!==undefined){ el.disabled=true; const ok=await prodPdf(printSel(),{what:$('#p-what').value,by:$('#p-by').value,onePer:$('#p-one').checked,imgs:$('#p-imgs').checked}); if(ok) closeModal(); else el.disabled=false; return; }
  if(d.xl){ xlExport(d.xl); return; }
  if(d.xlgo!==undefined){ xlApply(el); return; }
  if(d.knew){ openCash(null,{type:d.knew}); return; }
  if(d.kfnew!==undefined){ openCash(null,{fixo:true,type:'out'}); return; }
  if(d.ksave!==undefined){ saveCash(d.ksave||null,!!d.kfixo); return; }
  if(d.kdel){ if(delArm!=='k'+d.kdel){ delArm='k'+d.kdel; el.innerHTML='<i data-lucide="alert-triangle"></i>Confirmar exclusão'; icons(); return; } const kc=D.cash.find(x=>x.id===d.kdel); if(await write(()=>DB.doc('cash/'+d.kdel).delete(),'Lançamento excluído')){ logAct('Lançamento excluído',`${kc?.desc||''} · ${fmt(kc?.value)}`); closeModal(); } return; }
  if(d.kpaid){ const c=D.cash.find(x=>x.id===d.kpaid); if(c) await write(()=>DB.doc('cash/'+c.id).update({paid:true,date:today(),updatedAt:new Date().toISOString()}),`${c.desc}: ${c.type==='in'?'recebido':'pago'}`); return; }
  if(d.kfix){ const [id,date]=d.kfix.split(':'); el.disabled=true; await payFixo(id,date); return; }
  if(d.ktab){ S.cashTab=d.ktab; render(); return; }
  if(d.kmonth!==undefined){ const n=+d.kmonth, cur=monthKey(new Date()); if(!n) S.cashM=cur; else { const [y,m]=(S.cashM||cur).split('-').map(Number); S.cashM=monthKey(new Date(y,m-1+n,1)); } render(); return; }
  if(d.ksaldo!==undefined){ openSaldo(); return; }
  if(d.ksaldosave!==undefined){ const v=r2(parseFloat($('#k-ini').value)||0); const full={...D.settings,caixaInicial:v}; if(await write(()=>DB.doc('settings/store').set(full),'Saldo inicial salvo')){ D.settings=full; logAct('Saldo inicial do caixa alterado',fmt(v)); closeModal(); render(); } return; }
  if(d.rcopy!==undefined){ copy(restockText()); return; }
  if(d.kfedit){ openCash(d.kfedit); return; }
  if(d.kedit){ openCash(d.kedit); return; }
  if(d.cnew!==undefined){ openClient(null); return; }
  if(d.csave!==undefined){ saveClient(d.csave||null); return; }
  if(d.cpw){ clientPwLink(d.cpw,el); return; }
  if(d.cpwcopy!==undefined){ if(S.pwMsg) copy(S.pwMsg); return; }
  if(d.cjoin){ if(delArm!=='j'+d.to){ delArm='j'+d.to; el.innerHTML='<i data-lucide="alert-triangle"></i>Confirmar união'; icons(); return; } delArm=null; joinClients(d.cjoin,d.to); return; }
  if(d.cdel){ if(delArm!=='c'+d.cdel){ delArm='c'+d.cdel; el.innerHTML='<i data-lucide="alert-triangle"></i>Confirmar exclusão'; icons(); return; } const c=D.clients.find(x=>x.id===d.cdel); if(await write(()=>DB.doc('clients/'+d.cdel).delete(),`${c?.name||'Cliente'} excluído(a)`)){ logAct('Cliente excluído',c?.name||''); closeModal(); } return; }
  if(d.ctab){ S.cTab=(S.cTab===d.ctab&&d.ctab!=='todos')?'todos':d.ctab; render(); return; }
  if(d.cmode){ S.cMode=d.cmode; try{localStorage.setItem('esro-clientMode',d.cmode)}catch(_){ } render(); return; }
  if(d.cdone){ if(await clientDone(d.cdone)){ const f=$('#c-follow'); if(f){ f.checked=false; $('#c-followAt').value=''; $('#c-followWhy').value=''; el.remove(); } } return; }
  if(d.cfol){ openClient(d.cfol,null,true); return; }
  if(d.cfd){ $('#c-follow').checked=true; $('#c-followAt').value=plusDays(+d.cfd); return; }
  if(d.cnote){ const i=$('#c-noteNew'); if(!i.value.trim()){ i.focus(); toast('Escreva a anotação primeiro',1); return; } if(await clientNote(d.cnote,i.value)) i.value=''; return; }
  if(d.clinkcopy){ const c=D.clients.find(x=>x.id===d.clinkcopy); if(c){ await copy(linkMsg(c)); clientLink(c.id); } return; }
  if(d.corder){ const c=D.clients.find(x=>x.id===d.corder); if(c) openOrder(null,{ch:CH[c.origin]?c.origin:'whatsapp',client:c.name,contact:c.phone||c.ig||c.email||'',city:c.city||'',clientId:c.id}); return; }
  if(d.cimport!==undefined){ el.disabled=true; await importClients(); return; }
  if(d.liveClient!==undefined){ const c=L.convs.find(x=>x.id===L.sel); if(!c) return; openClient(null,{name:c.nome||'',phone:c.canal==='whatsapp'?(c.contato||''):'',ig:c.canal==='instagram'&&c.usuario?'@'+c.usuario:'',origin:c.canal,interest:(c.ultima_mensagem||'').slice(0,80)}); return; }
  if(d.cedit){ if(e.target.closest('select,input')) return; openClient(d.cedit); return; }
  if(d.open){ openOrder(d.open); return; }
  if(d.newlead!==undefined){ openLeadForm(); return; }
  if(d.leadsave!==undefined){ saveLead(); return; }
  if(d.lead && el.classList.contains('conv')){ if(S.lead!==d.lead){ S.compose=''; S.pix=null; S.pixOpen=false; } S.lead=d.lead; S.showChat=true; render(); return; }
  if(d.leadOrder){ const l=D.leads.find(x=>x.id===d.leadOrder); openOrder(null,{ch:l.ch,client:l.name,contact:l.contact,note:l.subject||'',leadId:l.id}); return; }
  if(d.leaddel){ if(delArm!=='l'+d.leaddel){ delArm='l'+d.leaddel; el.classList.add('danger'); toast('Clique de novo para excluir o atendimento'); return; } const ld=D.leads.find(x=>x.id===d.leaddel); if(await write(()=>DB.doc('leads/'+d.leaddel).delete(),'Atendimento excluído')) logAct('Atendimento excluído',ld?.name||''); delArm=null; S.lead=null; return; }
  if(d.back!==undefined){ S.showChat=false; render(); return; }
  if(d.qr){ S.compose=quickReplies()[+d.qr][2]; render(); const t=$('#compose'); if(t){ t.focus(); t.style.height=Math.min(t.scrollHeight+4,220)+'px'; } return; }
  if(d.pix!==undefined){ S.pixOpen=!S.pixOpen; render(); return; }
  if(d.pixgo!==undefined){ const v=parseFloat($('#pixV').value); if(!(v>0)){ $('#pixV').focus(); toast('Informe um valor maior que zero',1); return; }
    const desc=$('#pixD').value.trim(); const l=D.leads.find(x=>x.id===S.lead); const txid='ESRO'+Date.now().toString(36).toUpperCase();
    const code=pixPayload(v,desc,txid); if(!code){ toast('Cadastre a chave PIX em Configurações',1); return; }
    S.pix={lead:S.inboxTab==='live'?L.sel:S.lead,v,d:desc,code}; S.pixOpen=false;
    S.compose=`Segue o PIX de ${fmt(v)}${desc?` (${desc})`:''} 💛\n\nCódigo copia e cola:\n${code}\n\nÉ só colar na opção "PIX copia e cola" do app do seu banco.${D.settings.assinatura?'\n\n'+D.settings.assinatura:''}`;
    render(); if(S.canWrite&&l&&S.inboxTab!=='live') addNote(l.id,`PIX de ${fmt(v)} gerado${desc?` (${desc})`:''}.`); return; }
  if(d.copyPix!==undefined){ copy(S.pix?.code||''); return; }
  if(d.copyCompose!==undefined){ if(S.compose.trim()) copy(S.compose); else toast('Escreva a mensagem primeiro',1); return; }
  if(d.note){ if(!S.compose.trim()){ $('#compose').focus(); toast('Escreva a anotação primeiro',1); return; } if(await addNote(d.note,S.compose)){ S.compose=''; toast('Anotação registrada'); } return; }
  if(d.cat){ const c=D.catalog.find(x=>x.n===d.cat); const cur=S['open'+d.cat]??(d.cat==='01'||d.cat==='07'); S['open'+d.cat]=!cur; render(); return; }
  if(d.tog){ const [n,i]=d.tog.split(':'); const c=D.catalog.find(x=>x.n===n); const items=c.items.map((it,j)=>j===+i?{...it,on:!it.on}:it); setItems(n,items,`${items[+i].name}: ${items[+i].on?'visível no site':'oculto do site'}`); return; }
  if(d.idel){ if(delArm!=='i'+d.idel){ delArm='i'+d.idel; el.classList.add('danger'); toast('Clique de novo para remover o item'); return; } const [n,i]=d.idel.split(':'); const c=D.catalog.find(x=>x.n===n); setItems(n,c.items.filter((_,j)=>j!==+i),'Item removido'); delArm=null; return; }
  if(d.iadd){ const n=d.iadd; const name=$('#new-'+n).value.trim(); if(!name){ $('#new-'+n).focus(); return; } const p=parsePrice($('#newp-'+n).value); const c=D.catalog.find(x=>x.n===n); await setItems(n,[...(c.items||[]),{name,...p,on:true}],`${name} adicionado`); return; }
  if(d.addq){ const [n,i]=d.addq.split(':'); const it=D.catalog.find(x=>x.n===n).items[+i]; const ex=S.quote.find(l=>l.name===it.name); if(ex) ex.qty++; else S.quote.push({name:it.name,qty:1,price:it.max||it.min||0}); render(); toast(`${it.name} no orçamento`); return; }
  if(d.qdel){ S.quote.splice(+d.qdel,1); render(); return; }
  if(d.qclear!==undefined){ S.quote=[]; render(); return; }
  if(d.qcopy!==undefined){ copy(quoteText()); return; }
  if(d.qpdf!==undefined){ quotePdf(); return; }
  if(d.ssave!==undefined){ saveSettings(); return; }
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){ closeModal(); S.notifOpen=false; renderNotif(); closeSide(); }
  if(e.key==='Enter' && e.target.matches('tr[data-open]')) openOrder(e.target.dataset.open);
  if(e.key==='Enter' && e.target.matches('tr[data-cedit]')) openClient(e.target.dataset.cedit);
  if(e.key==='Enter' && e.target.matches('tr[data-kedit],tr[data-kfedit]')) openCash(e.target.dataset.kedit||e.target.dataset.kfedit);
  if(e.key==='Enter' && e.target.matches('tr[data-sedit]')) openStock(e.target.dataset.sedit);
  if(e.key==='Enter' && e.target.id==='c-noteNew'){ e.preventDefault(); document.querySelector('[data-cnote]')?.click(); }
  if(e.key==='Enter' && e.target.closest('#oForm') && e.target.tagName==='INPUT'){ e.preventDefault(); }
});
document.addEventListener('submit',e=>e.preventDefault());
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.id==='q'){ S.q=t.value.trim(); if(S.q && !['orders','clients','inbox','arts','stock','cash'].includes(S.view)) S.view='orders'; clearTimeout(render.t); render.t=setTimeout(render,160); return; }
  if(t.id==='compose'){ S.compose=t.value; const a=$('#waSend'); const l=D.leads.find(x=>x.id===S.lead); if(a&&l) a.href=waLink(l.contact,S.compose); return; }
  if(t.id==='qClient'){ S.quoteClient=t.value; return; }
  if(t.id==='qPhone'){ S.quotePhone=t.value; clearTimeout(render.p); render.p=setTimeout(render,500); return; }
  if(t.dataset.qqty){ S.quote[+t.dataset.qqty].qty=Math.max(1,parseInt(t.value)||1); updTot(); return; }
  if(t.dataset.qprice){ S.quote[+t.dataset.qprice].price=Math.max(0,parseFloat(t.value)||0); updTot(); return; }
  if(t.id==='f-item') fillFromItem();
  if(t.id==='mv-cost'){ t.dataset.auto='0'; return; }
  if(t.id==='mv-qty'){ const c=$('#mv-cost'); if(c&&c.dataset.auto!=='0'&&$('#mv-type').value==='in'&&$('#mv-reason').value==='Compra'){ const sk=D.stock.find(x=>x.id===c.dataset.sid), q=parseFloat(t.value); c.value=sk&&sk.cost&&q>0?r2(q*sk.cost):''; } return; }
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset.price){ const [n,i]=t.dataset.price.split(':'); const c=D.catalog.find(x=>x.n===n); const p=parsePrice(t.value); const items=c.items.map((it,j)=>j===+i?{...it,...p}:it); setItems(n,items,`Preço de ${items[+i].name} atualizado`); return; }
  if(t.id==='leadSt'){ const l=D.leads.find(x=>x.id===t.dataset.leadst); const now=new Date().toISOString(); write(()=>DB.doc('leads/'+l.id).update({status:t.value,updatedAt:now}),'Status do atendimento atualizado'); if(t.value==='orcamento') ensureClient({name:l.name,contact:l.contact,ch:l.ch},'link','Orçamento enviado.'); return; }
  if(t.dataset.fst){ const [oid,i]=t.dataset.fst.split(':'); setFileSt(oid,i,t.value); return; }
  if(t.dataset.cst){ setClientStage(t.dataset.cst,t.value); return; }
  if(t.id==='cOrigin'){ S.cOrigin=t.value; render(); return; }
  if(t.id==='f-files'){ uploadTo(t.dataset.order,[...t.files]); return; }
  if(t.id==='artOrder'){ S.artOrder=t.value; return; }
  if(t.classList.contains('stFile')){ const f=t.files[0], a=t.dataset.acc; t.value=''; stmtFile(f,a); return; }
  if(t.dataset.ston){ if(ST) ST.rows[+t.dataset.ston].on=t.checked; stmtCount(); return; }
  if(t.dataset.stact){ if(ST) ST.rows[+t.dataset.stact].act=t.value; return; }
  if(t.id==='a-bank'){ const n=$('#a-name'); if(n&&(!n.value.trim()||BANKS.includes(n.value.trim()))) n.value=t.value==='Outro'?'':t.value; return; }
  if(t.dataset.pst||t.id==='p-kind'){ printCount(); return; }
  if(t.id==='bkFile'){ const f=t.files[0]; t.value=''; backupFile(f); return; }
  if(t.id==='xlFile'){ const f=t.files[0]; t.value=''; xlImportFile(f); return; }
  if(t.id==='k-type'){ const dl=$('#dl-kcat'); if(dl) dl.innerHTML=CASH_CATS[t.value==='in'?'in':'out'].map(x=>`<option value="${esc(x)}">`).join(''); return; }
  if(t.id==='mv-type'){ const cl=$('#mv-costL'); if(cl) cl.hidden=t.value!=='in'; const r=$('#mv-reason'); r.disabled=t.value==='set'; r.innerHTML=(MOVE_REASONS[t.value]||['Ajuste de inventário']).map(x=>`<option>${x}</option>`).join(''); return; }
  if(t.id==='artFiles'){ if(!S.artOrder){ toast('Escolha o pedido antes',1); t.value=''; return; } uploadTo(S.artOrder,[...t.files]); return; }
});
function updTot(){ const el=$('#qTot'); if(el) el.textContent=fmt(S.quote.reduce((a,l)=>a+l.qty*l.price,0)); const a=$('#qWa'); if(a){ const h=waLink(S.quotePhone,quoteText()); if(h) a.href=h; } }

/* Drag & drop: kanban e upload */
let dragId=null;
let dragC=null;
document.addEventListener('dragstart',e=>{ const k=e.target.closest('[data-cdrag]'); if(k&&S.canWrite){ dragC=k.dataset.cdrag; e.dataTransfer.effectAllowed='move'; try{e.dataTransfer.setData('text/plain',dragC);}catch(_){ } return; }
  const c=e.target.closest('[data-drag]'); if(!c||!S.canWrite) return; dragId=c.dataset.drag; e.dataTransfer.effectAllowed='move'; try{e.dataTransfer.setData('text/plain',dragId);}catch(_){ } });
document.addEventListener('dragover',e=>{ const col=e.target.closest('[data-col]'); const dr=e.target.closest('#drop'); const cc=e.target.closest('[data-ccol]');
  if(cc&&dragC){ e.preventDefault(); document.querySelectorAll('.col.over').forEach(x=>x!==cc&&x.classList.remove('over')); cc.classList.add('over'); }
  if(col&&dragId){ e.preventDefault(); document.querySelectorAll('.col.over').forEach(x=>x!==col&&x.classList.remove('over')); col.classList.add('over'); }
  if(dr){ e.preventDefault(); dr.classList.add('over'); } });
document.addEventListener('dragleave',e=>{ const dr=e.target.closest('#drop'); if(dr&&!dr.contains(e.relatedTarget)) dr.classList.remove('over'); });
document.addEventListener('drop',e=>{ const col=e.target.closest('[data-col]'); const dr=e.target.closest('#drop'); const cc=e.target.closest('[data-ccol]');
  if(cc&&dragC){ e.preventDefault(); const id=dragC; dragC=null; document.querySelectorAll('.col.over').forEach(x=>x.classList.remove('over')); setClientStage(id,cc.dataset.ccol); }
  if(col&&dragId){ e.preventDefault(); const o=D.orders.find(x=>x.id===dragId); const to=col.dataset.col; dragId=null; document.querySelectorAll('.col.over').forEach(x=>x.classList.remove('over')); if(o&&o.status!==to) write(()=>DB.doc('orders/'+o.id).update({status:to}),`Pedido #${o.num} → ${stLabel(to)}`); }
  if(dr){ e.preventDefault(); dr.classList.remove('over'); if(!e.dataTransfer.files.length) return; if(!S.artOrder){ toast('Escolha o pedido antes de soltar os arquivos',1); return; } uploadTo(S.artOrder,[...e.dataTransfer.files]); } });
document.addEventListener('dragend',()=>{ dragId=null; dragC=null; document.querySelectorAll('.col.over').forEach(x=>x.classList.remove('over')); });

$('#menuBtn').addEventListener('click',()=>{ $('#side').classList.add('open'); $('#scrim').classList.add('show'); });
$('#scrim').addEventListener('click',closeSide);
try{ matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{ if(['overview','reports','cash'].includes(S.view)) render(); }); }catch(_){}
new MutationObserver(()=>{ if(['overview','reports','cash'].includes(S.view)) render(); }).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});

/* ---------- Conexão com o banco ---------- */
render();
(async()=>{
  const use = n => (window.claude && typeof window.claude.use==='function') ? window.claude.use(n).catch(()=>null) : Promise.resolve(null);
  const [db,user,assets,dl,mcp]=await Promise.all([use('db'),use('user'),use('assets'),use('downloads'),use('mcp')]);
  DB=db; ASSETS=assets; DL=dl; L.mcp=mcp; liveInit();
  if(!db){ S.dbOk=false; render(); return; }
  S.dbOk=true;
  try{ const w=user?await user.can('data.write'):null; if(w===false) S.canWrite=false; }catch(_){}
  try{ ME=user&&user.id?await user.id():null; }catch(_){}
  const got={orders:false,leads:false,catalog:false,settings:false,stock:false,clients:false,cash:false,accounts:false};
  const mark=k=>{ got[k]=true; if(!S.ready&&Object.values(got).every(Boolean)) S.ready=true; soon(); };
  const onErr=k=>err=>{ console.warn('db',k,err&&err.code); got[k]=true; if(err&&err.code==='revoked'){ S.canWrite=false; } mark(k); };
  db.collection('orders').onSnapshot(s=>{ D.orders=s.docs.map(d=>({id:d.id,...d.data()})); mark('orders'); },onErr('orders'));
  db.collection('leads').onSnapshot(s=>{ D.leads=s.docs.map(d=>({id:d.id,...d.data()})); mark('leads'); },onErr('leads'));
  db.collection('catalog').onSnapshot(s=>{ D.catalog=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.n).localeCompare(String(b.n))); mark('catalog'); },onErr('catalog'));
  db.collection('clients').onSnapshot(s=>{ D.clients=s.docs.map(d=>({id:d.id,...d.data()})); mark('clients'); },onErr('clients'));
  db.collection('accounts').onSnapshot(s=>{ D.accounts=s.docs.map(d=>({id:d.id,...d.data()})); mark('accounts'); },onErr('accounts'));
  db.collection('cash').onSnapshot(s=>{ D.cash=s.docs.map(d=>({id:d.id,...d.data()})); mark('cash'); },onErr('cash'));
  db.collection('stock').onSnapshot(s=>{ D.stock=s.docs.map(d=>({id:d.id,...d.data()})); mark('stock'); },onErr('stock'));
  db.doc('settings/store').onSnapshot(s=>{ D.settings=s.exists?{...s.data()}:{}; mark('settings'); },onErr('settings'));
})();
