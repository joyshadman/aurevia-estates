import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

// Raw colors are not allowed outside globals.css: components use role tokens only
// (spec 0003 *Standard definition*). Default palette utilities don't exist at all
// (`--color-*: initial`), so this catches hex, rgb()/hsl(), and the brand ramp.
const rawColor = "/#[0-9a-fA-F]{3,8}\\b|(rgba?|hsla?)\\(|\\bbrand-/";
const rawColorMessage = "Use role color tokens (bg-surface, text-fg, ...) instead of raw colors. See design.md.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-config-next already registers the jsx-a11y plugin; add only the strict rules.
    rules: {
      ...jsxA11y.flatConfigs.strict.rules,
    },
  },
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: `Literal[value=${rawColor}]`, message: rawColorMessage },
        { selector: `TemplateElement[value.raw=${rawColor}]`, message: rawColorMessage },
      ],
    },
  },
  {
    // The styleguide shows ramp swatches on purpose.
    files: ["app/styleguide/**"],
    rules: { "no-restricted-syntax": "off" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "lib/generated/**", "playwright-report/**", "test-results/**", "public/maplibre/**"]),
]);

export default eslintConfig;
