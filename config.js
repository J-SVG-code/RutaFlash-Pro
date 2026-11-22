/**
 * ============================================================================
 * CONFIGURACIÓN GLOBAL Y MONETIZACIÓN - RUTAFLASH PRO
 * Aquí solo tienes que pegar tus IDs de Google AdMob y ajustar tus precios.
 * ============================================================================
 */

const APP_CONFIG = {
  appName: "RutaFlash Pro",
  version: "1.0.0",
  author: "Joelbi José Salazar Vargas",

  // 1. GOOGLE ADMOB (Pega aquí tus IDs reales al compilar con PWABuilder / Capacitor / AdMob)
  admob: {
    enabled: true, // Cambiar a false si deseas ocultar espacios de anuncios
    testMode: true, // Cambiar a false en producción cuando subas a Google Play
    android: {
      appId: "ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY",       // <-- PEGA TU APP ID DE ADMOB AQUÍ
      bannerId: "ca-app-pub-XXXXXXXXXXXXXXXX/1111111111",    // <-- PEGA TU BANNER ID AQUÍ
      interstitialId: "ca-app-pub-XXXXXXXXXXXXXXXX/2222222222", // <-- PEGA TU INTERSTICIAL ID AQUÍ
      rewardedId: "ca-app-pub-XXXXXXXXXXXXXXXX/3333333333"   // <-- PEGA TU ANUNCIO BONIFICADO AQUÍ
    },
    ios: {
      appId: "ca-app-pub-XXXXXXXXXXXXXXXX~ZZZZZZZZZZ",
      bannerId: "ca-app-pub-XXXXXXXXXXXXXXXX/4444444444",
      interstitialId: "ca-app-pub-XXXXXXXXXXXXXXXX/5555555555",
      rewardedId: "ca-app-pub-XXXXXXXXXXXXXXXX/6666666666"
    },
    // Frecuencia de anuncios intersticiales (cada cuántas entregas completadas aparece 1 anuncio)
    interstitialEveryNDeliveries: 5
  },

  // 2. ESTRATEGIA FREEMIUM (Ventaja competitiva vs Circuit/Spoke que solo da 10 paradas)
  plans: {
    freeMaxStops: 25,          // 25 paradas gratis (2.5x más que la competencia)
    rewardedExtraStops: 15,    // +15 paradas extra por ver 1 video bonificado (llega a 40 gratis)
    proPriceMonthly: "$3.99",  // 75% más barato que Circuit ($20/mes)
    proUnlockCode: "PRO2026"   // Código maestro de prueba o activación manual tras pago
  },

  // 3. MONEDAS GLOBALES SOPORTADAS (Escala Mundial + Multi-moneda local)
  currencies: [
    { code: "USD", symbol: "$", name: "Dólar (USD)" },
    { code: "VES", symbol: "Bs.", name: "Bolívares (VES)" },
    { code: "EUR", symbol: "€", name: "Euro (EUR)" },
    { code: "COP", symbol: "COP$", name: "Peso Colombiano" },
    { code: "MXN", symbol: "MX$", name: "Peso Mexicano" },
    { code: "BRL", symbol: "R$", name: "Real Brasileño" },
    { code: "ARS", symbol: "AR$", name: "Peso Argentino" },
    { code: "PEN", symbol: "S/", name: "Sol Peruano" },
    { code: "CLP", symbol: "CL$", name: "Peso Chileno" }
  ],

  // 4. WHATSAPP / SOPORTE Y VIRALIDAD (Para que los repartidores compartan la app entre ellos)
  sharing: {
    downloadUrl: "https://play.google.com/store/apps/details?id=com.rutaflash.pro",
    referralMessage: "🚀 ¡Brother! Descarga RutaFlash Pro para repartidores. Te ordena hasta 25 paradas GRATIS, lee pedidos directo de WhatsApp, lleva tu caja de efectivo/transferencias y abre directo en Waze o Maps: "
  }
};
