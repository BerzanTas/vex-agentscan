import tseslint from "typescript-eslint";

export default tseslint.config(...tseslint.configs.recommended, {
  ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**"],
});
