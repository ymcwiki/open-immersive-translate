import { crx } from "@crxjs/vite-plugin";
import { defineConfig } from "vite";

import manifest from "./src/manifest.ts";

export default defineConfig({
  plugins: [crx({ manifest })],
});
