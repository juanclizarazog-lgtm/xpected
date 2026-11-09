# ADR-002 · Adaptación del plan al stack real

Estado: aceptado. El plan se escribió sin ver el código y pide «adaptar los nombres de archivos y componentes a los que
realmente existen». El proyecto es deliberadamente **sin dependencias** (sin npm, sin build, sin Python). Cada pieza se
reemplaza por un equivalente propio, probado y documentado; nada se descarga ni se instala.

| Plan | Equivalente en este repositorio | Qué se pierde o cambia |
| --- | --- | --- |
| `features/lab/` | `assets/js/lab/` (carga diferida: solo `lab-boot.js` va en el paquete inicial) | — |
| `services/model/lab/*.py` | `lib/lab/*.js` (Node) | Mismo método, implementación propia |
| `packages/quant` (TS y Python) | `assets/js/lab/lab-quant.js` (UMD: navegador y Node) + vectores en `tests/lab.test.js` | Una sola implementación en lugar de dos |
| Tablas SQL (`team_strength_states`, …) | Archivos JSON en `data/lab/` (servidor, nunca servidos al público) | Sin migraciones: solo archivos nuevos |
| `strategy_flags` | `lib/lab/strategy-flags.json` + `lib/lab/flags.js`, expuesto en `/api/lab/overview` | — |
| PyMC / NumPyro (jerárquico) | Bayes empírico: τ² por momentos y encogimiento analítico | Sin muestreo MCMC; la fórmula de encogimiento es la misma |
| Filtro de Kalman (NumPy) | Filtro de Kalman extendido propio para goles de Poisson; Q y ρ ajustados en la temporada anterior | — |
| CatBoost + SHAP | Pi-ratings + regresión logística ordenada propia + **valores de Shapley exactos** (4 factores, 16 coaliciones) | Sin árboles de decisión; la explicación es exacta, no aproximada |
| scikit-learn (ridge) / socceraction (VAEP) | Ridge propio (más-menos regularizado) con alineaciones y cambios de ESPN | Sin VAEP: no hay eventos por acción licenciados |
| LightGBM (predicción del cierre) | Regresión ridge sobre apertura → cierre | Menos flexible; se evalúa igual (dirección y error) |
| statsmodels (conteos) | Binomial negativa propia; dispersión por momentos | Sin efecto árbitro: ESPN no publica el árbitro |
| MAPIE (conformal) | Conformal dividido propio (puntaje 1 − p̂ para 1X2; distancia del PIT para conteos) | — |
| CVXPY (Kelly con caída) | Restricción de Busseti-Ryu-Boyd evaluada exactamente enumerando los 2ⁿ resultados (n ≤ 10) + búsqueda 1-D | Solo apuestas independientes (el boleto ya permite una por partido) |
| formatos `*.yaml` | `lib/lab/formats/*.json` (sin parser YAML) | — |
| Storybook | Ruta `#/laboratorio/catalogo`: la tarjeta en sus estados alta, media, baja y educativa | — |
| Playwright `toHaveScreenshot` | Firma de pantallas en el navegador (`tools/lab-dom-signature.js`): menús, pestañas, títulos, tokens, estilos calculados y geometría, en oscuro, claro, móvil y movimiento reducido; + `tools/lab-baseline.js check` (ningún archivo existente pierde ni cambia líneas) | No compara píxeles: compara estructura y estilos calculados |
| Lighthouse CI | Tamaño del paquete inicial en `docs/lab/linea-base.json` | Sin métricas de Core Web Vitals |
| zod (contratos) | Los endpoints existentes no se tocan; los nuevos viven bajo `/api/lab/*` | — |

Fuente de datos: marcadores públicos de ESPN (resultados, minutos de goles y tarjetas, córners, apertura y cierre de la
cuota de referencia, alineaciones y cambios). Uso solo para desarrollo, igual que el resto de la app
(`docs/data-licenses.md`). No hay árbitro asignado ni porcentaje de apuestas del público.
