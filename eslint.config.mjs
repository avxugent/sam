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
  ]),
  {
    rules: {
      // react-hook-form's watch() is intentionally non-memoizable — this is a
      // known false positive from the React Compiler plugin. The watch() return
      // value re-renders the component on change, which is the intended behaviour.
      "react-compiler/react-compiler": "off",
    },
  },
]);

export default eslintConfig;
