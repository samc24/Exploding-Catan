import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // The browser smoke tests run in Node and evaluate code in the page.
    files: ["apps/web/e2e/**/*.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // The engine never touches the page or the wall clock.
    files: ["packages/engine/src/**/*.ts"],
    rules: { "no-restricted-globals": ["error", "document", "window", "Date", "localStorage"] },
  },
);
