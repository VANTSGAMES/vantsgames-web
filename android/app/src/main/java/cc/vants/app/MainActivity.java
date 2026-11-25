package cc.vants.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.google.android.gms.games.GamesClient;
import com.google.android.gms.games.GamesSignInClient;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "VantsMainActivity";
    private boolean startupSignInTriggered = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Inicializar Google Play Games Services v2 al arrancar la actividad
        try {
            PlayGamesSdk.initialize(this);
        } catch (Exception e) {
            Log.w(TAG, "PlayGamesSdk init warning: " + e.getMessage());
        }

        // Registrar el plugin nativo de juegos y Google Play Juegos
        registerPlugin(VantsGamesPlugin.class);
        super.onCreate(savedInstanceState);

        // Estilo de barras de estado y navegación oscuras acordes a VANTS (#0A0A0B)
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

        // Optimización del WebView para móviles y tablets (sin destellos blancos y con DOM storage)
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.setBackgroundColor(Color.parseColor("#0A0A0B"));
            WebSettings settings = webView.getSettings();
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setMediaPlaybackRequiresUserGesture(false);
        }

        // Configurar el anclaje superior de la insignia oficial de bienvenida de Google Play Juegos
        triggerPlayGamesWelcomeBadge();
    }

    private void triggerPlayGamesWelcomeBadge() {
        try {
            // PGS v2: los popups/insignia se anclan automaticamente; no hay GamesClient.
            if (!startupSignInTriggered) {
                startupSignInTriggered = true;
                GamesSignInClient signInClient = PlayGames.getGamesSignInClient(this);
                signInClient.isAuthenticated().addOnCompleteListener(task -> {
                    boolean authed = task.isSuccessful()
                        && task.getResult() != null
                        && task.getResult().isAuthenticated();
                    if (!authed) {
                        // Solicita inicio automático al abrir para mostrar la insignia oficial de Google Play Juegos
                        signInClient.signIn();
                    }
                });
            }
        } catch (Exception e) {
            Log.w(TAG, "No se pudo disparar insignia inicial de Play Games: " + e.getMessage());
        }
    }
}
