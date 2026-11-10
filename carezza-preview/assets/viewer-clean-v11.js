/* Carezza Preview · visor de revista v11 (HTML flip real, motor StPageFlip local).
   Nunca entrega PDF; muestra PNG con marca de agua ya incrustada.
   No depende de CDN y no altera los archivos de las revistas existentes. */
'use strict';
const API = 'https://xytbrvqmdnjpqcttkave.supabase.co/functions/v1/carezza-preview';
const $ = id => document.getElementById(id);
const token = new URLSearchParams(location.search).get('token') || '';
const key = 'carezza_grant_' + token;
function readGrant() { try { return sessionStorage.getItem(key) || ''; } catch (_) { return ''; } }
function saveGrant(v) { try { sessionStorage.setItem(key,v); } catch (_) { temporaryGrant = v; } }
let temporaryGrant = '';
const grant = () => readGrant() || temporaryGrant;

let total = 0, page = 0, flip = null, fallback = false, initializing = false;
let loadingPage = false, motion = false, thumbsBuilt = false, resizeHandle = null;
let images = [], imageTasks = new Map();
let lastFocus = null, zoom = 1, zoomBase = 0;
const isPhone = () => window.matchMedia('(max-width:760px)').matches;
const status = message => { $('status').textContent = message; };
const badge = (show,text='Cargando hoja…') => {
  const b=$('loadingBadge');
  b.textContent = text;
  b.classList.toggle('hidden',!show);
  b.setAttribute('aria-hidden',show?'false':'true');
};
function pageUrl(index) {
  if (index<0 || index>=total) return '';
  const uri=API+'/api/page/'+encodeURIComponent(token)+'/'+(index+1);
  return uri+(grant()?'?grant='+encodeURIComponent(grant()):'');
}
function bookPage() {
  if (flip && !fallback) {
    try {return flip.getCurrentPageIndex();}catch(_){}
  }
  return page;
}
function clearReader() {
  if (flip) {
    try {flip.destroy();}catch(err){console.warn('PageFlip destroy',err);}
    flip=null;
  }
  const old=$('book');
  if (old) old.remove();
  const fresh=document.createElement('div');
  fresh.id='book';
  fresh.className='magazine-book';
  fresh.setAttribute('aria-label','Revista con páginas para hojear');
  $('magazineDesk').insertBefore(fresh,$('fallbackPages'));
  return fresh;
}
function controls() {
  if(!total)return;
  page=Math.min(total-1,Math.max(0,bookPage()));
  const spread = !initializing && flip && !fallback && flip.getOrientation()==='landscape';
  const last=spread && page>0 ? Math.min(total,page+2) : page+1;
  $('counter').textContent=page===0?'Portada · 1 de '+total:
    (last>page+1?'Páginas '+(page+1)+'–'+last:'Página '+(page+1))+' de '+total;
  $('prev').disabled=page===0;
  $('next').disabled=page>=total-1;
  $('pageSlider').max=String(total);
  $('pageSlider').value=String(page+1);
  $('pageSlider').style.setProperty('--reading-progress',Math.round((page+1)*100/total)+'%');
  for(const b of $('thumbnails').querySelectorAll('button[data-page]')){
    b.classList.toggle('is-current',Number(b.dataset.page)===page);
  }
}
function fallbackView(message) {
  fallback=true;motion=false;loadingPage=false;initializing=false;
  badge(false);
  if($('book'))$('book').classList.add('hidden');
  $('fallbackPages').classList.remove('hidden');
  status(message||'Modo lectura sin animación. Puedes usar las flechas para revisar las páginas.');
  fallbackRender();
}
function fallbackRender(){
  const img=document.createElement('img');
  img.src=pageUrl(page);
  img.alt='Página '+(page+1)+' de '+total;
  img.draggable=false;
  $('fallbackPages').replaceChildren(img);
  controls();
}
function ensureImage(index){
  if(index<0 || index>=total)return Promise.resolve(true);
  const img=images[index];
  if(!img) return Promise.resolve(false);
  if(imageTasks.has(index))return imageTasks.get(index);
  img.loading='eager';
  const uri=pageUrl(index);
  const result=new Promise(resolve=>{
    let done=false;
    const finish=ok=>{
      if(done)return;
      done=true;
      clearTimeout(timeout);
      img.removeEventListener('load',success);
      img.removeEventListener('error',failure);
      resolve(ok);
    };
    const success=()=>{
      if(img.decode){
        Promise.resolve(img.decode()).then(()=>finish(true),()=>finish(img.naturalWidth>0));
      }else finish(img.naturalWidth>0);
    };
    const failure=()=>finish(false);
    const timeout=setTimeout(()=>finish(img.complete && img.naturalWidth>0),15000);
    img.addEventListener('load',success);
    img.addEventListener('error',failure);
    if(!img.getAttribute('src'))img.src=uri;
    if(img.complete){
      if(img.naturalWidth>0)success();
      else if(img.getAttribute('src'))failure();
    }
  });
  imageTasks.set(index,result);
  result.then(ok=>{if(!ok)imageTasks.delete(index);});
  return result;
}
function warm(index) {
  // A diferencia de cargar 60 imágenes HD juntas, prepara solo las páginas próximas.
  const start=Math.max(0,index-1), end=Math.min(total-1,index+(isPhone()?2:3));
  for(let i=start;i<=end;i++) void ensureImage(i);
}
function createSheets(book) {
  images=[];imageTasks.clear();
  const sheets=[];
  for(let i=0;i<total;i++){
    const sheet=document.createElement('div');
    sheet.className='carezza-sheet';
    // La portada en escritorio es más firme; en móvil todas las hojas se curvan.
    if(!isPhone()&&(i===0||i===total-1))sheet.dataset.density='hard';
    const img=document.createElement('img');
    img.alt='Página '+(i+1)+' de '+total;
    img.draggable=false;
    img.decoding='async';
    img.loading='lazy';
    img.className='carezza-page-image';
    sheet.appendChild(img);
    book.appendChild(sheet);
    sheets.push(sheet);images.push(img);
  }
  return sheets;
}
async function initialize() {
  if(!total || initializing)return;
  const oldPage=bookPage();
  initializing=true;motion=false;loadingPage=false;badge(true,'Preparando revista digital…');
  const book=clearReader();
  fallback=false;thumbsBuilt=false;
  $('thumbnails').replaceChildren();
  $('thumbnails').classList.add('hidden');
  $('thumbnailsButton').setAttribute('aria-expanded','false');
  $('fallbackPages').classList.add('hidden');
  book.classList.remove('hidden');
  try {
    if(typeof window.St?.PageFlip!=='function'){
      fallbackView('No se cargó el motor de giro de hojas. Modo lectura disponible.');
      return;
    }
    const phone=isPhone();
    const desk=$('magazineDesk');
    const area=Math.max(200,(desk.clientWidth||window.innerWidth)-26);
    const maxHeight=Math.max(230,Math.min(window.innerHeight*(phone?.67:.73),740));
    const width=Math.floor(Math.min(area, maxHeight*430/608,phone?470:510));
    const height=Math.round(width*608/430);
    book.style.height=phone?height+'px':'';
    const config=phone
      ? {size:'fixed',width,height}
      : {size:'stretch',width:430,height:608,minWidth:190,minHeight:268,maxWidth:505,maxHeight:714};
    flip=new window.St.PageFlip(book,{
      ...config,autoSize:false,usePortrait:true,
      showCover:!phone,drawShadow:true,maxShadowOpacity:.65,
      flippingTime:phone?640:760,swipeDistance:30,
      mobileScrollSupport:true,showPageCorners:true,
      disableFlipByClick:false,startPage:Math.max(0,Math.min(total-1,oldPage))
    });
    flip.on('flip',e=>{
      if(typeof e.data==='number')page=e.data;
      warm(page);controls();
    });
    flip.on('changeOrientation',()=>controls());
    flip.on('changeState',e=>{motion=e.data==='flipping';});
    flip.on('init',()=>controls());
    const sheets=createSheets(book);
    // Cargar hojas iniciales antes de empezar para que no queden blancas.
    const initial=[oldPage,oldPage+1,...(phone?[]:[oldPage+2])].filter(i=>i<total);
    const ok=await Promise.all(initial.map(i=>ensureImage(i)));
    if(ok.includes(false)){
      fallbackView('Algunas imágenes no pudieron cargarse. Revisa la conexión y vuelve a abrir el enlace.');
      return;
    }
    flip.loadFromHTML(sheets);
    warm(oldPage);
    controls();
    badge(false);
    status('Efecto revista activo · Arrastra una esquina o desliza para pasar las hojas.');
  }catch(err){
    console.error('Carezza Preview v11: error en el motor de revista',err);
    fallbackView('No se pudo iniciar el efecto de hojas: '+(err?.message||String(err)));
  }finally {initializing=false;}
}
async function loadPreview(){
  if(!/^[A-Za-z0-9_-]{40,80}$/.test(token)){
    status('Este enlace de revista no es válido.');return;
  }
  try{
    const headers=grant()?{'x-carezza-grant':grant()}:{};
    const response=await fetch(API+'/api/view/'+encodeURIComponent(token),{headers,cache:'no-store'});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'Revista no disponible.');
    document.title=data.title+' · Carezza Preview';
    $('title').textContent=data.title;
    $('subtitle').textContent=data.client_name?'Preparado especialmente para '+data.client_name:'Preparado con cariño por Carezza Creaciones';
    if(data.locked){
      $('viewerStage').classList.add('hidden');
      $('locked').classList.remove('hidden');
      status('Acceso privado · Introduce la contraseña.');
      return;
    }
    if(!Number.isInteger(data.page_count)||data.page_count<1||data.page_count>60)throw Error('Cantidad de páginas no válida.');
    total=data.page_count;page=0;
    $('locked').classList.add('hidden');
    $('viewerStage').classList.remove('hidden');
    await initialize();
  }catch(err){
    $('viewerStage').classList.add('hidden');
    status(err?.message||'No se pudo abrir la revista.');
  }
}
async function navigate(delta){
  if(!total||initializing||loadingPage||motion||!$('zoomOverlay').classList.contains('hidden'))return;
  if(fallback||!flip){
    const next=page+delta;
    if(next>=0&&next<total){page=next;fallbackRender();}
    return;
  }
  const current=bookPage();
  const next=current+delta*(flip.getOrientation()==='portrait'?1:2);
  if(next<0||next>=total){
    if(delta>0&&current<total-1)flip.flipNext('bottom');
    return;
  }
  // Preparar las hojas del movimiento, sin ocultar el efecto 3D de la biblioteca.
  loadingPage=true;
  const targets=[next,Math.min(total-1,next+1)];
  if(targets.some(i=>!images[i]?.complete||!images[i]?.naturalWidth))badge(true,'Preparando hoja…');
  try{
    const ready=await Promise.all(targets.map(ensureImage));
    if(ready.includes(false)){
      status('No se pudo cargar la página. Revisa tu conexión e inténtalo de nuevo.');
      return;
    }
    if(delta>0)flip.flipNext('bottom');
    else flip.flipPrev('bottom');
    warm(next);
  }finally{loadingPage=false;badge(false);}
}
async function jumpTo(index){
  if(initializing||index<0||index>=total)return;
  if(fallback||!flip){page=index;fallbackRender();return;}
  badge(true,'Preparando página '+(index+1)+'…');
  try{
    await ensureImage(index);
    flip.turnToPage(index);
    page=flip.getCurrentPageIndex();
    warm(page);controls();
  }finally {badge(false);}
}
function thumbnails(){
  if(thumbsBuilt)return;
  thumbsBuilt=true;
  const frag=document.createDocumentFragment();
  for(let i=0;i<total;i++){
    const btn=document.createElement('button');
    btn.className='thumb';
    btn.type='button';
    btn.dataset.page=String(i);
    btn.setAttribute('aria-label','Ir a página '+(i+1));
    const img=document.createElement('img');
    img.alt='';img.loading='lazy';img.src=pageUrl(i);
    const txt=document.createElement('span');txt.textContent=i===0?'Portada':'Página '+(i+1);
    btn.append(img,txt);
    btn.addEventListener('click',()=>{
      void jumpTo(i);
      $('thumbnails').classList.add('hidden');
      $('thumbnailsButton').setAttribute('aria-expanded','false');
    });
    frag.appendChild(btn);
  }
  $('thumbnails').appendChild(frag);controls();
}
$('prev').addEventListener('click',()=>void navigate(-1));
$('next').addEventListener('click',()=>void navigate(1));
$('pageSlider').addEventListener('change',e=>void jumpTo(Number(e.target.value)-1));
$('thumbnailsButton').addEventListener('click',()=>{
  const opened=$('thumbnails').classList.contains('hidden');
  if(opened)thumbnails();
  $('thumbnails').classList.toggle('hidden',!opened);
  $('thumbnailsButton').setAttribute('aria-expanded',String(opened));
});
function applyZoom(){
  if(!zoomBase)return;
  $('zoomImage').style.width=Math.round(zoomBase*zoom)+'px';
  $('zoomLevel').textContent=Math.round(zoom*100)+' %';
  $('zoomIn').disabled=zoom>=4;
  $('zoomOut').disabled=zoom<=1;
}
$('zoomImage').addEventListener('load',()=>{
  const img=$('zoomImage');
  if(!img.naturalWidth||!img.naturalHeight)return;
  zoomBase=img.naturalWidth*Math.min((window.innerWidth-45)/img.naturalWidth,(window.innerHeight-170)/img.naturalHeight,1);
  zoom=1;applyZoom();
});
$('zoomButton').addEventListener('click',async()=>{
  if(!total)return;
  if(document.fullscreenElement)try{await document.exitFullscreen();}catch(_){}
  lastFocus=document.activeElement;zoom=1;zoomBase=0;
  $('zoomImage').src=pageUrl(bookPage());
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
$('zoomIn').addEventListener('click',()=>{zoom=Math.min(4,zoom+.5);applyZoom();});
$('zoomOut').addEventListener('click',()=>{zoom=Math.max(1,zoom-.5);applyZoom();});
$('closeZoom').addEventListener('click',closeZoom);
$('zoomOverlay').addEventListener('click',e=>{if(e.target===$('zoomOverlay'))closeZoom();});
$('fullscreenButton').addEventListener('click',async()=>{
  try{
    if(document.fullscreenElement)await document.exitFullscreen();
    else if($('viewerStage').requestFullscreen)await $('viewerStage').requestFullscreen();
    else status('Pantalla completa no disponible en este navegador.');
  }catch(_){status('El navegador no permitió pantalla completa.');}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!$('zoomOverlay').classList.contains('hidden')){closeZoom();return;}
  if(!$('zoomOverlay').classList.contains('hidden'))return;
  if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
  if(e.key==='ArrowRight'){e.preventDefault();void navigate(1);}
  if(e.key==='ArrowLeft'){e.preventDefault();void navigate(-1);}
});
let lastWidth=window.innerWidth;
window.addEventListener('resize',()=>{
  if(!total||fallback||!flip||initializing)return;
  const width=window.innerWidth;
  if(Math.abs(width-lastWidth)<35)return;
  lastWidth=width;
  clearTimeout(resizeHandle);
  resizeHandle=setTimeout(()=>void initialize(),240);
});
document.addEventListener('contextmenu',e=>{if(e.target.closest?.('#viewerStage,#zoomOverlay'))e.preventDefault();});
$('unlockForm').addEventListener('submit',async e=>{
  e.preventDefault();
  $('unlockButton').disabled=true;
  $('unlockStatus').textContent='Verificando acceso…';
  try{
    const response=await fetch(API+'/api/unlock/'+encodeURIComponent(token),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({password:$('viewPassword').value})
    });
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'Contraseña incorrecta.');
    if(!data.grant)throw Error('El servidor no devolvió la autorización.');
    saveGrant(data.grant);
    $('viewPassword').value='';
    $('unlockStatus').textContent='';
    await loadPreview();
  }catch(err){$('unlockStatus').textContent=err?.message||'No se pudo comprobar el acceso.';}
  finally{$('unlockButton').disabled=false;}
});
loadPreview();