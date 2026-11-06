/* Jaslok Homecare — shared bits for every page: file attach widget, file chips, "Install app". */
"use strict";
(function(global){
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kb=n=> n>=1048576 ? (n/1048576).toFixed(1)+' MB' : Math.max(1,Math.round(n/1024))+' KB';
const icon=m=> /^image\//.test(m)?'🖼️': /pdf/.test(m)?'📄': /sheet|excel/.test(m)?'📊': '📎';
const ACCEPT='image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt';

/* ---------- attach widget ----------
   const pick = FileUI.picker(el, {max:5});  ...  pick.files()  → File[] ;  pick.clear() */
function picker(el, opts={}){
  const max=opts.max||5; let files=[];
  el.classList.add('jh-pick');
  el.innerHTML=`<label class="jh-pick-btn"><input type="file" multiple accept="${ACCEPT}" hidden>📎 ${esc(opts.label||'Attach files')}</label>
    <span class="jh-pick-hint">${esc(opts.hint||'Photos, PDF, Word or Excel · up to 5 MB each')}</span><div class="jh-pick-list"></div>`;
  const inp=el.querySelector('input'), list=el.querySelector('.jh-pick-list');
  const paint=()=>{ list.innerHTML=files.map((f,i)=>`<span class="jh-chip">${icon(f.type)} ${esc(f.name)} <small>${kb(f.size)}</small><button type="button" data-rm="${i}" aria-label="Remove">×</button></span>`).join(''); };
  inp.addEventListener('change',()=>{ for(const f of inp.files){ if(files.length>=max){ alert(`At most ${max} files.`); break; } if(f.size>25*1024*1024){ alert(`${f.name} is too large.`); continue; } files.push(f); } inp.value=''; paint(); });
  list.addEventListener('click',e=>{ const b=e.target.closest('[data-rm]'); if(b){ files.splice(+b.dataset.rm,1); paint(); } });
  return { files:()=>files.slice(), clear(){ files=[]; paint(); } };
}
/* small paperclip button that just holds files (used in reply boxes) */
function clip(el, files=[]){   // `files` array is kept by the caller, so a re-render keeps the choice
  el.innerHTML=`<label class="jh-clip" title="Attach files"><input type="file" multiple accept="${ACCEPT}" hidden>📎<span class="jh-clip-n">${files.length||''}</span></label>`;
  const inp=el.querySelector('input'), n=el.querySelector('.jh-clip-n');
  inp.addEventListener('change',()=>{ files.push(...inp.files); files.splice(5); inp.value=''; n.textContent=files.length||''; el.title=files.map(f=>f.name).join(', '); });
  return { files:()=>files.slice(), clear(){ files.length=0; n.textContent=''; } };
}
/* chips for stored files; clicking one opens it */
function chips(files, opts={}){
  if(!files||!files.length) return '';
  return `<div class="jh-files">${files.map(f=>`<span class="jh-chip jh-file" data-file="${esc(f.id)}" title="Open ${esc(f.name)}">${icon(f.mime)} ${esc(f.name)} <small>${kb(f.size)}</small>${opts.vis&&f.visibleTo?` <small class="jh-vis">${esc({office:'office only',patient:'patient',staff:'staff',both:'patient + staff'}[f.visibleTo]||f.visibleTo)}</small>`:''}${opts.del?`<button type="button" data-fdel="${esc(f.id)}" aria-label="Delete file">×</button>`:''}</span>`).join('')}</div>`;
}
document.addEventListener('click',async e=>{
  if(e.target.closest('[data-fdel]')) return;   // handled by the page
  const c=e.target.closest('[data-file]'); if(!c || !global.Store) return;
  e.preventDefault();
  try{ await Store.openFile(c.dataset.file); }catch(err){ alert(err.message); }
});

/* ---------- install as app (works on every page) ---------- */
let deferred=null;
const standalone=()=> matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;
const ios=()=> /iphone|ipad|ipod/i.test(navigator.userAgent) && !global.MSStream;
function paintInstall(){ document.querySelectorAll('[data-install]').forEach(b=>b.classList.toggle('hidden', standalone() || !(deferred || ios()))); }
addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); deferred=e; paintInstall(); });
addEventListener('appinstalled',()=>{ deferred=null; paintInstall(); });
async function install(){
  if(deferred){ deferred.prompt(); await deferred.userChoice.catch(()=>{}); deferred=null; paintInstall(); return; }
  alert(ios() ? 'On iPhone/iPad: tap the Share button in Safari, then “Add to Home Screen”.' : 'Open your browser menu (⋮) and choose “Install app” or “Add to Home screen”.');
}
document.addEventListener('click',e=>{ if(e.target.closest('[data-install]')){ e.preventDefault(); install(); } });
document.addEventListener('DOMContentLoaded',paintInstall);
if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('service-worker.js').catch(()=>{});

/* styles for the widgets (kept here so every page gets them) */
const css=`.jh-pick{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center}
.jh-pick-btn,.jh-clip{display:inline-flex;align-items:center;gap:6px;border:1px dashed var(--line2,#ccc);border-radius:10px;padding:7px 12px;cursor:pointer;font-weight:600;font-size:13.5px;background:#fff;color:var(--ink,#222)}
.jh-pick-btn:hover,.jh-clip:hover{border-color:var(--accent,#1F6F6B);color:var(--accent,#1F6F6B)}
.jh-clip{padding:5px 9px;border-style:solid}
.jh-clip-n{font-size:11px;font-weight:700;color:var(--accent,#1F6F6B)}
.jh-pick-hint{font-size:12px;color:var(--muted,#777)}
.jh-pick-list,.jh-files{display:flex;flex-wrap:wrap;gap:6px;width:100%}
.jh-files{margin-top:8px}
.jh-chip{display:inline-flex;align-items:center;gap:5px;background:#EEF5F4;border:1px solid #D3E5E3;border-radius:8px;padding:4px 8px;font-size:13px;max-width:100%;color:var(--ink,#222)}
.jh-chip small{color:var(--muted,#777)}
.jh-file{cursor:pointer}.jh-file:hover{border-color:var(--accent,#1F6F6B)}
.jh-chip button{border:none;background:none;color:var(--muted,#777);font-size:15px;line-height:1;padding:0 2px;cursor:pointer}
.jh-vis{background:#fff;border-radius:6px;padding:0 5px}`;
const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);

/* ---------- QR codes (needs vendor/qrcode.js on the page) ---------- */
function qrSvg(text, px=200){
  if(!global.qrcode) return '<div style="font-size:12px;color:#777">QR library not loaded</div>';
  const q=qrcode(0,'M'); q.addData(text); q.make(); const n=q.getModuleCount(), m=2, cell=1, size=n+m*2;
  let d=''; for(let r=0;r<n;r++) for(let c=0;c<n;c++) if(q.isDark(r,c)) d+=`M${c+m} ${r+m}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#0F2B29"/></svg>`;
}
async function qrPng(text, px=1024){   // returns a PNG data URL (for downloading / printing)
  const svg=qrSvg(text,px); const img=new Image(); img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  await img.decode(); const c=document.createElement('canvas'); c.width=c.height=px; c.getContext('2d').drawImage(img,0,0,px,px); return c.toDataURL('image/png');
}
const stars=(v,size=16)=>{ const r=Math.round((v||0)*2)/2; let h=''; for(let i=1;i<=5;i++){ const fill= r>=i?'#F5A524': r>=i-.5?'url(#half)':'#D9E2E0';
  h+=`<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="half"><stop offset="50%" stop-color="#F5A524"/><stop offset="50%" stop-color="#D9E2E0"/></linearGradient></defs><path fill="${fill}" d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"/></svg>`; }
  return `<span class="jh-stars" title="${v?v+' out of 5':'No ratings yet'}">${h}</span>`; };

global.FileUI={ picker, clip, chips, kb };
global.JHQR={ svg:qrSvg, png:qrPng };
global.JHStars=stars;
global.JHInstall={ install, standalone };
})(window);
