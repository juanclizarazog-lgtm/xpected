# ADR-001 · Puntos de enganche con lo existente

Estado: **aceptado por el plan** (docs/plan-fase-6.md, «Qué se agrega y dónde» y Prompt 6.0/6.1/6.3).
Ninguno de estos cambios borra ni modifica líneas existentes: solo **agrega** líneas. `node tools/lab-baseline.js check`
lo verifica contra la copia guardada antes de empezar.

| Archivo existente | Qué se agrega | Por qué es imprescindible | Autorizado por |
| --- | --- | --- | --- |
| `index.html` | enlace «Laboratorio» al final del menú superior; una etiqueta `<script>` del cargador `assets/js/lab/lab-boot.js` (el enlace del pie «Producto» lo agrega el cargador al iniciar, porque esa nav es una sola línea y editarla cambiaría una línea original) | Sin enlace no hay acceso; sin cargador no hay ruta | «Agrega /laboratorio a la navegación sin mover ni cambiar los enlaces actuales» |
| `assets/js/app.js` | dos entradas al final de `ROUTES`: `/laboratorio(/catalogo)?` y `/ligas/:slug` | El arreglo de rutas es cerrado; sin entrada la ruta cae en «No encontrado» | «Ruta /laboratorio», «Simulador de temporada en /ligas/[slug]» |
| `assets/js/pages-main.js` | `['avanzado', 'Avanzado']` al **final** de `TABS` y una rama en `renderTab` | La pestaña solo puede existir en la lista de pestañas | «Pestaña Avanzado … después de las pestañas existentes, sin moverlas» |
| `server.js` | endpoints nuevos `/api/lab/*`, tipo de mensaje SSE nuevo `intensity`, registro de instantáneas de cuota | Lo nuevo del motor debe publicarse | «solo agrega tipos de mensaje nuevos»; «ningún endpoint existente cambia su contrato» |
| `server.js` (despliegue) | datos iniciales al arrancar (`lib/seed.js`), contraseña opcional `XPECTED_PASSWORD`, `/healthz` | Publicar la versión completa en un hosting sin dejarla abierta al público mientras la fuente de datos sea solo de desarrollo | Pedido del usuario: «publícala» / «prepárala» (ver `docs/despliegue.md`) |
| `tools/lint-copy.js` | los archivos nuevos del laboratorio en la lista `FILES` | El copy nuevo debe pasar el mismo linter | Parte 6: «0 términos prohibidos» |
| `CLAUDE.md`, `README.md`, `.gitignore` | sección de la fase 6 y documentación | Pedido explícito del plan | Parte 5 |

## Lo que NO se hace
- El menú móvil inferior es una rejilla fija de 5 columnas: un sexto enlace cambiaría el ancho de los cinco existentes.
  Se deja igual; en móvil se llega al laboratorio desde el pie de página y desde la pestaña «Avanzado» de cada partido.
- No se cambian tokens, componentes, animaciones, textos ni contratos existentes.
- La capa de «rangos en cada probabilidad» viene **apagada** y, al activarse, solo agrega un texto pequeño junto a los
  números; las pantallas existentes quedan idénticas mientras está apagada.
