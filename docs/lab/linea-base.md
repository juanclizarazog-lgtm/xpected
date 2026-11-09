# Fase 6 · Línea base de no regresión (8 nov 2026, antes de tocar cualquier archivo)

## 1. Archivos existentes
`node tools/lab-baseline.js save` guardó huella SHA-256, tamaño y líneas de los 34 archivos existentes en
`docs/lab/linea-base.json` (y una copia en `data/lab/baseline/`, privada). `node tools/lab-baseline.js check` exige:
- ningún archivo existente borrado;
- ninguna línea original modificada o borrada (solo inserciones);
- solo cambian los puntos de enganche de `docs/lab/adr-001-puntos-de-enganche.md`.

## 2. Paquete inicial
**453,4 KB** (index.html + styles.css + experience.css + los 16 scripts de `assets/js/`). Regla: el laboratorio se
carga solo en sus rutas; el paquete inicial solo puede crecer lo que pesan el cargador `lab-boot.js` y los enlaces.

## 3. Firma de pantallas
`docs/lab/linea-base-dom.json`: 26 rutas existentes (inicio, partidos, valor, cuotas, historial, 7 calculadoras,
6 pestañas de un partido, 6 páginas de información y «No encontrado») × 4 modos:
oscuro, claro y movimiento reducido a 1280 × 800, y móvil a 375 × 812. Por ruta se firma: título, estilos calculados
del título y las pestañas, geometría del contenedor y, en pantallas sin datos en vivo, subtítulos, tarjetas y botones.
Por modo: textos de los tres menús, valores de los 31 tokens de diseño y estilos de la estructura base.
Se comprobó que la firma es estable: dos capturas seguidas sin cambios de código dan el mismo resultado.

## 4. Pruebas existentes
`node tests/quant.test.js` 68 ✓ · `node tests/model.test.js` 64 ✓ · `node tools/lint-copy.js` 0 términos prohibidos.

## Lo que no cubre (ver ADR-002)
No compara píxeles (no hay Playwright sin instalar dependencias) ni mide Core Web Vitals (no hay Lighthouse).
