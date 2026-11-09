/* Linter de copy (Parte III / VI): falla si aparecen términos prohibidos en el texto visible.
   Ejecutar: node tools/lint-copy.js */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = ['index.html', 'assets/js/pages-main.js', 'assets/js/pages-tools.js', 'assets/js/pages-info.js', 'assets/js/pages-markets.js', 'assets/js/components.js', 'assets/js/app.js', 'assets/js/data.js', 'assets/js/fx.js', 'assets/js/feed.js', 'assets/js/audio.js'];
FILES.push('assets/js/lab/lab.js', 'assets/js/lab/lab-boot.js', 'lib/lab/index.js', 'lib/lab/flags.js', 'tools/lab-backtest.js'); // Fase 6: copy del laboratorio
// Términos de docs/copy-rules.md. Se buscan como palabra completa, sin distinguir mayúsculas.
const BANNED = [
  { re: /\bfijas?\b/i, why: '«fija»: usa probabilidad con intervalo' },
  { re: /\bseguras?\b/i, why: '«segura»: usa probabilidad con intervalo' },
  { re: /\blocks?\b/i, why: '«lock»' },
  { re: /\b100\s?%/, why: '«100 %»' },
  { re: /ganancias? (garantizad|asegurad)/i, why: 'promesa de ganancia' },
  { re: /dinero f[aá]cil/i, why: 'promesa de ganancia' },
  { re: /% de aciertos como/i, why: '«% de aciertos» como métrica' },
  { re: /[uú]ltimos minutos/i, why: 'urgencia artificial' },
];
// Frases permitidas que niegan el término (p. ej. «nunca garantiza ganancias»).
const ALLOW = [/no garantiza/i, /garantiza ganancias\?/i, /Ningún modelo garantiza/i, /garantizamos resultados ni ganancias/i];

let problems = 0;
FILES.forEach((f) => {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (ALLOW.some((a) => a.test(line)) && !/fija|segura|lock|100\s?%/i.test(line)) return;
    BANNED.forEach((b) => {
      if (b.re.test(line)) { problems++; console.error(f + ':' + (i + 1) + '  ' + b.why + '\n    ' + line.trim().slice(0, 140)); }
    });
  });
});
if (problems) { console.error('\n✗ ' + problems + ' problema(s) de copy'); process.exit(1); }
console.log('✓ Copy limpio: 0 términos prohibidos en ' + FILES.length + ' archivos');
