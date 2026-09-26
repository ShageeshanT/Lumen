// @ts-check
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import nextPlugin from "@next/eslint-plugin-next";
import prettier from "eslint-config-prettier";
import importX from "eslint-plugin-import-x";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/bin/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "packages/protocol/gen/**",
      "packages/db/migrations/**",
      "apps/web/next-env.d.ts",
    ],
  },

  // Type-aware rules for every TypeScript file in the repository.
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  eslintComments.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["vitest.config.ts"],
          defaultProject: "tsconfig.base.json",
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    plugins: {
      "import-x": importX,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@eslint-community/eslint-comments/require-description": "error",
      "no-console": "error",
      eqeqeq: ["error", "always"],
      // Module resolution is TypeScript's job; import-x only keeps imports tidy.
      "import-x/first": "error",
      "import-x/newline-after-import": "error",
      "import-x/no-duplicates": "error",
      "import-x/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
          pathGroups: [{ pattern: "@lumen/**", group: "internal" }],
          pathGroupsExcludedImportTypes: ["builtin"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
    },
  },

  // Plain JavaScript config files are not type-checked.
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    ...tseslint.configs.disableTypeChecked,
  },

  // The only places that may write to the console: process entry points and scripts.
  {
    files: [
      "apps/api/src/index.ts",
      "apps/api/src/logger.ts",
      "packages/db/src/migrate-cli.ts",
      "scripts/**",
      "e2e/scripts/**",
    ],
    rules: { "no-console": "off" },
  },

  // Dashboard: React hooks, Next.js core web vitals, strict accessibility.
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "@next/next": nextPlugin,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
    settings: {
      next: { rootDir: "apps/web" },
    },
  },
  {
    files: ["apps/web/**/*.tsx"],
    ...jsxA11y.flatConfigs.strict,
  },

  // Prettier owns formatting; disable every stylistic rule that would fight it.
  prettier,
);
