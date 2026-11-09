# Fase 6 · Reporte P1: estrategias 1, 2, 5, 9, 12 y 13

Generado por `node tools/lab-backtest.js` el 2026-11-09 00:18 UTC con `data/lab/history.json` (marcadores públicos de ESPN, solo desarrollo).

Método: paso a paso en el tiempo (cada pronóstico usa solo lo anterior al partido). Comparación contra el **modelo actual** (`lib/model.js` con la tabla de ese día, sin cuotas). Δ = nuevo − actual (negativo = mejor), con intervalo del 95 % por remuestreo de partidos. Regla: se publica solo si el intervalo de Δ log loss o de Δ RPS queda entero bajo cero; si no, «educativa». Semáforo (Parte 2): alta = ECE ≤ 0,02 y n ≥ 1.000 · media = ECE ≤ 0,04 o 300 ≤ n < 1.000 · baja = lo demás · educativa = no publicada.

| Liga | Partición | Entrena | Prueba | Modelo actual: log loss · RPS · ECE | Casa al cierre (log loss, mismos partidos) |
| --- | --- | --- | --- | --- | --- |
| Liga BetPlay | temporadas anteriores → temporada actual | 883 | 381 | 1.0666 · 0.2169 · 0.0343 | 0.9970 (actual 1.0714, n 329) |
| Premier League | temporadas anteriores → temporada actual | 380 | 100 | 1.0843 · 0.2297 · 0.0462 | 1.0153 (actual 1.0904, n 99) |
| LaLiga | temporadas anteriores → temporada actual | 380 | 119 | 1.0043 · 0.2071 · 0.0337 | 0.9000 (actual 1.0043, n 119) |
| Copa Libertadores | primera mitad → segunda mitad de la temporada | 77 | 77 | 1.1012 · 0.2228 · 0.0853 | — |
| Champions League | primera mitad → segunda mitad de la temporada | 36 | 36 | 0.9390 · 0.2250 · 0.0699 | — |

## 1 · Fuerza que cambia en el tiempo (filtro de Kalman)

Parámetros ajustados solos con las temporadas de entrenamiento (q = deriva diaria, p0 = incertidumbre inicial, ρ = memoria entre temporadas):

- Liga BetPlay: q 0.0001 · p0 0.05 · ρ 0.8
- Premier League: q 0.0002 · p0 0.1 · ρ 0.6
- LaLiga: q 0.00005 · p0 0.05 · ρ 0.6
- Copa Libertadores: q 0.0008 · p0 0.05 · ρ 0.6
- Champions League: —

| Liga | n | log loss | RPS | ECE | Δ log loss vs actual | Δ RPS vs actual | Δ vs su base | Decisión | Semáforo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Liga BetPlay | 381 | 1.0169 | 0.2010 | 0.0284 | -0.0497 [-0.0739, -0.0261] | -0.0159 [-0.0233, -0.0081] | — | **publicada** | media |
| Premier League | 100 | 1.0353 | 0.2142 | 0.0290 | -0.0490 [-0.0812, -0.0151] | -0.0154 [-0.0267, -0.0044] | — | **publicada** | media |
| LaLiga | 119 | 0.9787 | 0.1977 | 0.0315 | -0.0256 [-0.0686, 0.0125] | -0.0094 [-0.0215, 0.0026] | — | educativa | educativa |
| Copa Libertadores | 77 | 1.0716 | 0.2169 | 0.0463 | -0.0296 [-0.0869, 0.0237] | -0.0059 [-0.0241, 0.0098] | — | educativa | educativa |
| Champions League | 36 | 0.9149 | 0.2147 | 0.1004 | -0.0241 [-0.1014, 0.0667] | -0.0102 [-0.0352, 0.0190] | — | educativa | educativa |

## 2 · Pocos partidos: encogimiento hacia el promedio (Bayes empírico)

| Liga | n | log loss | RPS | ECE | Δ log loss vs actual | Δ RPS vs actual | Δ vs su base | Decisión | Semáforo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Liga BetPlay | 381 | 1.0463 | 0.2111 | 0.0240 | -0.0203 [-0.0430, 0.0023] | -0.0058 [-0.0129, 0.0011] | — | educativa | educativa |
| Premier League | 100 | 1.0622 | 0.2241 | 0.0424 | -0.0221 [-0.0827, 0.0370] | -0.0056 [-0.0241, 0.0136] | — | educativa | educativa |
| LaLiga | 119 | 1.0167 | 0.2098 | 0.0331 | 0.0124 [-0.0326, 0.0587] | 0.0027 [-0.0108, 0.0164] | — | educativa | educativa |
| Copa Libertadores | 77 | 1.1045 | 0.2242 | 0.0707 | 0.0033 [-0.0460, 0.0565] | 0.0015 [-0.0130, 0.0189] | — | educativa | educativa |
| Champions League | 36 | 0.9041 | 0.2135 | 0.0738 | -0.0349 [-0.1103, 0.0447] | -0.0115 [-0.0372, 0.0178] | — | educativa | educativa |

## 5 · Altura

Efecto δ por cada 1.000 m de diferencia (goles del local, escala logarítmica), estimado con el entrenamiento:

- Liga BetPlay: δ = -0.0038 ± 0.0335 (399 partidos con diferencia positiva)
- Premier League: no aplica
- LaLiga: no aplica
- Copa Libertadores: no aplica
- Champions League: no aplica

Se exige además mejorar a la fuerza en el tiempo sola (columna «Δ vs su base»).

| Liga | n | log loss | RPS | ECE | Δ log loss vs actual | Δ RPS vs actual | Δ vs su base | Decisión | Semáforo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Liga BetPlay | 381 | 1.0172 | 0.2011 | 0.0291 | -0.0495 [-0.0728, -0.0263] | -0.0159 [-0.0237, -0.0086] | 0.0002 [-0.0001, 0.0005] | educativa | educativa |
| Premier League | — | — | — | — | — | — | — | educativa | educativa | Liga sin diferencias de altura conocidas entre sedes
| LaLiga | — | — | — | — | — | — | — | educativa | educativa | Liga sin diferencias de altura conocidas entre sedes
| Copa Libertadores | — | — | — | — | — | — | — | educativa | educativa | Solo 54 partidos con diferencia de altura: pocos para estimar el efecto
| Champions League | — | — | — | — | — | — | — | educativa | educativa | Liga sin diferencias de altura conocidas entre sedes

## 9 · Apuestas juntas del mismo partido

Probabilidad conjunta sumando la matriz de marcadores (fuerza en el tiempo) frente a multiplicar las probabilidades sueltas. Log loss del evento conjunto.

| Liga | Combinación | Aciertos | log loss conjunta | log loss ingenua | Δ (conjunta − ingenua) |
| --- | --- | --- | --- | --- | --- |
| Liga BetPlay | O2.5 + BTTS-S | 147/381 | 0.6767 | 0.7453 | -0.0686 [-0.1038, -0.0344] |
| Liga BetPlay | 1 + O2.5 | 98/381 | 0.5522 | 0.5559 | -0.0037 [-0.0157, 0.0082] |
| Liga BetPlay | X + U2.5 | 86/381 | 0.5285 | 0.5545 | -0.0260 [-0.0460, -0.0067] |
| Premier League | O2.5 + BTTS-S | 38/100 | 0.6915 | 0.7135 | -0.0220 [-0.0825, 0.0374] |
| Premier League | 1 + O2.5 | 25/100 | 0.5643 | 0.5632 | 0.0011 [-0.0196, 0.0207] |
| Premier League | X + U2.5 | 17/100 | 0.4528 | 0.4621 | -0.0092 [-0.0524, 0.0274] |
| LaLiga | O2.5 + BTTS-S | 51/119 | 0.6510 | 0.6737 | -0.0226 [-0.0746, 0.0297] |
| LaLiga | 1 + O2.5 | 36/119 | 0.5830 | 0.5905 | -0.0075 [-0.0266, 0.0123] |
| LaLiga | X + U2.5 | 27/119 | 0.5166 | 0.5568 | -0.0402 [-0.0803, -0.0020] |
| Copa Libertadores | O2.5 + BTTS-S | 17/77 | 0.5635 | 0.5408 | 0.0227 [-0.0516, 0.0852] |
| Copa Libertadores | 1 + O2.5 | 18/77 | 0.5459 | 0.5571 | -0.0112 [-0.0386, 0.0147] |
| Copa Libertadores | X + U2.5 | 24/77 | 0.6350 | 0.6829 | -0.0478 [-0.0944, -0.0065] |
| Champions League | O2.5 + BTTS-S | 22/36 | 0.7207 | 0.7670 | -0.0463 [-0.1231, 0.0306] |
| Champions League | 1 + O2.5 | 16/36 | 0.6205 | 0.6346 | -0.0141 [-0.0411, 0.0121] |
| Champions League | X + U2.5 | 2/36 | 0.2388 | 0.2171 | 0.0217 [-0.0398, 0.0616] |

Decisión con las tres combinaciones juntas: Liga BetPlay -0.0328 [-0.0451, -0.0209] → **publicada** · Premier League -0.0101 [-0.0339, 0.0122] → educativa · LaLiga -0.0234 [-0.0407, -0.0060] → **publicada** · Copa Libertadores -0.0121 [-0.0396, 0.0163] → educativa · Champions League -0.0129 [-0.0423, 0.0139] → educativa

## 12 · Rangos de confiabilidad (conformal)

Sobre la probabilidad que ve el usuario (modelo actual mezclado 35/65 con la cuota de apertura). Criterio: cobertura real a ±2 puntos de la pedida.

| Liga | Calibración | n prueba | 80 % → real · tamaño medio | 90 % → real · tamaño | 95 % → real · tamaño | Decisión |
| --- | --- | --- | --- | --- | --- | --- |
| Liga BetPlay | primera mitad de los partidos con cuota (en el tiempo) | 165 | 75.8 % · 1.84 | 88.5 % · 2.30 | 93.9 % · 2.56 | educativa |
| Premier League | primera mitad de los partidos con cuota (en el tiempo) | 50 | 84.0 % · 2.04 | 94.0 % · 2.60 | 96.0 % · 2.74 | educativa |
| LaLiga | primera mitad de los partidos con cuota (en el tiempo) | 60 | 73.3 % · 1.53 | 81.7 % · 1.72 | 93.3 % · 2.48 | educativa |
| Copa Libertadores | primera mitad de los partidos con cuota (en el tiempo) | 0 | 0.0 % · 0.00 | 0.0 % · 0.00 | 0.0 % · 0.00 | educativa |
| Champions League | primera mitad de los partidos con cuota (en el tiempo) | 0 | 0.0 % · 0.00 | 0.0 % · 0.00 | 0.0 % · 0.00 | educativa |

Los rangos de probabilidad («58 % (54–62 %)») salen de la incertidumbre de la fuerza en el tiempo (200 sorteos); no tienen una prueba directa porque la probabilidad verdadera no se observa.

## 13 · Simulador de temporada

10.000 temporadas por liga con el formato de `lib/lab/formats/*.json`. Criterio: error estándar de cada porcentaje ≤ 0,5 puntos (el peor caso, p = 50 %, da exactamente 0,5). Se publica en las ligas donde su base (la fuerza en el tiempo) está publicada.

| Liga | Partidos por jugar | Simulaciones | Error estándar máx. | Tiempo | Decisión |
| --- | --- | --- | --- | --- | --- |
| Liga BetPlay | 3 | 10000 | 0.46 pts | 127 ms | **publicada** |
| Premier League | 280 | 10000 | 0.50 pts | 607 ms | **publicada** |
| LaLiga | 261 | 10000 | 0.50 pts | 624 ms | educativa |
