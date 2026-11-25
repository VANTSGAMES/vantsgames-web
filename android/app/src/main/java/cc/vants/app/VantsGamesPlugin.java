package cc.vants.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import androidx.activity.result.ActivityResult;
import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsIntent;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.games.GamesSignInClient;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;
import com.google.android.gms.games.Player;
import com.google.android.gms.games.PlayerLevel;
import com.google.android.gms.games.PlayerLevelInfo;
import com.google.android.gms.games.PlayersClient;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "VantsGames")
public class VantsGamesPlugin extends Plugin {

    private static final String TAG = "VantsGamesPlugin";
    private static final int RC_PLAY_GAMES_UI = 9104;
    private static volatile VantsGamesPlugin activeInstance = null;
    private static volatile String pendingAuthCallbackUrl = null;

    private boolean playGamesInitialized = false;
    private final ExecutorService bgExecutor = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        super.load();
        activeInstance = this;
        initPlayGames();
    }

    public static void onNativeAuthRedirect(Uri uri) {
        if (uri == null) return;
        String scheme = uri.getScheme();
        if (scheme == null || !"cc.vants.app".equalsIgnoreCase(scheme)) return;
        String fullUrl = uri.toString();
        pendingAuthCallbackUrl = fullUrl;
        VantsGamesPlugin inst = activeInstance;
        if (inst != null) {
            inst.emitAuthRedirect(uri);
        }
    }

    private void emitAuthRedirect(Uri uri) {
        try {
            JSObject payload = new JSObject();
            payload.put("url", uri.toString());
            String rt = uri.getQueryParameter("rt");
            String returnTo = uri.getQueryParameter("returnTo");
            String authError = uri.getQueryParameter("auth_error");
            if (rt != null) payload.put("rt", rt);
            if (returnTo != null) payload.put("returnTo", returnTo);
            if (authError != null) payload.put("authError", authError);
            pendingAuthCallbackUrl = null;
            notifyListeners("nativeAuthCallback", payload, true);
        } catch (Throwable t) {
            Log.w(TAG, "Error emitiendo nativeAuthCallback: " + t.getMessage());
        }
    }

    @PluginMethod
    public void consumePendingAuthRedirect(PluginCall call) {
        JSObject res = new JSObject();
        String pending = pendingAuthCallbackUrl;
        pendingAuthCallbackUrl = null;
        if (pending != null && !pending.isEmpty()) {
            Uri uri = Uri.parse(pending);
            res.put("hasCallback", true);
            res.put("url", pending);
            String rt = uri.getQueryParameter("rt");
            String returnTo = uri.getQueryParameter("returnTo");
            String authError = uri.getQueryParameter("auth_error");
            if (rt != null) res.put("rt", rt);
            if (returnTo != null) res.put("returnTo", returnTo);
            if (authError != null) res.put("authError", authError);
        } else {
            res.put("hasCallback", false);
        }
        call.resolve(res);
    }

    @PluginMethod
    public void openInAppAuth(PluginCall call) {
        String authUrl = call.getString("url");
        if (authUrl == null || authUrl.trim().isEmpty()) {
            call.reject("Falta url");
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Actividad no disponible");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                CustomTabColorSchemeParams darkParams = new CustomTabColorSchemeParams.Builder()
                    .setToolbarColor(Color.parseColor("#0A0A0B"))
                    .setNavigationBarColor(Color.parseColor("#0A0A0B"))
                    .build();
                CustomTabsIntent customTabsIntent = new CustomTabsIntent.Builder()
                    .setDefaultColorSchemeParams(darkParams)
                    .setShowTitle(true)
                    .build();
                customTabsIntent.launchUrl(activity, Uri.parse(authUrl.trim()));
                JSObject res = new JSObject();
                res.put("opened", true);
                call.resolve(res);
            } catch (Throwable e) {
                try {
                    Intent fallback = new Intent(Intent.ACTION_VIEW, Uri.parse(authUrl.trim()));
                    activity.startActivity(fallback);
                    JSObject res = new JSObject();
                    res.put("opened", true);
                    call.resolve(res);
                } catch (Throwable ex) {
                    JSObject res = new JSObject();
                    res.put("opened", false);
                    res.put("error", ex.getMessage());
                    call.resolve(res);
                }
            }
        });
    }

    private void initPlayGames() {
        if (!playGamesInitialized && getContext() != null) {
            try {
                PlayGamesSdk.initialize(getContext());
                playGamesInitialized = true;
                Log.i(TAG, "PlayGamesSdk inicializado con éxito");
            } catch (Throwable e) {
                Log.w(TAG, "No se pudo inicializar PlayGamesSdk: " + e.getMessage());
            }
        }
    }

    private boolean isPlayGamesAppInstalled(PackageManager pm) {
        if (pm == null) return false;
        try {
            return pm.getPackageInfo("com.google.android.play.games", 0) != null;
        } catch (Throwable ignored) {
            return false;
        }
    }

    private String getSigningCertSha1() {
        Context ctx = getContext();
        if (ctx == null) return "";
        try {
            PackageManager pm = ctx.getPackageManager();
            Signature[] sigs = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                PackageInfo pi = pm.getPackageInfo(ctx.getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
                if (pi != null && pi.signingInfo != null) {
                    sigs = pi.signingInfo.hasMultipleSigners()
                        ? pi.signingInfo.getApkContentsSigners()
                        : pi.signingInfo.getSigningCertificateHistory();
                }
            } else {
                PackageInfo pi = pm.getPackageInfo(ctx.getPackageName(), PackageManager.GET_SIGNATURES);
                if (pi != null) {
                    sigs = pi.signatures;
                }
            }
            if (sigs != null && sigs.length > 0 && sigs[0] != null) {
                MessageDigest md = MessageDigest.getInstance("SHA-1");
                byte[] digest = md.digest(sigs[0].toByteArray());
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < digest.length; i++) {
                    if (i > 0) sb.append(':');
                    sb.append(String.format("%02X", digest[i]));
                }
                return sb.toString();
            }
        } catch (Throwable ignored) {
        }
        return "";
    }

    private String getServerClientId() {
        Context ctx = getContext();
        if (ctx == null) return "238603325169-k1kv9sd18gj09skun2570etpdnnkqj5b.apps.googleusercontent.com";
        int id = ctx.getResources().getIdentifier("server_client_id", "string", ctx.getPackageName());
        if (id != 0) {
            return ctx.getString(id);
        }
        return "238603325169-k1kv9sd18gj09skun2570etpdnnkqj5b.apps.googleusercontent.com";
    }

    /**
     * Detecta qué juegos de la lista están instalados en el teléfono o tablet.
     */
    @PluginMethod
    public void getInstalledGames(PluginCall call) {
        Context context = getContext();
        PackageManager pm = context.getPackageManager();
        JSArray requested = call.getArray("packages");

        JSArray resultList = new JSArray();

        if (requested == null || requested.length() == 0) {
            String[][] defaultCatalog = {
                {"freefire", "com.dts.freefireth"},
                {"wildrift", "com.riotgames.league.wildrift"},
                {"mlbb", "com.mobile.legends"},
                {"clashroyale", "com.supercell.clashroyale"},
                {"warzone", "com.activision.callofduty.warzone"},
                {"fc27", "com.ea.gp.fifamobile"},
                {"brawlstars", "com.supercell.brawlstars"},
                {"pubgm", "com.tencent.ig"},
                {"fortnite", "com.epicgames.fortnite"}
            };

            for (String[] juego : defaultCatalog) {
                resultList.put(checkPackageStatus(pm, juego[0], juego[1], null));
            }
        } else {
            for (int i = 0; i < requested.length(); i++) {
                try {
                    JSONObject obj = requested.getJSONObject(i);
                    String slug = obj.optString("slug", "");
                    String pkg = obj.optString("packageName", "");
                    JSONArray altArr = obj.optJSONArray("packagesAlt");
                    List<String> alts = new ArrayList<>();
                    if (altArr != null) {
                        for (int a = 0; a < altArr.length(); a++) {
                            alts.add(altArr.getString(a));
                        }
                    }
                    resultList.put(checkPackageStatus(pm, slug, pkg, alts));
                } catch (JSONException e) {
                    Log.w(TAG, "Error procesando paquete solicitado: " + e.getMessage());
                }
            }
        }

        JSObject ret = new JSObject();
        ret.put("games", resultList);
        call.resolve(ret);
    }

    private JSObject checkPackageStatus(PackageManager pm, String slug, String primaryPkg, List<String> alts) {
        JSObject info = new JSObject();
        info.put("slug", slug);
        info.put("packageId", primaryPkg);

        List<String> candidates = new ArrayList<>();
        if (primaryPkg != null && !primaryPkg.isEmpty()) candidates.add(primaryPkg);
        if (alts != null) candidates.addAll(alts);

        for (String pkg : candidates) {
            try {
                PackageInfo pInfo = pm.getPackageInfo(pkg, 0);
                if (pInfo != null) {
                    info.put("installed", true);
                    info.put("activePackage", pkg);
                    info.put("versionName", pInfo.versionName != null ? pInfo.versionName : "");
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        info.put("versionCode", pInfo.getLongVersionCode());
                    } else {
                        info.put("versionCode", pInfo.versionCode);
                    }
                    return info;
                }
            } catch (PackageManager.NameNotFoundException ignored) {
            }
        }

        info.put("installed", false);
        return info;
    }

    /**
     * Lanza directamente el juego para el torneo (probando paquete principal y ediciones alternativas
     * como Free Fire MAX o COD Mobile) o abre Google Play Store si no está instalado.
     */
    @PluginMethod
    public void launchGame(PluginCall call) {
        String packageId = call.getString("packageId");
        JSArray altArr = call.getArray("packagesAlt");
        if (packageId == null || packageId.trim().isEmpty()) {
            call.reject("Falta el identificador del paquete (packageId)");
            return;
        }

        Context context = getContext();
        PackageManager pm = context.getPackageManager();
        List<String> candidates = new ArrayList<>();
        candidates.add(packageId.trim());
        if (altArr != null) {
            for (int i = 0; i < altArr.length(); i++) {
                try {
                    String alt = altArr.getString(i);
                    if (alt != null && !alt.trim().isEmpty()) {
                        candidates.add(alt.trim());
                    }
                } catch (JSONException ignored) {
                }
            }
        }

        Intent launchIntent = null;
        String chosenPkg = packageId.trim();
        for (String candidate : candidates) {
            Intent candidateIntent = pm.getLaunchIntentForPackage(candidate);
            if (candidateIntent != null) {
                launchIntent = candidateIntent;
                chosenPkg = candidate;
                break;
            }
        }

        JSObject res = new JSObject();
        if (launchIntent != null) {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(launchIntent);
            res.put("success", true);
            res.put("opened", true);
            res.put("activePackage", chosenPkg);
            call.resolve(res);
        } else {
            try {
                Intent marketIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + packageId));
                marketIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(marketIntent);
                res.put("success", true);
                res.put("openedStore", true);
                call.resolve(res);
            } catch (ActivityNotFoundException e) {
                Intent webIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + packageId));
                webIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(webIntent);
                res.put("success", true);
                res.put("openedWebStore", true);
                call.resolve(res);
            }
        }
    }

    /**
     * Consulta el perfil completo y la experiencia (XP + Nivel) de Google Play Games Services v2
     * ejecutándose en el hilo principal de la Activity.
     */
    @PluginMethod
    public void getPlayGamesProfile(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            JSObject res = new JSObject();
            res.put("authenticated", false);
            res.put("available", false);
            call.resolve(res);
            return;
        }

        activity.runOnUiThread(() -> {
            initPlayGames();
            boolean pgInstalled = isPlayGamesAppInstalled(activity.getPackageManager());
            try {
                boolean requestAuthCode = Boolean.TRUE.equals(call.getBoolean("requestAuthCode", false));
                GamesSignInClient signInClient = PlayGames.getGamesSignInClient(activity);
                signInClient.isAuthenticated().addOnCompleteListener(activity, task -> {
                    if (task.isSuccessful() && task.getResult() != null && task.getResult().isAuthenticated()) {
                        fetchPlayerProfile(call, signInClient, requestAuthCode);
                    } else {
                        JSObject res = new JSObject();
                        res.put("authenticated", false);
                        res.put("available", true);
                        res.put("playGamesAppInstalled", pgInstalled);
                        res.put("apkSha1", getSigningCertSha1());
                        call.resolve(res);
                    }
                });
            } catch (Throwable t) {
                JSObject res = new JSObject();
                res.put("authenticated", false);
                res.put("available", false);
                res.put("playGamesAppInstalled", pgInstalled);
                res.put("apkSha1", getSigningCertSha1());
                res.put("error", t.getMessage());
                call.resolve(res);
            }
        });
    }

    /**
     * Inicia el flujo oficial de inicio de sesión de Google Play Juegos en el hilo UI principal,
     * con respaldo automático a DEFAULT_GAMES_SIGN_IN si Play Games v2 requiere resolución interactiva.
     */
    @PluginMethod
    public void signInPlayGames(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            JSObject res = new JSObject();
            res.put("authenticated", false);
            res.put("error", "actividad_no_disponible");
            call.resolve(res);
            return;
        }

        activity.runOnUiThread(() -> {
            initPlayGames();
            boolean pgInstalled = isPlayGamesAppInstalled(activity.getPackageManager());
            if (!pgInstalled) {
                JSObject res = new JSObject();
                res.put("authenticated", false);
                res.put("available", false);
                res.put("playGamesAppInstalled", false);
                res.put("apkSha1", getSigningCertSha1());
                res.put("error", "play_games_app_no_instalada");
                call.resolve(res);
                return;
            }

            try {
                boolean requestAuthCode = Boolean.TRUE.equals(call.getBoolean("requestAuthCode", true));
                GamesSignInClient signInClient = PlayGames.getGamesSignInClient(activity);
                signInClient.signIn().addOnCompleteListener(activity, task -> {
                    if (task.isSuccessful() && task.getResult() != null && task.getResult().isAuthenticated()) {
                        fetchPlayerProfile(call, signInClient, requestAuthCode);
                    } else {
                        int code = -1;
                        Exception ex = task.getException();
                        if (ex instanceof ApiException) {
                            code = ((ApiException) ex).getStatusCode();
                        }
                        // Si el jugador canceló manualmente, no lanzar segunda ventana
                        if (code == 12501 || code == 16) {
                            JSObject res = new JSObject();
                            res.put("authenticated", false);
                            res.put("statusCode", code);
                            res.put("playGamesAppInstalled", true);
                            res.put("error", "cancelado");
                            call.resolve(res);
                            return;
                        }
                        // Respaldo interactivo con GoogleSignIn DEFAULT_GAMES_SIGN_IN
                        try {
                            GoogleSignInOptions gamesGso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_GAMES_SIGN_IN)
                                .requestEmail()
                                .requestProfile()
                                .build();
                            GoogleSignInClient gamesClient = GoogleSignIn.getClient(activity, gamesGso);
                            startActivityForResult(call, gamesClient.getSignInIntent(), "handlePlayGamesFallbackResult");
                        } catch (Throwable fallbackErr) {
                            JSObject res = new JSObject();
                            res.put("authenticated", false);
                            if (code != -1) res.put("statusCode", code);
                            res.put("playGamesAppInstalled", true);
                            res.put("apkSha1", getSigningCertSha1());
                            res.put("error", ex != null && ex.getMessage() != null ? ex.getMessage() : "play_games_no_autenticado");
                            call.resolve(res);
                        }
                    }
                });
            } catch (Throwable t) {
                JSObject res = new JSObject();
                res.put("authenticated", false);
                res.put("playGamesAppInstalled", pgInstalled);
                res.put("apkSha1", getSigningCertSha1());
                res.put("error", t.getMessage());
                call.resolve(res);
            }
        });
    }

    @ActivityCallback
    private void handlePlayGamesFallbackResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        try {
            GoogleSignInAccount acct = GoogleSignIn.getSignedInAccountFromIntent(result.getData())
                .getResult(ApiException.class);
            if (acct != null) {
                JSObject res = new JSObject();
                res.put("authenticated", true);
                res.put("available", true);
                res.put("playGamesAppInstalled", true);
                String pid = acct.getId() != null ? "pg_" + acct.getId() : "pg_local";
                res.put("playerId", pid);
                res.put("displayName", acct.getDisplayName() != null ? acct.getDisplayName() : "Jugador Play Store");
                res.put("currentLevel", 1);
                if (acct.getPhotoUrl() != null) {
                    res.put("iconUri", acct.getPhotoUrl().toString());
                    res.put("avatarUrl", acct.getPhotoUrl().toString());
                }
                notifyListeners("playGamesAuthenticated", res, true);
                call.resolve(res);
                return;
            }
        } catch (ApiException e) {
            JSObject res = new JSObject();
            res.put("authenticated", false);
            res.put("statusCode", e.getStatusCode());
            res.put("playGamesAppInstalled", true);
            res.put("apkSha1", getSigningCertSha1());
            res.put("error", "play_games_" + e.getStatusCode());
            call.resolve(res);
            return;
        } catch (Throwable e) {
            JSObject res = new JSObject();
            res.put("authenticated", false);
            res.put("playGamesAppInstalled", true);
            res.put("apkSha1", getSigningCertSha1());
            res.put("error", e.getMessage());
            call.resolve(res);
            return;
        }
        JSObject res = new JSObject();
        res.put("authenticated", false);
        res.put("error", "cancelado");
        call.resolve(res);
    }

    /**
     * Inicio de sesión nativo de cuenta Google dentro de la app en el hilo UI principal.
     */
    @PluginMethod
    public void signInGoogleNative(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Actividad no disponible");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                String serverClientId = getServerClientId();
                GoogleSignInOptions gso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                    .requestEmail()
                    .requestProfile()
                    .requestIdToken(serverClientId)
                    .requestServerAuthCode(serverClientId, false)
                    .build();
                GoogleSignInClient googleClient = GoogleSignIn.getClient(activity, gso);
                Intent signInIntent = googleClient.getSignInIntent();
                startActivityForResult(call, signInIntent, "handleGoogleSignInResult");
            } catch (Exception e) {
                JSObject res = new JSObject();
                res.put("authenticated", false);
                res.put("apkSha1", getSigningCertSha1());
                res.put("error", e.getMessage());
                call.resolve(res);
            }
        });
    }

    @ActivityCallback
    private void handleGoogleSignInResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        try {
            GoogleSignInAccount acct = GoogleSignIn.getSignedInAccountFromIntent(result.getData())
                .getResult(ApiException.class);
            if (acct != null) {
                JSObject res = new JSObject();
                res.put("authenticated", true);
                res.put("idToken", acct.getIdToken());
                res.put("serverAuthCode", acct.getServerAuthCode());
                res.put("email", acct.getEmail());
                res.put("displayName", acct.getDisplayName());
                if (acct.getPhotoUrl() != null) {
                    res.put("avatarUrl", acct.getPhotoUrl().toString());
                }
                call.resolve(res);
                return;
            }
        } catch (ApiException e) {
            JSObject res = new JSObject();
            res.put("authenticated", false);
            res.put("statusCode", e.getStatusCode());
            res.put("apkSha1", getSigningCertSha1());
            res.put("error", "google_signin_" + e.getStatusCode());
            call.resolve(res);
            return;
        } catch (Exception e) {
            JSObject res = new JSObject();
            res.put("authenticated", false);
            res.put("error", e.getMessage());
            call.resolve(res);
            return;
        }
        JSObject res = new JSObject();
        res.put("authenticated", false);
        res.put("error", "cancelado");
        call.resolve(res);
    }

    /**
     * Muestra la hoja nativa oficial de Logros de Google Play Juegos en el hilo UI principal.
     */
    @PluginMethod
    public void showAchievements(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Actividad no disponible");
            return;
        }
        activity.runOnUiThread(() -> {
            initPlayGames();
            PlayGames.getAchievementsClient(activity).getAchievementsIntent()
                .addOnSuccessListener(activity, intent -> {
                    activity.startActivityForResult(intent, RC_PLAY_GAMES_UI);
                    JSObject res = new JSObject();
                    res.put("opened", true);
                    call.resolve(res);
                })
                .addOnFailureListener(activity, e -> {
                    JSObject res = new JSObject();
                    res.put("opened", false);
                    res.put("error", e.getMessage());
                    call.resolve(res);
                });
        });
    }

    /**
     * Muestra la hoja nativa oficial de Clasificaciones (Leaderboards) de Google Play Juegos.
     */
    @PluginMethod
    public void showLeaderboards(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Actividad no disponible");
            return;
        }
        activity.runOnUiThread(() -> {
            initPlayGames();
            PlayGames.getLeaderboardsClient(activity).getAllLeaderboardsIntent()
                .addOnSuccessListener(activity, intent -> {
                    activity.startActivityForResult(intent, RC_PLAY_GAMES_UI);
                    JSObject res = new JSObject();
                    res.put("opened", true);
                    call.resolve(res);
                })
                .addOnFailureListener(activity, e -> {
                    JSObject res = new JSObject();
                    res.put("opened", false);
                    res.put("error", e.getMessage());
                    call.resolve(res);
                });
        });
    }

    private String uriToBase64Png(Uri uri) {
        if (uri == null || getContext() == null) return null;
        try (InputStream is = getContext().getContentResolver().openInputStream(uri)) {
            if (is == null) return null;
            Bitmap bmp = BitmapFactory.decodeStream(is);
            if (bmp == null) return null;
            Bitmap scaled = Bitmap.createScaledBitmap(bmp, 128, 128, true);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            scaled.compress(Bitmap.CompressFormat.PNG, 92, baos);
            return "data:image/png;base64," + Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
        } catch (Throwable ignored) {
            return null;
        }
    }

    private void fetchPlayerProfile(PluginCall call, GamesSignInClient signInClient, boolean requestAuthCode) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Actividad no disponible");
            return;
        }
        PlayersClient playersClient = PlayGames.getPlayersClient(activity);
        playersClient.getCurrentPlayer().addOnCompleteListener(activity, task -> {
            JSObject res = new JSObject();
            res.put("authenticated", true);
            res.put("available", true);
            res.put("playGamesAppInstalled", true);

            Uri iconUri = null;
            if (task.isSuccessful() && task.getResult() != null) {
                Player player = task.getResult();
                res.put("playerId", player.getPlayerId());
                res.put("displayName", player.getDisplayName());
                if (player.getTitle() != null) {
                    res.put("title", player.getTitle());
                }
                iconUri = player.getIconImageUri();
                if (iconUri != null) {
                    res.put("iconUri", iconUri.toString());
                }
                if (player.getBannerImageLandscapeUri() != null) {
                    res.put("bannerUri", player.getBannerImageLandscapeUri().toString());
                }
                PlayerLevelInfo levelInfo = player.getLevelInfo();
                if (levelInfo != null) {
                    res.put("currentXpTotal", levelInfo.getCurrentXpTotal());
                    res.put("lastLevelUpTimestamp", levelInfo.getLastLevelUpTimestamp());
                    res.put("isMaxLevel", levelInfo.isMaxLevel());
                    PlayerLevel currentLevel = levelInfo.getCurrentLevel();
                    if (currentLevel != null) {
                        res.put("currentLevel", currentLevel.getLevelNumber());
                        res.put("levelMinXp", currentLevel.getMinXp());
                        res.put("levelMaxXp", currentLevel.getMaxXp());
                    }
                    PlayerLevel nextLevel = levelInfo.getNextLevel();
                    if (nextLevel != null) {
                        res.put("nextLevel", nextLevel.getLevelNumber());
                    }
                }
            } else {
                res.put("displayName", "Gamer Play Store");
            }

            final Uri finalIconUri = iconUri;
            if (requestAuthCode && signInClient != null) {
                signInClient.requestServerSideAccess(getServerClientId(), false)
                    .addOnCompleteListener(activity, codeTask -> {
                        if (codeTask.isSuccessful() && codeTask.getResult() != null) {
                            res.put("serverAuthCode", codeTask.getResult());
                        }
                        bgExecutor.execute(() -> {
                            String b64 = uriToBase64Png(finalIconUri);
                            if (b64 != null) res.put("iconBase64", b64);
                            notifyListeners("playGamesAuthenticated", res, true);
                            call.resolve(res);
                        });
                    });
            } else {
                bgExecutor.execute(() -> {
                    String b64 = uriToBase64Png(finalIconUri);
                    if (b64 != null) res.put("iconBase64", b64);
                    notifyListeners("playGamesAuthenticated", res, true);
                    call.resolve(res);
                });
            }
        });
    }

    /**
     * Informa sobre las características del dispositivo (Tablet vs Teléfono, SO, Fabricante y SHA-1).
     */
    @PluginMethod
    public void getDeviceInfo(PluginCall call) {
        Context ctx = getContext();
        int screenLayout = ctx.getResources().getConfiguration().screenLayout;
        boolean isTablet = (screenLayout & Configuration.SCREENLAYOUT_SIZE_MASK) >= Configuration.SCREENLAYOUT_SIZE_LARGE;

        JSObject ret = new JSObject();
        ret.put("isTablet", isTablet);
        ret.put("brand", Build.BRAND);
        ret.put("model", Build.MODEL);
        ret.put("osVersion", Build.VERSION.RELEASE);
        ret.put("sdkInt", Build.VERSION.SDK_INT);
        ret.put("playGamesAppInstalled", isPlayGamesAppInstalled(ctx.getPackageManager()));
        ret.put("apkSha1", getSigningCertSha1());
        call.resolve(ret);
    }
}
