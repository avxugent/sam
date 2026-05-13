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
        "lib/auth.ts",
        // API routes that are covered through mocks at route level are excluded
        // from per-file thresholds; only lib/* must meet 80%
        "app/api/attachments/**",
        "app/api/import/**",
        "app/api/locations/*/assets/**",
        "app/api/locations/*/attachments/**",
        "app/api/manufacturers/**",
        "app/api/models/**",
        "app/api/prometheus/**",
        "app/api/search/**",
        "app/api/users/**",
        "app/api/vault/**",
        "app/api/auth/2fa/**",
        "app/api/assets/by-hostname/**",
        "app/api/assets/[id]/**",
        "app/api/auth/[...nextauth]/**",
        // UI-only components without meaningful logic (pass-through wrappers)
        "components/ui/toast.tsx",
        "components/ui/toaster.tsx",
        "components/ui/dropdown-menu.tsx",
        "components/ui/alert-dialog.tsx",
        "components/ui/separator.tsx",
        "components/ui/tabs.tsx",
        "components/ui/select.tsx",
        // Complex pages with many external deps — integration tested
        "components/layout/**",
        "components/attachments/**",
        "components/auth/**",
        "components/import/**",
        "components/search/**",
        "components/settings/**",
        "components/assets/asset-detail-client.tsx",
        "components/assets/asset-table.tsx",
        "components/assets/asset-form-dialog.tsx",
        "components/locations/location-detail-client.tsx",
        "components/locations/location-map.tsx",
        "components/locations/cover-image-picker.tsx",
        "**/*.d.ts",
        "**/__tests__/**",
        "**/node_modules/**",
      ],
    },
    testTimeout: 10000,
    include: ["**/__tests__/**/*.{test,spec}.{ts,tsx}", "**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next", "coverage"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@prisma/client": path.resolve(__dirname, "generated/prisma/client.ts"),
    },
  },
});
