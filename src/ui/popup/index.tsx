import { useEffect, useState } from "preact/hooks";
import { render } from "preact";

import { loadConfig } from "../../shared/config";
import type { Config } from "../../shared/types";

export function Popup(): preact.JSX.Element {
  const [config, setConfig] = useState<Config>();

  useEffect(() => {
    void loadConfig().then(setConfig).catch(console.error);
  }, []);

  return <main data-service={config?.service}>Popup</main>;
}

const root = document.getElementById("app");
if (root) render(<Popup />, root);
