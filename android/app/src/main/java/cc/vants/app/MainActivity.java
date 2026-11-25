package cc.vants.app;

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
