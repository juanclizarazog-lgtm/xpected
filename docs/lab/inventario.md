# Fase 6 · Inventario de lo existente (8 nov 2026)

Lo que ya existe y **no se toca**. Los nombres del plan (`features/lab/`, `services/model/lab/`, `packages/quant`,
Storybook, Playwright, tablas SQL) se adaptan a los reales en `docs/lab/adr-002-adaptacion-al-stack.md`.

## Stack real
- SPA sin build ni dependencias: scripts clásicos bajo el espacio de nombres `XP`, router por hash con View Transitions.
- Servidor Node sin dependencias (`server.js`): estáticos + `/api/*` + SSE `/api/stream`. Modelo en `lib/model.js`,
  datos de ESPN en `lib/espn.js`, historial congelado en `lib/track.js` → `data/track-record.json`.
- Equivalentes del plan: `features/lab/` → `assets/js/lab/` · `services/model/lab/` → `lib/lab/` ·
  `packages/quant` → `assets/js/quant.js` (+ `assets/js/lab/lab-quant.js`, nuevo) · tablas → JSON en `data/lab/`.

## Rutas (`assets/js/app.js`, arreglo `ROUTES`)
| Ruta | Página (`XP.pages.*`) | Archivo |
| --- | --- | --- |
| `#/` | landing | `pages-main.js` |
| `#/hoy` | hoy | `pages-main.js` |
| `#/partido/:id/:tab?` | partido · pestañas `resumen, mercados (Apuestas), en-vivo, equipos, movimiento (Cuotas), explicacion (Análisis)` | `pages-main.js` (`TABS`, `renderTab`) |
| `#/valor` | valor (radar) | `pages-main.js` |
| `#/mercados` | mercados (cuotas en vivo) | `pages-markets.js` |
| `#/herramientas/:tool?` | kelly, ev, devig, combinadas, conversor, simulador, clv | `pages-tools.js` |
| `#/rendimiento` | historial real | `pages-info.js` |
| `#/aprender`, `#/metodologia`, `#/juego-responsable`, `#/privacidad`, `#/terminos`, `#/cuenta` | información y cuenta | `pages-info.js` |

Menú superior (`.mainnav`, visible ≥ 980 px): Partidos, Valor, Cuotas, Calculadoras, Historial.
Menú móvil (`.bottomnav`, rejilla fija de 5 columnas): no admite un sexto enlace sin cambiar su diseño → no se toca.
Pie: navs Producto / Entender / Legal.

## Componentes (`assets/js/components.js`, objeto `XP.ui`)
`bind`, `updateBindings` (enlaces de datos en vivo `data-bind="id|clave"`), `crest`, `leagueMark`, `formDots`, `formStrip`,
`statusChip`, `kickoffText`, `probBar` (barra 1X2), `gauge` (medidor de valor), **`stepByStep`** (cálculo paso a paso:
lista `ul.detail-list` con filas icono · `dl-k` · `dl-v`), `matchCard`, `refreshCard`, `scoreHeatmap`, `charts`/`mountCharts`,
`tabs` (`role=tablist`), `pick`, `bestValue`, `marketOnlyBadge`, `skeleton`, `flip` (FLIP), `chartArgs`, `updateAgo`.
Otros: `XP.oddBtn` y el boleto (`slip.js`), `XP.icon` (40 íconos, `icons.js`), `XP.toast`, `XP.bus` (eventos),
`XP.settings` / `XP.setSetting` / `XP.applySettings` / `XP.LS` (`core.js`), `XP.fmt` (prob, pct, pp, odds, money, fechas).

## Tokens de diseño (`assets/css/styles.css`, `:root`)
Color: `--bg --surface-1 --surface-2 --border --text --text-2 --text-3 --accent --accent-ink --up --down --info --warn --home --away --draw`.
Tipografía: `--font-display --font-ui --font-mono`. Forma: `--r-ctl --r-card --r-pill --gutter --maxw`.
Movimiento: `--dur-instant --dur-fast --dur-base --dur-slow --dur-story --ease-standard --ease-exit --ease-spring`.
Variante de movimiento reducido: `html[data-motion="reduce"]`. Tema: `html[data-theme="light|dark"]`. Paletas: `data-palette`.

## Animaciones existentes (`@keyframes`)
blink, chipSwap, drawline, drift1–3, eqidle, fade, fadeout, flash, flood, floor, from-above, from-below, hl, marquee,
modal-in, pop, pulse, reveal, ripple, rise, shake, sheen, shimmer, slipBump, slipIn, spin-ang, vt-in, vt-out, wheel.
Efectos de `fx.js`: revelado al hacer scroll (`data-reveal`), conteo (`countUp`), inclinación, foco magnético, indicador del menú.

## Datos y motor
- `lib/model.js` (`xp-model 1.3`): fuerza con la tabla (encogimiento fijo k = 4), forma, Dixon-Coles, mezcla 35/65 con la
  cuota sin margen, matriz final anclada a la línea de goles, modelo en vivo.
- `assets/js/quant.js`: margen, devig (mult/potencia/Shin), EV, Kelly, Brier/log loss/RPS/ECE, Poisson, Dixon-Coles,
  `scoreMatrix`, `marketsFromMatrix`, `probInterval`, `blend`.
- Fuente: marcadores públicos de ESPN (solo desarrollo). Cuota de referencia anonimizada.
