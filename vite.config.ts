import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// DEPLOY_TARGET decide para qué plataforma se buildea:
//   (sin definir) → Cloudflare Workers, el destino de docs/01-arquitectura-y-stack.md
//   vercel        → Node/Vercel, para tener un preview navegable
//
// La única diferencia real es el plugin del runtime: el código de la app es
// el mismo en los dos casos porque las variables se leen por getEnv() y los
// archivos viven en Supabase Storage, no en un binding de Cloudflare.
const target = process.env.DEPLOY_TARGET;
const esCloudflare = target !== "vercel";

export default defineConfig({
  plugins: [
    ...(esCloudflare ? [cloudflare({ viteEnvironment: { name: "ssr" } })] : []),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ],
});
