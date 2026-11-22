// ==========================================
// RUTA FLASH v2.0 - COSTO $0 + MODO OFFLINE PRO
// ==========================================

const FREE_LIMIT = 20;

let state = {
  isPro: false,
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
  const saved = localStorage.getItem('ruta_flash_state_v2');
  if (saved) {
    try {
      state = { ...state, ...JSON.parse(saved) };
    } catch (e) {
      console.error('Error cargando datos locales', e);
    }
  }
}

function saveState() {
  localStorage.setItem('ruta_flash_state_v2', JSON.stringify(state));
  updateUI();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ==========================================
// DETECCIÓN DE CONEXIÓN (ONLINE / OFFLINE)
// ==========================================
function checkNetworkAndAccess() {
  const isOnline = navigator.onLine;
  const pill = document.getElementById('net-status');
  const lockBanner = document.getElementById('offline-lock-banner');

  if (isOnline) {
    pill.textContent = '🟢 Online';
    pill.className = 'net-pill online';
    lockBanner.classList.add('hidden');
  } else {
    pill.textContent = '🔴 Offline';
    pill.className = 'net-pill offline';
    // Si NO es PRO y no tiene internet, muestra el candado de función exclusiva PRO
    if (!state.isPro) {
      lockBanner.classList.remove('hidden');
    } else {
      lockBanner.classList.add('hidden');
    }
  }
}

window.addEventListener('online', checkNetworkAndAccess);
window.addEventListener('offline', checkNetworkAndAccess);

// Verifica si el usuario puede ejecutar acciones de ruta cuando no hay internet
function requireOnlineOrPro(actionName) {
  if (!navigator.onLine && !state.isPro) {
    alert(`📵 Estás sin internet. "${actionName}" sin conexión es exclusivo de Ruta Flash PRO ($3.75/mes).`);
    openProModal();
    return false;
  }
  return true;
}

// ==========================================
// RASTREO GPS EN VIVO (EXCLUSIVO MODO PRO OFFLINE)
// ==========================================
function startProLiveGps() {
  if (!state.isPro || !navigator.geolocation) return;
  if (gpsWatchId !== null) return;

  gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      liveDriverPos = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      updateLiveTrackerUI();
      updateDriverMarkerOnMap();
    },
    (err) => console.warn('GPS en espera:', err.message),
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
  document.getElementById('tracker-remaining-count').textContent = `${pending.length} paradas restantes`;

  if (pending.length === 0) {
    document.getElementById('tracker-next-client').textContent = '¡Ruta completada!';
    document.getElementById('tracker-next-addr').textContent = 'No quedan entregas pendientes';
    document.getElementById('tracker-next-dist').textContent = '0.0 km';
    document.getElementById('tracker-next-eta').textContent = 'Listo';
    document.getElementById('tracker-total-left').textContent = '0.0 km';
    return;
  }

  const nextStop = pending[0];
  document.getElementById('tracker-next-client').textContent = `#1 ${nextStop.client}`;
  document.getElementById('tracker-next-addr').textContent = nextStop.address;

  const origin = liveDriverPos || state.basePoint;
  if (origin && nextStop.lat && nextStop.lng) {
    const distNext = calcDistanceKm(origin.lat, origin.lng, nextStop.lat, nextStop.lng);
    const etaMin = Math.max(1, Math.round((distNext / 28) * 60)); // ~28 km/h promedio urbano
    document.getElementById('tracker-next-dist').textContent = distNext < 1
      ? `${Math.round(distNext * 1000)} m`
      : `${distNext.toFixed(1)} km`;
    document.getElementById('tracker-next-eta').textContent = `~${etaMin} min`;

    // Calcular distancia total restante desde ubicación actual pasando por todas las paradas + retorno
    let remKm = 0;
    let prev = origin;
    pending.forEach(s => {
      if (s.lat && s.lng) {
        remKm += calcDistanceKm(prev.lat, prev.lng, s.lat, s.lng);
        prev = { lat: s.lat, lng: s.lng };
      }
    });
    if (state.basePoint) {
      remKm += calcDistanceKm(prev.lat, prev.lng, state.basePoint.lat, state.basePoint.lng);
    }
    document.getElementById('tracker-total-left').textContent = `${remKm.toFixed(1)} km`;
  } else {
    document.getElementById('tracker-next-dist').textContent = 'Sin GPS';
    document.getElementById('tracker-next-eta').textContent = '--';
  }
}

// Pre-descargar mosaicos del mapa alrededor de la ruta para usarlos 100% sin internet
async function prefetchRouteMapTiles() {
  if (!state.isPro) return openProModal();
  const points = state.orders.filter(o => o.status === 'pending' && o.lat && o.lng).map(o => ({ lat: o.lat, lng: o.lng }));
  if (state.basePoint) points.push(state.basePoint);
  if (points.length === 0) return alert('Agrega paradas con coordenadas primero.');

  const btn = document.getElementById('btn-prefetch-offline');
  btn.textContent = '⏳ Guardando mapa...';

  try {
    const zoom = 15;
    const urls = new Set();
    points.forEach(p => {
      const n = Math.pow(2, zoom);
      const xtile = Math.floor((p.lng + 180) / 360 * n);
      const ytile = Math.floor((1 - Math.log(Math.tan(p.lat * Math.PI / 180) + 1 / Math.cos(p.lat * Math.PI / 180)) / Math.PI) / 2 * n);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          urls.add(`https://tile.openstreetmap.org/${zoom}/${xtile + dx}/${ytile + dy}.png`);
        }
      }
    });

    await Promise.all([...urls].map(u => fetch(u, { mode: 'no-cors' }).catch(() => {})));
    btn.textContent = '✅ Ruta Lista Offline';
    alert('📥 ¡Mapa y ruta guardados en memoria! Ya puedes desplazarte aunque te quedes sin internet.');
  } catch (e) {
    btn.textContent = '📥 Guardar Ruta Offline';
  }
}

// ==========================================
// CÁLCULO DE DISTANCIAS (HAVERSINE + FACTOR VIAL)
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

// ==========================================
// OPTIMIZADOR DE RUTA CON PRIORIDAD Y RETORNO
// ==========================================
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
  alert('⚡ ¡Ruta optimizada! Pedidos urgentes priorizados y ordenados por cercanía.');
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
// EXTRACTOR AUTOMÁTICO DE WHATSAPP / MAPS
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
  if (!query) return alert('Escribe una dirección o sector primero.');

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
    const data = await res.json();
    if (data && data.length > 0) {
      document.getElementById('inp-lat').value = parseFloat(data[0].lat).toFixed(6);
      document.getElementById('inp-lng').value = parseFloat(data[0].lon).toFixed(6);
      alert('📍 Coordenadas encontradas en OpenStreetMap.');
    } else {
      alert('No se halló esa calle exacta. Puedes pegar el link de WhatsApp o tocar el punto en la pestaña Mapa.');
    }
  } catch (e) {
    alert('Sin conexión para buscar dirección. Usa el mapa o pega coordenadas.');
  }
}

// ==========================================
// RENDERIZADO DE INTERFAZ Y CAJA
// ==========================================
function updateUI() {
  checkNetworkAndAccess();

  const pending = state.orders.filter(o => o.status === 'pending');
  const completed = state.orders.filter(o => o.status === 'completed');

  const badge = document.getElementById('plan-badge');
  const adBanner = document.getElementById('ad-banner');
  if (state.isPro) {
    badge.textContent = '👑 PRO Offline + Ilimitado';
    badge.className = 'badge-pro';
    adBanner.style.display = 'none';
    startProLiveGps();
    updateLiveTrackerUI();
  } else {
    badge.textContent = `Plan Gratis (${pending.length}/${FREE_LIMIT} paradas)`;
    badge.className = 'badge-free';
    adBanner.style.display = 'flex';
    stopProLiveGps();
    document.getElementById('pro-live-tracker').classList.add('hidden');
  }

  const baseText = document.getElementById('base-coords-text');
  if (state.basePoint) {
    baseText.textContent = `${state.basePoint.lat.toFixed(4)}, ${state.basePoint.lng.toFixed(4)}`;
  }

  const { totalKm, liters, fuelCost } = calculateTotalRouteMetrics();
  document.getElementById('metric-km').textContent = `${totalKm.toFixed(1)} km`;
  document.getElementById('metric-fuel').textContent = `${liters.toFixed(2)} L ($${fuelCost.toFixed(2)})`;
  document.getElementById('count-pending').textContent = pending.length;

  let totalCash = 0;
  let totalBank = 0;
  let totalMerchant = 0;
  let totalDriverGross = 0;

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
  document.getElementById('metric-profit').textContent = `$${netProfit.toFixed(2)}`;
  document.getElementById('fin-cash').textContent = `$${totalCash.toFixed(2)}`;
  document.getElementById('fin-bank').textContent = `$${totalBank.toFixed(2)}`;
  document.getElementById('fin-merchant').textContent = `$${totalMerchant.toFixed(2)}`;
  document.getElementById('fin-driver-gross').textContent = `$${totalDriverGross.toFixed(2)}`;
  document.getElementById('fin-fuel-cost').textContent = `-$${fuelCost.toFixed(2)}`;
  document.getElementById('fin-net-profit').textContent = `$${netProfit.toFixed(2)}`;

  const listEl = document.getElementById('stops-list');
  if (pending.length === 0) {
    listEl.innerHTML = `<div class="card"><p class="muted" style="text-align:center;">No tienes entregas pendientes. Toca <b>"➕ Nuevo Pedido"</b> para empezar tu ruta.</p></div>`;
  } else {
    listEl.innerHTML = pending.map((o, index) => {
      const totalCobrar = o.paymentMethod === 'pagado' ? 0 : (parseFloat(o.productAmount) + parseFloat(o.deliveryFee));
      const vuelto = (o.paymentMethod === 'efectivo' && o.cashGiven > totalCobrar) ? (o.cashGiven - totalCobrar) : 0;
      const mapsUrl = o.lat && o.lng
        ? `https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address)}`;
      const wazeUrl = o.lat && o.lng
        ? `https://waze.com/ul?ll=${o.lat},${o.lng}&navigate=yes`
        : `https://waze.com/ul?q=${encodeURIComponent(o.address)}`;
      const waMsg = encodeURIComponent(`Hola ${o.client}, soy tu repartidor de Ruta Flash. Voy en camino con tu pedido.`);
      const waUrl = o.phone ? `https://wa.me/${o.phone}?text=${waMsg}` : '#';

      // Distancia desde posición actual si es PRO
      let liveDistTag = '';
      const refPos = liveDriverPos || state.basePoint;
      if (state.isPro && refPos && o.lat && o.lng) {
        const d = calcDistanceKm(refPos.lat, refPos.lng, o.lat, o.lng);
        liveDistTag = `<span style="color:#38bdf8;font-size:0.75rem;margin-left:6px;">(${d.toFixed(1)} km)</span>`;
      }

      return `
        <div class="stop-card ${o.priority === 'high' ? 'priority-high' : ''}">
          <div class="stop-header">
            <div>
              <span class="stop-number">#${index + 1}</span>
              <strong>${o.client}</strong>${liveDistTag}
              ${o.priority === 'high' ? '<span class="tag-urgent">🔥 URGENTE</span>' : ''}
              ${o.deadline ? `<small class="muted">⏰ ${o.deadline}</small>` : ''}
            </div>
            <button onclick="deleteOrder('${o.id}')" style="background:none;border:none;color:#94a3b8;cursor:pointer;">🗑️</button>
          </div>
          <div class="stop-address">📍 ${o.address}</div>
          <div class="stop-money">
            <span>💳 <b>${o.paymentMethod.toUpperCase()}</b></span>
            <span>Cobrar: <b>$${totalCobrar.toFixed(2)}</b></span>
            <span>Tu envío: <b class="text-green">$${parseFloat(o.deliveryFee).toFixed(2)}</b></span>
            ${vuelto > 0 ? `<span style="color:#f59e0b;">💵 Llevar vuelto: <b>$${vuelto.toFixed(2)}</b></span>` : ''}
          </div>
          <div class="stop-actions">
            <a href="${mapsUrl}" target="_blank" class="act-btn act-maps">🗺️ Maps</a>
            <a href="${wazeUrl}" target="_blank" class="act-btn act-waze">🚙 Waze</a>
            <a href="${waUrl}" target="_blank" class="act-btn act-wa" ${!o.phone ? 'onclick="alert('Sin teléfono');return false;"' : ''}>💬 Chat</a>
            <button onclick="openDeliveryModal('${o.id}')" class="act-btn act-done">✅ Entregar</button>
          </div>
        </div>
      `;
    }).join('');
  }

  const compEl = document.getElementById('completed-list');
  compEl.innerHTML = completed.length === 0
    ? '<p class="muted">Aún no has marcado entregas completadas hoy.</p>'
    : completed.map(c => `
      <div class="completed-item">
        <div>
          <strong>✅ ${c.client}</strong>
          <div class="muted">${c.address} · Envío: $${parseFloat(c.deliveryFee).toFixed(2)}</div>
          ${c.note ? `<small>📝 ${c.note}</small>` : ''}
        </div>
        ${c.photoData ? `<img src="${c.photoData}" class="completed-thumb" alt="Foto entrega" />` : '<span>📦</span>'}
      </div>
    `).join('');

  document.getElementById('cfg-vehicle').value = state.settings.vehicle;
  document.getElementById('cfg-kml').value = state.settings.kml;
  document.getElementById('cfg-fuel-price').value = state.settings.fuelPrice;
  document.getElementById('cfg-email').value = state.email || '';

  refreshMapMarkers();
}

// ==========================================
// MAPA INTERACTIVO LEAFLET (OPENSTREETMAP)
// ==========================================
function initMap() {
  if (map) return;
  const startLat = state.basePoint ? state.basePoint.lat : 10.6012;
  const startLng = state.basePoint ? state.basePoint.lng : -66.9321;

  map = L.map('map').setView([startLat, startLng], 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  map.on('click', (e) => {
    document.getElementById('inp-lat').value = e.latlng.lat.toFixed(6);
    document.getElementById('inp-lng').value = e.latlng.lng.toFixed(6);
    alert(`📍 Coordenadas capturadas (${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}). Ve a "Nuevo Pedido" para guardar.`);
  });

  refreshMapMarkers();
  updateDriverMarkerOnMap();
}

function updateDriverMarkerOnMap() {
  if (!map || !liveDriverPos || !state.isPro) return;
  if (driverMarker) {
    driverMarker.setLatLng([liveDriverPos.lat, liveDriverPos.lng]);
  } else {
    driverMarker = L.circleMarker([liveDriverPos.lat, liveDriverPos.lng], {
      radius: 9,
      fillColor: '#10b981',
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.95
    }).addTo(map).bindPopup('🛵 Tu ubicación en vivo');
  }
}

function refreshMapMarkers() {
  if (!map || !markersLayer) return;
  markersLayer.clearLayers();
  if (routeLine) map.removeLayer(routeLine);

  const coords = [];
  if (state.basePoint) {
    L.marker([state.basePoint.lat, state.basePoint.lng]).addTo(markersLayer).bindPopup('🏠 Punto Salida/Retorno');
    coords.push([state.basePoint.lat, state.basePoint.lng]);
  }

  const pending = state.orders.filter(o => o.status === 'pending' && o.lat && o.lng);
  pending.forEach((o, i) => {
    L.marker([o.lat, o.lng]).addTo(markersLayer).bindPopup(`#${i + 1} ${o.client}`);
    coords.push([o.lat, o.lng]);
  });

  if (state.basePoint && pending.length > 0) {
    coords.push([state.basePoint.lat, state.basePoint.lng]);
  }

  if (coords.length > 1) {
    routeLine = L.polyline(coords, { color: '#f59e0b', weight: 4 }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
  }
}

// ==========================================
// MODAL DE ENTREGA CON COMPRESIÓN DE FOTO
// ==========================================
window.openDeliveryModal = function(id) {
  if (!requireOnlineOrPro('Marcar entregas sin conexión')) return;

  currentDeliveringId = id;
  compressedPhotoBase64 = null;
  const order = state.orders.find(o => o.id === id);
  document.getElementById('modal-client-name').textContent = `Cliente: ${order.client} - ${order.address}`;
  document.getElementById('inp-proof-photo').value = '';
  document.getElementById('photo-preview').classList.add('hidden');
  document.getElementById('inp-delivery-note').value = '';
  document.getElementById('delivery-modal').classList.remove('hidden');
};

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

window.deleteOrder = function(id) {
  if (!confirm('¿Eliminar este pedido de la lista?')) return;
  state.orders = state.orders.filter(o => o.id !== id);
  saveState();
};

window.openProModal = function() {
  document.getElementById('pro-modal').classList.remove('hidden');
};

// ==========================================
// EVENTOS PRINCIPALES
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  updateUI();

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.tab;
      document.getElementById(target).classList.add('active');
      if (target === 'tab-mapa') {
        setTimeout(() => { initMap(); map.invalidateSize(); }, 100);
      }
    });
  });

  document.getElementById('btn-set-base').addEventListener('click', () => {
    if (!navigator.geolocation) return alert('GPS no disponible.');
    navigator.geolocation.getCurrentPosition((pos) => {
      state.basePoint = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      saveState();
      alert('🏠 Punto de salida y retorno fijado en tu ubicación actual.');
    }, () => alert('Activa el GPS del teléfono para fijar tu punto de salida.'));
  });

  document.getElementById('btn-parse-wa').addEventListener('click', () => {
    const txt = document.getElementById('wa-paste').value;
    if (!txt.trim()) return;
    parseWhatsAppText(txt);
  });

  document.getElementById('btn-search-addr').addEventListener('click', searchAddressOSM);

  document.getElementById('btn-use-my-gps').addEventListener('click', () => {
    navigator.geolocation.getCurrentPosition((pos) => {
      document.getElementById('inp-lat').value = pos.coords.latitude.toFixed(6);
      document.getElementById('inp-lng').value = pos.coords.longitude.toFixed(6);
    });
  });

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
    document.querySelector('[data-tab="tab-ruta"]').click();
  });

  document.getElementById('btn-optimize').addEventListener('click', optimizeOrders);
  document.getElementById('btn-prefetch-offline').addEventListener('click', prefetchRouteMapTiles);

  document.getElementById('btn-clear-completed').addEventListener('click', () => {
    if (!confirm('¿Limpiar el historial de pedidos ya entregados?')) return;
    state.orders = state.orders.filter(o => o.status !== 'completed');
    saveState();
  });

  document.getElementById('btn-save-settings').addEventListener('click', () => {
    state.settings.vehicle = document.getElementById('cfg-vehicle').value;
    state.settings.kml = parseFloat(document.getElementById('cfg-kml').value) || 35;
    state.settings.fuelPrice = parseFloat(document.getElementById('cfg-fuel-price').value) || 0.50;
    saveState();
    alert('⚙️ Ajustes de vehículo y gasolina guardados.');
  });

  document.getElementById('btn-save-account').addEventListener('click', () => {
    const email = document.getElementById('cfg-email').value.trim();
    if (!email) return alert('Escribe tu correo Gmail.');
    state.email = email;
    saveState();
    alert(`✅ Cuenta ${email} vinculada localmente. Al conectar Google Play Billing, restaurará tu suscripción automáticamente.`);
  });

  document.getElementById('btn-pro-modal').addEventListener('click', openProModal);
  document.getElementById('btn-close-pro').addEventListener('click', () => {
    document.getElementById('pro-modal').classList.add('hidden');
  });
  document.getElementById('btn-activate-pro').addEventListener('click', () => {
    state.isPro = true;
    saveState();
    document.getElementById('pro-modal').classList.add('hidden');
    alert('👑 ¡Modo Ruta Flash PRO activado! Rastreo GPS en vivo sin internet, mapa caché offline, paradas ilimitadas y sin anuncios.');
  });

  document.getElementById('btn-share-summary').addEventListener('click', () => {
    const { totalKm, liters, fuelCost } = calculateTotalRouteMetrics();
    const cash = document.getElementById('fin-cash').textContent;
    const bank = document.getElementById('fin-bank').textContent;
    const merch = document.getElementById('fin-merchant').textContent;
    const net = document.getElementById('fin-net-profit').textContent;

    const msg = `⚡ *CUADRE RUTA FLASH* ⚡%0A` +
      `🛵 Recorrido total: ${totalKm.toFixed(1)} km%0A` +
      `⛽ Gasolina est.: ${liters.toFixed(2)} L ($${fuelCost.toFixed(2)})%0A` +
      `💵 Efectivo en mano: ${cash}%0A` +
      `📱 En cuenta/digital: ${bank}%0A` +
      `🏪 A rendir a comercios: ${merch}%0A` +
      `🏆 *Mi ganancia neta:* ${net}`;
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  });

  document.getElementById('btn-center-map').addEventListener('click', () => {
    if (map) refreshMapMarkers();
  });
});
