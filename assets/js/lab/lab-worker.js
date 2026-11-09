/* Xpected · Laboratorio · simulador de temporada en segundo plano (2.000 temporadas al fijar resultados). */
/* global importScripts */
importScripts('../quant.js', 'lab-quant.js');
self.onmessage = function (e) {
  const d = e.data, t0 = Date.now();
  const res = self.XLQ.simulate(d.model, d.table, d.fixtures, d.format, d.n, d.fixed, d.seed, d.results, { relegation: d.relegation });
  self.postMessage({ res: res, ms: Date.now() - t0, n: d.n, token: d.token });
};
