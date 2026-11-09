# Plan maestro: plataforma de pronósticos deportivos con IA (2026)

Nov 7, 2026 · @Juan Camilo

## Resumen ejecutivo

La propuesta: una plataforma web en español que publica la probabilidad real de cada partido (modelo estadístico mezclado con el mercado sin margen), su valor esperado frente a las cuotas, explicaciones con IA y una página pública de calibración y CLV, todo actualizado en vivo y con diseño de nivel premio. Ningún modelo garantiza ganancias; el producto vende comprensión y probabilidades honestas, y lo demuestra en público.

**Cómo usar este documento:** las Partes I a VII son la investigación; las Partes VIII a XII son la especificación para Claude Code. Para empezar a construir, ve directo a la Parte XII.

### Decisiones clave

| Tema | Decisión |
| --- | --- |
| Deportes | Fútbol primero (Premier League, LaLiga, Liga BetPlay; luego Libertadores) con xG, Dixon-Coles y Elo; NBA, tenis, MLB, NFL y NHL en la fase 5 |
| Diferencial | Transparencia total: predicciones congeladas con hash, curva de calibración y CLV públicos; modo "Aprender" con las fórmulas |
| Métrica de calidad | Calibración, log loss y CLV frente al cierre de casas afiladas; nunca "% de aciertos" |
| IA | Explica y navega con herramientas propias; nunca genera probabilidades |
| Stack | Next.js 16 + Python + Postgres + Redis + SSE; Motion, GSAP, Rive y Three.js WebGPU para el movimiento |
| Datos | Licenciados desde el día uno: Sportmonks + proveedor de cuotas con Pinnacle y WebSocket |
| Cumplimiento | Servicio informativo 18+; cero promoción de operadores no autorizados por Coljuegos; juego responsable integrado |
| Costo del MVP | Estimado entre US$390 y US$800 al mes en datos, IA y hosting |
| Tiempo al MVP en vivo con IA | Unas 10–11 semanas a tiempo parcial (fases 0 a 4) |

### Supuestos (cámbialos si no aplican)

- Público: aficionados y apostadores recreativos mayores de 18 en Colombia y Latinoamérica; interfaz en español con inglés secundario.
- Modelo de negocio freemium sin afiliación a casas no autorizadas.
- Nombre de trabajo "Xpected", provisional.
- Este plan no es asesoría legal ni financiera: la Parte VI lista lo que debe validar un abogado antes del lanzamiento.

## Parte I — Fundamentos cuantitativos

El producto vale lo que valen sus probabilidades: el motor convierte cuotas en probabilidad justa, la compara con la del modelo y mide el desempeño con calibración y CLV, nunca con "% de aciertos". Cada fórmula de esta parte se implementa como función pura y testeada en `packages/quant`.

### 1. Probabilidad implícita

Una cuota decimal *o* paga *o* unidades por unidad apostada (incluye la apuesta). Su probabilidad implícita *q* es el inverso. Para cuotas americanas *A*: si A > 0, q = 100/(A+100); si A < 0, q = |A|/(|A|+100).

```latex
q_i = \frac{1}{o_i}
```

### 2. Margen de la casa (overround o vig)

La suma de probabilidades implícitas *B* supera 1; el exceso es el margen. Un 1X2 a 1.90 / 3.50 / 5.00 da B = 0.526 + 0.286 + 0.200 = 1.012, o sea 1.2 % de margen; el margen típico de un libro blando ronda 4–8 %, frente a 2–3 % en Pinnacle o Betfair ([market efficiency](https://sports-models-kb.pages.dev/market-efficiency)).

```latex
B = \sum_{i=1}^{n} q_i, \qquad \text{margen} = B - 1
```

### 3. Quitar el margen (devig)

Para obtener la probabilidad "justa" *p* hay que repartir el margen entre los resultados; cada método supone algo distinto sobre cómo lo cargó la casa ([Compare n' Bet](https://comparenbet.pages.dev/guide-devigging-methods)).

- **Multiplicativo (proporcional):** divide cada *q* por *B*. Correcto en mercados de dos vías equilibrados.
- **Potencia:** busca el exponente *k* tal que la suma de q^k sea 1; recorta más a los underdogs y corrige el sesgo favorito–longshot ([OddsPapi](https://oddspapi.io/blog/?p=3089)).
- **Shin:** modela una proporción *z* de apostadores informados; es el estándar académico para mercados con sesgo favorito–longshot, pero en un moneyline eficiente de dos vías ajusta en la dirección equivocada.

```latex
p_i^{\text{mult}} = \frac{q_i}{B} \qquad p_i^{\text{pot}} = q_i^{\,k}\ \text{con}\ \sum_i q_i^{\,k} = 1 \qquad p_i^{\text{Shin}} = \frac{\sqrt{z^2 + 4(1-z)\,q_i^2/B} - z}{2(1-z)}
```

Decisión de producto: Shin por defecto en 1X2 de fútbol y mercados con longshots; multiplicativo en dos vías de libros afilados; el usuario avanzado puede cambiarlo y ver las tres cifras lado a lado.

### 4. Valor esperado (EV) y ventaja

El EV por unidad apostada compara la probabilidad del modelo *p* con la cuota ofrecida *o*. Ejemplo: p = 0.55 a cuota 2.00 da EV = 0.55·2.00 − 1 = +10 %. La plataforma solo marca "valor" si el EV supera un umbral que crece con la incertidumbre del modelo.

```latex
\mathrm{EV} = p\,(o-1) - (1-p) = p \cdot o - 1
```

### 5. Tamaño de apuesta: criterio de Kelly

Kelly da la fracción *f\** de la banca que maximiza el crecimiento logarítmico, con b = o − 1 como ganancia neta. Como *p* es una estimación con error, se usa Kelly fraccional (κ entre 0.25 y 0.5); una revisión experimental en fútbol, baloncesto e hípica halló que las estrategias "teóricamente óptimas" a menudo llevaban a la ruina sin control de riesgo adicional ([Uhrín et al., arXiv 2107.08827](https://arxiv.org/pdf/2107.08827)).

```latex
f^{*} = \frac{b\,p - (1-p)}{b} = \frac{p\,o - 1}{o - 1}, \qquad f = \kappa\, f^{*},\ \ \kappa \in [0.25,\ 0.5]
```

### 6. Closing Line Value (CLV)

CLV mide si la cuota tomada fue mejor que la de cierre sin margen de un mercado afilado. Es el indicador adelantado más fiable de rentabilidad, pero solo contra un cierre que "sabe": Pinnacle, Betfair Exchange o hándicap asiático, no el cierre de un libro blando ([The Spread](https://www.thespread.com/?p=550721)).

```latex
\mathrm{CLV} = \frac{o_{\text{tomada}}}{1/p^{\text{justa}}_{\text{cierre}}} - 1 = o_{\text{tomada}} \cdot p^{\text{justa}}_{\text{cierre}} - 1
```

### 7. Calibración: la métrica que manda

Un modelo calibrado dice 60 % y acierta \~60 % de esas veces. En un estudio con NBA, elegir el modelo por calibración en vez de por exactitud dio un ROI de +34.69 % frente a −35.17 % ([Walsh y Joshi, 2024](https://researchportal.bath.ac.uk/en/publications/machine-learning-for-sports-betting-should-model-selection-be-bas/)). Se reportan tres métricas: Brier, log loss y RPS (para resultados ordenados como 1X2).

```latex
\mathrm{Brier} = \frac{1}{N}\sum_{i=1}^{N}(p_i - y_i)^2 \qquad \mathrm{LogLoss} = -\frac{1}{N}\sum_{i=1}^{N}\left[y_i \ln p_i + (1-y_i)\ln(1-p_i)\right]
```

```latex
\mathrm{RPS} = \frac{1}{r-1}\sum_{k=1}^{r-1}\Big(\sum_{j=1}^{k} p_j - \sum_{j=1}^{k} e_j\Big)^2
```

### 8. Eficiencia de mercado: el rival real

El cierre de las casas afiladas supera a modelos, tipsters y consensos en estudios de varios deportes, así que el benchmark interno siempre es "¿le ganamos al cierre?" ([Compare n' Bet](https://comparenbet.pages.dev/guide-market-efficiency)). Aun así hay ineficiencias medibles: en 3,681 partidos de MLB las líneas sobrerreaccionan con cambios autocorrelacionados negativamente ([Management Science](https://pubsonline.informs.org/doi/fpi/10.1287/mnsc.2022.00456)), y los totales de NBA muestran sesgo al inicio de temporada ([ETSU](https://dc.etsu.edu/etsu-works/17780)).

| Concepto | Qué responde | Dónde vive en la app |
| --- | --- | --- |
| Probabilidad implícita y devig | ¿Qué cree el mercado? | Tarjeta de partido, comparador de cuotas |
| EV | ¿Esta cuota paga más de lo que vale? | Radar de valor, filtro "+EV" |
| Kelly fraccional | ¿Cuánto arriesgar? | Calculadora de stake y simulador de banca |
| CLV | ¿Le ganamos al cierre? | Historial del usuario y página de transparencia |
| Brier / log loss / RPS | ¿Las probabilidades son honestas? | Página pública de rendimiento del modelo |

## Parte II — Modelos por deporte

Cada deporte tiene su "valor esperado" propio (xG en fútbol, EPA en NFL, xwOBA en MLB, GSAx en NHL), pero todos terminan igual: una distribución de resultados → probabilidades por mercado → mezcla con el mercado → EV. El MVP lanza fútbol completo y NBA; el resto entra por fases.

| Deporte | Métrica "esperada" clave | Modelo base | Mercados derivados | Factor que más mueve la línea |
| --- | --- | --- | --- | --- |
| Fútbol | xG / xGA, xT | Poisson + Dixon-Coles con fuerzas ataque/defensa, Elo como prior | 1X2, doble oportunidad, marcador exacto, over/under, BTTS, hándicap asiático | Alineaciones, rotación, calendario |
| Baloncesto (NBA) | Net rating, pace, eficiencia por posesión | Posesiones × eficiencia + simulación Monte Carlo | Spread, total, moneyline, props de jugador | Bajas y minutos proyectados |
| Fútbol americano (NFL) | EPA por jugada, éxito | Elo ajustado (QB, descanso, localía) + EPA | Spread, total, moneyline | Estado del QB |
| Tenis | % puntos ganados al saque y al resto | Elo por superficie + modelo de puntos iid | Ganador, hándicap de juegos, total de juegos | Superficie y fatiga |
| Béisbol (MLB) | xwOBA, SIERA/xERA | Carreras esperadas por equipo + Pitágoras | Moneyline, run line, totales, props de ponches | Lanzador abridor |
| Hockey (NHL) | xG%, GSAx | xG a 5v5 + ajuste de portero | Moneyline, puck line, totales | Portero titular |

### Fútbol: xG, Poisson y Dixon-Coles

El xG asigna a cada tiro su probabilidad de ser gol (0 a 1); el xG del equipo es la suma ([Sportmonks](https://www.sportmonks.com/glossary/algorithm-predictive-modeling/)). Los goles de cada equipo se modelan como Poisson con media λ (local) y μ (visitante), construidas con ataque α, defensa β y localía γ, estimadas con máxima verosimilitud ponderada en el tiempo.

```latex
P(X = x) = \frac{\lambda^{x} e^{-\lambda}}{x!}, \qquad \lambda_k = \exp(\alpha_{i} + \beta_{j} + \gamma), \qquad \mu_k = \exp(\alpha_{j} + \beta_{i})
```

Poisson independiente subestima empates; Dixon y Coles (1997) añaden un factor τ con parámetro ρ que corrige 0-0, 1-0, 0-1 y 1-1, y su modelo sigue siendo referencia en la industria ([Akgül, 2025](https://urazakgul.github.io/datafc-blog/posts/en/post3/better-predictions-for-football-matches-how-does-the-dixon-coles-model-work.html); [Petretta et al., 2025](https://unifind.unipd.it/resource/item/868244)).

```latex
P(X=x, Y=y) = \tau_{\lambda,\mu}(x,y)\,\frac{\lambda^{x}e^{-\lambda}}{x!}\,\frac{\mu^{y}e^{-\mu}}{y!}, \qquad \tau = \begin{cases} 1-\lambda\mu\rho & (0,0) \\ 1+\lambda\rho & (0,1) \\ 1+\mu\rho & (1,0) \\ 1-\rho & (1,1) \\ 1 & \text{otro} \end{cases}
```

De la matriz de marcadores 0–0 a 10–10 salen todos los mercados: 1X2 suma la triangular, over 2.5 suma x+y ≥ 3, BTTS suma x,y ≥ 1. En vivo se reescala la intensidad por el tiempo restante (λ·min\_restantes/90) y se ajusta por expulsiones y estado del marcador ([TheStatsAPI](https://www.thestatsapi.com/tools/poisson-score-predictor)).

### Elo: el prior común a todos los deportes

Elo da una fuerza dinámica por equipo o jugador y sirve de prior y de rasgo en todos los modelos. *K* controla la velocidad de actualización; en tenis se mantiene un Elo por superficie.

```latex
E_A = \frac{1}{1 + 10^{(R_B - R_A)/400}}, \qquad R_A' = R_A + K\,(S_A - E_A)
```

### Baloncesto (NBA)

Los puntos esperados de un equipo son posesiones × eficiencia; el spread sale de la diferencia de net rating ajustada por localía y descanso. Los props se proyectan como minutos × tasa por minuto, con distribución binomial negativa para conteos. Las bajas de última hora son el insumo crítico: el pipeline de lesiones debe disparar recomputación inmediata.

```latex
\text{Pts}_A = \text{Pace} \cdot \frac{\text{ORtg}_A + \text{DRtg}_B - \overline{\text{Rtg}}}{100}
```

### Fútbol americano (NFL)

El EPA mide cuántos puntos esperados añade cada jugada según down, distancia y posición; el promedio de liga es 0 y las ofensivas de élite sostienen +0.10 a +0.20 por jugada ([nfelo](https://www.nfeloapp.com/live/qb-epa)). nfelo parte de Elo, ajusta por localía, descanso y QB, y luego regresa su diferencia hacia el mercado antes de traducirla a spread ([nfelo](https://www.nfeloapp.com/games/2024-week-22-chiefs-at-eagles-betting-preview)): ese "shrink al mercado" se adopta en todos los deportes.

```latex
\mathrm{EPA} = EP_{\text{después}} - EP_{\text{antes}}
```

### Tenis

El modelo de puntos supone que cada punto al saque se gana con probabilidad *p* independiente y deriva juego, set y partido algebraicamente ([Kovalchik, 2016](https://www.degruyterbrill.com/document/doi/10.1515/jqas-2015-0059/html)). En Wimbledon 2018–19 las cuotas rindieron mejor, con Elo por superficie fuerte en hombres y Elo estándar en mujeres ([NTU](https://irep.ntu.ac.uk/id/eprint/42038)).

```latex
G(p) = p^{4}\left(1 + 4q + 10q^{2}\right) + 20\,p^{3}q^{3}\,\frac{p^{2}}{1 - 2pq}, \qquad q = 1 - p
```

### Béisbol (MLB)

xwOBA usa velocidad de salida y ángulo de Statcast para quitar la suerte del bateo; SIERA o xERA aíslan la habilidad del lanzador ([UConn](https://statds.org/events/ucsas2021/posters/ucsas2021_10_Miles_Kee.pdf)). Las carreras proyectadas mezclan abridor y bullpen por innings esperados, se ajustan por estadio y clima, y se pasan a probabilidad con Pitágoras (exponente ≈ 1.83).

```latex
W\% = \frac{RS^{1.83}}{RS^{1.83} + RA^{1.83}}
```

### Hockey (NHL)

La calidad de tiro a 5v5 (xG%) describe al equipo y GSAx/60 al portero; el diferencial entre titular y suplente puede mover varios puntos de probabilidad, así que la confirmación del portero dispara recomputación ([theScore](https://www.thescore.com/nhl/news/2866089)).

### Mezcla con el mercado

La probabilidad publicada no es la del modelo crudo: se combina en escala logit con la probabilidad sin margen del mercado afilado, con un peso *w* aprendido por deporte y liga en backtests. Si el modelo no mejora el log loss del mercado en una liga, esa liga se publica como "solo mercado" y no se marcan apuestas de valor.

```latex
\operatorname{logit}(p_{\text{final}}) = w\,\operatorname{logit}(p_{\text{modelo}}) + (1-w)\,\operatorname{logit}(p_{\text{mercado}})
```

## Parte III — Riesgo, gestión de banca y límites honestos

La promesa del producto es "probabilidades honestas y herramientas para decidir", no "picks que ganan": el cierre de las casas afiladas es muy difícil de batir y la varianza esconde la habilidad durante cientos de apuestas. Esta parte fija las reglas que el código y el copy deben respetar.

### 1. La varianza manda en muestras pequeñas

Con stake plano a cuota *o* y probabilidad real *p*, el ROI medio de *N* apuestas tiene desviación estándar *σ*. A cuota 2.00 y p = 0.5, tras 500 apuestas σ ≈ 4.5 puntos de ROI: una ventaja real de +3 % es indistinguible de la suerte. Por eso la app muestra intervalos de confianza junto a cada ROI y un contador de "apuestas necesarias para que el resultado sea significativo".

```latex
\sigma_{\mathrm{ROI}} = o\,\sqrt{\frac{p(1-p)}{N}}, \qquad N_{\min} \approx \left(\frac{z\,o\,\sqrt{p(1-p)}}{\text{ventaja}}\right)^{2}
```

Con z = 1.96, o = 2.00, p = 0.5 y ventaja del 3 %, N\_min ≈ 4,268 apuestas. Ese número va en la página de transparencia.

### 2. Reglas de gestión de banca en las herramientas

- Kelly fraccional por defecto (κ = 0.25) con tope duro de 2 % de la banca por apuesta y 10 % de exposición simultánea.
- Apuestas correlacionadas (mismo partido, mismo jugador) cuentan como una sola exposición.
- El simulador de banca corre 10,000 trayectorias Monte Carlo y muestra percentiles 5–50–95, caída máxima y probabilidad de perder 50 % de la banca.
- Las combinadas (parlays) nunca se etiquetan como "valor" por defecto: el margen de cada pierna se multiplica.

### 3. Lo que el producto nunca dice

| Prohibido | Se reemplaza por |
| --- | --- |
| "Fija", "segura", "lock", "100 %" | Probabilidad con intervalo: "58 % (54–62 %)" |
| "% de aciertos" como métrica principal | Calibración, log loss y CLV con muestra visible |
| Promesas de ganancia o ingresos | "Valor esperado estimado" y su incertidumbre |
| Ocultar rachas perdedoras | Historial completo, sin borrar picks, con sello de tiempo |
| Urgencia artificial ("últimos minutos") | Hora de la última actualización de la cuota |

### 4. Transparencia como ventaja competitiva

Cada predicción se congela con sello de tiempo y hash antes del inicio del evento y se califica automáticamente. La página pública de rendimiento muestra curva de calibración, log loss frente al mercado, CLV medio y ROI hipotético con intervalo, por deporte y liga. Casi ningún competidor publica esto con rigor; es el diferenciador más barato y más creíble.

### 5. Riesgos del negocio

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| El modelo no supera al mercado en una liga | Credibilidad | Publicar esa liga como "solo mercado"; no marcar valor |
| Costo y licencia de datos en tiempo real | Margen, legal | Empezar con planes de entrada, cachear, no redistribuir cuotas crudas |
| Regulación y publicidad de juego | Bloqueo del sitio | Ver Parte VI: sin enlaces a operadores no autorizados |
| Usuarios vulnerables o menores | Daño real | Verificación de edad, límites, autoexclusión, mensajes de juego responsable |
| Dependencia de un proveedor de IA | Costo, caída | Explicaciones cacheadas; la app funciona sin la capa de IA |

## Parte IV — Mercado 2026: competidores y oportunidad

El hueco es claro: hay decenas de apps de "picks con IA" en inglés con precisión opaca, y casi ninguna plataforma en español, centrada en ligas latinoamericanas, que publique su calibración y CLV y enseñe la matemática. Tres fuerzas definen el contexto de 2026.

### 1. Los mercados de predicción se comieron el deporte en EE. UU.

Kalshi movió US$31,000 millones en junio de 2026, con cerca de 85 % en contratos deportivos y US$22,420 millones ligados al Mundial ([Blask](https://blask.com/blog/prediction-markets-us-igaming-2026/)). Kalshi y Polymarket sumaron US$44,800 millones ese mes, 75 % más que en mayo, mientras más de una docena de reguladores estatales los acusan de juego sin licencia ([Unlock](https://www.unlock-bc.com/en/kalshi-and-polymarket-record-45-billion-combined-volume-in-june-as-world-cup-boosts-activity)). FanDuel Predicts opera en los 50 estados y DraftKings Predictions en 38. Implicación: los precios de estos mercados son una señal más de probabilidad, utilizable solo si los términos del proveedor de datos lo permiten y sin enlazar a operar desde Colombia.

### 2. Explosión de apps de "IA para apostar"

En 2026 se lanzaron LFG Sports AI (febrero, props y líneas en cinco deportes), DeepBetting (febrero), BetGiant (junio, para el Mundial) y BetsAI, que analiza una captura de cualquier boleto ([GlobeNewswire vía AOL](https://lite.aol.com/sports/story/0022/20260211/9652690.htm); [AppGoblin](https://appgoblin.info/apps/6756926912)). La mayoría vende "precisión" sin calibración ni historial auditable: ese es el flanco a atacar.

| Producto | Propuesta | Qué copiar | Qué evitar |
| --- | --- | --- | --- |
| [OddsJam](https://www.flatstudio.co/work/oddsjam-ios) | Herramientas +EV, props, comparador | Filas con % de acierto y mini-gráfica; modales de ayuda que explican cada gráfico | Precio alto, enfoque solo EE. UU. |
| [Rithmm](https://similarweb.com/app/apple/1641010681) | Modelos de IA personalizables por el usuario | Constructor de modelo propio | Promesas de "ventaja" sin métricas públicas |
| [nfelo](https://nfeloapp.com/nfl-power-ratings) | Modelo NFL abierto, rendimiento histórico desde 2009 | Desglose paso a paso de cómo se llega al spread y al EV | Interfaz densa, sin móvil cuidado |
| [WagerProof](https://appgoblin.info/apps/6757089957) | Investigación deportiva con IA, 4.75★ en 149 reseñas | Enfoque "investigación" en lugar de "tips" | — |
| [Apple Sports](https://www.creativeboom.com/inspiration/this-new-app-from-apple-has-something-important-to-teach-us-about-designing-data/) | Marcadores en vivo, +170 países desde el Mundial 2026 | Referente de claridad y velocidad en datos en vivo | No tiene probabilidades ni cuotas |

### 3. Los datos se cierran y encarecen

En enero de 2026 Opta (Stats Perform) cortó a FBref sus estadísticas avanzadas, xG incluido, poco después de convertirse en socio oficial de datos de apuestas de la FIFA ([Awful Announcing](https://amp.awfulannouncing.com/soccer/sports-reference-pulls-advanced-data-agreement-violation-dispute.html)). Scrapear sitios gratuitos ya no es una base fiable ni legalmente segura: el plan presupuesta datos licenciados desde el día uno (Parte V).

### Posicionamiento propuesto

- **Para quién:** aficionados y apostadores recreativos de 18+ en Colombia y Latinoamérica que quieren entender, no solo recibir un pick.
- **Promesa:** "La probabilidad real de cada partido, explicada, actualizada en vivo y auditada en público."
- **Diferenciales:** español nativo; Liga BetPlay, Libertadores, Sudamericana y eliminatorias junto a las grandes ligas; transparencia total; modo "aprender" con las fórmulas; diseño de nivel premio.
- **Modelo de negocio:** freemium (probabilidades y explicaciones gratis; simulador, alertas en vivo, props y API personal en plan Pro). Sin afiliación a casas no autorizadas por Coljuegos.

## Parte V — Datos en tiempo real: proveedores, costos y licencias

Se necesitan dos flujos licenciados: datos deportivos (calendario, alineaciones, eventos, xG, lesiones) y cuotas multi-casa con al menos una casa afilada y precios de apertura y cierre. Recomendación para el MVP: Sportmonks (fútbol + xG) y un proveedor de cuotas con Pinnacle y WebSocket; Sportradar solo cuando haya ingresos.

### Datos deportivos

| Proveedor | Precio público | Lo relevante | Rol en el plan |
| --- | --- | --- | --- |
| [Sportmonks](https://www.sportmonks.com/football-api/alternatives/sportradar/) | €29 Starter, €99 Growth (30 ligas), €249 Pro; prueba de 14 días | 2,500+ ligas; planes por número de ligas; la prueba exige tarjeta | Fuente principal de fútbol |
| [Sportmonks xG](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/expected/coverage) | xG básico desde €19; xG avanzado en vivo €199–€399 | xG por tiro y línea de tiempo; en vivo cada 30–60 s | xG pre y post partido (MVP); en vivo (fase 3) |
| [API-Football](https://www.api-football.com/pricing) | Free 100 req/día; Pro 7,500; Ultra 75,000 | Todas las competiciones y endpoints en todos los planes; varios deportes | Respaldo y deportes extra (NBA, NFL, béisbol, hockey) |
| [TheStatsAPI](https://thestatsapi.com/compare/api-football-alternative) | Desde US$50/mes; prueba de 7 días | Fixtures, stats, cuotas y xG en un solo API | Alternativa a Sportmonks |
| [Sportradar](https://sportsapis.dev/apis/sportradar) | Bajo cotización, contratos anuales; prueba en su marketplace | Feeds oficiales en 80+ deportes | Escala (fase 4) |

### Cuotas

| Proveedor | Precio público | Lo relevante | Rol en el plan |
| --- | --- | --- | --- |
| [The Odds API](https://odds-api.io/blog/odds-api-io-vs-the-odds-api) | Gratis 500 créditos/mes; US$30–249 | Solo REST; cada llamada cuesta mercados × regiones; histórico a 10× ([OddsPapi](https://oddspapi.io/blog/the-odds-api-free-tier-limits)) | Prototipo |
| [SportsGameOdds](https://sportsgameodds.com/use-cases/positive-ev-betting-api) | US$99–499; plan gratis | Cuotas justas sin margen ya calculadas; apertura y cierre; WebSocket solo en plan a medida | Validar el devig propio y CLV |
| [Odds-API.io](https://odds-api.io/blog/odds-api-io-vs-the-odds-api) | £99–229/mes | 250+ casas, LATAM y casas asiáticas afiladas, WebSocket | Feed en vivo principal (candidato) |
| [OddsPapi](https://oddspapi.io/blog/?p=2498) | Gratis 250 req/mes; planes por petición | Pinnacle incluido; histórico y cierres sin recargo | Cierres para CLV y backtests (candidato) |

### Datos abiertos para entrenar (revisar licencias)

StatsBomb Open Data (eventos de fútbol), nflverse (jugada a jugada NFL), Statcast vía pybaseball y los datos de tenis de Jeff Sackmann sirven para investigación y backtests. Varias de estas licencias prohíben uso comercial o exigen atribución: Claude Code debe registrar en `docs/data-licenses.md` la licencia de cada fuente antes de usarla en producción.

### Frecuencia de actualización (controla el costo)

| Estado del evento | Cuotas | Datos deportivos | Recomputación del modelo |
| --- | --- | --- | --- |
| Más de 24 h antes | Cada 15 min | Diario | Al cambiar cuotas > 2 % o noticias |
| 24 h a 60 min antes | Cada 2–5 min | Cada hora | Igual |
| Menos de 60 min (alineaciones) | Cada 30–60 s | Al publicarse alineaciones | Inmediata |
| En vivo | Push por WebSocket (\~1 s) | Eventos cada 5–15 s | Cada evento relevante (gol, tarjeta, cambio de portero) |
| Final | Snapshot de cierre | Resultado y estadísticas | Calificar predicción y CLV |

### Presupuesto mensual estimado del MVP

Estimación propia con precios públicos de noviembre de 2026; confirmar con cada proveedor.

| Rubro | Rango (US$/mes) |
| --- | --- |
| Sportmonks Growth + xG básico | 190–200 |
| Cuotas con casa afilada y WebSocket | 120–300 |
| API de IA para explicaciones (cacheadas) | 30–150 |
| Hosting, base de datos, Redis, monitoreo | 50–150 |
| **Total** | **390–800** |

Reglas de licencia: no redistribuir cuotas crudas ni el feed en bloque, mostrar siempre la hora de la última actualización y la atribución que exija cada proveedor, y no exponer claves de API en el cliente.

## Parte VI — Marco legal en Colombia y juego responsable

La plataforma es un servicio de información y análisis: no recibe apuestas ni custodia dinero, así que no opera juegos de suerte y azar. El riesgo real es otro: Coljuegos puede ordenar el bloqueo de cualquier página que sirva a la operación, pago o *publicidad* de juego no autorizado. Esta parte es un mapa para el producto, no asesoría legal; antes del lanzamiento se valida con un abogado especializado en juegos de azar y datos personales.

### Hechos que condicionan el diseño

- La regulación de apuestas en línea parte de la Ley 643 de 2001, con Coljuegos como regulador y sancionador ([Asuntos Legales](https://www.asuntoslegales.com.co/consumidor/lo-que-usted-debe-saber-sobre-las-apuestas-en-los-canales-y-medios-electronicos-3926200)).
- Coljuegos ya envía las órdenes de bloqueo directo a los proveedores de internet, que descargan la lista a diario (Circular Externa 0017 de 2025 de MinTIC); en mayo de 2025 llevaba cerca de 26,600 órdenes ([Focus Gaming News](https://focusgn.com/latinoamerica/coljuegos-intensifica-acciones-de-bloqueo-de-sitios-web-de-apuestas-ilegales)). El sistema con MinTIC cubre canales que sirvan a la publicidad o comercialización de juego no autorizado ([Radio Nacional](https://radionacional.co/actualidad/mintic-bloqueara-paginas-de-juegos-de-azar-ilegales)).
- Coljuegos pidió bloquear 289 perfiles de influenciadores por promocionar apuestas ilegales ([Focus Gaming News](https://focusgn.com/latinoamerica/influencers-en-la-mira-coljuegos-solicito-bloquear-289-perfiles-de-facebook-e-instagram-por-operar-rifas-y-promocionar-apuestas-ilegales)), y en febrero de 2025 reportó sitios eliminados de marcas como 1Win, 1xBet y Pinnacle (SoloAzar).
- Está prohibida la publicidad dirigida a menores y la que incentive falsas expectativas de ganancia ([Focus Gaming News](https://focusgn.com/latinoamerica/coljuegos-reglamento-juegos-virtuales)).
- 245,199 personas pidieron autoexcluirse de juegos en línea entre 2024 y 2025 ([SiGMA](https://sigma.world/es/news/autoexclusion-juego-en-linea-colombia/)). Los operadores deben enlazar el micrositio de Juego Responsable de Coljuegos.
- El IVA al juego en línea ha sido inestable: 19 % sobre depósitos desde febrero de 2025, luego sobre GGR por el Decreto 1474 de 2025, suspendido por la Corte Constitucional, y vuelto a proponer en 2026 ([SiGMA](https://sigma.world/es/news/corte-constitucional-suspende-iva-juegos-linea-colombia/)). Afecta a operadores, no a esta plataforma, pero sí a cualquier modelo de afiliación.

### Consecuencias para el producto

| Requisito | Implementación obligatoria en el código |
| --- | --- |
| No promocionar operadores no autorizados | Lista blanca de operadores autorizados por Coljuegos en `config/operators.ts`; ningún enlace, logo o código de bono fuera de ella. Las cuotas de casas afiladas se muestran como "mercado de referencia", sin marca ni enlace. |
| Solo mayores de 18 | Puerta de edad en el primer acceso; verificación por fecha de nacimiento al registrarse; nada de contenido dirigido a menores. |
| Sin falsas expectativas | Diccionario de términos prohibidos de la Parte III aplicado con un linter de copy en CI. |
| Juego responsable | Enlace persistente al micrositio de Coljuegos, líneas de ayuda verificadas antes del lanzamiento, límites de tiempo de uso, "pausa" y autoexclusión de las funciones de apuestas de la app. |
| Datos personales (Ley 1581 de 2012 y Decreto 1377 de 2013) | Política de tratamiento publicada, autorización previa, expresa e informada, canal para consultas y reclamos, banner de cookies con consentimiento granular; verificar obligación de registro ante la SIC. |
| Licencias de datos | Atribución por proveedor y registro en `docs/data-licenses.md`. |

### Preguntas abiertas para el abogado

- ¿Mostrar el nombre de una casa no autorizada como fuente de cuotas cuenta como publicidad?
- ¿Un plan Pro de pago con "apuestas de valor" requiere algún registro o advertencia adicional?
- ¿Qué condiciones aplican a un modelo de afiliación con operadores autorizados?

## Parte VII — Diseño y animación web en 2026: lo que está funcionando

En 2026 el movimiento dejó de ser un lujo: las APIs nativas del navegador ya hacen transiciones y animaciones ligadas al scroll, GSAP es gratis, WebGPU corre en todos los navegadores, y la IA produce páginas casi sin costo, así que lo que distingue un sitio es la dirección de arte y la coherencia del sistema de diseño ([Digidop](https://www.digidop.com/blog/5-web-design-trends-2025/index.md)). Para un producto de datos la receta ganadora es un "dashboard editorial": denso pero sereno, donde cada animación explica un cambio de dato.

### Qué está ganando premios

- **Awwwards Site of the Year 2025:** la web del piloto de F1 Lando Norris, de OFF+BRAND, hecha con Webflow, GSAP y WebGL; el Developer Site of the Year fue Messenger de abeto, un planeta 3D en Three.js ([Digidop](https://www.digidop.com/blog/5-web-design-trends-2025/index.md)).
- La misma web ganó el premio de diseño web de DesignRush en abril de 2026 por sus acentos neón tomados del casco y un layout modular que separa rendimiento en pista de contenido fuera de ella ([DesignRush](https://news.designrush.com/designrush-design-award-winners-april-2026)). Es el referente más cercano a un producto deportivo.
- Tendencias recurrentes en 2026: tipografía protagonista y cinética, cuadrículas modulares y asimétricas, 3D que reacciona al scroll, ruido y mezclas cromáticas ([Really Good Designs](https://reallygooddesigns.com/?p=26175)), y shaders que pasaron del efecto "glow" a herramienta de diseño.

### Lo que la plataforma web ya permite (sin librerías pesadas)

| Capacidad | Estado en noviembre de 2026 | Uso en la app |
| --- | --- | --- |
| View Transitions (mismo documento) | Baseline desde Firefox 144, octubre de 2025 ([web.dev](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available)); integradas en React 19.2 y Next.js 16 ([Next.js](https://nextjs.org/blog/next-16)) | La tarjeta del partido se transforma en la página de detalle (elemento compartido) |
| View Transitions entre documentos | Chrome 126+ y Safari 18.2+; Firefox parcial; foco de Interop 2026 ([Speaker Deck](https://speakerdeck.com/saschaleh/view-transition-api-noch-nie-sahen-seitenubergange-im-web-so-gut-aus-2fccea23-fcf1-4d73-9e43-2ab3065afef0)) | Mejora progresiva en páginas de marketing |
| Animaciones ligadas al scroll en CSS | Baseline con Firefox 159, octubre de 2026 ([web.dev](https://web.dev/blog/web-platform-10-2026)) | Revelados, barras de progreso y parallax en landing y modo "Aprender" |
| WebGPU | En todos los navegadores principales, Safari iOS incluido desde septiembre de 2025; Three.js con `three/webgpu` y respaldo automático a WebGL 2 ([Utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed)) | Hero 3D de la landing, solo en equipos capaces |

### Librerías que dominan en 2026

| Herramienta | Estado | Para qué |
| --- | --- | --- |
| GSAP 3.15 | 100 % gratis, incluidos SplitText, MorphSVG y ScrollSmoother, tras la compra por Webflow ([OpenReplay](https://blog.openreplay.com/motion-vs-gsap/)) | Coreografía de la landing, titulares cinéticos, líneas de tiempo |
| Motion v12 (antes Framer Motion) | MIT, `motion/react` | Microinteracciones, animaciones de layout, listas que se reordenan |
| Rive | Máquinas de estado con data binding a valores en vivo ([Rive](https://framer.rive.app/blog/state-machines-make-iteration-a-breeze-for-designers-and-developers)) | Medidor animado de probabilidad y estados del partido (previa, en vivo, final) |
| shadcn/ui + Tailwind 4.2 | Base UI es la base por defecto desde julio de 2026 ([releases.sh](https://releases.sh/release/rel_TUxVOyVHeyyTBGlCTm6n4)) | Componentes accesibles y propios |
| Vercel AI SDK | UI generativa: el modelo elige componentes registrados y los llena por streaming ([awesome-generative-ui](https://github.com/narrowin/awesome-generative-ui)) | El analista de IA responde con tarjetas y gráficos, no solo texto |

### Patrones de interfaz para un producto de pronósticos

- **Cuotas y probabilidades vivas:** números con cifras tabulares que se transforman al cambiar, con destello verde o rojo de 600 ms y flecha de tendencia.
- **Gráfica de probabilidad en vivo:** línea que se dibuja con el partido, marcadores de eventos (gol, roja) y banda de incertidumbre.
- **Timeline de xG** escalonado por equipo y barra de momentum por intervalos de 5 minutos.
- **Filas con mini-gráfica** al estilo OddsJam: cada fila muestra el dato y su tendencia, y un modal explica cómo leer el gráfico ([Flat Studio](https://www.flatstudio.co/work/oddsjam-ios)).
- **Grilla bento** para el inicio, paleta de comandos (⌘K / Ctrl K) para buscar equipos y partidos, y esqueletos que se llenan por streaming.
- **Oscuro por defecto** con un acento neón de marca y alto contraste; modo claro completo.

### Reglas de movimiento y accesibilidad

- Animar solo `transform` y `opacity`; nada que cause saltos de layout.
- Toda animación tiene variante para `prefers-reduced-motion` (reducir a fundidos, no eliminar el significado); lo que se mueva más de 5 s tiene control de pausa (WCAG 2.2.2) ([specification.website](https://specification.website/spec/accessibility/reduced-motion/)).
- Nada parpadea más de 3 veces por segundo (WCAG 2.3.1), incluidos los destellos de cuotas.
- Objetivo de accesibilidad: WCAG 2.2 AA, que es el piso que exigen el EAA europeo y EN 301 549 ([TestParty](https://testparty.ai/blog/wcag-2-3-3-animation-from-interactions-2025-guide)).

## Parte VIII — Arquitectura técnica y stack

Monorepo con TypeScript para la web y Python para los modelos, Postgres y Redis como columna vertebral, y Server-Sent Events (SSE) para empujar cambios en vivo. Todo lo que calcula probabilidades vive en el servidor; el navegador solo muestra y anima.

&#91;embedded content: arquitectura · 9 componentes, flujo en tiempo real\]

Solo el motor de modelos escribe probabilidades; la web nunca llama a los proveedores ni a la IA desde el navegador.

### Stack decidido

| Capa | Elección | Por qué |
| --- | --- | --- |
| Monorepo | pnpm workspaces + Turborepo | Un solo repo para web, gateway, paquetes y servicios Python |
| Web | Next.js 16 (App Router, Cache Components, React 19.2, React Compiler), TypeScript estricto | View Transitions nativas, streaming de RSC y caché explícita ([Next.js](https://nextjs.org/blog/next-16)) |
| UI | Tailwind CSS 4 + shadcn/ui sobre Base UI + iconos Lucide | Código propio, accesible y personalizable |
| Movimiento | Motion v12 (UI), GSAP 3.15 (landing), Rive (medidores), Three.js WebGPU (hero, carga diferida) | Ver Parte VII |
| Gráficas | visx (primitivas D3) + SVG propio | Control total de animación y accesibilidad |
| Estado en el cliente | TanStack Query (datos del servidor) + Zustand (UI) | Caché que el stream en vivo actualiza en su lugar |
| Tiempo real | Gateway SSE en Node (Hono) + Redis pub/sub | Unidireccional, reconexión nativa, funciona sobre HTTP/2 |
| Modelos | Python 3.13+, FastAPI, Polars, NumPy/SciPy, statsmodels, scikit-learn, LightGBM | Ecosistema estadístico maduro |
| Datos | PostgreSQL 17+ (Drizzle en TS, SQLAlchemy en Python); `odds_snapshots` particionada por día | Historial completo de cuotas para CLV y backtests |
| Bus y caché | Redis Streams y pub/sub | Desacopla ingesta, modelos y gateway |
| Autenticación | Better Auth (correo + Google), fecha de nacimiento al registrarse | Autoalojado, sin costo por usuario |
| IA | Vercel AI SDK + Claude API (`claude-sonnet-5-5` para el analista, `claude-haiku-5-5` para explicaciones cortas) | UI generativa con herramientas propias (Parte XI) |
| Observabilidad | Sentry, OpenTelemetry, PostHog con consentimiento | Errores, latencia del pipeline y producto |
| Hosting | Vercel (web), Fly.io o Railway (gateway y workers), Neon o Supabase (Postgres) | Planes de entrada baratos que escalan |
| Calidad | Vitest, pytest, Playwright, axe-core, Lighthouse CI | Ver criterios de aceptación |

### Modelo de datos (tablas principales)

| Tabla | Campos clave |
| --- | --- |
| `events` | id, sport, competition\_id, home\_id, away\_id, start\_time, status |
| `event_live_state` | event\_id, minute, score, red\_cards, xg\_home, xg\_away, updated\_at |
| `odds_snapshots` | event\_id, market, selection, line, bookmaker, price, captured\_at, is\_opening, is\_closing |
| `predictions` | id, event\_id, model\_version, market, selection, p\_model, p\_market, p\_final, ci\_low, ci\_high, created\_at, frozen\_hash |
| `prediction_grades` | prediction\_id, outcome, brier, log\_loss, clv |
| `user_bets` | user\_id, event\_id, selection, price, stake, bookmaker\_label, result (privado) |
| `user_settings` | bankroll, kelly\_fraction, max\_stake\_pct, session\_limit\_min, self\_excluded\_until |
| `explanations` | event\_id, prediction\_version, locale, body, model, created\_at |
| `data_licenses` | source, license, commercial\_use, attribution\_text |

También: `sports`, `competitions`, `seasons`, `teams`, `players`, `injuries`, `lineups`, `alerts`.

### Flujo en vivo de punta a punta (objetivo p95 < 2 s)

1. El proveedor empuja un cambio de cuota o evento (WebSocket) o la ingesta lo detecta (polling por estado, Parte V).
2. La ingesta normaliza identificadores y mercados, guarda el snapshot y publica en `stream:changes`.
3. El motor recalcula el partido afectado, guarda la nueva versión de `predictions` y publica en `pub:event:{id}`.
4. El gateway reenvía el mensaje a los clientes suscritos a ese partido o a esa liga.
5. El cliente actualiza la caché de TanStack Query y Motion anima solo los números que cambiaron.
6. Al terminar el partido, el calificador congela el cierre, califica cada predicción y actualiza la página de rendimiento.

### Contratos

- **SSE:** `GET /stream/event/{eventId}` y `GET /stream/board?sport=&league=`; mensajes validados con zod: `{ type: 'odds' | 'prob' | 'state' | 'grade', eventId, version, ts, payload }`. La versión es monótona por partido y el cliente descarta mensajes viejos.
- **Motor:** `POST /recompute { eventId, reason }`, `GET /predictions/{eventId}`, `GET /health`. Solo accesible desde la red interna.
- **Paridad TS ↔ Python:** `packages/quant/test-vectors.json` con casos de devig, EV, Kelly, Poisson y Dixon-Coles; ambos lados deben dar el mismo resultado con tolerancia 1e-9.

### Presupuestos de rendimiento

Core Web Vitals en el percentil 75 móvil: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. JavaScript inicial ≤ 200 KB comprimido en páginas de datos; Three.js, GSAP y Rive se cargan solo donde se usan, con import dinámico.

## Parte IX — Sistema de diseño y especificación de animaciones

Dirección de arte: "sala de análisis de noche" — fondo casi negro, un solo acento neón de marca, tipografía grande y cifras tabulares, y movimiento que siempre responde a la pregunta "¿qué cambió?". Nombre de trabajo: **Xpected** (provisional; se cambia en `config/brand.ts`).

### Tokens de color

| Token | Oscuro (por defecto) | Claro | Uso |
| --- | --- | --- | --- |
| `bg` | #0A0B0D | #FAFAF7 | Fondo de página |
| `surface-1` / `surface-2` | #111318 / #171A21 | #FFFFFF / #F2F2EE | Tarjetas y capas |
| `border` | #252A33 | #E3E3DE | Bordes; la profundidad se hace con bordes, no sombras |
| `text` / `text-2` / `text-3` | #F2F4F7 / #A3ABB8 / #6B7480 | #0B0D10 / #4A515C / #7A828E | Texto primario, secundario, apagado |
| `accent` | #C8FF2E | #4D6B00 | Marca, foco, CTA principal, marca de "valor" |
| `up` / `down` | #2EE59D / #FF5C5C | #0E8A5A / #C62828 | Cuota o probabilidad sube / baja; nunca como única señal (siempre con flecha) |
| `info` / `warn` | #5CA8FF / #FFB020 | #1F6FD1 / #A86400 | Avisos, incertidumbre alta |
| `home` / `away` | #5CA8FF / #FF8A3D | #1F6FD1 / #C25A12 | Respaldo cuando el color del equipo no pasa contraste |

Todo texto cumple contraste 4.5:1; los colores de equipo se ajustan automáticamente hasta pasar 3:1 contra la superficie.

### Tipografía, espacio y forma

- **Display:** Unbounded (variable, licencia OFL) para titulares de 32–96 px con `clamp()` fluido.
- **Texto e interfaz:** Inter variable (OFL) con `font-variant-numeric: tabular-nums` en toda cifra, para que las cuotas no "bailen" al cambiar.
- **Escala:** 12 / 14 / 16 / 20 / 24 / 32 / 48 / 72 / 96 px.
- **Espacio:** base de 4 px; grilla de 12 columnas, ancho máximo 1,440 px; inicio en grilla bento.
- **Radios:** 8 px controles, 16 px tarjetas, 999 px píldoras.

### Tokens de movimiento

| Token | Valor | Uso |
| --- | --- | --- |
| `dur-instant` | 100 ms | Estados de hover y press |
| `dur-fast` | 150 ms | Menús, paleta de comandos, tooltips |
| `dur-base` | 220 ms | Tarjetas, toasts, reordenamientos |
| `dur-slow` | 350 ms | Transiciones de vista con elemento compartido |
| `dur-story` | 600 ms | Titulares cinéticos y storytelling de la landing |
| `ease-standard` | cubic-bezier(0.2, 0, 0, 1) | Entradas y movimientos |
| `ease-exit` | cubic-bezier(0.4, 0, 1, 1) | Salidas |
| `spring-ui` | stiffness 400, damping 32 | Microinteracciones con Motion |
| `spring-number` | stiffness 120, damping 20 | Conteo de cifras |

### Catálogo de animaciones

| # | Animación | Disparador | Especificación | Herramienta | Con movimiento reducido |
| --- | --- | --- | --- | --- | --- |
| 1 | Tick de cuota o probabilidad | Mensaje `odds` o `prob` | Cifra sale y entra con 8 px hacia arriba o abajo según dirección; fondo destella `up`/`down` 600 ms una sola vez; flecha de tendencia | Motion `AnimatePresence` | Solo el destello de color, sin desplazamiento |
| 2 | Barra de probabilidad 1X2 | Cambio de probabilidad | `scaleX` con `spring-ui`; los tres segmentos suman siempre 100 % | Motion | Cambio instantáneo |
| 3 | Gráfica de probabilidad en vivo | Cada minuto o evento | El trazo se extiende con `stroke-dashoffset`; marcadores de gol o roja entran de 0.8 a 1 de escala | visx + Motion | Puntos nuevos sin dibujo |
| 4 | Tarjeta → detalle del partido | Navegación | View Transition con `view-transition-name: match-{id}`, `dur-slow` | React 19.2 `ViewTransition` | Fundido de 150 ms |
| 5 | Hero 3D de la landing | Carga y scroll | Campo de partículas sobre una cancha que se ordena en la matriz de marcadores; scroll en *scrub* | Three.js WebGPU + GSAP ScrollTrigger | Imagen fija AVIF |
| 6 | Titular cinético | Entrada en pantalla | SplitText por caracteres, desfase 20 ms, de y 100 % a 0 en `dur-story` | GSAP SplitText | Fundido simple |
| 7 | "Cómo funciona" (cuota → prob. implícita → devig → EV) | Scroll | Pasos que se revelan con `animation-timeline: view()` y fórmulas que se resaltan término a término | CSS nativo con `@supports` | Todo visible, sin animación |
| 8 | Medidor de valor | Probabilidad y EV del mercado elegido | Máquina de estados con entradas `probability`, `edge`, `phase` (previa, vivo, final) | Rive con data binding | Fotograma estático con el valor |
| 9 | Reordenar el radar de valor | Cambio de ranking | Animación de layout 220 ms | Motion `layout` | Reorden instantáneo |
| 10 | Esqueletos | Carga por streaming | Brillo de 1.2 s en bucle hasta que llega el dato | CSS | Bloque estático |
| 11 | Paleta de comandos y menús | ⌘K / Ctrl K | Escala 0.98 a 1 con fundido, `dur-fast` | Motion | Fundido |

### Reglas que no se negocian

- **Sin celebración de apuestas ganadas:** nada de confeti, sonidos o premios visuales en el registro de apuestas; el resultado se muestra neutro. Es un refuerzo de conducta que el producto evita a propósito.
- Un acento por pantalla: el neón se reserva para lo que el usuario debe mirar primero.
- Color nunca es la única señal: subidas y bajadas llevan flecha y signo.
- Cada componente con movimiento tiene historia en Storybook con su variante de movimiento reducido.

## Parte X — Mapa de páginas y componentes

El mapa tiene 14 entradas; el MVP lanza las 9 marcadas con fase 1. Español de Colombia por defecto, inglés como segundo idioma, zona horaria America/Bogota editable y cuotas en formato decimal con opción americana y fraccional.

### Rutas

| Ruta | Propósito | Contenido y componentes clave | Fase |
| --- | --- | --- | --- |
| `/` | Landing | Hero 3D, titular cinético, "Cómo funciona" con scroll, vista previa del tablero en vivo, cifras de transparencia, precios, FAQ | 1 |
| `/hoy` | Tablero del día | Grilla bento: en vivo ahora, próximos por liga, radar de valor resumido, filtros por deporte y liga | 1 |
| `/partido/[id]` | Detalle del partido | Pestañas Resumen, Mercados, En vivo, Equipos, Movimiento de línea, Explicación | 1 |
| `/valor` | Radar de valor | Tabla filtrable de selecciones con EV sobre umbral, intervalo de confianza y hora de la cuota | 1 |
| `/herramientas` | Calculadoras | Conversor de cuotas, devig con 3 métodos lado a lado, EV, Kelly, simulador de banca, margen de combinadas, CLV | 1 |
| `/rendimiento` | Transparencia | Curva de calibración, log loss frente al mercado, CLV, ROI con intervalo por deporte y liga; CSV descargable de predicciones congeladas | 1 |
| `/aprender` | Lecciones | Probabilidad implícita, margen, EV, Kelly, xG y varianza, paso a paso con fórmulas y ejercicios interactivos | 1 |
| `/juego-responsable`, `/privacidad`, `/terminos`, `/metodologia` | Legal y método | Textos legales, líneas de ayuda, explicación completa de los modelos | 1 |
| `/ligas/[slug]` | Liga | Tabla, ratings Elo, proyección de temporada por Monte Carlo (campeón, clasificación, descenso) | 2 |
| `/equipos/[slug]` | Equipo | Forma, xG a favor y en contra de los últimos 10, tendencia Elo, lesiones | 2 |
| `/mi-registro` | Registro privado | Apuestas registradas a mano, CLV automático, ROI con intervalo, límites personales | 2 |
| `/analista` | Analista IA | Chat con UI generativa: responde con tarjetas y gráficas de la app | 2 |
| `/jugadores/[slug]` | Jugador y props | Proyecciones por minuto y distribuciones (NBA primero) | 3 |
| `/cuenta` | Cuenta | Perfil, plan, límites de sesión, autoexclusión, privacidad y exportación de datos | 1 |

### Anatomía de `/partido/[id]` (la pantalla más importante)

1. **Cabecera:** equipos, hora local, estado (previa, en vivo con minuto, final), marcador y última actualización.
2. **Resumen:** barra 1X2 del modelo frente a la del mercado sin margen, medidor de valor (Rive), marcador más probable y matriz de marcadores como mapa de calor.
3. **Mercados:** tabla por mercado con probabilidad del modelo, del mercado, cuota de referencia, EV e intervalo; cada fila abre su cálculo paso a paso.
4. **En vivo:** gráfica de probabilidad, timeline de xG, barras de momentum y lista de eventos.
5. **Equipos:** forma reciente, xG, Elo, lesiones y alineaciones probables o confirmadas.
6. **Movimiento de línea:** de apertura a ahora por casa de referencia, con marcas de noticias (alineación, lesión).
7. **Explicación:** tarjeta de IA con los 3–5 factores que más mueven la probabilidad, cada uno ligado a su dato.

### Componentes del sistema

| Grupo | Componentes |
| --- | --- |
| Partido | `MatchCard`, `MatchHeader`, `LiveIndicator`, `ScoreBug`, `EventTimeline` |
| Probabilidad y cuotas | `ProbabilityBar1X2`, `OddsCell` (tick animado), `ValueGauge` (Rive), `ConfidenceBadge`, `MarketTable`, `StepByStepCalc` |
| Gráficas | `WinProbChart`, `XgTimeline`, `MomentumBars`, `ScoreMatrixHeatmap`, `LineMovementChart`, `CalibrationChart`, `EloSparkline`, `FormStrip` |
| Herramientas | `OddsConverter`, `DevigCalculator`, `EvCalculator`, `KellyCalculator`, `BankrollSimulator`, `ParlayMarginCalc`, `ClvCalculator` |
| Navegación | `CommandPalette`, `SportLeagueFilter`, `TopBar`, `BottomNav` (móvil) |
| Cumplimiento | `AgeGate`, `SessionTimer`, `ResponsibleGamblingFooter`, `CookieConsent`, `StaleDataBanner` |
| IA | `ExplanationCard`, `AnalystChat`, `GenerativeSlot` (renderiza solo componentes de la lista blanca) |

### Estados que cada vista debe resolver

Cargando (esqueleto), vacío (sin partidos hoy: próximos días), datos atrasados (cuota con más de 3 min en vivo: banner y cifras atenuadas), error del proveedor (último dato válido con hora), sin conexión (PWA con caché) y liga "solo mercado" (sin marcas de valor).

## Parte XI — Capa de IA

La IA explica y guía; nunca inventa probabilidades. Los números salen del motor estadístico, el modelo de lenguaje los narra consultando herramientas propias, y su salida se limita a componentes registrados de la app. Si la API de IA cae, la plataforma sigue funcionando completa.

### Funciones

| Función | Modelo | Cuándo se genera | Salida |
| --- | --- | --- | --- |
| Explicación del partido | `claude-haiku-5-5` | A T−24 h, T−1 h, al confirmarse alineaciones y si la probabilidad cambia más de 3 puntos | JSON validado: `headline`, `factors[]` (etiqueta, dirección, magnitud, referencia al dato), `uncertainty_note` |
| Analista con UI generativa | `claude-sonnet-5-5` | A pedido del usuario (plan Pro con límite diario) | Texto breve + componentes de la lista blanca transmitidos por streaming |
| Resumen post-partido | `claude-haiku-5-5` | Al calificar la predicción | "Qué dijo el modelo y qué pasó", con la probabilidad que tenía el resultado real |
| Tutor de "Aprender" | `claude-sonnet-5-5` | En las lecciones | Explicación paso a paso: concepto, fórmula, símbolos y cálculo con números del partido |

### Herramientas que el modelo puede llamar (solo lectura)

`getMatch`, `getPredictions`, `getOddsHistory`, `getTeamForm`, `getInjuriesAndLineups`, `getLeagueTable`, `getModelPerformance`, `runCalc` (devig, EV, Kelly, Poisson; ejecuta `packages/quant`, no el modelo de lenguaje). Componentes que puede renderizar: `MatchCard`, `ProbabilityBar1X2`, `MarketTable`, `WinProbChart`, `XgTimeline`, `LineMovementChart`, `KellyCalculator`, `CalibrationChart`.

### Barandas (system prompt + verificación en código)

- **Anclaje numérico:** un validador extrae cada cifra de la respuesta y comprueba que exista en los resultados de herramientas de esa conversación; si no, la respuesta se regenera o se bloquea.
- **Lenguaje:** se aplica el mismo diccionario de términos prohibidos de la Parte III; nunca "seguro", "fija" ni promesas de ganancia.
- **Stake:** solo puede citar lo que devuelve `runCalc` con los límites del usuario; nunca sugiere un monto por su cuenta.
- **Operadores:** no nombra ni enlaza casas fuera de la lista blanca de Coljuegos.
- **Bienestar:** si el usuario expresa pérdida de control, perseguir pérdidas o apostar dinero que no puede perder, la respuesta prioriza recursos de ayuda y las herramientas de límite y autoexclusión.
- **Privacidad:** no se envían datos personales al proveedor de IA; el registro de apuestas solo entra en forma agregada y con consentimiento explícito.

### Costo y evaluación

- Explicaciones cacheadas por versión de predicción e idioma; un partido popular se genera una vez, no por usuario.
- Prompt caching para el system prompt y las definiciones de herramientas; límites de mensajes por plan.
- Conjunto de evaluación de 50 partidos reales: anclaje numérico (100 % requerido), términos prohibidos (0 casos), exactitud de los factores frente a los datos y revisión humana del tono antes de cada cambio de prompt.

## Parte XII — Plan por fases con prompts para Claude Code

Seis fases, cada una cerrada por una puerta verificable antes de pasar a la siguiente. Antes de la fase 0: exporta este documento a Markdown, guárdalo como `docs/plan.md` en el repo y crea `CLAUDE.md` con el contenido de abajo. Luego pega el prompt de cada fase en Claude Code, en modo plan primero, y aprueba el plan antes de que escriba código.

### Fases y puertas

Duraciones estimadas para una persona trabajando con Claude Code a tiempo parcial; son una guía, no un compromiso.

| Fase | Entregable | Puerta de salida | Duración estimada |
| --- | --- | --- | --- |
| 0. Fundaciones | Monorepo, CI, tokens de diseño, Storybook, `packages/quant` en TS y Python | CI en verde; vectores de prueba idénticos en TS y Python; linter de copy activo | 1 semana |
| 1. Datos y modelo de fútbol | Ingesta histórica, Dixon-Coles + Elo, mezcla con mercado, calibración, backtest | Reporte de backtest con RPS, log loss y CLV frente al cierre en 3 ligas | 2 semanas |
| 2. Web MVP prepartido | Rutas de fase 1, puerta de edad, herramientas, lecciones, landing | Presupuestos de Core Web Vitals, 0 fallas graves de axe, e2e en verde | 3 semanas |
| 3. Tiempo real | Cuotas y recomputación en vivo, gateway SSE, gráficas en vivo, calificador, `/rendimiento` | p95 < 2 s de proveedor a pantalla con 1,000 clientes; calificación correcta en 100 partidos | 2–3 semanas |
| 4. IA y plan Pro | Explicaciones, analista con UI generativa, tutor, pagos | 100 % de anclaje numérico y 0 términos prohibidos en el set de evaluación | 2 semanas |
| 5. Más deportes | NBA, tenis, MLB, NFL, NHL; props; ligas, equipos, registro privado, PWA con push | Por deporte: backtest publicado o modo "solo mercado" | Continua |

### CLAUDE.md (raíz del repositorio)

```markdown
# Xpected — guía para Claude Code

## Producto
Plataforma de pronósticos deportivos en español (es-CO) que publica probabilidades calibradas,
valor esperado y explicaciones, actualizadas en tiempo real. No recibe apuestas ni maneja dinero.
Plan completo y fuentes: docs/plan.md. Leerlo antes de cada fase.

## Principios no negociables
1. Las probabilidades salen de services/model. Nunca del LLM ni del navegador.
2. Toda fórmula vive en packages/quant (TS) y services/model/quant (Python) con los mismos
   test-vectors.json. Si cambias una, cambias la otra y los vectores.
3. Copy: prohibidos los términos de docs/copy-rules.md ("fija", "segura", "lock", "100 %",
   promesas de ganancia). El linter de copy corre en CI y bloquea el merge.
4. Operadores: ningún enlace, logo, bono ni código de casas fuera de config/operators.ts
   (lista blanca de autorizados por Coljuegos). Las casas de referencia se muestran sin marca.
5. Movimiento: animar solo transform y opacity; toda animación con variante
   prefers-reduced-motion; nada parpadea más de 3 veces por segundo; sin celebraciones
   de apuestas ganadas.
6. Toda predicción se congela con hash y sello de tiempo antes del inicio y nunca se borra.
7. Claves de API solo en el servidor. Nunca en el cliente ni en el repositorio.
8. Datos: registrar la licencia de cada fuente en docs/data-licenses.md antes de usarla.

## Estructura
apps/web            Next.js 16 (App Router, Cache Components, React 19.2)
apps/gateway        Gateway SSE (Hono + Redis)
packages/ui         Tokens, componentes y Storybook
packages/quant      Fórmulas en TypeScript + test-vectors.json
packages/db         Esquema Drizzle y migraciones
packages/contracts  Esquemas zod compartidos (mensajes SSE, API interna)
services/ingest     Workers de ingesta (Python)
services/model      FastAPI + modelos (Dixon-Coles, Elo, devig, calibración)
services/grader     Calificación de predicciones y CLV
services/eval       Evaluación de la capa de IA
docs/               plan.md, copy-rules.md, data-licenses.md, adr/, reports/

## Comandos
pnpm i | pnpm dev | pnpm test | pnpm lint | pnpm typecheck | pnpm e2e | pnpm storybook
uv sync | uv run pytest | uv run ruff check | uv run mypy
docker compose up -d    # Postgres 17 + Redis locales

## Forma de trabajar
- Planear antes de codificar; un ADR en docs/adr/ por decisión de arquitectura.
- TypeScript estricto sin any; Python con type hints, ruff y mypy.
- Una tarea no está lista sin tests (unit + e2e del flujo tocado) y Storybook si hay UI.
- Números, fechas y monedas con Intl según el locale del usuario; zona horaria por defecto
  America/Bogota.
- Preguntar antes de: borrar datos, correr migraciones destructivas, cambiar proveedores
  de datos o tocar la lista de operadores.
```

### Prompt fase 0 — Fundaciones

```text
Lee CLAUDE.md y las Partes VIII y IX de docs/plan.md. Crea el monorepo con pnpm y Turborepo
con la estructura de CLAUDE.md. Configura:
1. apps/web con Next.js 16, TypeScript estricto, Tailwind CSS 4 y shadcn/ui sobre Base UI.
2. packages/ui con los tokens de color, tipografía, espacio y movimiento de la Parte IX como
   variables CSS y tema de Tailwind (oscuro por defecto, claro completo) y Storybook con una
   historia por token.
3. packages/quant con funciones puras y documentadas (concepto, fórmula y símbolos en el JSDoc):
   conversión de cuotas, probabilidad implícita, margen, devig multiplicativo, potencia y Shin,
   EV, Kelly fraccional con topes, CLV, Brier, log loss, RPS, Poisson y matriz Dixon-Coles.
   Agrega test-vectors.json y tests con Vitest (cobertura 100 % del paquete).
4. services/model con uv y FastAPI, y la versión Python de las mismas fórmulas que pase los
   mismos vectores con pytest.
5. docker-compose con Postgres 17 y Redis.
6. GitHub Actions: typecheck, lint, tests TS y Python, y un linter de copy que falle con los
   términos de docs/copy-rules.md (créalo con la tabla de la Parte III).
No construyas páginas todavía. Al final muestra el árbol del repo y la salida de los tests.
```

### Prompt fase 1 — Datos y modelo de fútbol

```text
Lee las Partes I, II y V de docs/plan.md. Implementa la base de datos y el modelo de fútbol:
1. Esquema en packages/db con las tablas de la Parte VIII y migraciones.
2. Cliente de Sportmonks y del proveedor de cuotas (claves en .env) con reintentos, límite de
   tasa y caché; normalizador de equipos y mercados con tabla de alias.
3. Carga histórica de 5 temporadas de Premier League, LaLiga y Liga BetPlay: resultados, xG y
   cuotas de apertura y cierre. Registra cada licencia en docs/data-licenses.md.
4. Modelo Dixon-Coles con ponderación temporal exponencial (xi elegido por validación), Elo
   como rasgo, mezcla logit con el mercado (peso w por liga) y calibración isotónica.
5. Backtest walk-forward por jornada: RPS, log loss, Brier, curva de calibración y CLV
   hipotético frente al cierre sin margen (Shin).
6. Reporte en docs/reports/backtest-futbol.md con tablas y gráficas.
Si el modelo no mejora el log loss del mercado en una liga, márcala como "solo mercado" en
config. Nunca ajustes hiperparámetros mirando la temporada de prueba.
```

### Prompt fase 2 — Web MVP prepartido

```text
Lee las Partes VII, IX y X de docs/plan.md. Construye en apps/web las rutas de fase 1 con datos
reales de Postgres vía Server Components y Cache Components:
- /partido/[id] completo salvo la pestaña En vivo; /hoy en grilla bento; /valor;
  /herramientas con todas las calculadoras y su explicación paso a paso (concepto, fórmula,
  símbolos, luego números); /aprender con 5 lecciones; páginas legales; /cuenta.
- AgeGate, CookieConsent, ResponsibleGamblingFooter y SessionTimer.
- Animaciones 1, 2, 4, 6, 7, 8, 9, 10 y 11 del catálogo con su variante de movimiento reducido.
- Landing con hero 3D (animación 5) en Three.js WebGPU con carga diferida y póster AVIF.
Cumple los presupuestos de rendimiento de la Parte VIII y WCAG 2.2 AA. Escribe e2e con
Playwright para: primera visita con puerta de edad, explorar un partido, usar el devig,
cambiar a modo claro y activar movimiento reducido.
```

### Prompt fase 3 — Tiempo real

```text
Lee la Parte VIII de docs/plan.md. Agrega tiempo real:
1. Ingesta en vivo de cuotas por WebSocket del proveedor y polling por estado del partido
   según la tabla de la Parte V.
2. Recomputación en vivo: intensidad de goles restante por minuto, ajustes por tarjeta roja y
   estado del marcador; publica en Redis.
3. apps/gateway: SSE con Hono, canales por partido y por tablero, versión monótona, heartbeat
   cada 15 s y reconexión con Last-Event-ID; contratos en packages/contracts.
4. Cliente: hook useLiveEvent que actualiza TanStack Query; pestaña En vivo con WinProbChart,
   XgTimeline y MomentumBars (animación 3) y StaleDataBanner.
5. services/grader: congela cierres, califica y calcula CLV; /rendimiento con CalibrationChart
   y CSV descargable.
6. Prueba de carga con k6: 1,000 clientes, p95 de proveedor a pantalla < 2 s.
Documenta resultados en docs/reports/realtime.md.
```

### Prompt fase 4 — IA y plan Pro

```text
Lee la Parte XI de docs/plan.md. Implementa:
1. ExplanationCard con claude-haiku-5-5 y salida JSON validada con zod, generada por un worker
   en T-24 h, T-1 h, al confirmarse alineaciones y cuando la probabilidad cambie más de 3 puntos;
   cacheada en la tabla explanations.
2. /analista con Vercel AI SDK, claude-sonnet-5-5 y las herramientas de solo lectura de la
   Parte XI; GenerativeSlot que solo renderiza componentes de la lista blanca.
3. Validador de anclaje numérico y linter de términos prohibidos sobre cada respuesta.
4. Detección de señales de pérdida de control que prioriza recursos de ayuda y límites.
5. services/eval con 50 partidos reales y reporte en docs/reports/ai-eval.md.
6. Plan Pro con límites de mensajes y pasarela de pagos local (Wompi o Mercado Pago).
```

### Prompt fase 5 — Más deportes

```text
Lee la Parte II de docs/plan.md. Agrega NBA con el mismo patrón del fútbol: posesiones por
eficiencia con simulación Monte Carlo, props como minutos por tasa con binomial negativa,
pipeline de lesiones que dispara recomputación, y backtest con reporte antes de publicar.
Después, en este orden: tenis (Elo por superficie + modelo de puntos), MLB (carreras esperadas
+ Pitágoras, ajuste por abridor), NFL (Elo + EPA, ajuste por QB) y NHL (xG + GSAx, portero).
Cada deporte se publica en modo "solo mercado" hasta pasar su backtest.
```

## Criterios de aceptación, pruebas y métricas

Nada se lanza sin pasar esta lista en CI o en el reporte de la fase. La métrica norte del producto es "decisiones informadas" (usuarios que abren el cálculo o la explicación de un mercado), no volumen de apuestas.

### Criterios de aceptación

| Área | Criterio | Cómo se verifica |
| --- | --- | --- |
| Fórmulas | TS y Python dan el mismo resultado en todos los vectores (tolerancia 1e-9); el devig siempre suma 1; Kelly nunca supera el tope | Vitest + pytest en CI |
| Modelo | Log loss igual o mejor que el mercado sin margen en cada liga publicada; error de calibración esperado (ECE) ≤ 0.02 | Reporte de backtest walk-forward |
| Integridad | Toda predicción tiene hash y sello anterior al inicio; ninguna se modifica después | Test de base de datos + auditoría en `/rendimiento` |
| Tiempo real | p95 de proveedor a pantalla < 2 s; cero mensajes fuera de orden aplicados; reconexión < 5 s; banner si la cuota tiene más de 3 min en vivo | k6 + e2e con red simulada |
| Rendimiento | LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 en móvil p75; JS inicial ≤ 200 KB comprimido en páginas de datos | Lighthouse CI + datos reales de campo |
| Accesibilidad | WCAG 2.2 AA; 0 fallas graves o críticas de axe; todo operable con teclado; variante de movimiento reducido en cada componente animado | axe-core en Playwright + `emulateMedia({ reducedMotion: 'reduce' })` |
| Cumplimiento | 0 términos prohibidos; 0 enlaces a operadores fuera de la lista blanca; puerta de edad y pie de juego responsable en todas las páginas | Linter de copy + test de enlaces + e2e |
| Privacidad | Política de tratamiento visible, autorización registrada, consentimiento de cookies antes de analítica | e2e + revisión legal |
| IA | 100 % de anclaje numérico y 0 términos prohibidos en el set de evaluación; la app funciona con la API de IA caída | services/eval + prueba de caos |
| Seguridad | Ninguna clave en el cliente; límites de tasa en APIs públicas; encabezados de seguridad; datos del usuario aislados por cuenta | Escaneo de secretos + tests de autorización |

### Métricas después del lanzamiento

| Familia | Métrica | Para qué |
| --- | --- | --- |
| Producto | Usuarios activos semanales, retención D7 y D30 | Tracción |
| Comprensión | % de sesiones que abren un cálculo paso a paso, una explicación o una lección | Métrica norte |
| Negocio | Conversión a Pro, costo de datos e IA por usuario activo | Viabilidad |
| Modelo | Log loss frente al mercado, ECE y CLV medio, por liga y por mes | Credibilidad pública |
| Bienestar | % de usuarios con límites configurados, duración de sesión p95, autoexclusiones | Detectar uso problemático; nunca se optimiza para más tiempo en la app |

## Fuentes

Consultadas el 7 de noviembre de 2026. Las marcadas con ✓ se verificaron abriendo la página; el resto proviene de resultados de búsqueda y debe revisarse antes de citarse fuera de este plan. Precios y versiones cambian: confirmar con cada proveedor antes de contratar.

**Cuantitativo y modelos**

- ✓ [Walsh y Joshi (2024), calibración vs. exactitud, Machine Learning with Applications](https://researchportal.bath.ac.uk/en/publications/machine-learning-for-sports-betting-should-model-selection-be-bas/)
- [Uhrín et al., estrategias óptimas de apuesta en la práctica (arXiv 2107.08827)](https://arxiv.org/pdf/2107.08827)
- [Compare n' Bet, métodos de devig](https://comparenbet.pages.dev/guide-devigging-methods) · [OddsPapi, devig en Python](https://oddspapi.io/blog/?p=3089) · [Compare n' Bet, eficiencia de mercado](https://comparenbet.pages.dev/guide-market-efficiency)
- [The Spread, CLV y cierres de referencia](https://www.thespread.com/?p=550721)
- [Management Science, ineficiencias en líneas de MLB](https://pubsonline.informs.org/doi/fpi/10.1287/mnsc.2022.00456) · [ETSU, sesgo de totales NBA](https://dc.etsu.edu/etsu-works/17780)
- [Akgül (2025), Dixon-Coles](https://urazakgul.github.io/datafc-blog/posts/en/post3/better-predictions-for-football-matches-how-does-the-dixon-coles-model-work.html) · [Petretta et al. (2025)](https://unifind.unipd.it/resource/item/868244) · [TheStatsAPI, Poisson](https://www.thestatsapi.com/tools/poisson-score-predictor)
- [Kovalchik (2016), modelos de tenis](https://www.degruyterbrill.com/document/doi/10.1515/jqas-2015-0059/html) · [NTU, Elo en tenis](https://irep.ntu.ac.uk/id/eprint/42038)
- [nfelo, EPA y modelo NFL](https://www.nfeloapp.com/live/qb-epa) · [UConn, modelo MLB](https://statds.org/events/ucsas2021/posters/ucsas2021_10_Miles_Kee.pdf) · [theScore, GSAx en NHL](https://www.thescore.com/nhl/news/2866089)

**Mercado y competidores**

- ✓ [Blask, mercados de predicción en EE. UU. 2026](https://blask.com/blog/prediction-markets-us-igaming-2026/) · [Unlock, volumen de junio 2026](https://www.unlock-bc.com/en/kalshi-and-polymarket-record-45-billion-combined-volume-in-june-as-world-cup-boosts-activity)
- [LFG Sports AI](https://lite.aol.com/sports/story/0022/20260211/9652690.htm) · [BetsAI](https://appgoblin.info/apps/6756926912) · [WagerProof](https://appgoblin.info/apps/6757089957) · [OddsJam por Flat Studio](https://www.flatstudio.co/work/oddsjam-ios) · [Apple Sports](https://www.creativeboom.com/inspiration/this-new-app-from-apple-has-something-important-to-teach-us-about-designing-data/)
- [Awful Announcing, Opta y FBref](https://amp.awfulannouncing.com/soccer/sports-reference-pulls-advanced-data-agreement-violation-dispute.html)

**Datos**

- ✓ [Sportmonks, planes](https://www.sportmonks.com/football-api/alternatives/sportradar/) · [Sportmonks, cobertura y precios de xG](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/expected/coverage) · [API-Football, precios](https://www.api-football.com/pricing)
- [Odds-API.io vs The Odds API](https://odds-api.io/blog/odds-api-io-vs-the-odds-api) · [OddsPapi, límites del plan gratis](https://oddspapi.io/blog/the-odds-api-free-tier-limits) · [SportsGameOdds, API +EV](https://sportsgameodds.com/use-cases/positive-ev-betting-api) · [Sportradar, revisión 2026](https://sportsapis.dev/apis/sportradar)

**Legal y juego responsable (Colombia)**

- ✓ [Focus Gaming News, bloqueos de Coljuegos](https://focusgn.com/latinoamerica/coljuegos-intensifica-acciones-de-bloqueo-de-sitios-web-de-apuestas-ilegales) · ✓ [SoloAzar, sitios eliminados de 1Win, 1xBet y Pinnacle](https://www.soloazar.com/en/category/other/coljuegos-intensifies-actions-to-block-illegal-websites-of-the-1win-1xbet-and-pinnacle-brands)
- [Asuntos Legales, apuestas en línea y Ley 643](https://www.asuntoslegales.com.co/consumidor/lo-que-usted-debe-saber-sobre-las-apuestas-en-los-canales-y-medios-electronicos-3926200) · [Radio Nacional, bloqueo con MinTIC](https://radionacional.co/actualidad/mintic-bloqueara-paginas-de-juegos-de-azar-ilegales)
- [Focus Gaming News, bloqueo de perfiles de influenciadores](https://focusgn.com/latinoamerica/influencers-en-la-mira-coljuegos-solicito-bloquear-289-perfiles-de-facebook-e-instagram-por-operar-rifas-y-promocionar-apuestas-ilegales) · [Focus Gaming News, publicidad](https://focusgn.com/latinoamerica/coljuegos-reglamento-juegos-virtuales)
- [SiGMA, autoexclusiones 2024–2025](https://sigma.world/es/news/autoexclusion-juego-en-linea-colombia/) · [SiGMA, suspensión del IVA por la Corte](https://sigma.world/es/news/corte-constitucional-suspende-iva-juegos-linea-colombia/)

**Diseño, animación y stack**

- ✓ [web.dev, scroll-driven animations Baseline (octubre 2026)](https://web.dev/blog/web-platform-10-2026) · [web.dev, View Transitions Baseline (octubre 2025)](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available)
- [Next.js 16](https://nextjs.org/blog/next-16) · [OpenReplay, Motion vs GSAP](https://blog.openreplay.com/motion-vs-gsap/) · [Webflow, GSAP gratis](https://webflow.com/blog/gsap-becomes-free) · [releases.sh, shadcn/ui con Base UI](https://releases.sh/release/rel_TUxVOyVHeyyTBGlCTm6n4)
- [Utsubo, Three.js y WebGPU 2026](https://www.utsubo.com/blog/threejs-2026-what-changed) · [Rive, máquinas de estado y data binding](https://framer.rive.app/blog/state-machines-make-iteration-a-breeze-for-designers-and-developers) · [awesome-generative-ui](https://github.com/narrowin/awesome-generative-ui)
- [Digidop, tendencias 2026](https://www.digidop.com/blog/5-web-design-trends-2025/index.md) · [DesignRush, premios abril 2026](https://news.designrush.com/designrush-design-award-winners-april-2026) · [Really Good Designs, tendencias 2026](https://reallygooddesigns.com/?p=26175)
- [specification.website, movimiento reducido](https://specification.website/spec/accessibility/reduced-motion/) · [TestParty, WCAG 2.3.3 y EAA](https://testparty.ai/blog/wcag-2-3-3-animation-from-interactions-2025-guide)
