/* =====================================================================
   Jaslok Homecare — admin side of the portal (loaded by admin.html)
   Adds: admin login gate, the "Portal" tab (inbox, inquiries, notices &
   messages, accounts, billing status, portal settings).
   Uses helpers from the board script ($, esc, S, save, renderAll …),
   which are only called after the board has loaded.
   ===================================================================== */
"use strict";

const PP = { sec:'inbox', inboxFilter:'open', inqFilter:'open', billFilter:'running', billSearch:'' };
const PP_KIND = {query:'Query',feedback:'Feedback','report-staff':'Staff report',other:'Message',handover:'Handover note','patient-update':'Patient update',alert:'Alert',notice:'Notice',message:'Message'};

/* ---------- login gate ---------- */
async function adminGate(){
  let me=null, first=false, fail='';
  try{ await Store.refresh(); me=Store.me(); if(!me) first=!(await Store.hasAdmin()); }catch(e){ fail=e.message; }
  return new Promise(resolve=>{
    if(me && me.role==='admin'){ document.body.classList.remove('locked'); return resolve(me); }
    if(me && me.role!=='admin'){ location.replace('portal.html'); return; }
    if(fail){ const g=document.createElement('div'); g.id='gate'; g.innerHTML=`<div class="gate-card"><h1>Cannot open the office board</h1><p>${esc(fail)}</p><button class="btn primary" onclick="location.reload()">Try again</button></div>`; document.body.appendChild(g); return; }
    const g=document.createElement('div'); g.id='gate';
    g.innerHTML=`<form class="gate-card" novalidate>
      <img src="icons/icon-192.png" alt="" width="44" height="44" style="border-radius:10px">
      <h1>${first?'Set up the office account':'Office login'}</h1>
      <p>${first?'This is the one admin account for Jaslok Homecare. It manages the board, staff and patient accounts, inquiries and billing. Choose a strong password and keep it safe.':'Jaslok Homecare office board. Patients and staff: <a href="index.html#login">log in here</a>.'}</p>
      ${first?`<label>Your name<input name="name" autocomplete="name" placeholder="e.g. Office manager"></label>`:`<label>Login ID<input name="id" value="admin" autocomplete="username"></label>`}
      <label>Password${first?' <small>At least 8 characters, letters and a number</small>':''}<input name="pw" type="password" autocomplete="${first?'new-password':'current-password'}"></label>
      ${first?`<label>Password again<input name="pw2" type="password" autocomplete="new-password"></label>`:''}
      <div class="gate-err"></div>
      <button class="btn primary" style="justify-content:center;padding:10px">${first?'Create admin account':'Log in'}</button>
      <a href="index.html" style="font-size:13px;color:var(--muted);text-align:center">← Back to the website</a></form>`;
    document.body.appendChild(g); $('input[name=pw]',g).focus();
    $('form',g).addEventListener('submit',async e=>{ e.preventDefault(); const f=e.target; const er=$('.gate-err',g); er.textContent='';
      const btn=$('button',g); btn.disabled=true;
      try{
        if(first){ if(f.pw.value!==f.pw2.value) throw new Error('The two passwords do not match.'); await Store.createAdmin({name:f.name.value.trim(),password:f.pw.value}); }
        else { const m=await Store.login(f.id.value,f.pw.value); if(m.role!=='admin'){ location.replace('portal.html'); return; } }
        g.remove(); document.body.classList.remove('locked'); resolve(Store.me());
      }catch(err){ er.textContent=err.message; btn.disabled=false; }
    });
  });
}
async function adminLogout(){ try{ await flushCloud(); }catch(e){} await Store.logout(); location.href='index.html'; }

/* ---------- board <-> online database ---------- */
let cloudT=null, cloudBusy=false, cloudDirty=false, cloudReady=false;
function scheduleCloud(){ cloudDirty=true; if(!cloudReady && !Store.me()) return; clearTimeout(cloudT); cloudT=setTimeout(flushCloud,1500); syncStatus('pending'); }
async function flushCloud(){
  clearTimeout(cloudT); if(!cloudDirty) return; if(cloudBusy){ cloudT=setTimeout(flushCloud,800); return; }
  cloudBusy=true; cloudDirty=false; syncStatus('saving');
  try{ await Store.saveBoard(JSON.parse(JSON.stringify(S))); cloudReady=true; syncStatus(cloudDirty?'pending':'ok'); }
  catch(e){ cloudDirty=true; syncStatus('fail',e.message); if(/log in again|Admin only/.test(e.message)){ toast('Session ended. Please log in again.'); setTimeout(()=>location.reload(),1500); } else cloudT=setTimeout(flushCloud,15000); }
  finally{ cloudBusy=false; }
}
function syncStatus(st,msg){ const el=document.getElementById('syncPill'); if(!el) return;
  const d=new Date(); const t=`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  el.textContent = st==='ok'?`✓ Synced ${t}`: st==='saving'?'Saving…': st==='pending'?'Unsaved changes…':'⚠ Not synced';
  el.style.color = st==='fail'?'var(--danger)':''; el.title = st==='fail'?('Board could not be saved online: '+(msg||'')+'. It is kept on this device and will retry.'):'Board sync with the online database'; }
addEventListener('beforeunload',e=>{ if(cloudDirty||cloudBusy){ flushCloud(); e.preventDefault(); e.returnValue=''; } });

/* ---------- board helpers ---------- */
function ppTab(){ return Store.patientTab(S); }
function ensurePortalCols(){
  const t=ppTab(); if(!t) return;
  Object.values(Store.COL).forEach(c=>{ if(!t.columns.includes(c)){ t.columns.push(c); t.order.push(c); if(!t.hidden.includes(c)) t.hidden.push(c); } });
}
function ppCol(t,rx){ return t.columns.find(c=>rx.test(c)); }
function ppBadgeCount(){
  try{ const me=Store.me(); if(!me||me.role!=='admin') return 0;
    return Store.visiblePosts().filter(p=>p.from.role!=='admin' && (Store.isUnread(p) || (p.replies.length && p.replies[p.replies.length-1].from.role!=='admin' && p.status!=='resolved' && !p.readBy.includes(me.id)))).length
      + Store.listInquiries().filter(i=>i.status==='new').length; }catch(e){ return 0; }
}
function ppWhen(t){ const d=new Date(t); return `${pad(d.getDate())}-${MON[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function ppInr(v){ return v===null||v===undefined?'—':'₹'+Math.round(v).toLocaleString('en-IN'); }
async function ppGuard(fn){ try{ return await fn(); }catch(e){ if(/Admin only|log in again/.test(e.message)){ toast('Session ended. Please log in again.'); setTimeout(()=>location.reload(),900); } else toast(e.message); } }
function ppOpenCase(id){ const t=ppTab(); if(!t) return; S.active=t.id; save(); renderAll(); setTimeout(()=>openRecord(id,false),30); }

/* ---------- render ---------- */
function renderPortal(){
  closeDrawer(); renderDock();
  ensurePortalCols();
  const me=Store.me(); if(!me||me.role!=='admin'){ location.reload(); return; }
  const posts=Store.visiblePosts(), inq=Store.listInquiries();
  const nOpen=posts.filter(p=>p.from.role!=='admin'&&p.status!=='resolved').length, nNew=inq.filter(i=>i.status==='new').length;
  const secs=[['inbox','Inbox',nOpen],['inquiries','Inquiries',nNew],['notices','Notices & messages',0],['accounts','Accounts',0],['billing','Billing status',0],['reviews','Reviews',Store.reviews().filter(r=>Date.now()-r.at<7*864e5&&!r.hidden).length],['psettings','Portal settings',0]];
  $('#boardWrap').innerHTML=`<div class="page pp"><div class="page-inner" style="max-width:1100px">
    <div class="pp-head"><div><h1>Portal</h1><p class="lead">Everything coming from the website, patients and staff. Logged in as <b>${esc(me.name)}</b> (admin).</p></div>
      <span class="spacer"></span><a class="btn" href="index.html" target="_blank">View website ↗</a><button class="btn" id="ppLogout">Log out</button></div>
    <div class="pp-nav">${secs.map(([k,l,n])=>`<button data-sec="${k}" class="${PP.sec===k?'on':''}">${l}${n?` <span class="pp-n">${n}</span>`:''}</button>`).join('')}</div>
    <div id="ppBody"></div></div></div>`;
  $('#ppLogout').addEventListener('click',adminLogout);
  $('.pp-nav').addEventListener('click',e=>{ const b=e.target.closest('[data-sec]'); if(b){ PP.sec=b.dataset.sec; renderPortal(); } });
  ({inbox:ppInbox,inquiries:ppInquiries,notices:ppNotices,accounts:ppAccounts,billing:ppBilling,reviews:ppReviews,psettings:ppSettings})[PP.sec]();
}

/* ----- inbox: posts from patients and staff ----- */
function ppPostHTML(p, opts={}){
  const t=ppTab(); const caseOk = p.caseId && t && t.rows.some(r=>r.id===p.caseId);
  const unread=Store.isUnread(p);
  const shareable = ['handover','patient-update','alert'].includes(p.kind) && p.caseId;
  const toLbl = p.to==='everyone'?'Everyone':p.to==='patients'?'All patients':p.to==='staffs'?'All staff':p.to==='admin'?'Office':(Store.getAccount(p.to)||{name:'(deleted account)'}).name;
  return `<div class="pp-post ${unread?'unread':''} ${p.urgent||p.kind==='alert'?'urgent':''} ${p.kind==='notice'?'notice':''}" data-pid="${p.id}">
    <div class="pp-ph"><span class="pp-k k-${p.kind}">${esc(PP_KIND[p.kind]||p.kind)}</span>
      <b>${esc(p.subject||'(no subject)')}</b>
      ${p.status==='resolved'?'<span class="pp-k k-ok">Resolved</span>':''}${p.shared?'<span class="pp-k k-sh">Shared with staff</span>':''}
      <span class="pp-meta">${p.from.role==='admin'?'You → '+esc(toLbl):`${esc(p.from.name)} <i>(${p.from.role})</i>`} · ${ppWhen(p.at)}</span></div>
    ${p.caseLabel?`<div class="pp-case">Case: ${caseOk?`<span class="link" data-case="${p.caseId}">${esc(p.caseLabel)}</span>`:esc(p.caseLabel)}</div>`:''}
    <div class="pp-body">${esc(p.body)}</div>${FileUI.chips(p.files,{del:true})}
    ${p.replies.length?`<div class="pp-replies">${p.replies.map(r=>`<div><small><b>${r.from.role==='admin'?'Office':esc(r.from.name)}</b> · ${ppWhen(r.at)}</small><div>${esc(r.body)}</div></div>`).join('')}</div>`:''}
    <div class="pp-acts">
      ${p.kind!=='notice'?`<form class="pp-reply" data-reply="${p.id}"><span data-clip="${p.id}"></span><input placeholder="Reply${p.from.role==='admin'?'':' to '+esc(p.from.name.split(' ')[0])}…"><button class="btn sm primary">Send</button></form>`:''}
      ${opts.manage!==false && p.from.role!=='admin'?`<button class="btn sm" data-act="${p.status==='resolved'?'reopen':'resolve'}" data-id="${p.id}">${p.status==='resolved'?'Reopen':'Mark resolved'}</button>`:''}
      ${shareable?`<button class="btn sm" data-act="share" data-id="${p.id}" title="Staff assigned to this patient will see it under Shared patient notes">${p.shared?'Stop sharing':'Share with staff on this case'}</button>`:''}
      <button class="btn sm danger" data-act="del" data-id="${p.id}">Delete</button>
    </div></div>`;
}
const PP_CLIPS={};
function ppBindPosts(root){
  $$('[data-clip]',root).forEach(el=>{ const id=el.dataset.clip; PP_CLIPS[id]=PP_CLIPS[id]||[]; FileUI.clip(el,PP_CLIPS[id]); });
  root.addEventListener('click',e=>{ const d=e.target.closest('[data-fdel]'); if(!d) return; e.stopPropagation(); if(!d.classList.contains('armed')){ d.classList.add('armed'); d.textContent='delete?'; return; } ppGuard(async()=>{ await Store.deleteFile(d.dataset.fdel); toast('File deleted'); renderPortal(); }); });
  root.addEventListener('submit',e=>{ const f=e.target.closest('[data-reply]'); if(!f) return; e.preventDefault(); const files=PP_CLIPS[f.dataset.reply]||[]; const b=$('button',f); b.disabled=true; ppGuard(async()=>{ try{ await Store.reply(f.dataset.reply,$('input:not([type=file])',f).value,files); files.length=0; toast('Reply sent'); renderPortal(); } finally{ b.disabled=false; } }); });
  root.addEventListener('click',e=>{
    const c=e.target.closest('[data-case]'); if(c){ ppOpenCase(c.dataset.case); return; }
    const b=e.target.closest('[data-act]'); if(!b) return; const id=b.dataset.id, a=b.dataset.act;
    ppGuard(async()=>{
      if(a==='resolve') await Store.setPost(id,{status:'resolved'});
      if(a==='reopen') await Store.setPost(id,{status:'open'});
      if(a==='share'){ const p=Store.visiblePosts().find(x=>x.id===id); await Store.setPost(id,{shared:!p.shared}); toast(p.shared?'No longer shared':'Shared with staff on this case'); }
      if(a==='del'){ if(!b.classList.contains('armed')){ b.classList.add('armed'); b.textContent='Click again'; return; } await Store.deletePost(id); }
      renderPortal();
    });
  });
  clearTimeout(ppBindPosts.t); const ids=$$('[data-pid]',root).map(x=>x.dataset.pid); ppBindPosts.t=setTimeout(()=>ids.forEach(id=>Store.markRead(id)),2500);
}
function ppInbox(){
  const all=Store.visiblePosts().filter(p=>p.from.role!=='admin');
  const f=PP.inboxFilter; const list=all.filter(p=> f==='all'?true : f==='open'? p.status!=='resolved' : f==='alerts'? (p.kind==='alert'||p.kind==='report-staff') : f==='staff'? p.from.role==='staff' : f==='patients'? p.from.role==='patient' : p.status==='resolved');
  const chips=[['open','Open'],['alerts','Alerts & staff reports'],['staff','From staff'],['patients','From patients'],['resolved','Resolved'],['all','All']];
  const body=$('#ppBody');
  body.innerHTML=`<div class="pp-chips">${chips.map(([k,l])=>`<button class="chip ${f===k?'on':''}" data-f="${k}">${l}</button>`).join('')}</div>
    ${list.length?list.map(p=>ppPostHTML(p)).join(''):`<div class="empty"><h2>Nothing here</h2><p>Queries, feedback, staff reports, alerts and handover notes from patients and staff arrive here.</p></div>`}`;
  $('.pp-chips',body).addEventListener('click',e=>{ const c=e.target.closest('[data-f]'); if(c){ PP.inboxFilter=c.dataset.f; renderPortal(); } });
  ppBindPosts(body);
}

/* ----- inquiries from the public website ----- */
function ppInquiries(){
  const all=Store.listInquiries(); const f=PP.inqFilter;
  const list=all.filter(i=> f==='all'||(f==='open'?['new','contacted'].includes(i.status):i.status===f));
  const st={new:['New','k-alert'],contacted:['Contacted','k-query'],accepted:['Accepted','k-ok'],declined:['Declined','k-other']};
  const body=$('#ppBody');
  body.innerHTML=`<div class="pp-chips">${[['open','Open'],['accepted','Accepted'],['declined','Declined'],['all','All']].map(([k,l])=>`<button class="chip ${f===k?'on':''}" data-f="${k}">${l}</button>`).join('')}</div>
    ${list.length?list.map(i=>`<div class="pp-post ${i.status==='new'?'unread':''}" data-iid="${i.id}">
      <div class="pp-ph"><span class="pp-k ${st[i.status][1]}">${st[i.status][0]}</span><b>${esc(i.name)}</b><span>${esc(i.service||'Service not chosen')}</span><span class="pp-meta">${ppWhen(i.at)}</span></div>
      ${i.requestedName?`<div class="pp-case">⭐ Requested nurse: <b>${esc(i.requestedName)}</b> (from the nurse's profile page)</div>`:''}
      <div class="pp-grid"><span>📞 <a href="tel:${esc(i.phone)}">${esc(i.phone)}</a></span>${i.email?`<span>✉ ${esc(i.email)}</span>`:''}${i.locality?`<span>📍 ${esc(i.locality)}</span>`:''}${i.startDate?`<span>Start: ${esc(fmtDate(i.startDate))}</span>`:''}</div>
      ${i.message?`<div class="pp-body">${esc(i.message)}</div>`:''}${FileUI.chips(i.files)}
      <div class="pp-acts">
        <input class="pp-note" data-note="${i.id}" value="${esc(i.note)}" placeholder="Office note (only you see this)">
        ${cleanPhone(i.phone)?`<a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/${cleanPhone(i.phone)}?text=${encodeURIComponent(`Hello ${i.name}, this is Jaslok Homecare about your inquiry for ${i.service||'homecare'}.`)}">WhatsApp</a>`:''}
        ${i.status==='new'?`<button class="btn sm" data-ia="contacted" data-id="${i.id}">Mark contacted</button>`:''}
        ${!['accepted','declined'].includes(i.status)?`<button class="btn sm primary" data-ia="accept" data-id="${i.id}" title="Creates an Enquiry card in Patient Data">Accept → add to board</button><button class="btn sm" data-ia="declined" data-id="${i.id}">Decline</button>`:''}
        ${i.caseId?`<span class="link" data-case="${i.caseId}">Open card</span>`:''}
        <button class="btn sm danger" data-ia="del" data-id="${i.id}">Delete</button>
      </div></div>`).join(''):`<div class="empty"><h2>No inquiries here</h2><p>Inquiries sent from the website form appear here.</p></div>`}`;
  $('.pp-chips',body).addEventListener('click',e=>{ const c=e.target.closest('[data-f]'); if(c){ PP.inqFilter=c.dataset.f; renderPortal(); } });
  body.addEventListener('change',e=>{ const n=e.target.closest('[data-note]'); if(n) ppGuard(async()=>{ await Store.updateInquiry(n.dataset.note,{note:n.value}); toast('Note saved'); }); });
  body.addEventListener('click',e=>{
    const c=e.target.closest('[data-case]'); if(c){ ppOpenCase(c.dataset.case); return; }
    const b=e.target.closest('[data-ia]'); if(!b) return; const id=b.dataset.id, a=b.dataset.ia;
    ppGuard(async()=>{
      if(a==='del'){ if(!b.classList.contains('armed')){ b.classList.add('armed'); b.textContent='Click again'; return; } await Store.deleteInquiry(id); }
      else if(a==='accept'){ const i=Store.listInquiries().find(x=>x.id===id); const caseId=ppInquiryToCard(i); await Store.updateInquiry(id,{status:'accepted',caseId}); toast('Added to Patient Data as an Enquiry card'); }
      else await Store.updateInquiry(id,{status:a});
      renderPortal();
    });
  });
}
function ppInquiryToCard(i){
  const t=ppTab(); if(!t) throw new Error('No Patient Data tab on the board');
  const R=roles(t); const set=(rx,v)=>{ const c=ppCol(t,rx); if(c&&v) cells[c]=v; };
  const cells={};
  set(/^source$/i,'Website'); if(R.name) cells[R.name]=i.name; if(R.phone[0]) cells[R.phone[0]]=i.phone;
  set(/^service$/i,i.service); set(/locality|address/i,i.locality); if(R.start&&i.startDate) cells[R.start]=i.startDate;
  if(R.status) cells[R.status]='Enquiry';
  if(i.requestedName) cells[Store.COL.staff]=i.requestedName; set(/remark/i,[i.message,i.email?'Email: '+i.email:''].filter(Boolean).join('\n'));
  const r=mkRow(cells); r.log.push(`Created from website inquiry at ${nowStamp()}`); t.rows.unshift(r); save(); return r.id;
}

/* ----- notices & direct messages ----- */
function ppNotices(){
  const accts=Store.listAccounts().filter(a=>a.role!=='admin');
  const sent=Store.visiblePosts().filter(p=>p.from.role==='admin');
  const body=$('#ppBody');
  body.innerHTML=`<div class="panel"><form id="ppCompose" class="pp-form">
      <div class="pp-row"><label>Send as<select name="kind"><option value="notice">Notice (shown on their home page)</option><option value="message">Message (they can reply)</option></select></label>
      <label>To<select name="to"><option value="everyone">Everyone (patients and staff)</option><option value="patients">All patients</option><option value="staffs">All staff</option>
        <optgroup label="Staff">${accts.filter(a=>a.role==='staff').map(a=>`<option value="${a.id}" ${PP.msgTo===a.id?'selected':''}>${esc(a.name)} · ${esc(a.staffId)}</option>`).join('')}</optgroup>
        <optgroup label="Patients">${accts.filter(a=>a.role==='patient').map(a=>`<option value="${a.id}" ${PP.msgTo===a.id?'selected':''}>${esc(a.name)} · ${esc(a.phone)}</option>`).join('')}</optgroup></select></label></div>
      <label>Subject<input name="subject" maxlength="120"></label>
      <label>Text<textarea name="body" rows="4"></textarea></label>
      <div id="ppCompFiles"></div>
      <div><button class="btn primary">Send</button></div></form></div>
    <h2 style="border:none;margin-top:18px">Sent by the office</h2>
    ${sent.length?sent.map(p=>ppPostHTML(p,{manage:false})).join(''):`<p class="lead">Nothing sent yet.</p>`}`;
  const f=$('#ppCompose',body);
  if(PP.msgTo){ f.kind.value='message'; PP.msgTo=null; setTimeout(()=>f.subject.focus(),20); }
  f.to.addEventListener('change',()=>{ if(!['everyone','patients','staffs'].includes(f.to.value)) f.kind.value='message'; });
  const pick=FileUI.picker($('#ppCompFiles'),{max:5,label:'Attach bill, report or document'});
  f.addEventListener('submit',e=>{ e.preventDefault(); const b=$('button.primary',f); b.disabled=true; if(pick.files().length) b.textContent='Uploading…';
    ppGuard(async()=>{ try{ await Store.addPost({kind:f.kind.value,to:f.to.value,subject:f.subject.value,body:f.body.value,files:pick.files()}); toast('Sent'); renderPortal(); } finally{ b.disabled=false; b.textContent='Send'; } }); });
  ppBindPosts(body);
}

/* ----- accounts ----- */
function ppAccounts(){
  const staff=Store.listAccounts('staff'), pats=Store.listAccounts('patient'), me=Store.me();
  const st=Store.staffTab(S); const R=st?roles(st):null; const idCol=st&&ppCol(st,/employee id|staff id/i), phCol=st&&ppCol(st,/contact|phone|mobile/i), rateCol=st&&ppCol(st,/daily rate/i);
  const sheetStaff = st? st.rows.filter(r=>rawStr(r.cells[R.name])).filter(r=>!staff.some(a=>a.name.toLowerCase()===rawStr(r.cells[R.name]).toLowerCase())) : [];
  const t=ppTab();
  const body=$('#ppBody');
  body.innerHTML=`
  <h2 style="border:none;margin-top:0">Staff accounts <small class="lead">(${staff.length})</small></h2>
  <div class="panel"><form id="ppNewStaff" class="pp-form">
    ${sheetStaff.length?`<label>Fill from Staff tab<select id="ppFromSheet"><option value="">— pick a person from the Staff tab —</option>${sheetStaff.map(r=>`<option value="${r.id}">${esc(rawStr(r.cells[R.name]))}${idCol&&r.cells[idCol]?' · '+esc(r.cells[idCol]):''}</option>`).join('')}</select></label>`:''}
    <div class="pp-row"><label>Name<small>Must match the name you type in “Assigned Staff” on a case</small><input name="name"></label><label>Staff ID<small>They log in with this</small><input name="staffId"></label></div>
    <div class="pp-row"><label>Mobile<input name="phone"></label><label>Daily rate (₹)<small>Used to work out their income</small><input name="rate" inputmode="numeric"></label><label>Home area<small>For the map and nearest-nurse suggestions</small><input name="addr" placeholder="e.g. Dadar West"></label><label>Temporary password<small>They must change it on first login</small><input name="pw" value="${ppTempPw()}"></label></div>
    <div><button class="btn primary">Create staff login</button></div></form></div>
  ${staff.length?`<div class="tblwrap"><table class="dt"><thead><tr><th>Name</th><th>Staff ID</th><th>Mobile</th><th>Daily rate</th><th>Home area</th><th>Ongoing duties</th><th>Earned</th><th>Payout pending</th><th>Last login</th><th></th></tr></thead><tbody>
    ${staff.map(a=>{ const cs=Store.casesForAccount(S,a); const earn=a.dailyRate!==null?cs.reduce((s,c)=>s+(c.daysSoFar||0)*a.dailyRate,0):null; const pend=a.dailyRate!==null?cs.filter(c=>c.payout!=='Paid').reduce((s,c)=>s+(c.daysSoFar||0)*a.dailyRate,0):null;
      return `<tr class="${a.active?'':'muted'}"><td><b>${esc(a.name)}</b>${a.active?'':' (off)'}${a.mustChange?' <small style="color:var(--warn)">temp password</small>':''}</td><td>${esc(a.staffId)}</td><td>${esc(a.phone)}</td>
      <td><input class="pp-mini" data-rate="${a.id}" value="${a.dailyRate??''}" inputmode="numeric"></td><td><input class="pp-mini" data-addr="${a.id}" value="${esc(a.address)}" placeholder="area" style="width:130px"></td><td>${cs.filter(c=>c.ongoing).length}</td><td>${ppInr(earn)}</td><td>${ppInr(pend)}</td><td>${a.lastLogin?ppWhen(a.lastLogin):'never'}</td>
      <td class="pp-rowacts"><button class="btn sm primary" data-prof="${a.id}">Profile &amp; QR</button><button class="btn sm" data-msg="${a.id}">Message</button><button class="btn sm" data-reset="${a.id}">Reset password</button><button class="btn sm" data-toggle="${a.id}">${a.active?'Switch off':'Switch on'}</button><button class="btn sm danger" data-del="${a.id}">Delete</button></td></tr>`; }).join('')}
  </tbody></table></div>`:''}

  <h2>Patient accounts <small class="lead">(${pats.length})</small></h2>
  <p class="lead">Patients create these themselves on the website. Cases on the board are linked automatically when the Phone on a card matches their mobile number. Link other cases by hand below.</p>
  ${pats.length?`<div class="tblwrap"><table class="dt"><thead><tr><th>Name</th><th>Mobile</th><th>Email</th><th>Linked cases</th><th>Link another case</th><th>Joined</th><th></th></tr></thead><tbody>
    ${pats.map(a=>{ const cs=Store.casesForAccount(S,a); const linked=new Set(cs.map(c=>c.id));
      return `<tr class="${a.active?'':'muted'}"><td><b>${esc(a.name)}</b>${a.active?'':' (off)'}</td><td>${esc(a.phone)}</td><td>${esc(a.email)}</td>
      <td>${cs.length?cs.map(c=>`<div><span class="link" data-case="${c.id}">${esc(c.name)} · ${esc(c.service||'—')}</span>${(a.caseIds||[]).includes(c.id)?` <span class="icon-btn" style="display:inline" data-unlink="${a.id}|${c.id}" title="Unlink">✕</span>`:''}</div>`).join(''):'<span class="lead">none</span>'}</td>
      <td><select class="pp-mini" data-link="${a.id}" style="max-width:220px"><option value="">— pick a case —</option>${t?t.rows.filter(r=>!linked.has(r.id)).map(r=>{ const v=Store.caseView(t,r); return `<option value="${r.id}">${esc(v.name||'(no name)')} · ${esc(v.service)} · ${esc(fmtDate(v.start))}</option>`; }).join(''):''}</select></td>
      <td>${ppWhen(a.created)}</td>
      <td class="pp-rowacts"><button class="btn sm" data-msg="${a.id}">Message</button><button class="btn sm" data-reset="${a.id}">Reset password</button><button class="btn sm" data-toggle="${a.id}">${a.active?'Switch off':'Switch on'}</button><button class="btn sm danger" data-del="${a.id}">Delete</button></td></tr>`; }).join('')}
  </tbody></table></div>`:`<p class="lead">No patient accounts yet.</p>`}

  <h2>Admin account</h2>
  <div class="panel"><form id="ppAdminPw" class="pp-form"><p class="lead" style="margin:0">Logged in as <b>${esc(me.name)}</b>, login ID <b>admin</b>. There is only one admin account.</p>
    <div class="pp-row"><label>Current password<input type="password" name="old" autocomplete="current-password"></label><label>New password<input type="password" name="n1" autocomplete="new-password"></label><label>New password again<input type="password" name="n2" autocomplete="new-password"></label></div>
    <div><button class="btn">Change admin password</button></div></form></div>`;

  const fs=$('#ppFromSheet',body); if(fs) fs.addEventListener('change',()=>{ const r=st.rows.find(x=>x.id===fs.value); if(!r) return; const f=$('#ppNewStaff'); f.name.value=rawStr(r.cells[R.name]); f.staffId.value=idCol?rawStr(r.cells[idCol]):''; f.phone.value=phCol?rawStr(r.cells[phCol]):''; f.rate.value=rateCol?rawStr(r.cells[rateCol]):''; });
  $('#ppNewStaff').addEventListener('submit',async e=>{ e.preventDefault(); const f=e.target;
    try{ const a=await Store.createStaff({name:f.name.value,staffId:f.staffId.value,phone:f.phone.value,dailyRate:f.rate.value,password:f.pw.value});
      if(f.addr.value.trim()) await Store.updateAccount(a.id,{address:f.addr.value.trim()});
      renderPortal(); ppShowCreds(a.name, a.staffId, f.pw.value, a.phone, a.slug, a.id); }catch(err){ toast(err.message); } });
  $('#ppAdminPw').addEventListener('submit',async e=>{ e.preventDefault(); const f=e.target; if(f.n1.value!==f.n2.value) return toast('The new passwords do not match');
    try{ await Store.changePassword(f.old.value,f.n1.value); f.reset(); toast('Admin password changed'); }catch(err){ toast(err.message); } });
  body.addEventListener('change',e=>{
    const ad=e.target.closest('[data-addr]'); if(ad) ppGuard(async()=>{ await Store.updateAccount(ad.dataset.addr,{address:ad.value.trim()}); toast('Home area saved'); });
    const r=e.target.closest('[data-rate]'); if(r) ppGuard(async()=>{ await Store.updateAccount(r.dataset.rate,{dailyRate:r.value}); toast('Daily rate saved'); });
    const l=e.target.closest('[data-link]'); if(l&&l.value) ppGuard(async()=>{ const a=Store.getAccount(l.dataset.link); await Store.updateAccount(a.id,{caseIds:[...new Set([...(a.caseIds||[]),l.value])]}); toast('Case linked'); renderPortal(); });
  });
  body.addEventListener('click',async e=>{
    const c=e.target.closest('[data-case]'); if(c){ ppOpenCase(c.dataset.case); return; }
    const pf=e.target.closest('[data-prof]'); if(pf){ ppProfileEditor(pf.dataset.prof); return; }
    const m=e.target.closest('[data-msg]'); if(m){ PP.sec='notices'; PP.msgTo=m.dataset.msg; renderPortal(); return; }
    const u=e.target.closest('[data-unlink]'); if(u){ const [aid,cid]=u.dataset.unlink.split('|'); ppGuard(async()=>{ const a=Store.getAccount(aid); await Store.updateAccount(aid,{caseIds:(a.caseIds||[]).filter(x=>x!==cid)}); renderPortal(); }); return; }
    const tg=e.target.closest('[data-toggle]'); if(tg){ ppGuard(async()=>{ const a=Store.getAccount(tg.dataset.toggle); await Store.updateAccount(a.id,{active:!a.active}); renderPortal(); }); return; }
    const d=e.target.closest('[data-del]'); if(d){ if(!d.classList.contains('armed')){ d.classList.add('armed'); d.textContent='Click again'; return; } ppGuard(async()=>{ await Store.deleteAccount(d.dataset.del); toast('Account deleted'); renderPortal(); }); return; }
    const rs=e.target.closest('[data-reset]'); if(rs){ const a=Store.getAccount(rs.dataset.reset); const pw=ppTempPw();
      try{ await Store.resetPassword(a.id,pw); ppShowCreds(a.name, a.role==='staff'?a.staffId:a.phone, pw, a.phone, a.role==='staff'?a.slug:null, a.id); }catch(err){ toast(err.message); } }
  });
}
function ppTempPw(){ const w=['care','home','nurse','well','calm','kind','safe','help']; return w[Math.floor(Math.random()*w.length)]+(1000+Math.floor(Math.random()*9000)); }
function ppShowCreds(name, login, pw, phone, slug, id){
  const site=location.href.replace(/admin\.html.*$/,'index.html');
  const prof=slug?Store.profileUrl(slug):'';
  const msg=`Hello ${name}, your Jaslok@Home login:\nLogin ID: ${login}\nTemporary password: ${pw}\nLog in at ${site} and choose your own password.${prof?`\nYour public profile: ${prof}`:''}`;
  openPop(document.querySelector('.pp-head h1'), `<h4>Login details</h4><div style="font-size:13px;line-height:1.6;white-space:pre-wrap;margin-bottom:8px">${esc(msg)}</div>
    ${prof?`<div style="display:flex;gap:10px;align-items:center;margin-bottom:8px"><div style="border:1px solid var(--line);border-radius:8px;padding:4px;background:#fff">${JHQR.svg(prof,96)}</div><div style="font-size:12.5px">Public profile &amp; QR code created.<br><button class="btn sm" style="margin-top:6px" id="ppEditProf">Add photo &amp; profile details →</button></div></div>`:''}
    <div class="row"><button class="btn sm" id="ppCopy">Copy</button>${cleanPhone(phone)?`<a class="btn sm primary" target="_blank" rel="noopener" href="https://wa.me/${cleanPhone(phone)}?text=${encodeURIComponent(msg)}">Send on WhatsApp</a>`:''}</div>
    <div style="font-size:12px;color:var(--muted);margin-top:8px">This password is shown only now.</div>`, p=>{ $('#ppCopy',p).addEventListener('click',()=>{ navigator.clipboard&&navigator.clipboard.writeText(msg); toast('Copied'); });
      const ep=$('#ppEditProf',p); if(ep) ep.addEventListener('click',()=>{ closePop(); ppProfileEditor(id); }); });
}

/* ----- billing status ----- */
function ppBilling(){
  const t=ppTab(); const body=$('#ppBody');
  if(!t){ body.innerHTML='<div class="empty"><h2>No Patient Data tab</h2></div>'; return; }
  const C=Store.COL; const staffNames=Store.listAccounts('staff').map(a=>a.name);
  const q=PP.billSearch.trim().toLowerCase();
  let rows=t.rows.map(r=>({r,v:Store.caseView(t,r,S.settings.daysInclusive)}));
  const f=PP.billFilter;
  rows=rows.filter(({v})=> f==='all'?true : f==='running'? (v.ongoing||v.upcoming) : f==='unpaid'? (!['Paid','Waived'].includes(v.pay) && !v.enquiry && v.total) : f==='unassigned'? ((v.ongoing||v.upcoming)&&!v.staff) : f==='payout'? (v.staff && v.payout!=='Paid' && !v.enquiry) : true);
  if(q) rows=rows.filter(({v})=>[v.name,v.service,v.staff,v.phone].join(' ').toLowerCase().includes(q));
  const due=rows.reduce((s,{v})=>s+(['Paid','Waived'].includes(v.pay)?0:(v.balance||0)),0);
  body.innerHTML=`<div class="pp-chips">${[['running','Running & upcoming'],['unpaid','Unpaid'],['unassigned','No staff assigned'],['payout','Staff payout pending'],['all','All cases']].map(([k,l])=>`<button class="chip ${f===k?'on':''}" data-f="${k}">${l}</button>`).join('')}
    <input class="search" id="ppBillQ" placeholder="Search name, service, staff" value="${esc(PP.billSearch)}"><span class="lead" style="margin:0 0 0 auto">${rows.length} cases · balance ${ppInr(due)}</span></div>
    <p class="lead">Changes here are saved straight to the card on the board and show up at once for the patient and staff member.</p>
    <datalist id="ppStaffNames">${staffNames.map(n=>`<option>${esc(n)}</option>`).join('')}</datalist>
    ${rows.length?`<div class="tblwrap"><table class="dt pp-bill"><thead><tr><th>Patient</th><th>Service</th><th>Period</th><th>Days</th><th>Amount</th><th>${C.staff}</th><th>${C.pay}</th><th>${C.paid}</th><th>Balance</th><th>${C.payout}</th></tr></thead><tbody>
    ${rows.slice(0,400).map(({r,v})=>`<tr data-rid="${r.id}"><td><span class="link" data-case="${r.id}">${esc(v.name||'(no name)')}</span>${v.enquiry?' <small class="lead">enquiry</small>':''}</td><td>${esc(v.service)}</td><td style="white-space:nowrap">${esc(fmtDate(v.start))} – ${esc(fmtDate(v.end))}</td><td>${v.days??''}</td><td>${ppInr(v.total)}</td>
      <td style="white-space:nowrap"><input class="pp-mini" list="ppStaffNames" data-c="${esc(C.staff)}" value="${esc(v.staff)}" style="width:130px"> <button class="btn sm" data-suggest="${r.id}" title="Suggest the nearest nurse">📍</button></td>
      <td><select class="pp-mini pay-${esc(v.pay.replace(/\s/g,''))}" data-c="${esc(C.pay)}">${Store.PAY_STATUSES.map(s=>`<option ${s===v.pay?'selected':''}>${s}</option>`).join('')}</select></td>
      <td><input class="pp-mini" data-c="${esc(C.paid)}" value="${v.paid??''}" inputmode="numeric" style="width:90px"></td>
      <td>${['Paid','Waived'].includes(v.pay)?'—':ppInr(v.balance)}</td>
      <td><select class="pp-mini" data-c="${esc(C.payout)}" ${v.staff?'':'disabled'}>${Store.PAYOUT_STATUSES.map(s=>`<option ${s===v.payout?'selected':''}>${s}</option>`).join('')}</select></td></tr>`).join('')}
    </tbody></table></div>${rows.length>400?'<p class="lead">Showing the first 400. Search to narrow down.</p>':''}`:`<div class="empty"><h2>No cases match</h2></div>`}`;
  $('.pp-chips',body).addEventListener('click',e=>{ const c=e.target.closest('[data-f]'); if(c){ PP.billFilter=c.dataset.f; renderPortal(); } });
  const qi=$('#ppBillQ'); qi.addEventListener('input',()=>{ PP.billSearch=qi.value; clearTimeout(ppBilling.t); ppBilling.t=setTimeout(()=>{ renderPortal(); const n=$('#ppBillQ'); n.focus(); n.selectionStart=n.selectionEnd=n.value.length; },300); });
  body.addEventListener('click',e=>{ const c=e.target.closest('[data-case]'); if(c) ppOpenCase(c.dataset.case); const sg=e.target.closest('[data-suggest]'); if(sg) ppSuggestPop(sg, sg.dataset.suggest, ()=>renderPortal()); });
  body.addEventListener('change',e=>{
    const el=e.target.closest('[data-c]'); if(!el) return; const tr=el.closest('[data-rid]'); const row=rowById(t,tr.dataset.rid); const col=el.dataset.c;
    let val=el.value.trim(); if(col===C.paid) val= val===''?'':(num(val)??'');
    row.cells[col]=val;
    if(col===C.pay && val==='Paid' && (row.cells[C.paid]===''||row.cells[C.paid]==null)){ const v=Store.caseView(t,row); if(v.total!==null) row.cells[C.paid]=v.total; }
    if(col===C.paid && val!==''){ const v=Store.caseView(t,row); if(v.total!==null) row.cells[C.pay]= val>=v.total?'Paid': val>0?'Part paid':row.cells[C.pay]||'Unpaid'; }
    row.modified=Date.now(); row.log.push(`${col}: ${val===''?'cleared':val} at ${nowStamp()} (Portal)`); save(); toast('Saved');
    const rid=tr.dataset.rid; setTimeout(()=>{ renderPortal(); const n=document.querySelector(`.pp-bill [data-rid="${rid}"] [data-c="${CSS.escape(col)}"]`); n&&n.focus(); },0);
  });
}

/* ----- portal settings ----- */
function ppSettings(){
  const s=Store.settings(); const body=$('#ppBody');
  body.innerHTML=`<div class="panel">
    <div class="field"><div class="lbl">Staff can see the patient's bill<small>Shows the patient's total and payment status in the staff member's Billing &amp; income page. Turn off to keep your margin private.</small></div><select id="ppS1"><option value="1" ${s.staffSeesPatientBilling?'selected':''}>Yes</option><option value="0" ${!s.staffSeesPatientBilling?'selected':''}>No, only their own income</option></select></div>
    <div class="field"><div class="lbl">City<small>Added to localities for the map and for nurses' directions.</small></div><input id="ppCity" value="${esc(s.city||'Mumbai')}" style="border:1px solid var(--line2);border-radius:8px;padding:6px 9px"></div>
    <div class="field"><div class="lbl">Staff can see the family's phone number<small>On their duty cards.</small></div><select id="ppS2"><option value="1" ${s.staffSeesPatientPhone?'selected':''}>Yes</option><option value="0" ${!s.staffSeesPatientPhone?'selected':''}>No</option></select></div>
  </div>
  <h2>Where the portal data lives</h2>
  <div class="infobox">Accounts, messages, inquiries and the board are stored in your Supabase database, so patients and staff see them on their own phones. Patients only receive their own cases; staff only the cases assigned to them. Internal columns (remarks, staff payout, costs, margin) are never sent to patients. <span id="ppSync"></span></div>
  <div class="panel"><div class="field"><div class="lbl">Portal backup<small>Accounts (without passwords), messages and inquiries as a file. Supabase also keeps daily backups on paid plans; the board has its own backup in Settings.</small></div>
    <div class="row"><button class="btn" id="ppBk">Download portal backup</button></div></div></div>`;
  $('#ppS1').addEventListener('change',e=>ppGuard(async()=>{ await Store.setSettings({staffSeesPatientBilling:e.target.value==='1'}); toast('Saved'); }));
  $('#ppCity').addEventListener('change',e=>ppGuard(async()=>{ await Store.setSettings({city:e.target.value.trim()||'Mumbai'}); toast('Saved'); }));
  $('#ppS2').addEventListener('change',e=>ppGuard(async()=>{ await Store.setSettings({staffSeesPatientPhone:e.target.value==='1'}); toast('Saved'); }));
  $('#ppBk').addEventListener('click',()=>ppGuard(async()=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(Store.exportAll())],{type:'application/json'})); a.download=`jaslok-homecare-portal-${isoToday()}.json`; a.click(); }));
}

/* ---------- live updates from other tabs (patients/staff on this browser) ---------- */
Store.onChange(()=>{ clearTimeout(Store._t); Store._t=setTimeout(()=>{ if(typeof S==='undefined'||!S) return;
  if(syncStaffLedger()){ save(); const st=Store.staffTab(S); if(st && S.active===st.id && !V.drawer && !document.getElementById('ppModal')) renderAll(); }
  renderTabs();
  const typing=document.activeElement&&document.activeElement.closest('#boardWrap input,#boardWrap textarea,#boardWrap select');
  if(S.active==='__portal' && !typing && $('#pop').classList.contains('hidden')) renderPortal(); },200); });

/* =====================================================================
   MAP — patients and nurses on a map, nearest-nurse suggestions
   ===================================================================== */
const MP = { filter:'running', showStaff:true, map:null, layer:null, busy:false };
const MAP_COLORS=['#2563EB','#9333EA','#0D9488','#EA580C','#DB2777','#65A30D','#0891B2','#7C3AED','#CA8A04','#4F46E5','#BE185D','#047857'];
function ppCity(){ return (Store.settings().city||'Mumbai').trim(); }
function ppGeoQuery(place){ const p=String(place||'').trim(); if(!p) return ''; const c=ppCity(); return p.toLowerCase().includes(c.toLowerCase())? p : `${p}, ${c}`; }
function ppGeo(q){ return q && S.geoCache ? S.geoCache[q.trim().toLowerCase()] || null : null; }
function ppPlaceOf(t,row){ const c=ppCol(t,/address/i)||ppCol(t,/locality|area/i); return c? rawStr(row.cells[c]) : ''; }
function ppStaffList(){
  const t=ppTab(); const all=Store.listAccounts('staff').filter(a=>a.active);
  return all.map((a,i)=>{ const cs=Store.casesForAccount(S,a); const q=ppGeoQuery(a.address);
    return { a, color:MAP_COLORS[i%MAP_COLORS.length], duties:cs.filter(c=>c.ongoing).length, upcoming:cs.filter(c=>c.upcoming).length, q, geo:ppGeo(q) }; });
}
function ppKm(a,b){ const R=6371, r=x=>x*Math.PI/180; const dLa=r(b.lat-a.lat), dLo=r(b.lng-a.lng); const h=Math.sin(dLa/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLo/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }
function ppNearest(geo, n=5){
  return ppStaffList().filter(s=>s.geo).map(s=>({...s, km:ppKm(geo,s.geo)})).sort((x,y)=> (x.duties>0)-(y.duties>0) || x.km-y.km).slice(0,n);
}
function ppAssign(rowId, name, add=false){
  const t=ppTab(); const row=rowById(t,rowId); if(!row) return; const C=Store.COL;
  const cur=Store.staffKeysOf(row.cells[C.staff]); const curRaw=rawStr(row.cells[C.staff]).trim();
  if(add && curRaw && !cur.includes(name.toLowerCase())) row.cells[C.staff]=curRaw+', '+name; else row.cells[C.staff]=name;
  row.modified=Date.now(); row.log.push(`${C.staff}: ${row.cells[C.staff]} at ${nowStamp()} (Map)`); save(); toast(`Assigned to ${name}`);
}
function ppSuggestHTML(rowId, geo){
  const list=geo? ppNearest(geo) : [];
  const noHome=ppStaffList().filter(s=>!s.geo).length;
  if(!geo) return `<div class="mp-sug muted">This patient has no location yet. Add the Locality on the card, then press “Find locations” on the Map tab.</div>`;
  if(!list.length) return `<div class="mp-sug muted">No nurse has a home area on the map yet. Add it in Portal → Accounts, then press “Find locations”.</div>`;
  return `<div class="mp-sug"><div class="mp-sug-h">Nearest nurses <small>(free first)</small></div>${list.map(s=>`<div class="mp-sug-r"><span class="mp-dot" style="background:${s.color}"></span>
    <span class="mp-sug-n"><b>${esc(s.a.name)}</b><small>${s.km<1?'<1':s.km.toFixed(1)} km · ${s.duties?`${s.duties} ongoing dut${s.duties>1?'ies':'y'}`:'<span style="color:var(--ok,#16794C);font-weight:700">free</span>'}${s.upcoming?` · ${s.upcoming} upcoming`:''}</small></span>
    <button class="btn sm primary" data-massign="${rowId}" data-name="${esc(s.a.name)}">Assign</button><button class="btn sm" data-massign="${rowId}" data-name="${esc(s.a.name)}" data-add="1" title="Keep the current nurse and add this one">+ Add</button></div>`).join('')}
    ${noHome?`<div class="muted" style="font-size:11.5px;margin-top:4px">${noHome} nurse${noHome>1?'s':''} without a home area not shown.</div>`:''}</div>`;
}
// popover from the Billing status table
async function ppSuggestPop(anchor, rowId, after){
  const t=ppTab(); const row=rowById(t,rowId); const q=ppGeoQuery(ppPlaceOf(t,row));
  openPop(anchor,`<h4>Suggest a nurse</h4><div id="sgBody" style="min-width:260px"><div class="muted" style="font-size:13px">Finding locations…</div></div>`);
  let geo=ppGeo(q);
  try{ if(!geo && q) geo=await geocode(q); for(const s of ppStaffList()) if(!s.geo && s.q){ try{ await geocode(s.q); }catch(e){} } }catch(e){}
  const b=document.getElementById('sgBody'); if(!b) return;
  b.innerHTML=`<div style="font-size:12.5px;color:var(--muted)">${esc(rawStr(row.cells[roles(t).name]))} · ${esc(q||'no locality')}</div>${ppSuggestHTML(rowId, geo)}`;
  b.addEventListener('click',e=>{ const a=e.target.closest('[data-massign]'); if(!a) return; ppAssign(a.dataset.massign,a.dataset.name,!!a.dataset.add); closePop(); after&&after(); });
}

function loadLeaflet(){
  if(window.L) return Promise.resolve();
  return new Promise((res,rej)=>{
    const l=document.createElement('link'); l.rel='stylesheet'; l.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(l);
    const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    s.onload=()=>res(); s.onerror=()=>rej(new Error('The map could not load. Check the internet connection.')); document.head.appendChild(s);
  });
}
function ppMapRows(){
  const t=ppTab(); if(!t) return [];
  return t.rows.map(r=>({r, v:Store.caseView(t,r,S.settings.daysInclusive), q:ppGeoQuery(ppPlaceOf(t,r))}))
    .filter(({v})=> MP.filter==='all' ? !v.enquiry : MP.filter==='unassigned' ? (v.ongoing||v.upcoming)&&!v.staff : (v.ongoing||v.upcoming));
}
async function renderMap(){
  closeDrawer(); renderDock();
  const rows=ppMapRows(), staff=ppStaffList();
  const missing=[...new Set([...rows.map(x=>x.q), ...staff.map(s=>s.q)].filter(q=>q && !ppGeo(q)))];
  const noPlace=rows.filter(x=>!x.q);
  const colorOf=name=>{ const k=Store.staffKeysOf(name)[0]; const s=staff.find(x=>x.a.name.toLowerCase()===k || (x.a.staffId||'').toLowerCase()===k); return s? s.color : (k? '#8A8F8C' : '#D92D20'); };
  $('#boardWrap').innerHTML=`<div class="mp">
    <aside class="mp-side">
      <h1>Map</h1>
      <div class="mp-row"><label>City <input id="mpCity" value="${esc(ppCity())}"></label></div>
      <div class="pp-chips">${[['running','Running & upcoming'],['unassigned','No nurse yet'],['all','All cases']].map(([k,l])=>`<button class="chip ${MP.filter===k?'on':''}" data-mf="${k}">${l}</button>`).join('')}</div>
      <label class="mp-chk"><input type="checkbox" id="mpStaff" ${MP.showStaff?'checked':''}> Show nurses’ homes</label>
      <div class="mp-stat"><b>${rows.length}</b> patients · <b>${rows.filter(x=>ppGeo(x.q)).length}</b> on the map</div>
      ${missing.length?`<button class="btn primary" id="mpFind" style="width:100%;justify-content:center">📍 Find locations (${missing.length})</button><div class="muted" id="mpProg" style="font-size:12px;margin-top:4px">Looks up each locality once with Ola Maps; saved for next time.</div>`:''}
      <div class="mp-h">Nurses</div>
      <div class="mp-legend">${staff.length?staff.map(s=>`<div><span class="mp-dot" style="background:${s.color}"></span><b>${esc(s.a.name)}</b><small>${s.duties} ongoing${s.geo?'':' · no home area'}</small></div>`).join(''):'<div class="muted">No staff accounts yet.</div>'}
        <div><span class="mp-dot" style="background:#D92D20"></span><b>No nurse assigned</b></div><div><span class="mp-dot" style="background:#8A8F8C"></span><b>Name not matching an account</b></div></div>
      ${noPlace.length?`<div class="mp-h">No locality on card (${noPlace.length})</div><div class="mp-miss">${noPlace.slice(0,30).map(x=>`<span class="link" data-case="${x.r.id}">${esc(x.v.name||'(no name)')}</span>`).join('')}</div>`:''}
    </aside>
    <div id="mapEl"><div class="muted" style="padding:20px">Loading map…</div></div></div>`;
  const side=$('.mp-side');
  side.addEventListener('click',e=>{ const f=e.target.closest('[data-mf]'); if(f){ MP.filter=f.dataset.mf; renderMap(); } const c=e.target.closest('[data-case]'); if(c) ppOpenCase(c.dataset.case); });
  $('#mpStaff').addEventListener('change',e=>{ MP.showStaff=e.target.checked; renderMap(); });
  $('#mpCity').addEventListener('change',e=>ppGuard(async()=>{ await Store.setSettings({city:e.target.value.trim()||'Mumbai'}); renderMap(); }));
  const fb=$('#mpFind'); if(fb) fb.addEventListener('click',()=>ppFindAll(missing));
  try{ await loadLeaflet(); }catch(e){ $('#mapEl').innerHTML=`<div class="empty" style="margin:20px"><h2>Map unavailable</h2><p>${esc(e.message)}</p></div>`; return; }
  if(S.active!=='__map') return;
  const el=$('#mapEl'); el.innerHTML='';
  const map=L.map(el,{zoomControl:true}); MP.map=map;
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
  const pts=[]; const seen={};
  rows.forEach(({r,v,q})=>{ const g=ppGeo(q); if(!g) return; const k=g.lat.toFixed(4)+','+g.lng.toFixed(4); const n=seen[k]=(seen[k]||0)+1;
    const ll=[g.lat+(n-1)*0.0006*Math.cos(n), g.lng+(n-1)*0.0006*Math.sin(n)]; pts.push(ll);
    const m=L.circleMarker(ll,{radius:9,color:'#fff',weight:2.5,fillColor:colorOf(v.staff),fillOpacity:.95}).addTo(map);
    m.bindPopup(()=>`<div class="mp-pop"><b style="font-size:14px">${esc(v.name||'(no name)')}</b><div class="muted">${esc(v.service)} · ${esc(fmtDate(v.start))} – ${esc(fmtDate(v.end))}</div>
      <div style="margin:4px 0">${esc(ppPlaceOf(ppTab(),r))}</div><div>Nurse: <b>${esc(v.staff||'not assigned')}</b></div>
      ${ppSuggestHTML(r.id,g)}<div style="margin-top:8px"><button class="btn sm" data-mopen="${r.id}">Open card</button></div></div>`,{maxWidth:340,minWidth:260});
  });
  if(MP.showStaff) staff.forEach(s=>{ if(!s.geo) return; pts.push([s.geo.lat,s.geo.lng]);
    L.marker([s.geo.lat,s.geo.lng],{icon:L.divIcon({className:'',html:`<div class="mp-home" style="background:${s.color}">${esc(s.a.name.split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase())}</div>`,iconSize:[26,26],iconAnchor:[13,13]})})
      .addTo(map).bindPopup(`<b>${esc(s.a.name)}</b><div class="muted">Home: ${esc(s.a.address)}</div><div>${s.duties} ongoing, ${s.upcoming} upcoming</div>`); });
  if(pts.length) map.fitBounds(pts,{padding:[40,40],maxZoom:14}); else map.setView([19.07,72.88],11);
  el.addEventListener('click',e=>{
    const o=e.target.closest('[data-mopen]'); if(o){ ppOpenCase(o.dataset.mopen); return; }
    const a=e.target.closest('[data-massign]'); if(a){ ppAssign(a.dataset.massign,a.dataset.name,!!a.dataset.add); map.closePopup(); renderMap(); }
  });
}
async function ppFindAll(list){
  if(MP.busy) return; MP.busy=true; const b=$('#mpFind'), pr=$('#mpProg'); if(b) b.disabled=true; let ok=0, bad=0;
  for(let i=0;i<list.length;i++){
    if(pr) pr.textContent=`Looking up ${i+1} of ${list.length}: ${list[i]}`;
    try{ const r=await geocode(list[i]); ok++; if(!r.cached && /OpenStreetMap/.test(r.src)) await new Promise(z=>setTimeout(z,1100)); }
    catch(e){ bad++; }
  }
  MP.busy=false; toast(`Found ${ok} location${ok===1?'':'s'}${bad?`, ${bad} not found (check the spelling of the locality)`:''}`);
  if(S.active==='__map') renderMap();
}

/* =====================================================================
   DOCUMENTS on a case card (board drawer)
   ===================================================================== */
const VIS_LBL={office:'Office only',patient:'Patient',staff:'Staff',both:'Patient + staff'};
function ppRecordDocs(d, t, row){
  if(!d || t!==ppTab()) return;
  const host=document.createElement('div'); host.className='pp-docs';
  const logH=$$('.section-h',d).find(x=>/Activity log/.test(x.textContent)); if(!logH) return;
  logH.parentNode.insertBefore(host,logH);
  const paint=()=>{ const files=Store.caseFiles(row.id);
    host.innerHTML=`<div class="section-h">Documents</div>
      ${files.length?files.map(f=>`<div class="pp-doc"><span class="jh-chip jh-file" data-file="${f.id}">${/pdf/.test(f.mime)?'📄':/^image/.test(f.mime)?'🖼️':'📎'} ${esc(f.name)} <small>${FileUI.kb(f.size)}</small></span>
        <select data-fvis="${f.id}" title="Who can see this">${Object.entries(VIS_LBL).map(([k,l])=>`<option value="${k}" ${f.visibleTo===k?'selected':''}>${l}</option>`).join('')}</select>
        <button class="icon-btn" data-fdel="${f.id}" title="Delete">✕</button></div>`).join(''):'<div class="muted" style="font-size:12.5px">No documents yet: bills, reports, prescriptions, consent forms.</div>'}
      <div class="pp-docup"><div id="docPick"></div><div class="row"><label style="font-size:12.5px">Who can see it <select id="docVis">${Object.entries(VIS_LBL).map(([k,l])=>`<option value="${k}" ${k==='patient'?'selected':''}>${l}</option>`).join('')}</select></label>
        <button class="btn sm primary" id="docUp">Upload</button></div></div>`;
    const pick=FileUI.picker($('#docPick',host),{max:5,label:'Choose files'});
    $('#docUp',host).addEventListener('click',()=>ppGuard(async()=>{ const fs=pick.files(); if(!fs.length) return toast('Choose a file first');
      const b=$('#docUp',host); b.disabled=true; b.textContent='Uploading…';
      try{ for(const f of fs) await Store.uploadFile('case',row.id,f,$('#docVis',host).value); await Store.refresh(); toast('Uploaded'); row.log.push(`Documents: added ${fs.map(f=>f.name).join(', ')} at ${nowStamp()}`); save(); }
      finally{ paint(); } }));
  };
  host.addEventListener('change',e=>{ const v=e.target.closest('[data-fvis]'); if(v) ppGuard(async()=>{ await Store.setFileVisibility(v.dataset.fvis,v.value); toast('Saved'); }); });
  host.addEventListener('click',e=>{ const x=e.target.closest('[data-fdel]'); if(!x) return; e.stopPropagation(); if(!x.classList.contains('armed')){ x.classList.add('armed'); x.textContent='?'; x.title='Click again to delete'; return; }
    ppGuard(async()=>{ await Store.deleteFile(x.dataset.fdel); toast('Deleted'); paint(); }); });
  paint();
}

/* =====================================================================
   NURSE PROFILES — editor, QR, printable business card
   ===================================================================== */
const DIETS=['','Vegetarian','Non-vegetarian','Eggetarian','Jain','Vegan'];
async function ppPhotoSrc(a){
  if(!a||!a.photoId) return null;
  try{ const f=await Store.rpc('get_file',{p_token:localStorage.getItem('jh-token'), p_id:a.photoId}); return `data:${f.mime};base64,${f.b64}`; }catch(e){ return null; }
}
function ppCloseModal(){ const m=document.getElementById('ppModal'); if(m) m.remove(); }
async function ppProfileEditor(id){
  const a=Store.getAccount(id); if(!a) return toast('Account not found');
  const pr=a.profile||{}; const url=a.slug?Store.profileUrl(a.slug):'';
  const cs=Store.casesForAccount(S,a);
  ppCloseModal();
  const m=document.createElement('div'); m.id='ppModal'; m.className='pp-modal-bg';
  m.innerHTML=`<div class="pp-modal" role="dialog" aria-label="Nurse profile">
    <button class="icon-btn pp-x" data-x title="Close">✕</button>
    <h2 style="margin:0 0 2px;border:none">${esc(a.name)} <small class="lead">· ${esc(a.staffId)}</small></h2>
    <p class="lead" style="margin:0 0 14px">Public profile shown when someone scans the QR code. Ratings and comments come from patients; manage them under Portal → Reviews.</p>
    <div class="pp-prof">
      <div class="pp-prof-l">
        <div class="pp-photo" id="ppPhoto"><span>${esc(a.name.split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase())}</span></div>
        <label class="btn sm" style="justify-content:center"><input type="file" accept="image/*" hidden id="ppPhotoIn">📷 ${a.photoId?'Change photo':'Add photo'}</label>
        <div class="pp-qr">${url?JHQR.svg(url,170):''}</div>
        ${url?`<div class="pp-link">${esc(url)}</div>
        <div class="pp-qr-acts"><button class="btn sm" id="ppCopyLink">Copy link</button><a class="btn sm" href="${esc(url)}" target="_blank">Open ↗</a><button class="btn sm" id="ppQrPng">⤓ QR image</button><button class="btn sm primary" id="ppPrint">🖨 Print card</button></div>`:''}
      </div>
      <form class="pp-form pp-prof-r" id="ppProfF">
        <div class="pp-row"><label>Title<input name="title" value="${esc(pr.title||'')}" placeholder="e.g. Senior ICU Nurse"></label><label>With Jaslok@Home since<input type="date" name="workingSince" value="${esc(pr.workingSince||'')}"></label></div>
        <label>About<small>A few friendly lines patients will read</small><textarea name="bio" rows="3">${esc(pr.bio||'')}</textarea></label>
        <label>Specialised skills<small>Separate with commas, e.g. Tracheostomy care, Ventilator, Diabetic care, Wound dressing</small><input name="skills" value="${esc((pr.skills||[]).join(', '))}"></label>
        <div class="pp-row"><label>Languages<small>Comma separated</small><input name="languages" value="${esc((pr.languages||[]).join(', '))}" placeholder="Hindi, Marathi, English"></label>
          <label>Food preference<select name="diet">${DIETS.map(d=>`<option value="${d}" ${d===(pr.diet||'')?'selected':''}>${d||'— not shown —'}</option>`).join('')}</select></label></div>
        <label>Qualifications<input name="qualification" value="${esc(pr.qualification||'')}" placeholder="e.g. GNM, B.Sc Nursing, BLS certified"></label>
        <div class="pp-row"><label>Patients made well<small>Blank = count cases with Status “Recovered”</small><input name="madeWell" inputmode="numeric" value="${esc(pr.madeWell??'')}"></label>
          <label>Patients sent home<small>Blank = count cases with Status “Sent home” / “Discharged”</small><input name="sentHome" inputmode="numeric" value="${esc(pr.sentHome??'')}"></label></div>
        <label style="flex-direction:row;align-items:center;gap:8px;min-width:0;flex:none"><input type="checkbox" name="public" ${pr.public===false?'':'checked'}> Profile visible to the public</label>
        <div class="pp-mini-stats">${cs.length} duties so far · ${cs.filter(c=>c.ongoing).length} ongoing · ${Store.reviews().filter(r=>r.staffId===a.id&&!r.hidden).length} visible reviews</div>
        <div class="row"><button class="btn primary">Save profile</button><button type="button" class="btn" data-x>Close</button></div>
      </form>
    </div></div>`;
  document.body.appendChild(m);
  ppPhotoSrc(a).then(src=>{ if(src&&$('#ppPhoto')) $('#ppPhoto').innerHTML=`<img src="${src}" alt="">`; });
  m.addEventListener('click',e=>{ if(e.target===m||e.target.closest('[data-x]')) ppCloseModal(); });
  $('#ppPhotoIn').addEventListener('change',e=>ppGuard(async()=>{ const f=e.target.files[0]; if(!f) return; toast('Uploading photo…'); await Store.uploadProfilePhoto(a.id,f); toast('Photo saved'); ppProfileEditor(a.id); }));
  const f=$('#ppProfF');
  f.addEventListener('submit',e=>{ e.preventDefault(); const list=v=>v.split(',').map(x=>x.trim()).filter(Boolean); const n=v=>v.trim()===''?'':String(Math.max(0,parseInt(v,10)||0));
    ppGuard(async()=>{ await Store.updateProfile(a.id,{ title:f.title.value.trim(), workingSince:f.workingSince.value, bio:f.bio.value.trim(), skills:list(f.skills.value), languages:list(f.languages.value),
      diet:f.diet.value, qualification:f.qualification.value.trim(), madeWell:n(f.madeWell.value), sentHome:n(f.sentHome.value), public:f.public.checked });
      if(syncStaffLedger()) save(); toast('Profile saved'); }); });
  if(url){
    $('#ppCopyLink').addEventListener('click',()=>{ navigator.clipboard&&navigator.clipboard.writeText(url); toast('Link copied'); });
    $('#ppQrPng').addEventListener('click',async()=>{ const d=await JHQR.png(url,1024); const x=document.createElement('a'); x.href=d; x.download=`${a.name.replace(/\s+/g,'-')}-QR.png`; x.click(); });
    $('#ppPrint').addEventListener('click',async()=>{ const fresh=Store.getAccount(a.id)||a; ppPrintCard(fresh, url, await ppPhotoSrc(fresh)); });
  }
}
function ppPrintCard(a, url, photo){
  const pr=a.profile||{}; const w=window.open('','_blank'); if(!w) return toast('Allow pop-ups to print the card');
  const logo=`<svg viewBox="0 0 48 48" width="30" height="30"><rect width="48" height="48" rx="11" fill="#1F6F6B"/><path d="M10 24 24 12l14 12" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 22v13h18V22" stroke="#fff" stroke-width="2.6" fill="none" stroke-linejoin="round"/><path d="M24 33s-5-3-5-6.4a2.6 2.6 0 0 1 5-1 2.6 2.6 0 0 1 5 1C29 30 24 33 24 33z" fill="#fff"/></svg>`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(a.name)} · card</title><style>
    @page{size:auto;margin:12mm} body{font-family:Poppins,"Segoe UI",Arial,sans-serif;color:#16302E;margin:0}
    .sheet{display:flex;gap:10mm;flex-wrap:wrap}
    .card{width:85mm;height:55mm;border:0.3mm solid #C6D9D6;border-radius:3mm;box-sizing:border-box;position:relative;overflow:hidden;break-inside:avoid}
    .front{padding:5mm 6mm;background:linear-gradient(135deg,#fff 60%,#E2F1EF)} .front .b{display:flex;align-items:center;gap:2.5mm;font-family:Georgia,serif;font-weight:700;font-size:4.2mm}
    .front .b small{display:block;font-family:Poppins,Arial;font-weight:400;font-size:2.3mm;color:#687D7A}
    .front .n{margin-top:6mm;display:flex;gap:3.5mm;align-items:center}.front img,.front .ini{width:15mm;height:15mm;border-radius:50%;object-fit:cover;border:0.6mm solid #1F6F6B;background:#E2F1EF;display:flex;align-items:center;justify-content:center;font-weight:700;color:#1F6F6B}
    .front h1{margin:0;font-size:4.6mm}.front .t{font-size:2.8mm;color:#3E5653}
    .front .ph{position:absolute;left:6mm;bottom:4.5mm;font-size:2.7mm}.front .ph b{color:#1F6F6B}
    .front .bar{position:absolute;left:0;right:0;bottom:0;height:1.6mm;background:#1F6F6B}
    .back{background:#1F6F6B;color:#fff;display:flex;align-items:center;gap:5mm;padding:5mm 6mm}
    .back .q{background:#fff;border-radius:2mm;padding:1.5mm;flex:none}.back .q svg{width:38mm;height:38mm;display:block}
    .back h2{margin:0 0 1.5mm;font-size:3.8mm}.back p{margin:0;font-size:2.6mm;line-height:1.45;opacity:.92}
    .hint{font:12px Arial;color:#666;margin-top:8mm}@media print{.hint{display:none}}
  </style></head><body><div class="sheet">
    <div class="card front"><div class="b">${logo}<div>Jaslok@Home<small>Jaslok Hospital · A lifetime of care</small></div></div>
      <div class="n">${photo?`<img src="${photo}">`:`<div class="ini">${esc(a.name.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase())}</div>`}<div><h1>${esc(a.name)}</h1><div class="t">${esc(pr.title||'Home-care Nurse')}</div></div></div>
      <div class="ph">Appointments &amp; Enquiries: <b>+91 73 0190 0190</b></div><div class="bar"></div></div>
    <div class="card back"><div class="q">${JHQR.svg(url,200)}</div><div><h2>Scan to see my profile</h2><p>Ratings and reviews from patients, my skills and languages, and request me for care at home.</p></div></div>
  </div><div class="hint">Print on card paper at 100% size, then cut. Front and back are standard 85 × 55 mm business-card size.</div>
  <script>setTimeout(()=>print(),400)<\/script></body></html>`);
  w.document.close();
}

/* ----- reviews (moderation) ----- */
function ppReviews(){
  const all=Store.reviews(); const staff=Store.listAccounts('staff');
  const f=PP.revStaff||''; const list=all.filter(r=>!f||r.staffId===f);
  const body=$('#ppBody');
  body.innerHTML=`<div class="pp-chips"><select id="ppRevStaff" class="pp-mini" style="width:auto"><option value="">All nurses</option>${staff.map(a=>`<option value="${a.id}" ${a.id===f?'selected':''}>${esc(a.name)}</option>`).join('')}</select>
    <span class="lead" style="margin:0 0 0 auto">${list.length} review${list.length===1?'':'s'} · hidden ones are not shown on the profile and not counted in the rating</span></div>
    ${list.length?list.map(r=>`<div class="pp-post ${r.hidden?'':''}" style="${r.hidden?'opacity:.6':''}">
      <div class="pp-ph">${JHStars(r.rating,15)} <b>${esc(r.staffName)}</b> <span class="lead" style="margin:0">rated by ${esc(r.patientName)}</span>${r.verified?'<span class="pp-k k-ok">✓ Was their patient</span>':'<span class="pp-k k-other">Not their patient on record</span>'}${r.hidden?'<span class="pp-k k-alert">Hidden</span>':''}<span class="pp-meta">${ppWhen(r.at)}</span></div>
      ${r.comment?`<div class="pp-body">${esc(r.comment)}</div>`:'<div class="lead" style="margin:6px 0 0">(rating only, no comment)</div>'}
      <div class="pp-acts"><button class="btn sm" data-rh="${r.id}" data-v="${r.hidden?0:1}">${r.hidden?'Show again':'Hide (pull down)'}</button><button class="btn sm danger" data-rd="${r.id}">Delete</button></div></div>`).join('')
      :`<div class="empty"><h2>No reviews yet</h2><p>Patients can rate a nurse from the nurse's profile page (the QR code) once they are logged in.</p></div>`}`;
  $('#ppRevStaff').addEventListener('change',e=>{ PP.revStaff=e.target.value; renderPortal(); });
  body.addEventListener('click',e=>{
    const h=e.target.closest('[data-rh]'); if(h) return ppGuard(async()=>{ await Store.setReviewHidden(h.dataset.rh,h.dataset.v==='1'); toast(h.dataset.v==='1'?'Review hidden':'Review visible again'); if(syncStaffLedger()) save(); renderPortal(); });
    const d=e.target.closest('[data-rd]'); if(d){ if(!d.classList.contains('armed')){ d.classList.add('armed'); d.textContent='Click again'; return; } ppGuard(async()=>{ await Store.deleteReview(d.dataset.rd); toast('Review deleted'); if(syncStaffLedger()) save(); renderPortal(); }); }
  });
}

/* =====================================================================
   STAFF LEDGER — the board's Staff tab, kept in step with staff accounts
   ===================================================================== */
const LEDGER = ['Portal ID','Staff Name','Employee ID','Contact Number','Base Locality','Daily Rate','Login','Joined','Title','Languages','Diet','Skills',
  'Rating','Reviews','Ongoing Duties','Current Patients','Total Duties','Days Worked','Earned','Paid Out','Pending Payout','Last Duty','Duty History','Profile Link'];
const LEDGER_HIDDEN = ['Portal ID','Duty History','Profile Link','Skills','Languages','Title','Joined','Rating','Reviews','Total Duties','Days Worked','Paid Out','Last Duty','Login'];
function syncStaffLedger(){
  const me=Store.me(); if(!me||me.role!=='admin'||!Store.state) return false;
  const st=Store.staffTab(S); if(!st) return false;
  let changed=false;
  LEDGER.forEach(c=>{ if(!st.columns.includes(c)){ st.columns.push(c); st.order.push(c); if(LEDGER_HIDDEN.includes(c)&&!st.hidden.includes(c)) st.hidden.push(c); changed=true; } });
  const accs=Store.listAccounts('staff'); const reviews=Store.reviews(); const seen=new Set();
  const today=isoToday();
  for(const a of accs){
    let row=st.rows.find(r=>r.cells['Portal ID']===a.id)
      || st.rows.find(r=>!r.cells['Portal ID'] && ((a.staffId && String(r.cells['Employee ID']||'').trim().toLowerCase()===a.staffId.toLowerCase()) || String(r.cells['Staff Name']||'').trim().toLowerCase()===a.name.toLowerCase()));
    if(!row){ row=mkRow({}); row.log.push(`Created from staff account at ${nowStamp()}`); st.rows.push(row); changed=true; }
    seen.add(row.id);
    const pr=a.profile||{}; const rate=a.dailyRate;
    const cs=Store.casesForAccount(S,a).filter(c=>!c.enquiry).sort((x,y)=>String(y.start||'').localeCompare(String(x.start||'')));
    const earn=c=> rate!==null ? (c.daysSoFar||0)*rate : 0;
    const rv=reviews.filter(r=>r.staffId===a.id&&!r.hidden);
    const v={
      'Portal ID':a.id, 'Staff Name':a.name, 'Employee ID':a.staffId, 'Contact Number':a.phone||'', 'Base Locality':a.address||'', 'Daily Rate':rate??'',
      'Login': a.active?'Active':'Switched off', 'Joined': pr.workingSince || new Date(a.created).toISOString().slice(0,10),
      'Title':pr.title||'', 'Languages':(pr.languages||[]).join(', '), 'Diet':pr.diet||'', 'Skills':(pr.skills||[]).join(', '),
      'Rating': rv.length? Math.round(rv.reduce((s,r)=>s+r.rating,0)/rv.length*10)/10 : '', 'Reviews': rv.length,
      'Ongoing Duties': cs.filter(c=>c.ongoing).length, 'Current Patients': cs.filter(c=>c.ongoing).map(c=>c.name).join(', '),
      'Total Duties': cs.length, 'Days Worked': cs.reduce((s,c)=>s+(c.daysSoFar||0),0),
      'Earned': cs.reduce((s,c)=>s+earn(c),0), 'Paid Out': cs.filter(c=>c.payout==='Paid').reduce((s,c)=>s+earn(c),0),
      'Pending Payout': cs.filter(c=>c.payout!=='Paid').reduce((s,c)=>s+earn(c),0),
      'Last Duty': cs.reduce((m,c)=>{ const d=(c.end&&c.end<=today)?c.end:(c.daysSoFar?today:''); return d>m?d:m; },''),
      'Duty History': cs.map(c=>`${fmtDate(c.start)} – ${fmtDate(c.end)} · ${c.name} · ${c.service} · ${c.daysSoFar||0} day${c.daysSoFar===1?'':'s'} worked · ₹${Math.round(earn(c)).toLocaleString('en-IN')} · payout ${c.payout}${c.ongoing?' · ONGOING':''}`).join('\n'),
      'Profile Link': a.slug? Store.profileUrl(a.slug) : ''
    };
    let rowChanged=false;
    for(const [k,val] of Object.entries(v)){ if(String(row.cells[k]??'')!==String(val)){ row.cells[k]=val; rowChanged=true; } }
    if(!row.cells['Status']){ row.cells['Status']='Active'; rowChanged=true; }
    if(rowChanged){ row.modified=Date.now(); changed=true; }
  }
  for(const r of st.rows){ if(r.cells['Portal ID'] && !seen.has(r.id) && r.cells['Login']!=='Account deleted'){ r.cells['Login']='Account deleted'; r.modified=Date.now(); changed=true; } }
  return changed;
}
// banner on a Staff-tab card that is linked to an account
function ppStaffDrawer(d, t, row){
  if(!d || t!==Store.staffTab(S) || !row.cells['Portal ID']) return;
  const a=Store.getAccount(row.cells['Portal ID']); const body=$('.d-body',d)||d;
  const box=document.createElement('div'); box.className='infobox'; box.style.margin='0 0 12px';
  box.innerHTML=a?`<b>Linked to ${esc(a.name)}'s staff login.</b> Name, phone, daily rate, home area, profile, duties and earnings update by themselves; change them in Portal → Accounts. Status, Department, Shift Type and Remarks are yours to edit.
    <div class="row" style="margin-top:8px"><button class="btn sm primary" id="ldProf">Profile &amp; QR</button>${a.slug?`<a class="btn sm" target="_blank" href="${esc(Store.profileUrl(a.slug))}">Public profile ↗</a>`:''}</div>`
    :`This staff login was deleted. The row is kept for the record.`;
  body.insertBefore(box, body.firstChild);
  const b=$('#ldProf',box); if(b) b.addEventListener('click',()=>{ closeDrawer(); ppProfileEditor(a.id); });
}
