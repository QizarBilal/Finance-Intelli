// Vercel discovers this file as a Node.js Function. The production-ready API
// bundle is created by the root build command before Vercel packages this
// entrypoint, keeping Vercel's TypeScript compiler away from workspace source.
export { default } from "../artifacts/api-server/dist/app.mjs";
