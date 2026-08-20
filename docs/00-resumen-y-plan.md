# SkillBoard — Resumen ejecutivo y plan de trabajo

Versión 2.0 · 19/08/2026 · Punto de entrada a la especificación
**Cambio respecto de la v1.0:** despliegue en Cloudflare Workers en vez de Vercel, React Router en vez de Next.js, archivos en R2. La base de datos sigue en Supabase. El detalle y los motivos están en el documento 01.

---

## Qué es SkillBoard

Un sistema de gestión de personal para pymes que resuelve tres cosas que hoy se hacen en planillas de Excel sueltas: **saber quién sabe hacer qué**, **no quedarse sin habilitaciones vencidas** y **repartir el trabajo del día con criterio**.

El usuario que paga es un responsable de RR.HH. o de operaciones de una empresa de 20 a 200 empleados. No es técnico. Probablemente hoy tiene tres planillas y un cuaderno.

**La promesa concreta:** cargás tu gente una vez, y SkillBoard te avisa antes de que se venza un carnet, te muestra si la empresa va cumpliendo sus objetivos y te propone quién hace cada tarea del día.

---

## Documentos de la especificación

| Documento | Contenido |
|---|---|
| `00-resumen-y-plan` | Este documento: resumen, plan por fases y decisiones pendientes |
| `01-arquitectura-y-stack` | Stack elegido, límites reales de los planes gratuitos, riesgos de infraestructura |
| `02-modelo-de-datos` | Tablas, aislamiento multiempresa con RLS, índices, planes |
| `03-modulos-y-alcance` | Los 7 módulos con flujos, mensajes y criterios de aceptación |
| `04-tukson` | Motor de asignación: filtro duro, puntaje, IA, memoria de reglas |
| `05-sistema-de-diseno` | Color con contrastes verificados, tipografía, componentes, lenguaje |

---

## Las decisiones tomadas, en una página

**Stack:** React Router v8 + TypeScript + Vite + Tailwind v4 + shadcn/ui, desplegado en **Cloudflare Workers**, con **Supabase** (Postgres, RLS y Auth) como base de datos y **Cloudflare R2** para archivos. Validación con Zod compartida entre navegador y servidor, que es lo que hace que la doble validación de la Regla 3 sea automática y no dependa de la disciplina.

**Multiempresa:** una sola base, aislamiento por Row Level Security de Postgres, `empresa_id` en todas las tablas, y `empresa_id` derivado siempre de la sesión, jamás aceptado desde el cliente. El acceso a datos va por `supabase-js` con el JWT del usuario, que es lo que hace que RLS se aplique sola sin que la aplicación tenga que acordarse.

**Alcance del MVP:** registro, empleados con importación desde Excel, perfil, certificados con avisos de vencimiento. Vendible al terminar la Fase 2. Panel, carrusel y Tukson después.

**Tukson:** filtro duro y puntaje en código determinista; el modelo de lenguaje desempata y explica; las correcciones del usuario se convierten en reglas escritas que un administrador aprueba. Los datos que se envían al modelo están seudonimizados: `EMP-0143`, nunca "Juan Pérez".

**Cobro:** multiempresa con planes por cantidad de empleados. Prueba de 30 días con 25 empleados; Básico 50; Profesional 200; Empresa sin límite.

---

## Cuatro advertencias que conviene leer ahora y no en tres meses

**1. El costo 0 depende de un número que todavía no medimos.** Cloudflare permite uso comercial en su plan gratuito (a diferencia de Vercel Hobby, que lo prohíbe expresamente), y los recursos estáticos son gratis e ilimitados. Pero el plan gratuito de Workers da **10 ms de CPU por solicitud**, y si alguna pantalla se pasa, Cloudflare corta con error 1102. Toda la arquitectura está diseñada para entrar en ese margen —paginación de 25, listados y gráficos cargados en el cliente, pantallas públicas prerenderizadas— pero **plausible no es garantizado**. La Fase 0 incluye medir el CPU de cada ruta con una empresa de 200 empleados. Si entra, el hosting cuesta 0. Si no, son 5 USD/mes de Workers Paid.

**El costo real:** 0 durante el desarrollo, y **entre 0 y 6 USD/mes** con los primeros clientes pagando, según lo que diga esa medición. Cualquiera que te asegure costo 0 sin haberlo medido te está vendiendo algo.

**2. Tukson con datos reales no puede ser costo 0.** Los términos del tier gratuito de Gemini dicen que Google usa el contenido enviado para mejorar sus productos y que revisores humanos pueden leerlo. Mandar datos de empleados de un cliente ahí es indefendible. La solución es doble: seudonimizar todo antes de la llamada (lo cual hay que hacer igual) y usar un proveedor pago en producción. El costo real es de menos de 1 USD por empresa por mes.

**3. Supabase Free no hace copias de seguridad.** Perder la base de un cliente es el fin del producto. La copia diaria automática con GitHub Actions se implementa en la Fase 0, junto con el esquema, no "cuando haya tiempo".

**4. La base de datos no se muda a D1, y es a propósito.** D1 es SQLite y SQLite no tiene Row Level Security: todo el aislamiento entre empresas pasaría a depender de que ningún programador se olvide nunca de un `where empresa_id = ?`. Además habría que escribir a mano la autenticación completa, la búsqueda tolerante a acentos y las tareas programadas. Serían varias semanas de trabajo para terminar con menos seguridad. De Cloudflare sí adoptamos **R2 para archivos**: 10 GB contra el 1 GB de Supabase Storage, y sin cargo de salida.

---

## Plan de trabajo

### Fase 0 — Fundaciones · 2 semanas

Nada de esto se ve en pantalla, y todo lo demás depende de que esté bien.

1. Proyecto React Router v8 sobre Vite con `@cloudflare/vite-plugin`, TypeScript estricto, ESLint y Prettier.
2. Regla de ESLint que prohíbe valores arbitrarios de Tailwind, para que el sistema de diseño se sostenga solo.
3. Sistema de diseño implementado como variables CSS y tema de Tailwind. Componentes base de shadcn/ui adaptados: botón, campo, selector, calendario, tabla, modal, aviso emergente, estado vacío, esqueleto.
4. Proyectos de Supabase: uno de desarrollo, uno de producción (son los dos que permite el plan gratuito).
5. Migraciones con el esquema completo del documento 02, versionadas en el repositorio.
6. RLS activada en todas las tablas, con la función `app.empresas_del_usuario()`. Acceso mediante `supabase-js` con el JWT del usuario, nunca por conexión directa.
7. **Prueba automatizada de aislamiento entre empresas.** Dos empresas, un usuario de cada una, intentos de lectura, escritura y borrado cruzados por todos los caminos. Sin esto verde, la fase no está terminada.
8. Disparadores de auditoría en todas las tablas de negocio.
9. Autenticación completa: registro, verificación de email, inicio de sesión, recuperación, invitaciones.
10. Layout de la aplicación: menú lateral, encabezado, migas de pan, pie.
11. Bucket de R2 configurado, con el módulo `storage` que abstrae la subida y la lectura de archivos.
12. GitHub Action de copia de seguridad diaria con `pg_dump`.
13. Despliegue continuo a Cloudflare con `wrangler` desde `main`, con vistas previas por rama.
14. Pruebas unitarias corriendo dentro del runtime de Workers con `@cloudflare/vitest-pool-workers`.
15. **Medición del tiempo de CPU por ruta**, con una empresa sembrada de 200 empleados y 600 certificados. El resultado se registra en el documento 01 y decide si el hosting cuesta 0 o 5 USD/mes.

**Terminada cuando:** un usuario puede registrarse, verificar su email, entrar y ver un panel vacío con su marca; la prueba de aislamiento pasa; y el número de CPU por ruta está medido y anotado.

### Fase 1 — Empleados · 2 semanas

Catálogos con protección al eliminar · asistente inicial · alta y edición con las validaciones completas de la Regla 3 · carga y recorte de foto con conversión a WebP · listado con búsqueda tolerante a acentos, filtros persistentes en la URL y acciones en lote con resumen previo · perfil con sus cinco pestañas · importación de xlsx y csv en cinco pasos con previsualización y reporte de errores.

**Terminada cuando:** se puede importar una planilla de 500 empleados, corregir los errores que reporte y navegar el listado con filtros sin que nada se pierda al volver atrás.

### Fase 2 — Certificados · 1 semana

Tipos de certificado con obligatoriedad por puesto · carga con validación de archivo por contenido · vista de vencimientos en tres bloques · detección de obligatorios faltantes · vista de calendario · `pg_cron` diario · email agrupado por empresa con la marca correspondiente · configuración de avisos.

**Terminada cuando:** un certificado que vence mañana genera un email hoy, con enlace directo a la vista filtrada.

> **Punto de validación comercial.** Acá conviene frenar y buscar dos o tres pymes conocidas que lo usen gratis a cambio de opinión sincera. Lo que digan cambia el orden de las fases siguientes. Seguir construyendo tres módulos más antes de que alguien real lo toque es la forma más común de perder tres meses.

### Fase 3 — Panel y objetivos · 1,5 semanas

CRUD de objetivos · carga de mediciones · índice de cumplimiento con comparación contra el período anterior · tarjetas enlazadas a vistas filtradas · gráficos con la paleta accesible · selector de período · estados vacíos honestos.

### Fase 4 — Modo carrusel · 1 semana

Configuración con vista previa · ruta pública con token rotable · vista de TV con escala propia · tiempo real por Supabase Realtime · reconexión automática · campos sensibles bloqueados por diseño · registro de accesos en auditoría.

### Fase 5 — Tukson · 3 semanas

Semana 1: ingesta y estructuración de tareas, con la pantalla de revisión.
Semana 2: filtro duro, puntaje, asignación, justificación y validación de la salida del modelo.
Semana 3: correcciones, generación y aprobación de reglas, panel de métricas, importación de empleados desde Word.

### Fase 6 — Comercial · 2 semanas

Página pública prerenderizada como recurso estático (cero CPU) · planes y cobro (Mercado Pago para Argentina, Stripe para el exterior) · límites por plan aplicados en base y servidor · panel de uso · términos, política de privacidad y contrato de tratamiento de datos personales · registro de la base ante la autoridad de aplicación si corresponde.

---

## Definición de "terminado"

Una funcionalidad está terminada cuando:

- [ ] Cumple sus criterios de aceptación del documento 03.
- [ ] Las validaciones existen en el esquema Zod compartido (frontend y backend) **y** como restricción en la base cuando aplica.
- [ ] Tiene estado de carga, estado vacío y estado de error, los tres diseñados.
- [ ] Los mensajes de error explican qué se esperaba y cómo corregirlo.
- [ ] Funciona con teclado y pasa `axe-core` sin incumplimientos críticos.
- [ ] Funciona en 1280 px y es usable en 768 px.
- [ ] El tiempo de CPU de sus rutas está medido y entra en el presupuesto de 10 ms, o está documentado por qué no.
- [ ] Las acciones importantes quedan en auditoría.
- [ ] Tiene pruebas: unitarias para las validaciones, de extremo a extremo para el flujo principal.
- [ ] No hay ningún texto de relleno, botón inerte ni sección "próximamente".

---

## Decisiones que faltan y que te corresponden

1. **Nombre de dominio.** `skillboard.com.ar` o similar. Conviene verificar disponibilidad antes de imprimir la marca en ningún lado.
2. **Precio.** La estructura de planes está definida, los números no. Referencia del mercado argentino de software de RR.HH. para pymes: entre 30 y 150 USD/mes según tamaño.
3. **Símbolo del logotipo.** La marca denominativa está definida (Manrope 700); falta el símbolo.
4. **¿Los empleados tienen acceso propio?** Hoy no: SkillBoard es una herramienta para RR.HH., los empleados son datos, no usuarios. Un portal donde cada empleado vea sus certificados y sus tareas es un producto distinto y bastante más grande. Vale la pena decidirlo a conciencia, porque cambia el modelo de datos.
5. **Rubro de los primeros clientes.** Industria, construcción, logística y gastronomía son los rubros donde los certificados con vencimiento realmente importan. Elegir uno y precargar su catálogo de certificados hace que el producto se sienta hecho a medida desde el primer minuto.

---

## Fuentes

- [Cloudflare Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/) · [Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) · [Static Assets Billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- [React Router en Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/) · [Next.js en Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/) · [D1 Limits](https://developers.cloudflare.com/d1/platform/limits/) · [Hyperdrive Pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/)
- [Cloudflare — Goodbye, section 2.8](https://blog.cloudflare.com/updated-tos/)
- [Supabase Pricing](https://supabase.com/pricing) · [Resend Pricing](https://resend.com/pricing) · [Gemini API Terms](https://ai.google.dev/gemini-api/terms)
- [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby) — restricción de uso no comercial que motivó el cambio
