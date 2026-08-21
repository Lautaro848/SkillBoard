import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

// Ver el comentario de vite.config.ts: DEPLOY_TARGET=vercel buildea para
// Node/Vercel; sin esa variable, para Cloudflare Workers.
const esVercel = process.env.DEPLOY_TARGET === "vercel";

export default {
  ssr: true,
  ...(esVercel ? { presets: [vercelPreset()] } : {}),
  future: {
    v8_viteEnvironmentApi: !esVercel,
  },
} satisfies Config;
