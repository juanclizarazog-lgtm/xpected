# Xpected — plataforma de pronósticos deportivos (MVP web de demostración)

Implementación desde cero del frontend completo descrito en `docs/plan.md` (Partes VII, IX y X), con el
motor cuantitativo real (Partes I–III) corriendo en el navegador y datos **simulados** en lugar de los
proveedores licenciados.

## Cómo abrirlo

Requisito: **Node.js 18 o superior** (https://nodejs.org). No hay que instalar paquetes: el proyecto no tiene dependencias.

```bash
node server.js
```

Luego abre http://localhost:5173. En Windows también puedes hacer doble clic en `iniciar.bat` (en macOS/Linux:
`sh iniciar.sh`). Sin servidor, abriendo `index.html` directamente, funciona la demo simulada, pero no los datos
reales ni el Laboratorio.

Atajos (`npm` viene con Node): `npm start` · `npm test` (todas las pruebas y el linter) · `npm run verificar`
(con el servidor encendido: datos en vivo y estadísticas del laboratorio contra la fuente).

## Publicar en internet

Guía paso a paso: `docs/despliegue.md` (Render desde GitHub con `render.yaml`, o Docker en cualquier hosting).
Define `XPECTED_PASSWORD` para que el sitio pida contraseña mientras los datos sean solo de desarrollo; `/healthz`
responde al hosting sin datos; al arrancar en un servidor nuevo, `lib/seed/` llena `data/` (renuévalo con
`node tools/actualizar-semilla.js`).

## Datos reales sin clave (por defecto)

`node server.js` arranca el gateway con la fuente pública de marcadores de ESPN: partidos de los próximos 7 días,
resultados y minuto en vivo, goles y tarjetas con jugador, tabla de posiciones, forma, logos y la cuota de referencia
(1X2 y total de goles, apertura y actual) de Liga BetPlay, Premier League, LaLiga, Champions y Libertadores
(`ESPN_LEAGUES` para cambiarlas). Con partidos en vivo se consulta cada 10 s (30 s si no hay ninguno).

- **Pronóstico** (`lib/model.js`, versión `xp-model 1.3`): fuerza de ataque/defensa con la tabla real, ajuste por
  forma, Dixon-Coles y mezcla 35 % modelo / 65 % cuota sin margen (Shin). Una sola matriz de marcadores final
  reproduce ese 1X2 y la línea de goles de la casa, para que marcador más probable, «más de» y «ambos marcan»
  cuenten la misma historia. Se calcula en el servidor.
- **En vivo**: parte de la matriz prepartido anclada a la cuota de cierre y descuenta los goles que faltan por jugar
  (la intensidad de gol crece hacia el final; 90'+3 o 120'+2 en prórroga), el marcador (quien pierde ataca más) y las
  expulsiones. La cuota de cierre se muestra solo como referencia: con el partido iniciado no se calcula valor
  contra ella. Referencias de calibración en las pruebas: 2-0 a falta de ~30' entre parejos ≈ 90–96 %.
- **Historial real** (`lib/track.js`): cada pronóstico se congela con SHA-256 entre 90 y 0 min antes del inicio y se
  califica al terminar; se guarda en `data/track-record.json` y se ve en `#/rendimiento`. El servidor debe quedar
  encendido para acumularlo.
- Uso **solo para desarrollo**: antes de lanzar hay que licenciar un proveedor (ver `docs/data-licenses.md`).
- `node server.js --demo` vuelve a los datos simulados.

## Cuotas de varias casas (gateway SSE)

El servidor incluye un gateway que consulta un proveedor de cuotas licenciado, normaliza los datos y los
empuja al navegador por Server-Sent Events. La clave queda solo en el servidor.

```powershell
$env:ODDS_API_KEY="tu-clave"; node server.js
```

Para probar el flujo completo sin gastar créditos (mismo formato que The Odds API, generado localmente):

```bash
node server.js 5174 --mock
```

| Variable | Uso |
| --- | --- |
| `ODDS_API_KEY` | Clave de The Odds API v4 (activa el modo real) |
| `ODDS_SPORTS` | Competiciones separadas por coma; lista disponible en `/api/sports` |
| `ODDS_REGIONS` | Regiones de casas (por defecto `eu`, incluye la referencia afilada) |
| `ODDS_POLL_SECONDS` | Intervalo de consulta (mín. 15 s; cada consulta consume créditos) |
| `ODDS_ALLOWED_BOOKS` | Lista blanca de operadores autorizados por Coljuegos; el resto se anonimiza («Libro A»…) |

Con el feed activo: los partidos simulados se ocultan; λ y μ de Dixon-Coles se ajustan a las cuotas sin margen
para obtener la matriz de marcadores; las competiciones se publican en modo «solo mercado» (sin marcas de valor)
hasta que exista un backtest propio; Equipos y xG muestran que requieren el proveedor deportivo en vez de inventar datos.

## Estadio 3D de fondo (`assets/js/stage3d.js`)

Un solo lienzo WebGL detrás de toda la app con lenguaje de transmisión deportiva: cancha con césped cortado y
líneas que brillan, arcos con red, balón real (12 pentágonos y 20 hexágonos), torres de iluminación con haces,
público con flashes en las tribunas y tableros LED perimetrales con las cuotas en vivo.

- **Columnas de luz = 1X2** del partido en foco (local · empate · visitante) con su porcentaje; pasar el mouse por
  una tarjeta las transforma a ese partido. El balón rueda hacia el favorito.
- **Patear:** arrastra el balón y suéltalo; si entra entre los palos, la red ondula y los reflectores destellan.
  Un toque cambia al siguiente partido.
- **Datos en vivo:** un gol real hace ondular la red del arco correspondiente; un cambio de cuota hace destellar el
  tablero LED y latir las columnas.
- **Cámara por página:** plano de transmisión (portada), cámara táctica (Partidos/Cuotas), cámara baja hacia los
  tableros (Valor), plano lateral (Partido) y cenital tenue (resto).
- Se apaga en el centro de control; con movimiento reducido queda como imagen fija.

## Boleto de análisis (`assets/js/slip.js`)

Tocar una cuota la añade al boleto con una animación en arco. Calcula cuota combinada, probabilidad según Xpected,
cuota justa, valor estimado y un monto prudente (con tope más bajo para combinadas). Una selección por partido.
No es una apuesta: no recibe dinero ni enlaza a casas. Se guarda solo en el navegador.
## Experiencia

- **3D (Three.js 0.170, carga diferida):** balón holográfico con núcleo de Fresnel; los tres anillos orbitales son
  la probabilidad 1X2 del partido destacado y cambian en vivo. Arrastrar para girar con inercia, clic para un impulso,
  paralaje con el mouse y con el scroll. Holo-matriz 3D de marcadores en cada partido (órbita, tooltip, alternativa en tabla).
- **Paisaje sonoro original:** sintetizado en tiempo real con Web Audio (pads, bajo, arpegio con eco, «aire»).
  Apagado por defecto; reacciona a los goles con un acorde neutro. Volumen y sonidos de interfaz en el centro de control.
- **Interacción:** cursor con estela, aurora difuminada que sigue al mouse y al audio, tarjetas con tilt 3D y foco de luz,
  botones magnéticos, ondas al pulsar, revelados con desenfoque, contadores, texto que se decodifica, ticker de cuotas
  y transiciones de página con desenfoque.
- **Paletas artísticas:** Aurora, Nébula, Solar y Glaciar, en oscuro y claro.
- Todo tiene variante de movimiento reducido y se puede pausar (WCAG 2.2.2).

## Qué incluye

| Ruta | Contenido |
| --- | --- |
| `#/` | Landing: hero de partículas (cancha → matriz de marcadores con scroll), titular cinético, tablero en vivo, «Cómo funciona» con scroll, transparencia, planes, FAQ |
| `#/hoy` | Grilla bento: en vivo, radar de valor, partidos por liga, filtros por liga/estado/valor, esqueletos |
| `#/partido/:id` | Pestañas Resumen (barras 1X2 modelo/mercado/publicada, medidor de valor, matriz de marcadores), Mercados (16 selecciones con cálculo paso a paso), En vivo (probabilidad, xG, momentum, eventos), Equipos, Movimiento de línea, Explicación |
| `#/mercados` | Mercados en vivo: cada casa frente al precio justo sin margen, mejor cuota, estado del feed (latencia, créditos) |
| `#/valor` | Radar de valor filtrable con IC, EV con prob. baja del IC y reordenamiento animado (FLIP) |
| `#/herramientas/:tool` | Conversor, devig (multiplicativo/potencia/Shin), EV, Kelly con topes, simulador Monte Carlo de 10.000 trayectorias, margen de combinadas, CLV |
| `#/rendimiento` | Calibración, log loss vs. mercado, ECE, CLV, ROI con intervalo, tabla por liga, auditoría SHA-256 y CSV |
| `#/aprender` | 5 lecciones con fórmulas, ejemplos, ejercicios y laboratorio de Poisson / N_min |
| `#/cuenta` | Tema, movimiento, formato de cuotas, zona horaria, Kelly, topes, aviso de sesión, autoexclusión, exportar/borrar datos |
| Legales | `#/metodologia`, `#/juego-responsable`, `#/privacidad`, `#/terminos` |

Cumplimiento integrado: puerta de edad (no guarda la fecha), consentimiento de cookies granular,
pie de juego responsable en todas las páginas, temporizador de sesión, pausa del en vivo (WCAG 2.2.2),
lista blanca de operadores vacía (ningún enlace a casas), copy sin términos prohibidos.

## Laboratorio (fase 6, `#/laboratorio`)

14 herramientas avanzadas en tarjetas de tres capas (veredicto con número, rango y semáforo · «Pruébalo» con
«Restablecer» · «Cómo lo calculamos» en palabras simples), la pestaña «Avanzado» de cada partido, el simulador de
temporada (`#/ligas/liga-betplay`, `#/ligas/premier-league`, `#/ligas/laliga`) y una capa opcional de rangos junto a
cada probabilidad. Plan: `docs/plan-fase-6.md` · reglas de conservación: `CLAUDE.md` y `docs/lab/adr-*.md`.

- **Historial** (`lib/lab/history.js` → `data/lab/history.json`): partidos, minutos de gol, tarjetas, córners, cuota
  de apertura y cierre y alineaciones de ESPN (3 temporadas de Liga BetPlay, 2 de Premier y LaLiga, Champions y
  Libertadores). El servidor lo actualiza cada 6 horas y 10 minutos después de cada partido terminado.
- **Prueba con partidos pasados** (`node tools/lab-backtest.js`): cada pronóstico usa solo lo anterior al partido;
  una herramienta se publica solo si mejora al modelo actual con un intervalo que no cruza cero; si no, queda en
  «modo aprendizaje». Reportes en `docs/reports/fase6-*.md`; interruptores en `lib/lab/strategy-flags.json`.
- **Simulador**: 10.000 temporadas con el formato real (`lib/lab/formats/*.json`); los partidos en curso parten del
  marcador y el minuto del feed y se vuelven a simular cuando cambian (como mucho cada 2 minutos).
- **Expectativa honesta**: la cuota de cierre de la casa sigue acertando más que todos los modelos; el laboratorio
  sirve para medir la duda y explicar el porqué, no promete ganar más.

## Estructura

```
assets/js/quant.js        packages/quant: devig, EV, Kelly, CLV, Brier, log loss, RPS, Poisson, Dixon-Coles, Elo, mezcla logit
assets/js/core.js         config (brand/operators), ajustes, bus, formato Intl es-CO, SHA-256
assets/js/data.js         motor de demo: ligas, equipos, partidos, precios, simulación en vivo, calificación, rendimiento
assets/js/components.js   MatchCard, ProbabilityBar1X2, OddsCell, ValueGauge, StepByStepCalc, gráficas SVG
assets/js/pages-*.js      páginas
assets/js/app.js          router, AgeGate, CookieConsent, CommandPalette (Ctrl K), SessionTimer
assets/css/styles.css     tokens de la Parte IX, componentes, animaciones y variantes de movimiento reducido
tests/                    test-vectors.json + tests de fórmulas
tools/lint-copy.js        linter de términos prohibidos
lib/model.js, lib/espn.js, lib/track.js   modelo del servidor, datos de ESPN, historial congelado
assets/js/lab/            laboratorio (se carga solo en sus rutas; lab-boot.js es lo único en el paquete inicial)
lib/lab/                  motor del laboratorio: historial, fuerza, factores, alineaciones, en vivo, cuotas, conteos, simulador
tools/verify-*.js         auditorías contra la fuente · tools/lab-*.js prueba histórica y no regresión
```

## Comprobaciones

```bash
node tests/quant.test.js
```

```bash
node tests/model.test.js
```

```bash
node tools/lint-copy.js
```

Con el servidor encendido, compara lo publicado contra la fuente original (frescura, estado, marcador, minuto,
entretiempo, coherencia de cada probabilidad, reproducibilidad del modelo y sensatez en vivo):

```bash
node tools/verify-live.js
```

Laboratorio: pruebas de cada herramienta, auditoría de sus estadísticas contra la fuente (tablas oficiales, resultados,
sumas del simulador, rangos, reparto exacto de los factores) y que lo existente no cambió (solo se agregaron líneas):

```bash
node tests/lab.test.js
```

```bash
node tools/verify-lab.js
```

```bash
node tools/lab-baseline.js check
```

## Lo que falta para producción (fases 1, 3, 4 y 5 del plan)

- Proveedor deportivo licenciado (Sportmonks: xG, alineaciones, lesiones) y Postgres/Redis para persistir el historial.
- Validar el gateway con una clave real de The Odds API (probado solo con el modo `--mock`, que usa el mismo formato).
- Licenciar la fuente de datos: ESPN se usa solo en desarrollo (ver `docs/data-licenses.md`); sin árbitro asignado ni
  porcentaje de apuestas del público, y con una sola casa (por eso «movimientos fuertes» queda en modo aprendizaje).
- Redis pub/sub entre ingesta y gateway para escalar a muchos clientes (hoy el gateway vive en el mismo proceso).
- Capa de IA (`claude-haiku-5-5` para explicaciones, `claude-sonnet-5-5` para el analista) con anclaje numérico.
- Autenticación, plan Pro y pagos; versión Python de `quant` con los mismos vectores.
- Migración a Next.js 16 + Tailwind según la Parte VIII (los componentes y tokens se trasladan casi 1:1).
- Revisión legal (Parte VI) y verificación de líneas de ayuda antes del lanzamiento.
