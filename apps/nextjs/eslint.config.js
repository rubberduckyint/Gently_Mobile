import baseConfig, { restrictEnvAccess } from "@gently/eslint-config/base";
import nextjsConfig from "@gently/eslint-config/nextjs";
import reactConfig from "@gently/eslint-config/react";

/** @type {import('typescript-eslint').Config} */
export default [
  {
    ignores: [".next/**"],
  },
  ...baseConfig,
  ...reactConfig,
  ...nextjsConfig,
  ...restrictEnvAccess,
];
