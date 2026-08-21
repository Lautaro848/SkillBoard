import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

// Ver el comentario de vite.config.ts. VERCEL=1 lo setea Vercel en su propio
// build, así que el preview no necesita configuración manual.
const esVercel = process.env.DEPLOY_TARGET === "vercel" || Boolean(process.env.VERCEL);

export default {
  ssr: true,
  ...(esVercel ? { presets: [vercelPreset()] } : {}),
  future: {
    v8_viteEnvironmentApi: !esVercel,
  },
} satisfies Config;
