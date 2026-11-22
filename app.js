// ==========================================
// RUTA FLASH v3.2 - LIMITE GRATIS 15 + ONBOARDING COMPLETO + MONETIZACION
// ==========================================

const FREE_LIMIT = 15;

let state = {
  isPro: false,
  theme: 'light',
  languagePref: 'auto',
  onboardingDone: false,
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
let authMode = 'register';
let currentFbUser = null;
let fbAuth = null;
let fbDb = null;

function loadState() {
  try {
    const saved = localStorage.getItem('ruta_flash_state_v3');
    if (saved) {
      const parsed = JSON.parse(saved);
      state = {
        ...state,
        ...parsed,
        settings: { ...state.settings, ...(parsed.settings || {}) },
        orders: Array.isArray(parsed.orders) ? parsed.orders : []
      };
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

function initFirebaseIfConfigured() {
  try {
    if (typeof firebase === 'undefined' || typeof FIREBASE_CONFIG === 'undefined') return;
    if (!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.includes('PEGAR_AQUI')) return;
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    fbAuth = firebase.auth();
    fbDb = firebase.firestore();

    fbAuth.onAuthStateChanged((user) => {
      currentFbUser = user || null;
      const statusEl = document.getElementById('auth-status-text');
      const logoutBtn = document.getElementById('btn-auth-logout');
      if (user) {
        state.email = user.email || state.email;
        if (statusEl) statusEl.textContent = 'Sesión activa: ' + (user.email || user.uid);
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
      } else {
        if (statusEl) statusEl.textContent = 'Estado de sesión: No iniciada';
        if (logoutBtn) logoutBtn.style.display = 'none';
      }
    });
  } catch (e) {
    console.warn('Firebase no inicializado:', e);
  }
}

// ==========================================
// MONETIZACION: ADMOB + GOOGLE PLAY BILLING
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
      console.warn('Digital Goods / Play Billing no disponible:', e);
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
  toast.innerHTML = '<span>' + escapeHtml(message) + '</span>';
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.25s ease';
    setTimeout(() => toast.remove(), 260);
  }, 3600);
}

// ==========================================
// ONBOARDING (1. TERMINOS -> 2. CUENTA -> 3. COMO FUNCIONA)
// ==========================================
function setOnboardingStep(stepNum) {
  [1, 2, 3].forEach((n) => {
    const stepEl = document.getElementById('onb-step-' + n);
    const pillEl = document.getElementById('step-pill-' + n);
    if (stepEl) {
      if (n === stepNum) stepEl.classList.remove('hidden');
      else stepEl.classList.add('hidden');
    }
    if (pillEl) {
      if (n === stepNum) pillEl.classList.add('active');
      else pillEl.classList.remove('active');
    }
  });
}

function syncOnboardingVisibility() {
  const screen = document.getElementById('onboarding-screen');
  if (!screen) return;
  if (!state.onboardingDone) {
    screen.classList.remove('hidden');
    setOnboardingStep(1);
  } else {
    screen.classList.add('hidden');
  }
}

function setAuthMode(mode) {
  authMode = mode;
  const regBtn = document.getElementById('btn-mode-register');
  const logBtn = document.getElementById('btn-mode-login');
  const submitBtn = document.getElementById('btn-onb-email-submit');
  if (mode === 'login') {
    if (regBtn) regBtn.classList.remove('active');
    if (logBtn) logBtn.classList.add('active');
    if (submitBtn) submitBtn.textContent = '🔑 Entrar con mi Cuenta y Continuar';
  } else {
    authMode = 'register';
    if (regBtn) regBtn.classList.add('active');
    if (logBtn) logBtn.classList.remove('active');
    if (submitBtn) submitBtn.textContent = '📝 Crear Cuenta y Continuar';
  }
}

async function handleOnboardingEmailAuth() {
  const email = (document.getElementById('onb-email').value || '').trim();
  const password = document.getElementById('onb-password').value || '';
  const feedback = document.getElementById('onb-auth-feedback');

  if (!email || !email.includes('@')) {
    if (feedback) feedback.textContent = 'Ingresa un correo electrónico válido.';
    return;
  }
  if (password.length < 6) {
    if (feedback) feedback.textContent = 'La contraseña debe tener al menos 6 caracteres.';
    return;
  }

  state.email = email;
  saveState();

  if (fbAuth) {
    try {
      if (authMode === 'login') {
        await fbAuth.signInWithEmailAndPassword(email, password);
      } else {
        const cred = await fbAuth.createUserWithEmailAndPassword(email, password);
        if (cred.user && typeof cred.user.sendEmailVerification === 'function') {
          cred.user.sendEmailVerification().catch(() => {});
        }
      }
      if (feedback) feedback.textContent = '✅ Cuenta verificada.';
    } catch (err) {
      if (feedback) feedback.textContent = 'Aviso: ' + (err && err.message ? err.message : 'No se pudo autenticar en línea; puedes continuar.');
    }
  }
  setOnboardingStep(3);
}

async function handleOnboardingGoogleAuth() {
  const feedback = document.getElementById('onb-auth-feedback');
  if (fbAuth && typeof firebase !== 'undefined' && firebase.auth && firebase.auth.GoogleAuthProvider) {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      const res = await fbAuth.signInWithPopup(provider);
      if (res && res.user && res.user.email) {
        state.email = res.user.email;
        saveState();
      }
      if (feedback) feedback.textContent = '✅ Vinculado con Google.';
      setOnboardingStep(3);
      return;
    } catch (err) {
      if (feedback) feedback.textContent = 'Google Auth: ' + (err && err.message ? err.message : 'Continúa con correo o pasa al siguiente paso.');
    }
  }
  setOnboardingStep(3);
}

// ==========================================
// TRADUCCION (ES / EN / PT)
// ==========================================
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
  },
  en: {
    onb_brand_title: 'Ruta Flash PRO',
    onb_subtitle: 'Initial setup before starting your delivery routes',
    step_1: '1. Terms',
    step_2: '2. Account',
    step_3: '3. How it works',
    terms_title: '📄 Terms & Privacy Policy',
    terms_desc: 'Please review the terms of use and privacy policy before continuing.',
    terms_check: 'I have read and accept the Terms of Use and Privacy Policy of Ruta Flash PRO.',
    btn_accept_continue: 'Accept & Continue →',
    onb_acc_title: '🔐 Account Access',
    onb_acc_desc: 'Create an account with email/password or link your Google account.',
    mode_register: 'Create account',
    mode_login: 'I have an account',
    lbl_email: 'Email address',
    lbl_password: 'Password (at least 6 characters)',
    btn_create_continue: '📝 Create Account & Continue',
    btn_login_continue: '🔑 Sign In & Continue',
    btn_google_link: '🔵 Link / Continue with Google',
    guide_title: '🛵 How Ruta Flash PRO Works',
    btn_start_work: '🚀 Start Working',
    gps_label: '📍 Start & Return Point',
    btn_update_gps: '🎯 Update GPS',
    metric_dist: 'Distance (+Return)',
    metric_fuel: 'Est. Fuel',
    metric_profit: 'Net Profit',
    btn_optimize: '⚡ Optimize Route',
    btn_add_order: '➕ Add Order',
    btn_clear_done: 'Clear delivered',
    nav_route: 'Route',
    nav_new: 'New',
    nav_map: 'Map',
    nav_cash: 'Cash',
    nav_settings: 'Settings',
    lang_title: '🌐 App Language',
    lang_desc: 'Automatically detects your phone language or lets you choose manually.',
    lang_select_label: 'Language'
  },
  pt: {
    onb_brand_title: 'Ruta Flash PRO',
    onb_subtitle: 'Configuração inicial antes de iniciar suas rotas',
    step_1: '1. Termos',
    step_2: '2. Conta',
    step_3: '3. Como funciona',
    terms_title: '📄 Termos e Política de Privacidade',
    terms_desc: 'Leia com atenção os termos de uso e privacidade antes de continuar.',
    terms_check: 'Li e aceito os Termos de Uso e a Política de Privacidade do Ruta Flash PRO.',
    btn_accept_continue: 'Aceitar e Continuar →',
    onb_acc_title: '🔐 Acesso à Conta',
    onb_acc_desc: 'Crie uma conta com e-mail/senha ou vincule sua conta Google.',
    mode_register: 'Criar conta',
    mode_login: 'Já tenho conta',
    lbl_email: 'E-mail',
    lbl_password: 'Senha (mínimo de 6 caracteres)',
    btn_create_continue: '📝 Criar Conta e Continuar',
    btn_login_continue: '🔑 Entrar e Continuar',
    btn_google_link: '🔵 Vincular / Continuar com Google',
    guide_title: '🛵 Como funciona o Ruta Flash PRO',
    btn_start_work: '🚀 Começar a Trabalhar',
    gps_label: '📍 Ponto de Saída e Retorno',
    btn_update_gps: '🎯 Atualizar GPS',
    metric_dist: 'Distância (+Retorno)',
    metric_fuel: 'Combustível Est.',
    metric_profit: 'Lucro Líquido',
    btn_optimize: '⚡ Otimizar Rota',
    btn_add_order: '➕ Novo Pedido',
    btn_clear_done: 'Limpar entregues',
    nav_route: 'Rota',
    nav_new: 'Novo',
    nav_map: 'Mapa',
    nav_cash: 'Caixa',
    nav_settings: 'Ajustes',
    lang_title: '🌐 Idioma do Aplicativo',
    lang_desc: 'Detecta automaticamente o idioma do celular ou permite alterar manualmente.',
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
  const infoEl = document.getElementById('lang-detected-info');
  if (infoEl) {
    infoEl.textContent = 'Idioma activo: ' + activeLang.toUpperCase() + ' (modo: ' + (state.languagePref || 'auto') + ')';
  }
}

// ==========================================
// TEMA DIA / NOCHE
// ==========================================
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

// ==========================================
// NAVEGACION ENTRE PESTAÑAS
// ==========================================
function switchTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const target = document.getElementById(tabId);
  if (target) target.classList.add('active');
  const navBtn = document.querySelector('.nav-item[data-tab="' + tabId + '"]');
  if (navBtn) navBtn.classList.add('active');
  if (tabId === 'tab-mapa') {
    initMapIfNeeded();
    setTimeout(() => {
      if (map) {
        map.invalidateSize();
        renderMapRoute();
      }
    }, 120);
  }
}

// ==========================================
// GPS Y DISTANCIAS
// ==========================================
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
      if (map) updateDriverMarkerOnMap();
    },
    () => {
      if (baseText && !state.basePoint) {
        baseText.textContent = 'Activa la ubicación GPS y toca "Actualizar GPS"';
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
  );
}

function updateBaseGPS() {
  if (!navigator.geolocation) {
    showAppToast('GPS no disponible en este dispositivo', 'warn');
    return;
  }
  showAppToast('Obteniendo ubicación GPS...', 'info');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.basePoint = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      liveDriverPos = { ...state.basePoint };
      saveState();
      showAppToast('✅ Punto de salida y retorno actualizado', 'success');
      if (map) {
        map.setView([state.basePoint.lat, state.basePoint.lng], 15);
        renderMapRoute();
      }
    },
    () => showAppToast('No se pudo leer el GPS. Revisa permisos de ubicación.', 'error'),
    { enableHighAccuracy: true, timeout: 12000 }
  );
}

function checkNetworkAndAccess() {
  const isOnline = navigator.onLine;
  const pill = document.getElementById('net-status');
  const lockBanner = document.getElementById('offline-lock-banner');
  if (pill) {
    if (isOnline) {
      pill.textContent = 'Online';
      pill.className = 'status-dot online';
    } else {
      pill.textContent = 'Offline';
      pill.className = 'status-dot offline';
    }
  }
  if (lockBanner) {
    if (!isOnline && !state.isPro) lockBanner.classList.remove('hidden');
    else lockBanner.classList.add('hidden');
  }
}

window.addEventListener('online', checkNetworkAndAccess);
window.addEventListener('offline', checkNetworkAndAccess);

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
  if (!trackerEl) return;
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

// ==========================================
// OPTIMIZACION DE RUTA Y PARADAS
// ==========================================
function optimizeRoute() {
  const pending = state.orders.filter(o => o.status === 'pending');
  const completed = state.orders.filter(o => o.status !== 'pending');
  if (pending.length <= 1) {
    showAppToast('Necesitas al menos 2 paradas pendientes para optimizar', 'info');
    return;
  }

  const urgent = pending.filter(o => o.priority === 'high');
  const normal = pending.filter(o => o.priority !== 'high');

  function sortNearest(list, startPt) {
    const remaining = [...list];
    const ordered = [];
    let curr = startPt || (remaining[0].lat && remaining[0].lng ? { lat: remaining[0].lat, lng: remaining[0].lng } : null);
    while (remaining.length > 0) {
      if (!curr || !remaining[0].lat || !remaining[0].lng) {
        const item = remaining.shift();
        ordered.push(item);
        if (item.lat && item.lng) curr = { lat: item.lat, lng: item.lng };
        continue;
      }
      let bestIdx = 0;
      let bestDist = Infinity;
      remaining.forEach((item, idx) => {
        const d = item.lat && item.lng ? calcDistanceKm(curr.lat, curr.lng, item.lat, item.lng) : Infinity;
        if (d < bestDist) {
          bestDist = d;
          bestIdx = idx;
        }
      });
      const chosen = remaining.splice(bestIdx, 1)[0];
      ordered.push(chosen);
      if (chosen.lat && chosen.lng) curr = { lat: chosen.lat, lng: chosen.lng };
    }
    return ordered;
  }

  const orderedUrgent = sortNearest(urgent, state.basePoint);
  const lastUrgent = orderedUrgent.length > 0 && orderedUrgent[orderedUrgent.length - 1].lat
    ? { lat: orderedUrgent[orderedUrgent.length - 1].lat, lng: orderedUrgent[orderedUrgent.length - 1].lng }
    : state.basePoint;
  const orderedNormal = sortNearest(normal, lastUrgent);

  state.orders = [...orderedUrgent, ...orderedNormal, ...completed];
  saveState();
  maybeShowInterstitialAd('optimize_route');
  showAppToast('⚡ Ruta optimizada por cercanía y prioridad', 'success');
}

function renderStopsList() {
  const container = document.getElementById('stops-list');
  if (!container) return;
  const pending = state.orders.filter(o => o.status === 'pending');

  if (pending.length === 0) {
    container.innerHTML = '<div class="card"><p class="hint" style="margin:0;">No hay paradas pendientes. Toca "Agregar Pedido" para comenzar.</p></div>';
    return;
  }

  container.innerHTML = pending.map((o, idx) => {
    const totalCobro = (parseFloat(o.productAmount) || 0) + (parseFloat(o.deliveryFee) || 0);
    const vuelto = (o.paymentMethod === 'efectivo' && o.cashGiven)
      ? Math.max(0, parseFloat(o.cashGiven) - totalCobro)
      : 0;
    const navUrl = (o.lat && o.lng)
      ? 'https://www.google.com/maps/dir/?api=1&destination=' + o.lat + ',' + o.lng
      : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(o.address);

    return `
      <div class="stop-card ${o.priority === 'high' ? 'urgent' : ''}">
        <div class="stop-top">
          <div>
            <span class="stop-index">#${idx + 1}</span>
            <strong>${escapeHtml(o.client)}</strong>
            ${o.priority === 'high' ? '<span class="tag-urgent">🔥 Urgente</span>' : ''}
          </div>
          <span class="stop-fee">+$${(parseFloat(o.deliveryFee) || 0).toFixed(2)}</span>
        </div>
        <p class="stop-addr">${escapeHtml(o.address)}</p>
        <div class="stop-meta">
          <span>${o.paymentMethod === 'efectivo' ? '💵 Efectivo' : o.paymentMethod === 'cuenta' ? '📱 Digital' : '✅ Pagado'}: <b>$${totalCobro.toFixed(2)}</b></span>
          ${vuelto > 0 ? '<span>Vuelto: <b>$' + vuelto.toFixed(2) + '</b></span>' : ''}
          ${o.deadline ? '<span>⏰ ' + escapeHtml(o.deadline) + '</span>' : ''}
        </div>
        <div class="stop-actions">
          <a href="${navUrl}" target="_blank" rel="noopener" class="btn-soft btn-sm">🧭 Mapa</a>
          ${o.phone ? '<a href="https://wa.me/' + encodeURIComponent(o.phone.replace(/\D/g, '')) + '" target="_blank" rel="noopener" class="btn-soft btn-sm">💬 WA</a>' : ''}
          <button type="button" class="btn-primary btn-sm" onclick="openDeliveryModal('${o.id}')">✅ Entregar</button>
          <button type="button" class="btn-soft btn-sm" onclick="deleteOrder('${o.id}')">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

window.deleteOrder = function(id) {
  state.orders = state.orders.filter(o => o.id !== id);
  saveState();
  showAppToast('Pedido eliminado', 'info');
};

// ==========================================
// NUEVO PEDIDO Y PARSEO DE WHATSAPP / LINKS
// ==========================================
function parseWhatsAppText() {
  const txt = (document.getElementById('wa-paste').value || '').trim();
  if (!txt) {
    showAppToast('Pega primero un mensaje o enlace de WhatsApp', 'warn');
    return;
  }

  const phoneMatch = txt.match(/(\+?\d[\d\s\-()]{7,15}\d)/);
  if (phoneMatch) {
    document.getElementById('inp-phone').value = phoneMatch[1].replace(/\D/g, '');
  }

  const coordMatch = txt.match(/(-?\d{1,2}\.\d{3,8})\s*,\s*(-?\d{1,3}\.\d{3,8})/);
  if (coordMatch) {
    document.getElementById('inp-lat').value = coordMatch[1];
    document.getElementById('inp-lng').value = coordMatch[2];
  }

  const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length > 0 && !document.getElementById('inp-client').value) {
    document.getElementById('inp-client').value = lines[0].replace(/^cliente\s*:\s*/i, '').slice(0, 60);
  }
  const addrLine = lines.find(l => /calle|av\.?|avenida|sector|edificio|residencia|urb\.?|casa|pto|punto/i.test(l));
  if (addrLine && !document.getElementById('inp-address').value) {
    document.getElementById('inp-address').value = addrLine.slice(0, 120);
  }
  showAppToast('✨ Datos detectados desde el texto', 'success');
}

async function searchAddressCoords() {
  const q = (document.getElementById('inp-address').value || '').trim();
  if (!q) {
    showAppToast('Escribe una dirección para buscar', 'warn');
    return;
  }
  if (!navigator.onLine) {
    showAppToast('Sin internet para buscar dirección. Toca el punto en el Mapa.', 'warn');
    return;
  }
  try {
    const res = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q));
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      document.getElementById('inp-lat').value = parseFloat(data[0].lat).toFixed(6);
      document.getElementById('inp-lng').value = parseFloat(data[0].lon).toFixed(6);
      showAppToast('📍 Coordenadas encontradas', 'success');
    } else {
      showAppToast('No se encontró coincidencia exacta. Puedes fijar el pin en Mapa.', 'warn');
    }
  } catch (e) {
    showAppToast('Error buscando dirección', 'error');
  }
}

function handleOrderSubmit(e) {
  e.preventDefault();
  const pendingCount = state.orders.filter(o => o.status === 'pending').length;

  if (!state.isPro && pendingCount >= FREE_LIMIT) {
    showAppToast('Límite del plan Gratis alcanzado (' + FREE_LIMIT + ' paradas). Pásate a PRO ($3.75/mes) para paradas ilimitadas.', 'warn');
    openProModal();
    return;
  }

  const client = (document.getElementById('inp-client').value || '').trim();
  const address = (document.getElementById('inp-address').value || '').trim();
  if (!client || !address) {
    showAppToast('Completa cliente y dirección', 'warn');
    return;
  }

  const latVal = parseFloat(document.getElementById('inp-lat').value);
  const lngVal = parseFloat(document.getElementById('inp-lng').value);

  const newOrder = {
    id: 'ord_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    client,
    phone: (document.getElementById('inp-phone').value || '').trim(),
    address,
    lat: !isNaN(latVal) ? latVal : (state.basePoint ? state.basePoint.lat : null),
    lng: !isNaN(lngVal) ? lngVal : (state.basePoint ? state.basePoint.lng : null),
    priority: document.getElementById('inp-priority').value || 'normal',
    deadline: document.getElementById('inp-deadline').value || '',
    productAmount: parseFloat(document.getElementById('inp-product-amount').value) || 0,
    deliveryFee: parseFloat(document.getElementById('inp-delivery-fee').value) || 0,
    paymentMethod: document.getElementById('inp-payment-method').value || 'efectivo',
    cashGiven: parseFloat(document.getElementById('inp-cash-given').value) || 0,
    status: 'pending',
    deliveredAt: null,
    proofPhoto: null,
    deliveryNote: ''
  };

  state.orders.push(newOrder);
  saveState();
  document.getElementById('order-form').reset();
  document.getElementById('wa-paste').value = '';
  document.getElementById('inp-delivery-fee').value = '2.00';
  showAppToast('✅ Pedido agregado a la ruta', 'success');
  switchTab('tab-ruta');
}

// ==========================================
// CONFIRMAR ENTREGA + COMPRESION DE FOTO + VISOR
// ==========================================
function compressImageFile(file, maxWidth = 800, quality = 0.72) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

window.openDeliveryModal = function(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  currentDeliveringId = orderId;
  compressedPhotoBase64 = null;
  document.getElementById('modal-client-name').textContent = 'Cliente: ' + order.client + ' — ' + order.address;
  document.getElementById('inp-proof-photo').value = '';
  document.getElementById('inp-delivery-note').value = '';
  const prev = document.getElementById('photo-preview');
  prev.src = '';
  prev.classList.add('hidden');
  document.getElementById('delivery-modal').classList.remove('hidden');
};

function confirmDelivery() {
  if (!currentDeliveringId) return;
  const idx = state.orders.findIndex(o => o.id === currentDeliveringId);
  if (idx === -1) return;
  state.orders[idx].status = 'completed';
  state.orders[idx].deliveredAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  state.orders[idx].deliveryNote = (document.getElementById('inp-delivery-note').value || '').trim();
  if (compressedPhotoBase64) {
    state.orders[idx].proofPhoto = compressedPhotoBase64;
  }
  currentDeliveringId = null;
  compressedPhotoBase64 = null;
  document.getElementById('delivery-modal').classList.add('hidden');
  saveState();
  maybeShowInterstitialAd('complete_delivery');
  showAppToast('✅ Entrega registrada', 'success');
}

window.viewProofPhoto = function(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order || !order.proofPhoto) return;
  document.getElementById('viewer-title').textContent = '📸 ' + order.client;
  document.getElementById('viewer-subtitle').textContent = order.address + (order.deliveryNote ? ' · ' + order.deliveryNote : '');
  document.getElementById('viewer-full-img').src = order.proofPhoto;
  document.getElementById('photo-viewer-modal').classList.remove('hidden');
};

// ==========================================
// CUADRE DE CAJA Y ENTREGAS COMPLETADAS
// ==========================================
function calculateCashSummary() {
  const completed = state.orders.filter(o => o.status === 'completed');
  let cashInHand = 0;
  let bankInAccount = 0;
  let merchantOwed = 0;
  let driverGross = 0;

  completed.forEach(o => {
    const prod = parseFloat(o.productAmount) || 0;
    const fee = parseFloat(o.deliveryFee) || 0;
    const total = prod + fee;
    driverGross += fee;
    merchantOwed += prod;

    if (o.paymentMethod === 'efectivo') {
      cashInHand += total;
    } else if (o.paymentMethod === 'cuenta') {
      bankInAccount += total;
    }
  });

  const { fuelCost } = calculateTotalRouteMetrics();
  const netProfit = driverGross - fuelCost;

  return { cashInHand, bankInAccount, merchantOwed, driverGross, fuelCost, netProfit, completed };
}

function renderCashAndCompleted() {
  const { cashInHand, bankInAccount, merchantOwed, driverGross, fuelCost, netProfit, completed } = calculateCashSummary();

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setText('fin-cash', '$' + cashInHand.toFixed(2));
  setText('fin-bank', '$' + bankInAccount.toFixed(2));
  setText('fin-merchant', '$' + merchantOwed.toFixed(2));
  setText('fin-driver-gross', '$' + driverGross.toFixed(2));
  setText('fin-fuel-cost', '-$' + fuelCost.toFixed(2));
  setText('fin-net-profit', '$' + netProfit.toFixed(2));
  setText('metric-profit', '$' + netProfit.toFixed(2));

  const listEl = document.getElementById('completed-list');
  if (!listEl) return;
  if (completed.length === 0) {
    listEl.innerHTML = '<p class="hint" style="margin:0;">Aún no hay entregas confirmadas hoy.</p>';
    return;
  }
  listEl.innerHTML = completed.map(o => `
    <div class="completed-item">
      <div>
        <strong>${escapeHtml(o.client)}</strong> <small>(${escapeHtml(o.deliveredAt || '')})</small>
        <p class="hint" style="margin:2px 0 0;">${escapeHtml(o.address)}${o.deliveryNote ? ' · ' + escapeHtml(o.deliveryNote) : ''}</p>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <b>$${((parseFloat(o.productAmount) || 0) + (parseFloat(o.deliveryFee) || 0)).toFixed(2)}</b>
        ${o.proofPhoto ? '<button type="button" class="btn-tiny" onclick="viewProofPhoto(\'' + o.id + '\')">📷 Foto</button>' : ''}
      </div>
    </div>
  `).join('');
}

function shareCashByWhatsApp() {
  const { cashInHand, bankInAccount, merchantOwed, driverGross, fuelCost, netProfit, completed } = calculateCashSummary();
  const { totalKm } = calculateTotalRouteMetrics();
  const lines = [
    '*CUADRE DE CAJA - RUTA FLASH*',
    'Entregas completadas: ' + completed.length,
    'Recorrido estimado: ' + totalKm.toFixed(1) + ' km',
    'Efectivo en mano: $' + cashInHand.toFixed(2),
    'En cuenta / digital: $' + bankInAccount.toFixed(2),
    'Debo a comercios: $' + merchantOwed.toFixed(2),
    'Envíos brutos: $' + driverGross.toFixed(2),
    'Gasolina estimada: -$' + fuelCost.toFixed(2),
    '*Ganancia neta: $' + netProfit.toFixed(2) + '*'
  ];
  window.open('https://wa.me/?text=' + encodeURIComponent(lines.join('\n')), '_blank', 'noopener');
}

// ==========================================
// MAPA LEAFLET
// ==========================================
function initMapIfNeeded() {
  if (map || typeof L === 'undefined') return;
  const center = state.basePoint ? [state.basePoint.lat, state.basePoint.lng] : [10.6012, -66.9321];
  map = L.map('map').setView(center, 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);

  map.on('click', (e) => {
    document.getElementById('inp-lat').value = e.latlng.lat.toFixed(6);
    document.getElementById('inp-lng').value = e.latlng.lng.toFixed(6);
    switchTab('tab-nuevo');
    showAppToast('📍 Destino fijado desde el mapa', 'success');
  });

  renderMapRoute();
}

function updateDriverMarkerOnMap() {
  if (!map || typeof L === 'undefined') return;
  const pt = liveDriverPos || state.basePoint;
  if (!pt) return;
  if (!driverMarker) {
    driverMarker = L.circleMarker([pt.lat, pt.lng], {
      radius: 8,
      color: '#ffffff',
      weight: 2,
      fillColor: '#2563eb',
      fillOpacity: 1
    }).addTo(map).bindPopup('Tu ubicación GPS');
  } else {
    driverMarker.setLatLng([pt.lat, pt.lng]);
  }
}

function renderMapRoute() {
  if (!map || !markersLayer || typeof L === 'undefined') return;
  markersLayer.clearLayers();
  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = null;
  }
  updateDriverMarkerOnMap();

  const points = [];
  if (state.basePoint) {
    points.push([state.basePoint.lat, state.basePoint.lng]);
    L.marker([state.basePoint.lat, state.basePoint.lng]).addTo(markersLayer).bindPopup('🏁 Base / Retorno');
  }

  const pending = state.orders.filter(o => o.status === 'pending' && o.lat && o.lng);
  pending.forEach((o, i) => {
    points.push([o.lat, o.lng]);
    L.marker([o.lat, o.lng]).addTo(markersLayer).bindPopup('#' + (i + 1) + ' ' + escapeHtml(o.client));
  });

  if (points.length >= 2) {
    routeLine = L.polyline(points, { color: '#2563eb', weight: 4 }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [24, 24] });
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==========================================
// UI PRINCIPAL Y EVENTOS
// ==========================================
function updateUI() {
  checkNetworkAndAccess();
  const pending = state.orders.filter(o => o.status === 'pending');
  const badge = document.getElementById('plan-badge');
  const adBanner = document.getElementById('ad-banner');

  if (state.isPro) {
    if (badge) {
      badge.textContent = '👑 PRO Offline';
      badge.className = 'badge-pill pro';
    }
    if (adBanner) adBanner.classList.add('hidden');
    startProLiveGps();
    updateLiveTrackerUI();
  } else {
    if (badge) {
      badge.textContent = 'Gratis · ' + pending.length + '/' + FREE_LIMIT;
      badge.className = 'badge-pill';
    }
    if (adBanner) adBanner.classList.remove('hidden');
    stopProLiveGps();
    const trackerEl = document.getElementById('pro-live-tracker');
    if (trackerEl) trackerEl.classList.add('hidden');
  }

  const baseEl = document.getElementById('base-coords-text');
  if (state.basePoint && baseEl) {
    baseEl.textContent = state.basePoint.lat.toFixed(5) + ', ' + state.basePoint.lng.toFixed(5) + ' (Listo)';
  }

  const { totalKm, liters, fuelCost } = calculateTotalRouteMetrics();
  document.getElementById('metric-km').textContent = totalKm.toFixed(1) + ' km';
  document.getElementById('metric-fuel').textContent = liters.toFixed(2) + ' L ($' + fuelCost.toFixed(2) + ')';
  document.getElementById('count-pending').textContent = pending.length;

  renderStopsList();
  renderCashAndCompleted();
  renderMapRoute();
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
  initFirebaseIfConfigured();
  applyTheme(state.theme || 'light');

  document.getElementById('cfg-vehicle').value = state.settings.vehicle || 'moto';
  document.getElementById('cfg-kml').value = state.settings.kml || 35;
  document.getElementById('cfg-fuel-price').value = state.settings.fuelPrice || 0.50;
  document.getElementById('cfg-language').value = state.languagePref || 'auto';

  syncOnboardingVisibility();
  updateUI();
  autoLocateOnStartup();

  // Onboarding
  document.getElementById('btn-onb-accept-policy').addEventListener('click', () => {
    const chk = document.getElementById('chk-accept-policy');
    if (!chk || !chk.checked) {
      showAppToast('Marca la casilla para aceptar los Términos y Política de Privacidad.', 'warn');
      return;
    }
    setOnboardingStep(2);
  });
  document.getElementById('btn-mode-register').addEventListener('click', () => setAuthMode('register'));
  document.getElementById('btn-mode-login').addEventListener('click', () => setAuthMode('login'));
  document.getElementById('btn-onb-email-submit').addEventListener('click', handleOnboardingEmailAuth);
  document.getElementById('btn-onb-google').addEventListener('click', handleOnboardingGoogleAuth);
  document.getElementById('btn-onb-start-app').addEventListener('click', () => {
    state.onboardingDone = true;
    saveState();
    syncOnboardingVisibility();
    showAppToast('🚀 ¡Listo para trabajar con Ruta Flash!', 'success');
  });

  // Navegación inferior
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
  });

  document.getElementById('btn-go-add').addEventListener('click', () => switchTab('tab-nuevo'));
  document.getElementById('btn-set-base').addEventListener('click', updateBaseGPS);
  document.getElementById('btn-optimize').addEventListener('click', optimizeRoute);
  document.getElementById('btn-clear-completed').addEventListener('click', () => {
    state.orders = state.orders.filter(o => o.status === 'pending');
    saveState();
    showAppToast('Entregas completadas limpiadas', 'info');
  });

  // Nuevo pedido
  document.getElementById('btn-parse-wa').addEventListener('click', parseWhatsAppText);
  document.getElementById('btn-search-addr').addEventListener('click', searchAddressCoords);
  document.getElementById('btn-use-my-gps').addEventListener('click', () => {
    const pt = liveDriverPos || state.basePoint;
    if (!pt) {
      updateBaseGPS();
      return;
    }
    document.getElementById('inp-lat').value = pt.lat.toFixed(6);
    document.getElementById('inp-lng').value = pt.lng.toFixed(6);
    showAppToast('📍 Ubicación GPS colocada en el pedido', 'success');
  });
  document.getElementById('order-form').addEventListener('submit', handleOrderSubmit);

  // Mapa
  document.getElementById('btn-center-map').addEventListener('click', () => {
    const pt = liveDriverPos || state.basePoint;
    if (map && pt) {
      map.setView([pt.lat, pt.lng], 15);
    } else {
      updateBaseGPS();
    }
  });

  // Entrega y foto
  document.getElementById('inp-proof-photo').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    compressedPhotoBase64 = await compressImageFile(file);
    const prev = document.getElementById('photo-preview');
    prev.src = compressedPhotoBase64;
    prev.classList.remove('hidden');
  });
  document.getElementById('btn-cancel-delivery').addEventListener('click', () => {
    currentDeliveringId = null;
    document.getElementById('delivery-modal').classList.add('hidden');
  });
  document.getElementById('btn-confirm-delivery').addEventListener('click', confirmDelivery);
  document.getElementById('btn-close-viewer').addEventListener('click', () => {
    document.getElementById('photo-viewer-modal').classList.add('hidden');
  });

  // Caja
  document.getElementById('btn-share-summary').addEventListener('click', shareCashByWhatsApp);

  // Ajustes y cuenta
  document.getElementById('btn-save-settings').addEventListener('click', () => {
    state.settings.vehicle = document.getElementById('cfg-vehicle').value;
    state.settings.kml = parseFloat(document.getElementById('cfg-kml').value) || 35;
    state.settings.fuelPrice = parseFloat(document.getElementById('cfg-fuel-price').value) || 0.50;
    saveState();
    showAppToast('⚙️ Ajustes guardados', 'success');
  });

  document.getElementById('btn-auth-register').addEventListener('click', async () => {
    const email = (document.getElementById('cfg-email').value || '').trim();
    const pass = document.getElementById('cfg-password').value || '';
    if (!email || pass.length < 6) {
      showAppToast('Ingresa correo y contraseña (mínimo 6 caracteres)', 'warn');
      return;
    }
    if (!fbAuth) {
      showAppToast('Firebase Auth no disponible en este entorno', 'warn');
      return;
    }
    try {
      await fbAuth.createUserWithEmailAndPassword(email, pass);
      state.email = email;
      saveState();
      showAppToast('✅ Cuenta creada', 'success');
    } catch (e) {
      showAppToast('Error: ' + (e && e.message ? e.message : 'No se pudo crear la cuenta'), 'error');
    }
  });

  document.getElementById('btn-auth-login').addEventListener('click', async () => {
    const email = (document.getElementById('cfg-email').value || '').trim();
    const pass = document.getElementById('cfg-password').value || '';
    if (!email || pass.length < 6) {
      showAppToast('Ingresa correo y contraseña (mínimo 6 caracteres)', 'warn');
      return;
    }
    if (!fbAuth) {
      showAppToast('Firebase Auth no disponible en este entorno', 'warn');
      return;
    }
    try {
      await fbAuth.signInWithEmailAndPassword(email, pass);
      state.email = email;
      saveState();
      showAppToast('✅ Sesión iniciada', 'success');
    } catch (e) {
      showAppToast('Error: ' + (e && e.message ? e.message : 'No se pudo iniciar sesión'), 'error');
    }
  });

  document.getElementById('btn-auth-logout').addEventListener('click', async () => {
    if (fbAuth) {
      await fbAuth.signOut().catch(() => {});
    }
    showAppToast('Sesión cerrada', 'info');
  });

  document.getElementById('cfg-language').addEventListener('change', (e) => {
    state.languagePref = e.target.value;
    saveState();
  });

  document.getElementById('btn-clear-local-data').addEventListener('click', () => {
    if (!confirm('¿Borrar todos los pedidos y datos locales de este dispositivo?')) return;
    state.orders = [];
    saveState();
    showAppToast('Datos locales borrados', 'info');
  });

  document.getElementById('btn-request-account-deletion').addEventListener('click', () => {
    const subject = encodeURIComponent('Solicitud de eliminación de cuenta - Ruta Flash');
    const body = encodeURIComponent('Hola, solicito la eliminación de mi cuenta y datos asociados en Ruta Flash. Correo: ' + (state.email || ''));
    window.open('mailto:' + SUPPORT_EMAIL + '?subject=' + subject + '&body=' + body, '_blank');
  });

  // Tema y PRO
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
