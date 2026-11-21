import { StudioBackgroundRecipe, TemplateLayer } from '../types/studio';

const imageCache = new Map<string, HTMLImageElement>();

export function loadImageCached(url: string): Promise<HTMLImageElement> {
  const existing = imageCache.get(url);
  if (existing && existing.complete && existing.naturalWidth > 0) {
    return Promise.resolve(existing);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!url.startsWith('data:') && !url.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      imageCache.set(url, img);
      resolve(img);
    };
    img.onerror = (err) => reject(err);
    img.src = url;
  });
}

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) + 1;
}

export async function renderBackgroundToCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  recipe: StudioBackgroundRecipe
): Promise<void> {
  ctx.save();

  // If photographic backdrop URL is present, draw cover-fitted image first
  if (recipe.imageUrl) {
    try {
      const img = await loadImageCached(recipe.imageUrl);
      if (recipe.texture.blur > 0) {
        ctx.filter = `blur(${Math.round((recipe.texture.blur / 40) * 28)}px)`;
      }
      const imgRatio = img.naturalWidth / img.naturalHeight;
      const canvasRatio = width / height;
      let drawW = width;
      let drawH = height;
      let drawX = 0;
      let drawY = 0;

      if (imgRatio > canvasRatio) {
        drawH = height;
        drawW = height * imgRatio;
        drawX = (width - drawW) / 2;
      } else {
        drawW = width;
        drawH = width / imgRatio;
        drawY = (height - drawH) / 2;
      }
      // Overscan slightly when blurred to avoid transparent edges
      const pad = recipe.texture.blur > 0 ? 40 : 0;
      ctx.drawImage(img, drawX - pad, drawY - pad, drawW + pad * 2, drawH + pad * 2);
      ctx.filter = 'none';

      // Subtle tint/vignette over photo
      if (recipe.lighting.vignette > 0) {
        const vigGrad = ctx.createRadialGradient(
          width * 0.5,
          height * 0.45,
          width * 0.2,
          width * 0.5,
          height * 0.5,
          Math.max(width, height) * 0.75
        );
        vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vigGrad.addColorStop(1, `rgba(0,0,0,${(recipe.lighting.vignette / 100) * 0.72})`);
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.restore();
      return;
    } catch {
      // Fallback to procedural rendering below if image fails
    }
  }

  const { palette, lighting, texture, patternType } = recipe;
  const rand = seededRandom(hashString(recipe.id + recipe.patternType));

  // 1. Base gradient
  const rad = (lighting.angle * Math.PI) / 180;
  const cx = width * 0.5;
  const cy = height * 0.45;
  const r = Math.max(width, height) * 0.75;
  const baseGrad = ctx.createLinearGradient(
    cx - Math.cos(rad) * r,
    cy - Math.sin(rad) * r,
    cx + Math.cos(rad) * r,
    cy + Math.sin(rad) * r
  );
  baseGrad.addColorStop(0, palette.shadow);
  baseGrad.addColorStop(0.45, palette.base);
  baseGrad.addColorStop(1, palette.mid);
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, width, height);

  if (texture.blur > 0) {
    ctx.filter = `blur(${Math.round((texture.blur / 40) * 24)}px)`;
  }

  // 2. Pattern-specific studio artistry
  if (patternType === 'cyclorama') {
    // Seamless curved studio floor & softbox key light
    const floorY = height * 0.72;
    const floorGrad = ctx.createLinearGradient(0, floorY - height * 0.12, 0, height);
    floorGrad.addColorStop(0, 'rgba(0,0,0,0)');
    floorGrad.addColorStop(0.5, `${palette.shadow}66`);
    floorGrad.addColorStop(1, `${palette.shadow}CC`);
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, floorY - height * 0.12, width, height);

    const spotX = width * (0.5 + Math.cos(rad) * 0.22);
    const spotY = height * (0.36 + Math.sin(rad) * 0.14);
    const spot = ctx.createRadialGradient(
      spotX,
      spotY,
      width * 0.02,
      spotX,
      spotY,
      Math.max(width, height) * (0.35 + (lighting.softness / 100) * 0.4)
    );
    spot.addColorStop(0, `${palette.highlight}${Math.round((lighting.intensity / 100) * 190).toString(16).padStart(2, '0')}`);
    spot.addColorStop(0.5, `${palette.mid}55`);
    spot.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, width, height);
  } else if (patternType === 'mesh') {
    const blobs = [
      { x: 0.22, y: 0.28, c: palette.highlight, r: 0.55 },
      { x: 0.78, y: 0.35, c: palette.mid, r: 0.6 },
      { x: 0.55, y: 0.78, c: palette.accent, r: 0.45 },
    ];
    for (const b of blobs) {
      const g = ctx.createRadialGradient(
        width * b.x,
        height * b.y,
        0,
        width * b.x,
        height * b.y,
        Math.max(width, height) * b.r
      );
      g.addColorStop(0, `${b.c}88`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    }
  } else if (patternType === 'architectural') {
    // Diagonal window light beam & architectural shadow play
    ctx.save();
    ctx.translate(width * 0.5, height * 0.5);
    ctx.rotate(rad - Math.PI / 4);
    const beamGrad = ctx.createLinearGradient(-width * 0.5, -height, width * 0.5, height);
    beamGrad.addColorStop(0, 'rgba(0,0,0,0)');
    beamGrad.addColorStop(0.35, `${palette.highlight}35`);
    beamGrad.addColorStop(0.5, `${palette.highlight}60`);
    beamGrad.addColorStop(0.65, `${palette.highlight}20`);
    beamGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = beamGrad;
    ctx.fillRect(-width, -height * 0.28, width * 2, height * 0.56);

    // Subtle mullion shadow bars
    ctx.fillStyle = `${palette.shadow}66`;
    ctx.fillRect(-width, -height * 0.03, width * 2, height * 0.04);
    ctx.restore();
  } else if (patternType === 'silk') {
    // Layered organic flowing silk ribbons
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      const yOffset = height * (0.15 + i * 0.14);
      ctx.moveTo(-width * 0.1, yOffset);
      ctx.bezierCurveTo(
        width * 0.3,
        yOffset - height * (0.12 + (i % 2) * 0.08),
        width * 0.65,
        yOffset + height * (0.14 - (i % 2) * 0.05),
        width * 1.1,
        yOffset - height * 0.04
      );
      ctx.lineTo(width * 1.1, height * 1.1);
      ctx.lineTo(-width * 0.1, height * 1.1);
      ctx.closePath();
      const silkGrad = ctx.createLinearGradient(0, yOffset - height * 0.1, 0, yOffset + height * 0.35);
      silkGrad.addColorStop(0, i % 2 === 0 ? `${palette.highlight}44` : `${palette.accent}33`);
      silkGrad.addColorStop(0.4, `${palette.mid}88`);
      silkGrad.addColorStop(1, `${palette.shadow}CC`);
      ctx.fillStyle = silkGrad;
      ctx.fill();
    }
  } else if (patternType === 'botanical') {
    // Soft sun glow + delicate leaf silhouette shadows
    const sun = ctx.createRadialGradient(
      width * 0.78,
      height * 0.2,
      0,
      width * 0.78,
      height * 0.2,
      Math.max(width, height) * 0.7
    );
    sun.addColorStop(0, `${palette.highlight}66`);
    sun.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.fillStyle = `${palette.shadow}55`;
    for (let b = 0; b < 14; b++) {
      const lx = width * (0.1 + rand() * 0.75);
      const ly = height * (0.15 + rand() * 0.65);
      const lw = width * (0.04 + rand() * 0.07);
      const lh = lw * (2.2 + rand() * 1.2);
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(rand() * Math.PI);
      ctx.beginPath();
      ctx.ellipse(0, 0, lw, lh, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  } else if (patternType === 'geometric') {
    // Minimalist brutalist architectural monoliths
    ctx.save();
    const archW = width * 0.48;
    const archH = height * 0.56;
    const archX = width * 0.5 - archW / 2;
    const archY = height * 0.24;

    const archGrad = ctx.createLinearGradient(archX, archY, archX + archW, archY + archH);
    archGrad.addColorStop(0, `${palette.highlight}44`);
    archGrad.addColorStop(1, `${palette.shadow}99`);
    ctx.fillStyle = archGrad;
    ctx.beginPath();
    ctx.roundRect(archX, archY, archW, archH, [archW / 2, archW / 2, 0, 0]);
    ctx.fill();

    ctx.strokeStyle = `${palette.accent}55`;
    ctx.lineWidth = Math.max(2, width * 0.003);
    ctx.beginPath();
    ctx.arc(width * 0.5, height * 0.42, width * 0.18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (patternType === 'horizon') {
    // Atmospheric horizon band + distant ridgelines
    const hzY = height * 0.54;
    const skyGlow = ctx.createRadialGradient(
      width * 0.5,
      hzY,
      width * 0.02,
      width * 0.5,
      hzY,
      Math.max(width, height) * 0.55
    );
    skyGlow.addColorStop(0, `${palette.accent}CC`);
    skyGlow.addColorStop(0.35, `${palette.highlight}66`);
    skyGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = skyGlow;
    ctx.fillRect(0, 0, width, height);

    for (let layer = 0; layer < 4; layer++) {
      ctx.beginPath();
      const baseLy = hzY + layer * height * 0.08;
      ctx.moveTo(0, baseLy);
      for (let step = 0; step <= 10; step++) {
        const px = (width / 10) * step;
        const py = baseLy + Math.sin(step * 0.9 + layer * 1.7) * height * 0.035;
        ctx.lineTo(px, py);
      }
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fillStyle = layer === 3 ? palette.shadow : `${palette.base}${layer === 0 ? 'AA' : 'DD'}`;
      ctx.fill();
    }
  }

  ctx.filter = 'none';

  // 3. Soft studio bokeh orbs
  if (texture.bokehCount > 0) {
    for (let i = 0; i < texture.bokehCount; i++) {
      const bx = rand() * width;
      const by = rand() * height;
      const br = width * (0.015 + rand() * 0.06);
      const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      bg.addColorStop(0, `${palette.highlight}26`);
      bg.addColorStop(0.7, `${palette.accent}12`);
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 4. Studio Vignette
  if (lighting.vignette > 0) {
    const vig = ctx.createRadialGradient(
      width * 0.5,
      height * 0.48,
      width * 0.22,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.78
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(0,0,0,${(lighting.vignette / 100) * 0.75})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, width, height);
  }

  // 5. Fine analog film grain (fast procedural pattern)
  if (texture.grain > 0) {
    const tile = 128;
    const grainCanvas = document.createElement('canvas');
    grainCanvas.width = tile;
    grainCanvas.height = tile;
    const gCtx = grainCanvas.getContext('2d');
    if (gCtx) {
      const imgData = gCtx.createImageData(tile, tile);
      const data = imgData.data;
      const alpha = Math.min(48, Math.round((texture.grain / 60) * 42));
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.floor(rand() * 255);
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = alpha;
      }
      gCtx.putImageData(imgData, 0, 0);
      const pat = ctx.createPattern(grainCanvas, 'repeat');
      if (pat) {
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, width, height);
      }
    }
  }

  ctx.restore();
}

export function renderTemplateLayersToCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  layers: TemplateLayer[],
  selectedLayerId?: string | null
): void {
  const scaleFactor = width / 1080;

  for (const layer of layers) {
    ctx.save();
    const cx = (layer.x / 100) * width;
    const cy = (layer.y / 100) * height;
    const lw = (layer.width / 100) * width;
    const lh = (layer.height / 100) * height;

    ctx.translate(cx, cy);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));

    if (layer.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 18 * scaleFactor;
      ctx.shadowOffsetY = 6 * scaleFactor;
    }

    if (layer.kind === 'rect') {
      ctx.beginPath();
      ctx.roundRect(-lw / 2, -lh / 2, lw, lh, 18 * scaleFactor);
      if (layer.strokeOnly) {
        ctx.strokeStyle = layer.color;
        ctx.lineWidth = Math.max(2, 3 * scaleFactor);
        ctx.stroke();
      } else {
        ctx.fillStyle = layer.color;
        ctx.fill();
      }
    } else if (layer.kind === 'circle') {
      const rx = lw / 2;
      const ry = lh / 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      if (layer.strokeOnly) {
        ctx.strokeStyle = layer.color;
        ctx.lineWidth = Math.max(2, 3 * scaleFactor);
        ctx.stroke();
      } else {
        ctx.fillStyle = layer.color;
        ctx.fill();
      }
    } else if (layer.kind === 'arch') {
      const radius = Math.min(lw / 2, lh / 2);
      ctx.beginPath();
      ctx.roundRect(-lw / 2, -lh / 2, lw, lh, [radius, radius, 8 * scaleFactor, 8 * scaleFactor]);
      if (layer.strokeOnly) {
        ctx.strokeStyle = layer.color;
        ctx.lineWidth = Math.max(2, 3 * scaleFactor);
        ctx.stroke();
      } else {
        ctx.fillStyle = layer.color;
        ctx.fill();
      }
    } else if (layer.kind === 'line') {
      ctx.fillStyle = layer.color;
      ctx.fillRect(-lw / 2, -Math.max(1.5, lh * 0.25), lw, Math.max(2, 3 * scaleFactor));
    } else if (layer.kind === 'pill') {
      ctx.beginPath();
      ctx.roundRect(-lw / 2, -lh / 2, lw, lh, lh / 2);
      ctx.fillStyle = layer.color;
      ctx.fill();
    } else if (layer.kind === 'text') {
      const fontSize = Math.max(10, layer.fontSize * scaleFactor);
      const italic = layer.italic ? 'italic ' : '';
      ctx.font = `${italic}${layer.fontWeight} ${fontSize}px "${layer.fontFamily}", sans-serif`;
      ctx.fillStyle = layer.color;
      ctx.textAlign = layer.align;
      ctx.textBaseline = 'middle';

      const rawLines = layer.content.split('\n');
      const wrappedLines: string[] = [];

      for (const rawLine of rawLines) {
        const words = rawLine.split(' ');
        let current = '';
        for (const word of words) {
          const test = current ? `${current} ${word}` : word;
          if (ctx.measureText(test).width > lw && current) {
            wrappedLines.push(current);
            current = word;
          } else {
            current = test;
          }
        }
        if (current) wrappedLines.push(current);
      }

      const lineHeight = fontSize * 1.22;
      const totalH = wrappedLines.length * lineHeight;
      const startY = -totalH / 2 + lineHeight / 2;
      const anchorX =
        layer.align === 'left' ? -lw / 2 : layer.align === 'right' ? lw / 2 : 0;

      wrappedLines.forEach((line, idx) => {
        if (layer.letterSpacing > 0) {
          // Manual letter spacing rendering
          const chars = line.split('');
          const spacing = layer.letterSpacing * scaleFactor;
          const totalW =
            chars.reduce((acc, ch) => acc + ctx.measureText(ch).width, 0) +
            Math.max(0, chars.length - 1) * spacing;
          let curX =
            layer.align === 'left'
              ? -lw / 2
              : layer.align === 'right'
              ? lw / 2 - totalW
              : -totalW / 2;
          const savedAlign = ctx.textAlign;
          ctx.textAlign = 'left';
          for (const ch of chars) {
            ctx.fillText(ch, curX, startY + idx * lineHeight);
            curX += ctx.measureText(ch).width + spacing;
          }
          ctx.textAlign = savedAlign;
        } else {
          ctx.fillText(line, anchorX, startY + idx * lineHeight);
        }
      });
    }

    // Selection bounding indicator
    if (selectedLayerId && layer.id === selectedLayerId) {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#F2B705';
      ctx.lineWidth = Math.max(2, 2.5 * scaleFactor);
      ctx.setLineDash([8 * scaleFactor, 6 * scaleFactor]);
      ctx.strokeRect(-lw / 2 - 8, -lh / 2 - 8, lw + 16, lh + 16);
      ctx.setLineDash([]);
    }

    ctx.restore();
  }
}

export async function exportBackgroundRecipeAsDataUrl(
  recipe: StudioBackgroundRecipe,
  width: number,
  height: number,
  mimeType: 'image/png' | 'image/jpeg' = 'image/png'
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível.');
  await renderBackgroundToCanvas(ctx, width, height, recipe);
  return canvas.toDataURL(mimeType, 0.94);
}

export function triggerDataUrlDownload(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
