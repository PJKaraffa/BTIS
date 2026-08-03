'use strict';
const cfg = window.BTIS_CONFIG || {};
const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('YOUR_') && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes('YOUR_');
const sb = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
let map, profile, schools=[], buses=[], routes=[], incidents=[], markers=[];
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmtTime = t => t ? new Date(`2000-01-01T${t}`).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}) : '—';

async function init(){
  if(!configured){ $('#loginMessage').textContent='Copy config.example.js to config.js and add your Supabase and Mapbox credentials.'; return; }
  const {data:{session}}=await sb.auth.getSession();
  if(session) await enterApp(session.user);
}

$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault(); $('#loginMessage').textContent='Signing in…';
  const {data,error}=await sb.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});
  if(error){$('#loginMessage').textContent=error.message;return;}
  await enterApp(data.user);
});
$('#logoutBtn').addEventListener('click',async()=>{await sb.auth.signOut();location.reload();});

async function enterApp(user){
  const {data,error}=await sb.from('profiles').select('*').eq('id',user.id).single();
  if(error){$('#loginMessage').textContent='Profile unavailable: '+error.message;return;}
  profile=data; $('#userName').textContent=profile.full_name||profile.email; $('#userRole').textContent=profile.role;
  document.body.dataset.role=profile.role;
  if(!['admin','transportation'].includes(profile.role)) document.querySelectorAll('.ops-only').forEach(x=>x.remove());
  $('#loginPage').classList.add('hidden'); $('#app').classList.remove('hidden');
  await loadAll(); setupMap(); subscribeRealtime();
}

async function loadAll(){
  const [s,b,r,i]=await Promise.all([
    sb.from('schools').select('*').order('school_name'),
    sb.from('buses').select('*').order('bus_number'),
    sb.from('routes').select('*,schools(school_name),buses(bus_number)').order('route_number'),
    sb.from('traffic_incidents').select('*').order('start_time',{ascending:false})
  ]);
  for(const result of [s,b,r,i]) if(result.error) console.error(result.error);
  schools=s.data||[]; buses=b.data||[]; routes=r.data||[]; incidents=i.data||[];
  renderAll();
}
function renderAll(){renderKpis();renderAlerts();renderSchools();renderBuses();renderRoutes();renderIncidents();populateSelects();renderMarkers();}
function renderKpis(){
  const activeBuses=buses.filter(b=>b.status==='active'); const delayed=activeBuses.filter(b=>(b.delay_minutes||0)>5);
  const avg=activeBuses.length?activeBuses.reduce((a,b)=>a+(b.delay_minutes||0),0)/activeBuses.length:0;
  $('#kpiSchools').textContent=schools.filter(s=>s.active).length; $('#kpiBuses').textContent=activeBuses.length; $('#kpiDelayed').textContent=delayed.length;
  $('#kpiIncidents').textContent=incidents.filter(i=>i.active).length; $('#kpiAvgDelay').textContent=`${avg.toFixed(1)} min`;
}
function renderAlerts(){
  const alerts=[...buses.filter(b=>(b.delay_minutes||0)>5).map(b=>({title:`Bus ${b.bus_number} delayed`,text:`${b.delay_minutes} minutes late • ${b.driver_name||'Driver not assigned'}`,level:'late'})),...incidents.filter(i=>i.active).map(i=>({title:`${i.incident_type}: ${i.road||'Location'}`,text:i.description||'Active traffic incident',level:i.severity}))].slice(0,10);
  $('#alerts').innerHTML=alerts.length?alerts.map(a=>`<div class="alert"><span class="badge ${esc(a.level)}">${esc(a.level)}</span><strong>${esc(a.title)}</strong><p>${esc(a.text)}</p></div>`).join(''):'<div class="empty">No active alerts.</div>';
}
function table(headers,rows){return rows.length?`<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`:'<div class="empty">No records found.</div>'}
function renderSchools(){$('#schoolsTable').innerHTML=table(['School','Code','Start','Dismissal','Students','Buses'],schools.map(s=>`<tr><td><strong>${esc(s.school_name)}</strong><br><small>${esc(s.address)}</small></td><td>${esc(s.school_code||'—')}</td><td>${fmtTime(s.start_time)}</td><td>${fmtTime(s.dismissal_time)}</td><td>${s.student_count||0}</td><td>${s.bus_count||0}</td></tr>`));}
function renderBuses(){$('#busesTable').innerHTML=table(['Bus','Driver','Vendor','Capacity','Delay','Status'],buses.map(b=>`<tr><td><strong>${esc(b.bus_number)}</strong></td><td>${esc(b.driver_name||'—')}</td><td>${esc(b.vendor||'—')}</td><td>${b.capacity||'—'}</td><td><span class="badge ${(b.delay_minutes||0)>5?'late':'ontime'}">${b.delay_minutes||0} min</span></td><td><span class="badge ${esc(b.status)}">${esc(b.status)}</span></td></tr>`));}
function renderRoutes(){$('#routesTable').innerHTML=table(['Route','School','Bus','Period','Duration','Distance'],routes.map(r=>`<tr><td><strong>${esc(r.route_number)}</strong></td><td>${esc(r.schools?.school_name||'—')}</td><td>${esc(r.buses?.bus_number||'Unassigned')}</td><td>${esc(r.period)}</td><td>${r.estimated_minutes??'—'} min</td><td>${r.distance_miles??'—'} mi</td></tr>`));}
function renderIncidents(){$('#incidentsTable').innerHTML=table(['Type','Road','Severity','Description','Status'],incidents.map(i=>`<tr><td><strong>${esc(i.incident_type)}</strong></td><td>${esc(i.road||'—')}</td><td><span class="badge ${esc(i.severity)}">${esc(i.severity)}</span></td><td>${esc(i.description||'—')}</td><td>${i.active?'Active':'Closed'}</td></tr>`));}
function populateSelects(){
  const schoolOptions=schools.map(s=>`<option value="${s.id}">${esc(s.school_name)}</option>`).join('');
  $('#simSchool').innerHTML=schoolOptions; $('#routeSchool').innerHTML=schoolOptions;
  $('#routeBus').innerHTML='<option value="">Unassigned</option>'+buses.map(b=>`<option value="${b.id}">${esc(b.bus_number)}</option>`).join('');
}
function setupMap(){
  if(map || !cfg.MAPBOX_TOKEN || cfg.MAPBOX_TOKEN.includes('YOUR_')) return;
  mapboxgl.accessToken=cfg.MAPBOX_TOKEN;
  map=new mapboxgl.Map({container:'map',style:'mapbox://styles/mapbox/streets-v12',center:[-73.195,41.186],zoom:12.1});
  map.addControl(new mapboxgl.NavigationControl()); map.on('load',renderMarkers);
}
function renderMarkers(){
  if(!map || !map.loaded()) return; markers.forEach(m=>m.remove()); markers=[];
  schools.forEach(s=>addMarker(s.longitude,s.latitude,'🏫','school',`<strong>${esc(s.school_name)}</strong><br>${esc(s.address||'')}<br>Dismissal: ${fmtTime(s.dismissal_time)}`));
  buses.filter(b=>b.current_latitude&&b.current_longitude).forEach(b=>addMarker(b.current_longitude,b.current_latitude,'🚌',`bus ${(b.delay_minutes||0)>5?'late':''}`,`<strong>Bus ${esc(b.bus_number)}</strong><br>${b.delay_minutes||0} minutes late<br>${esc(b.driver_name||'No driver')}`));
  incidents.filter(i=>i.active).forEach(i=>addMarker(i.longitude,i.latitude,'⚠','incident',`<strong>${esc(i.incident_type)}</strong><br>${esc(i.road||'')}<br>${esc(i.description||'')}`));
}
function addMarker(lng,lat,icon,cls,html){const el=document.createElement('div');el.className=`map-marker ${cls}`;el.textContent=icon;markers.push(new mapboxgl.Marker(el).setLngLat([lng,lat]).setPopup(new mapboxgl.Popup({offset:18}).setHTML(html)).addTo(map));}

document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));btn.classList.add('active');
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active-view')); $(`#${btn.dataset.view}View`).classList.add('active-view');
  $('#pageTitle').textContent=btn.dataset.view==='dashboard'?'District Overview':btn.querySelector('span').textContent;
  if(btn.dataset.view==='dashboard'&&map)setTimeout(()=>map.resize(),50);
}));
document.querySelectorAll('[data-open]').forEach(btn=>btn.addEventListener('click',()=>$('#'+btn.dataset.open).showModal()));
document.querySelectorAll('.modal-form').forEach(form=>form.addEventListener('submit',async e=>{
  e.preventDefault(); const submitter=e.submitter; if(submitter?.value==='cancel'){form.closest('dialog').close();return;}
  const raw=Object.fromEntries(new FormData(form)); Object.keys(raw).forEach(k=>raw[k]===''&&delete raw[k]);
  const entity=form.dataset.entity; const tableName={school:'schools',bus:'buses',route:'routes',incident:'traffic_incidents'}[entity];
  for(const key of ['latitude','longitude','capacity','school_id','bus_id']) if(raw[key]!==undefined) raw[key]=Number(raw[key]);
  const {error}=await sb.from(tableName).insert(raw); if(error){alert(error.message);return;} form.reset();form.closest('dialog').close();await loadAll();
}));
$('#simMinutes').addEventListener('input',e=>$('#simOutput').textContent=`${Number(e.target.value)>=0?'+':''}${e.target.value} minutes`);
$('#runSimulation').addEventListener('click',()=>{
  const school=schools.find(s=>String(s.id)===$('#simSchool').value); const delta=Number($('#simMinutes').value); if(!school)return;
  const affected=Math.max(1,school.bus_count||Math.round((school.student_count||500)/50));
  const currentAvg=Math.max(4,Math.min(18,6+(affected/8))); const improvement=delta>0?Math.min(currentAvg-1,delta*.42):Math.max(-8,delta*.28);
  const proposed=Math.max(1,currentAvg-improvement); const conflicts=Math.max(0,Math.round(affected*(currentAvg/20))); const newConflicts=Math.max(0,Math.round(conflicts*(proposed/currentAvg)));
  $('#simulationResult').innerHTML=`<h3>${esc(school.school_name)} scenario</h3><p>Adjust dismissal by <strong>${delta>=0?'+':''}${delta} minutes</strong>. This Phase 1 estimate uses school bus volume and a rule-based congestion curve; historical GPS modeling comes in Phase 2.</p><div class="sim-grid"><div><small>Current delay</small><strong>${currentAvg.toFixed(1)}</strong> min</div><div><small>Estimated delay</small><strong>${proposed.toFixed(1)}</strong> min</div><div><small>Route conflicts</small><strong>${conflicts} → ${newConflicts}</strong></div></div>`;
});
function subscribeRealtime(){sb.channel('btis-live').on('postgres_changes',{event:'*',schema:'public',table:'buses'},loadAll).on('postgres_changes',{event:'*',schema:'public',table:'traffic_incidents'},loadAll).subscribe();}
init();
