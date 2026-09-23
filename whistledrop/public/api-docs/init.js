// Loaded as a file, not inline, so /api-docs works under script-src 'self'.
window.addEventListener("load", function () {
  window.ui = SwaggerUIBundle({
    url: "/api/openapi",
    dom_id: "#swagger-ui",
    deepLinking: true,
    presets: [SwaggerUIBundle.presets.apis],
    // Keep the Bearer token in memory only; it is gone when the tab closes.
    persistAuthorization: false,
    tryItOutEnabled: true,
    // Default would send the spec URL to validator.swagger.io (a third party).
    validatorUrl: null,
  });
});
