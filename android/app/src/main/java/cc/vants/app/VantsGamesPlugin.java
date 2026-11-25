package cc.vants.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import androidx.activity.result.ActivityResult;

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
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "VantsGames")
public class VantsGamesPlugin extends Plugin {

    private static final String TAG = "VantsGamesPlugin";
    private static final int RC_PLAY_GAMES_UI = 9104;
    private boolean playGamesInitialized = false;
    private final ExecutorService bgExecutor = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        super.load();
        initPlayGames();
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
     * Consulta el perfil completo y la experiencia (XP + Nivel) de Google Play Games Services v2.
     */
    @PluginMethod
    public void getPlayGamesProfile(PluginCall call) {
        initPlayGames();
        Activity activity = getActivity();
        if (activity == null) {
            JSObject res = new JSObject();
            res.put("authenticated", false);
            res.put("available", false);
            call.resolve(res);
            return;
        }

        try {
            boolean requestAuthCode = Boolean.TRUE.equals(call.getBoolean("requestAuthCode", false));
            GamesSignInClient signInClient = PlayGames.getGamesSignInClient(activity);
            signInClient.isAuthenticated().addOnCompleteListener(task -> {
                if (task.isSuccessful() && task.getResult() != null && task.getResult().isAuthenticated()) {
                    fetchPlayerProfile(call, signInClient, requestAuthCode);
                } else {
                    JSObject res = new JSObject();
                    res.put("authenticated", false);
                    res.put("available", true);
                    call.resolve(res);
                }
            });
        } catch (Throwable t) {
            JSObject res = new JSObject();
            res.put("authenticated", false);
            res.put("available", false);
            res.put("error", t.getMessage());
            call.resolve(res);
        }
    }

    /**
     * Inicia el flujo oficial de inicio de sesión de Google Play Juegos cuando el jugador lo solicita.
     */
    @PluginMethod
    public void signInPlayGames(PluginCall call) {
        initPlayGames();
        Activity activity = getActivity();
        if (activity == null) {
            JSObject res = new JSObject();
            res.put("authenticated", false);
            res.put("error", "actividad_no_disponible");
            call.resolve(res);
            return;
        }

        try {
            boolean requestAuthCode = Boolean.TRUE.equals(call.getBoolean("requestAuthCode", true));
            GamesSignInClient signInClient = PlayGames.getGamesSignInClient(activity);
            signInClient.signIn().addOnCompleteListener(task -> {
                if (task.isSuccessful() && task.getResult() != null && task.getResult().isAuthenticated()) {
                    fetchPlayerProfile(call, signInClient, requestAuthCode);
                } else {
                    JSObject res = new JSObject();
                    res.put("authenticated", false);
                    Exception ex = task.getException();
                    if (ex instanceof ApiException) {
                        res.put("statusCode", ((ApiException) ex).getStatusCode());
                    }
                    res.put("error", ex != null && ex.getMessage() != null ? ex.getMessage() : "play_games_no_autenticado");
                    call.resolve(res);
                }
            });
        } catch (Throwable t) {
            JSObject res = new JSObject();
            res.put("authenticated", false);
            res.put("error", t.getMessage());
            call.resolve(res);
        }
    }

    /**
     * Inicio de sesión nativo de cuenta Google dentro de la app (sin abrir el navegador externo).
     */
    @PluginMethod
    public void signInGoogleNative(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Actividad no disponible");
            return;
        }
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
            res.put("error", e.getMessage());
            call.resolve(res);
        }
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
     * Muestra la hoja nativa oficial de Logros de Google Play Juegos sin salir de la app.
     */
    @PluginMethod
    public void showAchievements(PluginCall call) {
        initPlayGames();
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Actividad no disponible");
            return;
        }
        PlayGames.getAchievementsClient(activity).getAchievementsIntent()
            .addOnSuccessListener(intent -> {
                activity.startActivityForResult(intent, RC_PLAY_GAMES_UI);
                JSObject res = new JSObject();
                res.put("opened", true);
                call.resolve(res);
            })
            .addOnFailureListener(e -> {
                JSObject res = new JSObject();
                res.put("opened", false);
                res.put("error", e.getMessage());
                call.resolve(res);
            });
    }

    /**
     * Muestra la hoja nativa oficial de Clasificaciones (Leaderboards) de Google Play Juegos.
     */
    @PluginMethod
    public void showLeaderboards(PluginCall call) {
        initPlayGames();
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Actividad no disponible");
            return;
        }
        PlayGames.getLeaderboardsClient(activity).getAllLeaderboardsIntent()
            .addOnSuccessListener(intent -> {
                activity.startActivityForResult(intent, RC_PLAY_GAMES_UI);
                JSObject res = new JSObject();
                res.put("opened", true);
                call.resolve(res);
            })
            .addOnFailureListener(e -> {
                JSObject res = new JSObject();
                res.put("opened", false);
                res.put("error", e.getMessage());
                call.resolve(res);
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
        playersClient.getCurrentPlayer().addOnCompleteListener(task -> {
            JSObject res = new JSObject();
            res.put("authenticated", true);
            res.put("available", true);

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
            bgExecutor.execute(() -> {
                String b64 = uriToBase64Png(finalIconUri);
                if (b64 != null) {
                    res.put("iconBase64", b64);
                }
                if (requestAuthCode && signInClient != null) {
                    signInClient.requestServerSideAccess(getServerClientId(), false)
                        .addOnCompleteListener(codeTask -> {
                            if (codeTask.isSuccessful() && codeTask.getResult() != null) {
                                res.put("serverAuthCode", codeTask.getResult());
                            }
                            notifyListeners("playGamesAuthenticated", res, true);
                            call.resolve(res);
                        });
                } else {
                    notifyListeners("playGamesAuthenticated", res, true);
                    call.resolve(res);
                }
            });
        });
    }

    /**
     * Informa sobre las características del dispositivo (Tablet vs Teléfono, SO, Fabricante).
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
        call.resolve(ret);
    }
}
