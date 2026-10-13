// The page behind a shared race link (https://<relay>/join/ABCDE). On Android it opens
// the installed app straight into the race; everywhere it shows the code to type in.
import { CODE_RE } from './room.js';

const APP_ID = 'lk.tuktukclimb.game'; // capacitor.config.json appId

export function joinPage(code, pageUrl) {
  const ok = CODE_RE.test(code);
  const fallback = encodeURIComponent(`${pageUrl}?noapp=1`);
  const intent = `intent://join/${code}#Intent;scheme=tuktukclimb;package=${APP_ID};S.browser_fallback_url=${fallback};end`;
  const body = ok
    ? `<h1>Join my race!</h1>
      <p>Race code</p>
      <div class="code">${code}</div>
      <a class="btn" href="${intent}">Open Hill Rush</a>
      <p class="small">No luck? Open the app, choose <b>Race → Race friends → Join</b> and type the code.</p>
      <script>if (!location.search.includes('noapp') && /Android/i.test(navigator.userAgent)) location.href = ${JSON.stringify(intent)};</script>`
    : '<h1>That link looks broken</h1><p>Ask your friend for the race code.</p>';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hill Rush race</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; box-sizing: border-box;
    font-family: system-ui, sans-serif; background: linear-gradient(#6fb7e8, #cfe8f5); color: #1f2a1f; text-align: center; }
  main { background: #fffaf0; border-radius: 22px; padding: 24px; max-width: 360px; width: 100%; box-shadow: 0 10px 0 #7a1e2c; }
  h1 { color: #7a1e2c; margin: 0 0 8px; }
  .code { font-size: 44px; font-weight: 800; letter-spacing: 6px; margin: 4px 0 18px; }
  .btn { display: block; padding: 14px; border-radius: 14px; background: #2fbf6b; color: #fff; font-weight: 800; text-decoration: none; font-size: 18px; }
  .small { font-size: 14px; opacity: 0.75; }
</style>
</head>
<body><main>🛺 ${body}</main></body>
</html>`;
}
