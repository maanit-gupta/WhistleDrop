// Swagger UI for the API, built from GET /api/openapi. Plain HTML from a route
// handler (not a Next page) so it contains no inline scripts: every asset is
// a same-origin file under /api-docs/, copied from swagger-ui-dist on install.
const HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>WhistleDrop API docs</title>
    <link rel="stylesheet" href="/api-docs/vendor/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/api-docs/vendor/swagger-ui-bundle.js"></script>
    <script src="/api-docs/init.js"></script>
  </body>
</html>`;

export function GET() {
  return new Response(HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
