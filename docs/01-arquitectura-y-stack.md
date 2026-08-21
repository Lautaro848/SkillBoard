# SkillBoard — Arquitectura y stack

Versión 2.0 · 19/08/2026 · Estado: propuesta a aprobar
**Cambio respecto de la v1.0:** el despliegue pasa de Vercel a Cloudflare Workers y el framework de Next.js a React Router. La base de datos sigue en Supabase. El motivo de cada cambio está en la sección 3.

---

## 1. Decisión de stack

| Capa | Elección | Costo | Por qué |
|---|---|---|---|
| Framework | **React Router v8** (modo framework, con renderizado en servidor) | 0 | Corre directamente sobre el runtime de Workers con el plugin de Vite de Cloudflare. **Sin adaptador**: no hay una capa de traducción que se pueda romper al actualizar. Los `loader` y `action` dan el mismo patrón de validación en servidor que daban los Server Actions. |
| Empaquetado | Vite 7 + `@cloudflare/vite-plugin` | 0 | El mismo runtime en desarrollo y en producción. Lo que funciona local funciona desplegado. |
| Estilos | Tailwind CSS v4 + shadcn/ui | 0 | shadcn/ui copia los componentes al repositorio, así que el sistema de diseño de la Regla 1 se respeta sin pelear contra una librería. Funciona igual con React Router. |
| Hosting | **Cloudflare Workers** | 0 (ver sección 4) | Sin cláusula de uso no comercial. Recursos estáticos gratis e ilimitados. |
| Base de datos | **Supabase (PostgreSQL)** | 0 hasta 500 MB | **No se muda.** El motivo está en la sección 3. |
| Autenticación | Supabase Auth | 0 hasta 50.000 usuarios activos/mes | Hashing, verificación de email, recuperación e invitaciones ya resueltos. |
| Acceso a datos | `supabase-js` sobre HTTP (PostgREST) con el JWT del usuario | 0 | **Decisión clave: es lo que hace que RLS se aplique sola.** Ver sección 5. |
| Archivos | **Cloudflare R2** | 0 hasta 10 GB | Reemplaza a Supabase Storage: 10 GB en vez de 1 GB, y sin cargo por transferencia de salida. Resuelve de entrada el cuello de botella de los PDFs de certificados. |
| Validación | Zod (esquemas compartidos cliente/servidor) | 0 | Un esquema por entidad se ejecuta en el navegador y en el `action`. La Regla 3 se cumple por construcción. |
| Formularios | React Hook Form + Zod resolver | 0 | Validación al perder el foco y preservación de datos ante error (Regla 4). |
| Tareas programadas | `pg_cron` + `pg_net` dentro de Supabase | 0 | Revisión diaria de vencimientos. **Efecto secundario deliberado:** la actividad diaria evita que Supabase pause el proyecto. Se prefiere sobre los Cron Triggers de Workers justamente por eso. |
| Emails | Resend | 0 hasta 3.000/mes (tope 100/día) | Avisos de vencimiento e invitaciones. |
| IA (Tukson) | Capa propia con proveedor intercambiable | Ver sección 6 | Ningún proveedor queda incrustado en el código de negocio. |
| Repositorio y CI | GitHub + GitHub Actions | 0 | Despliegue con `wrangler` desde `main`, copia de seguridad diaria de la base. |
| Testing | Vitest + `@cloudflare/vitest-pool-workers` + Playwright | 0 | Las pruebas unitarias corren **dentro del runtime de Workers**, no en Node. Un test que pasa no miente sobre producción. |

**Idioma del código:** interfaz y contenido en español; variables, funciones y archivos en inglés; tablas y columnas en español, porque el esquema lo va a leer gente de negocio.

---

## 2. Por qué React Router y no Next.js

Next.js sobre Cloudflare funciona: el adaptador `@opennextjs/cloudflare` soporta App Router, Server Components, Server Actions, ISR y middleware. No es una opción mala. Pero pediste costo 0, y ahí la diferencia deja de ser de gusto.

**El plan gratuito de Workers da 10 ms de CPU por solicitud.** Son 10 ms de cómputo puro: no cuenta la espera de la base de datos ni de la red. Next.js corriendo a través de una capa de traducción consume bastante más que eso en una pantalla con una tabla de empleados. React Router corre nativo sobre `workerd`, sin capa intermedia, y arranca mucho más liviano.

Lo que se pierde: Server Components, y una comunidad más chica con menos ejemplos para copiar. Lo que se gana: una chance real de que el producto entre en el plan gratuito, y una dependencia menos que puede romperse en cada actualización de Next.js.

Lo que **no** se pierde, que es lo que importaba: el patrón de validación en servidor. Un `action` de React Router es el mismo lugar donde se corre el esquema Zod que en un Server Action de Next.js. La Regla 3 se cumple exactamente igual.

---

## 3. Por qué la base de datos NO se muda a D1

Esta es la parte donde "cambiemos todo el stack" habría salido caro.

**D1 es SQLite, y SQLite no tiene Row Level Security.** Todo el diseño de aislamiento entre empresas del documento 02 se apoya en que Postgres filtra por `empresa_id` **antes** de que la consulta llegue a la aplicación. Con D1 esa capa desaparece y el aislamiento pasa a depender de que ningún programador se olvide nunca de un `where empresa_id = ?`. En un producto multiempresa que guarda datos personales de empleados de terceros, esa apuesta no se hace.

Lo demás que se perdería:

| Se pierde | Habría que escribirlo a mano |
|---|---|
| Row Level Security | Aislamiento multiempresa completo, y sus pruebas |
| Supabase Auth | Registro, verificación, recuperación, sesiones, invitaciones |
| `unaccent` + `pg_trgm` | La búsqueda tolerante a acentos ("peres" → "Pérez") |
| `pg_cron` + `pg_net` | Las tareas programadas de vencimientos |
| Vistas SQL | El cálculo de estado de certificados |
| Tipos ricos (`citext`, `uuid`, `jsonb`, arreglos) | Serialización manual en varias tablas |
| Restricciones `check` en la base | La segunda capa de la doble validación |
| Tope de tamaño | D1 llega a 10 GB por base y **no se puede ampliar** |

Serían varias semanas de trabajo para terminar con menos seguridad. Supabase se queda.

**Lo que sí se muda a Cloudflare:** los archivos, de Supabase Storage a **R2**. Ahí la comparación es al revés: 10 GB contra 1 GB, sin cargo de salida, 1 millón de operaciones de escritura y 10 millones de lectura por mes. Es la pieza de Cloudflare que conviene adoptar sin dudarlo.

---

## 4. ¿Se puede sostener con costo 0? El análisis honesto

Cloudflare no tiene la cláusula de Vercel: **su plan gratuito permite uso comercial.** La única restricción de contenido es servir video y archivos grandes alojados fuera de Cloudflare, que no es nuestro caso.

Queda entonces el problema técnico: los 10 ms de CPU. La arquitectura está diseñada alrededor de ese número.

### Lo que juega a favor

**1. Los recursos estáticos son gratis e ilimitados.** La documentación de Cloudflare es literal: *"Requests to static assets are free and unlimited."* No invocan el Worker, no cuentan contra el límite diario y no se cobran. Todo el JavaScript, el CSS, las tipografías y los íconos de SkillBoard salen de ahí. **No consumen ni una solicitud del cupo.**

**2. Solo el primer ingreso renderiza HTML completo.** Después de eso, cada navegación dentro de la aplicación llama al `loader` y recibe **JSON**. Serializar JSON cuesta una fracción de lo que cuesta renderizar React a HTML. El grueso del tráfico de un usuario que trabaja media hora en el sistema son respuestas JSON baratas.

**3. La espera de la base no cuenta.** El tiempo que tarda Supabase en responder es tiempo de red, no de CPU. Una pantalla que hace seis consultas no gasta 10 ms de CPU por eso.

**4. 100.000 solicitudes por día es mucho.** Una empresa con tres usuarios de RR.HH. trabajando activamente genera del orden de 2.000 a 4.000 solicitudes diarias. Entran unas 25 a 40 empresas antes de rozar el techo.

### Lo que juega en contra

El renderizado inicial de una pantalla pesada —el listado de empleados con 100 filas— puede pasarse de 10 ms. Cuando eso ocurre, Workers corta la solicitud con error 1102.

**Mitigaciones, en orden de aplicación:**

1. El listado carga la primera pantalla en el servidor y el resto de las filas con `clientLoader`, del lado del navegador. El servidor renderiza 25 filas, no 500.
2. Paginación de 25 por defecto (ya estaba en la especificación por usabilidad; ahora además es una decisión de arquitectura).
3. Componentes pesados —gráficos del panel, vista de carrusel— se cargan solo en el cliente. Un gráfico no necesita renderizarse en servidor.
4. El HTML de las pantallas públicas (login, registro, página comercial) se prerenderiza como recurso estático: cero CPU.

### El veredicto

**Costo 0 es plausible, no está garantizado.** Cualquiera que te lo asegure sin haberlo medido te está vendiendo algo.

Por eso la Fase 0 incorpora una tarea explícita: **medir el tiempo de CPU de cada ruta con datos realistas** (una empresa de 200 empleados y 600 certificados) y dejar el número registrado. Si las rutas entran holgadas en 10 ms, el hosting cuesta 0 indefinidamente. Si alguna no entra y no se puede aligerar, son **5 USD/mes** de Workers Paid, que sube el tope a 30 s de CPU y 10 millones de solicitudes mensuales.

Cinco dólares al mes es una cuarta parte de lo que costaba la alternativa de Vercel Pro, y se decide con un número medido, no con una corazonada.

### Comparación de referencia

| | Workers Free | Workers Paid | Vercel Pro |
|---|---|---|---|
| Costo | 0 | 5 USD/mes mínimo | 20 USD/mes |
| Uso comercial | **permitido** | permitido | permitido (Hobby no) |
| Solicitudes | 100.000/día | 10 millones/mes | incluidas |
| CPU por solicitud | **10 ms** | 30 s (hasta 5 min) | 300 s |
| Subpeticiones por solicitud | 50 | 10.000 | — |
| Recursos estáticos | gratis e ilimitados | gratis e ilimitados | cuentan |
| Transferencia de salida | sin cargo | sin cargo | limitada |

---

## 5. Cómo se conecta el Worker con Supabase

Hay dos caminos y la elección tiene consecuencias de seguridad, así que queda escrita.

**Camino elegido: `supabase-js` sobre HTTP, con el JWT del usuario.**

```ts
// Se crea un cliente por solicitud, con el token de la sesión del usuario.
// PostgREST recibe ese JWT y Postgres resuelve auth.uid() con él,
// así que las políticas RLS del documento 02 se aplican solas.
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${accessToken}` } },
});
```

**Camino descartado: Hyperdrive + conexión TCP directa con Drizzle o postgres.js.** Hyperdrive está incluido en el plan gratuito (100.000 consultas por día) y sería más rápido para SQL complejo. Pero una conexión directa entra como un rol de base de datos, no como un usuario: `auth.uid()` queda vacío y **las políticas RLS no se aplican**. Habría que fijar los claims a mano en cada conexión, y un olvido ahí es una filtración de datos entre empresas.

Se reserva Hyperdrive para un caso puntual y acotado: consultas de informes pesadas, en código de servidor, con el `empresa_id` fijado explícitamente y revisado. No para el acceso general a datos.

**Consecuencia práctica:** cada consulta a Supabase es una subpetición. El plan gratuito permite 50 por solicitud. Una pantalla que hace 6 consultas está lejísimos del límite, pero hay que evitar el patrón de una consulta por fila (consultar N empleados y después el certificado de cada uno). Se resuelve con vistas y `select` anidados de PostgREST, que ya estaban en el diseño.

---

## 6. Tukson y un problema de privacidad que hay que mirar de frente

*(Sin cambios respecto de la v1.0: esta decisión no depende del hosting.)*

Los términos del tier gratuito de Gemini dicen que Google *"uses the content you submit to the Services and any generated responses to provide, improve, and develop Google products and services"* y que *"human reviewers may read, annotate, and process your API input and output"*. En el tier pago, no.

Mandar nombres, documentos y certificados médicos de empleados de un cliente a un servicio que los usa para entrenar y que puede exponerlos a revisores humanos es indefendible ante ese cliente y problemático frente a la Ley 25.326.

**Solución de dos partes:**

**1. Seudonimización obligatoria.** Tukson nunca recibe nombres, solo identificadores internos y atributos funcionales:

```
EMP-0143 · Mantenimiento · hidráulica(4), soldadura(3) · carnet altura vigente · carga hoy 2/8 h
```

El servidor traduce `EMP-0143` a "Juan Pérez" recién al armar la pantalla. Además de cumplir con la minimización de datos, elimina el sesgo por nombre, género o nacionalidad.

**2. Proveedor intercambiable.** Una interfaz `LLMProvider` configurada por variable de entorno. En desarrollo, tier gratuito con datos ficticios; en producción, proveedor pago.

**Costo real:** unos 8.000 tokens de entrada y 2.000 de salida por lote de 30 tareas. Menos de 1 USD por empresa por mes.

**Tukson con datos reales no es costo 0, es costo despreciable.** El resto del sistema sí puede ser costo 0.

> **Nota de implementación en Workers:** las llamadas al modelo pueden tardar 10 a 20 segundos. En Workers eso **no** es un problema de CPU (es espera de red, y la duración de una solicitud HTTP no tiene tope mientras el cliente siga conectado), pero sí consume una subpetición. El análisis de un lote se ejecuta como una sola solicitud con respuesta en flujo, para que el usuario vea el progreso paso a paso.

---

## 7. Límites verificados de la capa gratuita (19/08/2026)

### Cloudflare Workers — Free
100.000 solicitudes/día · 10 ms de CPU por solicitud · 128 MB de memoria · 50 subpeticiones por solicitud · **recursos estáticos gratis e ilimitados** · sin cargo por transferencia · uso comercial permitido.

### Cloudflare R2 — Free
10 GB de almacenamiento · 1 millón de operaciones de escritura/mes · 10 millones de lectura/mes · **transferencia de salida sin cargo**.

### Supabase — Free

| Recurso | Incluido | Qué significa acá |
|---|---|---|
| Base de datos | 500 MB | Un empleado con certificados y aptitudes ocupa ~4 KB → más de 100.000 empleados. No es la restricción que va a molestar. |
| Almacenamiento | 1 GB | **Ya no lo usamos: los archivos van a R2.** |
| Transferencia | 5 GB/mes | Las fotos y PDFs salen por R2, así que por acá solo pasa JSON. Holgado. |
| Usuarios activos/mes | 50.000 | Los usuarios son de RR.HH., no los empleados. Una pyme usa 1 a 5. Irrelevante. |
| Proyectos activos | 2 | Exactamente los que necesitamos: desarrollo y producción. Cero margen. |
| Pausa por inactividad | A la semana sin uso | Neutralizada por el `pg_cron` diario. |
| Backups | **No incluidos** | Riesgo asumido, mitigado en la sección 8. |

### Resend — Free
3.000 emails/mes, tope de 100 por día, 1 dominio.

---

## 8. Riesgos asumidos y sus mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Alguna ruta se pasa de 10 ms de CPU | **Media** | Error 1102 en pantallas pesadas | Medición obligatoria en la Fase 0 con datos realistas. Carga en cliente para listados y gráficos. Si no alcanza: 5 USD/mes. |
| Sin backups automáticos en Supabase Free | Media | **Pérdida total de datos de clientes** | GitHub Action diaria con `pg_dump`, volcado cifrado como artefacto. Se implementa en la Fase 0, no "más adelante". |
| Supabase pausa el proyecto por inactividad | Baja | Caída del servicio | `pg_cron` diario. Alerta si no corre 2 días seguidos. |
| Solo 2 proyectos de Supabase gratuitos | Certeza | Sin ambiente de pruebas | Desarrollo y producción ocupan los dos. Las pruebas corren contra Postgres local en Docker. |
| Ecosistema de React Router más chico | Media | Menos ejemplos, más tiempo de resolución | Se compensa con que no hay adaptador: cuando algo falla, falla en código propio y no en una capa de traducción ajena. |
| Se superan 100.000 solicitudes/día | Baja al inicio | Error 429 | Se monitorea desde la consola de Cloudflare. Con ~30 empresas activas conviene pasar al plan de 5 USD. |
| Datos personales sin base legal clara | Media | **Sanción y pérdida de confianza** | No almacenar diagnósticos médicos, solo vigencia. Contrato de tratamiento de datos con cada empresa. Documento legal en la Fase 6. |
| Tope de 100 emails/día en Resend | Baja | Avisos no enviados | Un aviso diario agrupado por empresa, nunca uno por certificado. |

---

## 9. Cuándo deja de ser gratis

- **Alguna ruta no entra en 10 ms** → Workers Paid, 5 USD/mes. *Se decide con el número medido en la Fase 0.*
- **Más de ~30 empresas activas** → Workers Paid, 5 USD/mes.
- **Base de datos por encima de 500 MB** → Supabase Pro, 25 USD/mes. Muy lejos.
- **Más de 10 GB de archivos** → R2 pasa a cobrarse por GB, a precio bajo. Muy lejos.
- **Datos reales en Tukson** → proveedor de IA pago, menos de 1 USD/mes por empresa.

**El número honesto:** costo 0 mientras el producto esté en desarrollo, y **entre 0 y 6 USD/mes** con los primeros clientes pagando, según lo que diga la medición de CPU. Contra los 21 USD/mes de la ruta anterior con Vercel, el cambio se paga solo.

---

## Fuentes

- [Cloudflare Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/) — planes Free y Paid
- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) — 10 ms de CPU en Free, 30 s en Paid
- [Cloudflare Workers Static Assets — Billing and Limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) — *"Requests to static assets are free and unlimited"*
- [Cloudflare — React Router en Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/) — plugin de Vite, sin adaptador
- [Cloudflare — Next.js en Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) — adaptador OpenNext, evaluado y descartado
- [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/) — 10 GB y salida sin cargo
- [Cloudflare D1 Limits](https://developers.cloudflare.com/d1/platform/limits/) — evaluado y descartado como base principal
- [Cloudflare Hyperdrive Pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/) — incluido en Free, reservado para informes
- [Cloudflare — Goodbye, section 2.8](https://blog.cloudflare.com/updated-tos/) — la restricción del plan gratuito es por tipo de contenido, no por uso comercial
- [Supabase Pricing](https://supabase.com/pricing) · [Resend Pricing](https://resend.com/pricing) · [Gemini API Terms](https://ai.google.dev/gemini-api/terms)
- [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby) — restricción de uso no comercial que motivó el cambio
