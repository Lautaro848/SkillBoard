import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mensajeFiltrada,
  motivoContrasenaFiltrada,
  revisarFiltraciones,
} from "~/lib/validation/pwned.server";

// SHA-1 de "password", el ejemplo que usa la documentación de HIBP.
// El prefijo es lo único que puede salir de acá; el sufijo se busca en la
// respuesta, del lado del servidor.
const HASH_PASSWORD = "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8";
// El corte es siempre en 5: eso es lo que define el protocolo.
const PREFIJO = HASH_PASSWORD.slice(0, 5);
const SUFIJO = HASH_PASSWORD.slice(5);

// Lo que devuelve la API: sufijos y cuántas veces apareció cada uno.
function respuestaCon(lineas: string[], status = 200) {
  return vi.fn().mockResolvedValue(new Response(lineas.join("\r\n"), { status }));
}

function instalarFetch(fake: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fake);
  return fake;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("k-anonymity: qué sale de nuestro servidor", () => {
  it("manda el prefijo correcto del hash", async () => {
    const fake = instalarFetch(respuestaCon([`${SUFIJO}:100`]));
    await revisarFiltraciones("password");
    expect(fake.mock.calls[0][0]).toBe(`https://api.pwnedpasswords.com/range/${PREFIJO}`);
  });

  it("ni la contraseña ni el resto del hash salen en la petición", async () => {
    // Una contraseña que no sea subcadena del dominio: "password" sí lo es
    // (api.pwnedPASSWORDs.com) y haría pasar esta prueba por casualidad.
    const OTRA = "Tornillo-Verde-92!";
    const HASH_OTRA = "7CF8EA96CFFF43F9515AD8A97D88E6F0258A7119";

    const fake = instalarFetch(respuestaCon(["0018A45C4D1DEF81644B54AB7F969B88D65:1"]));
    await revisarFiltraciones(OTRA);

    const [url, opciones] = fake.mock.calls[0];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${HASH_OTRA.slice(0, 5)}`);

    // Esto es lo que hace que el modelo sea k-anonymity y no "mandarle la
    // contraseña a un tercero": del hash sale un prefijo de 5 caracteres y
    // nada más.
    const peticion = url + JSON.stringify(opciones);
    expect(peticion).not.toContain(OTRA);
    expect(peticion).not.toContain(HASH_OTRA);
    expect(peticion).not.toContain(HASH_OTRA.slice(5));
  });

  it("pide relleno para que el tamaño de la respuesta no delate nada", async () => {
    const fake = instalarFetch(respuestaCon([`${SUFIJO}:1`]));
    await revisarFiltraciones("password");
    expect(fake.mock.calls[0][1].headers["Add-Padding"]).toBe("true");
  });
});

describe("lectura de la respuesta", () => {
  it("encuentra el sufijo propio entre los demás y devuelve las veces", async () => {
    instalarFetch(
      respuestaCon([
        "0018A45C4D1DEF81644B54AB7F969B88D65:1",
        `${SUFIJO}:10382`,
        "00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2",
      ]),
    );
    await expect(revisarFiltraciones("password")).resolves.toEqual({ estado: "filtrada", veces: 10382 });
  });

  it("una contraseña que no está en la lista sale limpia", async () => {
    instalarFetch(respuestaCon(["0018A45C4D1DEF81644B54AB7F969B88D65:1"]));
    await expect(revisarFiltraciones("password")).resolves.toEqual({ estado: "limpia" });
  });

  it("las entradas de relleno vienen con contador 0 y no son una filtración", async () => {
    // Sin esto, el Add-Padding que pedimos por privacidad haría que TODA
    // contraseña diera por filtrada: el relleno incluye sufijos inventados.
    instalarFetch(respuestaCon([`${SUFIJO}:0`]));
    await expect(revisarFiltraciones("password")).resolves.toEqual({ estado: "limpia" });
  });

  it("compara el sufijo sin distinguir mayúsculas", async () => {
    instalarFetch(respuestaCon([`${SUFIJO.toLowerCase()}:7`]));
    await expect(revisarFiltraciones("password")).resolves.toEqual({ estado: "filtrada", veces: 7 });
  });

  it("ignora líneas mal formadas en vez de romperse", async () => {
    instalarFetch(respuestaCon(["", "basura sin dos puntos", `${SUFIJO}:5`]));
    await expect(revisarFiltraciones("password")).resolves.toEqual({ estado: "filtrada", veces: 5 });
  });
});

describe("cuando el servicio falla, no se bloquea a la persona", () => {
  it("un timeout no impide registrarse, y queda en el log", async () => {
    const timeout = Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" });
    instalarFetch(vi.fn().mockRejectedValue(timeout));
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(revisarFiltraciones("password")).resolves.toEqual({
      estado: "sin_respuesta",
      motivo: "no respondió a tiempo",
    });
    await expect(motivoContrasenaFiltrada("password")).resolves.toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("no respondió a tiempo"));
  });

  it("un 503 tampoco lo impide", async () => {
    instalarFetch(respuestaCon([], 503));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(revisarFiltraciones("password")).resolves.toEqual({
      estado: "sin_respuesta",
      motivo: "respondió 503",
    });
    await expect(motivoContrasenaFiltrada("password")).resolves.toBeNull();
  });

  it("la red caída tampoco lo impide", async () => {
    instalarFetch(vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(motivoContrasenaFiltrada("password")).resolves.toBeNull();
  });

  it("pero una contraseña efectivamente filtrada sí se rechaza", async () => {
    instalarFetch(respuestaCon([`${SUFIJO}:24230577`]));
    const motivo = await motivoContrasenaFiltrada("password");
    expect(motivo).toContain("24.230.577 veces");
    expect(motivo).toContain("filtraciones de datos públicas");
  });
});

describe("el mensaje que ve la persona", () => {
  it("usa separador de miles argentino", () => {
    expect(mensajeFiltrada(24230577)).toContain("24.230.577 veces");
  });

  it("concuerda en singular", () => {
    expect(mensajeFiltrada(1)).toContain("1 vez");
    expect(mensajeFiltrada(1)).not.toContain("veces");
  });

  it("dice qué hacer, no solo que está mal", () => {
    expect(mensajeFiltrada(500)).toContain("que no hayas usado en ningún otro sitio");
  });
});
