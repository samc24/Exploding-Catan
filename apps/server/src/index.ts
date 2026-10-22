import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { startServer } from "./server";

const staticDir = process.env.STATIC_DIR ?? resolve(import.meta.dirname, "../../web/dist");
startServer({ staticDir: existsSync(staticDir) ? staticDir : null });
