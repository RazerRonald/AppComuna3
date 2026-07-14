# Informe de auditoría y conversión responsive

**Fecha:** 2026-07-13 · **Alcance:** frontend completo (SPA vanilla JS + Bootstrap 5)

## 1. Resumen

El proyecto ya contaba con una base responsive sólida (Bootstrap 5, meta viewport,
`img { max-width: 100% }`, tablas con `.table-responsive`, tipografía con `rem`/`clamp()`,
menú móvil funcional). La auditoría empírica sobre las 15 rutas no encontró **ningún
overflow horizontal ni layout roto**. Los problemas reales estaban en **targets táctiles
menores a 44×44px**, que se corrigieron con cambios solo de CSS en `css/main.css`.

### Problemas encontrados y su resolución

| # | Problema | Ubicación | Resolución |
|---|----------|-----------|------------|
| 1 | Dots del carrusel de 8×8px (imposibles de tocar en móvil) | `css/main.css` §6 | Caja táctil de 44×44px con `padding` + `background-clip: content-box`; el dot visible sigue midiendo 8px |
| 2 | Botones de acción en tablas admin de 32×31px | `css/main.css` §14 | `min-width/min-height: 44px` como base (móvil); compactos de nuevo en `min-width: 1024px` (desktop con mouse) |
| 3 | Botón "Ver detalle" de solicitudes reducido a 34px en <576px | `css/main.css` §15 | Base táctil de 44px; 32px solo en desktop |
| 4 | Toggler de navbar de 54×38px | `css/main.css` §5 | `min-width/min-height: 44px` |
| 5 | Enlaces de breadcrumb (~20px de alto) y de contacto tel:/mailto: (~22px) | `css/main.css` §16/§18 | Padding táctil compensado con margen negativo (no altera el layout visual) |
| 6 | Altura del hero con saltos fijos por media query (520/380/320px) | `css/main.css` §6/§27 | `height: clamp(320px, 45vw, 520px)` — escala fluida; se eliminaron los overrides de altura en las media queries |

**No se tocó ninguna lógica de negocio ni estructura HTML/JS.** Todos los cambios
respetan los design tokens existentes (`:root` de `main.css`).

## 2. Verificación automatizada

Script: [`tests/responsive/check.mjs`](tests/responsive/README.md) (Playwright + Chromium).
Recorre las 15 rutas (públicas + estudiante + edil, con **login real** para las
protegidas) en 10 viewports, capturando screenshot de página completa y verificando:
overflow horizontal, elementos fuera del viewport, texto recortado no intencional,
solapamiento de controles y errores de consola.

### Resultado final: **150 / 150 PASS · 0 errores de consola · 0 avisos**

| Ruta \ Viewport | 320×568 | 375×667 | 390×844 | 414×896 | 768×1024 | 820×1180 | 1024×768 | 1280×800 | 1440×900 | 1920×1080 |
|---|---|---|---|---|---|---|---|---|---|---|
| `#/inicio` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `#/noticias` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `#/noticias/:id` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `#/eventos` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `#/contacto` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `#/login` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `#/tramite` (estudiante) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `#/tramite/nueva` (estudiante) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `#/perfil` (estudiante) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `#/admin` (edil) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `#/publicar` (edil) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `#/admin/noticias` (edil) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `#/admin/eventos` (edil) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `#/admin/tramites` (edil) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `#/admin/usuarios` (edil) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Screenshots

150 capturas de página completa en `reports/screenshots/<rol>-<ruta>/<ancho>x<alto>.png`
(por ejemplo `reports/screenshots/publico-inicio/320x568.png`). La carpeta `reports/`
está en `.gitignore` y se regenera con `npm run check` desde `tests/responsive/`.
Detalle máquina-legible por combinación: `reports/results.json`.

## 3. Cómo repetir la verificación

```bash
cd tests/responsive
npm install
npx playwright install chromium
npm run check        # sale con código 1 si alguna combinación falla
```

Ver `tests/responsive/README.md` para credenciales por variable de entorno y `BASE_URL`.

## 4. Limitaciones conocidas y deuda técnica

- **Imágenes del hero (Wikimedia):** si la red las bloquea o tarda, el `onerror` las
  oculta y queda el gradiente oscuro de respaldo. Es degradación elegante, pero
  convendría servir esas imágenes desde `assets/` para no depender de un tercero.
- **Media queries `max-width` preexistentes** (§17, §27 de `main.css`): funcionan
  correctamente; se dejaron intactas a propósito para no arriesgar regresiones. El CSS
  nuevo sigue el enfoque mobile-first (base móvil + `min-width: 1024px`).
- **Tablas admin en móvil** usan scroll horizontal interno (`.table-responsive`), que es
  el patrón estándar de Bootstrap. Una alternativa futura es reformatearlas como cards
  apiladas en <768px.
- **Artefactos de screenshot:** en las capturas fullPage los elementos `position: fixed`
  (burbuja de Drive, toasts) y la navbar sticky aparecen pintados en la parte superior;
  se verificó en navegador real que no hay solapamiento en vivo.
- **El proyecto no tiene tests unitarios, linter ni type-checker previos** (frontend
  estático sin `package.json` raíz), por lo que no había suites existentes que ejecutar;
  el script de este informe queda como primera verificación automatizada del repo.
- Los solapamientos deliberados de overlays fijos (toasts, burbuja de Drive) y los
  recortes intencionales (`.text-truncate`, `.visually-hidden`, line-clamp) están
  excluidos de la detección para evitar falsos positivos.
