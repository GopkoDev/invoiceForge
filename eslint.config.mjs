import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const createActingFreelancerPath = {
  name: "@/lib/services/_shared/acting-freelancer",
  importNames: ["createActingFreelancer"],
  message: "Use actingFreelancerFromSession / actingFreelancerForRoute from @/lib/helpers/session-actor.",
};

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
  ]),
  {
    // ADR-0001: only the trusted factories build an ActingFreelancer. Everything else goes through
    // actingFreelancerFromSession / actingFreelancerForRoute in lib/helpers/session-actor.ts.
    ignores: ["lib/helpers/session-actor.ts", "tests/support/**"],
    rules: {
      "no-restricted-imports": ["error", { paths: [createActingFreelancerPath] }],
    },
  },
  {
    files: ["lib/services/**/*.ts"],
    ignores: ["lib/helpers/session-actor.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["next/headers", "next/cache", "next/navigation", "@/auth", "next-auth", createActingFreelancerPath],
          patterns: ["next-auth/*", "@/lib/actions", "@/lib/actions/*"],
        },
      ],
    },
  },
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression[typeAnnotation.typeName.name='ActingFreelancer']",
          message: "Only lib/services/_shared/acting-freelancer.ts may cast to ActingFreelancer.",
        },
      ],
    },
  },
  {
    files: ["lib/services/_shared/acting-freelancer.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
]);

export default eslintConfig;
