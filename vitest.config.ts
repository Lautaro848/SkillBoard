import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Config propia, sin el plugin de Cloudflare: estos tests son de lógica pura
// (cálculos, validaciones) y corren en Node. Usar la config de la app haría
// que Vitest intente arrancar el runtime de Workers para nada.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["app/**/*.test.ts", "supabase/tests/**/*.test.ts"],
  },
});
