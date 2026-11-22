/**
 * ============================================================================
 * RUTAFLASH PRO - MOTOR PRINCIPAL (OFFLINE-FIRST + IA WHATSAPP + TSP + ADMOB)
 * ============================================================================
 */

// --- ESTADO GLOBAL DE LA APLICACIÓN ---
let state = {
  stops: [],
  isPro: false,
  bonusStopsToday: 0,
  deliveriesCounter: 0,
  filter: "all",
  lang: "es",
  settings: {
    currency: "USD",
    navApp: "google",
    defaultFee: 2.00,
    waTemplate: "¡Hola {nombre}! Soy tu repartidor de RutaFlash 🛵. Voy en camino hacia {direccion}. Monto a cobrar: {monto}."
  }
};

let deferredPrompt = null;

// --- DICCIONARIO MULTI-IDIOMA (ESPAÑOL, INGLÉS, PORTUGUÉS PARA ESCALA MUNDIAL) ---
const I18N = {
  es: {
    cashHand: "Efectivo en mano",
    digitalPaid: "Digital / Transf.",
    myEarnings: "Mi Ganancia",
    addStop: "Agregar Parada",
    pasteWhatsapp: "Pegar WhatsApp",
    optimize: "Ordenar Ruta",
    all: "Todas",
    pending: "Pendientes",
    delivered: "Entregadas",
    clearDone: "Limpiar hechas",
    dailyClosure: "💰 Cierre de Caja del Día",
    closureDesc: "Control exacto de dinero cobrado a clientes y tus ganancias netas por envíos.",
    totalCollected: "Total Cobrado Clientes",
    pendingToCollect: "Por Cobrar (En ruta)",
    cashToSettle: "Efectivo a Entregar",
    deliveryFees: "Tus Ganancias (Envíos)",
    navPrefs: "⚙️ Preferencias de Navegación",
    defaultNav: "Aplicación GPS preferida al tocar 'Ir':",
    tabRoute: "Ruta",
    tabWallet: "Caja",
    tabSettings: "Ajustes"
  },
  en: {
    cashHand: "Cash in hand",
    digitalPaid: "Digital / Transfer",
    myEarnings: "My Earnings",
    addStop: "Add Stop",
    pasteWhatsapp: "Paste WhatsApp",
    optimize: "Optimize Route",
    all: "All",
    pending: "Pending",
    delivered: "Delivered",
    clearDone: "Clear done",
    dailyClosure: "💰 Daily Cash Closure",
    closureDesc: "Exact tracking of cash collected from customers and your net delivery fees.",
    totalCollected: "Total Collected",
    pendingToCollect: "Pending Collection",
    cashToSettle: "Cash to Settle",
    deliveryFees: "Your Delivery Fees",
    navPrefs: "⚙️ Navigation Preferences",
    defaultNav: "Preferred GPS App when tapping 'Go':",
    tabRoute: "Route",
    tabWallet: "Wallet",
    tabSettings: "Settings"
  },
  pt: {
    cashHand: "Dinheiro em mãos",
    digitalPaid: "Pix / Cartão",
    myEarnings: "Meus Ganhos",
    addStop: "Nova Parada",
    pasteWhatsapp: "Colar WhatsApp",
    optimize: "Ordenar Rota",
    all: "Todas",
    pending: "Pendentes",
    delivered: "Entregues",
    clearDone: "Limpar feitas",
    dailyClosure: "💰 Fechamento de Caixa",
    closureDesc: "Controle exato do dinheiro cobrado e seus ganhos líquidos por entrega.",
    totalCollected: "Total Cobrado",
    pendingToCollect: "A Cobrar na Rota",
    cashToSettle: "Dinheiro a Repassar",
    deliveryFees: "Seus Ganhos (Taxas)",
    navPrefs: "⚙️ Preferências de GPS",
    defaultNav: "App de GPS preferido ao tocar em 'Ir':",
    tabRoute: "Rota",
    tabWallet: "Caixa",
    tabSettings: "Ajustes"
  }
};

// --- INICIALIZACIÓN ---
document.addEventListener("DOMContentLoaded", () => {
  loadState();
  registerServiceWorker();
  initCurrencySelector();
  applySettingsToUI();
  applyLanguage();
  initAdMobBridge();
  bindEvents();
  renderAll();
});

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((err) => console.warn("SW error:", err));
  }
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const installBtn = document.getElementById("btnInstallPWA");
  if (installBtn) installBtn.style.display = "block";
});

// --- PERSISTENCIA LOCAL (OFFLINE-FIRST) ---
function loadState() {
  try {
    const saved = localStorage.getItem("rutaflash_pro_state");
    if (saved) {
      const parsed = JSON.parse(saved);
      state = { ...state, ...parsed, settings: { ...state.settings, ...(parsed.settings || {}) } };
    }
  } catch (e) {
    console.error("Error cargando datos locales", e);
  }
}

function saveState() {
  localStorage.setItem("rutaflash_pro_state", JSON.stringify(state));
}

// --- PUENTE DE GOOGLE ADMOB (LISTO PARA CAPAS NATIVAS / PWABUILDER / CAPACITOR) ---
function initAdMobBridge() {
  const bannerSlot = document.getElementById("admobBannerContainer");
  if (!APP_CONFIG.admob.enabled || state.isPro) {
    bannerSlot.style.display = "none";
    document.body.style.paddingBottom = "70px";
    return;
  }

  bannerSlot.style.display = "flex";
  document.body.style.paddingBottom = "125px";

  // Si la app corre dentro de un contenedor nativo con plugin AdMob (Capacitor/Cordova)
  if (window.admob && window.admob.banner) {
    window.admob.banner.config({
      id: APP_CONFIG.admob.android.bannerId,
      isTesting: APP_CONFIG.admob.testMode,
      autoShow: true
    });
    window.admob.banner.prepare();
  }
}

function triggerInterstitialAd() {
  if (!APP_CONFIG.admob.enabled || state.isPro) return;
  state.deliveriesCounter++;
  if (state.deliveriesCounter % APP_CONFIG.admob.interstitialEveryNDeliveries === 0) {
    if (window.admob && window.admob.interstitial) {
      window.admob.interstitial.config({
        id: APP_CONFIG.admob.android.interstitialId,
        isTesting: APP_CONFIG.admob.testMode,
        autoShow: true
      });
      window.admob.interstitial.prepare();
    } else {
      showToast("📢 Anuncio patrocinado (Intersticial AdMob)");
    }
  }
}

function triggerRewardedAd(onRewardSuccess) {
  if (window.admob && window.admob.rewardvideo) {
    window.admob.rewardvideo.config({
      id: APP_CONFIG.admob.android.rewardedId,
      isTesting: APP_CONFIG.admob.testMode,
      autoShow: true
    });
    window.admob.rewardvideo.prepare();
    document.addEventListener("admob.rewardvideo.events.REWARD", onRewardSuccess, { once: true });
  } else {
    // Simulación limpia cuando se prueba en navegador web antes de compilar APK
    showToast("🎬 Reproduciendo anuncio bonificado...");
    setTimeout(() => {
      onRewardSuccess();
    }, 1500);
  }
}

// --- CONTROL DE LÍMITES FREEMIUM ---
function getMaxAllowedStops() {
  if (state.isPro) return 9999;
  return APP_CONFIG.plans.freeMaxStops + state.bonusStopsToday;
}

function canAddMoreStops(countToAdd = 1) {
  const max = getMaxAllowedStops();
  if (state.stops.length + countToAdd > max) {
    openModal("modalPro");
    showToast(`⚠️ Límite alcanzado (${max} paradas). Desbloquea más gratis o pasa a PRO.`);
    return false;
  }
  return true;
}

// --- GEOCODIFICACIÓN GRATUITA (OPENSTREETMAP NOMINATIM - COSTO $0) ---
async function geocodeAddress(addressText) {
  try {
    const query = encodeURIComponent(addressText);
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${query}`;
    const res = await fetch(url, { headers: { "Accept-Language": state.lang } });
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (e) {
    console.warn("Sin conexión para geocodificar, usando modo offline por texto.");
  }
  return null;
}

// --- ALGORITMO DE OPTIMIZACIÓN DE RUTAS (TSP NEAREST NEIGHBOR + PRIORIDAD URGENTE) ---
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function optimizeRoute() {
  const pending = state.stops.filter((s) => !s.delivered);
  const delivered = state.stops.filter((s) => s.delivered);

  if (pending.length < 2) {
    showToast("ℹ️ Agrega al menos 2 paradas pendientes para ordenar.");
    return;
  }

  // Separar urgentes primero
  const urgents = pending.filter((s) => s.priority === "urgent");
  const normals = pending.filter((s) => s.priority !== "urgent");

  const sortByProximity = (list, startCoords) => {
    const unvisited = [...list];
    const sorted = [];
    let currentCoords = startCoords;

    while (unvisited.length > 0) {
      if (!currentCoords) {
        // Si no hay coordenadas GPS iniciales, tomar el primero que tenga coords o el primero de la lista
        const idxWithCoords = unvisited.findIndex((item) => item.lat && item.lng);
        const nextItem = idxWithCoords >= 0 ? unvisited.splice(idxWithCoords, 1)[0] : unvisited.shift();
        sorted.push(nextItem);
        if (nextItem.lat && nextItem.lng) currentCoords = { lat: nextItem.lat, lng: nextItem.lng };
        continue;
      }

      let bestIdx = 0;
      let minDist = Infinity;

      unvisited.forEach((item, idx) => {
        if (item.lat && item.lng) {
          const d = haversineDistance(currentCoords.lat, currentCoords.lng, item.lat, item.lng);
          if (d < minDist) {
            minDist = d;
            bestIdx = idx;
          }
        }
      });

      const chosen = unvisited.splice(bestIdx, 1)[0];
      sorted.push(chosen);
      if (chosen.lat && chosen.lng) {
        currentCoords = { lat: chosen.lat, lng: chosen.lng };
      }
    }
    return sorted;
  };

  // Intentar usar GPS actual del repartidor como punto de partida
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const start = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const sortedUrgents = sortByProximity(urgents, start);
        const lastUrgent = sortedUrgents[sortedUrgents.length - 1];
        const nextStart = lastUrgent && lastUrgent.lat ? { lat: lastUrgent.lat, lng: lastUrgent.lng } : start;
        const sortedNormals = sortByProximity(normals, nextStart);

        state.stops = [...sortedUrgents, ...sortedNormals, ...delivered];
        saveState();
        renderAll();
        showToast("🧭 ¡Ruta optimizada desde tu ubicación GPS!");
      },
      () => {
        const sortedUrgents = sortByProximity(urgents, null);
        const sortedNormals = sortByProximity(normals, null);
        state.stops = [...sortedUrgents, ...sortedNormals, ...delivered];
        saveState();
        renderAll();
        showToast("🧭 ¡Ruta ordenada por prioridad y cercanía!");
      },
      { timeout: 3500 }
    );
  } else {
    state.stops = [...urgents, ...normals, ...delivered];
    saveState();
    renderAll();
    showToast("🧭 ¡Ruta ordenada!");
  }
}

// --- LECTOR INTELIGENTE DE WHATSAPP (EXTRACCIÓN AUTOMÁTICA SIN COSTO DE API) ---
function parseWhatsAppText(rawText) {
  // Permite separar múltiples pedidos si están divididos por doble salto de línea o "---"
  const blocks = rawText
    .split(/
\s*
|---+/)
    .map((b) => b.trim())
    .filter((b) => b.length > 5);

  const extractedStops = [];

  blocks.forEach((block) => {
    const lines = block.split("
").map((l) => l.trim()).filter(Boolean);

    let client = "";
    let phone = "";
    let address = "";
    let amount = 0;
    let paymentMethod = "cash";
    let notes = [];

    // Detectar teléfono (ej: +58 414-1234567, 04121234567, 55 1234 5678)
    const phoneMatch = block.match(/(\+?\d{1,3}[\s-]?)?\(?\d{3,4}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
    if (phoneMatch) phone = phoneMatch[0].trim();

    // Detectar monto a cobrar (ej: $15, 15$, 25.50 USD, Bs 1200, Cobrar: 20)
    const amountMatch = block.match(/(?:cobrar|monto|total|pagar|\$|bs\.?|usd|€|r\$)\s*:?\s*(\d+(?:[.,]\d{1,2})?)/i) ||
                        block.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:\$|usd|bs|dolares|bolivares|euros|reais)/i);
    if (amountMatch) {
      amount = parseFloat(amountMatch[1].replace(",", "."));
    }

    // Detectar método de pago
    if (/pagado|listo|cancelado|ya pag[oó]/i.test(block)) {
      paymentMethod = "paid";
    } else if (/transferencia|pago\s*m[oó]vil|zelle|pix|binance|tarjeta/i.test(block)) {
      paymentMethod = "digital";
    }

    lines.forEach((line) => {
      if (/^(cliente|nombre|para|recibe)\s*:/i.test(line)) {
        client = line.replace(/^(cliente|nombre|para|recibe)\s*:/i, "").trim();
      } else if (/^(dir|direcci[oó]n|ubicaci[oó]n|destino|sector)\s*:/i.test(line)) {
        address = line.replace(/^(dir|direcci[oó]n|ubicaci[oó]n|destino|sector)\s*:/i, "").trim();
      } else if (/^(nota|ref|referencia|obs|observaci[oó]n)\s*:/i.test(line)) {
        notes.push(line.replace(/^(nota|ref|referencia|obs|observaci[oó]n)\s*:/i, "").trim());
      } else if (!address && line.length > 8 && !line.includes(phone) && !/^(tel|tlf|cobrar|monto)/i.test(line)) {
        // Si no tiene etiqueta explícita, asumir la línea descriptiva más larga como dirección
        if (!client && line.split(" ").length <= 3 && !/\d/.test(line)) {
          client = line;
        } else {
          address = line;
        }
      }
    });

    if (!address) address = lines[0];

    extractedStops.push({
      id: "stop_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
      address,
      client: client || "Cliente WhatsApp",
      phone,
      amount: isNaN(amount) ? 0 : amount,
      paymentMethod,
      fee: parseFloat(state.settings.defaultFee) || 0,
      priority: /urgente|r[aá]pido|caliente/i.test(block) ? "urgent" : "normal",
      notes: notes.join(" | "),
      lat: null,
      lng: null,
      delivered: false,
      createdAt: new Date().toISOString()
    });
  });

  return extractedStops;
}

// --- DEEP LINKS DE NAVEGACIÓN EXTERNA (COSTO $0 ILIMITADO) ---
function openExternalNavigation(stop) {
  const destination = stop.lat && stop.lng ? `${stop.lat},${stop.lng}` : encodeURIComponent(stop.address);
  const navApp = state.settings.navApp;

  let url = "";
  if (navApp === "waze") {
    url = stop.lat && stop.lng
      ? `https://waze.com/ul?ll=${stop.lat},${stop.lng}&navigate=yes`
      : `https://waze.com/ul?q=${encodeURIComponent(stop.address)}&navigate=yes`;
  } else if (navApp === "apple") {
    url = `https://maps.apple.com/?daddr=${destination}&dirflg=d`;
  } else {
    url = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
  }

  window.open(url, "_blank");
}

function openWhatsAppClient(stop) {
  if (!stop.phone) {
    showToast("⚠️ Esta parada no tiene teléfono registrado.");
    return;
  }
  const cleanPhone = stop.phone.replace(/[^\d]/g, "");
  const sym = getCurrencySymbol();
  const msg = state.settings.waTemplate
    .replace("{nombre}", stop.client || "Cliente")
    .replace("{direccion}", stop.address)
    .replace("{monto}", `${sym}${stop.amount.toFixed(2)}`);

  window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
}

// --- RENDERIZADO DE INTERFAZ ---
function getCurrencySymbol() {
  const found = APP_CONFIG.currencies.find((c) => c.code === state.settings.currency);
  return found ? found.symbol : "$";
}

function renderAll() {
  renderHeaderAndStats();
  renderStopsList();
  renderWalletView();
}

function renderHeaderAndStats() {
  const sym = getCurrencySymbol();
  const maxStops = getMaxAllowedStops();
  const badge = document.getElementById("planBadge");

  if (state.isPro) {
    badge.textContent = "PRO 👑";
    badge.className = "badge-pro";
    document.getElementById("headerSubtitle").textContent = `${state.stops.length} paradas • Ilimitado`;
  } else {
    badge.textContent = "GRATIS";
    badge.className = "badge-free";
    document.getElementById("headerSubtitle").textContent = `${state.stops.length} / ${maxStops} paradas activas`;
  }

  let cashHand = 0;
  let digitalPaid = 0;
  let myEarnings = 0;

  state.stops.forEach((s) => {
    if (s.delivered) {
      myEarnings += Number(s.fee || 0);
      if (s.paymentMethod === "cash") cashHand += Number(s.amount || 0);
      if (s.paymentMethod === "digital") digitalPaid += Number(s.amount || 0);
    }
  });

  document.getElementById("statCash").textContent = `${sym}${cashHand.toFixed(2)}`;
  document.getElementById("statDigital").textContent = `${sym}${digitalPaid.toFixed(2)}`;
  document.getElementById("statEarnings").textContent = `${sym}${myEarnings.toFixed(2)}`;
}

function renderStopsList() {
  const container = document.getElementById("stopsList");
  const sym = getCurrencySymbol();

  const filtered = state.stops.filter((s) => {
    if (state.filter === "pending") return !s.delivered;
    if (state.filter === "delivered") return s.delivered;
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span>🛵</span>
        <h3>Tu ruta está despejada</h3>
        <p class="muted-text" style="margin-top:6px;">Toca <strong>"Agregar Parada"</strong> o pega tus pedidos directo desde <strong>WhatsApp</strong>.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered
    .map((stop, idx) => {
      const globalIndex = state.stops.findIndex((item) => item.id === stop.id) + 1;
      const payTag =
        stop.paymentMethod === "cash"
          ? `<span class="tag tag-cash">💵 Cobrar ${sym}${Number(stop.amount).toFixed(2)}</span>`
          : stop.paymentMethod === "digital"
          ? `<span class="tag tag-digital">📲 Transf. ${sym}${Number(stop.amount).toFixed(2)}</span>`
          : `<span class="tag tag-paid">✅ Pagado</span>`;

      const urgentTag = stop.priority === "urgent" ? `<span class="tag tag-urgent">🔥 URGENTE</span>` : "";
      const gpsTag = stop.lat ? `<span class="tag tag-paid">📍 GPS</span>` : "";

      return `
        <div class="stop-card ${stop.priority === "urgent" ? "urgent" : ""} ${stop.delivered ? "delivered" : ""}">
          <div class="stop-top">
            <div class="stop-number">${stop.delivered ? "✓" : globalIndex}</div>
            <div class="stop-info">
              <div class="stop-address">${escapeHTML(stop.address)}</div>
              <div class="stop-meta">
                <span>👤 ${escapeHTML(stop.client || "Cliente")}</span>
                ${stop.phone ? `<span>📞 ${escapeHTML(stop.phone)}</span>` : ""}
              </div>
            </div>
          </div>

          ${stop.notes ? `<div class="stop-notes">📝 ${escapeHTML(stop.notes)}</div>` : ""}

          <div class="stop-badges">
            ${urgentTag}
            ${payTag}
            <span class="tag tag-paid">🛵 Envío: ${sym}${Number(stop.fee || 0).toFixed(2)}</span>
            ${gpsTag}
          </div>

          <div class="stop-actions">
            <button class="btn-nav" onclick="handleNavClick('${stop.id}')">🧭 Ir</button>
            <button class="btn-wa" onclick="handleWaClick('${stop.id}')">💬 Chat</button>
            ${
              stop.delivered
                ? `<button class="btn-secondary" onclick="toggleUndoStop('${stop.id}')">↩️ Reabrir</button>`
                : `<button class="btn-done" onclick="openPODModal('${stop.id}')">✅ Entregar</button>`
            }
            <button class="btn-more" onclick="editStop('${stop.id}')" title="Editar">✏️</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderWalletView() {
  const sym = getCurrencySymbol();
  let totalCollected = 0;
  let pendingCollect = 0;
  let cashToSettle = 0;
  let myFees = 0;

  state.stops.forEach((s) => {
    const amt = Number(s.amount || 0);
    const fee = Number(s.fee || 0);
    if (s.delivered) {
      myFees += fee;
      if (s.paymentMethod !== "paid") totalCollected += amt;
      if (s.paymentMethod === "cash") cashToSettle += amt;
    } else {
      if (s.paymentMethod !== "paid") pendingCollect += amt;
    }
  });

  document.getElementById("wTotalCollected").textContent = `${sym}${totalCollected.toFixed(2)}`;
  document.getElementById("wPendingCollect").textContent = `${sym}${pendingCollect.toFixed(2)}`;
  document.getElementById("wCashToSettle").textContent = `${sym}${cashToSettle.toFixed(2)}`;
  document.getElementById("wMyFees").textContent = `${sym}${myFees.toFixed(2)}`;
}

// --- EVENTOS Y ACCIONES ---
function bindEvents() {
  // Navegación inferior
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.target).classList.add("active");
    });
  });

  // Filtros
  document.querySelectorAll(".pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      state.filter = pill.dataset.filter;
      renderStopsList();
    });
  });

  // Abrir Modales
  document.getElementById("btnOpenAdd").addEventListener("click", () => {
    if (!canAddMoreStops(1)) return;
    document.getElementById("stopForm").reset();
    document.getElementById("stopId").value = "";
    document.getElementById("stopFee").value = state.settings.defaultFee;
    document.getElementById("modalStopTitle").textContent = "➕ Nueva Parada";
    document.getElementById("geoStatus").textContent = "";
    openModal("modalStop");
  });

  document.getElementById("btnOpenMagic").addEventListener("click", () => {
    document.getElementById("magicTextInput").value = "";
    openModal("modalMagic");
  });

  document.getElementById("btnPro").addEventListener("click", () => openModal("modalPro"));
  document.getElementById("btnRemoveAds").addEventListener("click", () => openModal("modalPro"));

  // Cerrar Modales
  document.querySelectorAll(".close-modal").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.close));
  });

  // Optimizar Ruta
  document.getElementById("btnOptimizeRoute").addEventListener("click", optimizeRoute);

  // Limpiar entregadas
  document.getElementById("btnClearDelivered").addEventListener("click", () => {
    state.stops = state.stops.filter((s) => !s.delivered);
    saveState();
    renderAll();
    showToast("🧹 Paradas entregadas eliminadas de la vista.");
  });

  // GPS Actual al crear parada
  document.getElementById("btnUseCurrentGPS").addEventListener("click", () => {
    const status = document.getElementById("geoStatus");
    if (!("geolocation" in navigator)) {
      status.textContent = "GPS no disponible en este navegador.";
      return;
    }
    status.textContent = "📡 Obteniendo coordenadas exactas...";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
        document.getElementById("stopAddress").value = coords;
        status.textContent = "✅ Coordenadas GPS capturadas.";
      },
      () => {
        status.textContent = "⚠️ No se pudo acceder al GPS. Escribe la dirección.";
      }
    );
  });

  // Guardar Parada (Crear o Editar)
  document.getElementById("stopForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("stopId").value;
    const address = document.getElementById("stopAddress").value.trim();
    const client = document.getElementById("stopClient").value.trim();
    const phone = document.getElementById("stopPhone").value.trim();
    const amount = parseFloat(document.getElementById("stopAmount").value) || 0;
    const paymentMethod = document.getElementById("stopPaymentMethod").value;
    const fee = parseFloat(document.getElementById("stopFee").value) || 0;
    const priority = document.getElementById("stopPriority").value;
    const notes = document.getElementById("stopNotes").value.trim();

    closeModal("modalStop");
    showToast("📍 Guardando parada...");

    // Intentar geocodificar en segundo plano si no son coordenadas directas
    let coords = null;
    const coordMatch = address.match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
    if (coordMatch) {
      coords = { lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]) };
    } else {
      coords = await geocodeAddress(address);
    }

    if (id) {
      const idx = state.stops.findIndex((s) => s.id === id);
      if (idx !== -1) {
        state.stops[idx] = {
          ...state.stops[idx],
          address,
          client,
          phone,
          amount,
          paymentMethod,
          fee,
          priority,
          notes,
          lat: coords ? coords.lat : state.stops[idx].lat,
          lng: coords ? coords.lng : state.stops[idx].lng
        };
      }
    } else {
      state.stops.push({
        id: "stop_" + Date.now(),
        address,
        client,
        phone,
        amount,
        paymentMethod,
        fee,
        priority,
        notes,
        lat: coords ? coords.lat : null,
        lng: coords ? coords.lng : null,
        delivered: false,
        createdAt: new Date().toISOString()
      });
    }

    saveState();
    renderAll();
    showToast("✅ Parada guardada correctamente.");
  });

  // Pegar desde Portapapeles en Modal Mágico
  document.getElementById("btnPasteClipboard").addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      document.getElementById("magicTextInput").value = text;
    } catch (e) {
      showToast("⚠️ Mantén presionado el cuadro y toca 'Pegar'.");
    }
  });

  // Procesar Texto de WhatsApp
  document.getElementById("btnProcessMagic").addEventListener("click", async () => {
    const raw = document.getElementById("magicTextInput").value.trim();
    if (!raw) return;

    const extracted = parseWhatsAppText(raw);
    if (!canAddMoreStops(extracted.length)) return;

    closeModal("modalMagic");
    showToast(`🪄 Procesando ${extracted.length} pedido(s)...`);

    for (const stop of extracted) {
      const coords = await geocodeAddress(stop.address);
      if (coords) {
        stop.lat = coords.lat;
        stop.lng = coords.lng;
      }
      state.stops.push(stop);
    }

    saveState();
    renderAll();
    showToast(`✅ ¡${extracted.length} parada(s) agregada(s) desde WhatsApp!`);
  });

  // Confirmar Entrega (POD)
  document.getElementById("podPhotoInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = document.getElementById("podPhotoPreview");
      img.src = ev.target.result;
      img.style.display = "block";
    };
    reader.readAsDataURL(file);
  });

  document.getElementById("btnConfirmPOD").addEventListener("click", () => {
    const id = document.getElementById("podStopId").value;
    const finalPay = document.getElementById("podFinalPayment").value;
    const podNote = document.getElementById("podNoteInput").value.trim();

    const stop = state.stops.find((s) => s.id === id);
    if (stop) {
      stop.delivered = true;
      stop.paymentMethod = finalPay;
      stop.deliveredAt = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (podNote) stop.notes = (stop.notes ? stop.notes + " | " : "") + "POD: " + podNote;
    }

    closeModal("modalPOD");
    saveState();
    renderAll();
    showToast("🎉 ¡Entrega completada!");
    triggerInterstitialAd();
  });

  // Exportar Cierre de Caja
  document.getElementById("btnExportReport").addEventListener("click", () => {
    const sym = getCurrencySymbol();
    const dateStr = new Date().toLocaleDateString();
    let cash = 0, digital = 0, fees = 0, count = 0;

    let lines = [`📊 *CIERRE DE RUTA - RUTAFLASH PRO*`, `📅 Fecha: ${dateStr}`, `--------------------------`];

    state.stops.forEach((s, i) => {
      if (s.delivered) {
        count++;
        fees += Number(s.fee || 0);
        if (s.paymentMethod === "cash") cash += Number(s.amount || 0);
        if (s.paymentMethod === "digital") digital += Number(s.amount || 0);
        lines.push(`${i + 1}. ✅ ${s.client || "Cliente"} (${s.address}) - ${sym}${Number(s.amount).toFixed(2)} [${s.paymentMethod.toUpperCase()}]`);
      }
    });

    lines.push(`--------------------------`);
    lines.push(`📦 Entregas completadas: ${count}`);
    lines.push(`💵 Efectivo recaudado: ${sym}${cash.toFixed(2)}`);
    lines.push(`📲 Digital/Transf.: ${sym}${digital.toFixed(2)}`);
    lines.push(`🛵 Mis ganancias envíos: ${sym}${fees.toFixed(2)}`);

    const reportText = lines.join("
");
    window.open(`https://wa.me/?text=${encodeURIComponent(reportText)}`, "_blank");
  });

  // Reiniciar Jornada
  document.getElementById("btnResetDay").addEventListener("click", () => {
    if (confirm("¿Seguro que deseas borrar todas las paradas y reiniciar la caja de hoy?")) {
      state.stops = [];
      state.bonusStopsToday = 0;
      saveState();
      renderAll();
      showToast("🔄 Nueva jornada iniciada.");
    }
  });

  // Compartir App Viral
  document.getElementById("btnShareApp").addEventListener("click", () => {
    const text = APP_CONFIG.sharing.referralMessage + APP_CONFIG.sharing.downloadUrl;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  });

  // Anuncio Bonificado (+15 paradas)
  document.getElementById("btnWatchRewardedAd").addEventListener("click", () => {
    triggerRewardedAd(() => {
      state.bonusStopsToday += APP_CONFIG.plans.rewardedExtraStops;
      saveState();
      renderHeaderAndStats();
      closeModal("modalPro");
      showToast(`🎉 ¡Desbloqueaste +${APP_CONFIG.plans.rewardedExtraStops} paradas gratis hoy!`);
    });
  });

  // Activar PRO
  document.getElementById("btnActivatePro").addEventListener("click", () => {
    const code = document.getElementById("proCodeInput").value.trim().toUpperCase();
    if (code === APP_CONFIG.plans.proUnlockCode) {
      state.isPro = true;
      saveState();
      initAdMobBridge();
      renderAll();
      closeModal("modalPro");
      showToast("👑 ¡Bienvenido a RutaFlash PRO! Paradas ilimitadas y sin anuncios.");
    } else {
      showToast("❌ Código inválido. Verifica tu suscripción.");
    }
  });

  // Guardar Ajustes
  document.getElementById("btnSaveSettings").addEventListener("click", () => {
    state.settings.navApp = document.getElementById("navAppSelect").value;
    state.settings.defaultFee = parseFloat(document.getElementById("defaultFeeInput").value) || 0;
    state.settings.waTemplate = document.getElementById("waTemplateInput").value;
    saveState();
    showToast("💾 Configuración guardada.");
  });

  document.getElementById("currencySelector").addEventListener("change", (e) => {
    state.settings.currency = e.target.value;
    saveState();
    renderAll();
  });

  // Cambiar Idioma (ES -> EN -> PT)
  document.getElementById("btnLang").addEventListener("click", () => {
    const order = ["es", "en", "pt"];
    const nextIdx = (order.indexOf(state.lang) + 1) % order.length;
    state.lang = order[nextIdx];
    saveState();
    applyLanguage();
  });

  // Instalar PWA
  document.getElementById("btnInstallPWA").addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  });
}

// --- FUNCIONES AUXILIARES GLOBALES ---
window.handleNavClick = (id) => {
  const stop = state.stops.find((s) => s.id === id);
  if (stop) openExternalNavigation(stop);
};

window.handleWaClick = (id) => {
  const stop = state.stops.find((s) => s.id === id);
  if (stop) openWhatsAppClient(stop);
};

window.openPODModal = (id) => {
  const stop = state.stops.find((s) => s.id === id);
  if (!stop) return;
  const sym = getCurrencySymbol();
  document.getElementById("podStopId").value = stop.id;
  document.getElementById("podSummary").innerHTML = `<strong>${escapeHTML(stop.client || "Cliente")}</strong><br>${escapeHTML(stop.address)}<br>Monto: <strong>${sym}${Number(stop.amount).toFixed(2)}</strong>`;
  document.getElementById("podFinalPayment").value = stop.paymentMethod === "paid" ? "paid" : stop.paymentMethod;
  document.getElementById("podNoteInput").value = "";
  document.getElementById("podPhotoPreview").style.display = "none";
  openModal("modalPOD");
};

window.toggleUndoStop = (id) => {
  const stop = state.stops.find((s) => s.id === id);
  if (stop) {
    stop.delivered = false;
    saveState();
    renderAll();
  }
};

window.editStop = (id) => {
  const stop = state.stops.find((s) => s.id === id);
  if (!stop) return;
  document.getElementById("modalStopTitle").textContent = "✏️ Editar Parada";
  document.getElementById("stopId").value = stop.id;
  document.getElementById("stopAddress").value = stop.address;
  document.getElementById("stopClient").value = stop.client || "";
  document.getElementById("stopPhone").value = stop.phone || "";
  document.getElementById("stopAmount").value = stop.amount || 0;
  document.getElementById("stopPaymentMethod").value = stop.paymentMethod || "cash";
  document.getElementById("stopFee").value = stop.fee || 0;
  document.getElementById("stopPriority").value = stop.priority || "normal";
  document.getElementById("stopNotes").value = stop.notes || "";
  openModal("modalStop");
};

function initCurrencySelector() {
  const sel = document.getElementById("currencySelector");
  sel.innerHTML = APP_CONFIG.currencies
    .map((c) => `<option value="${c.code}">${c.symbol} ${c.code}</option>`)
    .join("");
  sel.value = state.settings.currency;
}

function applySettingsToUI() {
  document.getElementById("navAppSelect").value = state.settings.navApp;
  document.getElementById("defaultFeeInput").value = state.settings.defaultFee;
  document.getElementById("waTemplateInput").value = state.settings.waTemplate;
  document.getElementById("proPriceDisplay").textContent = APP_CONFIG.plans.proPriceMonthly;
}

function applyLanguage() {
  document.getElementById("btnLang").textContent = `🌐 ${state.lang.toUpperCase()}`;
  const dict = I18N[state.lang] || I18N.es;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (dict[key]) el.textContent = dict[key];
  });
}

function openModal(id) {
  document.getElementById(id).classList.add("open");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
