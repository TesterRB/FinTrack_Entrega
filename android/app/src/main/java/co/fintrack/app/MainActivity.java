package co.fintrack.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

/** Actividad principal: el WebView de Capacitor que carga la app web (dist/) con ajustes para que se sienta nativa. */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebSettings ajustes = getBridge().getWebView().getSettings();
        // El WebView de Android agranda todo el texto según el tamaño de letra del sistema, lo que "hacía zoom"
        // a toda la app y desbordaba pantallas como el Asistente. La app tiene su propia escala tipográfica.
        ajustes.setTextZoom(100);
        // Sin zoom con pellizco ni con doble toque: es una app, no una página web.
        ajustes.setSupportZoom(false);
        ajustes.setBuiltInZoomControls(false);
        ajustes.setDisplayZoomControls(false);
    }
}
