// client/src/components/ai/VantsScoutCard.tsx
import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  vantsAiApi,
  VantsAiError,
  type AiCuota,
  type ScoutingReport,
} from "../../lib/vantsAiApi";

interface VantsScoutCardProps {
  getAccessToken: () => Promise<string | null>;
  pid?: string;
  nick?: string;
}

export function VantsScoutCard({ getAccessToken, pid, nick }: VantsScoutCardProps) {
  const [cuota, setCuota] = useState<AiCuota | null>(null);
  const [reporte, setReporte] = useState<ScoutingReport | null>(null);
  const [jugadorNick, setJugadorNick] = useState<string>(nick || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; msg: string } | null>(null);

  useEffect(() => {
    setJugadorNick(nick || "");
    setReporte(null);
    setError(null);
  }, [pid, nick]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const token = await getAccessToken().catch(() => null);
      if (!token || !mounted) return;
      try {
        const st = await vantsAiApi.estado(token);
        if (mounted) setCuota(st.cuota);
      } catch {
        // Silencioso en carga inicial; se mostrará si el usuario dispara el análisis
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getAccessToken]);

  async function analizar() {
    setError(null);
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setError({
          code: "sin_sesion",
          msg: "Inicia sesión para ejecutar el Scouting IA con tus estadísticas reales.",
        });
        return;
      }

      const res = await vantsAiApi.scoutJugador(token, { pid, nick });
      setReporte(res.reporte);
      setJugadorNick(res.jugador.nick);
      setCuota(res.cuota);
    } catch (e) {
      if (e instanceof VantsAiError) {
        if (e.cuota) setCuota(e.cuota);
        if (e.code === "limite_diario_ai") {
          setError({
            code: e.code,
            msg: "Alcanzaste tu límite diario de análisis IA. Mejora tu plan para ampliar tu cuota.",
          });
        } else if (e.code === "jugador_no_encontrado") {
          setError({
            code: e.code,
            msg: "No encontramos cuentas vinculadas para este perfil. Conecta FACEIT o Riot primero.",
          });
        } else if (e.code === "gemini_no_configurado") {
          setError({
            code: e.code,
            msg: "El motor VANTS AI está en mantenimiento temporal.",
          });
        } else {
          setError({ code: e.code, msg: `No se pudo completar el análisis (${e.code}).` });
        }
      } else {
        setError({ code: "red", msg: "Error de conexión con VANTS AI." });
      }
    } finally {
      setLoading(false);
    }
  }

  const scoreColor =
    !reporte
      ? "#ff0d2e"
      : reporte.performance_score >= 80
      ? "#41d98d"
      : reporte.performance_score >= 60
      ? "#f5c044"
      : "#ff0d2e";

  return (
    <section
      data-testid="vants-scout-card"
      style={{
        background: "#111113",
        border: "1px solid #2a2a2f",
        borderTop: "2px solid #ff0d2e",
        padding: "20px",
        color: "#f4f4f5",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#ff5468",
              fontWeight: 700,
              margin: 0,
            }}
          >
            VANTS Core AI · Scouting &amp; Coaching
          </p>
          <h3
            style={{
              margin: "4px 0 0",
              fontSize: 22,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {nick ? `Análisis competitivo · ${nick}` : "Diagnóstico de tu perfil competitivo"}
          </h3>
        </div>

        <div className="flex items-center gap-3">
          {cuota && (
            <span
              style={{
                fontSize: 12,
                padding: "4px 10px",
                background: "#18181b",
                border: "1px solid #2a2a2f",
                color: "#c4c4c9",
              }}
            >
              Plan <strong style={{ color: "#fff" }}>{cuota.plan.toUpperCase()}</strong> ·{" "}
              {cuota.restantes}/{cuota.limite} hoy
            </span>
          )}

          <button
            type="button"
            onClick={analizar}
            disabled={loading}
            data-testid="button-vants-scout-analizar"
            style={{
              background: loading ? "#4b161e" : "#ff0d2e",
              color: "#fff",
              border: "none",
              padding: "10px 18px",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: loading ? "wait" : "pointer",
            }}
          >
            {loading ? "Analizando telemetría..." : reporte ? "Re-analizar perfil" : "Analizar con IA"}
          </button>
        </div>
      </div>

      {!reporte && !error && !loading && (
        <p style={{ marginTop: 12, fontSize: 13, color: "#8e8e96", lineHeight: 1.5 }}>
          Cruza tus datos reales de FACEIT CS2, VALORANT, Fortnite y VANTS Ranked para calcular tu
          índice de rendimiento, detectar fortalezas y generar un plan de entrenamiento de 7 días.
        </p>
      )}

      {error && (
        <div
          style={{
            marginTop: 14,
            padding: "12px 14px",
            background: "#1c1215",
            border: "1px solid #5a1d28",
            fontSize: 13,
            color: "#fca5a5",
          }}
        >
          <p style={{ margin: 0 }}>{error.msg}</p>
          {error.code === "limite_diario_ai" && (
            <Link
              href="/membresias"
              style={{ display: "inline-block", marginTop: 8, color: "#fff", textDecoration: "underline" }}
            >
              Ver planes VANTS PRO / CREATOR →
            </Link>
          )}
          {error.code === "jugador_no_encontrado" && (
            <Link
              href="/perfil/cuentas"
              style={{ display: "inline-block", marginTop: 8, color: "#fff", textDecoration: "underline" }}
            >
              Vincular cuentas de juego →
            </Link>
          )}
          {error.code === "sin_sesion" && (
            <Link
              href="/entrar"
              style={{ display: "inline-block", marginTop: 8, color: "#fff", textDecoration: "underline" }}
            >
              Iniciar sesión →
            </Link>
          )}
        </div>
      )}

      {reporte && (
        <div style={{ marginTop: 18, display: "grid", gap: 16 }}>
          {/* Cabecera de métricas clave */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            <div style={{ background: "#18181b", border: "1px solid #2a2a2f", padding: 14 }}>
              <div style={{ fontSize: 11, color: "#8e8e96", textTransform: "uppercase" }}>
                Performance Score
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: scoreColor, lineHeight: 1.1 }}>
                {reporte.performance_score}
                <span style={{ fontSize: 14, color: "#8e8e96" }}>/100</span>
              </div>
            </div>

            <div style={{ background: "#18181b", border: "1px solid #2a2a2f", padding: 14 }}>
              <div style={{ fontSize: 11, color: "#8e8e96", textTransform: "uppercase" }}>
                Tier Sugerido
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
                {reporte.tier_sugerido}
              </div>
            </div>

            {reporte.rol_ideal && (
              <div style={{ background: "#18181b", border: "1px solid #2a2a2f", padding: 14 }}>
                <div style={{ fontSize: 11, color: "#8e8e96", textTransform: "uppercase" }}>
                  Rol Ideal
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
                  {reporte.rol_ideal}
                </div>
              </div>
            )}
          </div>

          {/* Veredicto de scouting */}
          <div
            style={{
              background: "#18181b",
              borderLeft: "3px solid #ff0d2e",
              padding: "12px 14px",
              fontSize: 14,
              color: "#e4e4e7",
            }}
          >
            <strong style={{ color: "#fff" }}>Recomendación ({jugadorNick}):</strong>{" "}
            {reporte.recomendacion_fichaje}
          </div>

          {/* Fortalezas y áreas de mejora */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            <div style={{ background: "#18181b", border: "1px solid #2a2a2f", padding: 14 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#41d98d",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Fortalezas detectadas
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#d4d4d8", lineHeight: 1.6 }}>
                {reporte.fortalezas.map((f, idx) => (
                  <li key={idx}>{f}</li>
                ))}
              </ul>
            </div>

            <div style={{ background: "#18181b", border: "1px solid #2a2a2f", padding: 14 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#f5c044",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Áreas de mejora
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#d4d4d8", lineHeight: 1.6 }}>
                {reporte.areas_mejora.map((a, idx) => (
                  <li key={idx}>{a}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Plan 7 días */}
          {Array.isArray(reporte.plan_entrenamiento_7d) && reporte.plan_entrenamiento_7d.length > 0 && (
            <div style={{ background: "#18181b", border: "1px solid #2a2a2f", padding: 14 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#4cc9f0",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Plan de entrenamiento · Próximos 7 días
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#d4d4d8", lineHeight: 1.6 }}>
                {reporte.plan_entrenamiento_7d.map((paso, idx) => (
                  <li key={idx}>{paso}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
