import { loadConfig } from "@dsa/shared";
import { buildApp } from "./app.js";
import { createAppContext } from "./context.js";
import { startSchedulers } from "./schedulers/index.js";

async function main() {
  const config = loadConfig();
  const ctx = createAppContext(config);

  const schedulers = startSchedulers(ctx);
  const app = buildApp(config, ctx);

  // Obsidian vault ingestion (Phase 2): full scan + live watcher.
  if (ctx.obsidianNotes.isConfigured()) {
    try {
      const scan = ctx.obsidianNotes.scanVault();
      app.log.info(
        `Obsidian vault scanned: ${scan.scanned} notes, ${scan.matched} matched to problems`,
      );
    } catch (err) {
      app.log.warn({ err }, "Obsidian vault scan failed");
    }
    ctx.obsidianNotes.startWatching((err) =>
      app.log.warn({ err }, "Obsidian watcher error"),
    );
  }

  // Nightly SQLite backup with rotation (5.1).
  ctx.backupService.start((err) => app.log.warn({ err }, "SQLite backup failed"));

  const shutdown = async () => {
    await schedulers.close();
    await ctx.close();
    await app.close();
  };

  process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
  process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));

  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
    app.log.info(`API listening on http://localhost:${config.port}`);
    if (config.schedulers.enabled) {
      app.log.info("Weekly digest scheduler active (in-process cron — daily pushes removed)");
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
