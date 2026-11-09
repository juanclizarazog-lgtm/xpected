# Fase 6 · Reporte P2a: estrategias 3 y 4

Generado por `node tools/lab-backtest.js` el 2026-11-09 00:18 UTC con `data/lab/history.json` (marcadores públicos de ESPN, solo desarrollo).

Método: paso a paso en el tiempo (cada pronóstico usa solo lo anterior al partido). Comparación contra el **modelo actual** (`lib/model.js` con la tabla de ese día, sin cuotas). Δ = nuevo − actual (negativo = mejor), con intervalo del 95 % por remuestreo de partidos. Regla: se publica solo si el intervalo de Δ log loss o de Δ RPS queda entero bajo cero; si no, «educativa». Semáforo (Parte 2): alta = ECE ≤ 0,02 y n ≥ 1.000 · media = ECE ≤ 0,04 o 300 ≤ n < 1.000 · baja = lo demás · educativa = no publicada.

| Liga | Partición | Entrena | Prueba | Modelo actual: log loss · RPS · ECE | Casa al cierre (log loss, mismos partidos) |
| --- | --- | --- | --- | --- | --- |
| Liga BetPlay | temporadas anteriores → temporada actual | 883 | 381 | 1.0666 · 0.2169 · 0.0343 | 0.9970 (actual 1.0714, n 329) |
| Premier League | temporadas anteriores → temporada actual | 380 | 100 | 1.0843 · 0.2297 · 0.0462 | 1.0153 (actual 1.0904, n 99) |
| LaLiga | temporadas anteriores → temporada actual | 380 | 119 | 1.0043 · 0.2071 · 0.0337 | 0.9000 (actual 1.0043, n 119) |
| Copa Libertadores | primera mitad → segunda mitad de la temporada | 77 | 77 | 1.1012 · 0.2228 · 0.0853 | — |
| Champions League | primera mitad → segunda mitad de la temporada | 36 | 36 | 0.9390 · 0.2250 · 0.0699 | — |

## 3 · Alineaciones (más-menos regularizado)

Notas de jugadores con ridge sobre tramos entre cambios. Partición: Liga BetPlay: temporadas anteriores · Premier League: — · LaLiga: — · Copa Libertadores: — · Champions League: —. Se exige mejorar al modelo actual **y** a la fuerza en el tiempo sola (Δ vs su base).

| Liga | n | log loss | RPS | ECE | Δ log loss vs actual | Δ RPS vs actual | Δ vs su base | Decisión | Semáforo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Liga BetPlay | 329 | 1.0105 | 0.1997 | 0.0290 | -0.0573 [-0.0826, -0.0318] | — | -0.0003 [-0.0081, 0.0076] | educativa | educativa |
| Premier League | — | — | — | — | — | — | — | educativa | educativa | La fuente solo trae 99 partidos con alineación: pocos para calificar jugadores
| LaLiga | — | — | — | — | — | — | — | educativa | educativa | La fuente solo trae 119 partidos con alineación: pocos para calificar jugadores
| Copa Libertadores | — | — | — | — | — | — | — | educativa | educativa | La fuente solo trae 0 partidos con alineación: pocos para calificar jugadores
| Champions League | — | — | — | — | — | — | — | educativa | educativa | La fuente solo trae 0 partidos con alineación: pocos para calificar jugadores

## 4 · Por qué este porcentaje (pi-ratings + modelo ordenado + Shapley exacto)

Factores: jugar en casa, nivel de los equipos (pi-ratings), forma (últimos 5), días de descanso, altura. Se mezcla con el modelo actual solo si mejora.

| Liga | n | log loss | RPS | ECE | Δ log loss vs actual | Δ RPS vs actual | Δ vs su base | Decisión | Semáforo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Liga BetPlay | 381 | 1.0211 | 0.2021 | 0.0422 | -0.0455 [-0.0757, -0.0148] | -0.0149 [-0.0240, -0.0057] | — | **publicada** | media |
| Premier League | 100 | 1.0380 | 0.2147 | 0.0319 | -0.0463 [-0.0999, 0.0024] | -0.0150 [-0.0326, 0.0037] | — | educativa | educativa |
| LaLiga | 119 | 0.9795 | 0.1981 | 0.0233 | -0.0248 [-0.0793, 0.0251] | -0.0090 [-0.0267, 0.0073] | — | educativa | educativa |
| Copa Libertadores | — | — | — | — | — | — | — | educativa | educativa | Pocos partidos para entrenar
| Champions League | — | — | — | — | — | — | — | educativa | educativa | Pocos partidos para entrenar

