import { createRequire } from "node:module";

// Both src/ and dist/ live directly below the package root.
export const packageMetadata = createRequire(import.meta.url)("../package.json") as {
  name: string;
  version: string;
};
