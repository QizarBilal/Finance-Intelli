// Vercel discovers this file as a Node.js Function. The Express application is
// exported without opening a port so Fluid Compute can manage its lifecycle.
export { default } from "../artifacts/api-server/src/app";
