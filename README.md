# SkillBoard

Sistema de gestión de personal para pymes: saber quién sabe hacer qué, no
quedarse sin habilitaciones vencidas, y repartir el trabajo del día con
criterio (Tukson).

Especificación completa: `docs/00-resumen-y-plan.md`, `docs/01-arquitectura-y-stack.md`,
`docs/02-modelo-de-datos.md`, `docs/03-modulos-y-alcance.md`.

**Estado actual: Fase 0 (fundaciones).** Ver `SETUP.md` para lo que falta
para tener un despliegue real.

## Stack

React Router v7 (Vite) sobre Cloudflare Workers · Supabase (Postgres + Auth +
Row Level Security) · Tailwind v4 · Zod.

## Desarrollo local

```bash
npm install
cp .dev.vars.example .dev.vars   # completar con las credenciales de Supabase
npm run dev
```

Ver `SETUP.md` para crear el proyecto de Supabase, aplicar el esquema y
desplegar a Cloudflare.
