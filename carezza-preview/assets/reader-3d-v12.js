/* Carezza Preview: lector 3D adaptable v12. Sin CDN ni dependencias de flipbook.
   Utiliza SOLO los PNG con marca de agua protegidos por la API. */
'use strict';
const API='https://xytbrvqmdnjpqcttkave.supabase.co/functions/v1/carezza-preview';
const $=id=>document.getElementById(id);
const token=new URLSearchParams(location.search).get('token')||'';
const accessKey='carezza_grant_'+token;
let memoryGrant='';
function grant(){try{return sessionStorage.getItem(accessKey)||memoryGrant;}catch(_){return memoryGrant;}}
function setGrant(v){memoryGrant=v;try{sessionStorage.setItem(accessKey,v);}catch(_){}}
const mobile=()=>window.matchMedia('(max-width:760px)').matches;
let total=0,current=0,busy=false,locked=false,thumbsBuilt=false;
let imageTasks=new Map(),lastFocus=null,zoomFactor=1,zoomBase=0;
let previousWidth=window.innerWidth,resizeDebounce,gesture=null,lastTouch=0;
function status(s){$('status').textContent=s;}
function loading(show,label='Preparando página…'){
  const el=$('loadingBadge');
  el.textContent=label;
  el.classList.toggle('hidden',!show);
  el.setAttribute('aria-hidden',show?'false':'true');
}
function pageUrl(i){
  if(i<0||i>=total)return '';
  const path=API+'/api/page/'+encodeURIComponent(token)+'/'+(i+1);
  return path+(grant()?'?grant='+encodeURIComponent(grant()):'');
}
function ensure(i){
  if(i<0||i>=total)return Promise.resolve(true);
  if(imageTasks.has(i))return imageTasks.get(i);
  const promise=new Promise(resolve=>{
    const img=new Image();
    img.decoding='async';
    let finished=false;
    let timeout=null;
    const done=ok=>{
      if(finished)return;
      finished=true;
      clearTimeout(timeout);
      resolve(ok);
    };
    img.onload=()=>{
      if(typeof img.decode==='function'){
        Promise.resolve(img.decode()).then(()=>done(true),()=>done(img.naturalWidth>0));
      }else done(img.naturalWidth>0);
    };
    img.onerror=()=>done(false);
    timeout=setTimeout(()=>done(false),25000);
    img.src=pageUrl(i);
    if(img.complete && img.naturalWidth>0)img.onload();
  });
  imageTasks.set(i,promise);
  promise.then(ok=>{if(!ok)imageTasks.delete(i);});
  return promise;
}
function warm(i){
  const limit=mobile()?2:3;
  for(let p=Math.max(0,i-1);p<=Math.min(total-1,i+limit);p++)void ensure(p);
}
function normalize(i){
  if(i<1)return 0;
  if(mobile())return Math.min(total-1,i);
  return Math.min(total-1,i%2===1?i:i-1);
}
function spread(i=current){
  if(mobile())return {left:-1,right:i};
  if(i===0)return {left:-1,right:0};
  return {left:i,right:i+1<total?i+1:-1};
}
function target(dir){
  if(mobile()){const n=current+dir;return n>=0&&n<total?n:null;}
  if(dir>0){const n=current===0?1:current+2;return n<total?n:null;}
  if(current===0)return null;
  return current<=1?0:current-2;
}
function paper(index,side){
  const el=document.createElement('div');
  el.className='book-paper '+side+(index<0?' empty':'');
  if(index>=0){
    const img=document.createElement('img');
    img.alt='Página '+(index+1)+' de '+total;
    img.draggable=false;
    img.decoding='async';
    img.src=pageUrl(index);
    el.appendChild(img);
  }
  return el;
}
function render(){
  const book=$('book');
  book.className='flipbook-shell';
  const s=spread();
  const surface=document.createElement('div');
  surface.className='book-spread';
  surface.appendChild(paper(s.left,'left'));
  surface.appendChild(paper(s.right,'right'));
  const spine=document.createElement('div');
  spine.className='book-spine';
  book.replaceChildren(surface,spine);
  refresh();
}
function refresh(){
  const s=spread();
  const last=s.right>=0?s.right:s.left;
  $('counter').textContent=current===0?'Portada · 1 de '+total:
    (last>current?'Páginas '+(current+1)+'–'+(last+1):'Página '+(current+1))+' de '+total;
  $('prev').disabled=target(-1)===null||busy;
  $('next').disabled=target(1)===null||busy;
  $('pageSlider').max=String(total);
  $('pageSlider').value=String(current+1);
  $('pageSlider').style.setProperty('--reading-progress',Math.round((current+1)/total*100)+'%');
  for(const b of $('thumbnails').querySelectorAll('button[data-page]'))
    b.classList.toggle('is-current',Number(b.dataset.page)===current);
}
function leafSide(index,cls){
  const el=document.createElement('div');
  el.className=cls;
  if(index>=0){
    const img=document.createElement('img');
    img.src=pageUrl(index);
    img.alt='';
    img.draggable=false;
    img.decoding='async';
    el.appendChild(img);
  }
  return el;
}
async function turn(dir){
  if(busy||!total||locked||!$('zoomOverlay').classList.contains('hidden'))return;
  const next=target(dir);
  if(next===null)return;
  busy=true;
  refresh();
  const before=spread(current),after=spread(next);
  const front=mobile()?current:(dir>0?before.right:before.left);
  const back=mobile()?next:(dir>0?after.left:after.right);
  const preload=[front,back,after.right,after.left].filter((p,i,a)=>p>=0&&a.indexOf(p)===i);
  if(preload.some(i=>!imageTasks.has(i)))loading(true,'Preparando la hoja…');
  try{
    const loaded=await Promise.all(preload.map(ensure));
    if(loaded.some(ok=>!ok)){
      status('No se pudo cargar una página. Revisa tu conexión y vuelve a intentarlo.');
      return;
    }
    // Preparamos la siguiente vista DEBAJO de la hoja que va a girar.
    const book=$('book');
    current=next;
    render();
    const leaf=document.createElement('div');
    leaf.className='turning-leaf '+(dir>0?'forward':'backward');
    leaf.appendChild(leafSide(front,'leaf-front'));
    leaf.appendChild(leafSide(back,'leaf-back'));
    book.appendChild(leaf);
    await new Promise(resolve=>{
      let settled=false;
      const settle=()=>{
        if(settled)return;
        settled=true;
        clearTimeout(timeout);
        leaf.removeEventListener('transitionend',onEnd);
        leaf.remove();
        resolve();
      };
      const onEnd=event=>{if(event.target===leaf&&event.propertyName==='transform')settle();};
      leaf.addEventListener('transitionend',onEnd);
      const timeout=setTimeout(settle,1250);
      requestAnimationFrame(()=>requestAnimationFrame(()=>leaf.classList.add('flipped')));
    });
    warm(next);
    status('Visor 12 · Efecto 3D activo. Desliza para hojear tu revista.');
  }catch(err){
    console.error('Carezza Preview: error al hojear',err);
    status('Ocurrió un error al pasar la hoja: '+(err?.message||'error desconocido'));
    render();
  }finally{busy=false;loading(false);refresh();}
}
function jumpTo(index){
  if(busy||!total)return;
  const targetPage=normalize(index);
  if(targetPage===current)return;
  busy=true;refresh();loading(true,'Preparando página '+(targetPage+1)+'…');
  void ensure(targetPage).then(ok=>{
    if(ok){current=targetPage;render();warm(current);}
    else status('No se pudo abrir esta página. Revisa tu conexión.');
  }).catch(err=>{status('No se pudo cambiar de página: '+err.message);})
    .finally(()=>{busy=false;loading(false);refresh();});
}
function showThumbs(){
  if(thumbsBuilt)return;
  thumbsBuilt=true;
  const frag=document.createDocumentFragment();
  for(let i=0;i<total;i++){
    const btn=document.createElement('button');
    btn.className='thumb';btn.type='button';btn.dataset.page=String(i);
    btn.setAttribute('aria-label','Ir a página '+(i+1));
    const image=document.createElement('img');image.alt='';image.loading='lazy';image.src=pageUrl(i);
    const caption=document.createElement('span');caption.textContent=i===0?'Portada':'Página '+(i+1);
    btn.append(image,caption);
    btn.addEventListener('click',()=>{jumpTo(i);$('thumbnails').classList.add('hidden');$('thumbnailsButton').setAttribute('aria-expanded','false');});
    frag.appendChild(btn);
  }
  $('thumbnails').appendChild(frag);
  refresh();
}
async function initialize(){
  if(!/^[A-Za-z0-9_-]{40,80}$/.test(token)){
    status('El enlace de la revista no es válido.');return;
  }
  loading(true,'Abriendo revista…');
  try{
    const r=await fetch(API+'/api/view/'+encodeURIComponent(token),{
      headers:grant()?{'x-carezza-grant':grant()}:{},cache:'no-store'
    });
    const data=await r.json();
    if(!r.ok)throw Error(data.error||'Esta revista no está disponible.');
    document.title=data.title+' · Carezza Preview';
    $('title').textContent=data.title;
    $('subtitle').textContent=data.client_name?'Preparada para '+data.client_name:'Preparada con cariño por Carezza Creaciones';
    if(data.locked){
      locked=true;
      $('locked').classList.remove('hidden');
      $('viewerStage').classList.add('hidden');
      status('Acceso protegido por contraseña.');
      return;
    }
    if(!Number.isInteger(data.page_count)||data.page_count<1||data.page_count>60)throw Error('Cantidad de páginas no válida.');
    locked=false;
    total=data.page_count;current=0;
    imageTasks.clear();thumbsBuilt=false;
    $('thumbnails').replaceChildren();
    $('thumbnails').classList.add('hidden');
    $('locked').classList.add('hidden');
    $('viewerStage').classList.remove('hidden');
    const good=await Promise.all([0,...(total>1?[1]:[])].map(ensure));
    if(good.includes(false))throw Error('Las primeras páginas no pudieron cargarse. Revisa tu conexión.');
    render();warm(0);
    status('Visor 12 · Efecto 3D activo. Desliza para hojear tu revista.');
  }catch(err){
    console.error('Carezza Preview: error al abrir',err);
    status(err?.message||'No se pudo abrir la revista.');
  }finally{loading(false);}
}
$('prev').addEventListener('click',()=>void turn(-1));
$('next').addEventListener('click',()=>void turn(1));
$('pageSlider').addEventListener('change',e=>jumpTo(Number(e.target.value)-1));
$('thumbnailsButton').addEventListener('click',()=>{
  const open=$('thumbnails').classList.contains('hidden');
  if(open)showThumbs();
  $('thumbnails').classList.toggle('hidden',!open);
  $('thumbnailsButton').setAttribute('aria-expanded',String(open));
});
$('book').addEventListener('touchstart',e=>{
  const t=e.changedTouches[0];
  gesture={x:t.clientX,y:t.clientY,time:Date.now(),type:'touch'};
},{passive:true});
$('book').addEventListener('touchend',e=>{
  if(!gesture)return;
  const t=e.changedTouches[0],dx=t.clientX-gesture.x,dy=t.clientY-gesture.y;
  if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.2){
    lastTouch=Date.now();void turn(dx<0?1:-1);
  }
  gesture=null;
},{passive:true});
$('book').addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse')gesture={x:e.clientX,y:e.clientY,time:Date.now(),type:'mouse'};
});
$('book').addEventListener('pointerup',e=>{
  if(!gesture||gesture.type!=='mouse')return;
  const dx=e.clientX-gesture.x,rect=$('book').getBoundingClientRect();
  const x=(e.clientX-rect.left)/rect.width;
  if(Math.abs(dx)>30)void turn(dx<0?1:-1);
  else if(x>.72)void turn(1);
  else if(x<.28)void turn(-1);
  gesture=null;
});
$('book').addEventListener('click',e=>{
  if(Date.now()-lastTouch<650||busy||e.detail===0)return;
  // Mouse gestures are handled by pointerup; avoid double triggering.
});
let resizeTimer;
window.addEventListener('resize',()=>{
  if(!total||busy)return;
  if(Math.abs(window.innerWidth-previousWidth)<25)return;
  previousWidth=window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer=setTimeout(()=>{current=normalize(current);render();},120);
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!$('zoomOverlay').classList.contains('hidden')){closeZoom();return;}
  if(!$('zoomOverlay').classList.contains('hidden'))return;
  if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
  if(e.key==='ArrowRight'){e.preventDefault();void turn(1);}
  else if(e.key==='ArrowLeft'){e.preventDefault();void turn(-1);}
});
function applyZoom(){
  if(!zoomBase)return;
  $('zoomImage').style.width=Math.round(zoomBase*zoomFactor)+'px';
  $('zoomLevel').textContent=Math.round(zoomFactor*100)+' %';
  $('zoomIn').disabled=zoomFactor>=4;
  $('zoomOut').disabled=zoomFactor<=1;
}
$('zoomImage').addEventListener('load',()=>{
  const img=$('zoomImage');if(!img.naturalWidth||!img.naturalHeight)return;
  zoomBase=img.naturalWidth*Math.min((window.innerWidth-42)/img.naturalWidth,(window.innerHeight-160)/img.naturalHeight,1);
  zoomFactor=1;applyZoom();
});
$('zoomButton').addEventListener('click',async()=>{
  if(!total)return;
  if(document.fullscreenElement)try{await document.exitFullscreen();}catch(_){}
  lastFocus=document.activeElement;zoomFactor=1;zoomBase=0;
  $('zoomImage').src=pageUrl(mobile()?current:(spread().right>=0?spread().right:current));
  $('zoomOverlay').classList.remove('hidden');
  document.body.classList.add('zoom-open');
  $('zoomOverlay').focus();
});
function closeZoom(){
  $('zoomOverlay').classList.add('hidden');
  document.body.classList.remove('zoom-open');
  $('zoomImage').removeAttribute('src');
  $('zoomImage').style.width='';zoomBase=0;
  lastFocus?.focus?.();
}
$('zoomIn').addEventListener('click',()=>{zoomFactor=Math.min(4,zoomFactor+.5);applyZoom();});
$('zoomOut').addEventListener('click',()=>{zoomFactor=Math.max(1,zoomFactor-.5);applyZoom();});
$('closeZoom').addEventListener('click',closeZoom);
$('zoomOverlay').addEventListener('click',e=>{if(e.target===$('zoomOverlay'))closeZoom();});
$('fullscreenButton').addEventListener('click',async()=>{
  try{
    if(document.fullscreenElement)await document.exitFullscreen();
    else if($('viewerStage').requestFullscreen)await $('viewerStage').requestFullscreen();
    else status('Pantalla completa no disponible en este navegador.');
  }catch(_){status('El navegador no permitió pantalla completa.');}
});
document.addEventListener('contextmenu',e=>{
  if(e.target.closest?.('#viewerStage,#zoomOverlay'))e.preventDefault();
});
$('unlockForm').addEventListener('submit',async e=>{
  e.preventDefault();$('unlockButton').disabled=true;
  $('unlockStatus').textContent='Verificando contraseña…';
  try{
    const r=await fetch(API+'/api/unlock/'+encodeURIComponent(token),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({password:$('viewPassword').value})
    });
    const data=await r.json();
    if(!r.ok)throw Error(data.error||'Contraseña incorrecta.');
    if(!data.grant)throw Error('No llegó la autorización.');
    setGrant(data.grant);$('viewPassword').value='';$('unlockStatus').textContent='';
    await initialize();
  }catch(err){$('unlockStatus').textContent=err?.message||'No se pudo comprobar el acceso.';}
  finally{$('unlockButton').disabled=false;}
});
initialize();