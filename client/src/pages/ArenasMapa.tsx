/// <reference types="@types/google.maps" />
import { useCallback, useEffect, useRef, useState } from "react";
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useMapsLibrary,
  useMap,
} from "@vis.gl/react-google-maps";
import {
  MapPin,
  Navigation,
  Search,
  Bookmark,
  Trash2,
  ExternalLink,
  LogIn,
  Crosshair,
  Star,
} from "lucide-react";
import { PageHead } from "@/components/ui-vants";
import { useFeedback } from "@/components/FeedbackProvider";
import { JUEGOS } from "@/lib/juegos";
import {
  firebaseAuth,
  initWorkspaceAuth,
  signInWithGoogleWorkspace,
} from "@/lib/googleWorkspace";
import {
  deleteArenaSpot,
  saveArenaSpot,
  subscribeArenaSpots,
  type SavedArenaSpot,
} from "@/lib/firestoreClient";
import { formatRouteSummary, isQuotaErrorPayload } from "@/lib/studioHelpers";
import type { User } from "firebase/auth";

interface CityHub {
  id: string;
  label: string;
  query: string;
  center: { lat: number; lng: number };
}

const CITY_HUBS: CityHub[] = [
  { id: "caracas", label: "Caracas", query: "gaming arena cybercafe esports Caracas", center: { lat: 10.4806, lng: -66.9036 } },
  { id: "valencia", label: "Valencia", query: "cybercafe gaming arena esports Valencia Venezuela", center: { lat: 10.162, lng: -68.0077 } },
  { id: "maracaibo", label: "Maracaibo", query: "gaming center cybercafe esports Maracaibo", center: { lat: 10.6544, lng: -71.6406 } },
  { id: "bogota", label: "Bogotá", query: "esports arena gaming center Bogotá", center: { lat: 4.711, lng: -74.0721 } },
  { id: "cdmx", label: "CDMX", query: "esports arena gaming center Ciudad de México", center: { lat: 19.4326, lng: -99.1332 } },
];

interface LiveArenaPlace {
  id: string;
  displayName: string;
  formattedAddress: string;
  location: { lat: number; lng: number };
  rating?: number | null;
  userRatingCount?: number | null;
  googleMapsURI?: string | null;
  isOpenNow?: boolean | null;
}

interface RouteInfo {
  destinationName: string;
  distanceText: string;
  durationText: string;
}

function ArenaMapCanvas({
  hub,
  searchQuery,
  searchNonce,
  places,
  onPlacesLoaded,
  selectedPlace,
  onSelectPlace,
  userOrigin,
  onRouteInfo,
  onError,
  onSavePlace,
}: {
  hub: CityHub;
  searchQuery: string;
  searchNonce: number;
  places: LiveArenaPlace[];
  onPlacesLoaded: (items: LiveArenaPlace[]) => void;
  selectedPlace: LiveArenaPlace | null;
  onSelectPlace: (place: LiveArenaPlace | null) => void;
  userOrigin: { lat: number; lng: number } | null;
  onRouteInfo: (info: RouteInfo | null) => void;
  onError: (msg: string | null) => void;
  onSavePlace: (place: LiveArenaPlace) => void;
}) {
  const map = useMap();
  const placesLib = useMapsLibrary("places");
  const routesLib = useMapsLibrary("routes");
  const polylinesRef = useRef<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [routing, setRouting] = useState(false);

  const clearPolylines = useCallback(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
  }, []);

  useEffect(() => {
    return () => clearPolylines();
  }, [clearPolylines]);

  // Pan map when user switches hub
  useEffect(() => {
    if (!map) return;
    map.panTo(hub.center);
    map.setZoom(12);
    clearPolylines();
    onRouteInfo(null);
  }, [map, hub, clearPolylines, onRouteInfo]);

  // Execute Places API (New) text search
  useEffect(() => {
    if (!placesLib || !searchQuery.trim()) return;
    let cancelled = false;

    async function runSearch() {
      setSearching(true);
      onError(null);
      try {
        const PlaceCtor = (placesLib as any).Place;
        if (!PlaceCtor?.searchByText) {
          throw new Error("Places API (New) no disponible en esta sesión.");
        }
        const request: Record<string, any> = {
          textQuery: searchQuery.trim(),
          fields: ["id", "displayName", "formattedAddress", "location", "rating", "userRatingCount", "googleMapsURI"],
          locationBias: {
            center: hub.center,
            radius: 18000,
          },
          maxResultCount: 10,
          language: "es",
        };
        const { places: rawPlaces } = await PlaceCtor.searchByText(request);
        if (cancelled) return;

        const mapped: LiveArenaPlace[] = (rawPlaces || [])
          .filter((p: any) => p?.location)
          .map((p: any) => {
            const loc = p.location;
            const lat = typeof loc.lat === "function" ? loc.lat() : Number(loc.lat);
            const lng = typeof loc.lng === "function" ? loc.lng() : Number(loc.lng);
            return {
              id: String(p.id || `${lat},${lng}`),
              displayName: String(p.displayName || "Arena Gaming"),
              formattedAddress: String(p.formattedAddress || ""),
              location: { lat, lng },
              rating: typeof p.rating === "number" ? p.rating : null,
              userRatingCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
              googleMapsURI: typeof p.googleMapsURI === "string" ? p.googleMapsURI : null,
            };
          });

        onPlacesLoaded(mapped);
        if (mapped.length > 0 && map && window.google?.maps?.LatLngBounds) {
          const bounds = new window.google.maps.LatLngBounds();
          mapped.forEach((m) => bounds.extend(m.location));
          map.fitBounds(bounds, 64);
        }
      } catch (err: any) {
        if (cancelled) return;
        const msg = err?.message || "No se pudo consultar Places API (New).";
        if (isQuotaErrorPayload(err?.status, msg)) {
          window.dispatchEvent(new CustomEvent("gmp-quota-exceeded"));
          onError("Se alcanzó temporalmente el límite de cuota de Google Maps Platform. Intenta nuevamente más tarde.");
        } else {
          onError(msg);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }

    void runSearch();
    return () => {
      cancelled = true;
    };
  }, [placesLib, searchQuery, searchNonce, hub, map, onPlacesLoaded, onError]);

  const computeRouteTo = async (place: LiveArenaPlace) => {
    if (!routesLib || !map) return;
    setRouting(true);
    onError(null);
    clearPolylines();
    try {
      const RouteCtor = (routesLib as any).Route;
      if (!RouteCtor?.computeRoutes) {
        throw new Error("Routes API no está habilitada para calcular rutas.");
      }
      const origin = userOrigin || hub.center;
      const { routes } = await RouteCtor.computeRoutes({
        origin,
        destination: place.location,
        travelMode: "DRIVE",
        fields: ["path", "distanceMeters", "durationMillis"],
      });
      if (!routes || routes.length === 0) {
        throw new Error("No se encontró una ruta en automóvil hasta esta arena.");
      }
      const route = routes[0];
      const polylines: any[] = route.createPolylines({
        strokeColor: "#FF0D2E",
        strokeOpacity: 0.92,
        strokeWeight: 5,
      });
      polylines.forEach((line) => line.setMap(map));
      polylinesRef.current = polylines;

      if (route.viewport) {
        map.fitBounds(route.viewport, 60);
      }
      const durationSec = typeof route.durationMillis === "number" ? route.durationMillis / 1000 : null;
      const summary = formatRouteSummary(route.distanceMeters, durationSec);
      onRouteInfo({
        destinationName: place.displayName,
        distanceText: summary.distanceText,
        durationText: summary.durationText,
      });
    } catch (err: any) {
      const msg = err?.message || "No se pudo calcular la ruta.";
      if (isQuotaErrorPayload(err?.status, msg)) {
        window.dispatchEvent(new CustomEvent("gmp-quota-exceeded"));
        onError("Límite de cuota alcanzado en Routes API. Intenta nuevamente más tarde.");
      } else {
        onError(msg);
      }
    } finally {
      setRouting(false);
    }
  };

  return (
    <div className="relative w-full h-[540px] lg:h-[620px] border border-[var(--linea)] bg-[#0d0e12]">
      <GoogleMap
        mapId="DEMO_MAP_ID"
        internalUsageAttributionIds={["gmp_mcp_codeassist_v1_aistudio"]}
        defaultCenter={hub.center}
        defaultZoom={12}
        gestureHandling="greedy"
        disableDefaultUI={false}
        style={{ width: "100%", height: "100%" }}
        onClick={() => onSelectPlace(null)}
      >
        {userOrigin && (
          <AdvancedMarker position={userOrigin} title="Tu ubicación">
            <Pin background="#38bdf8" borderColor="#0c4a6e" glyphColor="#ffffff" />
          </AdvancedMarker>
        )}

        {places.map((p, idx) => {
          const isSelected = selectedPlace?.id === p.id;
          return (
            <AdvancedMarker
              key={p.id}
              position={p.location}
              title={p.displayName}
              zIndex={isSelected ? 50 : 10 + idx}
              onClick={() => onSelectPlace(p)}
            >
              <Pin
                background={isSelected ? "#ffffff" : "#FF0D2E"}
                borderColor={isSelected ? "#FF0D2E" : "#7f0718"}
                glyphColor={isSelected ? "#FF0D2E" : "#ffffff"}
              />
            </AdvancedMarker>
          );
        })}

        {selectedPlace && (
          <InfoWindow
            position={selectedPlace.location}
            onCloseClick={() => onSelectPlace(null)}
          >
            <div className="text-zinc-900 max-w-[260px] space-y-2 p-1">
              <div className="font-bold text-sm leading-snug">{selectedPlace.displayName}</div>
              {selectedPlace.formattedAddress && (
                <div className="text-xs text-zinc-600">{selectedPlace.formattedAddress}</div>
              )}
              {typeof selectedPlace.rating === "number" && (
                <div className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                  <span>
                    {selectedPlace.rating.toFixed(1)}
                    {selectedPlace.userRatingCount ? ` (${selectedPlace.userRatingCount} reseñas)` : ""}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  type="button"
                  disabled={routing}
                  onClick={() => void computeRouteTo(selectedPlace)}
                  className="px-2.5 py-1 text-xs font-semibold bg-[#FF0D2E] text-white cursor-pointer"
                >
                  {routing ? "Calculando…" : "Cómo llegar"}
                </button>
                <button
                  type="button"
                  onClick={() => onSavePlace(selectedPlace)}
                  className="px-2.5 py-1 text-xs font-semibold bg-zinc-900 text-white cursor-pointer"
                >
                  Guardar sede
                </button>
                {selectedPlace.googleMapsURI && (
                  <a
                    href={selectedPlace.googleMapsURI}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-zinc-700 underline"
                  >
                    <span>Maps</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {searching && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-[#111217] border border-[#2c2f3b] text-xs text-zinc-200"
          style={{ fontFamily: "var(--f-mono)" }}
        >
          Buscando arenas en Google Maps Platform…
        </div>
      )}
    </div>
  );
}

export default function ArenasMapa() {
  const { toast } = useFeedback();
  const notify = (title: string, kind: "ok" | "error" | "info" = "info") => toast({ kind, title });
  const [apiKey, setApiKey] = useState<string>(String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ""));
  const [keyLoading, setKeyLoading] = useState(!import.meta.env.VITE_GOOGLE_MAPS_API_KEY);

  const [hub, setHub] = useState<CityHub>(CITY_HUBS[0]);
  const [queryInput, setQueryInput] = useState(CITY_HUBS[0].query);
  const [activeQuery, setActiveQuery] = useState(CITY_HUBS[0].query);
  const [searchNonce, setSearchNonce] = useState(0);

  const [places, setPlaces] = useState<LiveArenaPlace[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<LiveArenaPlace | null>(null);
  const [userOrigin, setUserOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  // Firebase Auth & Firestore saved arena spots
  const [fbUser, setFbUser] = useState<User | null>(firebaseAuth.currentUser);
  const [savedSpots, setSavedSpots] = useState<SavedArenaSpot[]>([]);
  const [spotNote, setSpotNote] = useState("");
  const [spotGame, setSpotGame] = useState("valorant");

  useEffect(() => {
    if (apiKey) {
      setKeyLoading(false);
      return;
    }
    let active = true;
    fetch("/api/maps/config")
      .then((r) => r.json())
      .then((d) => {
        if (active && d?.apiKey) setApiKey(String(d.apiKey));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setKeyLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiKey]);

  useEffect(() => {
    return initWorkspaceAuth(
      (u) => setFbUser(u),
      () => {
        setFbUser(null);
        setSavedSpots([]);
      },
    );
  }, []);

  useEffect(() => {
    if (!fbUser?.uid) return;
    return subscribeArenaSpots(fbUser.uid, setSavedSpots);
  }, [fbUser?.uid]);

  const handleSelectHub = (nextHub: CityHub) => {
    setHub(nextHub);
    setQueryInput(nextHub.query);
    setActiveQuery(nextHub.query);
    setSelectedPlace(null);
    setSearchNonce((n) => n + 1);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim()) return;
    setSelectedPlace(null);
    setActiveQuery(queryInput.trim());
    setSearchNonce((n) => n + 1);
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      notify("Tu navegador no soporta geolocalización.", "error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        notify("Tu ubicación está lista para calcular rutas hacia cualquier arena.", "ok");
      },
      () => {
        notify("No se pudo obtener tu ubicación; las rutas partirán desde el centro de la ciudad.", "info");
      },
      { timeout: 8000 },
    );
  };

  const handleSavePlaceToFirestore = async (place: LiveArenaPlace) => {
    if (!fbUser?.uid) {
      notify("Conecta tu cuenta de Google para guardar sedes favoritas en Firestore.", "info");
      return;
    }
    try {
      // Cumplimiento ToS Google Maps: guardamos únicamente placeId + etiqueta/nota personal del usuario
      await saveArenaSpot(fbUser.uid, {
        placeId: place.id,
        userLabel: place.displayName.slice(0, 130),
        userNote: spotNote.trim() || `Sede encontrada en ${hub.label}`,
        gameSlug: spotGame,
      });
      setSpotNote("");
      notify(`Sede «${place.displayName}» guardada en tu lista de Firestore.`, "ok");
    } catch (err: any) {
      notify(err?.message || "No se pudo guardar la sede en Firestore.", "error");
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const { user } = await signInWithGoogleWorkspace();
      setFbUser(user);
      notify("Cuenta Google conectada para guardar sedes LAN en Firestore.", "ok");
    } catch (err: any) {
      notify(err?.message || "No se pudo conectar con Google.", "error");
    }
  };

  return (
    <div className="pb-14" data-testid="arenas-mapa-page">
      <PageHead
        eyebrow="GOOGLE MAPS PLATFORM · PLACES API (NEW) + ROUTES API"
        title="Mapa de Arenas y Torneos LAN"
        lead="Descubre cybercafés competitivos, gaming centers y sedes presenciales en Venezuela y LATAM con rutas en vivo y marcadores guardados en Firestore."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleLocateMe}
              className="btn btn-sm"
              data-testid="arenas-geolocate-btn"
            >
              <Crosshair className="w-4 h-4" />
              <span>{userOrigin ? "Ubicación activa" : "Mi ubicación"}</span>
            </button>
            {!fbUser && (
              <button type="button" onClick={handleGoogleSignIn} className="btn btn-rojo btn-sm">
                <LogIn className="w-4 h-4" />
                <span>Conectar Google</span>
              </button>
            )}
          </div>
        }
      />

      <div className="wrap space-y-6">
        {/* City Hub Selector + Search Form */}
        <div className="panel panel-pad space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-widest muted mr-1" style={{ fontFamily: "var(--f-mono)" }}>
              Ciudades LAN:
            </span>
            {CITY_HUBS.map((c) => {
              const active = c.id === hub.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelectHub(c)}
                  data-testid={`arenas-hub-${c.id}`}
                  className="px-3 py-1.5 text-xs font-semibold border transition-colors cursor-pointer"
                  style={{
                    background: active ? "var(--rojo)" : "var(--negro)",
                    borderColor: active ? "var(--rojo)" : "var(--linea)",
                    color: active ? "#ffffff" : "var(--gris-1)",
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Buscar arena esports, cybercafé 240Hz, salón LAN…"
              data-testid="arenas-search-input"
              className="flex-1 bg-[var(--negro)] border border-[var(--linea)] px-3.5 py-2.5 text-sm text-white outline-none focus:border-[var(--rojo)]"
            />
            <button type="submit" className="btn btn-rojo" data-testid="arenas-search-btn">
              <Search className="w-4 h-4" />
              <span>Buscar en Google Maps</span>
            </button>
          </form>

          {routeInfo && (
            <div
              className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 border border-[var(--rojo)] bg-[rgba(255,13,46,0.1)] text-xs"
              data-testid="arenas-route-summary"
            >
              <div className="flex items-center gap-2 text-white font-semibold">
                <Navigation className="w-4 h-4 text-[var(--rojo)]" />
                <span>Ruta hacia {routeInfo.destinationName}:</span>
                <span style={{ fontFamily: "var(--f-mono)" }}>
                  {routeInfo.distanceText} · {routeInfo.durationText}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setRouteInfo(null)}
                className="text-zinc-300 hover:text-white cursor-pointer"
              >
                Cerrar resumen
              </button>
            </div>
          )}

          {mapError && (
            <div
              role="alert"
              className="px-3.5 py-2.5 border text-xs leading-relaxed"
              style={{ borderColor: "rgba(255,13,46,0.45)", background: "rgba(255,13,46,0.1)", color: "#ffd2d8" }}
            >
              {mapError}
            </div>
          )}
        </div>

        {/* Map + Results + Firestore Saved Spots */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8">
            {keyLoading ? (
              <div className="h-[540px] flex items-center justify-center border border-[var(--linea)] bg-[var(--grafito-1)] text-sm muted">
                Cargando configuración de Google Maps Platform…
              </div>
            ) : !apiKey ? (
              <div className="h-[540px] flex flex-col items-center justify-center p-8 text-center border border-[var(--linea)] bg-[var(--grafito-1)] space-y-3">
                <MapPin className="w-8 h-8 text-[var(--rojo)]" />
                <h2 className="d-3 uppercase">Clave de Google Maps no detectada</h2>
                <p className="small muted max-w-md">
                  Configura <code>VITE_GOOGLE_MAPS_API_KEY</code> (o <code>GOOGLE_MAPS_API_KEY</code>) en el entorno para
                  renderizar el mapa interactivo, buscar arenas reales con Places API y trazar rutas con Routes API.
                </p>
              </div>
            ) : (
              <APIProvider apiKey={apiKey} language="es" region="VE" libraries={["marker", "places", "routes"]}>
                <ArenaMapCanvas
                  hub={hub}
                  searchQuery={activeQuery}
                  searchNonce={searchNonce}
                  places={places}
                  onPlacesLoaded={setPlaces}
                  selectedPlace={selectedPlace}
                  onSelectPlace={setSelectedPlace}
                  userOrigin={userOrigin}
                  onRouteInfo={setRouteInfo}
                  onError={setMapError}
                  onSavePlace={(p) => void handleSavePlaceToFirestore(p)}
                />
              </APIProvider>
            )}
          </div>

          <aside className="lg:col-span-4 space-y-5">
            {/* Live Places Results */}
            <div className="panel panel-pad space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="d-3 uppercase">Arenas encontradas</h2>
                <span className="tag">{places.length}</span>
              </div>
              {places.length === 0 ? (
                <p className="small muted">
                  Ejecuta una búsqueda o selecciona una ciudad para ver arenas reales desde Places API (New).
                </p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {places.map((p) => {
                    const active = selectedPlace?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPlace(p)}
                        className="w-full text-left p-3 border transition-colors cursor-pointer"
                        style={{
                          background: active ? "var(--grafito-2)" : "var(--negro)",
                          borderColor: active ? "var(--rojo)" : "var(--linea-suave)",
                        }}
                      >
                        <div className="text-xs font-semibold text-white">{p.displayName}</div>
                        {p.formattedAddress && (
                          <div className="text-[11px] muted line-clamp-2 mt-0.5">{p.formattedAddress}</div>
                        )}
                        {typeof p.rating === "number" && (
                          <div className="text-[11px] text-amber-400 mt-1" style={{ fontFamily: "var(--f-mono)" }}>
                            ★ {p.rating.toFixed(1)} {p.userRatingCount ? `(${p.userRatingCount})` : ""}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Firestore Saved Arena Spots */}
            <div className="panel panel-pad space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="d-3 uppercase">Mis Sedes (Firestore)</h2>
                <Bookmark className="w-4 h-4 text-[var(--rojo)]" />
              </div>

              <div className="grid grid-cols-1 gap-2">
                <input
                  type="text"
                  value={spotNote}
                  onChange={(e) => setSpotNote(e.target.value)}
                  placeholder="Nota personal antes de guardar (ej: 240Hz / LAN CS2)"
                  className="bg-[var(--negro)] border border-[var(--linea)] px-2.5 py-1.5 text-xs text-white"
                />
                <select
                  value={spotGame}
                  onChange={(e) => setSpotGame(e.target.value)}
                  aria-label="Juego principal de la sede"
                  className="bg-[var(--negro)] border border-[var(--linea)] px-2.5 py-1.5 text-xs text-white"
                >
                  {JUEGOS.map((j) => (
                    <option key={j.slug} value={j.slug}>
                      {j.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {!fbUser ? (
                <p className="text-xs muted">
                  Conecta tu cuenta de Google para guardar tus Place IDs y notas tácticas de sedes LAN en Firestore.
                </p>
              ) : savedSpots.length === 0 ? (
                <p className="text-xs muted">
                  Selecciona cualquier marcador en el mapa y pulsa «Guardar sede».
                </p>
              ) : (
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {savedSpots.map((spot) => (
                    <div key={spot.id} className="p-2.5 border border-[var(--linea-suave)] bg-[var(--negro)] space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.userLabel)}&query_place_id=${encodeURIComponent(spot.placeId)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-white hover:text-[var(--rojo)] underline underline-offset-2"
                        >
                          {spot.userLabel}
                        </a>
                        <button
                          type="button"
                          onClick={() => fbUser.uid && void deleteArenaSpot(fbUser.uid, spot.id)}
                          aria-label="Eliminar sede guardada"
                          className="text-zinc-500 hover:text-[var(--rojo)] cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {spot.userNote && <p className="text-[11px] muted">{spot.userNote}</p>}
                      <div className="text-[10px] uppercase muted" style={{ fontFamily: "var(--f-mono)" }}>
                        {spot.gameSlug || "esports"} · Place ID guardado
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
