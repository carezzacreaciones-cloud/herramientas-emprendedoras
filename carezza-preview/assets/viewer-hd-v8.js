/* Carezza Preview · visor HD v8 · page-flip@2.0.7 (MIT) · HTML image pages */
'use strict';
const root = 'https://xytbrvqmdnjpqcttkave.supabase.co/functions/v1/carezza-preview';
const token = new URLSearchParams(location.search).get('token') || '';
const grantKey = 'carezza_grant_' + token;
const grant = () => sessionStorage.getItem(grantKey) || '';
const $ = id => document.getElementById(id);

let pageCount = 0;
let position = 0;
let flip = null;
let fallback = false;
let busy = false;
let thumbnailsBuilt = false;
let lastFocus = null;
let currentFlipOrientation = 'portrait';

function pageUrl(index) {
  if (!Number.isInteger(index) || index < 0 || index >= pageCount) return '';
  const base = root + '/api/page/' + encodeURIComponent(token) + '/' + (index + 1);
  return base + (grant() ? '?grant=' + encodeURIComponent(grant()) : '');
}

function setStatus(message) { $('status').textContent = message; }

function activePage() {
  if (flip && !fallback) {
    try { return Math.max(0, Math.min(pageCount - 1, flip.getCurrentPageIndex())); }
    catch (_) { return position; }
  }
  return position;
}
function updateControls() {
  if (!pageCount) return;
  position = activePage();
  const landscape = flip && !fallback && flip.getOrientation() === 'landscape';
  const end = (landscape && position > 0 && position < pageCount - 1)
    ? Math.min(pageCount, position + 2) : position + 1;
  $('counter').textContent = position === 0
    ? 'Portada · 1 de ' + pageCount
    : (end > position + 1 ? 'Páginas ' + (position + 1) + '–' + end : 'Página ' + (position + 1)) + ' de ' + pageCount;
  $('prev').disabled = position <= 0;
  $('next').disabled = position >= pageCount - 1;
  $('pageSlider').max = String(pageCount);
  $('pageSlider').value = String(position + 1);
  $('pageSlider').style.setProperty('--reading-progress', Math.round((position + 1) / pageCount * 100) + '%');
  for (const item of $('thumbnails').querySelectorAll('[data-page]')) {
    const selected = Number(item.dataset.page) === position;
    item.classList.toggle('is-current', selected);
    item.setAttribute('aria-current', selected ? 'page' : 'false');
  }
}

function renderFallback() {
  const desk = $('fallbackPages');
  desk.replaceChildren();
  const img = document.createElement('img');
  img.src = pageUrl(position);
  img.alt = 'Página ' + (position + 1) + ' de ' + pageCount;
  img.loading = 'eager';
  img.draggable = false;
  desk.appendChild(img);
  updateControls();
}
function ensureBookContainer() {
  let element = $('book');
  if (element) return element;
  element = document.createElement('div');
  element.id = 'book';
  element.className = 'premium-book';
  element.setAttribute('aria-label', 'Revista digital con páginas que se pasan');
  $('magazineDesk').insertBefore(element, $('fallbackPages'));
  return element;
}

function useFallback() {
  fallback = true;
  ensureBookContainer().classList.add('hidden');
  $('fallbackPages').classList.remove('hidden');
  $('magazineDesk').classList.add('simple-view');
  renderFallback();
  setStatus('Revista lista. Puedes navegar las páginas con los botones.');
}

function loadFlipLibrary() {
  if (window.St && window.St.PageFlip) return Promise.resolve(true);
  const sources = [
    'https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.browser.min.js',
    'https://unpkg.com/page-flip@2.0.7/dist/js/page-flip.browser.min.js'
  ];
  return new Promise(resolve => {
    let current = 0;
    const trySource = () => {
      if (current >= sources.length) { resolve(false); return; }
      const script = document.createElement('script');
      script.src = sources[current++];
      script.async = true;
      script.referrerPolicy = 'no-referrer';
      script.onload = () => { if (window.St && window.St.PageFlip) resolve(true); else { script.remove(); trySource(); } };
      script.onerror = () => { script.remove(); trySource(); };
      document.head.appendChild(script);
    };
    trySource();
  });
}

async function initializeMagazine() {
  const rememberedPage = flip ? flip.getCurrentPageIndex() : position;
  if (flip) {
    try { flip.destroy(); } catch (_) { /* already gone */ }
    flip = null;
  }
  ensureBookContainer();
  fallback = false;
  thumbnailsBuilt = false;
  $('thumbnails').replaceChildren();
  $('thumbnails').classList.add('hidden');
  $('thumbnailsButton').setAttribute('aria-expanded', 'false');
  $('book').replaceChildren();
  $('book').classList.remove('hidden');
  $('fallbackPages').classList.add('hidden');
  $('magazineDesk').classList.remove('simple-view');
  const available = await loadFlipLibrary();
  if (!available) { useFallback(); return; }
  try {
    const FlipClass = window.St.PageFlip;
    const phone = window.matchMedia('(max-width: 760px)').matches;
    const availableWidth = Math.max(170, ($('magazineDesk').clientWidth || window.innerWidth) - 24);
    const availableHeight = Math.max(250, Math.min(window.innerHeight * 0.67, 714));
    const narrowWidth = Math.floor(Math.min(availableWidth, availableHeight * 430 / 608));
    const narrowHeight = Math.floor(narrowWidth * 608 / 430);
    $('book').style.height = phone ? narrowHeight + 'px' : '';
    const settings = phone ? {
      width: narrowWidth, height: narrowHeight, size: 'fixed'
    } : {
      width: 430, height: 608, size: 'stretch',
      minWidth: 170, minHeight: 240,
      maxWidth: 505, maxHeight: 714
    };
    flip = new FlipClass($('book'), {
      ...settings,
      autoSize: false, showCover: true,
      drawShadow: true, maxShadowOpacity: 0.56,
      flippingTime: phone ? 650 : 820,
      usePortrait: true, mobileScrollSupport: true,
      swipeDistance: 32, disableFlipByClick: false,
      startPage: Math.max(0, Math.min(pageCount - 1, rememberedPage))
    });
    flip.on('flip', event => {
      if (typeof event.data === 'number') position = event.data;
      updateControls();
    });
    flip.on('changeOrientation', event => {
      currentFlipOrientation = event.data;
      updateControls();
    });
    flip.on('init', () => updateControls());
    // HTML pages preserve the original PNG in an <img>; the older image/canvas
    // renderer rasterized every page again at the low display resolution.
    const sheets = [];
    for (let index = 0; index < pageCount; index++) {
      const sheet = document.createElement('div');
      sheet.className = 'carezza-sheet';
      if (index === 0 || index === pageCount - 1) sheet.dataset.density = 'hard';

      const image = document.createElement('img');
      image.className = 'carezza-page-image';
      image.src = pageUrl(index);
      image.alt = 'Página ' + (index + 1) + ' de ' + pageCount;
      image.draggable = false;
      image.decoding = 'async';
      image.loading = index < 3 ? 'eager' : 'lazy';

      sheet.appendChild(image);
      $('book').appendChild(sheet);
      sheets.push(sheet);
    }
    flip.loadFromHTML(sheets);
    updateControls();
    setStatus('Revista lista · Pasa las páginas como si fuera un libro.');
  } catch (error) {
    console.error('El visor de revista no pudo iniciarse', error);
    if (flip) { try { flip.destroy(); } catch (_) {} flip = null; }
    ensureBookContainer();
    useFallback();
  }
}

async function fetchView() {
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) {
    setStatus('El enlace de esta revista no es válido.');
    return;
  }
  try {
    const r = await fetch(root + '/api/view/' + encodeURIComponent(token), {
      cache: 'no-store',
      headers: grant() ? {'x-carezza-grant': grant()} : {}
    });
    const data = await r.json();
    if (!r.ok) {
      $('locked').classList.add('hidden');
      $('viewerStage').classList.add('hidden');
      setStatus(data.error || 'Revista no disponible.');
      return;
    }
    document.title = data.title + ' · Carezza Preview';
    $('title').textContent = data.title;
    $('subtitle').textContent = data.client_name
      ? 'Preparado especialmente para ' + data.client_name
      : 'Un diseño especial de Carezza Creaciones';
    if (data.locked) {
      $('locked').classList.remove('hidden');
      $('viewerStage').classList.add('hidden');
      setStatus('Acceso protegido · Ingresa la contraseña.');
      return;
    }
    if (!Number.isInteger(data.page_count) || data.page_count < 1 || data.page_count > 60) {
      throw new Error('Número de páginas no válido.');
    }
    pageCount = data.page_count;
    $('locked').classList.add('hidden');
    $('viewerStage').classList.remove('hidden');
    setStatus('Preparando las páginas de tu revista…');
    await initializeMagazine();
  } catch (error) {
    setStatus('No se pudo cargar la revista: ' + error.message);
  }
}

function navigate(direction) {
  if (busy || !pageCount || !$('zoomOverlay').classList.contains('hidden')) return;
  if (flip && !fallback) {
    if (direction > 0) flip.flipNext('bottom');
    else flip.flipPrev('bottom');
    return;
  }
  const next = position + direction;
  if (next >= 0 && next < pageCount) {
    position = next;
    renderFallback();
  }
}

function jumpToPage(index) {
  if (index < 0 || index >= pageCount) return;
  if (flip && !fallback) {
    flip.turnToPage(index);
    position = flip.getCurrentPageIndex();
    updateControls();
  } else {
    position = index;
    renderFallback();
  }
}

function buildThumbnails() {
  if (thumbnailsBuilt) return;
  thumbnailsBuilt = true;
  const frag = document.createDocumentFragment();
  for (let index = 0; index < pageCount; index++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'thumb';
    button.dataset.page = String(index);
    button.setAttribute('aria-label', 'Ir a página ' + (index + 1));
    const image = document.createElement('img');
    image.loading = 'lazy';
    image.decoding = 'async';
    image.alt = '';
    image.draggable = false;
    image.src = pageUrl(index);
    const label = document.createElement('span');
    label.textContent = index === 0 ? 'Portada' : 'Página ' + (index + 1);
    button.append(image, label);
    button.addEventListener('click', () => {
      jumpToPage(index);
      $('thumbnails').classList.add('hidden');
      $('thumbnailsButton').setAttribute('aria-expanded', 'false');
    });
    frag.appendChild(button);
  }
  $('thumbnails').appendChild(frag);
  updateControls();
}

$('prev').addEventListener('click', () => navigate(-1));
$('next').addEventListener('click', () => navigate(1));
$('pageSlider').addEventListener('change', event => jumpToPage(Number(event.target.value) - 1));
$('thumbnailsButton').addEventListener('click', () => {
  const opening = $('thumbnails').classList.contains('hidden');
  if (opening) buildThumbnails();
  $('thumbnails').classList.toggle('hidden', !opening);
  $('thumbnailsButton').setAttribute('aria-expanded', String(opening));
});
let zoomFactor = 1;
let zoomBaseWidth = 0;
function renderZoom() {
  if (!zoomBaseWidth) return;
  $('zoomImage').style.width = Math.round(zoomBaseWidth * zoomFactor) + 'px';
  $('zoomLevel').textContent = Math.round(zoomFactor * 100) + ' %';
  $('zoomOut').disabled = zoomFactor <= 1;
  $('zoomIn').disabled = zoomFactor >= 4;
}
$('zoomImage').addEventListener('load', () => {
  const image = $('zoomImage');
  if (!image.naturalWidth || !image.naturalHeight) return;
  const scale = Math.min(
    (window.innerWidth - 52) / image.naturalWidth,
    (window.innerHeight - 170) / image.naturalHeight,
    1
  );
  zoomBaseWidth = image.naturalWidth * scale;
  zoomFactor = 1;
  renderZoom();
});
$('zoomIn').addEventListener('click', () => {
  zoomFactor = Math.min(4, zoomFactor + 0.5);
  renderZoom();
});
$('zoomOut').addEventListener('click', () => {
  zoomFactor = Math.max(1, zoomFactor - 0.5);
  renderZoom();
});
$('zoomButton').addEventListener('click', async () => {
  if (!pageCount) return;
  if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch (_) {} }
  lastFocus = document.activeElement;
  zoomFactor = 1;
  zoomBaseWidth = 0;
  $('zoomImage').src = pageUrl(activePage());
  $('zoomOverlay').classList.remove('hidden');
  document.body.classList.add('zoom-open');
  $('zoomOverlay').focus();
});
function closeZoom() {
  $('zoomOverlay').classList.add('hidden');
  document.body.classList.remove('zoom-open');
  $('zoomImage').removeAttribute('src');
  $('zoomImage').style.width = '';
  zoomBaseWidth = 0;
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
$('closeZoom').addEventListener('click', closeZoom);
$('zoomOverlay').addEventListener('click', event => {
  if (event.target === $('zoomOverlay')) closeZoom();
});
$('fullscreenButton').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if ($('viewerStage').requestFullscreen) await $('viewerStage').requestFullscreen();
    else setStatus('Tu navegador no ofrece pantalla completa.');
  } catch (_) { setStatus('El navegador no permitió activar pantalla completa.'); }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('zoomOverlay').classList.contains('hidden')) {
    closeZoom(); return;
  }
  if (!$('zoomOverlay').classList.contains('hidden')) return;
  const tag = document.activeElement?.tagName;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
  if (event.key === 'ArrowLeft') { event.preventDefault(); navigate(-1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); navigate(1); }
});
let touchStartX = 0;
$('fallbackPages').addEventListener('touchstart', event => {
  touchStartX = event.changedTouches[0].screenX;
}, {passive:true});
$('fallbackPages').addEventListener('touchend', event => {
  const dx = event.changedTouches[0].screenX - touchStartX;
  if (Math.abs(dx) > 55) navigate(dx < 0 ? 1 : -1);
}, {passive:true});
// La orientación del teléfono cambia el ancho de las páginas; conservar la posición de lectura.
let knownScreenWidth = window.innerWidth;
let resizeHandle;
window.addEventListener('resize', () => {
  if (!pageCount || !flip || fallback || $('viewerStage').classList.contains('hidden')) return;
  const newWidth = window.innerWidth;
  if (Math.abs(newWidth - knownScreenWidth) < 28) return;
  knownScreenWidth = newWidth;
  clearTimeout(resizeHandle);
  resizeHandle = setTimeout(() => initializeMagazine(), 180);
});
document.addEventListener('contextmenu', event => {
  if (event.target.closest('#viewerStage,#zoomOverlay')) event.preventDefault();
});
$('unlockForm').addEventListener('submit', async event => {
  event.preventDefault();
  $('unlockButton').disabled = true;
  $('unlockStatus').textContent = 'Verificando contraseña…';
  try {
    const response = await fetch(root + '/api/unlock/' + encodeURIComponent(token), {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({password:$('viewPassword').value})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Contraseña incorrecta');
    if (!data.grant) throw new Error('No se recibió autorización.');
    sessionStorage.setItem(grantKey, data.grant);
    $('unlockStatus').textContent = 'Acceso autorizado';
    $('viewPassword').value = '';
    await fetchView();
  } catch (error) {
    $('unlockStatus').textContent = error.message;
  } finally {
    $('unlockButton').disabled = false;
  }
});
fetchView();