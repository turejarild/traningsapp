import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/*
  FIREBASE:
  1. Skapa ett Firebase-projekt.
  2. Aktivera Authentication > Anonymous.
  3. Skapa Firestore Database.
  4. Klistra in webbkonfigurationen nedan.
  Utan konfiguration används webbläsarens localStorage för testning.
*/
const firebaseConfig = {
  apiKey: "DIN_API_KEY",
  authDomain: "DITT_PROJEKT.firebaseapp.com",
  projectId: "DITT_PROJEKT",
  storageBucket: "DITT_PROJEKT.appspot.com",
  messagingSenderId: "DITT_SENDER_ID",
  appId: "DITT_APP_ID"
};

const TYPES = [
  ["Gym","#69a9ff"],["Innebandy","#55d68b"],["Kondition","#f4a261"],
  ["Snabbhet","#b69cff"],["Explosivitet","#f07878"],["Rörlighet","#5dd6cb"],
  ["Återhämtning","#a5d6a7"],["Rehab","#ef8eb6"],["Tester","#e7c66d"],["Annat","#9aa3a0"]
];
const REG_TYPES = ["Vikt + repetitioner","Repetitioner","Tid","Distans","Distans + tid","Intervaller","Hopp/test","Egen registrering"];
const appRoot = document.querySelector("#app");
const modal = document.querySelector("#modal");
const modalContent = document.querySelector("#modal-content");
let page = "home", selectedDate = new Date(), selectedDay = null, activeSession = null;
let sessions = [], exercises = [], plans = [], firebase = null, db = null, auth = null, cloudReady = false;
const todayISO = () => new Date().toISOString().slice(0,10);
const uid = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random());
const typeColor = name => TYPES.find(t=>t[0]===name)?.[1] || "#9aa3a0";
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtDate = date => new Date(date+"T12:00:00").toLocaleDateString("sv-SE",{day:"numeric",month:"long",year:"numeric"});
const fmtShort = date => new Date(date+"T12:00:00").toLocaleDateString("sv-SE",{day:"numeric",month:"short"});
const monthLabel = date => date.toLocaleDateString("sv-SE",{month:"long",year:"numeric"});
const totalMinutes = s => Number(s.duration || 0);

function loadLocal(){
  sessions = JSON.parse(localStorage.getItem("training_sessions") || "[]");
  exercises = JSON.parse(localStorage.getItem("training_exercises") || "[]");
  plans = JSON.parse(localStorage.getItem("training_plans") || "[]");
}
function saveLocal(){
  localStorage.setItem("training_sessions",JSON.stringify(sessions));
  localStorage.setItem("training_exercises",JSON.stringify(exercises));
  localStorage.setItem("training_plans",JSON.stringify(plans));
}
async function initCloud(){
  const configured = firebaseConfig.apiKey !== "DIN_API_KEY" && firebaseConfig.projectId !== "DITT_PROJEKT";
  if(!configured) return;
  try{
    firebase = initializeApp(firebaseConfig); auth = getAuth(firebase); db = getFirestore(firebase);
    await new Promise((resolve,reject)=>{
      const unsub = onAuthStateChanged(auth, async user=>{
        unsub();
        try{ if(!user) await signInAnonymously(auth); resolve(); }catch(e){reject(e);}
      });
    });
    cloudReady = true;
    const [s,e,p] = await Promise.all([
      getDocs(collection(db,"sessions")),getDocs(collection(db,"exercises")),getDocs(collection(db,"plans"))
    ]);
    sessions=s.docs.map(d=>({id:d.id,...d.data()}));
    exercises=e.docs.map(d=>({id:d.id,...d.data()}));
    plans=p.docs.map(d=>({id:d.id,...d.data()}));
    saveLocal();
  }catch(err){console.error("Firebase kunde inte ansluta:",err);loadLocal();toast("Kunde inte ansluta till Firebase – lokal testdata används.");}
}
async function persist(kind,item){
  if(cloudReady){
    try{
      const col=collection(db,kind);
      if(item.id && !item.id.startsWith("local-")) await updateDoc(doc(db,kind,item.id),item);
      else {const data={...item};delete data.id;const ref=await addDoc(col,data);item.id=ref.id;}
    }catch(e){console.error(e);toast("Molnsparning misslyckades. Kontrollera Firebase.");}
  }
  saveLocal();
}
function toast(message){const el=document.querySelector("#toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600);}
function setPage(next){page=next;document.querySelectorAll("[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===next));render();}
function openModal(html){modalContent.innerHTML=html;modal.showModal();}
function closeModal(){modal.close();}
document.addEventListener("click",e=>{
  const nav=e.target.closest("[data-page]");if(nav){e.preventDefault();setPage(nav.dataset.page);return;}
  const action=e.target.closest("[data-action]");if(action) handleAction(action.dataset.action,action.dataset.id);
});
document.querySelector("#modal-form").addEventListener("submit",e=>{if(e.submitter?.value==="cancel") return;});
function render(){({home:renderHome,planning:renderPlanning,workout:renderWorkout,stats:renderStats,history:renderHistory,exercises:renderExercises}[page]||renderHome)();}

function pageHeading(eyebrow,title,sub,button=""){return `<div class="eyebrow">${eyebrow}</div><div class="section-head" style="margin-top:0"><div><h1>${title}</h1><p class="subtitle">${sub}</p></div>${button}</div>`;}
function statCard(label,value,foot){return `<div class="card stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div></div>`;}
function sessionRow(s){return `<div class="workout-row"><span class="type-dot" style="background:${typeColor(s.type)}"></span><div class="workout-row-main"><strong>${esc(s.title||s.type||"Träningspass")}${s.important?" ★":""}</strong><small>${fmtShort(s.date)} · ${esc(s.type)} · ${s.exercises?.length||0} övningar</small></div><button class="btn btn-small" data-action="view-session" data-id="${s.id}">Visa</button></div>`;}
function renderHome(){
  const completed=[...sessions].filter(s=>s.completed).sort((a,b)=>b.date.localeCompare(a.date));
  const weekStart=new Date();weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));weekStart.setHours(0,0,0,0);
  const thisWeek=completed.filter(s=>new Date(s.date+"T12:00:00")>=weekStart);
  const minutes=completed.reduce((n,s)=>n+totalMinutes(s),0);
  const latest=completed.slice(0,4);
  appRoot.innerHTML=pageHeading("DIN ÖVERSIKT","Träningen börjar här.","Planera smart. Genomför med fokus. Följ din utveckling.",`<button class="btn btn-primary" data-page="workout">＋ Starta pass</button>`)
  +`<div class="grid stats-grid">${statCard("GENOMFÖRDA PASS",completed.length,"Totalt registrerade")}${statCard("PASS DENNA VECKA",thisWeek.length,"Måndag till söndag")}${statCard("TRÄNINGSTID",minutes?`${Math.floor(minutes/60)} h ${minutes%60} min`:"0 min","Registrerad tid")}${statCard("ÖVNINGAR I BIBLIOTEKET",exercises.length,"Dina sparade övningar")}</div>
  <div class="grid two-col"><section class="card"><div class="panel-title"><div><h2>Senaste träningspassen</h2><p class="muted" style="font-size:11px;margin:5px 0 0">Din senaste aktivitet</p></div><button class="btn btn-small btn-ghost" data-page="history">Visa historik →</button></div>${latest.length?latest.map(sessionRow).join(""):`<div class="empty">Inga genomförda pass ännu.<br>Starta ditt första pass för att komma igång.</div>`}</section>
  <section class="card"><div class="panel-title"><h2>Snabbstart</h2></div><div class="grid" style="gap:10px"><button class="btn btn-primary" data-page="workout">＋ Starta oplanerat pass</button><button class="btn" data-page="planning">▦ Planera träning</button><button class="btn" data-page="exercises">◈ Lägg till övning</button><button class="btn" data-page="stats">⌁ Se min statistik</button></div><div style="margin-top:22px"><div class="stat-label">VANLIGASTE TRÄNINGSTYPER</div><div class="legend">${TYPES.slice(0,5).map(t=>`<span class="legend-item"><i class="type-dot" style="background:${t[1]}"></i>${t[0]}</span>`).join("")}</div></div></section></div>`;
}
function renderPlanning(){
  const days=["Måndag","Tisdag","Onsdag","Torsdag","Fredag","Lördag","Söndag"];
  appRoot.innerHTML=pageHeading("STRUKTUR & PLAN","Planering","Bygg din träningsvecka och spara pass som du vill återanvända.",`<button class="btn btn-primary" data-action="new-plan">＋ Skapa pass</button>`)
  +`<section class="card"><div class="panel-title"><div><h2>Planerade pass</h2><p class="muted" style="font-size:11px;margin:5px 0 0">Dina sparade träningspass</p></div></div>${plans.length?plans.map(p=>`<div class="list-item"><div><strong style="font-size:12px">${esc(p.title)}</strong><div class="muted" style="font-size:10px;margin-top:4px">${esc(p.type)} · ${(p.exercises||[]).length} övningar</div></div><div class="action-row"><button class="btn btn-small" data-action="start-plan" data-id="${p.id}">Starta</button><button class="btn btn-small btn-ghost" data-action="delete-plan" data-id="${p.id}">Ta bort</button></div></div>`).join(""):`<div class="empty">Du har inga planerade pass ännu.<br>Skapa ett pass och bygg din egen träningsplan.</div>`}</section>
  <div class="section-head"><div><h2>Träningsmallar</h2><p>Sparade pass kan återanvändas när du vill.</p></div></div><div class="card"><p class="muted" style="font-size:12px;line-height:1.6;margin:0">När du skapar ett pass här sparas det som en mall. Du kan starta mallen när det är dags att träna och registrera det faktiska resultatet utan att ändra originalmallen.</p></div>`;
}
function renderWorkout(){
  if(!activeSession){
    appRoot.innerHTML=pageHeading("DAGS ATT TRÄNA","Starta ett pass","Välj ett planerat pass eller börja från en tom träningslogg.")
    +`<div class="grid two-col"><section class="card"><div class="eyebrow">FRITT PASS</div><h2>Starta oplanerat</h2><p class="muted" style="font-size:12px;line-height:1.6">Börja med en tom logg och lägg till de övningar du vill genomföra.</p><button class="btn btn-primary" data-action="start-empty">Starta tomt pass</button></section><section class="card"><div class="eyebrow">DINA MALLAR</div><h2>Planerade pass</h2>${plans.length?plans.map(p=>`<div class="list-item"><div><strong style="font-size:12px">${esc(p.title)}</strong><div class="muted" style="font-size:10px">${esc(p.type)}</div></div><button class="btn btn-small" data-action="start-plan" data-id="${p.id}">Starta</button></div>`).join(""):`<div class="empty">Skapa ett pass under Planering för att se det här.</div>`}</section></div>`;
    return;
  }
  const s=activeSession;
  appRoot.innerHTML=pageHeading("PÅGÅENDE TRÄNING",esc(s.title||"Träningspass"),"Registrera resultaten under tiden. Dina ändringar sparas när du avslutar passet.",`<button class="btn btn-primary" data-action="finish-session">Avsluta pass</button>`)
  +`<section class="card"><div class="form-grid"><div class="field"><label>TRÄNINGSTYP</label><select class="select" id="session-type">${TYPES.map(t=>`<option ${s.type===t[0]?"selected":""}>${t[0]}</option>`).join("")}</select></div><div class="field"><label>DATUM</label><input class="input" type="date" id="session-date" value="${s.date}"></div></div><div class="section-head"><div><h2>Övningar</h2><p>Lägg till, ta bort och registrera set.</p></div><button class="btn btn-small" data-action="add-session-exercise">＋ Lägg till övning</button></div><div id="session-exercises">${(s.exercises||[]).map((ex,i)=>exerciseEntry(ex,i)).join("")||`<div class="empty">Inga övningar ännu. Lägg till en från biblioteket.</div>`}</div></section>`;
}
function exerciseEntry(ex,i){
  const prev=latestExercise(ex.name);
  const fields=ex.registration==="Vikt + repetitioner"?`<div class="field"><label>VIKT (KG)</label><input class="input ex-weight" type="number" step="0.5" value="${esc(ex.weight??"")}" placeholder="kg"></div><div class="field"><label>REPS</label><input class="input ex-reps" type="number" value="${esc(ex.reps??"")}" placeholder="reps"></div><div class="field"><label>SET</label><input class="input ex-sets" type="number" value="${esc(ex.sets??"")}" placeholder="set"></div>`:
  ex.registration==="Repetitioner"?`<div class="field"><label>REPS</label><input class="input ex-reps" type="number" value="${esc(ex.reps??"")}"></div><div class="field"><label>SET</label><input class="input ex-sets" type="number" value="${esc(ex.sets??"")}"></div>`:
  ex.registration==="Tid"?`<div class="field"><label>TID (SEK)</label><input class="input ex-time" type="number" value="${esc(ex.time??"")}"></div>`:
  ex.registration==="Distans"?`<div class="field"><label>DISTANS (M/KM)</label><input class="input ex-distance" value="${esc(ex.distance??"")}"></div>`:
  ex.registration==="Distans + tid"?`<div class="field"><label>DISTANS</label><input class="input ex-distance" value="${esc(ex.distance??"")}"></div><div class="field"><label>TID</label><input class="input ex-time" value="${esc(ex.time??"")}"></div>`:
  `<div class="field"><label>RESULTAT / ANTECKNING</label><input class="input ex-custom" value="${esc(ex.result??"")}" placeholder="Ange resultat"></div>`;
  return `<div class="exercise-line" data-index="${i}"><div class="field"><label>ÖVNING</label><strong style="font-size:12px">${esc(ex.name)}</strong><small class="muted">${prev?`Senast: ${esc(prev.resultLabel)}`:""}</small></div>${fields}<button class="btn btn-small btn-ghost" data-action="remove-session-exercise" data-id="${i}">Ta bort</button></div>`;
}
function latestExercise(name){
  const all=sessions.filter(s=>s.completed).flatMap(s=>(s.exercises||[]).filter(e=>e.name===name).map(e=>({...e,date:s.date}))).sort((a,b)=>b.date.localeCompare(a.date));
  if(!all.length)return null;const e=all[0];return {resultLabel:[e.weight?`${e.weight} kg`:"",e.reps?`${e.reps} reps`:"",e.sets?`${e.sets} set`:"",e.time?`${e.time} sek`:"",e.distance||"",e.result||""].filter(Boolean).join(" · ")||"Registrerat"};
}
function renderExercises(){
  appRoot.innerHTML=pageHeading("DITT BIBLIOTEK","Övningar","Samla övningar och bestäm hur resultaten ska registreras.",`<button class="btn btn-primary" data-action="new-exercise">＋ Ny övning</button>`)
  +`<div class="card"><div class="field"><label>SÖK ÖVNING</label><input class="input" id="exercise-search" placeholder="Sök på namn eller kategori..."></div><div id="exercise-list" style="margin-top:12px">${exerciseList(exercises)}</div></div>`;
  document.querySelector("#exercise-search").addEventListener("input",e=>document.querySelector("#exercise-list").innerHTML=exerciseList(exercises.filter(x=>(x.name+" "+x.category).toLowerCase().includes(e.target.value.toLowerCase()))));
}
function exerciseList(items){return items.length?items.map(x=>`<div class="list-item"><div><strong style="font-size:12px">${esc(x.name)}</strong><div class="muted" style="font-size:10px;margin-top:4px">${esc(x.category)} · ${esc(x.registration)}</div></div><button class="btn btn-small btn-ghost" data-action="delete-exercise" data-id="${x.id}">Ta bort</button></div>`).join(""):`<div class="empty">Inga övningar ännu. Lägg till dina första övningar i biblioteket.</div>`;}
function renderHistory(){
  const y=selectedDate.getFullYear(),m=selectedDate.getMonth(),first=new Date(y,m,1),start=(first.getDay()+6)%7,days=new Date(y,m+1,0).getDate(),prevDays=new Date(y,m,0).getDate();
  const cells=[];for(let i=0;i<42;i++){let d,month=y,mon=m,muted=false;if(i<start){d=prevDays-start+i+1;mon=m-1;muted=true;}else if(i>=start+days){d=i-(start+days)+1;mon=m+1;muted=true;}else d=i-start+1;const date=new Date(y,mon,d),iso=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;const daySessions=sessions.filter(s=>s.completed&&s.date===iso);cells.push(`<button class="calendar-day ${muted?"muted-day":""} ${iso===todayISO()?"today":""} ${selectedDay===iso?"selected":""}" data-action="select-day" data-id="${iso}"><span class="day-number">${d}</span><span class="day-dots">${daySessions.slice(0,5).map(s=>`<i class="day-dot" style="background:${typeColor(s.type)}"></i>`).join("")}${daySessions.some(s=>s.important)?`<i class="day-star">★</i>`:""}</span></button>`);}
  const shown=selectedDay?sessions.filter(s=>s.completed&&s.date===selectedDay):[];
  appRoot.innerHTML=pageHeading("ALL DIN TRÄNING","Historik","Hitta tidigare pass i kalendern och öppna dem för att se eller ändra detaljer.")
  +`<section class="card"><div class="calendar-head"><button class="btn btn-small" data-action="month-prev">←</button><div class="calendar-title">${monthLabel(selectedDate)}</div><button class="btn btn-small" data-action="month-next">→</button></div><div class="calendar-grid">${["MÅN","TIS","ONS","TOR","FRE","LÖR","SÖN"].map(d=>`<div class="calendar-weekday">${d}</div>`).join("")}${cells.join("")}</div><div class="legend">${TYPES.map(t=>`<span class="legend-item"><i class="type-dot" style="background:${t[1]}"></i>${t[0]}</span>`).join("")}</div></section>
  <div class="section-head"><div><h2>${selectedDay?`Pass ${fmtDate(selectedDay)}`:"Senaste genomförda pass"}</h2><p>${selectedDay?"Välj ett pass för att se alla registreringar.":"Alla dina genomförda träningspass."}</p></div>${selectedDay?`<button class="btn btn-small btn-ghost" data-action="clear-day">Visa alla</button>`:""}</div><section class="card">${(selectedDay?shown:[...sessions].filter(s=>s.completed).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12)).length?(selectedDay?shown:[...sessions].filter(s=>s.completed).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12)).map(sessionRow).join(""):`<div class="empty">${selectedDay?"Inga registrerade pass den här dagen.":"Du har inte registrerat några pass ännu."}</div>`}</section>
  <div class="section-head"><div><h2>Viktiga pass</h2><p>Pass som du markerat för att enkelt hitta senare.</p></div></div><section class="card">${sessions.filter(s=>s.completed&&s.important).length?sessions.filter(s=>s.completed&&s.important).sort((a,b)=>b.date.localeCompare(a.date)).map(sessionRow).join(""):`<div class="empty">Du har inte markerat några viktiga pass ännu.</div>`}</section>`;
}
function renderStats(){
  const done=sessions.filter(s=>s.completed),byType=TYPES.map(t=>({name:t[0],count:done.filter(s=>s.type===t[0]).length,color:t[1]})).filter(t=>t.count);
  const max=Math.max(1,...byType.map(t=>t.count));
  appRoot.innerHTML=pageHeading("FÖLJ DIN UTVECKLING","Statistik","En samlad bild av din träning. Statistiken fylls på automatiskt när du registrerar pass.")
  +`<div class="grid stats-grid">${statCard("GENOMFÖRDA PASS",done.length,"Totalt")}${statCard("TRÄNINGSTID",`${done.reduce((n,s)=>n+totalMinutes(s),0)} min`,"Registrerad tid")}${statCard("ÖVNINGAR",exercises.length,"I biblioteket")}${statCard("VIKTIGA PASS",done.filter(s=>s.important).length,"Markerade i historiken")}</div><div class="grid two-col"><section class="card"><div class="panel-title"><h2>Träning per kategori</h2></div>${byType.length?byType.map(t=>`<div style="margin:14px 0"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:7px"><span>${t.name}</span><span class="muted">${t.count} pass</span></div><div style="height:7px;background:#26342b;border-radius:9px;overflow:hidden"><div style="height:100%;width:${t.count/max*100}%;background:${t.color};border-radius:9px"></div></div></div>`).join(""):`<div class="empty">När du registrerat träningspass visas fördelningen här.</div>`}</section><section class="card"><div class="panel-title"><h2>Senaste aktivitet</h2></div>${done.length?[...done].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).map(sessionRow).join(""):`<div class="empty">Din statistik börjar byggas när du registrerar ditt första pass.</div>`}</section></div><p class="muted" style="font-size:10px;margin-top:18px">Obs: Mer avancerad statistik, personliga rekord och jämförelser läggs till när respektive registreringsdata finns tillgänglig.</p>`;
}

function handleAction(action,id){
  if(action==="new-exercise") showExerciseForm();
  if(action==="new-plan") showPlanForm();
  if(action==="start-empty") startSession({title:"Oplanerat pass",type:"Gym",date:todayISO(),exercises:[]});
  if(action==="start-plan"){const p=plans.find(x=>x.id===id);if(p)startSession({...structuredClone(p),title:p.title,date:todayISO(),completed:false,important:false,notes:"",exertion:"",duration:0});}
  if(action==="delete-plan"){plans=plans.filter(p=>p.id!==id);saveLocal();render();}
  if(action==="delete-exercise"){exercises=exercises.filter(x=>x.id!==id);saveLocal();render();}
  if(action==="add-session-exercise") showAddExercise();
  if(action==="remove-session-exercise"){activeSession.exercises.splice(Number(id),1);renderWorkout();}
  if(action==="finish-session") finishSession();
  if(action==="view-session") viewSession(id);
  if(action==="select-day"){selectedDay=id;renderHistory();}
  if(action==="clear-day"){selectedDay=null;renderHistory();}
  if(action==="month-prev"){selectedDate=new Date(selectedDate.getFullYear(),selectedDate.getMonth()-1,1);renderHistory();}
  if(action==="month-next"){selectedDate=new Date(selectedDate.getFullYear(),selectedDate.getMonth()+1,1);renderHistory();}
}
function showExerciseForm(){
  openModal(`<div class="eyebrow">ÖVNINGSBIBLIOTEK</div><h2>Skapa ny övning</h2><div class="form-grid"><div class="field full"><label>NAMN</label><input class="input" id="new-ex-name" required placeholder="Exempelvis knäböj"></div><div class="field"><label>KATEGORI</label><select class="select" id="new-ex-cat">${TYPES.map(t=>`<option>${t[0]}</option>`).join("")}</select></div><div class="field"><label>REGISTRERINGSMETOD</label><select class="select" id="new-ex-reg">${REG_TYPES.map(t=>`<option>${t}</option>`).join("")}</select></div><div class="field full"><label>BESKRIVNING (VALFRITT)</label><textarea class="textarea" id="new-ex-desc" placeholder="Instruktioner eller egna anteckningar"></textarea></div></div><div class="action-row" style="margin-top:18px"><button class="btn btn-primary" type="button" data-action="save-exercise">Spara övning</button><button class="btn" value="cancel">Avbryt</button></div>`);
}
function showPlanForm(){
  openModal(`<div class="eyebrow">PLANERING</div><h2>Skapa träningspass</h2><div class="form-grid"><div class="field full"><label>NAMN PÅ PASSET</label><input class="input" id="plan-name" placeholder="Exempelvis Ben + explosivitet"></div><div class="field full"><label>TRÄNINGSTYP</label><select class="select" id="plan-type">${TYPES.map(t=>`<option>${t[0]}</option>`).join("")}</select></div><div class="field full"><label>VÄLJ ÖVNINGAR</label><div class="empty">${exercises.length?exercises.map(e=>`<label style="display:flex;gap:8px;align-items:center;margin:8px 0;color:var(--text)"><input type="checkbox" class="plan-ex-check" value="${e.id}">${esc(e.name)} <small class="muted">(${esc(e.registration)})</small></label>`).join(""):"Lägg först till övningar i övningsbiblioteket."}</div></div></div><div class="action-row" style="margin-top:18px"><button class="btn btn-primary" type="button" data-action="save-plan">Spara pass</button><button class="btn" value="cancel">Avbryt</button></div>`);
}
function showAddExercise(){
  openModal(`<div class="eyebrow">LÄGG TILL</div><h2>Välj övning</h2><div class="field"><label>SÖK</label><input class="input" id="add-ex-search" placeholder="Sök i biblioteket"></div><div id="add-ex-list" style="margin-top:12px">${addExerciseList(exercises)}</div><div class="action-row" style="margin-top:16px"><button class="btn btn-ghost" type="button" data-action="new-exercise-from-session">＋ Skapa ny övning</button></div>`);
  document.querySelector("#add-ex-search").addEventListener("input",e=>document.querySelector("#add-ex-list").innerHTML=addExerciseList(exercises.filter(x=>x.name.toLowerCase().includes(e.target.value.toLowerCase()))));
}
function addExerciseList(items){return items.length?items.map(e=>`<div class="list-item"><div><strong style="font-size:12px">${esc(e.name)}</strong><div class="muted" style="font-size:10px">${esc(e.registration)}</div></div><button type="button" class="btn btn-small" data-action="choose-exercise" data-id="${e.id}">Lägg till</button></div>`).join(""):`<div class="empty">Inga övningar hittades.</div>`;}
function startSession(data){activeSession={...data,id:uid(),date:data.date||todayISO(),exercises:data.exercises||[],completed:false};setPage("workout");}
function collectSessionInputs(){
  document.querySelectorAll(".exercise-line").forEach((line,i)=>{
    const ex=activeSession.exercises[i];if(!ex)return;
    const get=cls=>line.querySelector(cls)?.value??"";
    Object.assign(ex,{weight:get(".ex-weight"),reps:get(".ex-reps"),sets:get(".ex-sets"),time:get(".ex-time"),distance:get(".ex-distance"),result:get(".ex-custom")});
  });
  activeSession.type=document.querySelector("#session-type")?.value||activeSession.type;
  activeSession.date=document.querySelector("#session-date")?.value||activeSession.date;
}
function finishSession(){
  collectSessionInputs();
  openModal(`<div class="eyebrow">PASS GENOMFÖRT</div><h2>Utvärdera passet</h2><p class="muted" style="font-size:12px">Spara hur passet kändes. Du kan ändra detta i historiken senare.</p><div class="form-grid"><div class="field full"><label>ANSTRÄNGNING</label><select class="select" id="session-rpe"><option value="">Välj nivå</option><option value="1">1 – Mycket lätt</option><option value="2">2 – Lätt</option><option value="3">3 – Lagom</option><option value="4">4 – Ganska jobbigt</option><option value="5">5 – Mycket jobbigt</option><option value="6">6 – Maximalt</option></select></div><div class="field full"><label>ANTECKNINGAR</label><textarea class="textarea" id="session-notes" placeholder="Hur kändes passet? Vad gick bra eller mindre bra?"></textarea></div><div class="field full"><label style="display:flex;align-items:center;gap:9px"><input type="checkbox" id="session-important"> Markera passet som viktigt ★</label></div><div class="field"><label>TRÄNINGSTID (MINUTER)</label><input class="input" type="number" id="session-duration" min="0" placeholder="Exempelvis 60"></div></div><div class="action-row" style="margin-top:18px"><button class="btn btn-primary" type="button" data-action="save-finished-session">Spara pass</button><button class="btn" type="button" data-action="skip-evaluation">Spara utan utvärdering</button></div>`);
}
async function saveFinished(withEval=true){
  if(withEval){activeSession.exertion=document.querySelector("#session-rpe").value;activeSession.notes=document.querySelector("#session-notes").value;activeSession.important=document.querySelector("#session-important").checked;activeSession.duration=Number(document.querySelector("#session-duration").value||0);}
  activeSession.completed=true;activeSession.createdAt=new Date().toISOString();
  sessions.push(activeSession);await persist("sessions",activeSession);activeSession=null;closeModal();toast("Träningspasset har sparats.");setPage("history");
}
function viewSession(id){
  const s=sessions.find(x=>x.id===id);if(!s)return;
  openModal(`<div class="eyebrow">${fmtDate(s.date)} · ${esc(s.type)}</div><h2>${esc(s.title||"Träningspass")}</h2><div class="list-item"><span class="muted" style="font-size:11px">Ansträngning</span><strong style="font-size:12px">${s.exertion?`${s.exertion}/6`:"Ej angiven"}</strong></div><div class="list-item"><span class="muted" style="font-size:11px">Träningstid</span><strong style="font-size:12px">${s.duration?`${s.duration} min`:"Ej angiven"}</strong></div><h3 style="margin-top:18px">Övningar</h3>${(s.exercises||[]).map(e=>`<div class="list-item"><div><strong style="font-size:12px">${esc(e.name)}</strong><div class="muted" style="font-size:10px">${[e.weight?`${e.weight} kg`:"",e.reps?`${e.reps} reps`:"",e.sets?`${e.sets} set`:"",e.time?`${e.time} sek`:"",e.distance||"",e.result||""].filter(Boolean).join(" · ")||"Inget resultat registrerat"}</div></div></div>`).join("")||`<div class="muted" style="font-size:11px">Inga övningar registrerade.</div>`}<h3 style="margin-top:18px">Anteckningar</h3><p style="font-size:12px;line-height:1.6;color:var(--muted)">${esc(s.notes||"Inga anteckningar.")}</p><div class="action-row"><span class="tag">${s.important?"★ Viktigt pass":"Vanligt pass"}</span><button class="btn btn-small" type="button" data-action="edit-session" data-id="${s.id}">Redigera</button><button class="btn btn-small btn-ghost" type="button" data-action="close-modal">Stäng</button></div>`);
}
function editSession(id){
  const s=sessions.find(x=>x.id===id);if(!s)return;
  openModal(`<div class="eyebrow">REDIGERA HISTORIK</div><h2>Ändra utvärdering</h2><div class="form-grid"><div class="field full"><label>ANSTRÄNGNING</label><select class="select" id="edit-rpe"><option value="">Ej angiven</option>${[1,2,3,4,5,6].map(n=>`<option value="${n}" ${String(s.exertion)===String(n)?"selected":""}>${n}</option>`).join("")}</select></div><div class="field full"><label>ANTECKNINGAR</label><textarea class="textarea" id="edit-notes">${esc(s.notes||"")}</textarea></div><div class="field full"><label><input type="checkbox" id="edit-important" ${s.important?"checked":""}> Markera som viktigt pass ★</label></div></div><div class="action-row" style="margin-top:18px"><button class="btn btn-primary" type="button" data-action="save-edit-session" data-id="${s.id}">Spara ändringar</button><button class="btn" type="button" data-action="close-modal">Avbryt</button></div>`);
}
document.addEventListener("click",async e=>{
  const b=e.target.closest("[data-action]");if(!b)return;const a=b.dataset.action,id=b.dataset.id;
  if(a==="save-exercise"){
    const name=document.querySelector("#new-ex-name").value.trim();if(!name){toast("Skriv ett namn på övningen.");return;}
    const item={id:"local-"+uid(),name,category:document.querySelector("#new-ex-cat").value,registration:document.querySelector("#new-ex-reg").value,description:document.querySelector("#new-ex-desc").value};
    exercises.push(item);await persist("exercises",item);closeModal();toast("Övningen har sparats.");render();return;
  }
  if(a==="save-plan"){
    const selected=[...document.querySelectorAll(".plan-ex-check:checked")].map(c=>exercises.find(x=>x.id===c.value)).filter(Boolean).map(e=>({exerciseId:e.id,name:e.name,registration:e.registration}));
    const title=document.querySelector("#plan-name").value.trim();if(!title){toast("Ge träningspasset ett namn.");return;}
    const p={id:"local-"+uid(),title,type:document.querySelector("#plan-type").value,exercises:selected};plans.push(p);await persist("plans",p);closeModal();toast("Träningspasset har sparats.");setPage("planning");return;
  }
  if(a==="choose-exercise"){
    const ex=exercises.find(x=>x.id===id);if(ex){activeSession.exercises.push({name:ex.name,registration:ex.registration,category:ex.category});closeModal();renderWorkout();}return;
  }
  if(a==="new-exercise-from-session"){closeModal();showExerciseForm();return;}
  if(a==="save-finished-session"){await saveFinished(true);return;}
  if(a==="skip-evaluation"){await saveFinished(false);return;}
  if(a==="close-modal"){closeModal();return;}
  if(a==="edit-session"){editSession(id);return;}
  if(a==="save-edit-session"){
    const s=sessions.find(x=>x.id===id);if(s){s.exertion=document.querySelector("#edit-rpe").value;s.notes=document.querySelector("#edit-notes").value;s.important=document.querySelector("#edit-important").checked;await persist("sessions",s);closeModal();toast("Ändringarna har sparats.");renderHistory();}return;
  }
});
loadLocal();
await initCloud();
render();
