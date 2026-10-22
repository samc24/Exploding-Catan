import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { startServer } from "./server";
import { FileStore, MemoryStore } from "./store";

const staticDir = process.env.STATIC_DIR ?? resolve(import.meta.dirname, "../../web/dist");
// DATA_DIR is where rooms and sessions live between restarts. Point it at a
// volume. Unset, nothing is kept and a restart ends every game.
const dataDir = process.env.DATA_DIR ?? "";
const store = dataDir ? new FileStore(dataDir) : new MemoryStore();
if (!dataDir) console.warn("DATA_DIR is not set: rooms will not survive a restart");

const srv = startServer({ staticDir: existsSync(staticDir) ? staticDir : null, store });

// A deploy sends SIGTERM: write everything out and let the clients reconnect to the next process.
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => { srv.close().then(() => process.exit(0)); });
}
