import { init } from "./page";

void init().catch((error: unknown) => {
  console.error("[imt-userscript] Initialization failed", error);
});
