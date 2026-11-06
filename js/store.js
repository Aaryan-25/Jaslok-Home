/* =====================================================================
   Jaslok Homecare — shared data layer (Supabase)
   ---------------------------------------------------------------------
   Every page talks to the database ONLY through `Store`. Store calls the
   functions defined in supabase/setup.sql (POST /rest/v1/rpc/<name>)
   and keeps what the logged-in person may see in memory (`Store.state`),
   so pages can read it instantly. Changes are sent to the server and the
   cache is refreshed. Pages poll every ~20 s for news.
   ===================================================================== */
"use strict";

(function(global){
const CFG = global.JH_CONFIG || {};
const TOKEN_KEY = 'jh-token';

/* ---------- small helpers ---------- */
const uid = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4);
const lc = s => String(s??'').trim().toLowerCase();
const phone10 = p => { const d=String(p??'').replace(/\D/g,''); return d.length>=10 ? d.slice(-10) : ''; };
const pad = n => String(n).padStart(2,'0');
const isoToday = () => { const d=new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const isISO = s => typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const dayNum = iso => { const [y,m,d]=iso.split('-').map(Number); return Date.UTC(y,m-1,d)/86400000; };
const num = v => { if(v===null||v===undefined||v==='') return null; if(typeof v==='number') return v; const n=Number(String(v).replace(/[,₹\s]/g,'')); return isFinite(n)?n:null; };
function checkPwRules(pw){
  if(!pw || pw.length<8) return 'Password must be at least 8 characters.';
  if(!/\d/.test(pw) || !/[a-z]/i.test(pw)) return 'Use letters and at least one number.';
  return '';
}
function getToken(){ try{ return localStorage.getItem(TOKEN_KEY)||''; }catch(e){ return ''; } }
function setToken(t){ try{ t? localStorage.setItem(TOKEN_KEY,t) : localStorage.removeItem(TOKEN_KEY); }catch(e){} }

/* ---------- server call ---------- */
async function rpc(fn, args={}){
  if(!CFG.supabaseUrl) throw new Error('The database is not configured (js/config.js).');
  let res;
  try{
    res = await fetch(`${CFG.supabaseUrl.replace(/\/$/,'')}/rest/v1/rpc/${fn}`, {
      method:'POST', headers:{ 'apikey':CFG.supabaseKey, 'Content-Type':'application/json', 'Accept':'application/json' }, body:JSON.stringify(args) });
  }catch(e){ throw new Error('Cannot reach the server. Check your internet connection.'); }
  const txt = await res.text(); let j=null; try{ j = txt ? JSON.parse(txt) : null; }catch(e){}
  if(!res.ok){
    const msg = (j && (j.message||j.error_description||j.hint)) || `Server error ${res.status}`;
    const err = new Error(msg); err.code = j && j.code;
    if(/Please log in again/.test(msg)){ setToken(''); Store.state=null; }
    if(/Could not find the function|schema cache/i.test(msg)) err.message='The database is not set up yet. Run supabase/setup.sql in the Supabase SQL editor.';
    throw err;
  }
  return j;
}

/* ---------- case helpers (shared by the board, the portal and the server sync) ---------- */
const COL = { staff:'Assigned Staff', pay:'Payment Status', paid:'Amount Paid', payout:'Staff Payout' };
const PAY_STATUSES = ['Unpaid','Part paid','Paid','Waived'];
const PAYOUT_STATUSES = ['Pending','Paid'];
function patientTab(S){ if(!S||!S.tabs) return null; return S.tabs.find(t=>/patient/i.test(t.name)) || S.tabs.find(t=>t.columns.includes('Patient Name')) || null; }
function staffTab(S){ if(!S||!S.tabs) return null; return S.tabs.find(t=>/^staff/i.test(t.name)) || null; }
function colOf(t, rx){ return t ? t.columns.find(c=>rx.test(c)) : null; }
function staffKeysOf(v){ return String(v??'').split(/[,;/&]+/).map(s=>s.trim().toLowerCase()).filter(Boolean); }
function caseView(t, row, daysInclusive=true){
  const g = rx => { const c=colOf(t,rx); return c? row.cells[c] : null; };
  const start=g(/start date/i), end=g(/end date/i), status=String(g(/^status$/i)??'');
  const today=isoToday();
  let days=num(g(/^(total )?days$/i));
  if(isISO(start)&&isISO(end)) days = dayNum(end)-dayNum(start)+(daysInclusive?1:0);
  const left = isISO(end) ? dayNum(end)-dayNum(today) : null;
  const closed=/closed|complete|demise|death|deceased|cancel|discharged|expired|not availed|not converted|lost|rejected/i.test(status);
  const enquiry=/enquiry|inquiry/i.test(status);
  const started = isISO(start) ? dayNum(start)<=dayNum(today) : true;
  const ongoing = !closed && !enquiry && (left===null ? /active|ongoing|running|renew|pending|hold/i.test(status) || !status : left>=0);
  let daysSoFar=null;
  if(isISO(start)){ const upto = isISO(end) ? Math.min(dayNum(end),dayNum(today)) : dayNum(today); daysSoFar=Math.max(0, upto-dayNum(start)+(daysInclusive?1:0)); if(!started) daysSoFar=0; }
  const rate=num(g(/^rate$|patient (service )?rate/i)); let total=num(g(/total amount|^total$/i));
  if(total===null && days!==null && rate!==null) total=days*rate;
  const paid=num(row.cells[COL.paid]);
  return { id:row.id, name:String(g(/patient name|^name$/i)??''), service:String(g(/^service$/i)??''), doctor:String(g(/doctor/i)??''),
    locality:String(g(/locality|address/i)??''), phone:String(g(/phone|mobile|contact/i)??''), start, end, days, daysSoFar, left, rate, total,
    status, remarks:String(g(/remark/i)??''), staff:String(row.cells[COL.staff]??''), pay:String(row.cells[COL.pay]??'')||'Unpaid',
    paid, balance: total!==null ? Math.max(0,total-(paid||0)) : null, payout:String(row.cells[COL.payout]??'')||'Pending',
    ongoing, upcoming: !closed && !enquiry && !started, closed, enquiry };
}
function casesForAccount(S, acc){
  const t=patientTab(S); if(!t||!acc) return [];
  const inc = S.settings ? S.settings.daysInclusive!==false : true;
  const phCol=colOf(t,/phone|mobile|contact/i);
  if(acc.role==='patient'){
    const p=phone10(acc.phone), ids=new Set(acc.caseIds||[]);
    return t.rows.filter(r=> ids.has(r.id) || (p && phCol && phone10(r.cells[phCol])===p)).map(r=>caseView(t,r,inc));
  }
  if(acc.role==='staff'){
    const keys=new Set([lc(acc.name), lc(acc.staffId)].filter(Boolean));
    return t.rows.filter(r=> staffKeysOf(r.cells[COL.staff]).some(k=>keys.has(k))).map(r=>caseView(t,r,inc));
  }
  return [];
}

/* ---------- files: shrink big photos, then base64 ---------- */
const OK_TYPES=/^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf|text\/plain|application\/msword|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|application\/vnd\.ms-excel)$/i;
function guessMime(f){ if(f.type) return f.type; const e=(f.name.split('.').pop()||'').toLowerCase();
  return ({pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',heic:'image/heic',webp:'image/webp',txt:'text/plain',doc:'application/msword',
    docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})[e]||''; }
function toB64(buf){ const u8=new Uint8Array(buf); let s=''; for(let i=0;i<u8.length;i+=0x8000) s+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000)); return btoa(s); }
async function shrinkImage(file){
  try{
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1800/Math.max(bmp.width,bmp.height));
    const c=document.createElement('canvas'); c.width=Math.round(bmp.width*k); c.height=Math.round(bmp.height*k);
    c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
    const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',0.82));
    if(blob && blob.size < file.size) return { blob, name: file.name.replace(/\.[^.]+$/,'')+'.jpg', mime:'image/jpeg' };
  }catch(e){}
  return null;
}
async function prepFile(file){
  let mime=guessMime(file), name=file.name||'file', blob=file;
  if(!OK_TYPES.test(mime)) throw new Error(`${name}: use a photo, PDF, Word or Excel file.`);
  if(/^image\/(jpeg|png|webp)$/i.test(mime) && file.size > 400*1024){ const s=await shrinkImage(file); if(s){ blob=s.blob; name=s.name; mime=s.mime; } }
  if(blob.size > 5*1024*1024) throw new Error(`${name} is larger than 5 MB.`);
  return { name, mime, b64: toB64(await blob.arrayBuffer()) };
}

async function squarePhoto(file){   // centre-crop to a 600×600 JPEG
  const bmp=await createImageBitmap(file).catch(()=>{ throw new Error('That photo could not be read. Use a JPG or PNG.'); });
  const side=Math.min(bmp.width,bmp.height), c=document.createElement('canvas'); c.width=c.height=600;
  c.getContext('2d').drawImage(bmp,(bmp.width-side)/2,(bmp.height-side)/2,side,side,0,0,600,600);
  const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',0.85)); return toB64(await blob.arrayBuffer());
}

/* ---------- the public API ---------- */
const listeners = new Set();
let readQueue = new Set(), readTimer = null, refreshing = null;
const emit = () => listeners.forEach(f=>{ try{ f(); }catch(e){ console.error(e); } });

const Store = {
  mode:'cloud', state:null,
  prepFile, COL, PAY_STATUSES, PAYOUT_STATUSES, phone10, isoToday, caseView, casesForAccount, patientTab, staffTab, checkPwRules, uid, staffKeysOf, rpc,
  onChange(fn){ listeners.add(fn); return ()=>listeners.delete(fn); },

  /* load everything this person may see */
  async refresh(){
    if(!getToken()){ this.state=null; return null; }
    if(refreshing) return refreshing;
    refreshing = (async()=>{
      try{ this.state = await rpc('get_state',{p_token:getToken()}); emit(); return this.state; }
      catch(e){ if(!getToken()){ this.state=null; emit(); return null; } throw e; }
      finally{ refreshing=null; }
    })();
    return refreshing;
  },
  async init(){ try{ await this.refresh(); }catch(e){ console.warn(e); } return this.me(); },
  startPolling(ms=20000){ clearInterval(this._poll); this._poll=setInterval(()=>{ if(document.visibilityState==='visible' && getToken()) this.refresh().catch(()=>{}); }, ms); },

  /* auth */
  async hasAdmin(){ return !!(await rpc('has_admin')); },
  async createAdmin({name, password}){ const r=await rpc('create_admin',{p_name:name, p_password:password}); setToken(r.token); await this.refresh(); return this.me(); },
  async signupPatient({name, phone, email, password, address}){
    const r=await rpc('signup_patient',{p_name:name, p_phone:phone, p_email:email||'', p_address:address||'', p_password:password});
    setToken(r.token); await this.refresh(); return this.me();
  },
  async login(id, password){ const r=await rpc('login',{p_id:id, p_password:password}); setToken(r.token); await this.refresh(); return this.me(); },
  async logout(){ const t=getToken(); setToken(''); this.state=null; if(t){ try{ await rpc('logout',{p_token:t}); }catch(e){} } },
  me(){ return this.state ? this.state.me : null; },
  async changePassword(oldPw, newPw){ await rpc('change_password',{p_token:getToken(), p_old:oldPw, p_new:newPw}); await this.refresh(); },
  homeFor(role){ return role==='admin' ? 'admin.html' : 'portal.html'; },

  /* accounts (admin) */
  listAccounts(role){ return ((this.state&&this.state.accounts)||[]).filter(a=>!role||a.role===role); },
  getAccount(id){ return ((this.state&&this.state.accounts)||[]).find(a=>a.id===id) || (this.me()&&this.me().id===id?this.me():null); },
  async createStaff({name, staffId, phone, dailyRate, password}){
    const a=await rpc('admin_create_staff',{p_token:getToken(), p_name:name, p_staff_id:staffId, p_phone:phone||'', p_rate:num(dailyRate), p_password:password});
    await this.refresh(); return a;
  },
  async updateAccount(id, patch){ await rpc('admin_update_account',{p_token:getToken(), p_id:id, p_patch:patch}); await this.refresh(); },
  async resetPassword(id, pw){ await rpc('admin_reset_password',{p_token:getToken(), p_id:id, p_password:pw}); await this.refresh(); },
  async deleteAccount(id){ await rpc('admin_delete_account',{p_token:getToken(), p_id:id}); await this.refresh(); },

  /* posts */
  visiblePosts(){ return (this.state&&this.state.posts)||[]; },
  setMyCaseIds(){},
  async addPost({kind, to='admin', subject='', body='', caseId=null, caseLabel='', urgent=false, files=null}){
    if(!String(body).trim() && !String(subject).trim()) throw new Error('Please write something first.');
    const id=await rpc('add_post',{p_token:getToken(), p_kind:kind, p_to:to, p_subject:subject, p_body:body, p_case_id:caseId||null, p_case_label:caseLabel||'', p_urgent:!!urgent});
    if(files && files.length){ for(const f of files) await this.uploadFile('post', id, f); }
    await this.refresh(); return id;
  },
  async reply(postId, body, files=null){
    if(!String(body).trim() && !(files&&files.length)) throw new Error('Write a reply first.');
    if(files && files.length){ for(const f of files) await this.uploadFile('post', postId, f); }
    await rpc('reply_post',{p_token:getToken(), p_id:postId, p_body: String(body).trim() || `📎 Attached ${files.length} file${files.length>1?'s':''}`}); await this.refresh(); },
  isUnread(p){ const m=this.me(); return !!m && !!p && !(p.readBy||[]).includes(m.id); },
  markRead(postId){
    const m=this.me(); const p=this.visiblePosts().find(x=>x.id===postId); if(!m||!p||!this.isUnread(p)) return;
    p.readBy=[...(p.readBy||[]), m.id]; readQueue.add(postId);
    clearTimeout(readTimer); readTimer=setTimeout(()=>{ const ids=[...readQueue]; readQueue.clear(); rpc('mark_read',{p_token:getToken(), p_ids:ids}).catch(()=>{}); emit(); },400);
  },
  async setPost(postId, patch){ await rpc('admin_set_post',{p_token:getToken(), p_id:postId, p_patch:patch}); await this.refresh(); },
  async deletePost(postId){ await rpc('admin_delete_post',{p_token:getToken(), p_id:postId}); await this.refresh(); },

  /* inquiries */
  async addInquiry(q){
    if(!String(q.name||'').trim()) throw new Error('Please enter a name.');
    if(!phone10(q.phone)) throw new Error('Please enter a 10-digit mobile number so we can call you back.');
    const id=await rpc('submit_inquiry',{p_name:q.name, p_phone:q.phone, p_email:q.email||'', p_service:q.service||'', p_locality:q.locality||'', p_start_date:q.startDate||'', p_message:q.message||'', p_staff_slug:q.staffSlug||null});
    const failed=[];
    for(const f of (q.files||[])){ try{ const x=await prepFile(f); await rpc('upload_inquiry_file',{p_inquiry_id:id, p_name:x.name, p_mime:x.mime, p_b64:x.b64}); }catch(e){ failed.push(f.name+': '+e.message); } }
    return { id, failed };
  },
  listInquiries(){ return (this.state&&this.state.inquiries)||[]; },
  async updateInquiry(id, patch){ await rpc('admin_update_inquiry',{p_token:getToken(), p_id:id, p_patch:patch}); await this.refresh(); },
  async deleteInquiry(id){ await rpc('admin_delete_inquiry',{p_token:getToken(), p_id:id}); await this.refresh(); },

  /* documents */
  MAX_FILE: 5*1024*1024,
  async uploadFile(target, targetId, file, visible='office'){
    const x=await prepFile(file);
    return await rpc('upload_file',{p_token:getToken(), p_target:target, p_target_id:String(targetId), p_name:x.name, p_mime:x.mime, p_b64:x.b64, p_visible:visible});
  },
  async deleteFile(id){ await rpc('delete_file',{p_token:getToken(), p_id:id}); await this.refresh(); },
  async setFileVisibility(id, v){ await rpc('admin_set_file',{p_token:getToken(), p_id:id, p_visible:v}); await this.refresh(); },
  caseFiles(caseId){ const s=this.state||{}; if(s.caseFiles) return s.caseFiles[caseId]||[]; const c=(s.cases||[]).find(x=>x.id===caseId); return (c&&c.files)||[]; },
  // Opens (or downloads) a stored file. Call straight from a click so the new tab is not blocked.
  async openFile(id){
    const w = window.open('', '_blank');
    try{
      if(w) w.document.write('<p style="font:16px system-ui;padding:20px">Opening file…</p>');
      const f=await rpc('get_file',{p_token:getToken(), p_id:id});
      const bin=atob(f.b64); const u8=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
      const url=URL.createObjectURL(new Blob([u8],{type:f.mime}));
      if(/^(image\/|application\/pdf|text\/plain)/.test(f.mime) && w){ w.location.href=url; }
      else { if(w) w.close(); const a=document.createElement('a'); a.href=url; a.download=f.name; document.body.appendChild(a); a.click(); a.remove(); }
      setTimeout(()=>URL.revokeObjectURL(url), 60000);
    }catch(e){ if(w) w.close(); throw e; }
  },

  /* nurse public profiles, reviews */
  profileUrl(slug){ return location.href.replace(/[#?].*$/,'').replace(/[^/]*$/,'') + 'nurse.html?n=' + encodeURIComponent(slug); },
  async getNurseProfile(slug){ return await rpc('get_nurse_profile',{p_slug:slug, p_token:getToken()||null}); },
  async getNursePhoto(slug){ try{ const f=await rpc('get_nurse_photo',{p_slug:slug}); return f&&f.b64 ? `data:${f.mime};base64,${f.b64}` : null; }catch(e){ return null; } },
  async submitReview(slug, rating, comment){ await rpc('submit_review',{p_token:getToken(), p_slug:slug, p_rating:rating, p_comment:comment||''}); },
  reviews(){ return (this.state&&this.state.reviews)||[]; },
  nurses(){ return (this.state&&this.state.nurses)||[]; },
  async setReviewHidden(id, hidden){ await rpc('admin_set_review',{p_token:getToken(), p_id:id, p_hidden:!!hidden}); await this.refresh(); },
  async deleteReview(id){ await rpc('admin_delete_review',{p_token:getToken(), p_id:id}); await this.refresh(); },
  async updateProfile(id, profile){ await rpc('admin_update_profile',{p_token:getToken(), p_id:id, p_profile:profile}); await this.refresh(); },
  async uploadProfilePhoto(id, file){
    const sq=await squarePhoto(file);
    await rpc('upload_file',{p_token:getToken(), p_target:'profile', p_target_id:id, p_name:'profile.jpg', p_mime:'image/jpeg', p_b64:sq, p_visible:'both'});
    await this.refresh();
  },

  /* settings */
  settings(){ return {staffSeesPatientBilling:true, staffSeesPatientPhone:true, ...((this.state&&this.state.settings)||{})}; },
  async setSettings(patch){ await rpc('admin_set_settings',{p_token:getToken(), p_patch:patch}); await this.refresh(); },

  /* case data as a mini "board", for the patient / staff portal */
  async readBoard(){
    const s=this.state; if(!s) return null;
    return { settings:{ daysInclusive: s.settings ? s.settings.daysInclusive!==false : true },
      tabs:[{ name:'Patient Data', columns:s.caseColumns||[], rows:(s.cases||[]).map(c=>({id:c.id, cells:c.cells||{}})) }] };
  },

  /* the admin board <-> server */
  async loadBoard(){ return await rpc('admin_load_board',{p_token:getToken()}); },
  async saveBoard(S){
    const t=patientTab(S); const phCol=t&&colOf(t,/phone|mobile|contact/i);
    const cases = t ? t.rows.map(r=>({ id:r.id, phone10: phCol?phone10(r.cells[phCol]):'', staffKeys: staffKeysOf(r.cells[COL.staff]), cells:r.cells })) : [];
    await rpc('admin_save_board',{p_token:getToken(), p_state:S, p_saved_at:S.savedAt||Date.now(), p_cases:cases, p_columns:t?t.columns:[], p_days_inclusive:!S.settings||S.settings.daysInclusive!==false});
  },

  /* backup (admin): what the server returned, without passwords */
  exportAll(){ const s=this.state||{}; return { exported:new Date().toISOString(), accounts:s.accounts||[], posts:s.posts||[], inquiries:s.inquiries||[], settings:s.settings||{} }; }
};

global.Store = Store;
})(window);
