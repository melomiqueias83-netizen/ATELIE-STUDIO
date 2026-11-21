import React, { useEffect, useRef } from 'react';
import { renderBackgroundToCanvas, renderTemplateLayersToCanvas } from '../lib/studioRenderer';
import { StudioBackgroundRecipe, TemplateLayer } from '../types/studio';

interface ProceduralBackdropPreviewProps {
  recipe: StudioBackgroundRecipe;
  layers?: TemplateLayer[];
  width?: number;
  height?: number;
  className?: string;
}

export const ProceduralBackdropPreview: React.FC<ProceduralBackdropPreviewProps> = ({
  recipe,
  layers,
  width = 540,
  height = 960,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let active = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderBackgroundToCanvas(ctx, width, height, recipe).then(() => {
      if (!active) return;
      if (layers && layers.length > 0) {
        renderTemplateLayersToCanvas(ctx, width, height, layers, null);
      }
    });

    return () => {
      active = false;
    };
  }, [recipe, layers, width, height]);

  return <canvas ref={canvasRef} className={className} />;
};
