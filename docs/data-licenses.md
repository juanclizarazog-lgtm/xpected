# Licencias de datos

Regla del plan: registrar aquí la licencia de cada fuente **antes** de usarla en producción.

| Fuente | Licencia | Uso comercial | Atribución | Estado |
| --- | --- | --- | --- | --- |
| Marcadores públicos de ESPN (`lib/espn.js`): partidos, resultados, goles, tarjetas, tablas, logos y cuota de referencia | API no documentada; sin licencia comercial | **No** sin acuerdo | Se cita en el pie | **En uso solo para desarrollo** — reemplazar por proveedor licenciado antes del lanzamiento |
| Cuota de referencia que publica ESPN (casa no autorizada por Coljuegos) | Del operador | No | — | Se muestra anonimizada («Casa de referencia»), sin marca ni enlaces |
| Logos de clubes y ligas | Marcas de cada club | Revisar | Propiedad de sus clubes | Se cargan desde la CDN de la fuente; revisar uso antes del lanzamiento |
| Datos de demostración (`assets/js/data.js`) | Generados por el propio código | Sí | No aplica | Respaldo si la fuente no responde (`node server.js --demo`) |
| Sportmonks (fútbol + xG) | Contrato del proveedor | Por confirmar | Por confirmar | Pendiente |
| The Odds API v4 (adaptador en `server.js`) | Términos del proveedor | Revisar plan contratado | Revisar | Integrado, sin clave configurada |
| StatsBomb Open Data, nflverse, pybaseball, datos de tenis de J. Sackmann | Revisar cada licencia | Varias lo prohíben | Exigida en varias | Solo investigación |

Los nombres de equipos se usan como referencia factual; no se muestran escudos ni marcas registradas.
