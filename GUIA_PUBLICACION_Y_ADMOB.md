# 🚀 RutaFlash Pro — Guía de Despliegue Global y Monetización con Google AdMob

Este paquete contiene el código fuente completo, optimizado y listo para producción de **RutaFlash Pro**, diseñada para competir a escala mundial contra aplicaciones como Circuit (Spoke), Routerra y MyWay con **costo $0 de servidores**.

---

## 📁 Estructura de Archivos Incluidos

1. `index.html` — Interfaz principal móvil-primero (OLED Dark Mode), modales de paradas, lector de WhatsApp, comprobante de entrega (POD) y espacio reservado para Banner AdMob.
2. `styles.css` — Diseño responsivo ultrarrápido de alto contraste para visibilidad bajo el sol y ahorro de batería.
3. `app.js` — Motor completo con:
   - **Algoritmo de Optimización de Rutas (TSP Vecino Más Cercano + Prioridad Urgente)** usando GPS real.
   - **Lector Inteligente de WhatsApp:** Extrae nombre, teléfono, dirección, monto a cobrar y método de pago al pegar mensajes de chat.
   - **Control de Caja Multi-Moneda:** Separa efectivo en mano, transferencias/Pago Móvil y ganancias netas por envíos.
   - **Multi-idioma Automático:** Español (`ES`), Inglés (`EN`) y Portugués (`PT`) para alcance global.
   - **Puente Listo para Google AdMob:** Banner inferior, Intersticial cada 5 entregas y Video Bonificado (+15 paradas extra gratis).
4. `config.js` — **Archivo único donde debes pegar tus IDs de Google AdMob**, ajustar el precio del plan PRO y configurar tus enlaces de descarga.
5. `manifest.json` y `sw.js` — Configuración PWA (Progressive Web App) con **Modo Offline real** para trabajar sin señal en la calle y lista para empaquetar como APK/AAB.
6. `icons/icon-192.svg` y `icons/icon-512.svg` — Iconos vectoriales oficiales de la aplicación.

---

## 💰 Paso 1: Configurar tus IDs de Google AdMob

Abre el archivo **`config.js`** y busca la sección `admob`:

```javascript
  admob: {
    enabled: true,
    testMode: false, // Cambiar a false cuando publiques en Google Play
    android: {
      appId: "ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY",          // <-- Pega tu App ID
      bannerId: "ca-app-pub-XXXXXXXXXXXXXXXX/1111111111",       // <-- Pega tu Banner ID
      interstitialId: "ca-app-pub-XXXXXXXXXXXXXXXX/2222222222", // <-- Pega tu Intersticial ID
      rewardedId: "ca-app-pub-XXXXXXXXXXXXXXXX/3333333333"      // <-- Pega tu Video Bonificado ID
    }
  }
```

---

## 🌐 Paso 2: Subir a Internet con Costo $0 (Netlify / GitHub Pages)

1. Crea una cuenta gratuita en **Netlify** o **GitHub**.
2. Arrastra la carpeta completa **`RutaFlash_Pro_Global_App`** en Netlify Drop (`app.netlify.com/drop`).
3. En menos de 15 segundos tendrás tu enlace HTTPS global activo y listo para usar desde cualquier teléfono.

---

## 📱 Paso 3: Convertir a App de Google Play Store (APK / AAB)

1. Entra a **PWABuilder.com** (`https://www.pwabuilder.com`).
2. Pega el enlace HTTPS que te dio Netlify.
3. Selecciona **Package for Stores -> Android** para descargar el archivo `.aab` firmado listo para subir a tu cuenta de **Google Play Console**.
4. Si deseas integrar el SDK nativo de AdMob en Android, usa **Capacitor** (`npx cap add android` + `@capacitor-community/admob`), el cual se conecta directamente con los IDs que ya configuraste en `config.js`.
