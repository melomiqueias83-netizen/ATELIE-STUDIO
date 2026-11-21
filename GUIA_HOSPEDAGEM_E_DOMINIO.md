# Atelier Club (Clube Ateliê) — Guia Completo de Hospedagem, Domínio e APK

## 1. Tudo o que está incluído neste pacote

### Frontend (`src/`)
- **Galeria de Papéis de Parede 4K (`WallpaperGalleryView.tsx`)**:
  - Catálogo editorial em 4K (9:16 celular e 16:9 desktop), filtros por categoria, barra de filtros rápidos (`Minimalista`, `Cinéfilo`, `Vintage`, `AMOLED`, `Arquitetônico`, `Solar`), busca e pré-visualização em mockup de celular/desktop.
- **Estúdio de Modelos Editáveis com IA (`TemplateStudioView.tsx`)**:
  - Geração de layouts em camadas por prompt (`POST /api/ai/generate-template`), edição de textos/formas/cores/fontes e exportação em PNG para Instagram, Stories, Feed 4:5 e Facebook.
- **Criador de Planos de Fundo com IA (`BackgroundCreatorView.tsx`)**:
  - Síntese de fundos de estúdio (`POST /api/ai/generate-background`) com controles de iluminação, textura, granulação e bokeh.
- **Estúdio Fotográfico (`PhotoStudioView.tsx`)**:
  - Recorte de sujeito, pincel manual de apagar/restaurar, ajuste de luz de recorte (*rim light*), sombra de contato e análise multimodal por IA (`POST /api/ai/analyze-photo`).
- **Coleção, Perfil, ZIP & Histórico de IA (`CollectionDrawer.tsx`)**:
  - Login com Google, favoritos, projetos sincronizados no Firestore, **download em lote de até 3 artes em `.zip`**, opt-in de notificações e **aba `Histórico`** com os últimos **10 prompts e resultados de IA** prontos para reutilização em 1 clique.
- **Central de Ajuda / FAQ (`FAQView.tsx`)**:
  - Aba `Ajuda` com perguntas frequentes sobre downloads, funcionamento gratuito da IA, uso comercial, proporções e histórico.
- **Doação Voluntária via PIX (`DeveloperDonationModal.tsx` + `pixPayload.ts`)**:
  - Opção após geração de imagem e no rodapé (R$ 0,99, R$ 4,99 ou valor livre >= R$ 0,99) com QR Code e marca Atelier Club no centro + PIX Copia e Cola.
- **Notificações Push FCM (`fcmMessaging.ts` + `public/firebase-messaging-sw.js` + `CollectionPushToast.tsx`)**:
  - Suporte a Firebase Cloud Messaging para alertar usuários sobre novas coleções 4K.
- **Painel Administrativo & Monetização (`AdminDashboardView.tsx` + `AdBannerSlot.tsx` + `admobBridge.ts`)**:
  - Acesso restrito ao Google verificado `miqueiasmelouber@gmail.com` com gestão de **Google AdSense (Web)**, **AdMob (Android)**, catálogo 4K, disparos Push FCM, configuração PIX e exportação do pacote `.zip`.

### Backend (`server.ts`) & Firebase
- Servidor Express + Vite (`server.ts`) com rotas protegidas de IA (`/api/ai/*`), healthcheck (`/api/health`) e exportação admin (`/api/admin/export-bundle`).
- Banco Firestore (`ai-studio-atelierclub-3612b4d8-972e-47d9-8fae-8492a09df822`) no projeto `halogen-tesla-6flln` com regras de segurança em `firestore.rules`.

---

## 2. Comandos Principais

```bash
# Instalar dependências
npm install

# Rodar em desenvolvimento local (porta 3000)
npm run dev

# Verificar tipos TypeScript
npm run lint

# Gerar build de produção (pasta dist/)
npm run build

# Iniciar servidor de produção (Render / Cloud Run / VPS)
npm run start
```

---

## 3. Passo a Passo para Hospedar Gratuitamente (Render.com)

1. **Crie uma conta no GitHub** (`github.com`) e envie todos os arquivos extraídos deste `.zip` para um repositório (ex.: `atelier-club`).
2. **Gere sua chave gratuita da API Gemini**:
   - Acesse `https://aistudio.google.com/apikey` → **Create API key** → copie a chave.
3. **Crie o Web Service no Render** (`render.com`):
   - Clique em **New + → Web Service** e conecte seu repositório do GitHub.
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
   - **Instance Type**: `Free`
4. **Configure as Variáveis de Ambiente (`Environment`) no Render**:
   - `GEMINI_API_KEY` = *(sua chave da API Gemini)*
   - `NODE_ENV` = `production`
   - `APP_URL` = *(URL gerada pelo Render, ex.: `https://atelier-club.onrender.com`)*
5. **Autorize o domínio no Firebase (Obrigatório para Login Google)**:
   - Acesse `console.firebase.google.com` → projeto `halogen-tesla-6flln`.
   - Vá em **Authentication → Settings → Authorized domains → Add domain**.
   - Adicione `atelier-club.onrender.com` (sem `https://`).

---

## 4. Como Configurar Domínio Personalizado, DNS (`A`/`CNAME`) e SSL (HTTPS)

### Etapa A — Adicionar domínio na hospedagem
1. No painel do **Render**, acesse **Settings → Custom Domains → Add Custom Domain**.
2. Adicione seu domínio raiz (ex.: `seudominio.com.br`) e o subdomínio `www` (`www.seudominio.com.br`).
3. Anote o **IP** (para registro `A`) e o **hostname** (para registro `CNAME`, ex.: `atelier-club.onrender.com`) exibidos pelo painel.

### Etapa B — Apontar o DNS no seu registrador (Registro.br, Cloudflare, Hostinger, etc.)
1. Abra a **Zona de DNS** do seu domínio e remova registros `A` ou `CNAME` antigos que apontem para página padrão do registrador.
2. Crie os registros:
   - **Domínio raiz (`@` ou em branco)**: Tipo **`A`** → Valor = **IP informado pela hospedagem**. *(Obs.: na Cloudflare, se preferir apontar a raiz para hostname, use `CNAME` com flattening / `ALIAS`.)*
   - **Subdomínio (`www`)**: Tipo **`CNAME`** → Valor = **`seu-app.onrender.com`** (hostname da hospedagem).
3. Aguarde a propagação DNS (normalmente de 5 a 30 minutos; cheque com `nslookup www.seudominio.com.br` ou `dnschecker.org`).

### Etapa C — Validar o Certificado SSL (HTTPS)
1. Assim que o DNS propagar, clique em **Verify** no painel **Custom Domains** do Render.
2. A hospedagem emitirá automaticamente um certificado **SSL/TLS gratuito (Let's Encrypt)**.
   - Se o painel solicitar validação por **DNS TXT** (ex.: `_acme-challenge`), adicione o registro `TXT` exatamente como mostrado na tela e clique em **Verify** novamente.
   - Se usar **Cloudflare**, mantenha a nuvem **cinza (DNS Only)** durante a emissão inicial; se ativar a nuvem laranja depois, deixe **SSL/TLS → Full (Strict)** para evitar loop de redirecionamento.
3. Confirme que `https://seudominio.com.br` abre com cadeado ativo e redireciona de `http://` para `https://`.

### Etapa D — Atualizar permissões após ativar o domínio próprio
1. **Firebase Console → Authentication → Settings → Authorized domains**: adicione `seudominio.com.br` e `www.seudominio.com.br`.
2. **Render → Environment**: atualize `APP_URL` para `https://seudominio.com.br`.
3. **Google AdSense** (se ativar anúncios Web): cadastre `seudominio.com.br` no AdSense para aprovação.

---

## 5. Como Gerar o APK Android (Capacitor) com Admin + AdMob

1. Com o site já publicado em `https://...`, instale no computador **Node.js LTS** e **Android Studio**.
2. Na pasta do projeto:
   ```bash
   npm install @capacitor/core @capacitor/cli @capacitor/android
   npx cap init "Atelier Club" "com.atelierclub.app" --web-dir=dist
   npx cap add android
   ```
3. Configure o `server.url` no arquivo `capacitor.config.ts` apontando para sua URL publicada (`https://seudominio.com.br`) para que o app Android use as rotas `/api/ai/*` com segurança.
4. Para AdMob real no Android, instale `@capacitor-community/admob` e adicione a meta-tag `com.google.android.gms.ads.APPLICATION_ID` no `android/app/src/main/AndroidManifest.xml`.
5. Sincronize e gere o APK no Android Studio:
   ```bash
   npm run build
   npx cap sync android
   npx cap open android
   ```
   No Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
6. Ao entrar no aplicativo Android com sua conta Google `miqueiasmelouber@gmail.com`, a aba **Admin** ficará liberada automaticamente.
