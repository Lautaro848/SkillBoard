// Reglas de contraseña.
//
// Están en su propio archivo, sin ninguna importación, porque este módulo
// viaja al navegador: la pantalla de registro va tachando cada requisito
// mientras se escribe. El servidor evalúa exactamente lo mismo al enviar
// (ver auth.ts), así que lo que se muestra mientras se escribe es la verdad
// completa y no queda ningún requisito escondido para el final.

export interface RevisionContrasena {
  ok: boolean;
  faltantes: string[];
}

export function revisarReglas(password: string): RevisionContrasena {
  const faltantes: string[] = [];

  if (password.length < 10) faltantes.push("Al menos 10 caracteres");
  if (!/[a-z]/.test(password)) faltantes.push("Una letra minúscula");
  if (!/[A-Z]/.test(password)) faltantes.push("Una letra mayúscula");
  if (!/[0-9]/.test(password)) faltantes.push("Un número");
  if (!/[^A-Za-z0-9]/.test(password)) faltantes.push("Un símbolo");

  return { ok: faltantes.length === 0, faltantes };
}

// El requisito que el navegador no puede comprobar sin bajarse el diccionario.
// Se muestra en la lista para que la persona sepa que existe antes de enviar,
// no como una sorpresa al recibir el error.
export const REQUISITO_NO_COMUN = "No puede ser una de las contraseñas más comunes";
