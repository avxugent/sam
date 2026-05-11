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
    // Test files have their own linting rules (globals provided by vitest)
    "__tests__/**",
    "vitest.config.mts",
    "vitest.setup.mts",
    // Coverage output — generated files, not source
    "coverage/**",
  ]),
  {
    rules: {
      // React Compiler false positives — the rules below are suppressed because
      // they conflict with intentional patterns in this codebase:
      //
      // react-compiler/react-compiler: react-hook-form's useWatch() is correctly
      //   memoizable, but the compiler still warns on a few internal paths.
      //
      // react-hooks/set-state-in-effect: async data-fetch callbacks and derived-
      //   state resets inside effects are standard React patterns; the compiler
      //   plugin flags them as cascading-render risks but they are not.
      "react-compiler/react-compiler": "off",
      "react-hooks/set-state-in-effect": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
    },
  },
]);

export default eslintConfig;
