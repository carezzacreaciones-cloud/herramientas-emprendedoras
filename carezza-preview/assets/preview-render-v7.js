/**
 * Carezza Preview · conversor de vista previa v7.
 * Se procesa exclusivamente en el navegador. Nunca subimos el PDF original.
 * PNG a 300 ppp, sin reducción de resolución ni compresión con pérdida.
 */
export async function renderProtectedPage(pdfPage, clientName) {
  const viewport = pdfPage.getViewport({ scale: 300 / 72 });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error('El PDF tiene una página con dimensiones no válidas.');
  }
  // Prevenir fallos silenciosos del navegador si la página excede su límite de Canvas.
  if (width > 16384 || height > 16384 || width * height > 55000000) {
    throw new Error('La página es demasiado grande para renderizarla a 300 ppp en este navegador; no se redujo su calidad.');
  }

  const sheet = document.createElement('canvas');
  sheet.width = width;
  sheet.height = height;
  const graphics = sheet.getContext('2d', { alpha: false });
  if (!graphics) {
    sheet.width = 0;
    sheet.height = 0;
    throw new Error('El navegador no pudo iniciar el procesador de imágenes.');
  }

  try {
    graphics.fillStyle = '#ffffff';
    graphics.fillRect(0, 0, width, height);
    const renderTask = pdfPage.render({ canvasContext: graphics, viewport });
    await renderTask.promise;

    // Marca de agua permanente: parte de los propios píxeles de la imagen.
    const text = 'VISTA PREVIA · CAREZZA CREACIONES · ' + (clientName || 'CLIENTE');
    graphics.save();
    try {
      graphics.translate(width / 2, height / 2);
      graphics.rotate(-Math.PI / 5);
      graphics.textAlign = 'center';
      graphics.textBaseline = 'middle';
      graphics.font = '700 ' + Math.max(24, Math.round(width / 24)) + 'px sans-serif';
      const rowStep = Math.max(140, Math.round(height / 7));
      const colStep = Math.max(350, Math.round(width * 1.25));
      for (let y = -height * 1.5; y < height * 1.6; y += rowStep) {
        for (let x = -width * 1.6; x < width * 1.6; x += colStep) {
          graphics.fillStyle = 'rgba(255, 255, 255, 0.34)';
          graphics.fillText(text, x + 2, y + 2);
          graphics.fillStyle = 'rgba(84, 67, 110, 0.21)';
          graphics.fillText(text, x, y);
        }
      }
    } finally {
      graphics.restore();
    }

    const blob = await new Promise((resolve, reject) => {
      sheet.toBlob(result => {
        if (result && result.type === 'image/png') resolve(result);
        else reject(new Error('No se pudo crear el PNG sin pérdida de esta página.'));
      }, 'image/png');
    });
    if (blob.size > 45 * 1024 * 1024) {
      throw new Error('El PNG sin pérdida supera 45 MB. La imagen no se comprimió ni se redujo.');
    }
    return blob;
  } finally {
    sheet.width = 0;
    sheet.height = 0;
    pdfPage.cleanup?.();
  }
}
