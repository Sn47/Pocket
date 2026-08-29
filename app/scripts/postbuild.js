// Runs after `expo export --platform web`.
// Injects PWA tags into dist/index.html so the Vercel deployment installs
// as a real standalone app (Add to Home Screen on Android + iOS).
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'dist', 'index.html');
let html = fs.readFileSync(file, 'utf8');

// viewport: ensure viewport-fit=cover for notch/safe-area devices
if (/<meta[^>]+name="viewport"[^>]*>/i.test(html)) {
  html = html.replace(/<meta([^>]+)name="viewport"([^>]*)content="([^"]*)"([^>]*)>/i, (m, a, b, content, c) => {
    const v = content.includes('viewport-fit') ? content : content + ', viewport-fit=cover';
    return `<meta${a}name="viewport"${b}content="${v}"${c}>`;
  });
} else {
  html = html.replace('</head>', '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head>');
}

const inject = `
<link rel="manifest" href="/manifest.json">
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
<link rel="apple-touch-icon" href="/icon-192.png">
<meta name="theme-color" content="#000000">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Pocket">
<style>
  html, body { background: #000; }
  /* keep content out of the notch/home-indicator when installed standalone */
  #root { padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); }
</style>
`;
html = html.replace('</head>', inject + '</head>');

// title
if (!/<title>/i.test(html)) html = html.replace('</head>', '<title>Pocket</title></head>');

fs.writeFileSync(file, html);
console.log('postbuild: PWA tags injected into dist/index.html');
