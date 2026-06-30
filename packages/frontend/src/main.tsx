import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { registerFlushOnClose } from "./lib/flushOnClose.js";
import "./styles/global.css";
import "./styles/design.css";

// Best-effort push-only flush to Notion when the tab closes (extra trigger;
// the server SIGTERM handler + stop script remain the real guarantees).
registerFlushOnClose();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
