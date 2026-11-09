import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
const root='https://xytbrvqmdnjpqcttkave.supabase.co/functions/v1/carezza-preview';
const viewerUrl = token => new URL('viewer.html?token='+encodeURIComponent(token),location.href).href;
const $=id=>document.getElementById(id);
let sb, user, busy=false;
function say(message, error=false){$('message').textContent=message;$('message').className=error?'err':'ok'}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function init(){try{const c=await (await fetch(root+'/api/config')).json();sb=createClient(c.url,c.key); const {data}=await sb.auth.getUser(); user=data.user; show(); sb.auth.onAuthStateChange((_ev,s)=>{user=s?.user??null;show()})}catch(e){say('No se pudo conectar: '+e.message,true)}}
function show(){$('login').classList.toggle('hidden',!!user);$('dashboard').classList.toggle('hidden',!user);$('logout').classList.toggle('hidden',!user);if(user)list();}
async function api(path,method='GET',body){const {data:{session}}=await sb.auth.getSession();if(!session)throw Error('Inicia sesión nuevamente');const r=await fetch(root+'/api/'+path,{method,headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},body:body?JSON.stringify(body):undefined});const out=await r.json();if(!r.ok)throw Error(out.error||'Error de servidor');return out}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();say('Verificando acceso...');const {error}=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('loginPass').value});if(error)say(error.message,true);else say('Bienvenida a Carezza Preview')});
$('logout').addEventListener('click',()=>sb.auth.signOut());
$('pdf').addEventListener('change',()=>{$('selectedFile').textContent=$('pdf').files[0]?.name||'Selecciona tu archivo PDF'});
$('refresh').addEventListener('click',()=>list());
async function list(){try{const data=await api('list');const el=$('previews');if(!data.items.length){el.innerHTML='<p class="small">Todavía no tienes revistas. ¡Crea la primera!</p>';return}el.innerHTML=data.items.map(p=>{const off=p.revoked_at||new Date(p.expires_at)<new Date();const ready=p.status==='ready';const url=viewerUrl(p.share_token);return '<div class="item"><div class="itemtop"><div><h3>'+esc(p.title)+'</h3><p>'+esc(p.client_name||'Sin destinatario')+' · '+p.page_count+' páginas · vence '+new Date(p.expires_at).toLocaleDateString('es-CL')+'</p></div><span class="state '+(off?'off':'')+'">'+(off?'Inactiva':ready?'Activa':'Cargando')+'</span></div><div class="actions">'+(ready&&!off?'<button class="btn mini subtle" data-copy="'+esc(url)+'">Copiar enlace</button><a class="btn mini subtle" target="_blank" rel="noreferrer" href="'+esc(url)+'">Ver revista</a>':'')+(!off?'<button class="btn mini danger" data-revoke="'+p.id+'">Revocar</button>':'')+'</div></div>'}).join('');el.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',()=>navigator.clipboard.writeText(b.dataset.copy).then(()=>say('¡Enlace copiado!'))));el.querySelectorAll('[data-revoke]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('¿Desactivar esta vista previa? El cliente perderá acceso.'))return;try{await api('revoke/'+b.dataset.revoke,'POST');say('Enlace revocado');await list()}catch(e){say(e.message,true)}}))}catch(e){say(e.message,true)}}
$('uploadForm').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;const file=$('pdf').files[0];if(!file){say('Elige un archivo PDF',true);return}if(file.size>20*1024*1024){say('El PDF no debe superar los 20 MB',true);return}const title=$('title').value.trim(),client=$('client').value.trim(),password=$('password').value;if(!title){say('Indica un título',true);return}if(password&&password.length<12){say('La contraseña debe tener mínimo 12 caracteres',true);return}busy=true;$('generate').disabled=true;$('progressBox').classList.remove('hidden');try{say('Leyendo PDF únicamente en este dispositivo…'); const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';const doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;if(doc.numPages<1 || doc.numPages>60)throw Error('El PDF debe tener entre 1 y 60 páginas.');const created=await api('create','POST',{title,client_name:client,page_count:doc.numPages,days:Number($('days').value),password});const renderModule=await import('./preview-render-v7.js');
const prefix=user.id+'/'+created.id+'/';
for(let n=1;n<=doc.numPages;n++){
  $('current').textContent='Preparando página '+n+' de '+doc.numPages+' a 300 ppp…';
  const pdfPage=await doc.getPage(n);
  const png=await renderModule.renderProtectedPage(pdfPage,client);
  $('current').textContent='Subiendo página '+n+' de '+doc.numPages+'…';
  const pathname=prefix+'page-'+String(n).padStart(3,'0')+'.png';
  const {error:uploadError}=await sb.storage.from('carezza-preview-pages')
    .upload(pathname,png,{contentType:'image/png',cacheControl:'60',upsert:false});
  if(uploadError) throw Error('No se pudo subir la página '+n+': '+uploadError.message);
  $('bar').style.width=Math.round(n/doc.numPages*100)+'%';
}
await api('finalize/'+created.id,'POST');$('generatedUrl').value=created.url;$('share').classList.remove('hidden');$('shareOpen').href=created.url;say('¡Revista lista! Comparte el enlace con tu cliente.');$('uploadForm').reset();$('selectedFile').textContent='Selecciona tu archivo PDF';await list()}catch(e){console.error('Carezza Preview: error durante la conversión:',e);say('Error al procesar el PDF: '+(e?.message||String(e)),true)}finally{busy=false;$('generate').disabled=false}});
$('copyShare').addEventListener('click',()=>navigator.clipboard.writeText($('generatedUrl').value).then(()=>say('Enlace copiado')));
init();