import { Link } from "wouter";
import type { Match, Team, Tournament, PtPlayer, YtVideo, Stream } from "@/lib/api";
import { assetUrl } from "@/lib/api";
import { dinero, fecha, gameLabel, hace, hora } from "@/lib/format";
import { GameTag, Initials } from "./ui-vants";

const ESTADO_T: Record<string, { l: string; c: string }> = {
  upcoming: { l: "Próximo", c: "tag" },
  ongoing: { l: "En curso", c: "tag tag-rojo" },
  archive: { l: "Finalizado", c: "tag" },
  open: { l: "Inscripción abierta", c: "tag tag-ok" },
};

export function TournamentRow({ t }: { t: Tournament }) {
  const e = ESTADO_T[t.estado] || { l: t.estado, c: "tag" };
  const premio = t.prize ? dinero(t.prize.value, t.prize.currency) : null;
  return (
    <Link href={"/torneos/" + t.slug} className="row grid-cols-[1fr_auto] md:grid-cols-[2.2fr_1fr_1fr_1fr_auto]" data-testid={"row-torneo-" + t.slug}>
      <div className="min-w-0 flex items-center gap-3">
        {t.logo_url ? <img src={assetUrl(t.logo_url)!} alt="" width={44} height={44} className="chamfer object-cover" style={{ width: 44, height: 44 }} loading="lazy" /> : <Initials name={t.nombre} size={44} />}
        <div className="min-w-0">
          <div className="d-3 truncate">{t.nombre}</div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            <GameTag g={t.game} />
            <span className={e.c}>{e.l}</span>
            {t.major && <span className="tag tag-rojo">Major</span>}
            {t.is_demo && <span className="tag tag-aviso">Demo</span>}
          </div>
        </div>
      </div>
      <div className="hidden md:block small"><div className="muted">Fechas</div><div className="num">{fecha(t.starts_at)}{t.ends_at ? " – " + fecha(t.ends_at) : ""}</div></div>
      <div className="hidden md:block small"><div className="muted">Premio</div><div className="num">{premio || "—"}</div></div>
      <div className="hidden md:block small"><div className="muted">Formato</div><div>{t.formato || "—"}{t.max_teams ? <span className="muted"> · {t.max_teams} eq.</span> : null}</div></div>
      <span className="link-arrow" aria-hidden>→</span>
    </Link>
  );
}

export function MatchRow({ m }: { m: Match }) {
  const live = m.estado === "live";
  const fin = m.estado === "finished";
  return (
    <div className="row grid-cols-[1fr_auto_1fr] md:grid-cols-[150px_1fr_auto_1fr_140px]" data-testid="row-match">
      <div className="hidden md:flex flex-col small">
        <span className="num">{fecha(m.empieza_at)} {hora(m.empieza_at)}</span>
        <span className="muted">{gameLabel(m.game)}{m.best_of ? " · Bo" + m.best_of : ""}</span>
      </div>
      <div className="text-right d-3 truncate">{m.equipos?.a || "Por definir"}</div>
      <div className="num text-center px-3 py-1" style={{ background: live ? "var(--rojo-tenue)" : "var(--grafito-2)", minWidth: 72, border: "1px solid " + (live ? "rgba(255,13,46,.5)" : "var(--linea)") }}>
        {m.score ? <><b>{m.score.a}</b><span className="muted"> : </span><b>{m.score.b}</b></> : <span className="muted">VS</span>}
      </div>
      <div className="d-3 truncate">{m.equipos?.b || "Por definir"}</div>
      <div className="hidden md:flex justify-end gap-1.5">
        {live && <span className="tag tag-rojo"><span className="dot-live" /> En vivo</span>}
        {fin && <span className="tag">Final</span>}
        {m.is_demo && <span className="tag tag-aviso">Demo</span>}
      </div>
    </div>
  );
}

export function TeamTile({ t }: { t: Team }) {
  return (
    <Link href={"/equipos/" + t.slug} className="flex items-center gap-4 p-4 transition-colors hover:bg-[var(--grafito-2)]" data-testid={"card-equipo-" + t.slug}>
      {t.logo_url ? <img src={assetUrl(t.logo_url)!} alt="" width={52} height={52} className="chamfer object-cover" style={{ width: 52, height: 52 }} loading="lazy" /> : <Initials name={t.tag || t.nombre} size={52} />}
      <div className="min-w-0">
        <div className="d-3 truncate">{t.nombre}</div>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {t.tag && <span className="tag">{t.tag}</span>}
          <GameTag g={t.game} />
          {t.region && <span className="tag">{t.region}</span>}
          {t.is_demo && <span className="tag tag-aviso">Demo</span>}
        </div>
      </div>
    </Link>
  );
}

export function PlayerTile({ p }: { p: PtPlayer }) {
  return (
    <Link href={"/jugadores/" + p.slug} className="flex items-center gap-3 p-4 transition-colors hover:bg-[var(--grafito-2)]" data-testid={"card-jugador-" + p.slug}>
      <Initials name={p.nombre} size={44} />
      <div className="min-w-0">
        <div className="d-3 truncate">{p.nombre}</div>
        <div className="small muted truncate">{[p.rol, p.pais, gameLabel(p.game)].filter(Boolean).join(" · ") || "Jugador"}</div>
      </div>
    </Link>
  );
}

export function VideoTile({ v }: { v: YtVideo }) {
  return (
    <a href={"https://www.youtube.com/watch?v=" + v.id} target="_blank" rel="noopener noreferrer" className="group block" data-testid={"card-clip-" + v.id}>
      <div className="relative overflow-hidden chamfer" style={{ aspectRatio: "16/9", background: "var(--grafito-2)" }}>
        <img src={v.mini} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        <span className="absolute left-2 bottom-2 tag" style={{ background: "rgba(10,10,11,.85)" }}>YouTube</span>
      </div>
      <div className="mt-2.5 font-semibold leading-snug line-clamp-2 group-hover:text-white" style={{ color: "var(--gris-1)" }}>{v.titulo}</div>
      <div className="small muted mt-0.5">{hace(v.fecha)}</div>
    </a>
  );
}

export function StreamTile({ s }: { s: Stream & { url?: string; plataforma?: "twitch" | "kick" } }) {
  return (
    <a href={s.url || "https://www.twitch.tv/" + s.canal} target="_blank" rel="noopener noreferrer" className="group block" data-testid={"card-stream-" + s.canal}>
      <div className="relative overflow-hidden chamfer" style={{ aspectRatio: "16/9", background: "var(--grafito-2)" }}>
        {s.mini && <img src={s.mini} alt="" loading="lazy" className="w-full h-full object-cover" />}
        <span className="absolute left-2 top-2 tag tag-rojo" style={{ background: "rgba(10,10,11,.85)" }}><span className="dot-live" /> En vivo</span>
        <span className="absolute right-2 top-2 tag" style={{ background: "rgba(10,10,11,.85)", color: s.plataforma === "kick" ? "#53fc18" : "#a970ff" }}>{s.plataforma === "kick" ? "Kick" : "Twitch"}</span>
        <span className="absolute right-2 bottom-2 tag num" style={{ background: "rgba(10,10,11,.85)" }}>{new Intl.NumberFormat("es-ES").format(s.vistas || 0)} espectadores</span>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        {s.perfil && <img src={s.perfil} alt="" width={24} height={24} loading="lazy" className="rounded-full" />}
        <span className="font-semibold">{s.canalNombre || s.canal}</span>
        {s.juego && <span className="small muted">· {s.juego}</span>}
      </div>
      <div className="small muted line-clamp-1 mt-0.5">{s.titulo}</div>
    </a>
  );
}
