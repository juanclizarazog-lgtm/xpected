# Fase 6 · Reporte P2b: estrategias 6, 7 y 8

Generado por `node tools/lab-backtest.js` el 2026-11-09 00:18 UTC con `data/lab/history.json` (marcadores públicos de ESPN, solo desarrollo).

Método: paso a paso en el tiempo (cada pronóstico usa solo lo anterior al partido). Comparación contra el **modelo actual** (`lib/model.js` con la tabla de ese día, sin cuotas). Δ = nuevo − actual (negativo = mejor), con intervalo del 95 % por remuestreo de partidos. Regla: se publica solo si el intervalo de Δ log loss o de Δ RPS queda entero bajo cero; si no, «educativa». Semáforo (Parte 2): alta = ECE ≤ 0,02 y n ≥ 1.000 · media = ECE ≤ 0,04 o 300 ≤ n < 1.000 · baja = lo demás · educativa = no publicada.

| Liga | Partición | Entrena | Prueba | Modelo actual: log loss · RPS · ECE | Casa al cierre (log loss, mismos partidos) |
| --- | --- | --- | --- | --- | --- |
| Liga BetPlay | temporadas anteriores → temporada actual | 883 | 381 | 1.0666 · 0.2169 · 0.0343 | 0.9970 (actual 1.0714, n 329) |
| Premier League | temporadas anteriores → temporada actual | 380 | 100 | 1.0843 · 0.2297 · 0.0462 | 1.0153 (actual 1.0904, n 99) |
| LaLiga | temporadas anteriores → temporada actual | 380 | 119 | 1.0043 · 0.2071 · 0.0337 | 0.9000 (actual 1.0043, n 119) |
| Copa Libertadores | primera mitad → segunda mitad de la temporada | 77 | 77 | 1.1012 · 0.2228 · 0.0853 | — |
| Champions League | primera mitad → segunda mitad de la temporada | 36 | 36 | 0.9390 · 0.2250 · 0.0699 | — |

## 6 · Peligro de gol ahora (proceso autoexcitado)

Prueba: probabilidad de gol en los 10 minutos siguientes, en los minutos 0, 10, …, 80 de cada partido, contra la misma intensidad sin «calentamiento» tras un gol o una expulsión.

| Liga | Ventanas | α · β ajustados | log loss | log loss sin calentamiento | Δ | ECE | Decisión |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Liga BetPlay | 3429 | 0 · 1/4 min | 0.5499 | 0.5499 | 0.0000 [0.0000, 0.0000] | 0.0093 | educativa |
| Premier League | 900 | 0 · 1/4 min | 0.5664 | 0.5664 | 0.0000 [0.0000, 0.0000] | 0.0263 | educativa |
| LaLiga | 1071 | 0 · 1/4 min | 0.5776 | 0.5776 | 0.0000 [0.0000, 0.0000] | 0.0114 | educativa |

Si α = 0, los datos no muestran que un gol «caliente» el partido más allá de lo que ya explica el marcador; el termómetro queda como herramienta educativa.

## 7 · Movimientos fuertes de cuota

La fuente actual trae una sola casa: un movimiento fuerte exige 3 o más casas moviéndose a la vez. Sin porcentaje de apuestas del público tampoco hay movimiento inverso. El detector está implementado y probado (`tests/lab.test.js`) y se activa solo cuando haya 3 o más casas. Mientras tanto se muestra la línea de la casa de referencia.

## 8 · ¿Subirá o bajará la cuota? (apertura → cierre)

Regresión ridge (adaptación de LightGBM). Criterio: error absoluto medio de la probabilidad de cierre menor que «la cuota no se mueve», con intervalo bajo cero.

| Liga | Partición | Entrena | Prueba | Error modelo | Error «no se mueve» | Δ | Dirección acertada (movimientos > 0,5 pts) | Decisión |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Liga BetPlay | primer 60 % de los partidos con cuota (en el tiempo) | 197 | 132 | 0.0287 | 0.0284 | 0.0003 [-0.0004, 0.0010] | 54.6 % (n 229) | educativa |
| Premier League | primer 60 % de los partidos con cuota (en el tiempo) | 59 | 40 | 0.0243 | 0.0227 | 0.0016 [-0.0002, 0.0034] | 50.0 % (n 66) | educativa |
| LaLiga | primer 60 % de los partidos con cuota (en el tiempo) | 71 | 48 | 0.0247 | 0.0283 | -0.0036 [-0.0068, -0.0001] | 71.8 % (n 110) | **publicada** |
