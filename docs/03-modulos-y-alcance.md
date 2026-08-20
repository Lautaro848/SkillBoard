# SkillBoard — Módulos, flujos y alcance

Versión 1.1 · 19/08/2026 · Estado: propuesta a aprobar

Cada módulo lleva sus criterios de aceptación. Un módulo no está terminado hasta que todos se cumplen, aunque funcione.

---

## Mapa de navegación

Menú lateral fijo, siempre visible, siempre en el mismo orden. Cada elemento con ícono **y** etiqueta (Regla 2).

```
SkillBoard
├── Panel                    ← inicio tras iniciar sesión
├── Empleados
│   └── Perfil del empleado
├── Certificados
├── Objetivos
├── Tukson
├── Modo carrusel
└── Configuración
    ├── Empresa y marca
    ├── Usuarios y permisos
    ├── Catálogos (puestos, departamentos, aptitudes, tipos de certificado)
    └── Plan y facturación
```

**Verificación de la regla de tres clics:** cargar un empleado = Empleados → Nuevo empleado → Guardar (3). Revisar vencimientos = Certificados → filtro "Por vencer" (2), o un clic desde la tarjeta del panel (1). Asignar tareas = Tukson → Analizar → Confirmar (3). Cumple.

---

## Módulo 1 — Registro de empresa e inicio de sesión

**En el MVP.**

### Flujo de alta

1. `/registro` pide: nombre de la empresa, nombre y apellido del responsable, email de trabajo, contraseña.
2. Se crea `empresas`, `perfiles` y `membresias` con rol `propietario`, en una única transacción. Si algo falla, no queda una empresa huérfana.
3. Email de verificación. Sin verificar no se entra.
4. **Asistente inicial de tres pasos, saltable:**
   - Paso 1: departamentos de la empresa (se ofrecen sugerencias: Administración, Producción, Mantenimiento, Ventas, Logística).
   - Paso 2: puestos, precargados según los departamentos elegidos.
   - Paso 3: tipos de certificado que maneja la empresa, con un catálogo argentino sugerido: Licencia de conducir, Carnet de manipulación de alimentos, Curso de altura, Carnet de operador de autoelevador, Libreta sanitaria, Certificado de electricista.
5. Termina en el panel con un estado vacío que propone la acción siguiente: *"Todavía no cargaste empleados. Podés sumarlos de a uno o importar una planilla."*

Precargar los catálogos es lo que evita que un responsable de RR.HH. de 55 años quede parado frente a un formulario que le pide "seleccioná un puesto" en una lista vacía.

### Contraseñas
Mínimo 10 caracteres, con mayúscula, minúscula, número y símbolo, contrastadas contra una lista de las 10.000 más comunes (paquete local, sin llamadas externas). Medidor de fuerza visible con texto, no solo con una barra de color. Hash a cargo de Supabase Auth (bcrypt). Nunca se registra, nunca se devuelve.

### Criterios de aceptación
- [ ] Registrarse con un email ya usado dice: *"Ya existe una cuenta con ese email. Podés iniciar sesión o recuperar tu contraseña."*, no un error genérico.
- [ ] Un fallo a mitad del alta no deja registros parciales.
- [ ] El asistente se puede saltar y retomar después desde Configuración.
- [ ] El pie muestra nombre del producto, versión y enlace a soporte en login, registro y aplicación (Regla 1, branding).

---

## Módulo 2 — Empleados

**En el MVP.** Es el corazón: sin empleados cargados, ningún otro módulo tiene sentido.

### Listado

- Tabla con: foto (miniatura), apellido y nombre, ID interno, puesto, departamento, antigüedad, estado de certificados (indicador con ícono y texto: "2 por vencer"), estado del empleado.
- **Buscador** que filtra mientras se escribe, tolerante a acentos y mayúsculas, sobre nombre, apellido e ID interno.
- **Filtros:** puesto, departamento, estado, antigüedad (rangos: menos de 1 año, 1 a 3, 3 a 5, 5 a 10, más de 10), estado de certificados (todos vigentes / con alguno por vencer / con alguno vencido / sin certificados).
- Los filtros aplicados se muestran como etiquetas removibles y quedan en la URL, para que el usuario pueda guardar o compartir la vista.
- Orden por cualquier columna. Paginación de 25 con opción a 50 y 100.
- Acciones en lote sobre lo seleccionado: cambiar departamento, cambiar estado, exportar a Excel. **Toda acción en lote muestra un resumen previo** ("Vas a cambiar el departamento de 12 empleados a Producción") antes de aplicarse (Regla 2).
- Estado vacío por filtro: *"Ningún empleado coincide con los filtros aplicados."* con un botón para limpiarlos. Distinto del estado vacío por falta de datos.

### Alta y edición

Formulario en tres secciones con pestañas: **Datos personales**, **Puesto y organización**, **Aptitudes**. Los campos obligatorios se marcan con asterisco y con la leyenda "Los campos marcados con * son obligatorios" arriba del formulario.

Todas las validaciones de la Regla 3 se aplican al perder el foco del campo y de nuevo en el servidor. Ejemplos de mensajes:

| Situación | Mensaje |
|---|---|
| ID interno duplicado | *"El ID interno OP-0143 ya está asignado a Martín Gómez. Usá otro identificador."* |
| Nombre con números | *"El nombre solo puede contener letras, espacios, guiones y apóstrofes. Quitá los números o símbolos."* |
| Fecha de nacimiento fuera de rango | *"El empleado debe tener entre 16 y 80 años. Revisá la fecha de nacimiento."* |
| Foto muy pesada | *"La foto pesa 8,4 MB y el máximo es 5 MB. Probá con una imagen más liviana o reducila antes de subirla."* |
| Archivo que no es imagen | *"El archivo no es una imagen válida. Se aceptan JPG, PNG y WebP."* |

**Foto:** se valida por contenido real (números mágicos del archivo), no por extensión. Se recorta en cuadrado con vista previa interactiva y se guarda en WebP 400×400. Si no hay foto, se muestra un avatar con las iniciales sobre un color derivado del ID interno — nunca un ícono de persona genérico repetido en toda la lista.

**Preservación ante error:** si el envío falla, el formulario conserva todo lo cargado y muestra el error arriba, con foco en el primer campo con problema (Regla 4).

### Importación masiva

**En el MVP: Excel (.xlsx) y CSV. Word queda para la Fase 5.**

Es honesto decir por qué: un .docx no tiene estructura tabular garantizada. Si el archivo trae una tabla, se puede leer; si trae un texto corrido con los empleados en párrafos, cualquier intento de interpretarlo automáticamente va a fallar en silencio y meter datos sucios, que es exactamente lo que la Regla 3 prohíbe. En la Fase 5, con Tukson ya funcionando, se agrega: extraer el texto del .docx, pedirle al modelo que lo estructure y **presentar el resultado en la misma pantalla de previsualización para que una persona lo revise antes de guardar**. Nunca importación a ciegas.

Flujo de importación en cinco pasos:

1. **Subir.** Se ofrece una plantilla descargable en .xlsx con las columnas correctas y una fila de ejemplo.
2. **Mapear columnas.** El sistema detecta los encabezados y propone la correspondencia ("Apellido y Nombre" → Apellido, Nombre). El usuario corrige lo que haga falta con listas desplegables.
3. **Previsualizar.** Tabla con las primeras 50 filas. Cada celda inválida se marca en su lugar con el mensaje concreto. Contador arriba: *"87 filas listas para importar, 13 con errores."*
4. **Decidir.** Dos opciones: importar solo las válidas, o descargar el reporte de errores, corregir y volver a subir. Se puede corregir errores simples directamente en la previsualización.
5. **Resultado.** Resumen con enlace a los empleados creados y descarga del reporte de las filas rechazadas con el motivo de cada una.

La importación corre en una transacción por lote de 100 filas. Un archivo de 500 empleados no puede tardar más de lo que dura la paciencia: barra de progreso real con el conteo de filas procesadas.

### Criterios de aceptación
- [ ] Buscar "peres" encuentra a "Pérez"; buscar "MARTIN" encuentra a "Martín".
- [ ] Los filtros sobreviven a recargar la página.
- [ ] Importar un archivo con IDs internos duplicados **dentro del propio archivo** los detecta, no solo los duplicados contra la base.
- [ ] Un archivo de 500 filas se importa en menos de 30 segundos con progreso visible.
- [ ] Subir un .exe renombrado a .jpg como foto es rechazado.
- [ ] Eliminar un empleado pide confirmación con su nombre completo escrito en el diálogo.

---

## Módulo 3 — Perfil del empleado

**En el MVP.**

Una sola pantalla con encabezado fijo (foto, nombre, puesto, departamento, ID interno, antigüedad, estado) y pestañas debajo:

- **Datos:** información personal y laboral, en modo lectura con botón "Editar". No un formulario siempre editable: la mayoría de las visitas son para consultar, no para modificar.
- **Aptitudes:** listado con nivel visualizado como barra de 5 segmentos **más la etiqueta en texto** ("Avanzado"). Botón para agregar aptitud desde el catálogo. Quién la validó y cuándo.
- **Certificados:** tarjetas ordenadas por proximidad de vencimiento. Cada una con tipo, número, emisión, vencimiento, días restantes, estado con ícono y color, y el archivo adjunto si existe. Los vencidos arriba, destacados.
- **Historial:** asignaciones de Tukson recibidas, con la tarea, la fecha y si fue completada. Alimenta el componente de "historial de éxito" del scoring.
- **Actividad:** registro de auditoría de ese empleado (quién lo modificó y cuándo). Visible para propietario y administrador.

Breadcrumb obligatorio: `Empleados › Juan Pérez`. El botón de volver del navegador regresa al listado **con los filtros que tenía** (Regla 2).

### Criterios de aceptación
- [ ] Volver desde el perfil conserva filtros, búsqueda y página del listado.
- [ ] Un empleado sin aptitudes muestra *"Todavía no se cargaron aptitudes. Las aptitudes permiten que Tukson asigne tareas con criterio."* y un botón para agregar.
- [ ] La pestaña de certificados es accesible en un clic desde el listado, no solo entrando al perfil.

---

## Módulo 4 — Certificados y vencimientos

**En el MVP.** Es el módulo que justifica la compra: una pyme que se olvida de renovar un carnet obligatorio se expone a una multa o a un accidente.

### Vista principal

Tres bloques, en este orden:

1. **Vencidos** — rojo, ícono de alerta, texto "Vencido hace N días". Ordenados de más antiguo a más reciente.
2. **Por vencer** — ámbar, "Vence en N días". El umbral lo define cada tipo de certificado (30 días por defecto, configurable).
3. **Vigentes** — plegado por defecto, para no ocupar la pantalla con lo que está bien.

Filtros: tipo de certificado, departamento, puesto, empleado, rango de vencimiento. Buscador por empleado.

Vista alternativa en calendario mensual con los vencimientos marcados, útil para planificar renovaciones.

### Detección de faltantes

Además de los certificados cargados, la pantalla muestra un bloque de **certificados obligatorios ausentes**: empleados cuyo puesto exige un tipo de certificado que no tienen registrado. Esto sale del campo `obligatorio_para_puestos`. Un certificado que nunca se cargó es más peligroso que uno vencido, porque no aparece en ninguna lista.

### Avisos automáticos

Un `pg_cron` diario a las 08:00 (hora de la empresa) revisa vencimientos y envía **un solo email por empresa** con todo lo que requiere atención: vencidos, próximos a vencer y obligatorios faltantes. Un email por certificado sería insoportable y agotaría el tope de 100 diarios de Resend.

El email respeta la Regla 1: logo, tono formal, tabla clara, un botón que lleva directo a la vista filtrada. Configurable por empresa: destinatarios, días de anticipación, frecuencia (diaria, semanal o desactivada).

### Criterios de aceptación
- [ ] Un certificado que vence hoy aparece como "Vence hoy", no como vencido ni como vigente.
- [ ] El estado se calcula al consultar, nunca desde una columna guardada.
- [ ] El estado se distingue por ícono y texto además del color (accesibilidad para daltonismo).
- [ ] Si el cron no corre dos días seguidos, se envía una alerta al equipo de SkillBoard.
- [ ] Subir un archivo de 12 MB es rechazado con el mensaje del tamaño real y el máximo permitido.

---

## Módulo 5 — Panel de rendimiento

**Fase 3 (después del MVP núcleo).**

Acá hay que ser preciso, porque "rendimiento de la empresa" es un concepto que el sistema no puede inventar. SkillBoard no sabe si una empresa vende más o menos: **solo sabe lo que la empresa carga.** El panel mide el cumplimiento de los objetivos que el propio usuario define y mide.

### Índice de cumplimiento

Un número de 0 a 100 que responde: *¿los objetivos activos van al ritmo que deberían?*

Para cada objetivo activo:

```
avance_real     = (valor_actual − valor_inicial) / (valor_objetivo − valor_inicial)
avance_esperado = días_transcurridos / días_totales_del_período
cumplimiento    = min(avance_real / avance_esperado, 1,25) × 100
```

El índice general es el promedio ponderado por el campo `peso` de cada objetivo. Se limita a 125 para que un objetivo desbordado no tape el atraso de los demás.

Junto al número se muestra siempre la comparación con el período anterior, con flecha e indicación textual: *"72 · 8 puntos más que el mes pasado"*. La flecha nunca va sola.

### Composición del panel

- Índice de cumplimiento grande, con evolución de los últimos 12 períodos.
- Tarjetas: empleados activos · certificados vencidos · certificados por vencer en 30 días · certificados obligatorios faltantes. **Cada tarjeta es un enlace a la vista filtrada correspondiente** (esto es lo que hace que "revisar vencimientos" sea un solo clic).
- Objetivos del período con su barra de avance, ordenados por los más atrasados primero.
- Distribución de empleados por departamento.
- Últimas asignaciones de Tukson.
- Selector de período arriba: Semana · Mes · Trimestre · Año · Personalizado, recordado entre sesiones.

### Estado vacío

Sin objetivos cargados, el panel **no muestra un índice inventado ni gráficos de ejemplo.** Muestra las tarjetas de certificados (que sí tienen datos reales) y un bloque que explica qué es un objetivo, con dos o tres ejemplos concretos del rubro y un botón para crear el primero. Un panel con datos falsos de demostración viola la Regla 1 de forma directa.

### Criterios de aceptación
- [ ] Cero datos de ejemplo o valores de relleno en cualquier estado del panel.
- [ ] Con la base vacía, cada bloque tiene un estado vacío propio con acción sugerida.
- [ ] El panel carga contenido útil en menos de 2 segundos, con esqueletos mientras tanto (Regla 4).
- [ ] Los números llevan separador de miles según locale argentino y las fechas van en dd/mm/aaaa.

---

## Módulo 6 — Modo carrusel para TV

**Fase 4.**

### Cómo funciona

Se configura en `/carrusel`: qué empleados entran (por departamento, puesto o selección manual), qué campos se muestran, cuántos segundos dura cada pantalla, si se muestran los certificados y cuáles.

Se genera una URL pública con un token largo y aleatorio: `skillboard.app/tv/{token}`. Esa URL se abre en la TV o en un Chromecast y arranca en pantalla completa, sin menús, sin cursor y sin posibilidad de navegar a otra parte.

**La aclaración del pedido original está resuelta por diseño:** la vista de TV es una ruta independiente con su propia sesión. El usuario sigue usando SkillBoard normalmente en su computadora sin que nada de eso se refleje en la pantalla. No es "espejar la pantalla", es una segunda vista del mismo dato.

### Detalles que importan en una pantalla lejana

- Tipografía grande: nombre a 72 px, puesto a 40 px, en una TV vista desde 3 o más metros.
- Transiciones suaves de 600 ms, sin efectos llamativos. Es una herramienta, no un salvapantallas.
- Reconexión automática si se cae internet, con la última tanda de datos en memoria para no dejar la pantalla en negro.
- Actualización en vivo por Supabase Realtime: si se carga un empleado nuevo, entra al ciclo sin reiniciar la TV.
- Si un empleado no tiene foto, se muestra el avatar de iniciales, nunca un hueco vacío.

### Privacidad — decisión importante

Una TV en el comedor de la fábrica la ve cualquiera, incluidas visitas. Por eso:

- **Campos disponibles:** foto, nombre y apellido, puesto, departamento, antigüedad, certificados vigentes (solo el tipo, nunca el número).
- **Campos bloqueados por diseño, sin opción de habilitarlos:** documento, email, teléfono, fecha de nacimiento, dirección, observaciones, número de certificado, salario.
- **Los certificados vencidos no se muestran en la TV.** Exponer públicamente que a Juan se le venció el carnet lo expone frente a sus compañeros. Eso es un problema de recursos humanos, no un tablero.
- El token se puede rotar desde la configuración; al rotarlo, la TV vieja deja de funcionar de inmediato.
- Cada acceso al carrusel queda registrado en auditoría con IP.

### Criterios de aceptación
- [ ] El carrusel funciona en un navegador de Smart TV (Chromium sin teclado ni mouse).
- [ ] Perder y recuperar la conexión no deja la pantalla congelada ni en blanco.
- [ ] Los campos sensibles no se pueden habilitar ni manipulando la petición.
- [ ] Un token rotado invalida la sesión activa en menos de 60 segundos.

---

## Módulo 7 — Tukson

**Fase 5.** Especificación completa en el documento `04-tukson.md`.

Resumen del alcance: subir un documento o escribir las tareas del día, revisar la lista estructurada, recibir una propuesta de asignación con justificación por tarea, corregir lo que haga falta explicando el motivo, y confirmar. Las correcciones se convierten en reglas de la empresa que un administrador aprueba y que entran en las asignaciones siguientes.

---

## Módulo 8 — Configuración

**Distribuido entre el MVP y las fases siguientes.**

- **Empresa y marca** (MVP): nombre, CUIT, logo, zona horaria. El logo aparece en el encabezado, en los emails y en el carrusel (Regla 1).
- **Usuarios y permisos** (MVP): invitar por email, asignar rol, suspender. Un propietario no puede quitarse a sí mismo el rol si es el único.
- **Catálogos** (MVP): puestos, departamentos, aptitudes, tipos de certificado. Con protección al eliminar: *"El puesto Operario de grúa está asignado a 8 empleados. Reasignalos antes de eliminarlo."*
- **Avisos** (Fase 2): destinatarios, días de anticipación, frecuencia.
- **Reglas de Tukson** (Fase 5): listado de reglas aprendidas, con activación, edición y borrado.
- **Plan y facturación** (Fase 6): uso actual contra el límite, cambio de plan.

---

## Alcance por fases

| Fase | Contenido | Duración estimada |
|---|---|---|
| **0 — Fundaciones** | Repositorio, React Router sobre Workers, Supabase, R2, esquema completo, RLS con pruebas de aislamiento, autenticación, sistema de diseño, layout, copia de seguridad automática, medición de CPU por ruta | 2 semanas |
| **1 — Empleados** | Catálogos, alta y edición, listado con filtros, perfil, importación xlsx/csv, auditoría | 2 semanas |
| **2 — Certificados** | Carga, vista de vencimientos, faltantes obligatorios, cron y emails | 1 semana |
| **3 — Panel** | Objetivos, mediciones, índice de cumplimiento, tarjetas y gráficos | 1,5 semanas |
| **4 — Carrusel** | Configuración, vista de TV, tiempo real, controles de privacidad | 1 semana |
| **5 — Tukson** | Ingesta, estructuración, scoring, asignación, correcciones, reglas, importación desde Word | 3 semanas |
| **6 — Comercial** | Planes, cobro, página pública, documentación legal y de privacidad | 2 semanas |

**El producto es vendible al terminar la Fase 2.** Un sistema de empleados con control de vencimientos ya resuelve un problema por el que una pyme paga. Todo lo demás suma valor, pero la Fase 2 es el punto donde conviene buscar el primer cliente y validar antes de seguir construyendo.
