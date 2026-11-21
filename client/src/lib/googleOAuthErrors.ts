export interface AuthErrorDetail {
  code: string;
  title: string;
  description: string;
  needsHostConfig: boolean;
  actionHint?: string;
}

export function classifyGoogleOAuthError(
  rawCode: string,
  rawMessage = "",
  hostname = "",
): AuthErrorDetail {
  const code = (rawCode || "unknown").toLowerCase().trim();
  const host = hostname.trim() || "este dominio";

  switch (code) {
    case "popup_closed":
      return {
        code,
        title: "Inicio de sesión cancelado",
        description: "Cerraste la ventana de Google antes de completar el acceso. Pulsa de nuevo para conectarte.",
        needsHostConfig: false,
      };

    case "popup_failed_to_open":
      return {
        code,
        title: "Ventana emergente bloqueada",
        description: "Tu navegador bloqueó la ventana de Google. Permite ventanas emergentes para este sitio e inténtalo de nuevo.",
        needsHostConfig: false,
      };

    case "access_denied":
      return {
        code,
        title: "Permisos no concedidos",
        description: "No se concedieron los permisos de Google Workspace. Vuelve a intentarlo cuando desees conectar tu cuenta.",
        needsHostConfig: false,
      };

    case "gsi_script_blocked":
      return {
        code,
        title: "No se pudo cargar Google Sign-In",
        description: `El navegador bloqueó el script oficial de Google Identity Services en «${host}» (generalmente por una política CSP estricta o bloqueador de scripts).`,
        needsHostConfig: true,
        actionHint: `En Cloudflare/servidor agrega https://accounts.google.com y https://apis.google.com en script-src dentro de Content-Security-Policy.`,
      };

    case "origin_mismatch":
    case "invalid_client":
      return {
        code,
        title: "Origen no autorizado en Google OAuth",
        description: `El origen «https://${host}» no está registrado en el cliente OAuth 2.0 de Google Cloud.`,
        needsHostConfig: true,
        actionHint: `Agrega «https://${host}» en Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID → Authorized JavaScript origins.`,
      };

    default:
      return {
        code,
        title: "No se completó el acceso con Google",
        description: rawMessage || "Ocurrió un error al autenticar con Google. Inténtalo de nuevo.",
        needsHostConfig: false,
      };
  }
}
