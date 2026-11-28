// Durable Object "Sala de torneo" para VANTS GAMES (Fase 4 + Módulos 1 y 3).
//
// - Chat 100% efímero: CERO lecturas/escrituras de historial en storage (`chat_hist` eliminado);
//   al quedar 0 sockets conectados (`webSocketClose`) se limpia la memoria temporal (0 KB persistidos).
// - Presencia hibernable con tags [nick, role, ac, userSub] (sobreviven a la hibernación).
// - Control de roles y estado Anti-Cheat (`Vanguard ON` / `FACEIT AC ON` / `Sin VANTS PC`)
//   verificados por el Worker proxy (nunca confiar en el cliente).
// - Solo `staff` o RPC del backend pueden modificar el marcador oficial.
// - Rate-limit 1.5s por socket, silenciado temporal (`silenciar`), expulsión RPC (`expulsar`) y filtro anti-links.
// - Comando `!arbitro <duda>` / `@arbitro <duda>` conectado por Service Binding
//   a VANTS Core AI (`vants-integraciones` POST /ai/torneo/arbitro).
import { DurableObject } from "cloudflare:workers";

export type RolSala = "staff" | "player" | "spectator";
export type EstadoAcSala = "vanguard" | "faceit" | "both" | "pc" | "none";

export interface SalaEnv {
  SALA_TORNEO: DurableObjectNamespace<SalaTorneo>;
  DB: D1Database;
  VANTS_INT_SERVICE?: Fetcher;
  VANTS_INTERNAL_SECRET?: string;
}

export interface ParticipanteSala {
  nick: string;
  role: RolSala;
  ac: EstadoAcSala;
}

interface MensajeEfimero {
  de: string;
  role?: RolSala;
  texto: string;
  ts?: string;
}

const ULTIMO_MSG = new WeakMap<WebSocket, number>();
const PALABRAS_BLOQUEADAS = /\b(discord\.gg\/|t\.me\/|bit\.ly\/)\S*/i;

function normalizarAc(raw: string | null | undefined): EstadoAcSala {
  if (raw === "vanguard" || raw === "faceit" || raw === "both" || raw === "pc") return raw;
  return "none";
}

export class SalaTorneo extends DurableObject<SalaEnv> {
  // Buffer estrictamente efímero en RAM (máx 4 líneas solo para contexto inmediato de !arbitro;
  // nunca se persiste en storage y se vacía en cuanto sale el último participante).
  private memoriaChat: MensajeEfimero[] = [];

  constructor(ctx: DurableObjectState, env: SalaEnv) {
    super(ctx, env);
  }

  private metaDe(ws: WebSocket): ParticipanteSala & { userSub: string } {
    const tags = this.ctx.getTags(ws);
    const nick = tags[0] || "espectador";
    const r = tags[1];
    const role: RolSala = r === "staff" || r === "player" ? r : "spectator";
    const ac = normalizarAc(tags[2]);
    const userSub = tags[3] || "";
    return { nick, role, ac, userSub };
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
    return this.ctx.getWebSockets().map((ws) => {
      const { nick, role, ac } = this.metaDe(ws);
      return { nick, role, ac };
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Se esperaba GET con Upgrade: websocket", { status: 426 });
    }
    if (this.ctx.getWebSockets().length >= 250) {
      return new Response("Sala llena", { status: 503 });
    }

    // Identidad, rol y badge AC verificados e inyectados por el Worker (nunca confiar en el cliente)
    const nick =
      (request.headers.get("x-vants-nick") || "espectador")
        .replace(/[^\p{L}\p{N}_ .#-]/gu, "")
        .trim()
        .slice(0, 24) || "espectador";
    const roleHeader = request.headers.get("x-vants-role") || "spectator";
    const role: RolSala = roleHeader === "staff" || roleHeader === "player" ? roleHeader : "spectator";
    const ac = normalizarAc(request.headers.get("x-vants-ac"));
    const userSub = (request.headers.get("x-vants-user-sub") || "").trim().slice(0, 96);
    const torneoId = (request.headers.get("x-vants-torneo-id") || "").trim().slice(0, 80);

    if (torneoId) {
      await this.ctx.storage.put("torneo_id", torneoId);
    }

    const pair = new WebSocketPair();
    const tags = userSub ? [nick, role, ac, userSub] : [nick, role, ac];
    this.ctx.acceptWebSocket(pair[1], tags);

    // Chat 100% efímero: init entrega solo marcador oficial, presentes actuales e historial vacío.
    const marcador = await this.ctx.storage.get<Record<string, any>>("marcador");
    pair[1].send(
      JSON.stringify({
        tipo: "init",
        yo: { nick, role, ac },
        torneoId: torneoId || (await this.ctx.storage.get<string>("torneo_id")) || null,
        marcador: marcador ?? null,
        historial: [],
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

    const { nick, role, ac } = this.metaDe(ws);

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

    // Chat 100% efímero: jamás se escribe en storage (solo RAM temporal mientras la sala está activa).
    this.memoriaChat.push({ de: nick, role, texto: texto.slice(0, 200), ts: new Date().toISOString() });
    if (this.memoriaChat.length > 4) this.memoriaChat = this.memoriaChat.slice(-4);
    await this.aviso({ tipo: "chat", de: nick, role, ac, texto });

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

    const [torneoId, marcador] = await Promise.all([
      this.ctx.storage.get<string>("torneo_id"),
      this.ctx.storage.get<Record<string, any>>("marcador"),
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
          slug: tRow.slug || torneoId,
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
          historial: this.memoriaChat,
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
    const restantes = this.ctx.getWebSockets().filter((s) => s !== ws);
    if (restantes.length === 0) {
      // Sala vacía: borrar todo rastro temporal del chat (0 KB en memoria y en storage).
      this.memoriaChat = [];
      await this.ctx.storage.delete("chat_hist").catch(() => null);
      return;
    }
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

  async expulsar(objetivo: { nick?: string; userSub?: string; motivo?: string }): Promise<number> {
    const nickNorm = String(objetivo?.nick || "").trim().toLowerCase();
    const subNorm = String(objetivo?.userSub || "").trim();
    const motivo = String(objetivo?.motivo || "Expulsado por VANTS Sentinel Anti-Cheat").slice(0, 120);
    let expulsados = 0;

    for (const ws of this.ctx.getWebSockets()) {
      const m = this.metaDe(ws);
      const matchSub = Boolean(subNorm && m.userSub && m.userSub === subNorm);
      const matchNick = Boolean(nickNorm && m.nick.toLowerCase() === nickNorm);
      if (matchSub || matchNick) {
        try {
          ws.send(JSON.stringify({ tipo: "error", texto: motivo, ts: new Date().toISOString() }));
          ws.close(1008, motivo.slice(0, 100));
        } catch {
          // noop
        }
        expulsados += 1;
      }
    }

    if (expulsados > 0) {
      await this.aviso({
        tipo: "sistema",
        texto: `🛡️ ${objetivo.nick || "Un jugador"} fue retirado de la sala por VANTS Sentinel.`,
      });
      await this.aviso({ tipo: "presencia", datos: this.presentes() });
    }
    return expulsados;
  }
}
