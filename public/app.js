const $=id=>document.getElementById(id),admin=location.pathname==='/admin';
document.body.dataset.page=admin?'admin':'viewer';
document.querySelector('.admin-link').hidden=admin;
$('viewerPage').hidden=admin;$('adminPage').hidden=!admin;
if(admin&&location.hostname==='localhost')$('adminGate').querySelector('a').href='/auth/chat';
let meta={},world={players:[],skins:[],defaultPets:[]},status={},timer,desktopBusy=false;
const images=new Map(),rows=new Map(),pending=new Set();
const names=['Mossbyte','Toast Panic','Sir Honk','Blob Ross','Buffer Cat'];
const ids=['mossbyte','toast-panic','sir-honk','blob-ross','buffer-cat'];
function notify(text){$('notice').textContent=text;clearTimeout(timer);timer=setTimeout(()=>$('notice').textContent='',6000);}
async function api(path,data){const r=await fetch('/api/'+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined,cache:'no-store'});const result=await r.json();if(!r.ok){if(admin&&[401,403].includes(r.status))void refreshIdentity();throw Error(result.error||'Request failed');}return result;}
function image(url){if(!images.has(url)){const img=new Image();images.set(url,img);img.onerror=()=>{img.onerror=null;img.src=url;};img.src=url.startsWith('/pets/')?url.replace('/pets/','/pets/previews/'):url;}const img=images.get(url);return img.complete&&img.naturalWidth===1536&&[208,4576].includes(img.naturalHeight)?img:null;}
function drawPet(canvas,url,t,size){const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);c.imageSmoothingEnabled=false;const img=image(url);if(!img)return;const frame=matchMedia('(prefers-reduced-motion: reduce)').matches?0:Math.floor(t/180)%6;c.drawImage(img,frame*192,0,192,208,(canvas.width-size)/2,0,size,size*208/192);}
function previewAsset(p){return world.skins.filter(j=>j.userId===p.id&&j.status==='ready').at(-1)?.asset||'/pets/'+ids[(p.appearance?.seed||0)%5]+'.png';}
function drawScene(canvas,t,hero=false){
 if(!canvas)return;const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
 const c=canvas.getContext('2d');c.clearRect(0,0,w,h);c.imageSmoothingEnabled=false;
 const crew=hero?[]:world.players.filter(p=>!p.simulated&&(!p.id.startsWith('demo-')||meta.demo)).slice(0,5);
 const assets=crew.length?crew.map(previewAsset):['/pets/blob-ross.png','/pets/toast-panic.png','/pets/buffer-cat.png'];
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 for(let i=0;i<assets.length;i++){
  const x=assets.length===1?w*.38:w*(.17+(i/(assets.length-1))*.66),size=hero?Math.min(112,w*.25):Math.min(85,w*.19),floor=h-(hero?14:29),hop=reduced?0:Math.max(0,Math.sin(t/900+i*2.2))*8;
  c.fillStyle='#00000030';c.beginPath();c.ellipse(x,floor+1,size*.22,3,0,0,Math.PI*2);c.fill();
  const img=image(assets[i]);if(img)c.drawImage(img,(reduced?0:Math.floor(t/180+i)%6)*192,0,192,208,x-size/2,floor-size*208/192-hop,size,size*208/192);
 }
}
function draw(t){
 if(!admin){
  const canvas=$('pets'),w=Math.max(280,Math.round(canvas.getBoundingClientRect().width)),cols=w<550?3:5,h=Math.ceil(5/cols)*150;
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;canvas.style.height=h+'px';}
  const c=canvas.getContext('2d');c.clearRect(0,0,w,h);c.imageSmoothingEnabled=false;c.textAlign='center';c.font='11px Inter,system-ui,sans-serif';
  for(let i=0;i<5;i++){const row=Math.floor(i/cols),count=Math.min(cols,5-row*cols),x=w/2+(i%cols-(count-1)/2)*(w/cols),y=row*150,img=image('/pets/'+ids[i]+'.png'),frame=matchMedia('(prefers-reduced-motion: reduce)').matches?0:Math.floor(t/180+i)%6;
   if(img)c.drawImage(img,frame*192,0,192,208,x-43,y+9,86,93);c.fillStyle='#c9c1ce';c.fillText(names[i],x,y+129);
  }drawScene($('heroPets'),t,true);
 }else if(meta.host){for(const row of rows.values())drawPet(row.canvas,row.asset,t,46);drawScene($('stagePets'),t);}
 requestAnimationFrame(draw);
}
function renderRoster(){const players=world.players.filter(p=>!p.simulated&&!p.id.startsWith('demo-'));
 // Demo mode may be used only on an isolated local development server.
 const visible=meta.demo?world.players.filter(p=>!p.simulated):players;
 $('viewerCount').textContent=visible.length+' viewer'+(visible.length===1?'':'s');$('activeCount').textContent=visible.length+' active pet'+(visible.length===1?'':'s');
 for(const [id,row]of rows)if(!visible.some(p=>p.id===id)){row.el.remove();rows.delete(id);}
 if(!visible.length){if(!$('roster').querySelector('.empty')){const p=document.createElement('p');p.className='empty';p.textContent='Your first chatter is your first pet. Ask your community to say hello in Twitch chat.';$('roster').append(p);}}else $('roster').querySelector('.empty')?.remove();
 const liveAssets=new Set(visible.length?[]:['/pets/blob-ross.png','/pets/toast-panic.png','/pets/buffer-cat.png']);
 for(const p of visible){let row=rows.get(p.id);if(!row){const el=document.createElement('div');el.className='viewer-row';const person=document.createElement('div');person.className='person';const canvas=document.createElement('canvas');canvas.width=48;canvas.height=52;canvas.setAttribute('aria-hidden','true');const info=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('small'),button=document.createElement('button');info.append(name,detail);person.append(canvas,info);button.className='button';button.onclick=()=>commission(p.id);el.append(person,button);$('roster').append(el);row={el,canvas,name,detail,button};rows.set(p.id,row);}row.name.textContent=p.name;const jobs=world.skins.filter(j=>j.userId===p.id),latest=jobs.at(-1),ready=jobs.filter(j=>j.status==='ready').at(-1),waiting=['queued','generating'].includes(latest?.status);row.asset=ready?.asset||'/pets/'+ids[p.appearance.seed%5]+'.png';liveAssets.add(row.asset);row.detail.textContent=latest?.status==='queued'?'Custom pet queued':latest?.status==='generating'?'Codex is creating this pet…':latest?.status==='failed'?'Creation failed · current pet kept':ready?'Custom pet':names[p.appearance.seed%5]+' · default';row.button.textContent=waiting?'Creating…':ready?'New custom pet':'Make custom pet';row.button.disabled=waiting||pending.has(p.id);}
 for(const url of images.keys())if(!liveAssets.has(url))images.delete(url);
}
async function commission(id){pending.add(id);renderRoster();try{await api('skins/host',{action:'assign',userId:id});notify('Custom pet queued. Their current pet stays until it’s ready.');await pollWorld();}catch(e){notify(e.message);}finally{pending.delete(id);renderRoster();}}
let checkingIdentity=false;
async function refreshIdentity(){if(checkingIdentity)return;checkingIdentity=true;const wasHost=!!meta.host;try{meta=await api('me');if(admin){$('adminGate').hidden=!!meta.host;$('adminControls').hidden=!meta.host;if(!meta.host){rows.clear();$('roster').replaceChildren();images.clear();$('gateMessage').textContent=meta.user?'Sign in with the broadcaster account.':wasHost?'Your session ended. Sign in again.':'Sign in once to connect Twitch chat and open your controls.';}}}catch{}finally{checkingIdentity=false;}}
async function refreshStatus(){if(!admin||!meta.host)return;try{status=await api('admin/status');if(document.activeElement!==$('movementMode'))$('movementMode').value=status.desktop.mode||'walk';$('movementHelp').textContent=status.desktop.mode==='physics'?'Gravity, throws and landings on visible window tops.':'Drag to place. Flick to throw. No window collisions.';$('desktopStatus').textContent=status.desktop.running?'Pets are live on your desktop.':'Your crew is taking a little break.';$('desktopBadge').textContent=status.desktop.running?'Live on desktop':'Paused';$('desktopBadge').classList.toggle('offline',!status.desktop.running);$('desktopToggle').textContent=status.desktop.running?'Turn pets off':'Turn pets on';$('desktopToggle').disabled=desktopBusy;$('chatStatus').textContent=status.chat==='connected'?'Connected':'Disconnected';$('chatStatus').classList.toggle('offline',status.chat!=='connected');$('hatchStatus').textContent=status.hatchery.running?(status.hatchery.phase==='generating'?'Creating a pet…':'Ready for commissions'):'Offline';$('hatchStatus').classList.toggle('offline',!status.hatchery.running);$('reconnectChat').hidden=(status.chat==='connected'&&status.chatRefreshReady)||location.hostname!=='localhost';$('reconnectChat').textContent=status.chat==='connected'&&!status.chatRefreshReady?'Enable automatic chat refresh ↗':'Reconnect Twitch chat ↗';}catch(e){$('desktopStatus').textContent=e.message;}}
$('movementMode').onchange=async()=>{const mode=$('movementMode').value;$('movementMode').disabled=true;try{await api('admin/desktop-settings',{mode});notify(mode==='walk'?'Walk mode on. Drag pets wherever you like.':'Window physics on.');}catch(e){notify(e.message);}finally{$('movementMode').disabled=false;await refreshStatus();}};
$('desktopToggle').onclick=async()=>{desktopBusy=true;$('desktopToggle').disabled=true;try{await api('admin/desktop',{enabled:!status.desktop?.running});notify(status.desktop?.running?'Desktop pets stopped.':'Starting desktop pets…');}catch(e){notify(e.message);}finally{desktopBusy=false;await refreshStatus();}};
async function pollWorld(){try{world=await api('state');$('connection').textContent='● Connected';if(admin&&meta.host)renderRoster();}catch{$('connection').textContent='Reconnecting…';}}
async function init(){try{meta=await api('me');$('workspaceName').textContent=meta.channel||meta.user?.name||'Your channel';$('channelInitial').textContent=(meta.channel||meta.user?.name||'C').slice(0,1);if(meta.channel){$('chatLink').href='https://www.twitch.tv/'+encodeURIComponent(meta.channel)+'/chat';$('chatLink').target='_blank';$('chatLink').rel='noopener';$('chatLink').textContent='Join '+meta.channel+'’s chat ↗';}else $('chatLink').textContent='See chat commands';if(admin){$('adminGate').hidden=!!meta.host;$('adminControls').hidden=!meta.host;if(meta.user&&!meta.host)$('gateMessage').textContent='You’re signed in as '+meta.user.name+'. Switch to the broadcaster’s Twitch account to manage pets.';await refreshStatus();}await pollWorld();}catch(e){notify(e.message);}}
await init();setInterval(pollWorld,1200);setInterval(refreshStatus,2500);setInterval(refreshIdentity,10000);requestAnimationFrame(draw);
