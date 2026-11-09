/* Xpected · set de iconos propio (SVG en línea, trazo de 1,8 px, hereda currentColor). */
(function () {
  'use strict';
  const XP = (window.XP = window.XP || {});
  const P = {
    ball: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5l3.6 2.6-1.4 4.3H9.8L8.4 10.1z"/><path d="M12 3v4.5M20.6 9.6l-5 .5M17.3 19.4l-3.1-5M6.7 19.4l3.1-5M3.4 9.6l5 .5"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/>',
    fire: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6 0-3 2-4.6 3.2-6.9.5 1.8 1.5 2.7 2.4 3.1C11 8 12.2 5.3 14.6 3c-.3 3.2 4 5.5 4 10.3 0 4.6-2.7 7.7-6.6 7.7z"/><path d="M12 21c-1.6 0-2.8-1.2-2.8-2.9 0-1.6 1.4-2.4 2-3.6.9 1.3 3.6 2 3.6 3.9 0 1.5-1.2 2.6-2.8 2.6z"/>',
    bolt: '<path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
    shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"/><path d="M9 12l2 2 4-4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
    whistle: '<path d="M14 9h7v4h-3.2A6 6 0 1 1 11 6.6"/><circle cx="9" cy="14" r="2"/><path d="M11 4l1.5 2.5"/>',
    card: '<rect x="7" y="3.5" width="10" height="15" rx="1.8" transform="rotate(8 12 11)"/>',
    swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
    table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9 4.5v15"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    'trend-up': '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    'trend-down': '<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
    coin: '<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 9h14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-3"/><circle cx="16" cy="12" r="1" fill="currentColor"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    stadium: '<ellipse cx="12" cy="9" rx="9" ry="3.5"/><path d="M3 9v6c0 1.9 4 3.5 9 3.5s9-1.6 9-3.5V9"/><path d="M8 12.2v3.8M16 12.2v3.8M12 12.5v4"/>',
    live: '<circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>',
    scale: '<path d="M12 4v16M6 20h12M5 8h14"/><path d="M5 8l-2.5 6a3 3 0 0 0 5 0zM19 8l-2.5 6a3 3 0 0 0 5 0z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    'arrow-up': '<path d="M12 19V5M6 11l6-6 6 6"/>',
    'arrow-down': '<path d="M12 5v14M6 13l6 6 6-6"/>',
    calc: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7h7M8.5 11.5h1M12 11.5h1M15.5 11.5h0M8.5 15.5h1M12 15.5h1M15.5 15v1.5"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    padlock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.8-3.3 3.1-5 6-5s5.2 1.7 6 5"/><circle cx="17" cy="9.5" r="2.5"/><path d="M16.5 14.6c2.3.2 4 1.7 4.5 4.4"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    percent: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
    goalnet: '<path d="M3 20V7h18v13"/><path d="M3 7l3-3h12l3 3M7.5 7v13M12 7v13M16.5 7v13M3 11.5h18M3 16h18"/>',
    home: '<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/>',
    plane: '<path d="M21 15.5l-8-4.5V5.5a1.5 1.5 0 0 0-3 0V11l-8 4.5v2l8-2.2V19l-2.5 1.8V22l4-1 4 1v-1.2L13 19v-3.7l8 2.2z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    'chevron-right': '<path d="M9 6l6 6-6 6"/>',
  };
  XP.icon = function (name, size, cls) {
    const body = P[name] || P.info;
    const s = size || 18;
    return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>';
  };
  XP.icons = Object.keys(P);
})();
