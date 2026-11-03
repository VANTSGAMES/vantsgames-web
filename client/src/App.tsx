import { Switch, Route, Router, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "./lib/auth";
import { Shell } from "./components/Layout";
import { useSeo } from "./lib/seo";
import Home from "./pages/Home";
import NotFound from "./pages/not-found";
import { TorneosLista, TorneoDetalle, Agenda, MiCalendario, BracketPrincipal, Ligas } from "./pages/Torneos";
import { SalaJugadores, Equipos, EquipoDetalle, EquipoVants, JugadorDetalle, Ranked } from "./pages/Sala";
import { Clips, ClipsPrivado, Noticias, NoticiaDetalle, EnVivo, Creadores, Comunidad } from "./pages/Comunidad";
import Membresias, { Insignias, Logros, Progreso } from "./pages/Membresias";
import Tienda from "./pages/Tienda";
import Perfil, { Acceso } from "./pages/Perfil";
import Legal from "./pages/Legal";
import { RankingVants, EventosLista, Publicar } from "./pages/Vants";

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
        <Route path="/torneos/:slug" component={TorneoDetalle} />
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
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {HASH ? <Router hook={useHashLocation}><Rutas /></Router> : <Router><Rutas /></Router>}
      </AuthProvider>
    </QueryClientProvider>
  );
}
