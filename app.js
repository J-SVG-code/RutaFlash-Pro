// ==========================================
// RUTA FLASH v3.0 - GPS AUTOMÁTICO + DÍA/NOCHE
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

// Service Worker seguro
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// ==========================================
// MODO DÍA Y MODO NOCHE
// ==========================================
function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('btn-theme-toggle');
  if (btn) {
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

function toggleTheme() {
  const next = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  saveState();
}

// ==========================================
// GPS AUTOMÁTICO AL INGRESAR A LA APLICACIÓN
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
      const coords = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      liveDriverPos = coords;
      // Si aún no tiene punto de salida fijado, lo fija automáticamente al entrar
      if (!state.basePoint) {
        state.basePoint = coords;
      }
      saveState();
    },
    (err) => {
      if (baseText && !state.basePoint) {
        baseText.textContent = 'Activa la ubicación GPS y toca "Actualizar GPS"';
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
  );
}

// ==========================================
// DETECCIÓN DE CONEXIÓN (ONLINE / OFFLINE)
// ==========================================
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
    if (!state.isPro) {
      lockBanner.classList.remove('hidden');
    } else {
      lockBanner.classList.add('hidden');
    }
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

// ==========================================
// RASTREO GPS EN VIVO (MODO PRO OFFLINE)
// ==========================================
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
    document.getElementById('tracker-next-dist').textContent = distNext < 1
      ? Math.round(distNext * 1000) + ' m'
      : distNext.toFixed(1) + ' km';
    document.getElementById('tracker-next-eta').textContent = '~' + etaMin + ' min';
  } else {
    document.getElementById('tracker-next-dist').textContent = 'Sin coords';
    document.getElementById('tracker-next-eta').textContent = '--';
  }
}

async function prefetchRouteMapTiles() {
  if (!state.isPro) return openProModal();
  const points = state.orders.filter(o => o.status === 'pending' && o.lat && o.lng).map(o => ({ lat: o.lat, lng: o.lng }));
  if (state.basePoint) points.push(state.basePoint);
  if (points.length === 0) return alert('Agrega pedidos con ubicación GPS primero.');

  const btn = document.getElementById('btn-prefetch-offline');
  btn.textContent = '⏳ Guardando...';

  try {
    const zoom = 15;
    const urls = new Set();
    points.forEach(p => {
      const n = Math.pow(2, zoom);
      const xtile = Math.floor((p.lng + 180) / 360 * n);
      const ytile = Math.floor((1 - Math.log(Math.tan(p.lat * Math.PI / 180) + 1 / Math.cos(p.lat * Math.PI / 180)) / Math.PI) / 2 * n);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          urls.add('https://tile.openstreetmap.org/' + zoom + '/' + (xtile + dx) + '/' + (ytile + dy) + '.png');
        }
      }
    });
    await Promise.all([...urls].map(u => fetch(u, { mode: 'no-cors' }).catch(() => {})));
    btn.textContent = '✅ Mapa Guardado';
    alert('📥 ¡Ruta y mapa guardados para trabajar sin internet!');
  } catch (e) {
    btn.textContent = '📥 Guardar Mapa Offline';
  }
}

// ==========================================
// CÁLCULOS DE DISTANCIA Y OPTIMIZACIÓN
// ==========================================
function calcDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1.28;
}

function optimizeOrders() {
  if (!requireOnlineOrPro('Optimizar ruta')) return;

  const pending = state.orders.filter(o => o.status === 'pending');
  const completed = state.orders.filter(o => o.status === 'completed');

  if (pending.length <= 1) {
    alert('Agrega al menos 2 pedidos pendientes para optimizar la ruta.');
    return;
  }

  const urgent = pending.filter(o => o.priority === 'high');
  const normal = pending.filter(o => o.priority !== 'high');
  urgent.sort((a, b) => (a.deadline || '23:59').localeCompare(b.deadline || '23:59'));

  let currentPos = liveDriverPos || state.basePoint || (pending[0].lat ? { lat: pending[0].lat, lng: pending[0].lng } : null);
  const optimized = [];

  function greedySort(pool) {
    const remaining = [...pool];
    while (remaining.length > 0) {
      if (!currentPos) {
        const next = remaining.shift();
        optimized.push(next);
        if (next.lat && next.lng) currentPos = { lat: next.lat, lng: next.lng };
        continue;
      }
      let bestIdx = 0;
      let bestDist = Infinity;
      remaining.forEach((item, idx) => {
        if (!item.lat || !item.lng) return;
        const d = calcDistanceKm(currentPos.lat, currentPos.lng, item.lat, item.lng);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = idx;
        }
      });
      const chosen = remaining.splice(bestIdx, 1)[0];
      optimized.push(chosen);
      if (chosen.lat && chosen.lng) {
        currentPos = { lat: chosen.lat, lng: chosen.lng };
      }
    }
  }

  greedySort(urgent);
  greedySort(normal);

  state.orders = [...optimized, ...completed];
  saveState();
  alert('⚡ ¡Ruta optimizada! Ordenada de más cercano a más lejano respetando pedidos urgentes.');
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
  const fuelCost = liters * fuelPrice;

  return { totalKm, liters, fuelCost };
}

// ==========================================
// EXTRACTOR WHATSAPP / BÚSQUEDA OSM
// ==========================================
function parseWhatsAppText(text) {
  const coordRegex = /([-+]?\d{1,2}\.\d+),\s*([-+]?\d{1,3}\.\d+)/;
  const match = text.match(coordRegex);
  if (match) {
    document.getElementById('inp-lat').value = match[1];
    document.getElementById('inp-lng').value = match[2];
  }

  const phoneRegex = /(\+?\d{10,15})/;
  const phoneMatch = text.replace(/[\s-]/g, '').match(phoneRegex);
  if (phoneMatch) {
    document.getElementById('inp-phone').value = phoneMatch[1].replace('+', '');
  }

  const moneyRegex = /\$\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:\$|usd|dolares)/i;
  const moneyMatch = text.match(moneyRegex);
  if (moneyMatch) {
    document.getElementById('inp-product-amount').value = moneyMatch[1] || moneyMatch[2];
  }

  const addrInput = document.getElementById('inp-address');
  if (!addrInput.value) {
    addrInput.value = text.replace(/https?:\/\/\S+/g, '').trim().slice(0, 120);
  }
}

async function searchAddressOSM() {
  const query = document.getElementById('inp-address').value.trim();
  if (!query) return alert('Escribe una dirección primero.');

  try {
    const res = await fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(query) + '&limit=1');
    const data = await res.json();
    if (data && data.length > 0) {
      document.getElementById('inp-lat').value = parseFloat(data[0].lat).toFixed(6);
      document.getElementById('inp-lng').value = parseFloat(data[0].lon).toFixed(6);
      alert('📍 Ubicación encontrada.');
    } else {
      alert('No se halló esa dirección exacta. Pega el enlace de WhatsApp o toca el punto en la pestaña Mapa.');
    }
  } catch (e) {
    alert('Sin conexión para buscar calle. Usa el mapa o pega coordenadas.');
  }
}

// ==========================================
// ACTUALIZACIÓN DE INTERFAZ
// ==========================================
function updateUI() {
  checkNetworkAndAccess();

  const pending = state.orders.filter(o => o.status === 'pending');
  const completed = state.orders.filter(o => o.status === 'completed');

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

  const baseText = document.getElementById('base-coords-text');
  if (state.basePoint) {
    baseText.textContent = state.basePoint.lat.toFixed(5) + ', ' + state.basePoint.lng.toFixed(5) + ' (Listo)';
  }

  const { totalKm, liters, fuelCost } = calculateTotalRouteMetrics();
  document.getElementById('metric-km').textContent = totalKm.toFixed(1) + ' km';
  document.getElementById('metric-fuel').textContent = liters.toFixed(2) + ' L ($' + fuelCost.toFixed(2) + ')';
  document.getElementById('count-pending').textContent = pending.length;

  let totalCash = 0, totalBank = 0, totalMerchant = 0, totalDriverGross = 0;

  state.orders.forEach(o => {
    const prod = parseFloat(o.productAmount) || 0;
    const fee = parseFloat(o.deliveryFee) || 0;
    const totalOrder = prod + fee;

    totalDriverGross += fee;
    if (o.paymentMethod !== 'pagado') totalMerchant += prod;
    if (o.paymentMethod === 'efectivo') totalCash += totalOrder;
    else if (o.paymentMethod === 'cuenta') totalBank += totalOrder;
  });

  const netProfit = totalDriverGross - fuelCost;
  document.getElementById('metric-profit').textContent = '$' + netProfit.toFixed(2);
  document.getElementById('fin-cash').textContent = '$' + totalCash.toFixed(2);
  document.getElementById('fin-bank').textContent = '$' + totalBank.toFixed(2);
  document.getElementById('fin-merchant').textContent = '$' + totalMerchant.toFixed(2);
  document.getElementById('fin-driver-gross').textContent = '$' + totalDriverGross.toFixed(2);
  document.getElementById('fin-fuel-cost').textContent = '-$' + fuelCost.toFixed(2);
  document.getElementById('fin-net-profit').textContent = '$' + netProfit.toFixed(2);

  const listEl = document.getElementById('stops-list');
  if (pending.length === 0) {
    listEl.innerHTML = '<div class="card" style="text-align:center;"><p class="hint" style="margin:0;">Aún no tienes paradas en ruta. Toca <b>"➕ Agregar Pedido"</b> para empezar.</p></div>';
  } else {
    listEl.innerHTML = pending.map((o, index) => {
      const totalCobrar = o.paymentMethod === 'pagado' ? 0 : (parseFloat(o.productAmount) + parseFloat(o.deliveryFee));
      const vuelto = (o.paymentMethod === 'efectivo' && o.cashGiven > totalCobrar) ? (o.cashGiven - totalCobrar) : 0;
      const mapsUrl = o.lat && o.lng
        ? 'https://www.google.com/maps/dir/?api=1&destination=' + o.lat + ',' + o.lng
        : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(o.address);
      const wazeUrl = o.lat && o.lng
        ? 'https://waze.com/ul?ll=' + o.lat + ',' + o.lng + '&navigate=yes'
        : 'https://waze.com/ul?q=' + encodeURIComponent(o.address);
      const waMsg = encodeURIComponent('Hola ' + o.client + ', soy tu repartidor de Ruta Flash. Voy en camino con tu pedido.');
      const waUrl = o.phone ? 'https://wa.me/' + o.phone + '?text=' + waMsg : '#';

      return `
        <div class="stop-item ${o.priority === 'high' ? 'urgent' : ''}">
          <div class="stop-top">
            <div>
              <span class="num-badge">#${index + 1}</span>
              <strong>${o.client}</strong>
              ${o.priority === 'high' ? '<span class="urgent-pill">🔥 URGENTE</span>' : ''}
            </div>
            <button type="button" onclick="deleteOrder('${o.id}')" style="background:none;border:none;font-size:1rem;cursor:pointer;">🗑️</button>
          </div>
          <div class="stop-addr">📍 ${o.address} ${o.deadline ? '· ⏰ ' + o.deadline : ''}</div>
          <div class="stop-tags">
            <span>💳 <b>${o.paymentMethod.toUpperCase()}</b></span>
            <span>Cobrar: <b>$${totalCobrar.toFixed(2)}</b></span>
            <span>Envío: <b class="green-text">$${parseFloat(o.deliveryFee).toFixed(2)}</b></span>
            ${vuelto > 0 ? '<span style="color:#d97706;">💵 Vuelto: <b>$' + vuelto.toFixed(2) + '</b></span>' : ''}
          </div>
          <div class="stop-btns">
            <a href="${mapsUrl}" target="_blank" class="s-btn s-maps">🗺️ Maps</a>
            <a href="${wazeUrl}" target="_blank" class="s-btn s-waze">🚙 Waze</a>
            <a href="${waUrl}" target="_blank" class="s-btn s-wa" ${!o.phone ? 'onclick="alert(\'Sin teléfono\');return false;"' : ''}>💬 Chat</a>
            <button type="button" onclick="openDeliveryModal('${o.id}')" class="s-btn s-done">✅ Listo</button>
          </div>
        </div>
      `;
    }).join('');
  }

  const compEl = document.getElementById('completed-list');
  compEl.innerHTML = completed.length === 0
    ? '<p class="hint">No hay entregas completadas aún.</p>'
    : completed.map(c => `
      <div class="done-row">
        <div>
          <strong>✅ ${c.client}</strong>
          <div class="hint" style="margin:2px 0;">${c.address} · $${parseFloat(c.deliveryFee).toFixed(2)}</div>
          ${c.note ? '<small>📝 ' + c.note + '</small>' : ''}
        </div>
        ${c.photoData ? '<img src="' + c.photoData + '" class="done-img" alt="Foto" />' : '<span>📦</span>'}
      </div>
    `).join('');

  document.getElementById('cfg-vehicle').value = state.settings.vehicle;
  document.getElementById('cfg-kml').value = state.settings.kml;
  document.getElementById('cfg-fuel-price').value = state.settings.fuelPrice;
  document.getElementById('cfg-email').value = state.email || '';

  refreshMapMarkers();
}

// ==========================================
// NAVEGACIÓN ENTRE PESTAÑAS (100% REACTIVA)
// ==========================================
function switchTab(tabId) {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === tabId);
  });
  if (tabId === 'tab-mapa') {
    setTimeout(() => {
      initMap();
      if (map) map.invalidateSize();
    }, 120);
  }
}

// ==========================================
// MAPA INTERACTIVO LEAFLET
// ==========================================
function initMap() {
  if (map) return;
  const startLat = state.basePoint ? state.basePoint.lat : 10.6012;
  const startLng = state.basePoint ? state.basePoint.lng : -66.9321;

  map = L.map('map').setView([startLat, startLng], 14);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  map.on('click', (e) => {
    document.getElementById('inp-lat').value = e.latlng.lat.toFixed(6);
    document.getElementById('inp-lng').value = e.latlng.lng.toFixed(6);
    alert('📍 Punto capturado en el mapa. Ahora completa los datos en "Nuevo".');
    switchTab('tab-nuevo');
  });

  refreshMapMarkers();
  updateDriverMarkerOnMap();
}

function updateDriverMarkerOnMap() {
  if (!map || !liveDriverPos) return;
  if (driverMarker) {
    driverMarker.setLatLng([liveDriverPos.lat, liveDriverPos.lng]);
  } else {
    driverMarker = L.circleMarker([liveDriverPos.lat, liveDriverPos.lng], {
      radius: 9,
      fillColor: '#10b981',
      color: '#ffffff',
      weight: 2,
      fillOpacity: 1
    }).addTo(map).bindPopup('🛵 Tu ubicación GPS');
  }
}

function refreshMapMarkers() {
  if (!map || !markersLayer) return;
  markersLayer.clearLayers();
  if (routeLine) map.removeLayer(routeLine);

  const coords = [];
  if (state.basePoint) {
    L.marker([state.basePoint.lat, state.basePoint.lng]).addTo(markersLayer).bindPopup('🏠 Salida / Retorno');
    coords.push([state.basePoint.lat, state.basePoint.lng]);
  }

  const pending = state.orders.filter(o => o.status === 'pending' && o.lat && o.lng);
  pending.forEach((o, i) => {
    L.marker([o.lat, o.lng]).addTo(markersLayer).bindPopup('#' + (i + 1) + ' ' + o.client);
    coords.push([o.lat, o.lng]);
  });

  if (state.basePoint && pending.length > 0) {
    coords.push([state.basePoint.lat, state.basePoint.lng]);
  }

  if (coords.length > 1) {
    routeLine = L.polyline(coords, { color: '#2563eb', weight: 4 }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
  } else if (state.basePoint) {
    map.setView([state.basePoint.lat, state.basePoint.lng], 15);
  }
}

// ==========================================
// MODALES Y ACCIONES GLOBALES
// ==========================================
window.openDeliveryModal = function(id) {
  if (!requireOnlineOrPro('Confirmar entregas sin internet')) return;
  currentDeliveringId = id;
  compressedPhotoBase64 = null;
  const order = state.orders.find(o => o.id === id);
  if (!order) return;
  document.getElementById('modal-client-name').textContent = order.client + ' · ' + order.address;
  document.getElementById('inp-proof-photo').value = '';
  document.getElementById('photo-preview').classList.add('hidden');
  document.getElementById('inp-delivery-note').value = '';
  document.getElementById('delivery-modal').classList.remove('hidden');
};

window.deleteOrder = function(id) {
  if (!confirm('¿Eliminar este pedido?')) return;
  state.orders = state.orders.filter(o => o.id !== id);
  saveState();
};

window.openProModal = function() {
  document.getElementById('pro-modal').classList.remove('hidden');
};

// ==========================================
// INICIALIZACIÓN AL CARGAR EL DOM
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  applyTheme(state.theme || 'light');
  updateUI();
  autoLocateOnStartup(); // Ubica GPS automáticamente al abrir

  // Navegación inferior
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Botón Día / Noche
  document.getElementById('btn-theme-toggle').addEventListener('click', toggleTheme);

  // Botón ir a agregar pedido
  document.getElementById('btn-go-add').addEventListener('click', () => switchTab('tab-nuevo'));

  // Actualizar GPS manual
  document.getElementById('btn-set-base').addEventListener('click', () => {
    if (!navigator.geolocation) return alert('GPS no disponible.');
    document.getElementById('base-coords-text').textContent = '📡 Actualizando GPS...';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.basePoint = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        liveDriverPos = state.basePoint;
        saveState();
        alert('📍 Punto de salida y retorno actualizado con tu GPS.');
      },
      () => alert('No se pudo obtener el GPS. Revisa que la ubicación del teléfono esté encendida.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  // Parsear WhatsApp
  document.getElementById('btn-parse-wa').addEventListener('click', () => {
    const txt = document.getElementById('wa-paste').value;
    if (txt.trim()) parseWhatsAppText(txt);
  });

  // Buscar dirección OSM
  document.getElementById('btn-search-addr').addEventListener('click', searchAddressOSM);

  // Usar GPS en formulario
  document.getElementById('btn-use-my-gps').addEventListener('click', () => {
    if (!navigator.geolocation) return alert('GPS no disponible.');
    navigator.geolocation.getCurrentPosition((pos) => {
      document.getElementById('inp-lat').value = pos.coords.latitude.toFixed(6);
      document.getElementById('inp-lng').value = pos.coords.longitude.toFixed(6);
      alert('📍 Coordenadas GPS cargadas en el pedido.');
    }, () => alert('Enciende el GPS del teléfono.'));
  });

  // Guardar Nuevo Pedido
  document.getElementById('order-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!requireOnlineOrPro('Cargar pedidos sin internet')) return;

    const pendingCount = state.orders.filter(o => o.status === 'pending').length;
    if (!state.isPro && pendingCount >= FREE_LIMIT) {
      openProModal();
      return;
    }

    const newOrder = {
      id: Date.now().toString(),
      client: document.getElementById('inp-client').value.trim(),
      phone: document.getElementById('inp-phone').value.trim(),
      address: document.getElementById('inp-address').value.trim(),
      lat: parseFloat(document.getElementById('inp-lat').value) || null,
      lng: parseFloat(document.getElementById('inp-lng').value) || null,
      priority: document.getElementById('inp-priority').value,
      deadline: document.getElementById('inp-deadline').value,
      productAmount: parseFloat(document.getElementById('inp-product-amount').value) || 0,
      deliveryFee: parseFloat(document.getElementById('inp-delivery-fee').value) || 0,
      paymentMethod: document.getElementById('inp-payment-method').value,
      cashGiven: parseFloat(document.getElementById('inp-cash-given').value) || 0,
      status: 'pending',
      photoData: null,
      note: ''
    };

    state.orders.push(newOrder);
    saveState();
    e.target.reset();
    document.getElementById('inp-delivery-fee').value = '2.00';
    switchTab('tab-ruta');
  });

  // Optimizar y Limpiar
  document.getElementById('btn-optimize').addEventListener('click', optimizeOrders);
  document.getElementById('btn-prefetch-offline').addEventListener('click', prefetchRouteMapTiles);

  document.getElementById('btn-clear-completed').addEventListener('click', () => {
    if (!confirm('¿Limpiar pedidos ya entregados?')) return;
    state.orders = state.orders.filter(o => o.status !== 'completed');
    saveState();
  });

  // Foto de entrega
  document.getElementById('inp-proof-photo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 480;
        const scale = maxW / img.width;
        canvas.width = maxW;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        compressedPhotoBase64 = canvas.toDataURL('image/jpeg', 0.65);
        const prev = document.getElementById('photo-preview');
        prev.src = compressedPhotoBase64;
        prev.classList.remove('hidden');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('btn-confirm-delivery').addEventListener('click', () => {
    const order = state.orders.find(o => o.id === currentDeliveringId);
    if (order) {
      order.status = 'completed';
      order.photoData = compressedPhotoBase64;
      order.note = document.getElementById('inp-delivery-note').value.trim();
      order.completedAt = new Date().toLocaleTimeString();
      saveState();
    }
    document.getElementById('delivery-modal').classList.add('hidden');
  });

  document.getElementById('btn-cancel-delivery').addEventListener('click', () => {
    document.getElementById('delivery-modal').classList.add('hidden');
  });

  // Ajustes y Cuenta
  document.getElementById('btn-save-settings').addEventListener('click', () => {
    state.settings.vehicle = document.getElementById('cfg-vehicle').value;
    state.settings.kml = parseFloat(document.getElementById('cfg-kml').value) || 35;
    state.settings.fuelPrice = parseFloat(document.getElementById('cfg-fuel-price').value) || 0.50;
    saveState();
    alert('⚙️ Ajustes guardados.');
  });

  document.getElementById('btn-save-account').addEventListener('click', () => {
    const email = document.getElementById('cfg-email').value.trim();
    if (!email) return alert('Escribe tu correo Gmail.');
    state.email = email;
    saveState();
    alert('✅ Correo ' + email + ' vinculado.');
  });

  // Modales PRO
  document.getElementById('btn-pro-modal').addEventListener('click', openProModal);
  document.getElementById('btn-ad-upgrade').addEventListener('click', openProModal);
  document.getElementById('btn-offline-upgrade').addEventListener('click', openProModal);
  document.getElementById('btn-close-pro').addEventListener('click', () => {
    document.getElementById('pro-modal').classList.add('hidden');
  });
  document.getElementById('btn-activate-pro').addEventListener('click', () => {
    state.isPro = true;
    saveState();
    document.getElementById('pro-modal').classList.add('hidden');
    alert('👑 ¡Ruta Flash PRO activado! Ya tienes modo sin internet, GPS en vivo y paradas ilimitadas.');
  });

  // Compartir cuadre
  document.getElementById('btn-share-summary').addEventListener('click', () => {
    const { totalKm, liters, fuelCost } = calculateTotalRouteMetrics();
    const msg = '⚡ *CUADRE RUTA FLASH* ⚡%0A' +
      '🛵 Recorrido: ' + totalKm.toFixed(1) + ' km%0A' +
      '⛽ Gasolina: ' + liters.toFixed(2) + ' L ($' + fuelCost.toFixed(2) + ')%0A' +
      '💵 Efectivo: ' + document.getElementById('fin-cash').textContent + '%0A' +
      '📱 Cuenta: ' + document.getElementById('fin-bank').textContent + '%0A' +
      '🏪 A comercios: ' + document.getElementById('fin-merchant').textContent + '%0A' +
      '🏆 *Ganancia neta:* ' + document.getElementById('fin-net-profit').textContent;
    window.open('https://wa.me/?text=' + msg, '_blank');
  });

  // Centrar mapa
  document.getElementById('btn-center-map').addEventListener('click', () => {
    if (map) refreshMapMarkers();
  });
});
