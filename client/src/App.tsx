import { lazy, Suspense, useEffect, useState } from "react";
import { Switch, Route, Router, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "./lib/auth";
import { Shell } from "./components/Layout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FeedbackProvider } from "./components/FeedbackProvider";
import { PageLoader } from "./components/ui-vants";
import { useSeo } from "./lib/seo";
import Home from "./pages/Home";
import NotFound from "./pages/not-found";

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
const EventosLista = lazy(() => import("./pages/Vants").then((m) => ({ default: m.EventosLista })));
const Publicar = lazy(() => import("./pages/Vants").then((m) => ({ default: m.Publicar })));
const CrearTorneo = lazy(() => import("./pages/CrearTorneo"));
const Workspace = lazy(() => import("./pages/Workspace"));
const Arena3D = lazy(() => import("./pages/Arena3D"));
const AIStudio = lazy(() => import("./pages/AIStudio"));
const ArenasMapa = lazy(() => import("./pages/ArenasMapa"));

/** URLs de la web anterior → equivalente en la nueva (enlaces externos, buscadores, Auth0/Stripe). */
const ANTIGUAS: [string, string][] = [
  ["/index.html", "/"], ["/partidos", "/agenda"], ["/llaves", "/bracket"], ["/streams", "/en-vivo"],
  ["/tienda-oficial", "/tienda"], ["/estadisticas", "/perfil/estadisticas"], ["/inventario", "/perfil"],
  ["/play", "/torneos/competir"], ["/historia", "/comunidad"], ["/guia", "/comunidad"], ["/descargar", "/"],
];

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
          <Route path="/:lang/tournaments/*?">{() => <TorneosLista />}</Route>
          <Route path={new RegExp("^/(?<p>.+)\\.html$")}>{(m: any) => <Redirect to={"/" + m.p} replace />}</Route>
          <Route path="/sala" component={SalaJugadores} />
          <Route path="/equipos" component={Equipos} />
          <Route path="/equipos/:slug" component={EquipoDetalle} />
          <Route path="/equipo-vants" component={EquipoVants} />
          <Route path="/jugadores/:slug" component={JugadorDetalle} />
          <Route path="/ranking" component={RankingVants} />
          <Route path="/ranked" component={Ranked} />
          <Route path="/torneos">{() => <TorneosLista />}</Route>
          <Route path="/torneos/competir">{() => <TorneosLista competir />}</Route>
          <Route path="/torneos/crear" component={CrearTorneo} />
          <Route path="/torneos/:slug" component={TorneoDetalle} />
          <Route path="/workspace" component={Workspace} />
          <Route path="/arena-3d" component={Arena3D} />
          <Route path="/ai-studio" component={AIStudio} />
          <Route path="/arenas" component={ArenasMapa} />
          <Route path="/agenda">{() => <Agenda modo="agenda" />}</Route>
          <Route path="/resultados">{() => <Agenda modo="resultados" />}</Route>
          <Route path="/mi-calendario" component={MiCalendario} />
          <Route path="/bracket" component={BracketPrincipal} />
          <Route path="/ligas" component={Ligas} />
          <Route path="/clips">{() => <Clips vista="destacados" />}</Route>
          <Route path="/clips/recientes">{() => <Clips vista="recientes" />}</Route>
          <Route path="/clips/juego">{() => <Clips vista="juego" />}</Route>
          <Route path="/clips/publicar">{() => <ClipsPrivado vista="publicar" />}</Route>
          <Route path="/clips/biblioteca">{() => <ClipsPrivado vista="biblioteca" />}</Route>
          <Route path="/comunidad" component={Comunidad} />
          <Route path="/noticias" component={Noticias} />
          <Route path="/noticias/:slug" component={NoticiaDetalle} />
          <Route path="/eventos" component={EventosLista} />
          <Route path="/publicar" component={Publicar} />
          <Route path="/en-vivo" component={EnVivo} />
          <Route path="/creadores" component={Creadores} />
          <Route path="/membresias" component={Membresias} />
          <Route path="/insignias" component={Insignias} />
          <Route path="/logros" component={Logros} />
          <Route path="/progreso" component={Progreso} />
          <Route path="/tienda" component={Tienda} />
          <Route path="/tienda/:cat" component={Tienda} />
          <Route path="/perfil" component={Perfil} />
          <Route path="/perfil/:sub" component={Perfil} />
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
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  useEffect(() => {
    const onQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener("gmp-quota-exceeded", onQuota);
    return () => window.removeEventListener("gmp-quota-exceeded", onQuota);
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <FeedbackProvider>
            {gmpQuotaExceeded && (
              <div
                role="alert"
                data-testid="gmp-quota-banner"
                className="sticky top-0 z-50 w-full px-4 py-2.5 bg-amber-500/95 text-zinc-950 text-xs sm:text-sm font-medium flex items-center justify-between gap-3"
              >
                <span>
                  Límite de cuota de la clave demo de Google Maps Platform alcanzado. Algunas funciones del mapa o
                  rutas pueden estar temporalmente limitadas; intenta nuevamente más tarde o cambia a tu proyecto de
                  Google Cloud.
                </span>
                <button
                  type="button"
                  onClick={() => setGmpQuotaExceeded(false)}
                  className="shrink-0 px-2 py-0.5 border border-zinc-900/40 text-xs font-bold cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            )}
            {HASH ? <Router hook={useHashLocation}><Rutas /></Router> : <Router><Rutas /></Router>}
          </FeedbackProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
