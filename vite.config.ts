import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Para qué plataforma se buildea:
//   por defecto            → Cloudflare Workers (docs/01-arquitectura-y-stack.md)
//   DEPLOY_TARGET=vercel   → Node/Vercel, para un preview navegable
//   VERCEL=1               → idem, lo setea Vercel solo en su build
//
// La única diferencia real es el plugin del runtime: el código de la app es
// el mismo en los dos casos porque las variables se leen por getEnv() y los
// archivos viven en Supabase Storage, no en un binding de Cloudflare.
const esVercel = process.env.DEPLOY_TARGET === "vercel" || Boolean(process.env.VERCEL);
const esCloudflare = !esVercel;

export default defineConfig({
  plugins: [
    ...(esCloudflare ? [cloudflare({ viteEnvironment: { name: "ssr" } })] : []),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ],
});
