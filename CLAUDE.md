# passport-snap — Contexto de proyecto

PWA de escaneo de documentos (pasaporte, INE) con procesamiento **100% client-side** vía OpenCV.js.
Repo: `github.com/Pvrolomx/passport-snap` (org **Pvrolomx**) · Producción: https://passport-snap.expatadvisormx.com

> Ruta canónica local: `C:\Users\pvrol\Desktop\Repos\passport-snap`

---

## Stack

| | |
|---|---|
| Framework | **Next.js 16.1.6** (App Router) |
| Lenguaje | **TypeScript ^5** |
| UI | React 19.2.3 + **Tailwind CSS v4** (`@tailwindcss/postcss`) |
| PDF | **jspdf ^4.1.0** |
| Visión | **OpenCV.js 4.9.0** — NO es dependencia npm; se carga por **CDN** (`https://docs.opencv.org/4.9.0/opencv.js`, ~8MB) e inyectado en runtime desde `ScannerApp.tsx` |
| Gestor | **npm** |

## Estructura

```
raíz/  → configs (next.config.mjs, eslint.config.mjs, postcss.config.mjs, tsconfig.json) + README
├── src/
│   ├── app/          layout.tsx · page.tsx · globals.css   (App Router)
│   └── components/    ← TODA la lógica vive aquí
│        ScannerApp.tsx    (~573 L)  orquestador: carga OpenCV, máquina de estados
│        ResultScreen.tsx  (~364 L)  genera el PDF con jspdf
│        CaptureScreen.tsx (~342 L)  cámara / captura
│        CornersScreen.tsx (~300 L)  ajuste de esquinas y corrección de perspectiva
│        RegisterSW.tsx     (~16 L)  registra el service worker
└── public/           manifest.json · sw.js · icon-192/512.png
```

Es una **PWA real**: `manifest.json` (standalone, tema `#0a0a0a`) + `sw.js` (`passportsnap-v1`, cachea OpenCV agresivamente).

## Git / Despliegue

- **Solo existe la rama `main`.** No hay `production` ni otras ramas.
- **NO hay `vercel.json` ni `.github/workflows/`** → el deploy es **Vercel conectado directo a GitHub**.
- **Rama de producción: `main`** (confirmado en Vercel Dashboard). Es además la única rama del repo.
- Foco reciente de commits: **INE / dimensiones de PDF** (ISO/IEC 7810 ID-1), opción "Solo frente", selector Carta/Oficio MX.

## Comandos

```
npm install     # requerido tras clonar (no hay node_modules commiteado)
npm run dev     # next dev
npm run build   # next build
npm run start   # next start
npm run lint    # eslint
```

## Notas de seguridad / riesgos

- ✅ **Sin secretos en el repo.** Cero `.env`/tokens trackeados; `.gitignore` cubre `.env*.local`.
- 🟡 **OpenCV.js hardcodeado a CDN de terceros** (`docs.opencv.org`), sin fallback local: si el CDN cae, la app no procesa.
- 🟡 **Sin lockfile** (`package-lock.json`) en la raíz → builds no deterministas. Verificar/generar antes de fijar versiones.
- 🟡 `next.config.mjs` vacío: sin cabeceras de seguridad (CSP, etc.) pese a manejar documentos de identidad.

## Protocolo de trabajo

- Modo por defecto en reconocimiento: **solo lectura**. Editar/commit/push solo con visto bueno explícito.
- **Rama de producción: `main`** — push a `main` despliega a producción.
