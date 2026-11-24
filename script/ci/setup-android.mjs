// Configura y prepara el proyecto nativo de Android para Google Play Store,
// integrando Google Play Games Services v2, detección de juegos instalados (<queries>)
// y soporte optimizado para teléfonos y tablets.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

console.log("[VANTS Android] Preparando configuración nativa para Google Play...");

const ROOT = "android";
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

        <!-- Google Play Games Services v2 Metadata -->
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

// 2. strings.xml y styles.xml (Proyecto Google Cloud / AI Studio: projects/238603325169)
const PLAY_GAMES_ID = process.env.VANTS_PLAY_GAMES_APP_ID || "238603325169";
const STRINGS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">VANTS Movil</string>
    <string name="title_activity_main">VANTS Movil</string>
    <string name="package_name">cc.vants.app</string>
    <string name="custom_url_scheme">cc.vants.app</string>
    <string name="game_services_project_id">${PLAY_GAMES_ID}</string>
    <string name="google_cloud_project_number">238603325169</string>
</resources>
`;
writeFileSync(`${RES_VALUES}/strings.xml`, STRINGS_XML.trim() + "\n");

const STYLES_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Tema oscuro oficial de VANTS GAMES #0A0A0B -->
    <style name="AppTheme" parent="Theme.AppCompat.NoActionBar">
        <item name="colorPrimary">#FF0D2E</item>
        <item name="colorPrimaryDark">#0A0A0B</item>
        <item name="colorAccent">#FF0D2E</item>
        <item name="android:windowBackground">#0A0A0B</item>
        <item name="android:statusBarColor">#0A0A0B</item>
        <item name="android:navigationBarColor">#0A0A0B</item>
    </style>

    <style name="AppTheme.NoActionBarLaunch" parent="AppTheme">
        <item name="android:background">@drawable/splash</item>
    </style>
</resources>
`;
writeFileSync(`${RES_VALUES}/styles.xml`, STYLES_XML.trim() + "\n");

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

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.android.gms.games.GamesSignInClient;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;
import com.google.android.gms.games.Player;
import com.google.android.gms.games.PlayersClient;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "VantsGames")
public class VantsGamesPlugin extends Plugin {

    private static final String TAG = "VantsGamesPlugin";
    private boolean playGamesInitialized = false;

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
            } catch (Exception e) {
                Log.w(TAG, "No se pudo inicializar PlayGamesSdk: " + e.getMessage());
            }
        }
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
            // Catálogo por defecto si no se especifican paquetes
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
     * Lanza directamente el juego o abre la tienda Play Store si no está instalado.
     */
    @PluginMethod
    public void launchGame(PluginCall call) {
        String packageId = call.getString("packageId");
        if (packageId == null || packageId.trim().isEmpty()) {
            call.reject("Falta el identificador del paquete (packageId)");
            return;
        }

        Context context = getContext();
        PackageManager pm = context.getPackageManager();
        Intent launchIntent = pm.getLaunchIntentForPackage(packageId);

        JSObject res = new JSObject();
        if (launchIntent != null) {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(launchIntent);
            res.put("success", true);
            res.put("opened", true);
            call.resolve(res);
        } else {
            // Abrir Google Play Store
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
     * Consulta el perfil de Google Play Games Services v2.
     */
    @PluginMethod
    public void getPlayGamesProfile(PluginCall call) {
        initPlayGames();
        if (getActivity() == null) {
            call.reject("Actividad no disponible");
            return;
        }

        GamesSignInClient signInClient = PlayGames.getGamesSignInClient(getActivity());
        signInClient.isAuthenticated().addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null && task.getResult().isAuthenticated()) {
                fetchPlayerProfile(call);
            } else {
                JSObject res = new JSObject();
                res.put("authenticated", false);
                res.put("available", true);
                call.resolve(res);
            }
        });
    }

    /**
     * Inicia el flujo de inicio de sesión de Google Play Juegos.
     */
    @PluginMethod
    public void signInPlayGames(PluginCall call) {
        initPlayGames();
        if (getActivity() == null) {
            call.reject("Actividad no disponible");
            return;
        }

        GamesSignInClient signInClient = PlayGames.getGamesSignInClient(getActivity());
        signInClient.signIn().addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null && task.getResult().isAuthenticated()) {
                fetchPlayerProfile(call);
            } else {
                JSObject res = new JSObject();
                res.put("authenticated", false);
                res.put("error", "No se completó la autenticación con Google Play Juegos");
                call.resolve(res);
            }
        });
    }

    private void fetchPlayerProfile(PluginCall call) {
        PlayersClient playersClient = PlayGames.getPlayersClient(getActivity());
        playersClient.getCurrentPlayer().addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null) {
                Player player = task.getResult();
                JSObject res = new JSObject();
                res.put("authenticated", true);
                res.put("playerId", player.getPlayerId());
                res.put("displayName", player.getDisplayName());
                res.put("title", player.getTitle());
                if (player.getIconImageUri() != null) {
                    res.put("iconUri", player.getIconImageUri().toString());
                }
                if (player.getBannerImageLandscapeUri() != null) {
                    res.put("bannerUri", player.getBannerImageLandscapeUri().toString());
                }
                if (player.getLevelInfo() != null && player.getLevelInfo().getCurrentLevel() != null) {
                    res.put("currentLevel", player.getLevelInfo().getCurrentLevel().getLevelNumber());
                }
                call.resolve(res);
            } else {
                JSObject res = new JSObject();
                res.put("authenticated", true);
                res.put("displayName", "Gamer Play Store");
                call.resolve(res);
            }
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
`;
writeFileSync(`${JAVA_DIR}/VantsGamesPlugin.java`, PLUGIN_JAVA.trim() + "\n");

// 4. MainActivity.java (registrando VantsGamesPlugin y barras de sistema oscuras)
const MAIN_ACTIVITY_JAVA = `package cc.vants.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registra el plugin nativo de juegos y Google Play Juegos
        registerPlugin(VantsGamesPlugin.class);
        super.onCreate(savedInstanceState);

        // Estilo de barras de estado y navegación oscuras acordes a la estética de VANTS (#0A0A0B)
        Window window = getWindow();
        if (window != null) {
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(Color.parseColor("#0A0A0B"));
            window.setNavigationBarColor(Color.parseColor("#0A0A0B"));

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // Mantener iconos claros sobre fondo negro
                View decor = window.getDecorView();
                int flags = decor.getSystemUiVisibility();
                flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                decor.setSystemUiVisibility(flags);
            }
        }
    }
}
`;
writeFileSync(`${JAVA_DIR}/MainActivity.java`, MAIN_ACTIVITY_JAVA.trim() + "\n");

// 5. app/build.gradle
const APP_BUILD_GRADLE = `apply plugin: 'com.android.application'

android {
    namespace "cc.vants.app"
    compileSdkVersion 35

    defaultConfig {
        applicationId "cc.vants.app"
        minSdkVersion 24
        targetSdkVersion 35
        versionCode Integer.parseInt(System.getenv("APP_VERSION_CODE") ?: "1")
        versionName System.getenv("APP_VERSION") ?: "1.0.0"
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

    // Google Play Games Services v2
    implementation 'com.google.android.gms:play-services-games-v2:20.1.2'

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
// Si `npx cap add android` ya generó la estructura de Capacitor, respetamos su
// settings.gradle (capacitor.settings.gradle) y actualizamos targetSdkVersion = 35.
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
  vars = vars.replace(/compileSdkVersion\s*=\s*\d+/, "compileSdkVersion = 35");
  vars = vars.replace(/targetSdkVersion\s*=\s*\d+/, "targetSdkVersion = 35");
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
  const SETTINGS_GRADLE = `include ':app'
rootProject.name = 'VANTS Movil'
`;
  writeFileSync("android/settings.gradle", SETTINGS_GRADLE.trim() + "\n");
}

if (!existsSync("android/gradle.properties")) {
  const GRADLE_PROPERTIES = `org.gradle.jvmargs=-Xmx2048m
android.useAndroidX=true
android.enableJetifier=true
`;
  writeFileSync("android/gradle.properties", GRADLE_PROPERTIES.trim() + "\n");
}

// Placeholder para capacitor.build.gradle si aún no se ha ejecutado cap sync
if (!existsSync("android/app/capacitor.build.gradle")) {
  writeFileSync("android/app/capacitor.build.gradle", "// Generado por Capacitor\n");
}
if (!existsSync("android/app/proguard-rules.pro")) {
  writeFileSync("android/app/proguard-rules.pro", "# Reglas Proguard de VANTS Movil\n-keep class cc.vants.app.** { *; }\n");
}

console.log("[VANTS Android] Configuración completada:");
console.log("  ✓ AndroidManifest con <queries> para Free Fire, Wild Rift, MLBB, Clash Royale, etc.");
console.log("  ✓ Google Play Games Services v2 configurado (App ID: " + PLAY_GAMES_ID + ")");
console.log("  ✓ VantsGamesPlugin.java registrado en MainActivity.java");
console.log("  ✓ Soporte adaptativo para Smartphones y Tablets");
console.log("  ✓ Barra de estado e interfaz inmersiva #0A0A0B");
console.log("  ✓ build.gradle con targetSdkVersion 35 listo para Google Play AAB (.aab)");
