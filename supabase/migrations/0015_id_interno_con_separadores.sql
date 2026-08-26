-- El ID interno tenía en la base la misma regla que tenía la aplicación:
-- solo letras y números. Eso rechazaba OP-0143, que es el ejemplo que trae la
-- plantilla que el propio producto ofrece para descargar.
--
-- La regla de la aplicación se aflojó (app/lib/validation/empleados.ts) pero
-- esta no, así que quedaba peor que antes: el formulario aceptaba el legajo y
-- el insert fallaba con un error de restricción, que es exactamente el caso
-- que 02-modelo-de-datos.md pide evitar —"un error de base nunca puede ser la
-- primera vez que el usuario se entera".
--
-- Los legajos reales llevan separadores: OP-0143, 12.345, RH/2024-07. Se
-- permiten en el medio y no en los extremos, para que " -OP-0143-" no entre
-- como un ID distinto de "OP-0143". Es la misma expresión que la aplicación,
-- verificada contra esta base antes de aplicarla.
alter table empleados drop constraint empleados_id_interno_check;

alter table empleados
  add constraint empleados_id_interno_check
  check (id_interno ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,18}[A-Za-z0-9]$');
