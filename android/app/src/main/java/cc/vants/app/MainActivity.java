package cc.vants.app;

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
