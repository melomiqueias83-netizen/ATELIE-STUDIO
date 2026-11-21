import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import fs from 'fs';
import JSZip from 'jszip';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_EMAIL = 'miqueiasmelouber@gmail.com';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY não configurada. Adicione sua chave no painel Settings > Secrets para ativar os recursos de IA.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseJsonSafe<T>(raw: string | undefined, fallbackMsg: string): T {
  if (!raw) {
    throw new Error(fallbackMsg);
  }
  const trimmed = raw.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  return JSON.parse(trimmed) as T;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      hasGeminiKey: Boolean(
        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
      ),
    });
  });

  // Admin-only full source & domain guide ZIP bundle export
  app.get('/api/admin/export-bundle', async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!idToken) {
        res.status(401).json({ error: 'Token de autenticação ausente.' });
        return;
      }

      const firebaseCfgRaw = fs.readFileSync(
        path.join(__dirname, 'firebase-applet-config.json'),
        'utf8'
      );
      const firebaseCfg = JSON.parse(firebaseCfgRaw) as { apiKey?: string };
      if (!firebaseCfg.apiKey) {
        res.status(500).json({ error: 'Configuração do Firebase ausente.' });
        return;
      }

      const verifyResp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(
          firebaseCfg.apiKey
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        }
      );

      if (!verifyResp.ok) {
        res.status(401).json({ error: 'Sessão Google inválida ou expirada.' });
        return;
      }

      const verifyData = (await verifyResp.json()) as {
        users?: Array<{ email?: string; emailVerified?: boolean }>;
      };
      const verifiedUser = verifyData.users?.[0];
      if (
        !verifiedUser ||
        !verifiedUser.emailVerified ||
        verifiedUser.email?.toLowerCase() !== ADMIN_EMAIL
      ) {
        res.status(403).json({ error: 'Acesso restrito ao administrador.' });
        return;
      }

      const zip = new JSZip();
      const skipDirs = new Set(['node_modules', 'dist', '.git', 'build', 'coverage']);

      const addDirectoryToZip = (dirPath: string, relBase: string) => {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (skipDirs.has(entry.name)) continue;
            const nextRel = relBase ? `${relBase}/${entry.name}` : entry.name;
            addDirectoryToZip(path.join(dirPath, entry.name), nextRel);
          } else if (entry.isFile()) {
            const isEnvSecret =
              entry.name.startsWith('.env') && entry.name !== '.env.example';
            if (
              isEnvSecret ||
              entry.name === '.DS_Store' ||
              entry.name.endsWith('.zip') ||
              entry.name.endsWith('.log')
            ) {
              continue;
            }
            const fileRel = relBase ? `${relBase}/${entry.name}` : entry.name;
            const fileBuf = fs.readFileSync(path.join(dirPath, entry.name));
            zip.file(fileRel, fileBuf);
          }
        }
      };

      addDirectoryToZip(__dirname, '');

      const zipBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="atelier-club-completo.zip"'
      );
      res.send(zipBuffer);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao gerar pacote ZIP.';
      console.error('Error /api/admin/export-bundle:', err);
      res.status(500).json({ error: message });
    }
  });

  // 1. AI Editable Template Generator (gemini-4-hydrogen)
  app.post('/api/ai/generate-template', async (req, res) => {
    try {
      const { prompt, category = 'Editorial', aspectRatio = 'ig-portrait-4-5', mood = 'Estúdio Quente' } =
        req.body ?? {};
      if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 2) {
        res.status(400).json({ error: 'Descreva o modelo que deseja criar.' });
        return;
      }

      const ai = getGeminiClient();

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Crie um modelo gráfico editável completo em camadas para o app Atelier Club (em Português do Brasil).
Prompt do usuário: "${prompt.trim()}"
Categoria: ${category}
Proporção: ${aspectRatio}
Clima visual: ${mood}

Regras obrigatórias de design:
- Cores em hex válido (#RRGGBB) com contraste excelente entre fundo e textos.
- Gere entre 4 e 7 camadas editáveis (título principal impactante, subtítulo editorial, elemento geométrico ou arco/moldura de estúdio, linha divisória, crédito/chamada discreta).
- Coordenadas x, y, width, height são percentuais de 0 a 100 dentro da prancheta, bem equilibrados para não cortar texto nas bordas (margens entre 8% e 92%).
- O campo fontFamily deve ser exatamente um destes: "Outfit", "Cormorant Garamond", "Plus Jakarta Sans", "JetBrains Mono".
- O campo patternType deve ser exatamente um destes: "cyclorama", "mesh", "architectural", "silk", "botanical", "geometric", "horizon".
- Inclua legenda pronta e 5 hashtags em português para Instagram/Facebook.`,
        config: {
          systemInstruction:
            'Você é um diretor de arte editorial sênior especializado em layouts de estúdio, papéis de parede tipográficos e posts de alta conversão para Instagram e Facebook.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              category: { type: Type.STRING },
              background: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  patternType: { type: Type.STRING },
                  palette: {
                    type: Type.OBJECT,
                    properties: {
                      base: { type: Type.STRING },
                      mid: { type: Type.STRING },
                      highlight: { type: Type.STRING },
                      shadow: { type: Type.STRING },
                      accent: { type: Type.STRING },
                    },
                    required: ['base', 'mid', 'highlight', 'shadow', 'accent'],
                  },
                  lighting: {
                    type: Type.OBJECT,
                    properties: {
                      angle: { type: Type.NUMBER },
                      intensity: { type: Type.NUMBER },
                      softness: { type: Type.NUMBER },
                      vignette: { type: Type.NUMBER },
                    },
                    required: ['angle', 'intensity', 'softness', 'vignette'],
                  },
                  texture: {
                    type: Type.OBJECT,
                    properties: {
                      grain: { type: Type.NUMBER },
                      blur: { type: Type.NUMBER },
                      bokehCount: { type: Type.NUMBER },
                    },
                    required: ['grain', 'blur', 'bokehCount'],
                  },
                },
                required: ['name', 'description', 'patternType', 'palette', 'lighting', 'texture'],
              },
              layers: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    kind: { type: Type.STRING },
                    name: { type: Type.STRING },
                    content: { type: Type.STRING },
                    x: { type: Type.NUMBER },
                    y: { type: Type.NUMBER },
                    width: { type: Type.NUMBER },
                    height: { type: Type.NUMBER },
                    rotation: { type: Type.NUMBER },
                    color: { type: Type.STRING },
                    opacity: { type: Type.NUMBER },
                    fontFamily: { type: Type.STRING },
                    fontSize: { type: Type.NUMBER },
                    fontWeight: { type: Type.STRING },
                    letterSpacing: { type: Type.NUMBER },
                    align: { type: Type.STRING },
                    shadow: { type: Type.BOOLEAN },
                    italic: { type: Type.BOOLEAN },
                    strokeOnly: { type: Type.BOOLEAN },
                  },
                  required: [
                    'id',
                    'kind',
                    'name',
                    'content',
                    'x',
                    'y',
                    'width',
                    'height',
                    'rotation',
                    'color',
                    'opacity',
                    'fontFamily',
                    'fontSize',
                    'fontWeight',
                    'letterSpacing',
                    'align',
                    'shadow',
                  ],
                },
              },
              socialCaption: { type: Type.STRING },
              hashtags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['title', 'category', 'background', 'layers', 'socialCaption', 'hashtags'],
          },
        },
      });

      const parsed = parseJsonSafe<Record<string, unknown>>(
        response.text,
        'A IA não retornou um modelo válido. Tente reformular a descrição.'
      );
      res.json({ template: parsed });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao gerar modelo com IA.';
      console.error('Error /api/ai/generate-template:', err);
      res.status(500).json({ error: message });
    }
  });

  // 2. AI Studio Background Creator (gemini-4-hydrogen)
  app.post('/api/ai/generate-background', async (req, res) => {
    try {
      const { prompt, style = 'Estúdio Fotográfico', lightingMood = 'Luz Dourada Lateral' } =
        req.body ?? {};
      if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 2) {
        res.status(400).json({ error: 'Descreva o plano de fundo desejado.' });
        return;
      }

      const ai = getGeminiClient();

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Crie uma receita de plano de fundo 4K estilo estúdio ou papel de parede artístico em Português do Brasil.
Descrição do usuário: "${prompt.trim()}"
Estilo desejado: ${style}
Iluminação: ${lightingMood}

Instruções:
- patternType deve ser exatamente um de: "cyclorama", "mesh", "architectural", "silk", "botanical", "geometric", "horizon".
- Todas as cores em hex válido (#RRGGBB).
- lighting.angle entre 0 e 360, intensity entre 20 e 95, softness entre 20 e 95, vignette entre 0 e 80.
- texture.grain entre 0 e 35, blur entre 0 e 25, bokehCount entre 0 e 30.
- Inclua socialCaption criativa e 5 hashtags.`,
        config: {
          systemInstruction:
            'Você é um especialista em iluminação de estúdio fotográfico, cenografia digital e papéis de parede minimalistas 4K.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              description: { type: Type.STRING },
              patternType: { type: Type.STRING },
              palette: {
                type: Type.OBJECT,
                properties: {
                  base: { type: Type.STRING },
                  mid: { type: Type.STRING },
                  highlight: { type: Type.STRING },
                  shadow: { type: Type.STRING },
                  accent: { type: Type.STRING },
                },
                required: ['base', 'mid', 'highlight', 'shadow', 'accent'],
              },
              lighting: {
                type: Type.OBJECT,
                properties: {
                  angle: { type: Type.NUMBER },
                  intensity: { type: Type.NUMBER },
                  softness: { type: Type.NUMBER },
                  vignette: { type: Type.NUMBER },
                },
                required: ['angle', 'intensity', 'softness', 'vignette'],
              },
              texture: {
                type: Type.OBJECT,
                properties: {
                  grain: { type: Type.NUMBER },
                  blur: { type: Type.NUMBER },
                  bokehCount: { type: Type.NUMBER },
                },
                required: ['grain', 'blur', 'bokehCount'],
              },
              socialCaption: { type: Type.STRING },
              hashtags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              'id',
              'name',
              'description',
              'patternType',
              'palette',
              'lighting',
              'texture',
              'socialCaption',
              'hashtags',
            ],
          },
        },
      });

      const parsed = parseJsonSafe<Record<string, unknown>>(
        response.text,
        'Não foi possível gerar a receita de plano de fundo.'
      );
      res.json({ background: parsed });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao criar plano de fundo.';
      console.error('Error /api/ai/generate-background:', err);
      res.status(500).json({ error: message });
    }
  });

  // 3. Multimodal Studio Photo Analyzer (gemini-4-hydrogen)
  app.post('/api/ai/analyze-photo', async (req, res) => {
    try {
      const { imageBase64, mimeType = 'image/jpeg', targetBackdropName = 'Estúdio Editorial' } =
        req.body ?? {};
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({ error: 'Envie uma imagem válida para análise.' });
        return;
      }

      const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
      const ai = getGeminiClient();

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
            {
              text: `Analise esta foto para recorte do sujeito principal e inserção em um plano de fundo estilo estúdio ("${targetBackdropName}").
Responda em JSON:
- subjectDescription: descrição curta do sujeito e iluminação atual em português.
- recommendedCutoutMode: escolha "light-bg" se o fundo original for claro/neutro, "dark-bg" se for escuro, "chroma" se for colorido uniforme, ou "auto" se misto.
- suggestedColorMatch: ajustes numéricos suaves para integrar o sujeito ao estúdio (brightness: -25..25, contrast: -20..30, warmth: -25..25, saturation: -30..30, rimLightColor: hex #RRGGBB harmonioso, rimLightIntensity: 15..75, contactShadowOpacity: 35..80).
- suggestedStudioPrompt: sugestão de prompt de fundo de estúdio ideal para esta foto.
- socialCaption: legenda elegante em português para postar no Instagram/Facebook.
- hashtags: 5 hashtags relevantes.`,
            },
          ],
        },
        config: {
          systemInstruction:
            'Você é um retocador fotográfico de estúdio e colorista sênior. Avalie iluminação, contraste e tonalidade de pele/objeto com precisão técnica.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subjectDescription: { type: Type.STRING },
              recommendedCutoutMode: { type: Type.STRING },
              suggestedColorMatch: {
                type: Type.OBJECT,
                properties: {
                  brightness: { type: Type.NUMBER },
                  contrast: { type: Type.NUMBER },
                  warmth: { type: Type.NUMBER },
                  saturation: { type: Type.NUMBER },
                  rimLightColor: { type: Type.STRING },
                  rimLightIntensity: { type: Type.NUMBER },
                  contactShadowOpacity: { type: Type.NUMBER },
                },
                required: [
                  'brightness',
                  'contrast',
                  'warmth',
                  'saturation',
                  'rimLightColor',
                  'rimLightIntensity',
                  'contactShadowOpacity',
                ],
              },
              suggestedStudioPrompt: { type: Type.STRING },
              socialCaption: { type: Type.STRING },
              hashtags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              'subjectDescription',
              'recommendedCutoutMode',
              'suggestedColorMatch',
              'suggestedStudioPrompt',
              'socialCaption',
              'hashtags',
            ],
          },
        },
      });

      const parsed = parseJsonSafe<Record<string, unknown>>(
        response.text,
        'Não foi possível analisar a fotografia.'
      );
      res.json({ analysis: parsed });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao analisar foto com IA.';
      console.error('Error /api/ai/analyze-photo:', err);
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found');
      }
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Atelier Club server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
