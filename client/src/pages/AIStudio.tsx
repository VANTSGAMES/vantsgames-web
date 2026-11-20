import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Globe,
  MapPin,
  Mic,
  Square,
  Send,
  Image as ImageIcon,
  Music,
  Bookmark,
  Trash2,
  Upload,
  Download,
  Sparkles,
  LogIn,
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
  deleteAiSession,
  deleteVoiceNote,
  saveAiSession,
  saveVoiceNote,
  subscribeAiSessions,
  subscribeVoiceNotes,
  type SavedAiSession,
  type SavedVoiceNote,
} from "@/lib/firestoreClient";
import {
  AI_MODELS,
  dedupeGroundingSources,
  resolveEffectiveModel,
  sanitizeChatHistory,
  type StudioGroundingSource,
  type StudioModeId,
  type StudioModelId,
} from "@/lib/studioHelpers";
import type { User } from "firebase/auth";

interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  model?: string;
  mode?: StudioModeId;
  sources?: StudioGroundingSource[];
  searchQueries?: string[];
}

const STARTER_PROMPTS: { label: string; mode: StudioModeId; text: string }[] = [
  {
    label: "Táctica VALORANT Ascent",
    mode: "coach",
    text: "Dame un plan táctico de 3 rondas en ataque para Ascent en VALORANT con composición estándar de torneo.",
  },
  {
    label: "Noticias CS2 (Search)",
    mode: "search",
    text: "¿Cuáles son los cambios recientes más importantes en el competitivo actual de Counter-Strike 2?",
  },
  {
    label: "Arenas LAN cercanas (Maps)",
    mode: "maps",
    text: "Busca cybercafés, arenas gaming o lugares para jugar torneos LAN en Caracas con buenas reseñas.",
  },
];

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo multimedia."));
    reader.readAsDataURL(blob);
  });
}

function InlineAlert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="px-3.5 py-2.5 border text-xs leading-relaxed"
      style={{ borderColor: "rgba(255,13,46,0.45)", background: "rgba(255,13,46,0.1)", color: "#ffd2d8" }}
    >
      {message}
    </div>
  );
}

export default function AIStudio() {
  const { toast } = useFeedback();
  const notify = (title: string, kind: "ok" | "error" | "info" = "info") => toast({ kind, title });
  const [tab, setTab] = useState<"coach" | "voz" | "media">("coach");

  // Firebase Auth & Firestore persistence
  const [fbUser, setFbUser] = useState<User | null>(firebaseAuth.currentUser);
  const [savedSessions, setSavedSessions] = useState<SavedAiSession[]>([]);
  const [savedVoiceNotes, setSavedVoiceNotes] = useState<SavedVoiceNote[]>([]);
  const [signingIn, setSigningIn] = useState(false);

  // Coach & Grounding state
  const [model, setModel] = useState<StudioModelId>("gemini-4-hydrogen");
  const [mode, setMode] = useState<StudioModeId>("coach");
  const [useGeo, setUseGeo] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "model",
      text: "Bienvenido a VANTS AI Studio. Elige entre Coach táctico, Google Search en vivo o Google Maps para scouting de sedes LAN. También puedes dictar con micrófono o guardar tus sesiones en Firestore.",
      model: "gemini-4-hydrogen",
      mode: "coach",
    },
  ]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Voice transcription state (shared for inline dictation + Voz tab)
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [voiceTitle, setVoiceTitle] = useState("");
  const [voiceGame, setVoiceGame] = useState("valorant");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const recordTargetRef = useRef<"chat" | "voice">("voice");

  // Image Studio state (gemini-nano-banana-2.1)
  const [imgPrompt, setImgPrompt] = useState(
    "Esports tournament banner in dark obsidian and crimson red (#FF0D2E), futuristic stage lighting, angular metallic trophy silhouette, ultra crisp typography-free editorial composition",
  );
  const [imgRatio, setImgRatio] = useState("16:9");
  const [imgSize, setImgSize] = useState("1K");
  const [sourceImageBase64, setSourceImageBase64] = useState<string | null>(null);
  const [sourceMimeType, setSourceMimeType] = useState<string>("image/png");
  const [sourceImageName, setSourceImageName] = useState<string>("");
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [generatedImageText, setGeneratedImageText] = useState<string>("");
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);

  // Music Studio state (Lyria 3)
  const [musicPrompt, setMusicPrompt] = useState(
    "High-energy competitive esports tournament walkout anthem, 132 BPM, punchy analog synth bass, driving cinematic percussion, dramatic build-up and drop, instrumental",
  );
  const [musicMode, setMusicMode] = useState<"clip" | "pro">("clip");
  const [musicAudioUrl, setMusicAudioUrl] = useState<string | null>(null);
  const [musicLyrics, setMusicLyrics] = useState<string>("");
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicError, setMusicError] = useState<string | null>(null);

  useEffect(() => {
    return initWorkspaceAuth(
      (u) => setFbUser(u),
      () => {
        setFbUser(null);
        setSavedSessions([]);
        setSavedVoiceNotes([]);
      },
    );
  }, []);

  useEffect(() => {
    if (!fbUser?.uid) return;
    const unsubSessions = subscribeAiSessions(fbUser.uid, setSavedSessions);
    const unsubNotes = subscribeVoiceNotes(fbUser.uid, setSavedVoiceNotes);
    return () => {
      unsubSessions();
      unsubNotes();
    };
  }, [fbUser?.uid]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, chatLoading]);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const handleGoogleLogin = async () => {
    setSigningIn(true);
    try {
      const { user } = await signInWithGoogleWorkspace();
      setFbUser(user);
      notify("Sesión conectada con Google · Firestore listo para guardar tus sesiones.", "ok");
    } catch (err: any) {
      notify(err?.message || "No se pudo iniciar sesión con Google.", "error");
    } finally {
      setSigningIn(false);
    }
  };

  const requestGeolocation = () => {
    if (!navigator.geolocation) {
      notify("Tu navegador no soporta geolocalización.", "error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setUseGeo(true);
        notify("Ubicación activada para Google Maps Grounding.", "ok");
      },
      () => {
        setUseGeo(false);
        notify("No se otorgó permiso de ubicación; Google Maps buscará según tu consulta.", "info");
      },
      { timeout: 8000 },
    );
  };

  const sendMessage = async (overrideText?: string, overrideMode?: StudioModeId) => {
    const textToSend = (overrideText ?? input).trim();
    const activeMode = overrideMode ?? mode;
    if (!textToSend || chatLoading) return;

    const effectiveModel = resolveEffectiveModel(model, activeMode);
    if (overrideMode) setMode(overrideMode);
    setChatError(null);
    setInput("");

    const userMsg: ChatMessage = {
      id: "u-" + Date.now(),
      role: "user",
      text: textToSend,
      mode: activeMode,
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setChatLoading(true);

    try {
      const history = sanitizeChatHistory(
        messages
          .filter((m) => m.id !== "welcome")
          .map((m) => ({ role: m.role, text: m.text })),
      );
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: effectiveModel,
          mode: activeMode,
          message: textToSend,
          history,
          location: activeMode === "maps" && useGeo && coords ? coords : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Error HTTP ${res.status}`);
      }
      const replyMsg: ChatMessage = {
        id: "m-" + Date.now(),
        role: "model",
        text: data.reply || "",
        model: data.model || effectiveModel,
        mode: activeMode,
        sources: dedupeGroundingSources(Array.isArray(data.sources) ? data.sources : []),
        searchQueries: Array.isArray(data.searchQueries) ? data.searchQueries : [],
      };
      setMessages((prev) => [...prev, replyMsg]);
    } catch (err: any) {
      setChatError(err?.message || "No se pudo obtener respuesta de Gemini.");
    } finally {
      setChatLoading(false);
    }
  };

  const handleSaveSessionToFirestore = async () => {
    if (!fbUser?.uid) {
      notify("Inicia sesión con Google para guardar esta sesión en Firestore.", "info");
      return;
    }
    const realTurns = messages.filter((m) => m.id !== "welcome");
    if (realTurns.length === 0) {
      notify("Envía al menos una consulta antes de guardar la sesión.", "info");
      return;
    }
    const firstUser = realTurns.find((m) => m.role === "user")?.text || "Sesión VANTS Coach";
    const lastModel = [...realTurns].reverse().find((m) => m.role === "model")?.text || firstUser;
    try {
      await saveAiSession(fbUser.uid, {
        title: firstUser.slice(0, 120),
        model: resolveEffectiveModel(model, mode),
        mode,
        summary: lastModel.slice(0, 3800),
        messageCount: realTurns.length,
      });
      notify("Sesión guardada en tu historial de Firestore.", "ok");
    } catch (err: any) {
      notify(err?.message || "No se pudo guardar la sesión en Firestore.", "error");
    }
  };

  const startRecording = async (target: "chat" | "voice") => {
    setVoiceError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceError("Tu navegador no soporta grabación de micrófono (MediaRecorder). Puedes subir un archivo de audio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      recordTargetRef.current = target;
      audioChunksRef.current = [];
      setRecordSeconds(0);

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordTimerRef.current) {
          window.clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        const mime = (recorder.mimeType || "audio/webm").split(";")[0];
        const blob = new Blob(audioChunksRef.current, { type: mime });
        if (blob.size < 100) return;
        await transcribeAudioBlob(blob, mime, recordTargetRef.current);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err: any) {
      setVoiceError(err?.message || "No se pudo acceder al micrófono. Revisa los permisos del navegador.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  const transcribeAudioBlob = async (blob: Blob, mimeType: string, target: "chat" | "voice") => {
    setTranscribing(true);
    setVoiceError(null);
    try {
      const audioBase64 = await blobToBase64(blob);
      const res = await fetch("/api/ai/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64, mimeType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Error HTTP ${res.status}`);
      const text = String(data.transcript || "").trim();
      if (target === "chat") {
        setInput((prev) => (prev ? `${prev} ${text}` : text));
        notify("Audio transcrito en tu barra de consulta.", "ok");
      } else {
        setTranscript(text);
        if (!voiceTitle) setVoiceTitle(`Nota táctica (${new Date().toLocaleDateString("es-VE")})`);
        notify("Audio transcrito con gemini-3.5-transcribe.", "ok");
      }
    } catch (err: any) {
      setVoiceError(err?.message || "No se pudo transcribir el audio.");
    } finally {
      setTranscribing(false);
    }
  };

  const handleUploadAudioFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setVoiceError("El archivo supera el límite de 15 MB.");
      return;
    }
    const mime = file.type && file.type.startsWith("audio/") ? file.type : "audio/mp3";
    setRecordSeconds(0);
    await transcribeAudioBlob(file, mime, "voice");
    e.target.value = "";
  };

  const handleSaveVoiceNote = async () => {
    if (!fbUser?.uid) {
      notify("Inicia sesión con Google para guardar notas de voz en Firestore.", "info");
      return;
    }
    if (!transcript.trim()) {
      notify("Primero graba o sube un audio para transcribir.", "info");
      return;
    }
    try {
      await saveVoiceNote(fbUser.uid, {
        title: (voiceTitle || "Nota táctica de voz").trim(),
        transcript: transcript.trim(),
        gameSlug: voiceGame || null,
        durationSec: recordSeconds,
      });
      setVoiceTitle("");
      setTranscript("");
      notify("Nota de voz guardada en Firestore.", "ok");
    } catch (err: any) {
      notify(err?.message || "No se pudo guardar la nota de voz.", "error");
    }
  };

  const handleUploadBaseImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      setImgError("Usa una imagen PNG, JPEG o WebP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setImgError("La imagen base supera 10 MB.");
      return;
    }
    setImgError(null);
    const b64 = await blobToBase64(file);
    setSourceImageBase64(b64);
    setSourceMimeType(file.type);
    setSourceImageName(file.name);
    e.target.value = "";
  };

  const handleGenerateImage = async () => {
    if (!imgPrompt.trim() || imgLoading) return;
    setImgLoading(true);
    setImgError(null);
    try {
      const res = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: imgPrompt.trim(),
          aspectRatio: imgRatio,
          imageSize: imgSize,
          sourceImageBase64,
          sourceMimeType,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Error HTTP ${res.status}`);
      setGeneratedImageUrl(data.imageDataUrl);
      setGeneratedImageText(data.text || "");
      notify("Arte generado con gemini-nano-banana-2.1.", "ok");
    } catch (err: any) {
      setImgError(err?.message || "No se pudo generar la imagen.");
    } finally {
      setImgLoading(false);
    }
  };

  const handleGenerateMusic = async () => {
    if (!musicPrompt.trim() || musicLoading) return;
    setMusicLoading(true);
    setMusicError(null);
    try {
      const res = await fetch("/api/ai/music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: musicPrompt.trim(),
          mode: musicMode,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Error HTTP ${res.status}`);
      setMusicAudioUrl(data.audioDataUrl);
      setMusicLyrics(data.lyrics || "");
      notify("Track generado con Lyria 3.", "ok");
    } catch (err: any) {
      setMusicError(err?.message || "No se pudo generar la pista de audio.");
    } finally {
      setMusicLoading(false);
    }
  };

  const effectiveModel = resolveEffectiveModel(model, mode);

  return (
    <div className="pb-14" data-testid="ai-studio-page">
      <PageHead
        eyebrow="VANTS AI STUDIO · GEMINI SERVER-SIDE + FIRESTORE"
        title="Coach Táctico, Voz y Media"
        lead="Asistente competitivo multi-turno con Google Search y Google Maps Grounding, transcripción de voz, generación de banners y pistas musicales para torneos."
        actions={
          fbUser ? (
            <div className="flex items-center gap-2.5 px-3 py-2 border border-[var(--linea)] bg-[var(--grafito-1)] text-xs">
              <span className="w-2 h-2 bg-emerald-400 inline-block" />
              <span className="truncate max-w-[180px]" style={{ fontFamily: "var(--f-mono)" }}>
                {fbUser.email || fbUser.displayName}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={signingIn}
              className="btn btn-rojo"
              data-testid="ai-studio-google-signin"
            >
              <LogIn className="w-4 h-4" />
              <span>{signingIn ? "Conectando…" : "Conectar Google (Firestore)"}</span>
            </button>
          )
        }
      />

      <div className="wrap space-y-6">
        {/* Studio Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-[var(--linea-suave)] pb-3" role="tablist">
          {[
            { id: "coach" as const, label: "Coach & Grounding", icon: Bot },
            { id: "voz" as const, label: "Voz a Notas (Transcribe)", icon: Mic },
            { id: "media" as const, label: "Arte & Música (Nano Banana + Lyria)", icon: Sparkles },
          ].map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                data-testid={`ai-tab-${item.id}`}
                className={`btn btn-sm ${active ? "btn-rojo" : ""}`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: COACH & GROUNDING */}
        {tab === "coach" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 panel panel-pad flex flex-col gap-4">
            {/* Mode & Model Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--linea-suave)]">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: "coach" as const, label: "Coach táctico", icon: Bot },
                  { id: "search" as const, label: "Google Search", icon: Globe },
                  { id: "maps" as const, label: "Google Maps", icon: MapPin },
                ].map((m) => {
                  const Icon = m.icon;
                  const active = mode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id)}
                      data-testid={`ai-mode-${m.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border transition-colors cursor-pointer"
                      style={{
                        background: active ? "var(--rojo)" : "var(--grafito-2)",
                        borderColor: active ? "var(--rojo)" : "var(--linea)",
                        color: active ? "#fff" : "var(--gris-1)",
                      }}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {mode === "maps" && (
                  <button
                    type="button"
                    onClick={requestGeolocation}
                    className="tag cursor-pointer hover:text-white"
                    data-testid="ai-maps-geo-btn"
                  >
                    <MapPin className="w-3 h-3 inline mr-1" />
                    {useGeo ? "Ubicación activa" : "Usar mi ubicación"}
                  </button>
                )}
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value as StudioModelId)}
                  aria-label="Modelo Gemini"
                  data-testid="ai-model-select"
                  className="bg-[var(--negro)] border border-[var(--linea)] px-2.5 py-1.5 text-xs text-white"
                  style={{ fontFamily: "var(--f-mono)" }}
                >
                  {AI_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.badge})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {effectiveModel !== model && (
              <div className="text-xs px-3 py-2 border border-amber-500/40 bg-amber-500/10 text-amber-200">
                El modo {mode === "search" ? "Google Search" : "Google Maps"} usa automáticamente{" "}
                <strong>{effectiveModel}</strong> para garantizar citas verificadas.
              </div>
            )}

            {/* Quick Starters */}
            <div className="flex flex-wrap gap-2">
              {STARTER_PROMPTS.map((sp) => (
                <button
                  key={sp.label}
                  type="button"
                  onClick={() => void sendMessage(sp.text, sp.mode)}
                  disabled={chatLoading}
                  className="text-xs px-2.5 py-1.5 border border-[var(--linea)] bg-[var(--negro)] text-zinc-300 hover:border-[var(--rojo)] hover:text-white transition-colors cursor-pointer"
                >
                  {sp.label}
                </button>
              ))}
            </div>

            {/* Scrollable Chat Thread */}
            <div
              ref={chatScrollRef}
              role="log"
              aria-live="polite"
              data-testid="ai-chat-thread"
              className="h-[330px] overflow-y-auto space-y-4 pr-1 border border-[var(--linea-suave)] bg-[var(--negro)] p-4"
            >
              {messages.map((msg) => {
                const isUser = msg.role === "user";
                return (
                  <div key={msg.id} className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
                    <div
                      className="max-w-[90%] px-4 py-3 border text-sm whitespace-pre-wrap leading-relaxed"
                      style={{
                        background: isUser ? "rgba(255, 13, 46, 0.14)" : "var(--grafito-1)",
                        borderColor: isUser ? "rgba(255, 13, 46, 0.45)" : "var(--linea)",
                        color: "var(--blanco)",
                      }}
                    >
                      <div
                        className="text-[10px] uppercase tracking-widest mb-1.5 flex items-center gap-2"
                        style={{ color: isUser ? "#ff7083" : "var(--gris-2)", fontFamily: "var(--f-mono)" }}
                      >
                        <span>{isUser ? "Tú" : "VANTS Coach"}</span>
                        {msg.model && <span>· {msg.model}</span>}
                        {msg.mode && msg.mode !== "coach" && (
                          <span className="text-[var(--rojo)]">· {msg.mode.toUpperCase()}</span>
                        )}
                      </div>
                      <div>{msg.text}</div>

                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-[var(--linea-suave)] space-y-2">
                          <div className="text-[10px] uppercase tracking-widest muted" style={{ fontFamily: "var(--f-mono)" }}>
                            Fuentes verificadas ({msg.sources.length})
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {msg.sources.map((src) => (
                              <div key={src.uri} className="text-xs border border-[var(--linea-suave)] bg-[var(--negro)] px-2.5 py-2">
                                <a
                                  href={src.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 font-semibold text-zinc-100 hover:text-[var(--rojo)] underline underline-offset-2"
                                >
                                  {src.type === "maps" ? (
                                    <MapPin className="w-3.5 h-3.5 text-[var(--rojo)] shrink-0" />
                                  ) : (
                                    <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                  )}
                                  <span>{src.title}</span>
                                </a>
                                {src.snippets && src.snippets.length > 0 && (
                                  <ul className="mt-1 space-y-1 text-[11px] muted pl-5 list-disc">
                                    {src.snippets.map((snip, idx) => (
                                      <li key={idx}>«{snip}»</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {chatLoading && (
                <div className="text-xs muted px-2" style={{ fontFamily: "var(--f-mono)" }}>
                  Consultando a {effectiveModel}
                  {mode === "search" ? " con Google Search…" : mode === "maps" ? " con Google Maps…" : "…"}
                </div>
              )}
            </div>

            {chatError && <InlineAlert message={chatError} />}

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessage();
              }}
              className="flex flex-col sm:flex-row gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  mode === "maps"
                    ? "Ej: Cybercafés esports o arenas LAN en Caracas / Valencia…"
                    : mode === "search"
                      ? "Ej: Último parche competitivo de VALORANT o ranking CS2…"
                      : "Pregunta táctica, economía, composición o plan de entrenamiento…"
                }
                disabled={chatLoading}
                data-testid="ai-chat-input"
                className="flex-1 bg-[var(--negro)] border border-[var(--linea)] px-3.5 py-2.5 text-sm text-white outline-none focus:border-[var(--rojo)]"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => (recording ? stopRecording() : void startRecording("chat"))}
                  disabled={transcribing || chatLoading}
                  title="Dictar consulta por micrófono"
                  className="btn px-3"
                  data-testid="ai-chat-mic-btn"
                >
                  {recording ? <Square className="w-4 h-4 text-[var(--rojo)]" /> : <Mic className="w-4 h-4" />}
                </button>
                <button
                  type="submit"
                  disabled={chatLoading || !input.trim()}
                  className="btn btn-rojo"
                  data-testid="ai-chat-send-btn"
                >
                  <Send className="w-4 h-4" />
                  <span>Enviar</span>
                </button>
              </div>
            </form>
          </div>

          {/* Right Panel: Firestore Saved Sessions */}
          <aside className="lg:col-span-4 panel panel-pad space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="d-3 uppercase">Sesiones Firestore</h2>
              <button
                type="button"
                onClick={() => void handleSaveSessionToFirestore()}
                className="btn btn-sm"
                data-testid="ai-save-session-btn"
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>Guardar actual</span>
              </button>
            </div>

            {!fbUser ? (
              <div className="p-4 border border-[var(--linea-suave)] bg-[var(--negro)] text-xs muted space-y-3">
                <p>Conecta tu cuenta de Google para guardar tus análisis tácticos y notas de voz de forma privada en Firestore.</p>
                <button type="button" onClick={handleGoogleLogin} className="btn btn-rojo btn-sm w-full">
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Conectar con Google</span>
                </button>
              </div>
            ) : savedSessions.length === 0 ? (
              <p className="small muted">
                Aún no has guardado sesiones. Envía una consulta al Coach y pulsa «Guardar actual».
              </p>
            ) : (
              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {savedSessions.map((s) => (
                  <div key={s.id} className="p-3 border border-[var(--linea-suave)] bg-[var(--negro)] space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-semibold text-white line-clamp-2">{s.title}</div>
                      <button
                        type="button"
                        onClick={() => fbUser.uid && void deleteAiSession(fbUser.uid, s.id)}
                        aria-label="Eliminar sesión"
                        className="text-zinc-500 hover:text-[var(--rojo)] cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="text-[10px] uppercase muted" style={{ fontFamily: "var(--f-mono)" }}>
                      {s.mode} · {s.model} · {s.messageCount} msgs
                    </div>
                    <p className="text-xs text-zinc-300 line-clamp-3">{s.summary}</p>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}

      {/* TAB 2: VOICE TO NOTES (gemini-3.5-transcribe) */}
      {tab === "voz" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 panel panel-pad space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="d-3 uppercase">Transcripción con gemini-3.5-transcribe</h2>
                <p className="small muted">Graba llamadas tácticas, resúmenes post-scrim o sube un audio (MP3, WAV, WebM).</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => (recording ? stopRecording() : void startRecording("voice"))}
                  disabled={transcribing}
                  className={`btn btn-sm ${recording ? "btn-rojo" : ""}`}
                  data-testid="voice-record-btn"
                >
                  {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  <span>{recording ? `Detener (${recordSeconds}s)` : "Grabar micrófono"}</span>
                </button>
                <label className="btn btn-sm cursor-pointer">
                  <Upload className="w-4 h-4" />
                  <span>Subir audio</span>
                  <input type="file" accept="audio/*" onChange={handleUploadAudioFile} className="hidden" />
                </label>
              </div>
            </div>

            {voiceError && <InlineAlert message={voiceError} />}
            {transcribing && (
              <div className="text-xs text-zinc-300" style={{ fontFamily: "var(--f-mono)" }}>
                Transcribiendo audio con gemini-3.5-transcribe…
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={voiceTitle}
                onChange={(e) => setVoiceTitle(e.target.value)}
                placeholder="Título de la nota (ej: Review scrim Lotus)"
                className="bg-[var(--negro)] border border-[var(--linea)] px-3 py-2 text-sm text-white"
              />
              <select
                value={voiceGame}
                onChange={(e) => setVoiceGame(e.target.value)}
                aria-label="Juego de la nota"
                className="bg-[var(--negro)] border border-[var(--linea)] px-3 py-2 text-sm text-white"
              >
                {JUEGOS.map((j) => (
                  <option key={j.slug} value={j.slug}>
                    {j.nombre}
                  </option>
                ))}
              </select>
            </div>

            <textarea
              rows={7}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Aquí aparecerá la transcripción automática de tu grabación o archivo de audio…"
              data-testid="voice-transcript-textarea"
              className="w-full bg-[var(--negro)] border border-[var(--linea)] p-3.5 text-sm text-white leading-relaxed"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleSaveVoiceNote()}
                disabled={!transcript.trim()}
                className="btn btn-rojo btn-sm"
              >
                <Bookmark className="w-4 h-4" />
                <span>Guardar en Firestore</span>
              </button>
              <button
                type="button"
                disabled={!transcript.trim()}
                onClick={() => {
                  setInput(transcript.trim());
                  setTab("coach");
                }}
                className="btn btn-sm"
              >
                <Bot className="w-4 h-4" />
                <span>Analizar con VANTS Coach</span>
              </button>
            </div>
          </div>

          <aside className="lg:col-span-5 panel panel-pad space-y-3">
            <h2 className="d-3 uppercase">Notas de voz guardadas</h2>
            {!fbUser ? (
              <p className="small muted">Conecta Google arriba para sincronizar tus notas de voz en Firestore.</p>
            ) : savedVoiceNotes.length === 0 ? (
              <p className="small muted">Sin notas de voz guardadas todavía.</p>
            ) : (
              <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                {savedVoiceNotes.map((n) => (
                  <div key={n.id} className="p-3 border border-[var(--linea-suave)] bg-[var(--negro)] space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-semibold text-white">{n.title}</div>
                      <button
                        type="button"
                        onClick={() => fbUser.uid && void deleteVoiceNote(fbUser.uid, n.id)}
                        aria-label="Eliminar nota de voz"
                        className="text-zinc-500 hover:text-[var(--rojo)] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="text-[10px] uppercase muted" style={{ fontFamily: "var(--f-mono)" }}>
                      {n.gameSlug || "general"} · {n.durationSec}s
                    </div>
                    <p className="text-xs text-zinc-300 whitespace-pre-wrap line-clamp-4">{n.transcript}</p>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}

      {/* TAB 3: IMAGE & MUSIC STUDIO */}
      {tab === "media" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Image Generation & Editing */}
          <div className="panel panel-pad space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-[var(--rojo)]" />
                <h2 className="d-3 uppercase">Arte & Banners (Nano Banana 2.1)</h2>
              </div>
              <span className="tag">gemini-nano-banana-2.1</span>
            </div>

            <textarea
              rows={3}
              value={imgPrompt}
              onChange={(e) => setImgPrompt(e.target.value)}
              placeholder="Describe tu banner de torneo, escudo de equipo o la edición a aplicar sobre tu imagen…"
              data-testid="ai-image-prompt"
              className="w-full bg-[var(--negro)] border border-[var(--linea)] p-3 text-sm text-white"
            />

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={imgRatio}
                onChange={(e) => setImgRatio(e.target.value)}
                aria-label="Relación de aspecto"
                className="bg-[var(--negro)] border border-[var(--linea)] px-2.5 py-1.5 text-xs text-white"
              >
                <option value="16:9">16:9 Banner</option>
                <option value="1:1">1:1 Avatar / Logo</option>
                <option value="9:16">9:16 Vertical / Story</option>
                <option value="4:3">4:3 Tarjeta</option>
              </select>
              <select
                value={imgSize}
                onChange={(e) => setImgSize(e.target.value)}
                aria-label="Resolución"
                className="bg-[var(--negro)] border border-[var(--linea)] px-2.5 py-1.5 text-xs text-white"
              >
                <option value="1K">1K Estándar</option>
                <option value="2K">2K Alta definición</option>
              </select>
              <label className="btn btn-sm cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>{sourceImageName ? `Base: ${sourceImageName.slice(0, 14)}` : "Imagen base (editar)"}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleUploadBaseImage} className="hidden" />
              </label>
              {sourceImageBase64 && (
                <button
                  type="button"
                  onClick={() => {
                    setSourceImageBase64(null);
                    setSourceImageName("");
                  }}
                  className="text-xs text-zinc-400 hover:text-white cursor-pointer"
                >
                  Quitar base
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => void handleGenerateImage()}
              disabled={imgLoading || !imgPrompt.trim()}
              className="btn btn-rojo w-full"
              data-testid="ai-image-generate-btn"
            >
              <Sparkles className="w-4 h-4" />
              <span>{imgLoading ? "Generando imagen…" : sourceImageBase64 ? "Editar imagen" : "Generar banner"}</span>
            </button>

            {imgError && <InlineAlert message={imgError} />}

            {generatedImageUrl && (
              <div className="space-y-2 border border-[var(--linea)] p-2 bg-[var(--negro)]">
                <img src={generatedImageUrl} alt="Arte generado por VANTS AI Studio" className="w-full h-auto block" />
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="text-xs muted truncate">{generatedImageText || `${imgRatio} · ${imgSize}`}</span>
                  <a
                    href={generatedImageUrl}
                    download="vants-ai-art.png"
                    className="btn btn-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar</span>
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Music Generation (Lyria 3) */}
          <div className="panel panel-pad space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Music className="w-5 h-5 text-[var(--rojo)]" />
                <h2 className="d-3 uppercase">Música de Torneo (Lyria 3)</h2>
              </div>
              <span className="tag">{musicMode === "pro" ? "lyria-3-pro" : "lyria-3-clip"}</span>
            </div>

            <textarea
              rows={3}
              value={musicPrompt}
              onChange={(e) => setMusicPrompt(e.target.value)}
              placeholder="Describe género, BPM, energía, instrumentos o letra para la intro de tu torneo…"
              data-testid="ai-music-prompt"
              className="w-full bg-[var(--negro)] border border-[var(--linea)] p-3 text-sm text-white"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMusicMode("clip")}
                className={`btn btn-sm ${musicMode === "clip" ? "btn-rojo" : ""}`}
              >
                Clip rápido (30s)
              </button>
              <button
                type="button"
                onClick={() => setMusicMode("pro")}
                className={`btn btn-sm ${musicMode === "pro" ? "btn-rojo" : ""}`}
              >
                Track completo (Pro)
              </button>
            </div>

            <button
              type="button"
              onClick={() => void handleGenerateMusic()}
              disabled={musicLoading || !musicPrompt.trim()}
              className="btn btn-rojo w-full"
              data-testid="ai-music-generate-btn"
            >
              <Music className="w-4 h-4" />
              <span>{musicLoading ? "Componiendo con Lyria 3…" : "Generar pista de audio"}</span>
            </button>

            {musicError && <InlineAlert message={musicError} />}

            {musicAudioUrl && (
              <div className="space-y-3 border border-[var(--linea)] p-3 bg-[var(--negro)]">
                <audio controls src={musicAudioUrl} className="w-full" />
                <div className="flex justify-end">
                  <a href={musicAudioUrl} download="vants-lyria-track.mp3" className="btn btn-sm">
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar MP3</span>
                  </a>
                </div>
                {musicLyrics && (
                  <pre className="text-xs muted whitespace-pre-wrap border-t border-[var(--linea-suave)] pt-2">
                    {musicLyrics}
                  </pre>
                )}
              </div>
            )}

            <p className="text-xs muted">
              Nota: Los modelos de generación multimedia (<code>gemini-nano-banana-2.1</code> y <code>lyria-3</code>)
              requieren una clave de API de Gemini con facturación activa en Settings &gt; Secrets.
            </p>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
