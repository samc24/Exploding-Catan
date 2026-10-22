import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "index.html", "ai.js", "net.js", "firebase-config.js", "art", "apps/web/e2e"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // The engine never touches the page or the wall clock.
    files: ["packages/engine/src/**/*.ts"],
    rules: { "no-restricted-globals": ["error", "document", "window", "Date", "localStorage"] },
  },
);
