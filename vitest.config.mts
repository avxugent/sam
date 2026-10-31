import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.mts"],
    // Use vmForks pool to handle ESM-only dependencies (jsdom, csstools, etc.)
    pool: "vmForks",
    alias: {
      "@": path.resolve(__dirname, "."),
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
      include: [
        "lib/**/*.ts",
        "app/api/**/*.ts",
        "components/**/*.tsx",
      ],
      exclude: [
        // Infrastructure / config — tested indirectly
        "lib/prisma.ts",
        // UI-only components without meaningful logic (pass-through wrappers)
        "components/ui/toast.tsx",
        "components/ui/toaster.tsx",
        "components/ui/dropdown-menu.tsx",
        "components/ui/alert-dialog.tsx",
        "components/ui/separator.tsx",
        "components/ui/tabs.tsx",
        "components/ui/select.tsx",
        // Stateful clients not yet covered by component tests (there is no UI
        // integration suite); remove an entry once the file has tests.
        "components/locations/location-map.tsx",
        "components/locations/cover-image-picker.tsx",
        "components/layout/stock-nav-items.tsx",
        "components/layout/sidebar.tsx",
        "components/layout/app-footer.tsx",
        "components/layout/app-background.tsx",
        "components/attachments/attachment-gallery.tsx",
        // Tested only in part (specific flows) or only through a parent's
        // tests; not yet held to the line/branch threshold.
        "components/layout/header.tsx",
        "components/layout/language-switcher.tsx",
        "components/admin/catalog/scrape-template-fields.tsx",
        "**/*.d.ts",
        "**/__tests__/**",
        "**/node_modules/**",
      ],
    },
    testTimeout: 10000,
    include: ["**/__tests__/**/*.{test,spec}.{ts,tsx}", "**/*.{test,spec}.{ts,tsx}"],
    // __tests__/integration needs a real database: run with `npm run test:integration`.
    exclude: ["node_modules", ".next", "coverage", "__tests__/integration/**"],
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, ".") },
      { find: /^@prisma\/client$/, replacement: path.resolve(__dirname, "generated/prisma/client.ts") },
    ],
  },
});
