/* =====================================================================
   Jaslok@Home — DEMO MODE
   ---------------------------------------------------------------------
   Lets anyone try the whole platform with FICTIONAL data, without an
   account and without touching the real database.

   • Start:  any page with ?demo=admin | ?demo=patient | ?demo=staff
             (or ?demo=1 to just switch demo on)
   • Reset:  ?demo=reset     • Leave: ?demo=off
   • Everything lives in this browser tab (sessionStorage) and is thrown
     away when the tab is closed. The real Supabase database is never called.
   • It copies the database's rules (who sees what), so the demo behaves
     like the real thing.
   Load this file BEFORE js/store.js on every page.
   ===================================================================== */
"use strict";
(function(global){
const FLAG='jh-demo', DBKEY='jh-demo-db-v2', TOKEN='jh-demo-token';
const qs=new URLSearchParams(location.search); const q=qs.get('demo');
try{
  if(q==='off'){ sessionStorage.removeItem(FLAG); sessionStorage.removeItem(DBKEY); localStorage.removeItem(TOKEN); }
  else if(q){ sessionStorage.setItem(FLAG,'1'); if(q==='reset'){ sessionStorage.removeItem(DBKEY); localStorage.removeItem(TOKEN); } }
}catch(e){}
let ON=false; try{ ON=sessionStorage.getItem(FLAG)==='1'; }catch(e){}
if(!ON){ global.JH_DEMO={on:false}; return; }

/* ---------------- helpers ---------------- */
const pad=n=>String(n).padStart(2,'0');
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const day=n=>{ const d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()+n); return iso(d); };
const ago=(days,h=0)=>Date.now()-days*864e5-h*36e5;
const lc=s=>String(s??'').trim().toLowerCase();
const p10=p=>{ const d=String(p??'').replace(/\D/g,''); return d.length>=10?d.slice(-10):''; };
let seq=0; const id=(p='x')=>`${p}-${Date.now().toString(36)}-${(seq++).toString(36)}${Math.random().toString(36).slice(2,6)}`;
const b64=s=>btoa(unescape(encodeURIComponent(s)));
const fail=m=>{ throw new Error(m); };
const dayNum=s=>{ const [y,m,d]=s.split('-').map(Number); return Date.UTC(y,m-1,d)/864e5; };

/* tiny PDF (one page of text) so demo documents open like real ones */
function pdf(title, lines){
  const e=s=>String(s).replace(/[\\()]/g,m=>'\\'+m).replace(/[^\x20-\x7E]/g,'-');
  let y=790, c=`0.12 0.44 0.42 rg 0 815 595 27 re f 1 1 1 rg BT /F2 12 Tf 40 823 Td (JASLOK@HOME  -  DEMO DOCUMENT  -  FICTIONAL DATA) Tj ET 0 0 0 rg\n`;
  c+=`BT /F2 18 Tf 40 ${y-20} Td (${e(title)}) Tj ET\n`; y-=56;
  for(const l of lines){ c+=`BT /F1 11 Tf 40 ${y} Td (${e(l)}) Tj ET\n`; y-=17; }
  c+=`BT /F1 9 Tf 40 40 Td (This is a sample document for demonstration only. Names and numbers are made up.) Tj ET\n`;
  const objs=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    `<< /Length ${c.length} >>\nstream\n${c}endstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
  let out='%PDF-1.4\n'; const off=[]; objs.forEach((o,i)=>{ off.push(out.length); out+=`${i+1} 0 obj\n${o}\nendobj\n`; });
  const x=out.length; out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+off.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return btoa(out);
}
/* illustrated avatar (clearly a drawing, not a photo of a real person) */
function avatar(i, female, cap){
  const bg=['#CFE8E4','#F6E3C8','#DCE4F5','#F3D9E2','#E0EED3','#EAE0F5','#F9E7D0','#D6ECF3'][i%8];
  const skin=['#8D5A3B','#C58C5E','#A86F45','#E0AC7E','#7A4A2E','#B9805A','#D49A6A','#9C6340'][i%8];
  const hair=['#1E1A17','#2B211C','#3A2A20','#151515'][i%4]; const uni=['#2E8B85','#1F6F6B','#3E7CB1','#5B8C5A'][i%4];
  const h= female
    ? `<path d="M58 96c0-34 18-56 42-56s42 22 42 56c0 26-4 48-10 66H68c-6-18-10-40-10-66z" fill="${hair}"/>`
    : `<path d="M62 86c0-28 16-44 38-44s38 16 38 44c-6-12-18-20-38-20s-32 8-38 20z" fill="${hair}"/>`;
  const capS= cap? `<path d="M70 58c6-14 54-14 60 0l-4 12H74z" fill="#fff" stroke="#D5E3E1" stroke-width="2"/><path d="M100 56v10M95 61h10" stroke="#D92D20" stroke-width="3"/>`:'';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="${bg}"/>${female?h:''}
<path d="M30 200c4-36 32-56 70-56s66 20 70 56z" fill="${uni}"/><path d="M84 146l16 22 16-22z" fill="#fff"/><rect x="88" y="122" width="24" height="28" rx="8" fill="${skin}"/>
<ellipse cx="100" cy="94" rx="34" ry="40" fill="${skin}"/>${female?'':h}${capS}
<circle cx="88" cy="94" r="3.6" fill="#1b1b1b"/><circle cx="112" cy="94" r="3.6" fill="#1b1b1b"/><path d="M88 112q12 10 24 0" stroke="#5a2d1f" stroke-width="3" fill="none" stroke-linecap="round"/>
<path d="M156 176h22v14h-22z" fill="#fff" opacity=".9"/><text x="167" y="186" font-family="Arial" font-size="8" font-weight="700" text-anchor="middle" fill="#1F6F6B">DEMO</text></svg>`;
}

/* ---------------- seed data (all fictional) ---------------- */
const PLACES={'Peddar Road':[18.9690,72.8090],'Breach Candy':[18.9719,72.8045],'Malabar Hill':[18.9548,72.7985],'Worli':[19.0176,72.8162],'Bandra West':[19.0596,72.8295],
 'Khar West':[19.0710,72.8360],'Santacruz West':[19.0820,72.8380],'Juhu':[19.1075,72.8263],'Andheri West':[19.1364,72.8296],'Andheri East':[19.1136,72.8697],'Dadar West':[19.0213,72.8424],
 'Matunga':[19.0270,72.8550],'Chembur':[19.0522,72.9005],'Powai':[19.1176,72.9060],'Colaba':[18.9067,72.8147],'Tardeo':[18.9700,72.8150],'Mahim':[19.0350,72.8400],'Lower Parel':[18.9950,72.8300],
 'Cuffe Parade':[18.9150,72.8200],'Goregaon West':[19.1630,72.8400],'Malad West':[19.1860,72.8350],'Kurla West':[19.0700,72.8800],'Ghatkopar East':[19.0790,72.9080],'Sion':[19.0390,72.8619],'Kemps Corner':[18.9620,72.8070]};
const NURSES=[
 ['Anita Demo','DEMO-101','Bandra West',1800,true,true,'Senior ICU Nurse','2019-06-01','Calm and meticulous. Ten years in critical care before moving to home ICU. Families say she explains every step.',['Ventilator care','Tracheostomy care','Central line care','Palliative care'],['English','Hindi','Konkani'],'Non-vegetarian','B.Sc Nursing, BLS & ACLS certified'],
 ['Ravi Demo','DEMO-102','Dadar West',1500,false,false,'Staff Nurse','2021-02-15','Patient and punctual. Specialises in post-operative recovery and diabetic care for elderly patients.',['Wound dressing','Diabetic care','IV cannulation','Post-operative care'],['Hindi','Marathi','English'],'Vegetarian','GNM, BLS certified'],
 ['Priya Demo','DEMO-103','Chembur',1900,true,false,'Critical Care Nurse','2018-09-10','Experienced with cardiac patients and long ventilator stays. Trains our new nurses on monitoring equipment.',['Cardiac monitoring','Ventilator support','ABG sampling','BLS / ACLS'],['Malayalam','Hindi','English','Tamil'],'Non-vegetarian','M.Sc Nursing (Critical Care)'],
 ['Sunita Demo','DEMO-104','Matunga',1300,true,true,'Elder-care Nurse','2020-11-01','Gentle with patients living with dementia. Good at building daily routines with the family.',['Dementia care','Fall prevention','Bed-sore care','Feeding support'],['Marathi','Hindi'],'Vegetarian','ANM, Geriatric care course'],
 ['Joseph Demo','DEMO-105','Andheri East',1500,false,false,'Staff Nurse (Male)','2022-04-20','Strong and steady. Often placed with patients who need help with lifting, mobility and catheter care.',['Catheter care','Mobility support','Post-stroke care','Physiotherapy assistance'],['Malayalam','English','Hindi'],'Non-vegetarian','GNM'],
 ['Farah Demo','DEMO-106','Mahim',1200,true,false,'Phlebotomist','2023-01-09','Quick and painless sample collection at home, including for children and elderly patients with difficult veins.',['Home sample collection','Paediatric draws','Cold-chain handling'],['Urdu','Hindi','English','Marathi'],'Non-vegetarian','DMLT'],
 ['Kavita Demo','DEMO-107','Malad West',1450,true,true,'Staff Nurse','2021-08-16','Organised and cheerful. Looks after many post-surgery and stoma-care patients in the western suburbs.',['Stoma care','Post-surgery care','Medication management'],['Gujarati','Hindi','Marathi','English'],'Jain','GNM, BLS certified'],
 ['Deepak Demo','DEMO-108','Kurla West',1700,false,false,'ICU Nurse','2020-03-02','Handles ventilator and tracheostomy patients at home; very good at teaching families suctioning and alarms.',['Ventilator support','Suctioning','NG tube care','Oxygen therapy'],['Hindi','Bhojpuri','English'],'Eggetarian','GNM, Critical care certificate']
];
// [patient, service, locality, doctor, start offset, days, rate, status, staff, payment, paid%, payout, remarks, phone#, source]
const CASES=[
 ['Asha Sample','Nursing care at home','Peddar Road','Dr. Demo (Endocrinology)',-6,14,2400,'Active','Anita Demo','Part paid',.5,'Pending','Insulin twice daily; daughter is main contact.',1,'Hospital referral'],
 ['Asha Sample','Post-hospitalization support','Peddar Road','Dr. Demo (Endocrinology)',-70,12,2200,'Recovered','Ravi Demo','Paid',1,'Paid','Discharged after hip surgery; walking with support.',1,'Hospital referral'],
 ['Asha Sample','Sample collection at home','Peddar Road','Dr. Demo (Endocrinology)',-25,1,900,'Closed','Farah Demo','Paid',1,'Paid','HbA1c and lipid profile.',1,'Phone'],
 ['Vikram Sample','Ventilator support','Worli','Dr. Demo (Critical Care)',-12,30,6500,'Active','Deepak Demo, Priya Demo','Part paid',.4,'Pending','Day: Deepak, night: Priya. Family trained on alarms.',2,'Hospital referral'],
 ['Meenakshi Sample','Elderly care','Matunga','Dr. Demo (Geriatrics)',-40,60,1600,'Active','Sunita Demo','Part paid',.6,'Pending','Mild dementia; prefers Tamil music in the evening.',3,'Website'],
 ['Rohan Sample','Critical care nursing','Breach Candy','Dr. Demo (Cardiology)',-3,10,4800,'Active','Priya Demo','Unpaid',0,'Pending','Post-cardiac surgery monitoring.',4,'Hospital referral'],
 ['Farida Sample','ICU setup at home','Bandra West','Dr. Demo (Critical Care)',-2,21,7200,'Active','Anita Demo','Part paid',.3,'Pending','Oxygen concentrator and monitor installed.',5,'Hospital referral'],
 ['Gopal Sample','Long-term care','Dadar West','Dr. Demo (Geriatrics)',-90,120,1400,'Active','Ravi Demo','Part paid',.7,'Pending','Bed-bound; 2-hourly turning.',6,'Phone'],
 ['Nalini Sample','Nursing care at home','Malad West','Dr. Demo (Surgery)',-4,7,2000,'Active','Kavita Demo','Unpaid',0,'Pending','Stoma care and dressing.',7,'Website'],
 ['Harish Sample','Post-hospitalization support','Andheri East','Dr. Demo (Surgery)',-5,10,2000,'Active','Joseph Demo','Paid',1,'Pending','Post-stroke; physiotherapy at 11 am daily.',8,'Hospital referral'],
 ['Shabnam Sample','Nursing care at home','Kurla West','Dr. Demo (Cardiology)',-1,10,2000,'Active','','Unpaid',0,'Pending','URGENT: nurse not yet assigned.',9,'Website'],
 ['Kiran Sample','Elderly care','Juhu','Dr. Demo (Geriatrics)',-15,30,1600,'Active','Sunita Demo','Part paid',.5,'Pending','Lives alone; neighbour has spare key.',10,'Phone'],
 ['Tara Sample','Critical care nursing','Colaba','Dr. Demo (Critical Care)',-8,14,4800,'Active','Deepak Demo','Part paid',.5,'Pending','Tracheostomy; suction every 2 hours.',11,'Hospital referral'],
 ['Ajay Sample','Nursing care at home','Powai','Dr. Demo (Surgery)',2,10,2200,'Active','','Unpaid',0,'Pending','Starts next week; prefers a male nurse.',12,'Website'],
 ['Leela Sample','Long-term care','Santacruz West','Dr. Demo (Geriatrics)',4,30,1500,'Active','Kavita Demo','Unpaid',0,'Pending','Family returning from abroad on start date.',13,'Phone'],
 ['Suresh Sample','ICU setup at home','Chembur','Dr. Demo (Cardiology)',1,15,7000,'Active','Priya Demo','Unpaid',0,'Pending','Equipment delivery the day before.',14,'Hospital referral'],
 ['Neelam Sample','Post-hospitalization support','Khar West','Dr. Demo (Endocrinology)',-60,10,2200,'Recovered','Anita Demo','Paid',1,'Paid','Recovered well after knee replacement.',15,'Hospital referral'],
 ['Lata Sample','Elderly care','Kemps Corner','Dr. Demo (Geriatrics)',-120,45,1500,'Recovered','Sunita Demo','Paid',1,'Paid','Back to independent walking.',16,'Website'],
 ['Sanjay Sample','Critical care nursing','Lower Parel','Dr. Demo (Critical Care)',-50,18,4800,'Sent home','Priya Demo','Paid',1,'Paid','Weaned off oxygen; sent home to family in Pune.',17,'Hospital referral'],
 ['Pooja Sample','Nursing care at home','Goregaon West','Dr. Demo (Surgery)',-35,8,2000,'Recovered','Kavita Demo','Part paid',.75,'Paid','Balance due after insurance claim.',18,'Website'],
 ['Imran Sample','Ventilator support','Sion','Dr. Demo (Cardiology)',-80,25,6500,'Sent home','Deepak Demo','Paid',1,'Paid','Discharged from home ICU; stable.',19,'Hospital referral'],
 ['Rekha Sample','Post-hospitalization support','Ghatkopar East','Dr. Demo (Endocrinology)',-45,10,2000,'Recovered','Joseph Demo','Paid',1,'Paid','Post-surgery mobility regained.',20,'Phone'],
 ['Dinesh Sample','Routine & specialized tests','Tardeo','Dr. Demo (Geriatrics)',-10,1,1500,'Closed','Farah Demo','Paid',1,'Paid','Thyroid panel; report shared.',21,'Website'],
 ['Mary Sample','Long-term care','Cuffe Parade','Dr. Demo (Surgery)',-150,60,1400,'Sent home','Ravi Demo','Unpaid',0,'Pending','Moved to family home in Goa.',22,'Phone'],
 ['Arjun Sample','Critical care nursing','Malabar Hill','Dr. Demo (Critical Care)',-30,12,4800,'Recovered','Anita Demo','Paid',1,'Paid','Recovered after ICU discharge.',23,'Hospital referral'],
 ['Vivek Sample','Elderly care','Powai','',7,30,1500,'Enquiry','','Unpaid',0,'Pending','Called about care for his father.',24,'Website'],
 ['Zainab Sample','Sample collection at home','Mahim','',3,1,900,'Enquiry','','Unpaid',0,'Pending','Wants early-morning collection.',25,'Phone']
];
const PATIENT_COLS=['Source','Patient Name','Doctor','Service','Locality','Phone','Start Date','End Date','Days','Rate','Total Amount','Case Type','Status','Remarks','Assigned Staff','Payment Status','Amount Paid','Staff Payout'];
const STAFF_COLS=['Staff Name','Employee ID','Department','Contact Number','Base Locality','Shift Type','Daily Rate','Status','Remarks'];
const CONS_COLS=['Item Name','Category','Unit','Procurement Cost','Retail Rate','Stock','Remarks'];
const phoneOf=n=>`+91 55555 ${String(n).padStart(5,'0')}`;   // 55555… is not a real Indian mobile range
const tab=(name,cols,rows)=>({ id:id('tab'), name, columns:cols.slice(), hidden: name==='Patient Data'?['Assigned Staff','Payment Status','Amount Paid','Staff Payout']:[], rows, notes:[], filters:{}, colorFilter:null, sort:'priority', search:'' });
const row=(cells,log)=>({ id:id('row'), cells, rowColor:null, cellColors:{}, pinned:false, log:log||['Demo record (fictional)'], modified:Date.now() });

function seed(){
  const A=[], posts=[], inquiries=[], reviews=[], files=[];
  const acc=(o)=>{ const a={ id:id('acc'), active:true, mustChange:false, caseIds:[], dailyRate:null, staffId:'', phone:'', email:'', address:'', created:ago(200), lastLogin:ago(0,3), profile:{}, slug:null, ...o }; A.push(a); return a; };
  const admin=acc({ role:'admin', name:'Office (Demo)', login:'admin' });
  const nurses=NURSES.map((n,i)=>acc({ role:'staff', name:n[0], login:n[1].toLowerCase(), staffId:n[1], phone:phoneOf(500+i), address:n[2], dailyRate:n[3],
    slug:'demo-'+lc(n[0].split(' ')[0]), created:ago(300-i*20),
    profile:{ public:true, title:n[6], workingSince:n[7], bio:n[8], skills:n[9], languages:n[10], diet:n[11], qualification:n[12] } }));
  nurses.forEach((a,i)=>files.push({ id:id('f'), target:'profile', targetId:a.id, visibleTo:'both', name:'profile.svg', mime:'image/svg+xml', b64:b64(avatar(i,NURSES[i][4],NURSES[i][5])), size:3000, by:'Office (Demo)', byRole:'admin', at:ago(30) }));
  // board
  const rows=CASES.map(c=>{ const [nm,svc,loc,doc,off,days,rate,st,staff,pay,frac,payout,rem,ph,src]=c; const total=days*rate;
    return row({ 'Source':src,'Patient Name':nm,'Doctor':doc,'Service':svc,'Locality':loc,'Phone':phoneOf(ph),'Start Date':day(off),'End Date':day(off+days-1),'Days':days,'Rate':rate,'Total Amount':total,
      'Case Type': (off>-10&&nm==='Asha Sample')||(/Long-term|Elderly|Ventilator/.test(svc)&&off<-10)||/Kiran|Tara|Leela/.test(nm)?'Renewal':'New','Status':st,'Remarks':rem,'Assigned Staff':staff,'Payment Status':pay,'Amount Paid': frac? Math.round(total*frac):'', 'Staff Payout':payout },
      [`Demo record (fictional)`]); });
  const staffRows=NURSES.map((n,i)=>row({ 'Staff Name':n[0],'Employee ID':n[1],'Department':/ICU|Critical/.test(n[6])?'Critical care':/Phleb/.test(n[6])?'Diagnostics':'Nursing','Shift Type':i%3===0?'12 h day':i%3===1?'12 h night':'24 h live-in','Status':'Active','Remarks':'' }));
  const cons=[['Nitrile gloves (box of 100)','Disposables','Box',260,380,42,''],['Disposable syringes 5 ml','Disposables','Pack of 100',420,600,18,''],['IV cannula 20G','Disposables','Piece',38,65,140,''],
    ['Sterile dressing pads','Wound care','Pack of 10',90,140,60,''],['Oxygen concentrator 5 L','Equipment rental','Per day',220,450,6,'2 on rent'],['Multi-para monitor','Equipment rental','Per day',300,650,4,''],
    ['Hospital bed (semi-fowler)','Equipment rental','Per day',150,350,9,'3 on rent'],['Suction machine','Equipment rental','Per day',120,300,5,''],['N95 masks','Disposables','Piece',25,45,300,''],['Blood collection tubes','Diagnostics','Pack of 100',540,800,12,'']]
    .map(c=>row({ 'Item Name':c[0],'Category':c[1],'Unit':c[2],'Procurement Cost':c[3],'Retail Rate':c[4],'Stock':c[5],'Remarks':c[6] }));
  const geo={}; const city='mumbai';
  for(const [k,[lat,lng]] of Object.entries(PLACES)) geo[`${lc(k)}, ${city}`]={lat,lng,label:`${k}, Mumbai (demo)`,src:'Demo data'};
  const pt=tab('Patient Data',PATIENT_COLS,rows);
  const board={ v:1, tabs:[pt, tab('Staff',STAFF_COLS,staffRows), tab('Consumables',CONS_COLS,cons)], active:pt.id, density:'compact',
    settings:{ olaKey:'', countryCode:'91', daysInclusive:true, countdownDays:3, renewDays:7, handoverMins:45, geocoder:'ola' }, geoCache:geo, savedAt:Date.now() };
  // patients with logins (the demo patient + reviewers)
  const byName=n=>rows.filter(r=>r.cells['Patient Name']===n);
  const pat=(name)=>{ const r=byName(name)[0]; return acc({ role:'patient', name, login:p10(r.cells['Phone']), phone:r.cells['Phone'], email:'', address:r.cells['Locality']+', Mumbai', created:ago(60) }); };
  const asha=pat('Asha Sample'); const others=['Rohan Sample','Neelam Sample','Lata Sample','Sanjay Sample','Pooja Sample','Imran Sample','Rekha Sample','Arjun Sample','Meenakshi Sample','Vikram Sample','Dinesh Sample','Tara Sample'].map(pat);
  const P=n=>A.find(a=>a.role==='patient'&&a.name===n), N=n=>nurses.find(a=>a.name===n);
  // reviews
  const R=(nurse,patient,rating,comment,d)=>reviews.push({ id:id('rv'), staffId:N(nurse).id, patientId:P(patient).id, rating, comment, verified:true, hidden:false, at:ago(d) });
  R('Anita Demo','Neelam Sample',5,'Anita explained every medicine and taught my son how to do the dressing. We felt safe with her.',50);
  R('Anita Demo','Arjun Sample',5,'Very professional. She noticed a drop in oxygen before anyone else did.',20);
  R('Anita Demo','Asha Sample',4,'Kind and on time. Sometimes a little quiet, but very good at her work.',3);
  R('Ravi Demo','Asha Sample',5,'Ravi helped my mother walk again after her hip surgery. Always patient.',55);
  R('Priya Demo','Sanjay Sample',5,'Excellent ICU nurse. Calm during a very scary week for our family.',40);
  R('Priya Demo','Rohan Sample',4,'Knows the monitors inside out. Would request her again.',1);
  R('Sunita Demo','Lata Sample',5,'Aaji loved her. Sunita made a daily routine that we still follow.',80);
  R('Sunita Demo','Meenakshi Sample',5,'Gentle and patient with my grandmother.',10);
  R('Kavita Demo','Pooja Sample',4,'Good stoma care and very organised with medicines.',25);
  R('Deepak Demo','Imran Sample',5,'Taught us suctioning and what each alarm means. Very reassuring.',60);
  R('Deepak Demo','Tara Sample',4,'Hard-working and careful.',4);
  R('Deepak Demo','Vikram Sample',5,'Handles the ventilator very confidently.',2);
  R('Joseph Demo','Rekha Sample',5,'Strong, kind and never in a hurry. Helped with physio every day.',38);
  R('Farah Demo','Dinesh Sample',5,'Took the sample in one go, no pain at all.',9);
  R('Farah Demo','Asha Sample',4,'Came early in the morning as asked.',24);
  reviews.push({ id:id('rv'), staffId:N('Ravi Demo').id, patientId:P('Rohan Sample').id, rating:1, comment:'Did not like the service. (Example of a review the office has pulled down.)', verified:false, hidden:true, at:ago(6) });
  // files on cases
  const caseOf=(n,svc)=>rows.find(r=>r.cells['Patient Name']===n&&(!svc||r.cells['Service']===svc));
  const F=(r,name,vis,title,lines,d)=>files.push({ id:id('f'), target:'case', targetId:r.id, visibleTo:vis, name, mime:'application/pdf', b64:pdf(title,lines), size:1800, by:'Office (Demo)', byRole:'admin', at:ago(d) });
  const ac=caseOf('Asha Sample','Nursing care at home');
  F(ac,'Bill - nursing care (demo).pdf','patient','Interim bill',[ 'Patient: Asha Sample (fictional)', `Service: Nursing care at home, from ${ac.cells['Start Date']}`, 'Rate: Rs. 2,400 per day', 'Advance received: Rs. 16,800', 'Balance is payable at the end of the service.'],2);
  F(ac,'Care plan (demo).pdf','both','Care plan',[ 'Insulin: 10 units before breakfast, 8 units before dinner', 'Check blood sugar 4 times a day and write it in the diary', 'Walk twice a day with support', 'Call the office if sugar is below 70 or above 300'],5);
  F(ac,'Doctor notes - internal (demo).pdf','office','Internal doctor notes',[ 'Office-only document: patients and staff cannot open this.', 'Review insulin dose after 2 weeks.'],5);
  const vb=caseOf('Vikram Sample'); F(vb,'Ventilator settings (demo).pdf','staff','Ventilator settings',[ 'Mode: SIMV, FiO2 35%, PEEP 5', 'Alarm limits as set by the ICU team', 'Shown to staff on this case only.'],10);
  F(caseOf('Neelam Sample'),'Final bill (demo).pdf','patient','Final bill - paid',[ 'Post-hospitalization support, 10 days', 'Total: Rs. 22,000 - Paid in full', 'Thank you for choosing Jaslok@Home (demo).'],48);
  // posts
  const post=(o)=>{ const p={ id:id('post'), subject:'', body:'', caseId:null, caseLabel:'', urgent:false, status:'open', shared:false, replies:[], readBy:[], at:Date.now(), ...o }; posts.push(p); return p; };
  const W=a=>({id:a.id,role:a.role,name:a.name});
  post({ kind:'notice', from:W(admin), to:'everyone', subject:'Welcome to the Jaslok@Home demo', body:'Everything you see here is made up: patients, nurses, phone numbers, bills and reviews. Click around freely; nothing is saved outside this browser tab.', at:ago(0,2), readBy:[admin.id] });
  post({ kind:'notice', from:W(admin), to:'staffs', subject:'BLS refresher this Saturday', body:'Refresher training at 10 am. Please reply here to confirm, or tell us if you are on duty.', at:ago(2), readBy:[admin.id] });
  const q1=post({ kind:'query', from:W(asha), to:'admin', subject:'Can we extend nursing by one week?', body:'The doctor wants the insulin monitoring to continue. Can Anita stay for one more week?', caseId:ac.id, caseLabel:'Asha Sample · Nursing care at home', at:ago(1,5), readBy:[asha.id,admin.id], status:'resolved' });
  q1.replies.push({ id:id('r'), from:W(admin), body:`Yes, extended till ${day(14)}. Anita will continue. The updated bill is in your Documents.`, at:ago(1,2) });
  q1.replies.push({ id:id('r'), from:W(asha), body:'Thank you so much!', at:ago(1,1) });
  const ho=post({ kind:'handover', from:W(N('Anita Demo')), to:'admin', subject:'Evening handover', body:'BP 130/80. Fasting sugar 142, post-dinner 188. Insulin given as per chart. Appetite better today. Slight swelling on left ankle, please ask the doctor at the next review.', caseId:ac.id, caseLabel:'Asha Sample · Nursing care at home', at:ago(0,14), shared:true, readBy:[N('Anita Demo').id,admin.id] });
  post({ kind:'alert', from:W(N('Deepak Demo')), to:'admin', subject:'Oxygen cylinder running low', body:'Backup cylinder at Vikram Sample\'s home is under 20%. Need a refill before 8 pm tonight.', caseId:vb.id, caseLabel:'Vikram Sample · Ventilator support', urgent:true, at:ago(0,1), readBy:[N('Deepak Demo').id] });
  post({ kind:'report-staff', from:W(P('Rohan Sample')), to:'admin', subject:'About the night nurse', body:'Staff member: (night relief nurse)\n\nThe relief nurse on Tuesday night was on her phone for long periods. Otherwise care is good.', at:ago(0,20), readBy:[P('Rohan Sample').id] });
  const fb=post({ kind:'feedback', from:W(P('Dinesh Sample')), to:'admin', subject:'Thank you', body:'Very smooth sample collection and the report came the same evening.', at:ago(8), readBy:[admin.id], status:'resolved' });
  fb.replies.push({ id:id('r'), from:W(admin), body:'Thank you for the kind words! We have passed them on to Farah.', at:ago(8) });
  const sq=post({ kind:'query', from:W(N('Priya Demo')), to:'admin', subject:'Swap Sunday duty?', body:'Can I swap my Sunday night with Deepak? He has agreed.', at:ago(1,9), readBy:[N('Priya Demo').id,admin.id] });
  sq.replies.push({ id:id('r'), from:W(admin), body:'Approved. Updated on the board.', at:ago(1,7) });
  post({ kind:'message', from:W(admin), to:asha.id, subject:'Your nurse next week', body:'Anita Demo continues as your nurse next week. Her relief on Sunday is Kavita Demo.', at:ago(0,6), readBy:[admin.id] });
  files.push({ id:id('f'), target:'post', targetId:ho.id, visibleTo:'office', name:'sugar chart (demo).pdf', mime:'application/pdf', b64:pdf('Blood sugar chart',['Day 1: 152 / 201','Day 2: 147 / 190','Day 3: 142 / 188']), size:1500, by:'Anita Demo', byRole:'staff', at:ago(0,14) });
  // inquiries
  const inq=(o)=>{ const i={ id:id('inq'), status:'new', note:'', email:'', service:'', locality:'', startDate:'', message:'', caseId:null, requestedStaff:null, at:Date.now(), ...o }; inquiries.push(i); return i; };
  const i1=inq({ name:'Kamala Sample', phone:phoneOf(31), service:'ICU setup at home', locality:'Sion', startDate:day(3), message:'My uncle is being discharged from the ICU on Friday. We need an ICU setup and a nurse for nights.', at:ago(0,3) });
  files.push({ id:id('f'), target:'inquiry', targetId:i1.id, visibleTo:'office', name:'discharge summary (demo).pdf', mime:'application/pdf', b64:pdf('Discharge summary',['Patient: fictional','Diagnosis: post-operative care','Advice: home ICU for 2 weeks']), size:1500, by:'Kamala Sample', byRole:'visitor', at:ago(0,3) });
  inq({ name:'Hemant Sample', phone:phoneOf(32), service:'Request for Priya Demo', locality:'Chembur', startDate:day(5), message:'Requested nurse: Priya Demo\n\nShe looked after my neighbour and we would like her for my father.', requestedStaff:N('Priya Demo').id, at:ago(0,8) });
  inq({ name:'Vivek Sample', phone:phoneOf(24), service:'Elderly care', locality:'Powai', message:'Looking for a day attendant for my father (78).', status:'contacted', note:'Called on Monday; sending rate card.', at:ago(2) });
  inq({ name:'Shabnam Sample', phone:phoneOf(9), service:'Nursing care at home', locality:'Kurla West', status:'accepted', caseId:caseOf('Shabnam Sample').id, at:ago(2,4) });
  inq({ name:'Test Enquiry', phone:phoneOf(33), service:'', message:'Just checking prices.', status:'declined', note:'Outside our area.', at:ago(9) });
  return { v:1, accounts:A, posts, inquiries, reviews, files, board, sessions:{}, settings:{ staffSeesPatientBilling:true, staffSeesPatientPhone:true, city:'Mumbai', daysInclusive:true } };
}

/* ---------------- storage ---------------- */
let DB=null;
function load(){ if(DB) return DB; try{ DB=JSON.parse(sessionStorage.getItem(DBKEY)||'null'); }catch(e){ DB=null; } if(!DB||!DB.accounts){ DB=seed(); persist(); } return DB; }
function persist(){ try{ sessionStorage.setItem(DBKEY,JSON.stringify(DB)); }catch(e){ console.warn('Demo storage full', e); } }
const accById=i=>load().accounts.find(a=>a.id===i);

/* ---------------- rules (mirror supabase/setup.sql) ---------------- */
function me(tok){ const m=/^demo:(.+)$/.exec(tok||''); const a=m&&accById(m[1]); if(!a||!a.active) fail('Please log in again.'); return a; }
function admin(tok){ const a=me(tok); if(a.role!=='admin') fail('Admin only'); return a; }
function patientTab(){ const b=load().board; return b && (b.tabs.find(t=>/patient/i.test(t.name))||null); }
function cases(){ const t=patientTab(); if(!t) return []; const ph=t.columns.find(c=>/phone|mobile|contact/i.test(c));
  return t.rows.map((r,i)=>({ id:r.id, phone10: ph?p10(r.cells[ph]):'', staffKeys:String(r.cells['Assigned Staff']||'').split(/[,;/&]+/).map(lc).filter(Boolean), cells:r.cells, sort:i })); }
const keysOf=a=>[lc(a.name), lc(a.staffId)].filter(Boolean);
function myCaseIds(a){ const cs=cases();
  if(a.role==='admin') return cs.map(c=>c.id);
  if(a.role==='patient') return cs.filter(c=>(a.phone&&c.phone10===p10(a.phone))||(a.caseIds||[]).includes(c.id)).map(c=>c.id);
  const k=keysOf(a); return cs.filter(c=>c.staffKeys.some(x=>k.includes(x))).map(c=>c.id); }
const canSee=(a,p,ids)=> a.role==='admin'||p.from.id===a.id||[a.id,'everyone',a.role+'s'].includes(p.to)||(a.role==='staff'&&p.shared&&ids.includes(p.caseId));
const meta=f=>({ id:f.id, name:f.name, mime:f.mime, size:f.size, visibleTo:f.visibleTo, by:f.by, byRole:f.byRole, at:f.at });
const filesOf=(target,tid,vis)=>load().files.filter(f=>f.target===target&&f.targetId===tid&&(!vis||vis.includes(f.visibleTo))).map(meta);
const photoId=a=>{ const f=load().files.find(f=>f.target==='profile'&&f.targetId===a.id); return f?f.id:null; };
const pub=a=>({ id:a.id, role:a.role, name:a.name, login:a.login, phone:a.phone, email:a.email, address:a.address, active:a.active, mustChange:a.mustChange, caseIds:a.caseIds||[],
  dailyRate:a.dailyRate, staffId:a.staffId, created:a.created, lastLogin:a.lastLogin, slug:a.slug, profile:a.profile||{}, photoId:photoId(a) });
const postJson=p=>({ ...p, files:filesOf('post',p.id) });
const strip=(cells,rx)=>{ if(!rx) return {...cells}; const o={}; for(const [k,v] of Object.entries(cells)) if(!new RegExp(rx,'i').test(k)) o[k]=v; return o; };
const tokenFor=a=>'demo:'+a.id;
function pwOk(pw){ if(!pw||pw.length<8) fail('Password must be at least 8 characters.'); if(!/\d/.test(pw)||!/[a-z]/i.test(pw)) fail('Use letters and at least one number.'); }
const slugify=n=>lc(n).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)+'-'+Math.random().toString(36).slice(2,7);

function nurseMetrics(x){
  const k=keysOf(x); const today=dayNum(day(0)); const cs=cases().filter(c=>c.staffKeys.some(s=>k.includes(s)));
  const st=c=>String(c.cells['Status']||''); const ok=c=>!/enquiry|inquiry|cancel|not availed|not converted/i.test(st(c));
  const pr=x.profile||{};
  return { patients:new Set(cs.filter(ok).map(c=>c.phone10||c.id)).size,
    madeWell: pr.madeWell!==undefined&&pr.madeWell!==''?+pr.madeWell: cs.filter(c=>/recover|improv|made well|well|complete/i.test(st(c))).length,
    sentHome: pr.sentHome!==undefined&&pr.sentHome!==''?+pr.sentHome: cs.filter(c=>/discharg|sent home|home/i.test(st(c))).length,
    days: cs.filter(ok).reduce((s,c)=>{ const sd=c.cells['Start Date'], ed=c.cells['End Date']; if(!/^\d{4}-\d{2}-\d{2}$/.test(sd||'')||dayNum(sd)>today) return s; const e=/^\d{4}-\d{2}-\d{2}$/.test(ed||'')?Math.min(dayNum(ed),today):today; return s+Math.max(0,e-dayNum(sd)+1); },0),
    ongoing: cs.filter(c=>!/closed|complete|demise|death|cancel|discharg|recover|sent home|enquiry|inquiry/i.test(st(c)) && (!c.cells['End Date']||dayNum(c.cells['End Date'])>=today) && (!c.cells['Start Date']||dayNum(c.cells['Start Date'])<=today)).length };
}

const API={
  has_admin:()=>true,
  create_admin:()=>fail('The demo already has an office account.'),
  signup_patient({p_name,p_phone,p_email,p_address,p_password}){
    const d=load(); const p=p10(p_phone); if(!String(p_name||'').trim()) fail('Please enter the patient’s name.'); if(!p) fail('Enter a 10-digit mobile number.'); pwOk(p_password);
    if(d.accounts.some(a=>a.login===p)) fail('An account with this mobile number already exists. Please log in.');
    const a={ id:id('acc'), role:'patient', name:p_name.trim(), login:p, phone:p_phone, email:p_email||'', address:p_address||'', active:true, mustChange:false, caseIds:[], dailyRate:null, staffId:'', created:Date.now(), lastLogin:Date.now(), profile:{}, slug:null };
    d.accounts.push(a); persist(); return { token:tokenFor(a), role:a.role };
  },
  login({p_id,p_password}){
    const d=load(); const k=lc(p_id), p=p10(p_id);
    const a=d.accounts.find(a=>a.login===k||lc(a.email)===k&&a.email||(p&&a.role==='patient'&&p10(a.phone)===p)||lc(a.staffId)===k);
    if(!a||String(p_password||'').length<1) fail('Wrong login ID or password. In the demo, every password is demo1234.');
    if(p_password!=='demo1234' && !(a.demoPw&&a.demoPw===p_password)) fail('Wrong login ID or password. In the demo, every password is demo1234.');
    a.lastLogin=Date.now(); persist(); return { token:tokenFor(a), role:a.role };
  },
  logout:()=>null,
  change_password({p_token,p_new}){ const a=me(p_token); pwOk(p_new); a.demoPw=p_new; a.mustChange=false; persist(); },
  get_state({p_token}){
    const d=load(); const a=me(p_token); const ids=myCaseIds(a);
    let rx=null;
    if(a.role==='patient') rx='payout|margin|staff (rate|pay|cost|salary)|cost|procurement|remark|note';
    else if(a.role==='staff'){ rx='margin|cost|procurement'; if(!d.settings.staffSeesPatientBilling) rx+='|rate|amount|total|paid|payment|billed|deposit|invoice'; if(!d.settings.staffSeesPatientPhone) rx+='|phone|mobile|contact|whatsapp'; }
    const t=patientTab();
    const res={ me:pub(a), settings:{...d.settings}, caseColumns:t?t.columns:[],
      posts:d.posts.filter(p=>canSee(a,p,ids)).sort((x,y)=>y.at-x.at).map(postJson),
      cases: a.role==='admin'?[]: cases().filter(c=>ids.includes(c.id)).map(c=>({ id:c.id, cells:strip(c.cells,rx), files:filesOf('case',c.id, a.role==='patient'?['patient','both']:['staff','both']) })),
      accounts: a.role==='admin'? d.accounts.map(pub):null,
      inquiries: a.role==='admin'? d.inquiries.slice().sort((x,y)=>y.at-x.at).map(i=>({...i, files:filesOf('inquiry',i.id), requestedName:i.requestedStaff?(accById(i.requestedStaff)||{}).name:null })):null,
      reviews: a.role==='admin'? d.reviews.slice().sort((x,y)=>y.at-x.at).map(r=>({...r, staffName:(accById(r.staffId)||{}).name, patientName:(accById(r.patientId)||{}).name})):null,
      nurses: a.role!=='admin'? d.accounts.filter(x=>x.role==='staff'&&x.active&&x.slug&&x.profile.public!==false&&(x.id===a.id||cases().some(c=>ids.includes(c.id)&&c.staffKeys.some(k=>keysOf(x).includes(k))))).map(x=>({name:x.name,staffId:x.staffId,slug:x.slug})):null,
      caseFiles: a.role==='admin'? d.files.filter(f=>f.target==='case').reduce((m,f)=>{ (m[f.targetId]=m[f.targetId]||[]).push(meta(f)); return m; },{}):null };
    return res;
  },
  add_post({p_token,p_kind,p_to,p_subject,p_body,p_case_id,p_case_label,p_urgent}){
    const d=load(); const a=me(p_token);
    if(!String(p_body||'').trim()&&!String(p_subject||'').trim()) fail('Please write something first.');
    if(a.role!=='admin'){ p_to='admin'; if(p_case_id&&!myCaseIds(a).includes(p_case_id)){ p_case_id=null; p_case_label=''; } }
    const p={ id:id('post'), kind:p_kind, from:{id:a.id,role:a.role,name:a.name}, to:p_to||'admin', subject:String(p_subject||'').trim(), body:String(p_body||'').trim(), caseId:p_case_id||null, caseLabel:p_case_label||'',
      urgent:!!p_urgent, at:Date.now(), status:'open', shared:false, replies:[], readBy:[a.id] };
    d.posts.push(p); persist(); return p.id;
  },
  reply_post({p_token,p_id,p_body}){ const a=me(p_token); const p=load().posts.find(x=>x.id===p_id); if(!p||!canSee(a,p,myCaseIds(a))) fail('Not found');
    if(!String(p_body||'').trim()) fail('Write a reply first.'); p.replies.push({ id:id('r'), from:{id:a.id,role:a.role,name:a.name}, body:String(p_body).trim(), at:Date.now() }); p.readBy=[a.id]; if(a.role!=='admin') p.status='open'; persist(); },
  mark_read({p_token,p_ids}){ const a=me(p_token); load().posts.forEach(p=>{ if((p_ids||[]).includes(p.id)&&!p.readBy.includes(a.id)) p.readBy.push(a.id); }); persist(); },
  submit_inquiry(o){ const d=load(); if(!String(o.p_name||'').trim()) fail('Please enter a name.'); if(!p10(o.p_phone)) fail('Please enter a 10-digit mobile number so we can call you back.');
    const sid=o.p_staff_slug? (d.accounts.find(a=>a.slug===o.p_staff_slug)||{}).id||null : null;
    const i={ id:id('inq'), at:Date.now(), status:'new', note:'', name:o.p_name.trim(), phone:o.p_phone, email:o.p_email||'', service:o.p_service||'', locality:o.p_locality||'', startDate:o.p_start_date||'', message:o.p_message||'', caseId:null, requestedStaff:sid };
    d.inquiries.push(i); persist(); return i.id; },
  upload_inquiry_file({p_inquiry_id,p_name,p_mime,p_b64}){ guardSize(p_b64); load().files.push({ id:id('f'), target:'inquiry', targetId:p_inquiry_id, visibleTo:'office', name:p_name, mime:p_mime, b64:p_b64, size:Math.round(p_b64.length*.75), by:'visitor', byRole:'visitor', at:Date.now() }); persist(); },
  upload_file({p_token,p_target,p_target_id,p_name,p_mime,p_b64,p_visible}){ const a=me(p_token); guardSize(p_b64); const d=load();
    if(p_target==='profile'||p_target==='case'){ if(a.role!=='admin') fail('Admin only'); }
    if(p_target==='profile') d.files=d.files.filter(f=>!(f.target==='profile'&&f.targetId===p_target_id));
    const f={ id:id('f'), target:p_target, targetId:String(p_target_id), visibleTo:p_target==='post'?'office':p_target==='profile'?'both':(p_visible||'office'), name:p_name, mime:p_mime, b64:p_b64, size:Math.round(p_b64.length*.75), by:a.name, byRole:a.role, at:Date.now() };
    d.files.push(f); persist(); return { id:f.id, name:f.name, size:f.size }; },
  get_file({p_token,p_id}){ const a=me(p_token); const f=load().files.find(x=>x.id===p_id); if(!f) fail('File not found');
    let ok=a.role==='admin'; if(!ok&&f.target==='post'){ const p=load().posts.find(x=>x.id===f.targetId); ok=!!p&&canSee(a,p,myCaseIds(a)); }
    if(!ok&&f.target==='case') ok=myCaseIds(a).includes(f.targetId)&&(f.visibleTo==='both'||f.visibleTo===a.role);
    if(!ok) fail('Not allowed'); return { name:f.name, mime:f.mime, b64:f.b64 }; },
  delete_file({p_token,p_id}){ const a=me(p_token); const d=load(); d.files=d.files.filter(f=>!(f.id===p_id&&(a.role==='admin'||f.by===a.name))); persist(); },
  admin_set_file({p_token,p_id,p_visible}){ admin(p_token); const f=load().files.find(x=>x.id===p_id); if(f) f.visibleTo=p_visible; persist(); },
  admin_set_post({p_token,p_id,p_patch}){ admin(p_token); const p=load().posts.find(x=>x.id===p_id); if(p){ if('status' in p_patch) p.status=p_patch.status; if('shared' in p_patch) p.shared=!!p_patch.shared; } persist(); },
  admin_delete_post({p_token,p_id}){ admin(p_token); const d=load(); d.posts=d.posts.filter(p=>p.id!==p_id); persist(); },
  admin_update_inquiry({p_token,p_id,p_patch}){ admin(p_token); const i=load().inquiries.find(x=>x.id===p_id); if(i) Object.assign(i,p_patch); persist(); },
  admin_delete_inquiry({p_token,p_id}){ admin(p_token); const d=load(); d.inquiries=d.inquiries.filter(i=>i.id!==p_id); persist(); },
  admin_create_staff({p_token,p_name,p_staff_id,p_phone,p_rate,p_password}){ admin(p_token); const d=load(); const k=lc(p_staff_id);
    if(!String(p_name||'').trim()||!k) fail('Name and Staff ID are both needed.'); if(d.accounts.some(a=>a.login===k)) fail('That Staff ID is already in use.'); pwOk(p_password);
    const a={ id:id('acc'), role:'staff', name:p_name.trim(), login:k, staffId:p_staff_id.trim(), phone:p_phone||'', email:'', address:'', dailyRate:p_rate, active:true, mustChange:true, caseIds:[],
      created:Date.now(), lastLogin:null, slug:slugify(p_name), profile:{ public:true, workingSince:day(0) }, demoPw:p_password };
    d.accounts.push(a); persist(); return pub(a); },
  admin_update_account({p_token,p_id,p_patch}){ admin(p_token); const a=accById(p_id); if(!a) fail('Account not found');
    if(a.role==='admin'&&p_patch.active===false) fail('The admin account cannot be switched off.');
    ['name','phone','email','address','active','caseIds'].forEach(k=>{ if(k in p_patch) a[k]=p_patch[k]; });
    if('dailyRate' in p_patch){ const n=Number(String(p_patch.dailyRate??'').replace(/[^0-9.]/g,'')); a.dailyRate= p_patch.dailyRate===''||isNaN(n)?null:n; }
    if(a.role==='patient'&&'phone' in p_patch&&p10(a.phone)) a.login=p10(a.phone); persist(); },
  admin_reset_password({p_token,p_id,p_password}){ admin(p_token); pwOk(p_password); const a=accById(p_id); if(a){ a.demoPw=p_password; a.mustChange=a.role!=='admin'; } persist(); },
  admin_delete_account({p_token,p_id}){ admin(p_token); const d=load(); const a=accById(p_id); if(!a||a.role==='admin') fail('Cannot delete the admin account');
    d.accounts=d.accounts.filter(x=>x.id!==p_id); d.reviews=d.reviews.filter(r=>r.staffId!==p_id&&r.patientId!==p_id); persist(); },
  admin_set_settings({p_token,p_patch}){ admin(p_token); Object.assign(load().settings,p_patch); persist(); },
  admin_load_board({p_token}){ admin(p_token); const b=load().board; return { state:b, savedAt:b?b.savedAt:0 }; },
  admin_save_board({p_token,p_state,p_saved_at,p_days_inclusive}){ admin(p_token); const d=load(); d.board=p_state; d.board.savedAt=p_saved_at; d.settings.daysInclusive=p_days_inclusive!==false; persist(); },
  get_nurse_profile({p_slug,p_token}){ const d=load(); const x=d.accounts.find(a=>a.slug===p_slug&&a.role==='staff');
    if(!x||!x.active||x.profile.public===false) fail('This profile is not available.');
    let m=null; try{ if(p_token) m=me(p_token); }catch(e){}
    const rv=d.reviews.filter(r=>r.staffId===x.id&&!r.hidden);
    const prof={...x.profile}; delete prof.madeWell; delete prof.sentHome;
    return { slug:x.slug, name:x.name, profile:prof, since:x.profile.workingSince||day(0), hasPhoto:!!photoId(x), metrics:nurseMetrics(x),
      rating: rv.length? Math.round(rv.reduce((s,r)=>s+r.rating,0)/rv.length*10)/10 : null, ratingCount:rv.length,
      reviews: rv.filter(r=>r.comment).sort((a,b)=>b.at-a.at).map(r=>{ const p=accById(r.patientId)||{name:'Patient'}; const [f,l]=p.name.split(' '); return { id:r.id, rating:r.rating, comment:r.comment, verified:r.verified, at:r.at, by: f+(l?' '+l[0]+'.':'') }; }),
      me: m? { role:m.role, name:m.name, phone:m.phone, myReview:(r=>r?{rating:r.rating,comment:r.comment,hidden:r.hidden}:null)(d.reviews.find(r=>r.staffId===x.id&&r.patientId===m.id)) } : null };
  },
  get_nurse_photo({p_slug}){ const x=load().accounts.find(a=>a.slug===p_slug); const f=x&&load().files.find(f=>f.target==='profile'&&f.targetId===x.id); return f?{mime:f.mime,b64:f.b64}:null; },
  submit_review({p_token,p_slug,p_rating,p_comment}){ const a=me(p_token); if(a.role!=='patient') fail('Only patients can rate nurses. Please log in with your patient account.');
    const d=load(); const x=d.accounts.find(s=>s.slug===p_slug&&s.role==='staff'); if(!x) fail('This profile is not available.'); if(!(p_rating>=1&&p_rating<=5)) fail('Choose 1 to 5 stars.');
    const v=cases().some(c=>myCaseIds(a).includes(c.id)&&c.staffKeys.some(k=>keysOf(x).includes(k)));
    const r=d.reviews.find(r=>r.staffId===x.id&&r.patientId===a.id);
    if(r) Object.assign(r,{rating:p_rating,comment:String(p_comment||'').slice(0,1000),verified:v,at:Date.now()}); else d.reviews.push({ id:id('rv'), staffId:x.id, patientId:a.id, rating:p_rating, comment:String(p_comment||'').slice(0,1000), verified:v, hidden:false, at:Date.now() });
    persist(); },
  admin_set_review({p_token,p_id,p_hidden}){ admin(p_token); const r=load().reviews.find(x=>x.id===p_id); if(r) r.hidden=!!p_hidden; persist(); },
  admin_delete_review({p_token,p_id}){ admin(p_token); const d=load(); d.reviews=d.reviews.filter(r=>r.id!==p_id); persist(); },
  admin_update_profile({p_token,p_id,p_profile}){ admin(p_token); const a=accById(p_id); if(a&&a.role==='staff'){ a.profile={...a.profile,...p_profile}; if(!a.slug) a.slug=slugify(a.name); } persist(); }
};
function guardSize(b){ if((b||'').length*.75 > 1.5*1024*1024) fail('In the demo, files up to 1.5 MB can be attached (the real system allows 5 MB).'); }

/* role switch from the URL */
function loginAs(role){ const d=load(); const a= role==='admin'? d.accounts.find(x=>x.role==='admin') : role==='staff'? d.accounts.find(x=>x.staffId==='DEMO-101') : d.accounts.find(x=>x.name==='Asha Sample');
  if(a) localStorage.setItem(TOKEN, tokenFor(a)); }
if(['admin','patient','staff'].includes(q)) loginAs(q);

/* ---------------- demo bar ---------------- */
function bar(){
  if(document.getElementById('jhDemoBar')) return;
  const page=location.pathname.split('/').pop()||'index.html';
  const d=load(); const nurse=d.accounts.find(a=>a.staffId==='DEMO-101');
  const links=[['index.html','Website'],['admin.html?demo=admin','Office (admin)'],['admin.html?demo=admin&go=map','Map'],['portal.html?demo=patient','Patient app'],['portal.html?demo=staff','Nurse app'],[`nurse.html?n=${nurse?nurse.slug:''}`,'Nurse profile']];
  const el=document.createElement('div'); el.id='jhDemoBar';
  el.innerHTML=`<style>
    #jhDemoBar{background:#0F2B29;color:#E6F4F2;font:600 12.5px/1.3 Poppins,"Segoe UI",system-ui,sans-serif;display:flex;align-items:center;gap:10px;padding:7px 14px;flex-wrap:wrap;position:relative;z-index:60;flex:none}
    #jhDemoBar .tag{background:#F5A524;color:#1b1b1b;border-radius:6px;padding:2px 8px;font-weight:800;letter-spacing:.6px}
    #jhDemoBar .msg{opacity:.9;font-weight:500}
    #jhDemoBar nav{display:flex;gap:4px;flex-wrap:wrap;margin-left:auto}
    #jhDemoBar a{color:#fff;text-decoration:none;padding:3px 9px;border-radius:999px;border:1px solid rgba(255,255,255,.25);white-space:nowrap}
    #jhDemoBar a:hover,#jhDemoBar a.on{background:#2E8B85;border-color:#2E8B85}
    #jhDemoBar a.x{border-color:transparent;opacity:.8}
    @media(max-width:700px){ #jhDemoBar .msg{display:none} #jhDemoBar nav{margin-left:0;overflow-x:auto;flex-wrap:nowrap;max-width:100%} }
  </style><span class="tag">DEMO</span><span class="msg">All names, phone numbers, bills and reviews are fictional. Nothing here is real patient data.</span>
  <nav>${links.map(([h,l])=>`<a href="${h}" class="${(page+location.search).endsWith(h)?'on':''}">${l}</a>`).join('')}<a href="index.html?demo=reset" title="Start the demo again from scratch">↺ Reset</a><a class="x" href="index.html?demo=off">Exit demo ✕</a></nav>`;
  const host=document.getElementById('app')||document.body; host.insertBefore(el, host.firstChild);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bar); else bar();

/* ---------------- WhatsApp / phone calls never leave the demo ----------------
   Every wa.me / tel: link and window.open to WhatsApp shows a preview instead.
   Only links marked data-real (the office's real number on the website) work normally. */
function preview(url){
  let to='', text='', kind='WhatsApp';
  try{ if(/^tel:/i.test(url)){ kind='Phone call'; to=decodeURIComponent(url.slice(4)); }
       else { const u=new URL(url); to=u.pathname.replace(/\//g,''); text=u.searchParams.get('text')||''; } }catch(e){}
  const shown= to ? ('+'+to.replace(/^\+/,'')).replace(/^\+(\d{2})(\d{5})(\d+)$/,'+$1 $2 $3') : 'you choose the contact or group';
  const esc=x=>String(x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const m=document.createElement('div'); m.id='jhDemoPrev';
  m.innerHTML=`<div class="b"><div class="h"><span class="tag">DEMO</span> ${kind} preview</div>
    <p class="n">${kind==='WhatsApp'?'In the real system this opens WhatsApp with the message below ready to send.':'In the real system this starts a phone call.'} In the demo nothing is sent, because the number is fictional.</p>
    <div class="to"><b>To:</b> ${esc(shown)}</div>${text?`<div class="msg">${esc(text)}</div>`:''}<button type="button">OK</button></div>
    <style>#jhDemoPrev{position:fixed;inset:0;background:rgba(10,30,28,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Poppins,"Segoe UI",system-ui,sans-serif}
    #jhDemoPrev .b{background:#fff;border-radius:16px;max-width:440px;width:100%;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.3);color:#16302E}
    #jhDemoPrev .h{font-weight:700;font-size:17px;display:flex;gap:8px;align-items:center}#jhDemoPrev .tag{background:#F5A524;border-radius:6px;padding:1px 7px;font-size:11px;letter-spacing:.5px}
    #jhDemoPrev .n{color:#5a6b68;font-size:13.5px;margin:8px 0 12px}#jhDemoPrev .to{font-size:14px;margin-bottom:8px}
    #jhDemoPrev .msg{background:#DCF8C6;border-radius:10px 10px 10px 2px;padding:10px 12px;white-space:pre-wrap;font-size:14px;margin-bottom:14px}
    #jhDemoPrev button{background:#1F6F6B;color:#fff;border:none;border-radius:10px;padding:9px 22px;font-weight:600;cursor:pointer;float:right}</style>`;
  m.addEventListener('click',e=>{ if(e.target===m||e.target.tagName==='BUTTON') m.remove(); });
  document.body.appendChild(m);
}
const isComm=u=>/^tel:|^https?:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)/i.test(String(u||''));
document.addEventListener('click',e=>{ const a=e.target.closest&&e.target.closest('a[href]'); if(!a||a.hasAttribute('data-real')) return;
  if(isComm(a.getAttribute('href'))){ e.preventDefault(); e.stopImmediatePropagation(); preview(a.getAttribute('href')); } }, true);
const realOpen=global.open.bind(global);
global.open=function(url,...rest){ if(isComm(url)){ preview(url); return null; } return realOpen(url,...rest); };

global.JH_DEMO={ on:true, TOKEN, rpc:async(fn,args)=>{ const f=API[fn]; if(!f) fail('Not available in the demo: '+fn); await new Promise(r=>setTimeout(r,60)); const r=f(args||{}); return r===undefined?null:JSON.parse(JSON.stringify(r)); },
  reset(){ sessionStorage.removeItem(DBKEY); DB=null; } };
})(window);
