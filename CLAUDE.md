# Xpected — guía para Claude Code

Plan completo: `docs/plan.md`. Este repositorio es el MVP web de demostración (sin build, JS clásico,
router por hash). Ver `README.md` para estructura y comandos.

## Principios no negociables
1. Las probabilidades salen de `assets/js/quant.js` + `assets/js/data.js` (en producción, services/model). Nunca de un LLM.
2. Si cambias una fórmula, actualiza `tests/test-vectors.json` y corre `node tests/quant.test.js`.
3. Copy: nada de los términos de `docs/copy-rules.md`. Corre `node tools/lint-copy.js`.
4. Operadores: ningún enlace, logo, bono ni código fuera de `XP.cfg.operators` (vacía).
5. Movimiento: solo transform y opacity; variante `data-motion="reduce"`; nada parpadea más de 3 veces por segundo; sin celebraciones.
6. Toda predicción se congela con SHA-256 y hora antes del inicio y nunca se modifica.
7. Ninguna clave de API en el cliente.

## Comandos
node server.js | node tests/quant.test.js | node tools/lint-copy.js

## Fase 6 — Laboratorio Pro (reglas de conservación)
Lo que ya está construido quedó muy bien y se mantiene así. En esta fase:
- Solo se agrega. No rediseñar, renombrar ni mover rutas, componentes, tokens,
  animaciones o textos existentes.
- Todo lo nuevo vive en assets/js/lab/ (UI, equivale a features/lab/) y lib/lab/ (modelos, equivale a
  services/model/lab/), y reutiliza el sistema de diseño, los tokens de movimiento y los componentes base actuales.
- Migraciones solo aditivas (aquí: archivos JSON nuevos en data/lab/). Ningún endpoint existente cambia su contrato.
- Cada estrategia va detrás de strategy_flags (lib/lab/strategy-flags.json: apagada | educativa | publicada).
- Las pruebas de regresión de las pantallas existentes deben pasar sin cambios
  (node tools/lab-baseline.js check + tools/lab-dom-signature.js en el navegador).
- Si tocar algo existente parece imprescindible: proponerlo en un ADR y esperar aprobación
  (puntos de enganche aprobados: docs/lab/adr-001-puntos-de-enganche.md; adaptación al stack: docs/lab/adr-002).
- Copy del laboratorio: palabras simples, sin nombres técnicos ni fórmulas a la vista del usuario.
Plan completo: docs/plan-fase-6.md.
