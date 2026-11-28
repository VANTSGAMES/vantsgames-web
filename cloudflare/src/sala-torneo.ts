// Durable Object "Sala de torneo" para VANTS GAMES (Fase 4).
//
// - Presencia hibernable con tags [nick, role] (sobreviven a la hibernación).
// - Control de roles verificado por el Worker proxy (nunca confiar en el cliente):
//   solo `staff` o RPC del backend pueden modificar el marcador oficial.
// - Rate-limit 1.5s por socket, silenciado temporal (`silenciar`) y filtro anti-links.
// - Comando `!arbitro <duda>` / `@arbitro <duda>` conectado por Service Binding
//   a VANTS Core AI (`vants-integraciones` POST /ai/torneo/arbitro).
import { DurableObject } from "cloudflare:workers";

export type RolSala = "staff" | "player" | "spectator";

export interface SalaEnv {
  SALA_TORNEO: DurableObjectNamespace<SalaTorneo>;
  DB: D1Database;
  VANTS_INT_SERVICE?: Fetcher;
  VANTS_INTERNAL_SECRET?: string;
}

export interface ParticipanteSala {
  nick: string;
  role: RolSala;
}

interface MensajeHistorial {
  de: string;
  role?: RolSala;
  texto: string;
  ts?: string;
}

const ULTIMO_MSG = new WeakMap<WebSocket, number>();
const PALABRAS_BLOQUEADAS = /\b(discord\.gg\/|t\.me\/|bit\.ly\/)\S*/i;

export class SalaTorneo extends DurableObject<SalaEnv> {
  constructor(ctx: DurableObjectState, env: SalaEnv) {
    super(ctx, env);
  }

  private metaDe(ws: WebSocket): ParticipanteSala {
    const tags = this.ctx.getTags(ws);
    const nick = tags[0] || "espectador";
    const r = tags[1];
    const role: RolSala = r === "staff" || r === "player" ? r : "spectator";
    return { nick, role };
  }

  private async aviso(ev: Record<string, unknown>): Promise<void> {
    const texto = JSON.stringify({ ...ev, ts: new Date().toISOString() });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(texto);
      } catch {
        // socket cerrado entre listado y envío
      }
    }
  }

  private presentes(): ParticipanteSala[] {
    return this.ctx.getWebSockets().map((ws) => this.metaDe(ws));
  }

  private async guardarHistorial(de: string, role: RolSala, texto: string): Promise<void> {
    const hist = (await this.ctx.storage.get<MensajeHistorial[]>("chat_hist")) || [];
    hist.push({ de, role, texto: texto.slice(0, 200), ts: new Date().toISOString() });
    await this.ctx.storage.put("chat_hist", hist.slice(-10));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Se esperaba GET con Upgrade: websocket", { status: 426 });
    }
    if (this.ctx.getWebSockets().length >= 250) {
      return new Response("Sala llena", { status: 503 });
    }

    // Identidad verificada inyectada por el Worker (nunca confiar en el cliente para role)
    const nick = (request.headers.get("x-vants-nick") || "espectador").replace(/[^\p{L}\p{N}_ .#-]/gu, "").trim().slice(0, 24) || "espectador";
    const roleHeader = request.headers.get("x-vants-role") || "spectator";
    const role: RolSala = roleHeader === "staff" || roleHeader === "player" ? roleHeader : "spectator";
    const torneoId = (request.headers.get("x-vants-torneo-id") || "").trim().slice(0, 80);

    if (torneoId) {
      await this.ctx.storage.put("torneo_id", torneoId);
    }

    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [nick, role]);

    // Envía estado inicial solo al usuario que entra
    const [marcador, hist] = await Promise.all([
      this.ctx.storage.get<unknown>("marcador"),
      this.ctx.storage.get<MensajeHistorial[]>("chat_hist"),
    ]);
    pair[1].send(
      JSON.stringify({
        tipo: "init",
        yo: { nick, role },
        torneoId: torneoId || (await this.ctx.storage.get<string>("torneo_id")) || null,
        marcador: marcador ?? null,
        historial: hist ?? [],
        presentes: this.presentes(),
        ts: new Date().toISOString(),
      }),
    );

    await this.aviso({ tipo: "sistema", texto: `${nick} entró a la sala` });
    await this.aviso({ tipo: "presencia", datos: this.presentes() });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return;
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    const { nick, role } = this.metaDe(ws);

    // Solo staff autenticado puede modificar marcador por WS (el resto solo vía RPC del backend)
    if (ev.tipo === "marcador") {
      if (role !== "staff") {
        ws.send(
          JSON.stringify({
            tipo: "error",
            texto: "Solo el staff o el sistema oficial puede actualizar el marcador.",
            ts: new Date().toISOString(),
          }),
        );
        return;
      }
      await this.ctx.storage.put("marcador", ev.datos ?? null);
      await this.aviso({ tipo: "marcador", de: nick, datos: ev.datos ?? null });
      return;
    }

    if (ev.tipo !== "chat") return;

    // Rate-limit básico (1.5s entre mensajes por socket)
    const ahora = Date.now();
    if (role !== "staff" && ahora - (ULTIMO_MSG.get(ws) || 0) < 1500) {
      ws.send(
        JSON.stringify({
          tipo: "sistema",
          texto: "Espera un momento antes de enviar otro mensaje.",
          ts: new Date().toISOString(),
        }),
      );
      return;
    }
    ULTIMO_MSG.set(ws, ahora);

    // Verifica si el nick está silenciado
    const muteHasta = await this.ctx.storage.get<number>(`mute:${nick.toLowerCase()}`);
    if (muteHasta && muteHasta > ahora) {
      ws.send(
        JSON.stringify({
          tipo: "sistema",
          texto: "Estás silenciado temporalmente en esta sala.",
          ts: new Date().toISOString(),
        }),
      );
      return;
    }

    const texto = String(ev.texto || "").slice(0, 400).trim();
    if (!texto) return;

    if (role !== "staff" && PALABRAS_BLOQUEADAS.test(texto)) {
      ws.send(
        JSON.stringify({
          tipo: "arbitro",
          accion: "advertir",
          texto: "No se permiten enlaces externos o spam en la sala del torneo.",
          ts: new Date().toISOString(),
        }),
      );
      return;
    }

    await this.guardarHistorial(nick, role, texto);
    await this.aviso({ tipo: "chat", de: nick, role, texto });

    // Invocación al Árbitro IA: "!arbitro <duda>" o "@arbitro <duda>"
    const matchArbitro = texto.match(/^(?:!arbitro|@arbitro)\s+(.+)/i);
    if (matchArbitro) {
      await this.consultarArbitroIa(nick, matchArbitro[1].trim());
    }
  }

  private async consultarArbitroIa(autor: string, consulta: string): Promise<void> {
    if (!this.env.VANTS_INT_SERVICE || !this.env.VANTS_INTERNAL_SECRET) {
      await this.aviso({
        tipo: "arbitro",
        accion: "responder",
        para: autor,
        texto: "El Árbitro IA no está enlazado en esta sala. Contacta al staff en Discord.",
      });
      return;
    }

    const [torneoId, marcador, historial] = await Promise.all([
      this.ctx.storage.get<string>("torneo_id"),
      this.ctx.storage.get<unknown>("marcador"),
      this.ctx.storage.get<MensajeHistorial[]>("chat_hist"),
    ]);

    // Enriquecimiento con datos y reglamento real desde pt_torneos en D1 (best-effort)
    let torneoCtx: Record<string, unknown> = { id: torneoId || "torneo" };
    if (torneoId && this.env.DB) {
      const tRow = await this.env.DB.prepare(
        "SELECT id, slug, nombre, game_slug, estado, formato, reglas, starts_at FROM pt_torneos WHERE slug = ? OR id = ? LIMIT 1",
      )
        .bind(torneoId, torneoId)
        .first<Record<string, unknown>>()
        .catch(() => null);
      if (tRow) {
        torneoCtx = {
          id: tRow.slug || tRow.id || torneoId,
          nombre: tRow.nombre || torneoId,
          juego: tRow.game_slug || null,
          estado: tRow.estado || null,
          formato: tRow.formato || null,
          reglas: typeof tRow.reglas === "string" ? tRow.reglas.slice(0, 1200) : null,
          starts_at: tRow.starts_at || null,
        };
      }
    }

    const res = await this.env.VANTS_INT_SERVICE.fetch(
      new Request("https://int.vants.cc/ai/torneo/arbitro", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Vants-Internal": this.env.VANTS_INTERNAL_SECRET,
          "X-Vants-Staff": "1",
        },
        body: JSON.stringify({
          torneoId,
          torneo: torneoCtx,
          marcador,
          autor,
          consulta,
          historial,
        }),
      }),
    ).catch(() => null);

    if (!res || !res.ok) {
      await this.aviso({
        tipo: "arbitro",
        accion: "responder",
        para: autor,
        texto: "No pude consultar al Árbitro IA en este momento. Intenta de nuevo en unos segundos.",
      });
      return;
    }

    const data = (await res.json().catch(() => null)) as {
      veredicto?: { accion?: string; respuesta?: string; motivo_staff?: string | null };
    } | null;
    const veredicto = data?.veredicto;
    if (!veredicto?.respuesta) return;

    await this.aviso({
      tipo: "arbitro",
      accion: veredicto.accion || "responder",
      para: autor,
      texto: veredicto.respuesta,
      escalado: veredicto.accion === "escalar_staff",
    });
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const { nick } = this.metaDe(ws);
    await this.aviso({ tipo: "sistema", texto: `${nick} salió de la sala` });
    await this.aviso({ tipo: "presencia", datos: this.presentes() });
  }

  // ---- RPC internos (no pasan por internet, van por el binding) ----
  async estado(): Promise<{ presentes: ParticipanteSala[]; marcador: Record<string, any> | null; torneoId: string | null }> {
    return {
      presentes: this.presentes(),
      marcador: (await this.ctx.storage.get<Record<string, any>>("marcador")) ?? null,
      torneoId: (await this.ctx.storage.get<string>("torneo_id")) ?? null,
    };
  }

  async avisar(ev: Record<string, any>): Promise<void> {
    if (ev.tipo === "marcador") await this.ctx.storage.put("marcador", ev.datos ?? null);
    await this.aviso(ev);
  }

  async silenciar(nick: string, minutos = 10): Promise<void> {
    const limpio = String(nick || "").trim().slice(0, 24);
    if (!limpio) return;
    const duracion = Math.max(1, Math.min(1440, Number(minutos) || 10));
    const hasta = Date.now() + duracion * 60_000;
    await this.ctx.storage.put(`mute:${limpio.toLowerCase()}`, hasta);
    await this.aviso({
      tipo: "arbitro",
      accion: "advertir",
      texto: `${limpio} fue silenciado por ${duracion} min por el staff.`,
    });
  }
}
