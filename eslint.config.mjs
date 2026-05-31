import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local Codex skill bundles are reference material, not application code.
    ".skills/**",
  ]),
  {
    rules: {
      // Existing client components commonly initialize async/localStorage state
      // inside effects. Keep this as a warning-level code review concern rather
      // than a launch-blocking error.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
