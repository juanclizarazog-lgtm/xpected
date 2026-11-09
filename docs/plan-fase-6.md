# Fase 6: estrategias avanzadas de predicción

Nov 8, 2026 · @Juan Camilo

## Resumen y mensaje para Claude Code

La fase 6 agrega un **Laboratorio Pro** con 14 estrategias avanzadas: las mismas familias de técnicas que usan sindicatos de apuestas, casas y analistas como Opta. Cada una se presenta en tres capas: un veredicto en una frase, una interacción tipo "¿y si…?" y la matemática paso a paso. Todo se construye encima de la app actual, sin rediseñarla.

### Mensaje para Claude Code

> Lo que ya construiste quedó muy bien. El diseño, las animaciones, la estructura de páginas, los componentes y los flujos actuales se conservan tal como están. Esta fase solo agrega: no rediseñes, no renombres y no cambies tokens, componentes ni rutas existentes. Si algún cambio a lo existente es imprescindible, propónlo primero en un ADR y espera aprobación. Reutiliza el sistema de diseño, los tokens de movimiento y los patrones que ya creaste para que lo nuevo se sienta parte de la misma app.

Este mensaje abre cada prompt de la Parte 5. Como este plan se escribió sin ver el código, Claude Code debe inspeccionar el repositorio antes de cada subfase y adaptar los nombres de archivos y componentes a los que realmente existen.

### Qué se agrega y dónde

| Qué | Dónde vive | Para quién |
| --- | --- | --- |
| Ruta `/laboratorio` con las 14 estrategias como tarjetas | Navegación principal, junto a las rutas actuales | Usuarios curiosos y plan Pro |
| Pestaña "Avanzado" en la página del partido | Después de las pestañas existentes, sin moverlas | Quien quiere profundizar en un partido |
| Simulador de temporada | `/ligas/[slug]` y `/laboratorio` | Liga BetPlay, Premier League, LaLiga |
| Rangos de confiabilidad en cada probabilidad | Como capa opcional sobre los componentes actuales, activable desde ajustes | Todos |

### Expectativa honesta

"Más avanzado" no significa "gana más". Estas técnicas sirven sobre todo para medir mejor la incertidumbre, reaccionar más rápido a noticias y explicar el porqué; el mercado sigue siendo difícil de batir. Por eso cada estrategia nace detrás de un interruptor y solo se publica si su backtest mejora la calibración; si no, queda marcada como "educativa".

## Parte 1 — Catálogo de estrategias avanzadas

Catorce estrategias en cinco familias, ordenadas por prioridad: P1 se construye primero porque usa datos que la app ya tiene; P3 necesita datos nuevos o es experimental. Cada ficha sigue el mismo orden que verá el usuario: concepto, fórmula con sus símbolos y cómo se presenta.

| # | Estrategia | Qué resuelve | Dificultad (1–5) | Prioridad |
| --- | --- | --- | --- | --- |
| 1 | Fuerza dinámica con filtro de Kalman | Ratings que cambian en el tiempo con su incertidumbre | 3 | P1 |
| 2 | Modelo jerárquico bayesiano | Ligas y equipos con pocos datos (ascendidos, torneos cortos) | 3 | P1 |
| 3 | Alineaciones y valor de jugadores | Cuánto cambia el partido si falta o entra un jugador | 4 | P2 |
| 4 | Pi-ratings + boosting con explicación SHAP | Más precisión con solo goles, y el porqué de cada predicción | 3 | P2 |
| 5 | Altitud y contexto CONMEBOL | Ventaja de jugar en Bogotá, Quito o La Paz | 2 | P1 |
| 6 | Intensidad en vivo (procesos de Hawkes) | Probabilidad de gol en los próximos minutos | 4 | P2 |
| 7 | Lectura del mercado: steam y movimiento inverso | Detectar dónde entra dinero profesional | 3 | P2 |
| 8 | Predicción del cierre (CLV esperado) | Saber si una cuota probablemente empeore | 4 | P2 |
| 9 | Correlación en combinadas del mismo partido | Probabilidad real de dos selecciones que dependen entre sí | 2 | P1 |
| 10 | Props con cascada de uso (NBA) | Quién absorbe los tiros cuando falta una estrella | 4 | P3 |
| 11 | Córners y tarjetas con efecto árbitro | Mercados de conteo dispersos y ruidosos | 3 | P3 |
| 12 | Rangos de confiabilidad (bayesianos y conformales) | Cuánto confiar en cada número | 3 | P1 |
| 13 | Simulador de temporada Monte Carlo | Campeón, clasificación y descenso con el formato real | 2 | P1 |
| 14 | Banca para apuestas simultáneas | Cuánto arriesgar cuando hay varias selecciones abiertas | 4 | P2 |

### Familia A — Fuerza de los equipos

**1. Fuerza dinámica con filtro de Kalman.** La fuerza *s* de cada equipo es un valor oculto que deriva con el tiempo; antes de cada partido su incertidumbre *P* crece y después se encoge según lo sorprendente del resultado. Es la idea de Glickman y Stern para la NFL y del Poisson bivariado dinámico de Koopman y Lit para la Premier League ([Tinbergen](https://repec.tinbergen.nl/tin/wpaper/12099.rdf); [Elvidge, 2025](https://seanelvidge.com/articles/2025/Football_team_rankings/)). A diferencia de Elo, el tamaño del ajuste (la ganancia *K*) se aprende solo.

```latex
s_t = \rho\, s_{t-1} + \eta_t,\ \ \eta_t \sim \mathcal{N}(0, Q) \qquad P^- = F P F^\top + Q \qquad K = P^- H^\top (H P^- H^\top + R)^{-1} \qquad s^+ = s^- + K\,(y - h(s^-))
```

*En la app:* línea del rating con una banda de confianza que se ensancha entre partidos y se estrecha tras cada resultado.

**2. Modelo jerárquico bayesiano.** Con pocos partidos, la fuerza estimada de un equipo es puro ruido; el modelo jerárquico la "encoge" hacia el promedio de la liga en proporción a cuánta evidencia hay ([Baio y Blangiardo, 2010](https://discovery.ucl.ac.uk/id/eprint/16040/)). Es clave para la Liga BetPlay, de 19 fechas por fase, y para equipos ascendidos.

```latex
\alpha_i \sim \mathcal{N}(\mu, \tau^2), \qquad \hat{\alpha}_i \approx w_i\,\bar{\alpha}_i + (1 - w_i)\,\mu, \qquad w_i = \frac{n_i\,\tau^2}{n_i\,\tau^2 + \sigma^2}
```

*En la app:* deslizador "cuánto creerle a esta temporada vs. al promedio de la liga" que muestra cómo se mueve la probabilidad.

**3. Alineaciones y valor de jugadores.** Se estima un rating por jugador con plus-minus regularizado (regresión ridge sobre quién estaba en cancha) y se valora cada acción con VAEP (cuánto sube la probabilidad de anotar menos cuánto sube la de conceder). Combinar ratings de equipo y de jugadores predice significativamente mejor que cualquiera por separado ([Arntzen y Hvattum, 2021](https://himolde.brage.unit.no/himolde-xmlui/handle/11250/3036758)).

```latex
\hat{\beta} = \arg\min_{\beta} \sum_{s} \left(y_s - x_s^\top \beta\right)^2 + \lambda \sum_j \beta_j^2 \qquad \mathrm{VAEP}(a) = \Delta P_{\text{anotar}}(a) - \Delta P_{\text{conceder}}(a)
```

*En la app:* "¿Y si no juega…?": la alineación probable con jugadores que se activan o desactivan y la barra 1X2 que se recalcula al instante.

**4. Pi-ratings + boosting con explicación SHAP.** Los pi-ratings separan la fuerza de local y de visitante y se actualizan con el error de diferencia de goles, ponderado para que las goleadas no pesen de más. En un estudio posterior sobre la base de datos de la Soccer Prediction Challenge, CatBoost con pi-ratings logró un RPS de 0.1925 frente a 0.2020 de las cuotas de las casas ([Bunker et al.](https://arxiv.org/pdf/2403.07669)). SHAP reparte la predicción entre sus factores.

```latex
\psi(e) = 3 \log_{10}(1 + |e|)\,\operatorname{sign}(e) \qquad f(x) = \phi_0 + \sum_{j=1}^{M} \phi_j(x)
```

*En la app:* gráfica de cascada "de 45 % a 58 %": parte del promedio y cada factor suma o resta su aporte.

**5. Altitud y contexto CONMEBOL.** En 1,460 partidos internacionales en Sudamérica, los equipos de altura anotan más y reciben menos frente a rivales del llano; Bolivia en La Paz frente a equipos al nivel del mar gana en promedio por 2.18 goles, con 1.48 atribuibles a la diferencia de 3,695 m ([BMJ, 2007](https://www.bmj.com/content/335/7633/1278)). Se agrega como covariable con su propia incertidumbre, junto a viaje y descanso.

```latex
\log \lambda_{\text{local}} = \alpha_i + \beta_j + \gamma + \delta \cdot \frac{\max(0, \Delta h)}{1000}
```

*En la app:* mapa de Sudamérica con la altitud de los estadios y el efecto estimado en goles para el partido elegido.

### Familia B — En vivo

**6. Intensidad en vivo con procesos de Hawkes.** Los eventos de un partido se agrupan: un córner o un gol sube la probabilidad de otro evento por unos minutos. Los procesos de Hawkes modelan esa autoexcitación y ya se usaron para predecir goles, córners y faltas en intervalos de tiempo ([Narayanan, Kosmidis y Dellaportas, 2023](https://wrap.warwick.ac.uk/id/eprint/174630)).

```latex
\lambda(t) = \mu(t) + \sum_{t_k < t} \alpha\,\beta\,e^{-\beta (t - t_k)} \qquad P(\text{gol en } [t, t+\Delta]) = 1 - \exp\!\left(-\int_t^{t+\Delta} \lambda(u)\,du\right)
```

*En la app:* "termómetro de peligro" que sube con cada evento y se enfría con el tiempo, y la probabilidad de gol en los próximos 10 minutos.

### Familia C — Mercado

**7. Lectura del mercado: steam y movimiento inverso.** Un steam es un movimiento rápido y uniforme en varias casas a la vez; un umbral informal es un cambio de probabilidad implícita mayor a 0.005 en tres o más casas en menos de 5 minutos, que persiste una hora después ([Compare n' Bet](https://comparenbet.pages.dev/guide-steam-and-rlm)). Si la casa afilada no se movió, no es dinero profesional. Perseguir el steam tarde no es estrategia: el cierre ya lo incorpora ([sports-models-kb](https://sports-models-kb.pages.dev/line-movement-steam-moves)).

```latex
\Delta q = q_{\text{después}} - q_{\text{antes}} > 0.005 \ \text{en} \ge 3 \text{ casas en} \le 5 \text{ min}
```

*En la app:* línea de tiempo de la cuota con pulsos donde hubo steam y una etiqueta "la casa de referencia sí / no se movió". El movimiento inverso requiere porcentajes de apuestas del público; si el proveedor no los da, esa vista no se muestra.

**8. Predicción del cierre (CLV esperado).** Un modelo aprende a anticipar la probabilidad de cierre a partir de la cuota actual, el tiempo al inicio, la deriva reciente, la brecha con la casa afilada y las noticias. Sirve para decir "esta cuota probablemente baje antes del partido".

```latex
\mathbb{E}[\mathrm{CLV}] = o_{\text{ahora}} \cdot \hat{\mathbb{E}}\!\left[p^{\text{justa}}_{\text{cierre}}\right] - 1
```

*En la app:* flecha y frase "probablemente baje / suba / se mantenga" con su confiabilidad, junto a cada cuota.

### Familia D — Mercados derivados

**9. Correlación en combinadas del mismo partido.** Multiplicar probabilidades supone independencia, y dentro de un partido casi nunca la hay. Con la matriz de marcadores que la app ya calcula, la probabilidad conjunta se suma directo: en un ejemplo con tasas 2.56 y 0.74, "más de 2.5 goles + ambos anotan" tiene cuota justa 2.42 en lugar de los 3.24 ingenuos ([OddsPapi](https://oddspapi.io/blog/?p=2955)). Las casas además suelen cobrar un margen extra en estas combinadas ([Juice Reel](https://juicereel.beehiiv.com/p/the-dangers-of-same-game-parlays)).

```latex
P(A \cap B) = \sum_{(x,y) \in A \cap B} P(X = x, Y = y) \qquad \text{efecto} = \frac{P(A \cap B)}{P(A)\,P(B)} - 1
```

*En la app:* combinador con dos o tres interruptores que muestra la probabilidad ingenua tachada y la real al lado, con el porcentaje de correlación.

**10. Props con cascada de uso (NBA).** Las estadísticas de un jugador dependen primero de sus minutos y de su uso; cuando falta un compañero, ese uso se redistribuye según los splits con y sin él. Una proyección es una distribución, no un número: un jugador proyectado en 8.1 puntos puede superar 9.5 en 35 % de los escenarios ([OddsShopper](https://www.oddsshopper.com/articles/betting-101/how-to-make-your-own-nba-projections)).

```latex
\mu_j = \text{min}_j \cdot \text{tasa}_j \cdot \left(1 + \Delta u_j\right), \qquad X_j \sim \mathrm{BinNeg}(\mu_j, k), \qquad P(X_j > \text{línea})
```

*En la app:* diagrama de flujo que muestra hacia qué compañeros se van los tiros del jugador ausente, y la distribución con la línea marcada.

**11. Córners y tarjetas con efecto árbitro.** Son conteos con sobredispersión (los córners llegan en rachas), así que se usan binomial negativa o Poisson compuesto ([Yip et al., 2024](https://scholars.hkbu.edu.hk/en/publications/forecasting-number-of-corner-kicks-taken-in-association-football-/)); en tarjetas pesa el árbitro como efecto aleatorio ([Altmann, 2004](https://openaccess.city.ac.uk/8431)). Es un mercado difícil: en un estudio, los modelos no fueron claramente mejores que apostar siempre al under ([Lund](https://lup.lub.lu.se/student-papers/search/publication/9127007)).

```latex
\mathrm{Var}(X) = \mu + \frac{\mu^2}{k}, \qquad \log \mu = \beta_0 + \text{equipos} + r_{\text{árbitro}},\ \ r \sim \mathcal{N}(0, \sigma_r^2)
```

*En la app:* histograma del conteo con la línea del mercado y el sello "confiabilidad baja" cuando corresponda.

### Familia E — Incertidumbre, simulación y banca

**12. Rangos de confiabilidad.** Dos herramientas distintas: el rango de una *probabilidad* sale de la distribución posterior de los modelos 1 y 2 (o de bootstrap); el rango de un *resultado* o de un *conteo* sale de predicción conformal, que garantiza la cobertura pedida con un solo supuesto, que los datos sean intercambiables ([Zeni, Fontana y Vantini](https://arxiv.org/pdf/2005.07972)).

```latex
s_i = 1 - \hat{p}(y_i \mid x_i), \qquad \hat{q} = s_{(\lceil (n+1)(1-\alpha) \rceil)}, \qquad C(x) = \{\, y : 1 - \hat{p}(y \mid x) \le \hat{q} \,\}, \qquad P(y \in C(x)) \ge 1 - \alpha
```

*En la app:* "58 % (54–62 %)" bajo cada probabilidad, y frases como "con 90 % de cobertura: Local o Empate" o "entre 7 y 13 córners".

**13. Simulador de temporada Monte Carlo.** Se juegan los partidos restantes miles de veces con el modelo y se cuenta en cuántas simulaciones cada equipo sale campeón, clasifica o desciende; Opta usa 10,000 simulaciones para sus predicciones de temporada ([Opta Analyst](https://theanalyst.com/articles/champions-league-predictions-2026-27-opta-supercomputer)). Para la Liga BetPlay 2026-II se replica el formato real: 19 fechas de todos contra todos, los 8 primeros a dos cuadrangulares de ida y vuelta, y final entre los ganadores de grupo ([Noticias Caracol](https://www.noticiascaracol.com/golcaracol/futbol-colombiano/todo-lo-que-debe-saber-de-la-liga-betplay-ii-2026-nuevas-reglas-y-regreso-de-cuadrangulares-so35)); la tabla del descenso solo suma la fase de todos contra todos ([Vanguardia](https://www.vanguardia.com/deportes/futbol/2026/04/27/tabla-del-descenso-de-la-liga-betplay-i-2026-asi-esta-la-lucha-por-la-permanencia-a-una-fecha-del-todos-contra-todos/)).

```latex
\hat{p} = \frac{k}{N}, \qquad \mathrm{EE}(\hat{p}) = \sqrt{\frac{\hat{p}(1-\hat{p})}{N}} \le 0.005 \ \text{con} \ N = 10{,}000
```

*En la app:* barras de % de campeón, cuadrangulares y descenso que se reacomodan al re-simular; el usuario puede fijar un resultado ("¿y si Nacional pierde el clásico?") y ver el impacto.

**14. Banca para apuestas simultáneas.** Aplicar Kelly a cada selección por separado sobreexpone la banca cuando hay varias abiertas, y más si están correlacionadas ([Compare n' Bet](https://comparenbet.pages.dev/guide-advanced-kelly)). La versión con restricción de caída de Busseti, Ryu y Boyd limita la probabilidad de que la banca caiga por debajo de un umbral ([Stanford](https://web.stanford.edu/~boyd/papers/pdf/kelly.pdf)).

```latex
f_i \approx \frac{f_i^{\text{Kelly}}}{1 + (n-1)\,\bar{\rho}} \qquad \max_b\ \mathbb{E}[\log(R^\top b)] \ \ \text{s.a.}\ \ \mathbb{E}\!\left[(R^\top b)^{-\lambda}\right] \le 1,\ \ \lambda = \frac{\log \beta}{\log \alpha}
```

*En la app:* simulador de cartera: el usuario elige varias selecciones, fija "no quiero caer por debajo del 70 % de mi banca con más de 10 % de probabilidad" y ve los montos sugeridos y 1,000 trayectorias animadas.

### Frontera (experimental, fuera del alcance de esta fase)

Modelos tipo GPT entrenados con secuencias de eventos ya simulan partidos con alineaciones hipotéticas: ScoutGPT (marzo de 2026) predice el siguiente evento y la probabilidad de anotar y conceder en cada paso ([arXiv 2603.15212](https://arxiv.org/abs/2603.15212)). Necesitan datos de eventos licenciados y mucho cómputo; quedan como línea de investigación para una fase futura.

## Parte 2 — Mercados difíciles y cómo mostrar la incertidumbre

Mientras más específico el mercado, menos eventos lo deciden y más pesa el azar; por eso cada número de la fase 6 lleva un semáforo de confiabilidad calculado del backtest, no puesto a mano. La app nunca oculta un mercado difícil: lo muestra con su sello y su rango.

### Qué tan predecible es cada mercado

| Mercado | Por qué es difícil | Confiabilidad esperada | Cómo se muestra |
| --- | --- | --- | --- |
| 1X2 y doble oportunidad | Muy líquido: el cierre es eficiente | Alta | Barra 1X2 con rango |
| Hándicap asiático y totales | Depende de toda la distribución de goles | Alta | Distribución de la diferencia de goles |
| Ambos anotan | Sensible a la tasa del equipo débil | Media-alta | Probabilidad con rango |
| Marcador exacto | Con tasas de 1.4 y 1.1 goles, el marcador más probable (1-1) apenas ronda 13 % (cálculo propio) | Media | Mapa de calor y los 5 marcadores más probables; nunca "el marcador será" |
| Combinadas del mismo partido | Correlación y margen extra de la casa | Media | Probabilidad ingenua vs. real |
| Props de jugador | Minutos y lesiones de última hora | Media-baja | Distribución con la línea |
| Córners y tarjetas | Sobredispersión y árbitro | Baja | Histograma + sello |
| Próximo gol en vivo | Pocos eventos, latencia de datos | Baja | Termómetro + rango amplio |

Para hándicaps se usa la distribución de la diferencia de goles. Con Poisson independiente es la distribución de Skellam; con Dixon-Coles se suma directo la matriz de marcadores, que es lo que la app debe hacer.

```latex
P(D = d) = e^{-(\lambda + \mu)} \left(\frac{\lambda}{\mu}\right)^{d/2} I_{|d|}\!\left(2\sqrt{\lambda \mu}\right) \qquad P(D = d) = \sum_{x - y = d} P(X = x, Y = y)
```

### Semáforo de confiabilidad (regla en código)

Se calcula por mercado y liga con las predicciones ya calificadas; *ECE* es el error de calibración esperado y *n* el número de predicciones calificadas.

| Sello | Regla | Texto para el usuario |
| --- | --- | --- |
| Alta | ECE ≤ 0.02 y n ≥ 1,000 | "Históricamente, cuando decimos 60 %, pasa cerca de 60 % de las veces." |
| Media | ECE ≤ 0.04 o 300 ≤ n < 1,000 | "Bien calibrado, con menos historial." |
| Baja | Todo lo demás | "Mercado difícil: úsalo como referencia, no como señal." |
| Educativa | Estrategia sin backtest aprobado | "Modo aprendizaje: no se marcan apuestas de valor." |

```latex
\mathrm{ECE} = \sum_{b=1}^{B} \frac{n_b}{n} \left|\, \bar{y}_b - \bar{p}_b \,\right|
```

### Reglas de presentación

- El rango siempre acompaña al número: "58 % (54–62 %)", nunca el número solo en vistas de la fase 6.
- Los mercados de confiabilidad baja nunca aparecen en el radar de valor ni generan alertas.
- Si dos estrategias se contradicen (por ejemplo, el modelo dice valor y el mercado muestra steam en contra), la tarjeta lo dice en una frase en lugar de esconder una de las dos.

## Parte 3 — Cómo presentarlo simple, interactivo y profesional

Cada estrategia, por compleja que sea, se muestra en la misma tarjeta de tres capas: primero el veredicto, a un clic la interacción, y solo si el usuario lo pide, la matemática. Es divulgación progresiva: lo avanzado se deja en una segunda capa para que la app siga siendo fácil de aprender ([Nielsen Norman Group](https://www.nngroup.com/videos/progressive-disclosure/)).

### Las tres capas

1. **Veredicto (siempre visible):** una frase sin jerga, un número grande con su rango y el semáforo de confiabilidad. Ejemplo: "{Local} gana en 58 % de los escenarios (54–62 %). Confiabilidad alta."
2. **Juega con él (un clic):** una sola interacción tipo "¿y si…?" — un interruptor, un deslizador o una línea de tiempo — con un botón "Restablecer". El resultado responde en menos de 300 ms.
3. **Ver la matemática (acordeón):** concepto, fórmula con sus símbolos y el cálculo con los números de ese partido, reutilizando el componente de cálculo paso a paso que la app ya tiene.

&#91;embedded content: anatomía de una tarjeta de estrategia · 3 capas\]

La misma tarjeta sirve para las 14 estrategias; solo cambian el veredicto, la interacción y la fórmula.

### Cada estrategia en la app

| # | Veredicto (capa 1) | Interacción (capa 2) | Componente nuevo |
| --- | --- | --- | --- |
| 1 | "La fuerza de {Equipo} subió, con incertidumbre moderada." | Recorrer la temporada con una línea de tiempo y ver la banda | `RatingBand` |
| 2 | "Con 6 partidos jugados, confiamos 40 % en esta temporada y 60 % en el promedio." | Deslizador de peso temporada vs. liga | `ShrinkageSlider` |
| 3 | "Sin su 9 titular, la probabilidad de {Local} baja 6 puntos." | Activar o desactivar jugadores en la alineación | `WhatIfLineup` |
| 4 | "Lo que más pesa hoy: forma reciente (+5) y localía (+4)." | Tocar un factor para ver su dato | `FactorWaterfall` |
| 5 | "La altura de Bogotá suma cerca de 0.2 goles esperados a {Local}." | Mapa con estadios; cambiar la sede hipotética | `AltitudeMap` |
| 6 | "Peligro alto: 31 % de gol en los próximos 10 minutos." | Deslizar la ventana de tiempo (5, 10, 15 min) | `DangerThermometer` |
| 7 | "Movimiento fuerte hacia {Visitante} en 4 casas, incluida la de referencia." | Reproducir la línea de la cuota con sus pulsos | `SteamRadar` |
| 8 | "Esta cuota probablemente baje antes del inicio." | Ver el historial de aciertos de esta predicción | `ClosingForecast` |
| 9 | "Juntas no valen 3.24, valen 2.42: están correlacionadas." | Combinar 2–3 selecciones con interruptores | `ParlayCorrelator` |
| 10 | "Sin la estrella, el base absorbe la mayor parte de sus tiros." | Elegir quién falta y ver el flujo de uso | `UsageFlow` |
| 11 | "Entre 7 y 13 córners con 80 % de cobertura. Confiabilidad baja." | Elegir árbitro y línea | `CountDistribution` |
| 12 | "Con 90 % de cobertura: Local o Empate." | Mover el nivel de cobertura (80, 90, 95 %) | `ConfidenceRange` |
| 13 | "{Equipo} llega a la final en 23 % de 10,000 temporadas simuladas." | Fijar resultados y volver a simular | `SeasonSimulator` |
| 14 | "Con tus 4 selecciones, arriesga en total 3.1 % de tu banca." | Fijar el límite de caída que aceptas | `PortfolioKelly` |

Los ejemplos de la tabla son plantillas de texto con datos simulados, no predicciones reales; las cifras salen siempre del motor.

### Animaciones nuevas (con los tokens que ya existen)

| Animación | Uso | Con movimiento reducido |
| --- | --- | --- |
| Banda que respira | La banda de confianza se ensancha y se estrecha al recorrer la temporada | Cambio sin transición |
| Termómetro | Sube con cada evento y decae exponencialmente | Solo la cifra |
| Pulso de steam | Anillo que se expande una vez sobre la línea de la cuota | Marcador estático |
| Barras que se reacomodan | El simulador reordena equipos con animación de layout | Reorden instantáneo |
| Trayectorias | 1,000 líneas de banca que se dibujan en 1.2 s, una sola vez | Banda de percentiles estática |
| Tachado de la probabilidad ingenua | La cifra ingenua se tacha y aparece la real | Ambas visibles sin animar |

### Reglas de diseño para no romper lo que ya funciona

- Todo lo nuevo vive en `features/lab/` (o la carpeta equivalente del repo) y usa los tokens, tipografía y componentes base existentes.
- Ninguna tarjeta nueva tiene más de una interacción principal; el resto va en la capa 3.
- Cada término técnico (Kalman, CLV, conformal) tiene una definición de una línea en un tooltip accesible por teclado.
- Modo "Simple / Experto" en el laboratorio: en Simple la capa 3 empieza cerrada y se ocultan las estrategias de confiabilidad baja.
- Primera visita al laboratorio: recorrido de 3 pasos que explica las tres capas y el semáforo.

## Parte 4 — Añadidos técnicos

Todo lo nuevo entra como módulos y tablas adicionales: ninguna tabla, endpoint ni componente existente cambia de forma. Cada estrategia tiene un interruptor por liga con tres estados (apagada, educativa, publicada) y el código del laboratorio se carga solo en sus rutas.

### Módulos nuevos del motor

| Estrategia | Módulo en `services/model/lab/` | Librerías sugeridas | Se recalcula |
| --- | --- | --- | --- |
| 1 Kalman | `strength_kalman.py` | NumPy (filtro propio) | Tras cada partido |
| 2 Jerárquico | `hierarchical.py` | PyMC o NumPyro | Cada noche |
| 3 Alineaciones | `player_ratings.py`, `lineup_impact.py` | scikit-learn (ridge), socceraction (VAEP) | Cada noche + al confirmarse alineaciones |
| 4 Pi-ratings | `pi_ratings.py`, `explain.py` | CatBoost, SHAP | Tras cada partido |
| 5 Altitud | `context.py` | — | Al publicar el partido |
| 6 Hawkes | `live_intensity.py` | Implementación propia | Cada evento en vivo |
| 7 Mercado | `market_signals.py` | Polars | Cada snapshot de cuotas |
| 8 Cierre | `closing_forecast.py` | LightGBM | Cada 5 min antes del partido |
| 9 Combinadas | `sgp.py` + espejo en `packages/quant` | — | En el navegador, al instante |
| 10 Props | `props_nba.py` | SciPy | Al cambiar el reporte de lesiones |
| 11 Conteos | `counts.py` | statsmodels | Cada noche |
| 12 Rangos | `conformal.py` | MAPIE | Recalibración semanal |
| 13 Simulador | `season_sim.py` + formatos en `formats/*.yaml` | NumPy vectorizado | Tras cada jornada |
| 14 Cartera | `portfolio_kelly.py` | CVXPY | A pedido del usuario |

### Para responder en menos de 300 ms

- **Precalcular:** el impacto de quitar a cada titular (estrategia 3) se calcula en el servidor y se guarda; el clic solo lee el resultado.
- **Calcular en el navegador:** combinadas (9) y encogimiento (2) con las fórmulas de `packages/quant`, a partir de la matriz de marcadores y los parámetros posteriores ya enviados.
- **Web Worker:** cuando el usuario fija resultados en el simulador (13), se corren 2,000 simulaciones en un worker del navegador sobre los parámetros del modelo; la versión oficial de 10,000 viene del servidor.

### Tablas nuevas (migraciones solo aditivas)

| Tabla | Campos clave |
| --- | --- |
| `team_strength_states` | team\_id, as\_of, mean, variance, model\_version |
| `player_ratings` | player\_id, season, off, def, std\_error |
| `lineup_impacts` | event\_id, player\_id, delta\_home, delta\_draw, delta\_away |
| `venue_context` | venue\_id, altitude\_m, source |
| `live_intensity` | event\_id, minute, lambda\_home, lambda\_away |
| `market_signals` | event\_id, market, selection, type, books, sharp\_moved, detected\_at |
| `closing_forecasts` | event\_id, market, selection, predicted\_close\_p, created\_at |
| `referee_profiles` | referee\_id, season, cards\_rate, std\_error |
| `season_simulations` | league\_id, run\_at, n\_sims, results |
| `conformal_calibrations` | market, league\_id, alpha, q\_hat, n |
| `strategy_flags` | strategy\_id, league\_id, status, backtest\_report |

### Datos que hacen falta

| Dato | Estrategia | Fuente probable | Nota |
| --- | --- | --- | --- |
| Alineaciones y cambios | 3 | Proveedor actual de fútbol | Ya suele venir en el plan contratado |
| Eventos por acción | 3 (VAEP) | StatsBomb Open Data para investigar; feed licenciado para producción | Revisar costo antes de comprometerse |
| Altitud de estadios | 5 | Tabla propia con fuente citada | Se carga una vez |
| Árbitro asignado | 11 | Proveedor actual de fútbol | Verificar cobertura en Liga BetPlay |
| Porcentaje de apuestas del público | 7 (movimiento inverso) | No disponible en los proveedores actuales | Sin este dato, solo se muestra steam |
| Splits con y sin jugador (NBA) | 10 | NBA Stats API u otro proveedor | Revisar términos de uso comercial |

Cada fuente nueva se registra en `docs/data-licenses.md` antes de usarse, como ya exige el plan base.

## Parte 5 — Prompts para Claude Code

Cinco subfases, cada una con su prompt listo para pegar. Antes de empezar: exporta este documento a Markdown, guárdalo como `docs/plan-fase-6.md` en el repositorio y agrega la sección de abajo al final de tu `CLAUDE.md`, para que la regla de conservar lo existente aplique en toda la fase y no solo en un prompt.

### Sección para agregar a CLAUDE.md

```markdown
## Fase 6 — Laboratorio Pro (reglas de conservación)
Lo que ya está construido quedó muy bien y se mantiene así. En esta fase:
- Solo se agrega. No rediseñar, renombrar ni mover rutas, componentes, tokens,
  animaciones o textos existentes.
- Todo lo nuevo vive en features/lab/ (UI) y services/model/lab/ (modelos), y reutiliza
  el sistema de diseño, los tokens de movimiento y los componentes base actuales.
- Migraciones solo aditivas. Ningún endpoint existente cambia su contrato.
- Cada estrategia va detrás de strategy_flags (apagada | educativa | publicada).
- Las pruebas de regresión visual de las pantallas existentes deben pasar sin cambios.
- Si tocar algo existente parece imprescindible: proponerlo en un ADR y esperar aprobación.
Plan completo: docs/plan-fase-6.md.
```

### Prompt 6.0 — Reconocimiento y blindaje

```text
Lo que ya construiste quedó muy bien y se mantiene exactamente así; esta fase solo agrega.
Lee CLAUDE.md (sección Fase 6) y docs/plan-fase-6.md. Antes de crear cualquier función nueva:
1. Inspecciona el repositorio y escribe docs/lab/inventario.md: rutas, componentes, tokens,
   animaciones y el componente de cálculo paso a paso que ya existen, con sus rutas de archivo.
   Usa esos nombres reales en todo lo que sigue.
2. Crea una línea base de regresión visual con Playwright (toHaveScreenshot) de todas las
   rutas existentes en oscuro, claro, móvil y movimiento reducido. Guarda también el tamaño
   de los bundles y los resultados de Lighthouse actuales en docs/lab/linea-base.md.
3. Agrega la tabla strategy_flags y un helper de feature flags.
4. Crea features/lab/ con la ruta /laboratorio (estado vacío) y el componente StrategyCard
   de tres capas de la Parte 3, usando solo componentes y tokens existentes, con historias
   de Storybook en sus estados de confiabilidad (alta, media, baja, educativa).
5. Agrega /laboratorio a la navegación sin mover ni cambiar los enlaces actuales.
Al final, corre todas las pruebas y la regresión visual y muéstrame que las pantallas
existentes no cambiaron.
```

### Prompt 6.1 — Núcleo P1 (estrategias 1, 2, 5, 9, 12 y 13)

```text
Recuerda: lo existente quedó muy bien y no se toca. Lee las Partes 1 a 4 de
docs/plan-fase-6.md.
1. Implementa en services/model/lab/: filtro de Kalman de fuerza (1), modelo jerárquico
   con encogimiento (2), covariable de altitud con tabla venue_context y fuente citada (5),
   rangos posteriores y conformales con MAPIE (12) y simulador de temporada vectorizado (13)
   con el formato real de la Liga BetPlay 2026-II en formats/liga-betplay.yaml,
   más Premier League y LaLiga.
2. Agrega a packages/quant (TS y Python, con vectores de prueba) la probabilidad conjunta
   desde la matriz de marcadores y el efecto de correlación (9), y la diferencia de goles.
3. Backtest walk-forward de cada estrategia contra el modelo actual: log loss, RPS, ECE y
   cobertura empírica de los rangos. Reporte en docs/reports/fase6-p1.md. Activa en
   strategy_flags como "publicada" solo lo que mejore; lo demás, "educativa".
4. UI: tarjetas RatingBand, ShrinkageSlider, AltitudeMap, ParlayCorrelator, ConfidenceRange
   y SeasonSimulator (con Web Worker para fijar resultados), en /laboratorio y en una nueva
   pestaña "Avanzado" al final de la página del partido, sin mover las pestañas actuales.
   Cada tarjeta con sus tres capas, semáforo, versión de movimiento reducido y Storybook.
5. Corre la regresión visual: las pantallas existentes deben quedar idénticas.
```

### Prompt 6.2 — Alineaciones y explicación (estrategias 3 y 4)

```text
Lo existente se conserva tal cual. Lee las fichas 3 y 4 de docs/plan-fase-6.md.
1. Ratings de jugadores con plus-minus regularizado (ridge) usando alineaciones y cambios
   del proveedor actual; si hay eventos por acción licenciados, agrega VAEP con socceraction.
   Precalcula lineup_impacts para cada titular probable y recalcula al confirmarse
   las alineaciones.
2. Pi-ratings + CatBoost con explicación SHAP por partido; mezcla con el modelo actual solo
   si mejora el backtest.
3. UI: WhatIfLineup (activar o desactivar jugadores, respuesta < 300 ms leyendo valores
   precalculados) y FactorWaterfall (cascada de factores).
4. Reporte en docs/reports/fase6-p2a.md y regresión visual sin cambios en lo existente.
```

### Prompt 6.3 — En vivo y mercado (estrategias 6, 7 y 8)

```text
Lo existente se conserva tal cual; no cambies el gateway ni los contratos actuales, solo
agrega tipos de mensaje nuevos. Lee las fichas 6, 7 y 8 de docs/plan-fase-6.md.
1. Intensidad en vivo con proceso de Hawkes (propio) y probabilidad de gol en ventanas de
   5, 10 y 15 minutos; publica como mensaje nuevo 'intensity' por el canal en vivo existente.
2. Detector de steam con el umbral de la ficha 7 y confirmación de la casa de referencia;
   guarda en market_signals. No implementes movimiento inverso sin datos de porcentaje de
   apuestas.
3. Modelo de predicción del cierre con LightGBM y su backtest (acierto de dirección y error
   en probabilidad).
4. UI: DangerThermometer, SteamRadar y ClosingForecast en la pestaña Avanzado y en el
   laboratorio.
5. Reporte en docs/reports/fase6-p2b.md y regresión visual sin cambios en lo existente.
```

### Prompt 6.4 — Banca y mercados derivados (estrategias 14, 10 y 11)

```text
Lo existente se conserva tal cual. Lee las fichas 10, 11 y 14 de docs/plan-fase-6.md.
1. PortfolioKelly: optimización con CVXPY con restricción de caída; nunca supera los topes
   de banca y exposición que la app ya aplica. 1,000 trayectorias animadas con variante
   estática para movimiento reducido.
2. Córners y tarjetas con binomial negativa y efecto árbitro; si el backtest no supera a la
   línea ingenua, queda como "educativa".
3. Props NBA con cascada de uso solo si NBA ya está integrada; si no, deja el módulo
   preparado y apagado.
4. Reporte en docs/reports/fase6-p3.md y regresión visual sin cambios en lo existente.
```

## Parte 6 — Criterios de aceptación y no regresión

La fase 6 se acepta solo si lo existente sigue idéntico y cada estrategia publicada demuestra que mejora la calibración. Lo segundo puede fallar sin problema: la estrategia queda como "educativa"; lo primero no.

### No regresión (bloquea el merge)

| Qué | Criterio | Cómo se verifica |
| --- | --- | --- |
| Pantallas existentes | 0 diferencias visuales frente a la línea base en oscuro, claro, móvil y movimiento reducido (tolerancia solo de antialiasing) | Playwright `toHaveScreenshot` en CI |
| Rendimiento existente | Bundles de las rutas actuales sin crecer; Core Web Vitals iguales o mejores que la línea base | Comparación con `docs/lab/linea-base.md` + Lighthouse CI |
| Contratos | Endpoints y mensajes en vivo existentes sin cambios; solo tipos nuevos | Tests de contrato con los esquemas zod actuales |
| Pruebas actuales | Toda la suite existente en verde, sin pruebas desactivadas | CI |
| Código nuevo | Todo dentro de `features/lab/` y `services/model/lab/`, salvo los cambios aprobados por ADR | Revisión del diff |

### Calidad de cada estrategia (decide si se publica)

| Qué | Criterio |
| --- | --- |
| Mejora predictiva | Log loss o RPS mejor que el modelo actual en walk-forward, por liga, con intervalo bootstrap que no cruce cero |
| Calibración | ECE ≤ 0.02 para sello "alta"; reglas de la Parte 2 para los demás |
| Rangos | Cobertura empírica de los rangos conformales a ±2 puntos del nivel pedido (por ejemplo, 88–92 % para 90 %) |
| Simulador | 10,000 simulaciones; error estándar de cada porcentaje ≤ 0.5 puntos; el formato reproduce el reglamento de la liga |
| Interacciones | Respuesta p95 < 300 ms en un móvil de gama media |
| Accesibilidad | WCAG 2.2 AA en las tarjetas nuevas; deslizadores e interruptores operables con teclado; 0 fallas graves de axe |
| Copy | 0 términos prohibidos del plan base; sello visible en cada número de la fase 6 |

### Revisión final antes de anunciar

- Una persona que no conoce la app entiende el veredicto de 3 tarjetas sin abrir la capa 3.
- La página de rendimiento pública incluye las estrategias publicadas con sus métricas.
- Las estrategias en modo "educativa" no generan alertas ni aparecen en el radar de valor.

## Fuentes

Consultadas el 8 de noviembre de 2026. Las marcadas con ✓ se verificaron abriendo la página; el resto proviene de resultados de búsqueda.

**Modelos de equipo y jugadores**

- [Koopman y Lit, Poisson bivariado dinámico (Tinbergen)](https://repec.tinbergen.nl/tin/wpaper/12099.rdf) · [Elvidge (2025), filtro de Kalman bayesiano](https://seanelvidge.com/articles/2025/Football_team_rankings/)
- [Baio y Blangiardo (2010), modelo jerárquico bayesiano](https://discovery.ucl.ac.uk/id/eprint/16040/)
- [Arntzen y Hvattum (2021), ratings de equipo y de jugadores](https://himolde.brage.unit.no/himolde-xmlui/handle/11250/3036758) · [Bajons y Hornik, RAPM con posesiones](https://arxiv.org/pdf/2407.17832)
- ✓ [Bunker, Yeung y Fujii, Machine Learning for Soccer Match Result Prediction](https://arxiv.org/pdf/2403.07669) · [Yeung et al. (2024), Machine Learning](https://mlanthology.org/mlj/2024/yeung2024mlj-evaluating)
- ✓ [McSharry (2007), altitud en fútbol internacional, BMJ](https://www.bmj.com/content/335/7633/1278)

**En vivo, mercado y derivados**

- [Narayanan, Kosmidis y Dellaportas (2023), procesos puntuales marcados en fútbol](https://wrap.warwick.ac.uk/id/eprint/174630)
- [Compare n' Bet, steam y movimiento inverso](https://comparenbet.pages.dev/guide-steam-and-rlm) · [sports-models-kb, movimiento de línea](https://sports-models-kb.pages.dev/line-movement-steam-moves)
- ✓ [OddsPapi, correlación en combinadas del mismo partido](https://oddspapi.io/blog/?p=2955) · [Juice Reel, margen extra en combinadas](https://juicereel.beehiiv.com/p/the-dangers-of-same-game-parlays)
- [OddsShopper, proyecciones NBA como distribución](https://www.oddsshopper.com/articles/betting-101/how-to-make-your-own-nba-projections)
- [Yip et al. (2024), córners con Poisson compuesto](https://scholars.hkbu.edu.hk/en/publications/forecasting-number-of-corner-kicks-taken-in-association-football-/) · [Altmann (2004), tarjetas y árbitro](https://openaccess.city.ac.uk/8431) · [Lund, mercado de córners](https://lup.lub.lu.se/student-papers/search/publication/9127007)

**Incertidumbre, simulación y banca**

- [Zeni, Fontana y Vantini, predicción conformal](https://arxiv.org/pdf/2005.07972)
- [Opta Analyst, 10,000 simulaciones de la Champions 2026-27](https://theanalyst.com/articles/champions-league-predictions-2026-27-opta-supercomputer)
- ✓ [Noticias Caracol, formato Liga BetPlay II-2026](https://www.noticiascaracol.com/golcaracol/futbol-colombiano/todo-lo-que-debe-saber-de-la-liga-betplay-ii-2026-nuevas-reglas-y-regreso-de-cuadrangulares-so35) · [Vanguardia, tabla del descenso](https://www.vanguardia.com/deportes/futbol/2026/04/27/tabla-del-descenso-de-la-liga-betplay-i-2026-asi-esta-la-lucha-por-la-permanencia-a-una-fecha-del-todos-contra-todos/)
- [Busseti, Ryu y Boyd, Kelly con restricción de riesgo](https://web.stanford.edu/~boyd/papers/pdf/kelly.pdf) · [Compare n' Bet, Kelly avanzado](https://comparenbet.pages.dev/guide-advanced-kelly)

**Presentación y frontera**

- [Nielsen Norman Group, divulgación progresiva](https://www.nngroup.com/videos/progressive-disclosure/)
- [Hong et al. (2026), ScoutGPT](https://arxiv.org/abs/2603.15212)
