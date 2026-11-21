// Durable Object "Sala de torneo" para VANTS GAMES.
//
// Un objeto por sala (nombrado con el id del torneo): presencia en vivo, chat
// y marcador por WebSocket con hibernación — las conexiones inactivas no
// consumen cómputo, y cada sala es un único punto de estado sin carreras.
// Los DO no reciben peticiones de internet directamente: el Worker `vants`
// (o `vants-recursos`) les reenvía vía binding SALA_TORNEO.
//
// Registro y binding: ver cloudflare/wrangler.ejemplo.jsonc
//   durable_objects.bindings + exports (storage: sqlite)
import { DurableObject } from "cloudflare:workers";

export interface SalaEnv {
  SALA_TORNEO: DurableObjectNamespace;
}

type TipoEvento = "chat" | "sistema" | "presencia" | "marcador";

export interface EventoSala {
  tipo: TipoEvento;
  de?: string;
  texto?: string;
  datos?: unknown;
}

export class SalaTorneo extends DurableObject<SalaEnv> {
  constructor(ctx: DurableObjectState, env: SalaEnv) {
    super(ctx, env);
  }

  // El nick viaja como etiqueta del WebSocket: sobrevive a la hibernación.
  private nickDe(ws: WebSocket): string {
    return this.ctx.getTags(ws)[0] || "anon";
  }

  private async aviso(ev: EventoSala): Promise<void> {
    const texto = JSON.stringify(ev);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(texto);
      } catch {
        // socket cerrándose entre el listado y el envío: se ignora
      }
    }
  }

  private presentes(): string[] {
    return this.ctx.getWebSockets().map((ws) => this.nickDe(ws));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // El worker reenvía la petición original, así que la ruta puede ser
    // /join (directo) o la pasarela /sala/<id>/ws; lo que manda es el Upgrade.
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Se esperaba GET con Upgrade: websocket", { status: 426 });
    }
    if (this.ctx.getWebSockets().length >= 200) {
      return new Response("Sala llena", { status: 503 });
    }
    const nick = (url.searchParams.get("nick") || "anon").slice(0, 24);
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [nick]);
    await this.aviso({ tipo: "sistema", texto: `${nick} entró a la sala` });
    await this.aviso({ tipo: "presencia", datos: this.presentes() });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return;
    let ev: EventoSala;
    try {
      ev = JSON.parse(raw) as EventoSala;
    } catch {
      return;
    }
    const nick = this.nickDe(ws);
    if (ev.tipo === "chat") {
      const texto = (ev.texto || "").slice(0, 500).trim();
      if (texto) await this.aviso({ tipo: "chat", de: nick, texto });
      return;
    }
    if (ev.tipo === "marcador") {
      // El marcador queda persistido en la sala (SQLite del DO): quien entre
      // tarde lo recupera con el método RPC `estado()` desde el Worker.
      await this.ctx.storage.put("marcador", ev.datos ?? null);
      await this.aviso({ tipo: "marcador", de: nick, datos: ev.datos });
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const nick = this.nickDe(ws);
    await this.aviso({ tipo: "sistema", texto: `${nick} salió de la sala` });
    await this.aviso({ tipo: "presencia", datos: this.presentes() });
  }

  // ---- RPC para el Worker (no pasan por internet, van por el binding) ----

  /** Estado actual de la sala: quién está y el marcador persistido. */
  async estado(): Promise<{ presentes: string[]; marcador: unknown }> {
    return {
      presentes: this.presentes(),
      marcador: (await this.ctx.storage.get<unknown>("marcador")) ?? null,
    };
  }

  /** Aviso empujado desde el backend (p. ej. resultado verificado por el TorneoWorkflow). */
  async avisar(ev: EventoSala): Promise<void> {
    if (ev.tipo === "marcador") await this.ctx.storage.put("marcador", ev.datos ?? null);
    await this.aviso(ev);
  }
}
