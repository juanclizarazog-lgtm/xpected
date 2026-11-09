# Reglas de copy (Parte III del plan)

`tools/lint-copy.js` aplica esta tabla y falla si encuentra un término prohibido.

| Prohibido | Se reemplaza por |
| --- | --- |
| «Fija», «segura», «lock», «100 %» | Probabilidad con intervalo: «58 % (54–62 %)» |
| «% de aciertos» como métrica principal | Calibración, log loss y CLV con muestra visible |
| Promesas de ganancia o ingresos | «Valor esperado estimado» y su incertidumbre |
| Ocultar rachas perdedoras | Historial completo, sin borrar picks, con sello de tiempo |
| Urgencia artificial («últimos minutos») | Hora de la última actualización de la cuota |

Además: las probabilidades nunca se muestran como 0 % ni como el máximo absoluto (`XP.fmt.prob` recorta), y
no se celebran apuestas ganadas.
