// Configura y prepara el proyecto nativo de Android para Google Play Store,
// integrando Google Play Games Services v2 (insignia de bienvenida oficial + lectura
// de experiencia/XP y nivel del jugador), inicio de sesión nativo in-app sin salir al
// navegador, detección y lanzamiento directo de juegos instalados (<queries>) y soporte
// optimizado para teléfonos y tablets.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

console.log("[VANTS Android] Preparando configuración nativa para Google Play...");

const APP_SRC = "android/app/src/main";
const JAVA_DIR = `${APP_SRC}/java/cc/vants/app`;
const RES_VALUES = `${APP_SRC}/res/values`;

mkdirSync(JAVA_DIR, { recursive: true });
mkdirSync(RES_VALUES, { recursive: true });
mkdirSync(`${APP_SRC}/res/drawable`, { recursive: true });

// 1. AndroidManifest.xml (con queries de juegos y Play Games metadata)
const MANIFEST_XML = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <!-- Queries explícitas para cumplir la política de Google Play Store sin requerir QUERY_ALL_PACKAGES -->
    <queries>
        <!-- Catálogo de Juegos Móviles VANTS GAMES -->
        <package android:name="com.dts.freefireth" />
        <package android:name="com.dts.freefiremax" />
        <package android:name="com.riotgames.league.wildrift" />
        <package android:name="com.mobile.legends" />
        <package android:name="com.supercell.clashroyale" />
        <package android:name="com.activision.callofduty.warzone" />
        <package android:name="com.activision.callofduty.shooter" />
        <package android:name="com.ea.gp.fifamobile" />
        <package android:name="com.tencent.ig" />
        <package android:name="com.supercell.brawlstars" />
        <package android:name="com.supercell.clashofclans" />
        <package android:name="com.epicgames.fortnite" />
        <package android:name="com.roblox.client" />
        <package android:name="com.mojang.minecraftpe" />
        <package android:name="com.levelinfinite.sgameGlobal" />
        <package android:name="com.google.android.play.games" />

        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="https" />
        </intent>
    </queries>

    <!-- Compatibilidad con Teléfonos, Tablets, Plegables y Pantallas Grandes -->
    <supports-screens
        android:smallScreens="true"
        android:normalScreens="true"
        android:largeScreens="true"
        android:xlargeScreens="true"
        android:anyDensity="true" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme"
        android:hardwareAccelerated="true">

        <!-- Google Play Games Services v2 Metadata (activa la insignia oficial de bienvenida al abrir) -->
        <meta-data
            android:name="com.google.android.gms.games.APP_ID"
            android:value="@string/game_services_project_id" />
        <meta-data
            android:name="com.google.android.gms.version"
            android:value="@integer/google_play_services_version" />

        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:name=".MainActivity"
            android:label="@string/title_activity_main"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:launchMode="singleTask"
            android:resizeableActivity="true"
            android:exported="true">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

            <!-- Deep linking para esquemas vants.cc -->
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="vants.cc" />
                <data android:scheme="https" android:host="www.vants.cc" />
            </intent-filter>

            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="@string/custom_url_scheme" />
            </intent-filter>

        </activity>

        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="\${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths"></meta-data>
        </provider>
    </application>

</manifest>
`;
writeFileSync(`${APP_SRC}/AndroidManifest.xml`, MANIFEST_XML.trim() + "\n");

// 2. strings.xml y styles.xml (Proyecto Google Cloud / AI Studio: projects/238603325169 · semiotic-ion-508913-r1)
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || process.env.VITE_GOOGLE_CLOUD_PROJECT_ID || "semiotic-ion-508913-r1";
const GCP_PROJECT_NUMBER = process.env.GCP_PROJECT_NUMBER || "238603325169";
const PLAY_GAMES_ID = process.env.VANTS_PLAY_GAMES_APP_ID || GCP_PROJECT_NUMBER;
const WEB_OAUTH_CLIENT_ID =
  process.env.VITE_GOOGLE_OAUTH_CLIENT_ID ||
  "238603325169-k1kv9sd18gj09skun2570etpdnnkqj5b.apps.googleusercontent.com";
const APP_VERSION = process.env.APP_VERSION || "1.4.0";
const APP_VERSION_CODE = Math.max(320, parseInt(process.env.APP_VERSION_CODE || "320", 10) || 320);

const STRINGS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">VANTS Movil</string>
    <string name="title_activity_main">VANTS Movil</string>
    <string name="package_name">cc.vants.app</string>
    <string name="custom_url_scheme">cc.vants.app</string>
    <string name="game_services_project_id" translatable="false">${PLAY_GAMES_ID}</string>
    <string name="gcp_project_id" translatable="false">${GCP_PROJECT_ID}</string>
    <string name="google_cloud_project_number" translatable="false">${GCP_PROJECT_NUMBER}</string>
    <string name="server_client_id" translatable="false">${WEB_OAUTH_CLIENT_ID}</string>
</resources>
`;
writeFileSync(`${RES_VALUES}/strings.xml`, STRINGS_XML.trim() + "\n");

const STYLES_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Tema oscuro oficial de VANTS GAMES #0A0A0B -->
    <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="colorPrimary">#FF0D2E</item>
        <item name="colorPrimaryDark">#0A0A0B</item>
        <item name="colorAccent">#FF0D2E</item>
        <item name="android:windowBackground">#0A0A0B</item>
        <item name="android:statusBarColor">#0A0A0B</item>
        <item name="android:navigationBarColor">#0A0A0B</item>
    </style>

    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@null</item>
        <item name="android:windowBackground">#0A0A0B</item>
        <item name="android:statusBarColor">#0A0A0B</item>
        <item name="android:navigationBarColor">#0A0A0B</item>
    </style>

    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">#0A0A0B</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/splash</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>
</resources>
`;
writeFileSync(`${RES_VALUES}/styles.xml`, STYLES_XML.trim() + "\n");

// Recursos gráficos base de respaldo para compilación local en Android Studio (si aún no corrió app-icono.mjs)
if (!existsSync(`${APP_SRC}/res/drawable/splash.png`)) {
  const SPLASH_XML = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item>
        <shape android:shape="rectangle">
            <solid android:color="#0A0A0B" />
        </shape>
    </item>
</layer-list>
`;
  writeFileSync(`${APP_SRC}/res/drawable/splash.xml`, SPLASH_XML.trim() + "\n");
}

if (!existsSync(`${APP_SRC}/res/mipmap-mdpi/ic_launcher.png`)) {
  mkdirSync(`${APP_SRC}/res/mipmap-anydpi-v26`, { recursive: true });
  const IC_BG_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#0A0A0B" />
</shape>
`;
  const IC_FG_XML = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#FF0D2E"
        android:pathData="M30,30 L45,30 L54,60 L63,30 L78,30 L60,80 L48,80 Z" />
</vector>
`;
  const IC_ADAPTIVE_XML = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`;
  writeFileSync(`${APP_SRC}/res/drawable/ic_launcher_background.xml`, IC_BG_XML.trim() + "\n");
  writeFileSync(`${APP_SRC}/res/drawable/ic_launcher_foreground.xml`, IC_FG_XML.trim() + "\n");
  writeFileSync(`${APP_SRC}/res/mipmap-anydpi-v26/ic_launcher.xml`, IC_ADAPTIVE_XML.trim() + "\n");
  writeFileSync(`${APP_SRC}/res/mipmap-anydpi-v26/ic_launcher_round.xml`, IC_ADAPTIVE_XML.trim() + "\n");
}

// XML file paths
mkdirSync(`${APP_SRC}/res/xml`, { recursive: true });
const FILE_PATHS_XML = `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-path name="my_images" path="." />
</paths>
`;
writeFileSync(`${APP_SRC}/res/xml/file_paths.xml`, FILE_PATHS_XML.trim() + "\n");

// 3. Plugin nativo VantsGamesPlugin.java
const PLUGIN_JAVA = `package cc.vants.app;

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
        if (ctx == null) return "${WEB_OAUTH_CLIENT_ID}";
        int id = ctx.getResources().getIdentifier("server_client_id", "string", ctx.getPackageName());
        if (id != 0) {
            return ctx.getString(id);
        }
        return "${WEB_OAUTH_CLIENT_ID}";
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
`;
writeFileSync(`${JAVA_DIR}/VantsGamesPlugin.java`, PLUGIN_JAVA.trim() + "\n");

// 4. MainActivity.java (PlayGamesSdk silencioso + deep link cc.vants.app://auth-callback + WebView optimizado + barras oscuras)
const MAIN_ACTIVITY_JAVA = `package cc.vants.app;

import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.google.android.gms.games.GamesSignInClient;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "VantsMainActivity";
    private boolean startupCheckDone = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Inicializar Google Play Games Services v2 de forma segura al arrancar la actividad
        try {
            PlayGamesSdk.initialize(this);
        } catch (Throwable e) {
            Log.w(TAG, "PlayGamesSdk init warning: " + e.getMessage());
        }

        // Registrar el plugin nativo de juegos y Google Play Juegos antes de super.onCreate
        registerPlugin(VantsGamesPlugin.class);
        super.onCreate(savedInstanceState);

        if (getIntent() != null && getIntent().getData() != null) {
            VantsGamesPlugin.onNativeAuthRedirect(getIntent().getData());
        }

        // Estilo de barras de estado y navegación oscuras acordes a VANTS (#0A0A0B)
        try {
            Window window = getWindow();
            if (window != null) {
                window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
                window.setStatusBarColor(Color.parseColor("#0A0A0B"));
                window.setNavigationBarColor(Color.parseColor("#0A0A0B"));

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    View decor = window.getDecorView();
                    int flags = decor.getSystemUiVisibility();
                    flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                    flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    decor.setSystemUiVisibility(flags);
                }
            }
        } catch (Throwable ignored) {
        }

        // Optimización del WebView para móviles y tablets (sin destellos blancos, sin popups externos y con DOM storage)
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView webView = getBridge().getWebView();
                webView.setBackgroundColor(Color.parseColor("#0A0A0B"));
                WebSettings settings = webView.getSettings();
                settings.setDomStorageEnabled(true);
                settings.setDatabaseEnabled(true);
                settings.setMediaPlaybackRequiresUserGesture(false);
                settings.setJavaScriptCanOpenWindowsAutomatically(false);
                settings.setSupportMultipleWindows(false);
            }
        } catch (Throwable ignored) {
        }

        checkSilentPlayGamesWelcome();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null && intent.getData() != null) {
            VantsGamesPlugin.onNativeAuthRedirect(intent.getData());
        }
    }

    private void checkSilentPlayGamesWelcome() {
        if (startupCheckDone) return;
        startupCheckDone = true;
        try {
            GamesSignInClient signInClient = PlayGames.getGamesSignInClient(this);
            signInClient.isAuthenticated().addOnCompleteListener(this, task -> {
                boolean authed = task.isSuccessful()
                    && task.getResult() != null
                    && task.getResult().isAuthenticated();
                Log.i(TAG, "PlayGames silent check authenticated=" + authed);
            });
        } catch (Throwable e) {
            Log.w(TAG, "Verificación silenciosa de Play Games omitida: " + e.getMessage());
        }
    }
}
`;
writeFileSync(`${JAVA_DIR}/MainActivity.java`, MAIN_ACTIVITY_JAVA.trim() + "\n");

// 5. app/build.gradle
const APP_BUILD_GRADLE = `apply plugin: 'com.android.application'

android {
    namespace "cc.vants.app"
    compileSdk rootProject.ext.has('compileSdkVersion') ? rootProject.ext.compileSdkVersion : 35

    defaultConfig {
        applicationId "cc.vants.app"
        minSdkVersion rootProject.ext.has('minSdkVersion') ? rootProject.ext.minSdkVersion : 24
        targetSdkVersion rootProject.ext.has('targetSdkVersion') ? rootProject.ext.targetSdkVersion : 35
        versionCode ${APP_VERSION_CODE}
        versionName "${APP_VERSION}"
        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
        aaptOptions {
             // Files and dirs to omit from the packaged assets inside the APK/AAB
             ignoreAssetsPattern '!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~'
        }
    }

    signingConfigs {
        release {
            if (System.getenv("VANTS_KEYSTORE_FILE")) {
                storeFile file(System.getenv("VANTS_KEYSTORE_FILE"))
                storePassword System.getenv("VANTS_KEYSTORE_PASSWORD")
                keyAlias System.getenv("VANTS_KEY_ALIAS")
                keyPassword System.getenv("VANTS_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
            if (System.getenv("VANTS_KEYSTORE_FILE")) {
                signingConfig signingConfigs.release
            }
        }
    }
}

repositories {
    google()
    mavenCentral()
    flatDir{
        dirs '../capacitor-cordova-android-plugins/src/main/libs', 'libs'
    }
}

dependencies {
    implementation fileTree(include: ['*.jar'], dir: 'libs')
    implementation 'androidx.appcompat:appcompat:1.7.0'
    implementation 'androidx.coordinatorlayout:coordinatorlayout:1.2.0'
    implementation 'androidx.core:core-splashscreen:1.0.1'
    implementation 'androidx.browser:browser:1.8.0'

    // Google Play Games Services v2 + Google Sign-In nativo en app
    implementation 'com.google.android.gms:play-services-games-v2:20.1.2'
    implementation 'com.google.android.gms:play-services-auth:21.2.0'

    // Capacitor Android Core & Plugins
    if (findProject(':capacitor-android')) {
        implementation project(':capacitor-android')
    }
    if (findProject(':capacitor-cordova-android-plugins')) {
        implementation project(':capacitor-cordova-android-plugins')
    }

    testImplementation 'junit:junit:4.13.2'
    androidTestImplementation 'androidx.test.ext:junit:1.2.1'
    androidTestImplementation 'androidx.test.espresso:espresso-core:3.6.1'
}

apply from: 'capacitor.build.gradle'
`;
mkdirSync("android/app", { recursive: true });
writeFileSync("android/app/build.gradle", APP_BUILD_GRADLE.trim() + "\n");

// 6. Root build.gradle, variables.gradle & settings.gradle
const tieneCapacitorGenerado = existsSync("android/capacitor.settings.gradle");

if (!existsSync("android/build.gradle")) {
  const ROOT_BUILD_GRADLE = `// Top-level build file where you can add configuration options common to all sub-projects/modules.
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.7.3'
        classpath 'com.google.gms:google-services:4.4.2'
    }
}

apply from: "variables.gradle"

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

task clean(type: Delete) {
    delete rootProject.buildDir
}
`;
  writeFileSync("android/build.gradle", ROOT_BUILD_GRADLE.trim() + "\n");
}

if (existsSync("android/variables.gradle") && tieneCapacitorGenerado) {
  let vars = readFileSync("android/variables.gradle", "utf8");
  vars = vars.replace(/compileSdkVersion\s*=\s*(\d+)/, (_, n) => `compileSdkVersion = ${Math.max(Number(n) || 35, 35)}`);
  vars = vars.replace(/targetSdkVersion\s*=\s*(\d+)/, (_, n) => `targetSdkVersion = ${Math.max(Number(n) || 35, 35)}`);
  writeFileSync("android/variables.gradle", vars);
} else {
  const VARIABLES_GRADLE = `ext {
    minSdkVersion = 24
    compileSdkVersion = 35
    targetSdkVersion = 35
    androidxActivityVersion = '1.9.3'
    androidxAppCompatVersion = '1.7.0'
    androidxCoordinatorLayoutVersion = '1.2.0'
    androidxCoreVersion = '1.15.0'
    androidxFragmentVersion = '1.8.5'
    coreSplashScreenVersion = '1.0.1'
    androidxWebkitVersion = '1.12.1'
    junitVersion = '4.13.2'
    androidxJunitVersion = '1.2.1'
    androidxEspressoCoreVersion = '3.6.1'
    cordovaAndroidVersion = '10.1.1'
}
`;
  writeFileSync("android/variables.gradle", VARIABLES_GRADLE.trim() + "\n");
}

if (!tieneCapacitorGenerado) {
  const capLocalPath = "../node_modules/@capacitor/android/capacitor";
  const capLine = existsSync("node_modules/@capacitor/android/capacitor")
    ? `\ninclude ':capacitor-android'\nproject(':capacitor-android').projectDir = new File('${capLocalPath}')\n`
    : "\n";
  const SETTINGS_GRADLE = `include ':app'${capLine}rootProject.name = 'VANTS Movil'\n`;
  writeFileSync("android/settings.gradle", SETTINGS_GRADLE);
}

if (!existsSync("android/gradle.properties")) {
  const GRADLE_PROPERTIES = `org.gradle.jvmargs=-Xmx2048m
android.useAndroidX=true
android.enableJetifier=true
`;
  writeFileSync("android/gradle.properties", GRADLE_PROPERTIES.trim() + "\n");
}

if (!existsSync("android/app/capacitor.build.gradle")) {
  writeFileSync("android/app/capacitor.build.gradle", "// Generado por Capacitor\n");
}
if (!existsSync("android/app/proguard-rules.pro")) {
  writeFileSync("android/app/proguard-rules.pro", "# Reglas Proguard de VANTS Movil\n-keep class cc.vants.app.** { *; }\n");
}

console.log("[VANTS Android] Configuración completada:");
console.log("  ✓ AndroidManifest con <queries> para Free Fire, Wild Rift, MLBB, Clash Royale, etc.");
console.log("  ✓ Google Play Games Services v2 + Insignia de Bienvenida (App ID: " + PLAY_GAMES_ID + ")");
console.log("  ✓ Lectura completa de Experiencia (XP / PlayerLevelInfo) + Logros nativos");
console.log("  ✓ Login 100% dentro de la app (Play Games + Google Sign-In nativo + Email OTP)");
console.log("  ✓ Soporte adaptativo para Smartphones y Tablets (#0A0A0B, targetSdkVersion 35)");
