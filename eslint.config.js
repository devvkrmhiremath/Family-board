// Lint rules: ESLint's recommended set, plus security plugins that flag unsafe
// HTML sinks (no-unsanitized) and risky patterns (security).
import js from "@eslint/js";
import globals from "globals";
import security from "eslint-plugin-security";
import noUnsanitized from "eslint-plugin-no-unsanitized";

const bestPractice = {
  eqeqeq: ["error", "always", { null: "ignore" }],
  "no-var": "error",
  "prefer-const": "error",
  "no-eval": "error",
  "no-implied-eval": "error",
  "no-new-func": "error",
  "no-script-url": "error",
  "no-implicit-globals": "error",
  "no-shadow": "error",
  "no-unused-vars": ["error", { args: "after-used", caughtErrors: "none" }],
  "no-console": ["error", { allow: ["error"] }],
  "object-shorthand": "error",
  "prefer-template": "error",
};

export default [
  { ignores: ["vendor/**", "node_modules/**"] },
  js.configs.recommended,
  security.configs.recommended,
  noUnsanitized.configs.recommended,
  {
    files: ["src/**/*.js", "config.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: globals.browser },
    rules: bestPractice,
  },
  {
    files: ["sw.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "script", globals: globals.serviceworker },
    rules: bestPractice,
  },
  {
    files: ["tests/**/*.mjs", "tools/**/*.{js,mjs}", "eslint.config.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.node, ...globals.browser } },
    rules: { ...bestPractice, "no-console": "off", "security/detect-non-literal-fs-filename": "off" },
  },
];
