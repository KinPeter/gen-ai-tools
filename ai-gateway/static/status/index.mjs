/**
 * Temporary status page served at / and /index.html.
 * Rendered once at factory time: the page is static between restarts.
 */

function normalizePath(url) {
  return (url || "").split("?")[0].replace(/\/+$/, "") || "/";
}

function testUrl(url) {
  const path = normalizePath(url);
  return path === "/" || path === "/index.html";
}

function htmlPage({ port, lanAddress }) {
  const lanUrl = lanAddress ? `http://${lanAddress}:${port}` : null;
  const lanCell = lanUrl ?? "not detected — check the startup logs";
  const lanSource = lanUrl ?? "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ai-gateway</title>
<link rel="icon" href="/assets/favicon.ico">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: #0f1115; color: #e6e8ec;
         font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { width: min(92vw, 560px); background: #181b22; border: 1px solid #262b36;
         border-radius: 12px; padding: 32px; }
  h1 { font-size: 1.5rem; margin: 0 0 4px; letter-spacing: 0.02em; }
  .tag { display: inline-block; margin: 0 0 20px; padding: 2px 10px; border-radius: 999px;
         background: #3a2b12; color: #f2b14e; font-size: 0.75rem; font-weight: 600;
         text-transform: uppercase; letter-spacing: 0.06em; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 18px;
       margin: 0 0 20px; font-size: 0.9rem; }
  dt { color: #8b93a3; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.06em; padding-top: 3px; }
  dd { margin: 0; font-family: ui-monospace, "SF Mono", Menlo, monospace; word-break: break-all; }
  dd a { color: #7cc7ff; text-decoration: none; }
  .mounts { color: #8b93a3; font-size: 0.8rem; border-top: 1px solid #262b36; padding-top: 16px; margin: 0; }
  .mounts code { background: #0f1115; padding: 1px 6px; border-radius: 4px; font-size: 0.78rem; }
</style>
</head>
<body>
  <main>
    <h1>ai-gateway</h1>
    <span class="tag">temporary status page</span>
    <dl>
      <dt>Port</dt><dd>${port}</dd>
      <dt>Lan</dt><dd>${lanSource ? `<a href="${lanSource}">${lanCell}</a>` : lanCell}</dd>
      <dt>Host</dt><dd>0.0.0.0 — reachable from your LAN</dd>
    </dl>
    <p class="mounts">Mounted: <code>/assets/</code> (favicons, manifest)</p>
  </main>
</body>
</html>`;
}

export default function status({ port = 4218, lanAddress = null } = {}) {
  const page = htmlPage({ port, lanAddress });

  function serve(req, res) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page);
  }

  return { testUrl, serve };
}
