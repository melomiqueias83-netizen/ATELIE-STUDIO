import {
  CutoutSettings,
  PhotoAdjustments,
  StudioBackgroundRecipe,
} from '../types/studio';
import { renderBackgroundToCanvas } from './studioRenderer';

/**
 * Computes an interactive alpha mask for a subject image based on border color sampling
 * combined with center-weighted saliency and optional manual brush overrides.
 */
export function buildSubjectCutoutCanvas(
  sourceImg: HTMLImageElement,
  cutout: CutoutSettings,
  manualMaskCanvas?: HTMLCanvasElement | null
): HTMLCanvasElement {
  const w = sourceImg.naturalWidth;
  const h = sourceImg.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.drawImage(sourceImg, 0, 0, w, h);
  if (!cutout.enabled) {
    return canvas;
  }

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Sample border pixels (top, left, right edges) to estimate background colors
  const samples: Array<[number, number, number]> = [];
  const stepX = Math.max(1, Math.floor(w / 32));
  const stepY = Math.max(1, Math.floor(h / 32));

  for (let x = 0; x < w; x += stepX) {
    const topIdx = (4 * w + x) * 4;
    samples.push([data[topIdx], data[topIdx + 1], data[topIdx + 2]]);
  }
  for (let y = 0; y < h * 0.75; y += stepY) {
    const leftIdx = (y * w + 4) * 4;
    const rightIdx = (y * w + Math.max(0, w - 5)) * 4;
    samples.push([data[leftIdx], data[leftIdx + 1], data[leftIdx + 2]]);
    samples.push([data[rightIdx], data[rightIdx + 1], data[rightIdx + 2]]);
  }

  // Median-like centroid of background samples
  let avgR = 0;
  let avgG = 0;
  let avgB = 0;
  for (const [r, g, b] of samples) {
    avgR += r;
    avgG += g;
    avgB += b;
  }
  avgR /= Math.max(1, samples.length);
  avgG /= Math.max(1, samples.length);
  avgB /= Math.max(1, samples.length);

  // Also grab manual brush mask if provided (R > 128 = force keep, B > 128 = force erase)
  let manualData: Uint8ClampedArray | null = null;
  if (manualMaskCanvas && manualMaskCanvas.width === w && manualMaskCanvas.height === h) {
    const mCtx = manualMaskCanvas.getContext('2d');
    if (mCtx) {
      manualData = mCtx.getImageData(0, 0, w, h).data;
    }
  }

  const maxDist = (cutout.tolerance / 100) * 195 + 12;
  const featherRange = Math.max(4, (cutout.feather / 25) * 60);
  const alphaMap = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const ny = (y / h - 0.54) * 2; // center of portrait slightly lower
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const idx = p * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const nx = (x / w - 0.5) * 2;
      const radialDist = Math.sqrt(nx * nx * 1.15 + ny * ny * 0.72);

      // Perceptual weighted color distance to sampled background
      const dr = r - avgR;
      const dg = g - avgG;
      const db = b - avgB;
      const colorDist = Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);

      // Mode weighting
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      let effectiveDist = colorDist;

      if (cutout.mode === 'light-bg') {
        const bgBias = Math.max(0, (luma - 145) * 0.32);
        effectiveDist = colorDist - bgBias * (radialDist > 0.62 ? 1.15 : 0.4);
      } else if (cutout.mode === 'dark-bg') {
        const darkBias = Math.max(0, (85 - luma) * 0.38);
        effectiveDist = colorDist - darkBias * (radialDist > 0.62 ? 1.15 : 0.4);
      } else if (cutout.mode === 'chroma') {
        // Pure color similarity
        effectiveDist = colorDist;
      } else {
        // Auto center-protected segmentation
        if (radialDist < 0.48) {
          effectiveDist += 28;
        }
      }

      let alpha = 1;
      if (effectiveDist < maxDist) {
        alpha = 0;
      } else if (effectiveDist < maxDist + featherRange) {
        alpha = (effectiveDist - maxDist) / featherRange;
      }

      // Apply manual brush overrides if drawn
      if (manualData) {
        const mKeep = manualData[idx + 1]; // green channel = restore subject
        const mErase = manualData[idx]; // red channel = erase bg
        const mAlpha = manualData[idx + 3];
        if (mAlpha > 30) {
          const strength = mAlpha / 255;
          if (mKeep > mErase) {
            alpha = Math.min(1, alpha + strength);
          } else {
            alpha = Math.max(0, alpha - strength);
          }
        }
      }

      alphaMap[p] = alpha;
    }
  }

  // Optional halo edge cleanup (slight alpha contraction + decontamination)
  const cleanupStrength = cutout.edgeCleanup / 100;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      let a = alphaMap[p];
      if (cleanupStrength > 0 && a > 0 && a < 1) {
        const neighborMin = Math.min(
          alphaMap[p - 1],
          alphaMap[p + 1],
          alphaMap[p - w],
          alphaMap[p + w]
        );
        a = a * (1 - cleanupStrength * 0.45) + neighborMin * (cleanupStrength * 0.45);
      }
      const idx = p * 4;
      data[idx + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);

      // Color spill decontamination on semi-transparent edges
      if (a > 0.05 && a < 0.85 && cleanupStrength > 0.15) {
        const spill = (1 - a) * cleanupStrength * 0.35;
        data[idx] = Math.max(0, Math.min(255, data[idx] - (avgR - 128) * spill));
        data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] - (avgG - 128) * spill));
        data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] - (avgB - 128) * spill));
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

export async function renderStudioComposite(
  targetCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  backdrop: StudioBackgroundRecipe,
  subjectCutoutCanvas: HTMLCanvasElement | null,
  adjustments: PhotoAdjustments
): Promise<void> {
  targetCanvas.width = width;
  targetCanvas.height = height;
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;

  // 1. Render customizable studio background
  await renderBackgroundToCanvas(ctx, width, height, backdrop);

  if (!subjectCutoutCanvas) return;

  // 2. Compute subject draw dimensions & placement
  const subRatio = subjectCutoutCanvas.width / subjectCutoutCanvas.height;
  const baseH = height * 0.88 * adjustments.subjectScale;
  const drawW = baseH * subRatio;
  const drawH = baseH;
  const drawX = width * 0.5 - drawW / 2 + (adjustments.subjectOffsetX / 100) * width;
  const drawY = height - drawH + (adjustments.subjectOffsetY / 100) * height;

  // 3. Studio floor contact shadow beneath subject
  if (adjustments.contactShadowOpacity > 0) {
    ctx.save();
    const shadowY = drawY + drawH * 0.96;
    const shadowRx = drawW * 0.36;
    const shadowRy = Math.max(12, drawH * 0.045);
    const contactGrad = ctx.createRadialGradient(
      drawX + drawW / 2,
      shadowY,
      0,
      drawX + drawW / 2,
      shadowY,
      shadowRx
    );
    const op = (adjustments.contactShadowOpacity / 100) * 0.7;
    contactGrad.addColorStop(0, `rgba(0,0,0,${op})`);
    contactGrad.addColorStop(0.6, `rgba(0,0,0,${op * 0.45})`);
    contactGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = contactGrad;
    ctx.beginPath();
    ctx.ellipse(drawX + drawW / 2, shadowY, shadowRx, shadowRy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 4. Prepare color-graded subject buffer
  const gradedCanvas = document.createElement('canvas');
  gradedCanvas.width = Math.max(1, Math.round(drawW));
  gradedCanvas.height = Math.max(1, Math.round(drawH));
  const gCtx = gradedCanvas.getContext('2d');
  if (!gCtx) return;

  const brightnessPct = 100 + adjustments.brightness;
  const contrastPct = 100 + adjustments.contrast;
  const saturatePct = 100 + adjustments.saturation;
  const sepiaPct = adjustments.warmth > 0 ? adjustments.warmth * 0.45 : 0;
  const hueRotate = adjustments.warmth < 0 ? adjustments.warmth * 0.35 : 0;

  gCtx.save();
  gCtx.filter = `brightness(${brightnessPct}%) contrast(${contrastPct}%) saturate(${saturatePct}%) sepia(${sepiaPct}%) hue-rotate(${hueRotate}deg)`;
  gCtx.drawImage(subjectCutoutCanvas, 0, 0, gradedCanvas.width, gradedCanvas.height);
  gCtx.restore();

  // 5. Optional Studio Rim Light Edge Glow
  if (adjustments.rimLightIntensity > 0) {
    const rimCanvas = document.createElement('canvas');
    rimCanvas.width = gradedCanvas.width;
    rimCanvas.height = gradedCanvas.height;
    const rCtx = rimCanvas.getContext('2d');
    if (rCtx) {
      rCtx.drawImage(subjectCutoutCanvas, 0, 0, rimCanvas.width, rimCanvas.height);
      rCtx.globalCompositeOperation = 'source-in';
      rCtx.fillStyle = adjustments.rimLightColor;
      rCtx.fillRect(0, 0, rimCanvas.width, rimCanvas.height);

      ctx.save();
      ctx.globalAlpha = (adjustments.rimLightIntensity / 100) * 0.55;
      ctx.filter = 'blur(8px)';
      ctx.drawImage(rimCanvas, drawX - 5, drawY - 3);
      ctx.restore();
    }
  }

  // 6. Ambient studio drop shadow + final subject composite
  ctx.save();
  if (adjustments.contactShadowOpacity > 0) {
    ctx.shadowColor = `rgba(0,0,0,${(adjustments.contactShadowOpacity / 100) * 0.55})`;
    ctx.shadowBlur = 32;
    ctx.shadowOffsetX = 14;
    ctx.shadowOffsetY = 18;
  }
  ctx.drawImage(gradedCanvas, drawX, drawY);
  ctx.restore();
}
