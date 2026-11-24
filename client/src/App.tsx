import { lazy as reactLazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Switch, Route, Router, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "./lib/auth";
import { Privado } from "./components/MuroAcceso";
import { PaginaEmpresas } from "./components/SeccionEmpresas";
import { Shell } from "./components/Layout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FeedbackProvider } from "./components/FeedbackProvider";
import { PageLoader } from "./components/ui-vants";
import { useSeo } from "./lib/seo";
import Home from "./pages/Home";
import NotFound from "./pages/not-found";

function lazy<T extends ComponentType<any>>(loader: () => Promise<{ default: T }>) {
  return reactLazy(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const mod = await loader();
        try {
          sessionStorage.removeItem("vants_chunk_reload");
        } catch {}
        return mod;
      } catch (err) {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
          continue;
        }
        const msg = String((err as Error)?.message || "");
        if (/dynamically imported module|module script failed|Loading chunk/i.test(msg)) {
          try {
            const key = "vants_chunk_reload";
            const prev = Number(sessionStorage.getItem(key) || "0");
            if (Date.now() - prev > 15_000) {
              sessionStorage.setItem(key, String(Date.now()));
              window.location.reload();
            }
          } catch {}
        }
        throw err;
      }
    }
    return loader();
  });
}

const PerfilPublicoPagina = lazy(() => import("./pages/PerfilPublico").then((m) => ({ default: m.PerfilPublicoPagina })));
const TorneosLista = lazy(() => import("./pages/Torneos").then((m) => ({ default: m.TorneosLista })));
const TorneoDetalle = lazy(() => import("./pages/Torneos").then((m) => ({ default: m.TorneoDetalle })));
const Agenda = lazy(() => import("./pages/Torneos").then((m) => ({ default: m.Agenda })));
const MiCalendario = lazy(() => import("./pages/Torneos").then((m) => ({ default: m.MiCalendario })));
const BracketPrincipal = lazy(() => import("./pages/Torneos").then((m) => ({ default: m.BracketPrincipal })));
const Ligas = lazy(() => import("./pages/Torneos").then((m) => ({ default: m.Ligas })));
const SalaJugadores = lazy(() => import("./pages/Sala").then((m) => ({ default: m.SalaJugadores })));
const Equipos = lazy(() => import("./pages/Sala").then((m) => ({ default: m.Equipos })));
const EquipoDetalle = lazy(() => import("./pages/Sala").then((m) => ({ default: m.EquipoDetalle })));
const EquipoVants = lazy(() => import("./pages/Sala").then((m) => ({ default: m.EquipoVants })));
const JugadorDetalle = lazy(() => import("./pages/Sala").then((m) => ({ default: m.JugadorDetalle })));
const Ranked = lazy(() => import("./pages/Sala").then((m) => ({ default: m.Ranked })));
const Clips = lazy(() => import("./pages/Comunidad").then((m) => ({ default: m.Clips })));
const ClipsPrivado = lazy(() => import("./pages/Comunidad").then((m) => ({ default: m.ClipsPrivado })));
const Noticias = lazy(() => import("./pages/Comunidad").then((m) => ({ default: m.Noticias })));
const NoticiaDetalle = lazy(() => import("./pages/Comunidad").then((m) => ({ default: m.NoticiaDetalle })));
const EnVivo = lazy(() => import("./pages/Comunidad").then((m) => ({ default: m.EnVivo })));
const Creadores = lazy(() => import("./pages/Comunidad").then((m) => ({ default: m.Creadores })));
const Comunidad = lazy(() => import("./pages/Comunidad").then((m) => ({ default: m.Comunidad })));
const Membresias = lazy(() => import("./pages/Membresias"));
const Insignias = lazy(() => import("./pages/Membresias").then((m) => ({ default: m.Insignias })));
const Logros = lazy(() => import("./pages/Membresias").then((m) => ({ default: m.Logros })));
const Progreso = lazy(() => import("./pages/Membresias").then((m) => ({ default: m.Progreso })));
const Tienda = lazy(() => import("./pages/Tienda"));
const Perfil = lazy(() => import("./pages/Perfil"));
const Acceso = lazy(() => import("./pages/Perfil").then((m) => ({ default: m.Acceso })));
const Legal = lazy(() => import("./pages/Legal"));
const RankingVants = lazy(() => import("./pages/Vants").then((m) => ({ default: m.RankingVants })));
const Publicar = lazy(() => import("./pages/Vants").then((m) => ({ default: m.Publicar })));
const CrearTorneo = lazy(() => import("./pages/CrearTorneo"));
const Workspace = lazy(() => import("./pages/Workspace"));
const Arena3D = lazy(() => import("./pages/Arena3D"));
const BuscadorEquipo = lazy(() => import("./pages/BuscadorEquipo"));
const ForoComunidad = lazy(() => import("./pages/ForoComunidad"));
const MisionesComunidad = lazy(() => import("./pages/MisionesComunidad"));
const VotacionesComunidad = lazy(() => import("./pages/VotacionesComunidad"));
const EventosComunidad = lazy(() => import("./pages/EventosComunidad"));

/** URLs de la web anterior → equivalente en la nueva (enlaces externos, buscadores, Auth0/Stripe). */
const ANTIGUAS: [string, string][] = [
  ["/index.html", "/"], ["/partidos", "/agenda"], ["/llaves", "/bracket"], ["/streams", "/en-vivo"],
  ["/tienda-oficial", "/tienda"], ["/estadisticas", "/perfil/estadisticas"], ["/inventario", "/perfil"],
  ["/play", "/torneos/competir"], ["/historia", "/comunidad"], ["/guia", "/comunidad"], ["/descargar", "/"],
];

/** Ruta envuelta en el muro de miembros: sin sesión se ve la vitrina, con sesión la sección. */
function Priv({ seccion, children }: { seccion: string; children: ReactNode }) {
  return <Privado seccion={seccion}>{children}</Privado>;
}

// En Cloudflare: URLs limpias (history). En la vista previa embebida: hash.
const HASH = import.meta.env.VITE_ROUTER !== "history";

function Rutas() {
  useSeo();
  return (
    <Shell>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/privacidad">{() => <Legal doc="privacidad" />}</Route>
          <Route path="/terminos">{() => <Legal doc="terminos" />}</Route>
          {ANTIGUAS.map(([de, a]) => <Route key={de} path={de}>{() => <Redirect to={a} replace />}</Route>)}
          <Route path="/:lang/tournaments/*?">{() => <Priv seccion="Los torneos"><TorneosLista /></Priv>}</Route>
          <Route path={new RegExp("^/(?<p>.+)\\.html$")}>{(m: any) => <Redirect to={"/" + m.p} replace />}</Route>
          <Route path="/sala"><Priv seccion="La sala de jugadores"><SalaJugadores /></Priv></Route>
          <Route path="/equipos"><Priv seccion="Los equipos del circuito"><Equipos /></Priv></Route>
          <Route path="/equipos/:slug"><Priv seccion="Los equipos del circuito"><EquipoDetalle /></Priv></Route>
          <Route path="/equipo-vants"><Priv seccion="El equipo VANTS"><EquipoVants /></Priv></Route>
          <Route path="/jugadores/:slug"><Priv seccion="Las fichas de jugador"><JugadorDetalle /></Priv></Route>
          <Route path="/ranking"><Priv seccion="El ranking global"><RankingVants /></Priv></Route>
          <Route path="/ranked"><Priv seccion="VANTS Ranked"><Ranked /></Priv></Route>
          <Route path="/torneos"><Priv seccion="Los torneos"><TorneosLista /></Priv></Route>
          <Route path="/torneos/competir"><Priv seccion="Las inscripciones abiertas"><TorneosLista competir /></Priv></Route>
          <Route path="/torneos/crear"><Redirect to="/crear-torneo" replace /></Route>
          <Route path="/crear-torneo"><Priv seccion="La creación de torneos"><CrearTorneo /></Priv></Route>
          <Route path="/torneos/:slug"><Priv seccion="Este torneo"><TorneoDetalle /></Priv></Route>
          <Route path="/workspace"><Priv seccion="El Centro Workspace"><Workspace /></Priv></Route>
          <Route path="/arena-3d"><Priv seccion="La Arena 3D"><Arena3D /></Priv></Route>
          <Route path="/agenda"><Priv seccion="La agenda en vivo"><Agenda modo="agenda" /></Priv></Route>
          <Route path="/resultados"><Priv seccion="Los resultados"><Agenda modo="resultados" /></Priv></Route>
          <Route path="/mi-calendario"><Priv seccion="Tu calendario"><MiCalendario /></Priv></Route>
          <Route path="/bracket"><Priv seccion="El bracket principal"><BracketPrincipal /></Priv></Route>
          <Route path="/ligas"><Priv seccion="Las ligas y temporadas"><Ligas /></Priv></Route>
          <Route path="/clips"><Priv seccion="Los clips"><Clips vista="destacados" /></Priv></Route>
          <Route path="/clips/recientes"><Priv seccion="Los clips"><Clips vista="recientes" /></Priv></Route>
          <Route path="/clips/juego"><Priv seccion="Los clips"><Clips vista="juego" /></Priv></Route>
          <Route path="/clips/publicar"><Priv seccion="Publicar clips"><ClipsPrivado vista="publicar" /></Priv></Route>
          <Route path="/clips/biblioteca"><Priv seccion="Tu biblioteca de clips"><ClipsPrivado vista="biblioteca" /></Priv></Route>
          <Route path="/comunidad"><Priv seccion="La comunidad"><Comunidad /></Priv></Route>
          <Route path="/comunidad/lfg"><Priv seccion="El buscador LFG"><BuscadorEquipo /></Priv></Route>
          <Route path="/comunidad/foro"><Priv seccion="El foro"><ForoComunidad /></Priv></Route>
          <Route path="/comunidad/misiones"><Priv seccion="Las misiones semanales"><MisionesComunidad /></Priv></Route>
          <Route path="/comunidad/votaciones"><Priv seccion="Las votaciones"><VotacionesComunidad /></Priv></Route>
          <Route path="/comunidad/eventos"><Priv seccion="Los eventos"><EventosComunidad /></Priv></Route>
          <Route path="/noticias"><Priv seccion="Las noticias"><Noticias /></Priv></Route>
          <Route path="/noticias/:slug"><Priv seccion="Esta noticia"><NoticiaDetalle /></Priv></Route>
          <Route path="/eventos"><Priv seccion="Los eventos"><EventosComunidad /></Priv></Route>
          <Route path="/publicar"><Priv seccion="Publicar en VANTS"><Publicar /></Priv></Route>
          <Route path="/en-vivo"><Priv seccion="Los directos"><EnVivo /></Priv></Route>
          <Route path="/directos"><Priv seccion="Los directos"><EnVivo /></Priv></Route>
          <Route path="/creadores"><Priv seccion="Los creadores"><Creadores /></Priv></Route>
          <Route path="/membresias" component={Membresias} />
          <Route path="/pase-s4" component={Membresias} />
          <Route path="/empresas" component={PaginaEmpresas} />
          <Route path="/insignias"><Priv seccion="Las insignias"><Insignias /></Priv></Route>
          <Route path="/logros"><Priv seccion="Los logros"><Logros /></Priv></Route>
          <Route path="/progreso"><Priv seccion="Tu progreso"><Progreso /></Priv></Route>
          <Route path="/tienda"><Priv seccion="La tienda oficial"><Tienda /></Priv></Route>
          <Route path="/tienda/:cat"><Priv seccion="La tienda oficial"><Tienda /></Priv></Route>
          <Route path="/perfil"><Priv seccion="Tu perfil"><Perfil /></Priv></Route>
          <Route path="/perfil/:sub"><Priv seccion="Tu perfil"><Perfil /></Priv></Route>
          <Route path="/entrar">{() => <Acceso modo="entrar" />}</Route>
          <Route path="/registro">{() => <Acceso modo="registro" />}</Route>
          <Route path="/recuperar">{() => <Acceso modo="recuperar" />}</Route>
          <Route path="/u/:pid" component={PerfilPublicoPagina} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </Shell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <FeedbackProvider>
          <AuthProvider>
            {HASH ? <Router hook={useHashLocation}><Rutas /></Router> : <Router><Rutas /></Router>}
          </AuthProvider>
        </FeedbackProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
