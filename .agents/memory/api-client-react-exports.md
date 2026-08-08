---
name: api-client-react subpath exports
description: The custom-fetch module must be explicitly exported in the package.json exports map.
---

## Rule
`lib/api-client-react/package.json` must include `"./custom-fetch": "./src/custom-fetch.ts"` in the `exports` field.

**Why:** Vite resolves workspace package imports using the `exports` map. If `./custom-fetch` is not listed, Vite throws `Missing "./custom-fetch" specifier in "@workspace/api-client-react" package` even though the file exists physically.

**How to apply:** Any time you add a new subpath import from `@workspace/api-client-react`, add the corresponding entry to the `exports` field in `lib/api-client-react/package.json`.
