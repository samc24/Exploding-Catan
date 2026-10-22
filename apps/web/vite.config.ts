import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  server: { port: 5173, fs: { allow: ["../.."] } },
  build: { outDir: "dist", emptyOutDir: true, target: "es2022" },
});
