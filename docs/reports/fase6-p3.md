# Fase 6 · Reporte P3: estrategias 14, 10 y 11

Generado por `node tools/lab-backtest.js` el 2026-11-09 00:18 UTC con `data/lab/history.json` (marcadores públicos de ESPN, solo desarrollo).

Método: paso a paso en el tiempo (cada pronóstico usa solo lo anterior al partido). Comparación contra el **modelo actual** (`lib/model.js` con la tabla de ese día, sin cuotas). Δ = nuevo − actual (negativo = mejor), con intervalo del 95 % por remuestreo de partidos. Regla: se publica solo si el intervalo de Δ log loss o de Δ RPS queda entero bajo cero; si no, «educativa». Semáforo (Parte 2): alta = ECE ≤ 0,02 y n ≥ 1.000 · media = ECE ≤ 0,04 o 300 ≤ n < 1.000 · baja = lo demás · educativa = no publicada.

| Liga | Partición | Entrena | Prueba | Modelo actual: log loss · RPS · ECE | Casa al cierre (log loss, mismos partidos) |
| --- | --- | --- | --- | --- | --- |
| Liga BetPlay | temporadas anteriores → temporada actual | 883 | 381 | 1.0666 · 0.2169 · 0.0343 | 0.9970 (actual 1.0714, n 329) |
| Premier League | temporadas anteriores → temporada actual | 380 | 100 | 1.0843 · 0.2297 · 0.0462 | 1.0153 (actual 1.0904, n 99) |
| LaLiga | temporadas anteriores → temporada actual | 380 | 119 | 1.0043 · 0.2071 · 0.0337 | 0.9000 (actual 1.0043, n 119) |
| Copa Libertadores | primera mitad → segunda mitad de la temporada | 77 | 77 | 1.1012 · 0.2228 · 0.0853 | — |
| Champions League | primera mitad → segunda mitad de la temporada | 36 | 36 | 0.9390 · 0.2250 · 0.0699 | — |

## 14 · Cuánto arriesgar con varias apuestas

Kelly con límite de caída (condición de Busseti, Ryu y Boyd evaluada exactamente sobre los 2ⁿ resultados) y luego los topes de la app (por apuesta y exposición total). Probado en `tests/lab.test.js`. Herramienta de decisión: no produce probabilidades que calificar. Se publicará cuando el historial de selecciones de valor tenga al menos 300 calificadas.

## 10 · Puntos de jugadores (baloncesto)

Módulo preparado y **apagado** (`lib/lab/props-nba.js`): La app aún no integra datos de baloncesto (NBA).

## 11 · Córners y tarjetas (binomial negativa)

Modelo con equipos frente a «solo el promedio de la liga», log loss del total. Sin efecto árbitro: la fuente no publica el árbitro.

| Liga | Conteo | n | Δ log loss (equipos − liga) | Cobertura real del rango 80 % | Más de la línea: ECE | Decisión |
| --- | --- | --- | --- | --- | --- | --- |
| Liga BetPlay | córners | 381 | -0.0002 [-0.0167, 0.0144] | 80.8 % | 0.0168 | no mejora |
| Liga BetPlay | tarjetas | 381 | -0.0009 [-0.0164, 0.0188] | 85.3 % | 0.0317 | no mejora |
| Premier League | córners | 100 | -0.0062 [-0.0453, 0.0321] | 80.0 % | 0.0811 | no mejora |
| Premier League | tarjetas | 100 | -0.0128 [-0.0579, 0.0280] | 84.0 % | 0.1028 | no mejora |
| LaLiga | córners | 119 | -0.0171 [-0.0715, 0.0324] | 76.5 % | 0.0662 | no mejora |
| LaLiga | tarjetas | 119 | -0.0176 [-0.0492, 0.0149] | 86.6 % | 0.0458 | no mejora |
| Copa Libertadores | córners | 77 | 0.0654 [-0.0135, 0.1454] | 83.1 % | 0.1644 | no mejora |
| Copa Libertadores | tarjetas | 77 | 0.0348 [-0.0173, 0.0904] | 85.7 % | 0.1119 | no mejora |
| Champions League | córners | 32 | -0.0444 [-0.1281, 0.0403] | 93.8 % | 0.1352 | no mejora |
| Champions League | tarjetas | 32 | 0.0367 [-0.0653, 0.1406] | 71.9 % | 0.0922 | no mejora |

Decisión de la estrategia (exige córners y tarjetas): Liga BetPlay educativa · Premier League educativa · LaLiga educativa · Copa Libertadores educativa · Champions League educativa
