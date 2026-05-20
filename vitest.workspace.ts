import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/shared",
  "packages/intelligence",
  "packages/integrations",
  "packages/backend",
]);
