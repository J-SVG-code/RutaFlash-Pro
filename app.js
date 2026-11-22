// ==========================================
// RUTA FLASH v3.0 - GPS AUTOMATICO + DIA/NOCHE + MONETIZACION
// ==========================================

const FREE_LIMIT = 20;

let state = {
  isPro: false,
  theme: 'light',
  email: '',
  basePoint: null,
  settings: {
    vehicle: 'moto',
    kml: 35,
    fuelPrice: 0.50
  },
  orders: []
};

let currentDeliveringId = null;
let compressedPhotoBase64 = null;
let map = null;
let markersLayer = null;
let routeLine = null;
let driverMarker = null;
let liveDriverPos = null;
let gpsWatchId = null;

function loadState() {
  try {
    const saved = localStorage.getItem('ruta_flash_state_v3');
    if (saved) {
      state = { ...state, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Iniciando estado limpio');
  }
}

function saveState() {
  try {
    localStorage.setItem('ruta_flash_state_v3', JSON.stringify(state));
  } catch (e) {}
  updateUI();
}

// ==========================================
// MONETIZACION: ADMOB (BANNER / INTERSTICIAL) + GOOGLE PLAY BILLING
// ==========================================
function hasPlaceholderId(val) {
  return !val || typeof val !== 'string' || val.trim() === '' || val.includes('PEGAR_AQUI');
}

function getMonetizationIds() {
  const admob = (typeof ADMOB_CONFIG !== 'undefined' && ADMOB_CONFIG) ? ADMOB_CONFIG : {};
  const billing = (typeof BILLING_CONFIG !== 'undefined' && BILLING_CONFIG) ? BILLING_CONFIG : {};
  return {
    admobAppId: admob.appId || 'PEGAR_AQUI_ADMOB_APP_ID',
    bannerAdUnitId: admob.bannerAdUnitId || 'PEGAR_AQUI_ADMOB_BANNER_ID',
    interstitialAdUnitId: admob.interstitialAdUnitId || 'PEGAR_AQUI_ADMOB_INTERSTITIAL_ID',
    playConsolePackageName: billing.playConsolePackageName || 'PEGAR_AQUI_PLAY_CONSOLE_PACKAGE_NAME',
    proMonthlyProductId: billing.proMonthlyProductId || 'PEGAR_AQUI_PRODUCT_ID_PRO_MENSUAL',
    proMonthlyBasePlanId: billing.proMonthlyBasePlanId || 'PEGAR_AQUI_BASE_PLAN_ID_PRO_MENSUAL',
    priceDisplay: billing.priceDisplay || '$3.75 / mes'
  };
}

async function requestPlayBillingSubscription() {
  const ids = getMonetizationIds();
  if (hasPlaceholderId(ids.proMonthlyProductId)) {
    showAppToast('Falta configurar BILLING_CONFIG.proMonthlyProductId en index.html.', 'warn');
    return { ok: false, reason: 'missing_product_id' };
  }

  if (window.RutaFlashBilling && typeof window.RutaFlashBilling.subscribePro === 'function') {
    return await window.RutaFlashBilling.subscribePro({
      packageName: ids.playConsolePackageName,
      productId: ids.proMonthlyProductId,
      basePlanId: ids.proMonthlyBasePlanId
    });
  }

  if (typeof navigator !== 'undefined' && typeof navigator.getDigitalGoodsService === 'function') {
    try {
      const service = await navigator.getDigitalGoodsService('https://play.google.com/billing');
      if (service && typeof service.purchase === 'function') {
        const purchaseRes = await service.purchase({
          itemId: ids.proMonthlyProductId,
          paymentMethodData: [{ supportedMethods: 'https://play.google.com/billing' }]
        });
        if (purchaseRes && (purchaseRes.purchaseToken || purchaseRes.itemId === ids.proMonthlyProductId)) {
          if (typeof window.applyVerifiedProStatus === 'function') {
            await window.applyVerifiedProStatus(true);
          }
          return { ok: true, purchase: purchaseRes };
        }
      }
    } catch (e) {
      console.warn('Digital Goods / Play Billing no disponible en este contexto:', e);
    }
  }

  return { ok: false, reason: 'billing_bridge_pending' };
}

async function maybeShowInterstitialAd(triggerReason = 'route_action') {
  const ids = getMonetizationIds();
  if (state.isPro || !navigator.onLine) return false;
  if (hasPlaceholderId(ids.admobAppId) || hasPlaceholderId(ids.interstitialAdUnitId)) {
    return false;
  }
  if (window.RutaFlashAds && typeof window.RutaFlashAds.showInterstitial === 'function') {
    try {
      await window.RutaFlashAds.showInterstitial({
        adUnitId: ids.interstitialAdUnitId,
        reason: triggerReason
      });
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

function showAppToast(message, type = 'info') {
  const container = document.getElementById('app-toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'app-toast ' + type;
  toast.innerHTML = '<span>' + message + '</span>';
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.25s ease';
    setTimeout(() => toast.remove(), 260);
  }, 3600);
}

const I18N_DICT = {
  es: {
    onb_brand_title: 'Ruta Flash PRO',
    onb_subtitle: 'Configuración inicial antes de entrar a tus rutas',
    step_1: '1. Términos',
    step_2: '2. Cuenta',
    step_3: '3. Cómo funciona',
    terms_title: '📄 Términos y Política de Privacidad',
    terms_desc: 'Lee detenidamente los términos de uso y privacidad de Ruta Flash PRO antes de continuar.',
    terms_check: 'He leído y acepto los Términos de Uso y la Política de Privacidad de Ruta Flash PRO.',
    btn_accept_continue: 'Aceptar y Continuar →',
    onb_acc_title: '🔐 Acceso a tu Cuenta',
    onb_acc_desc: 'Crea una cuenta con verificación por correo, entra con tu cuenta y clave o vincula tu cuenta de Google.',
    mode_register: 'Crear cuenta',
    mode_login: 'Ya tengo cuenta',
    lbl_email: 'Correo electrónico',
    lbl_password: 'Clave / Contraseña (mínimo 6 caracteres)',
    btn_create_continue: '📝 Crear Cuenta y Continuar',
    btn_login_continue: '🔑 Entrar con mi Cuenta y Continuar',
    btn_google_link: '🔵 Vincular / Continuar con Google',
    guide_title: '🛵 Cómo funciona Ruta Flash PRO',
    btn_start_work: '🚀 Comenzar a Trabajar',
    gps_label: '📍 Punto de Salida y Retorno',
    btn_update_gps: '🎯 Actualizar GPS',
    metric_dist: 'Recorrido (+Retorno)',
    metric_fuel: 'Gasolina Est.',
    metric_profit: 'Ganancia Neta',
    btn_optimize: '⚡ Optimizar Ruta',
    btn_add_order: '➕ Agregar Pedido',
    btn_clear_done: 'Limpiar entregados',
    nav_route: 'Ruta',
    nav_new: 'Nuevo',
    nav_map: 'Mapa',
    nav_cash: 'Caja',
    nav_settings: 'Ajustes',
    lang_title: '🌐 Idioma de la Aplicación',
    lang_desc: 'Detecta automáticamente el idioma de tu teléfono o te permite cambiarlo cuando desees.',
    lang_select_label: 'Idioma'
  }
};

function detectDeviceLanguageCode() {
  const candidates = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language || 'es'];
  const raw = (candidates[0] || 'es').toLowerCase();
  if (raw.startsWith('pt')) return 'pt';
  if (raw.startsWith('en')) return 'en';
  return 'es';
}

function getEffectiveLanguage() {
  const pref = state.languagePref || 'auto';
  return pref === 'auto' ? detectDeviceLanguageCode() : pref;
}

function applyLanguageTranslations() {
  const activeLang = getEffectiveLanguage();
  const dict = I18N_DICT[activeLang] || I18N_DICT.es;
  document.documentElement.lang = activeLang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) el.textContent = dict[key];
  });
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('btn-theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  saveState();
}

function autoLocateOnStartup() {
  const baseText = document.getElementById('base-coords-text');
  if (!navigator.geolocation) {
    if (baseText) baseText.textContent = 'GPS no soportado en este navegador';
    return;
  }
  if (baseText && !state.basePoint) {
    baseText.textContent = '📡 Ubicando tu GPS automáticamente...';
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      liveDriverPos = coords;
      if (!state.basePoint) state.basePoint = coords;
      saveState();
    },
    () => {
      if (baseText && !state.basePoint) {
        baseText.textContent = 'Activa la ubicación GPS y toca "Actualizar GPS"';
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
  );
}

function checkNetworkAndAccess() {
  const isOnline = navigator.onLine;
  const pill = document.getElementById('net-status');
  const lockBanner = document.getElementById('offline-lock-banner');
  if (isOnline) {
    pill.textContent = 'Online';
    pill.className = 'status-dot online';
    lockBanner.classList.add('hidden');
  } else {
    pill.textContent = 'Offline';
    pill.className = 'status-dot offline';
    if (!state.isPro) lockBanner.classList.remove('hidden');
    else lockBanner.classList.add('hidden');
  }
}

window.addEventListener('online', checkNetworkAndAccess);
window.addEventListener('offline', checkNetworkAndAccess);

function requireOnlineOrPro(actionName) {
  if (!navigator.onLine && !state.isPro) {
    alert('Sin internet: "' + actionName + '" sin conexión es exclusivo de Ruta Flash PRO ($3.75/mes).');
    openProModal();
    return false;
  }
  return true;
}

function startProLiveGps() {
  if (!state.isPro || !navigator.geolocation || gpsWatchId !== null) return;
  gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      liveDriverPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      updateLiveTrackerUI();
      updateDriverMarkerOnMap();
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
  );
}

function stopProLiveGps() {
  if (gpsWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
}

function updateLiveTrackerUI() {
  const trackerEl = document.getElementById('pro-live-tracker');
  if (!state.isPro) {
    trackerEl.classList.add('hidden');
    return;
  }
  trackerEl.classList.remove('hidden');
  const pending = state.orders.filter(o => o.status === 'pending');
  if (pending.length === 0) {
    document.getElementById('tracker-next-client').textContent = 'Sin entregas pendientes';
    document.getElementById('tracker-next-addr').textContent = 'Agrega pedidos para iniciar navegación';
    document.getElementById('tracker-next-dist').textContent = '0.0 km';
    document.getElementById('tracker-next-eta').textContent = '--';
    return;
  }
  const nextStop = pending[0];
  document.getElementById('tracker-next-client').textContent = '#1 ' + nextStop.client;
  document.getElementById('tracker-next-addr').textContent = nextStop.address;
  const origin = liveDriverPos || state.basePoint;
  if (origin && nextStop.lat && nextStop.lng) {
    const distNext = calcDistanceKm(origin.lat, origin.lng, nextStop.lat, nextStop.lng);
    const etaMin = Math.max(1, Math.round((distNext / 28) * 60));
    document.getElementById('tracker-next-dist').textContent = distNext < 1 ? Math.round(distNext * 1000) + ' m' : distNext.toFixed(1) + ' km';
    document.getElementById('tracker-next-eta').textContent = '~' + etaMin + ' min';
  }
}

function calcDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) * 1.28;
}

function calculateTotalRouteMetrics() {
  const pending = state.orders.filter(o => o.status === 'pending' && o.lat && o.lng);
  let totalKm = 0;
  if (pending.length > 0) {
    let prev = state.basePoint || { lat: pending[0].lat, lng: pending[0].lng };
    pending.forEach(stop => {
      totalKm += calcDistanceKm(prev.lat, prev.lng, stop.lat, stop.lng);
      prev = { lat: stop.lat, lng: stop.lng };
    });
    if (state.basePoint) {
      totalKm += calcDistanceKm(prev.lat, prev.lng, state.basePoint.lat, state.basePoint.lng);
    }
  }
  const kml = parseFloat(state.settings.kml) || 35;
  const fuelPrice = parseFloat(state.settings.fuelPrice) || 0.50;
  const liters = state.settings.vehicle === 'bici' ? 0 : (totalKm / kml);
  return { totalKm, liters, fuelCost: liters * fuelPrice };
}

function updateUI() {
  checkNetworkAndAccess();
  const pending = state.orders.filter(o => o.status === 'pending');
  const badge = document.getElementById('plan-badge');
  const adBanner = document.getElementById('ad-banner');
  if (state.isPro) {
    badge.textContent = '👑 PRO Offline';
    badge.className = 'badge-pill pro';
    adBanner.classList.add('hidden');
    startProLiveGps();
    updateLiveTrackerUI();
  } else {
    badge.textContent = 'Gratis · ' + pending.length + '/' + FREE_LIMIT;
    badge.className = 'badge-pill';
    adBanner.classList.remove('hidden');
    stopProLiveGps();
    document.getElementById('pro-live-tracker').classList.add('hidden');
  }
  if (state.basePoint) {
    document.getElementById('base-coords-text').textContent = state.basePoint.lat.toFixed(5) + ', ' + state.basePoint.lng.toFixed(5) + ' (Listo)';
  }
  const { totalKm, liters, fuelCost } = calculateTotalRouteMetrics();
  document.getElementById('metric-km').textContent = totalKm.toFixed(1) + ' km';
  document.getElementById('metric-fuel').textContent = liters.toFixed(2) + ' L ($' + fuelCost.toFixed(2) + ')';
  document.getElementById('count-pending').textContent = pending.length;
  applyLanguageTranslations();
}

window.applyVerifiedProStatus = async function(isVerifiedPaid) {
  if (!isVerifiedPaid) return;
  state.isPro = true;
  saveState();
};

window.openProModal = function() {
  document.getElementById('pro-modal').classList.remove('hidden');
};

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  applyTheme(state.theme || 'light');
  updateUI();
  autoLocateOnStartup();

  document.getElementById('btn-theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('btn-pro-modal').addEventListener('click', openProModal);
  document.getElementById('btn-ad-upgrade').addEventListener('click', openProModal);
  document.getElementById('btn-offline-upgrade').addEventListener('click', openProModal);
  document.getElementById('btn-close-pro').addEventListener('click', () => {
    document.getElementById('pro-modal').classList.add('hidden');
  });

  document.getElementById('btn-activate-pro').addEventListener('click', async () => {
    const billingResult = await requestPlayBillingSubscription();
    if (billingResult && billingResult.ok) {
      document.getElementById('pro-modal').classList.add('hidden');
      showAppToast('✅ ¡Suscripción PRO activada!', 'success');
      return;
    }
    showAppToast('Plan PRO ($3.75/mes): se activa al completar y validar el pago de suscripción en Google Play Billing.', 'warn');
  });
});
