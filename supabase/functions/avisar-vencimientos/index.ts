// Aviso diario de vencimientos (Fase 2, módulo 4).
//
// La dispara pg_cron una vez por día (migración 0009). Recorre las empresas
// con avisos activos, arma UN solo email por empresa con todo lo que requiere
// atención, y lo manda por Resend. Un email por certificado sería insoportable
// y agotaría el tope de 100 diarios del plan gratuito.
//
// Cada corrida queda registrada en `avisos_enviados`, incluso cuando no hay
// nada para avisar: eso es lo que permite detectar que el cron dejó de correr.
import { createClient } from "jsr:@supabase/supabase-js@2";

interface ItemVencimiento {
  empleado: string;
  id_interno: string;
  tipo: string;
  dias?: number;
}

interface Resumen {
  vencidos: ItemVencimiento[];
  por_vencer: ItemVencimiento[];
  faltantes: ItemVencimiento[];
}

const APP_URL = Deno.env.get("APP_URL") ?? "https://skillboard-phi.vercel.app";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const REMITENTE = Deno.env.get("AVISOS_REMITENTE") ?? "SkillBoard <onboarding@resend.dev>";

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tabla(titulo: string, color: string, items: ItemVencimiento[], columnaDias: string | null): string {
  if (items.length === 0) return "";
  const filas = items
    .map((i) => {
      const dias =
        columnaDias === null
          ? ""
          : `<td style="padding:8px 12px;border-top:1px solid #e4e4e0;white-space:nowrap">${
              i.dias === undefined
                ? "—"
                : i.dias < 0
                  ? `Vencido hace ${Math.abs(i.dias)} d.`
                  : i.dias === 0
                    ? "Vence hoy"
                    : `En ${i.dias} d.`
            }</td>`;
      return `<tr>
        <td style="padding:8px 12px;border-top:1px solid #e4e4e0">${escapar(i.empleado)}<br><span style="color:#5c5c57;font-size:12px">${escapar(i.id_interno)}</span></td>
        <td style="padding:8px 12px;border-top:1px solid #e4e4e0">${escapar(i.tipo)}</td>
        ${dias}
      </tr>`;
    })
    .join("");

  return `
    <h2 style="margin:24px 0 8px;font-size:15px;color:${color}">${escapar(titulo)} (${items.length})</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr style="text-align:left;color:#5c5c57;font-size:12px;text-transform:uppercase">
        <th style="padding:4px 12px">Empleado</th>
        <th style="padding:4px 12px">Certificado</th>
        ${columnaDias ? `<th style="padding:4px 12px">${columnaDias}</th>` : ""}
      </tr>
      ${filas}
    </table>`;
}

function armarEmail(empresaNombre: string, logoUrl: string | null, r: Resumen): string {
  // Cada bloque enlaza a la vista ya filtrada, para que el email lleve
  // directo a la acción y no solo a la app (Regla 1: branding y utilidad).
  const marca = logoUrl
    ? `<img src="${escapar(logoUrl)}" alt="${escapar(empresaNombre)}" style="max-height:40px;margin-bottom:8px">`
    : `<div style="font-size:18px;font-weight:700;color:#1f3a3d">SkillBoard</div>`;

  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f7f7f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1c1a">
  <div style="max-width:640px;margin:0 auto;padding:24px">
    <div style="background:#fff;border:1px solid #e4e4e0;border-radius:8px;padding:24px">
      ${marca}
      <p style="margin:0 0 4px;font-size:16px;font-weight:600">Certificados que requieren atención</p>
      <p style="margin:0;color:#5c5c57;font-size:14px">${escapar(empresaNombre)}</p>

      ${tabla("Vencidos", "#a3291d", r.vencidos, "Estado")}
      ${tabla("Por vencer", "#92600a", r.por_vencer, "Vence")}
      ${tabla("Obligatorios sin cargar", "#a3291d", r.faltantes, null)}

      <p style="margin:28px 0 0">
        <a href="${APP_URL}/certificados" style="display:inline-block;background:#1f3a3d;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600">Ver en SkillBoard</a>
      </p>
    </div>
    <p style="text-align:center;color:#5c5c57;font-size:12px;margin-top:16px">
      Recibís este aviso porque administrás ${escapar(empresaNombre)} en SkillBoard.
    </p>
  </div>
</body></html>`;
}

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const hoy = new Date();
  const esLunes = hoy.getUTCDay() === 1;

  const { data: empresas, error: errorEmpresas } = await admin.from("empresas").select("id, nombre, logo_url");
  if (errorEmpresas) {
    return new Response(JSON.stringify({ ok: false, error: errorEmpresas.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resultados: unknown[] = [];

  for (const empresa of empresas ?? []) {
    const { data: conf } = await admin
      .from("config_avisos")
      .select("destinatarios, frecuencia")
      .eq("empresa_id", empresa.id)
      .maybeSingle();

    const frecuencia = conf?.frecuencia ?? "diaria";
    if (frecuencia === "desactivada") continue;
    if (frecuencia === "semanal" && !esLunes) continue;

    const { data: resumenRaw, error: errorResumen } = await admin.rpc("resumen_vencimientos", {
      p_empresa_id: empresa.id,
    });

    if (errorResumen) {
      await admin.from("avisos_enviados").insert({
        empresa_id: empresa.id,
        estado: "error",
        detalle: errorResumen.message,
      });
      resultados.push({ empresa: empresa.nombre, estado: "error" });
      continue;
    }

    const r = resumenRaw as Resumen;
    const total = r.vencidos.length + r.por_vencer.length + r.faltantes.length;

    // Se registra la corrida igual cuando no hay nada: sin este registro no
    // habría forma de distinguir "todo en orden" de "el cron dejó de correr".
    if (total === 0) {
      await admin.from("avisos_enviados").insert({ empresa_id: empresa.id, estado: "sin_novedades" });
      resultados.push({ empresa: empresa.nombre, estado: "sin_novedades" });
      continue;
    }

    // Sin destinatarios configurados, se avisa a quienes administran la empresa.
    let destinatarios: string[] = conf?.destinatarios ?? [];
    if (destinatarios.length === 0) {
      const { data: membresias } = await admin
        .from("membresias")
        .select("perfiles(email)")
        .eq("empresa_id", empresa.id)
        .eq("estado", "activa")
        .in("rol", ["propietario", "administrador"]);
      destinatarios = (membresias ?? [])
        .map((m: { perfiles?: { email?: string } | null }) => m.perfiles?.email)
        .filter((e): e is string => Boolean(e));
    }

    if (destinatarios.length === 0) {
      await admin.from("avisos_enviados").insert({
        empresa_id: empresa.id,
        estado: "error",
        detalle: "La empresa no tiene destinatarios ni administradores con email.",
        vencidos: r.vencidos.length,
        por_vencer: r.por_vencer.length,
        faltantes: r.faltantes.length,
      });
      resultados.push({ empresa: empresa.nombre, estado: "sin_destinatarios" });
      continue;
    }

    if (!RESEND_API_KEY) {
      await admin.from("avisos_enviados").insert({
        empresa_id: empresa.id,
        estado: "error",
        detalle: "Falta configurar RESEND_API_KEY en los secretos del proyecto.",
        vencidos: r.vencidos.length,
        por_vencer: r.por_vencer.length,
        faltantes: r.faltantes.length,
      });
      resultados.push({ empresa: empresa.nombre, estado: "sin_api_key", pendientes: total });
      continue;
    }

    const asunto =
      r.vencidos.length > 0
        ? `${r.vencidos.length} certificado(s) vencido(s) — ${empresa.nombre}`
        : `${total} certificado(s) requieren atención — ${empresa.nombre}`;

    const envio = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: REMITENTE,
        to: destinatarios,
        subject: asunto,
        html: armarEmail(empresa.nombre, empresa.logo_url, r),
      }),
    });

    const cuerpo = await envio.text();
    await admin.from("avisos_enviados").insert({
      empresa_id: empresa.id,
      destinatarios,
      vencidos: r.vencidos.length,
      por_vencer: r.por_vencer.length,
      faltantes: r.faltantes.length,
      estado: envio.ok ? "enviado" : "error",
      detalle: envio.ok ? null : cuerpo.slice(0, 500),
    });

    resultados.push({ empresa: empresa.nombre, estado: envio.ok ? "enviado" : "error", total });
  }

  return new Response(JSON.stringify({ ok: true, corridas: resultados }), {
    headers: { "Content-Type": "application/json" },
  });
});
