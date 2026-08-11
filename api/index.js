// Vercel executes this entrypoint as CommonJS. Load the production ESM bundle
// dynamically so the function works in Vercel's runtime without recompiling
// the TypeScript workspace source.
let appPromise;

module.exports = async function handler(req, res) {
  appPromise ??= import("../artifacts/api-server/dist/app.mjs").then(
    (module) => module.default,
  );

  const app = await appPromise;
  return app(req, res);
};
