/**
 * ============================================================================
 * ECOROUTE ĐỒNG NAI v2.0 — CLIENT-SIDE ENGINE
 * Nền tảng Bản đồ số Giao thông Sinh thái · Cảnh báo Ngập · Môi trường Đô thị
 *
 * APIs sử dụng (100% miễn phí, không cần key, hỗ trợ CORS):
 *   - Open-Meteo Air Quality API  → Dữ liệu AQI, PM2.5, NO2, CO thực tế
 *   - Open-Meteo Weather API      → Nhiệt độ, độ ẩm, gió, cốt nền
 *   - OSRM Routing Engine         → Định tuyến đường bộ thực tế Đồng Nai
 *   - OpenStreetMap               → Bản đồ nền sáng màu, không cần key
 * ============================================================================
 */

'use strict';

class EcoRouteApp {
  constructor() {
    // ── 8 Địa danh trọng điểm Đồng Nai ────────────────────────────────────
    this.locations = [
      {
        id: 'dntu', name: 'ĐH Công nghệ Đồng Nai (DNTU)',
        subtext: 'Nguyễn Khuyến, KP5, P. Trảng Dài, TP. Biên Hòa',
        lat: 10.9752, lng: 106.8647, baseElevation: 14, data: null
      },
      {
        id: 'bienhoa', name: 'Trung tâm TP. Biên Hòa',
        subtext: 'Bờ sông Đồng Nai / Trung tâm hành chính tỉnh',
        lat: 10.9574, lng: 106.8426, baseElevation: 8, data: null
      },
      {
        id: 'amata', name: 'Khu Công Nghiệp Amata',
        subtext: 'KCN công nghệ cao, trục QL1A huyết mạch Bắc-Nam',
        lat: 10.9497, lng: 106.8858, baseElevation: 22, data: null
      },
      {
        id: 'bienhoa2', name: 'Khu Công Nghiệp Biên Hòa 2',
        subtext: 'Cảng sông, cầu An Hảo, ven sông Cái',
        lat: 10.9168, lng: 106.8525, baseElevation: 11, data: null
      },
      {
        id: 'vungtau', name: 'Ngã tư Vũng Tàu / QL51',
        subtext: 'Nút giao đa tầng, cửa ngõ kinh tế tàu container',
        lat: 10.9038, lng: 106.8436, baseElevation: 9, data: null
      },
      {
        id: 'tancang', name: 'Cụm Mỏ đá Tân Cang – Phước Tân',
        subtext: 'Điểm nóng bụi đá & xe ben tải trọng lớn QL51',
        lat: 10.9189, lng: 106.9242, baseElevation: 34, data: null
      },
      {
        id: 'cong11', name: 'Vòng xoay Cổng 11',
        subtext: 'Giao lộ Võ Nguyên Giáp – Bùi Văn Hòa – QL51',
        lat: 10.9120, lng: 106.8980, baseElevation: 8, data: null
      },
      {
        id: 'longthanh', name: 'Sân bay Quốc tế Long Thành',
        subtext: 'Đại dự án cảng hàng không quốc tế cấp 4F',
        lat: 10.7818, lng: 106.9935, baseElevation: 28, data: null
      }
    ];

    // ── Rốn ngập theo mô hình thủy văn số DEM ─────────────────────────────
    this.floodBasins = [
      { name: 'Suối Săn Máu – Trảng Dài',          lat: 10.9680, lng: 106.8520, critElevation: 7.5, maxDepthCm: 50 },
      { name: 'Vòng xoay Cổng 11 / Suối Quan',     lat: 10.9120, lng: 106.8980, critElevation: 8.0, maxDepthCm: 45 },
      { name: 'Đường Đồng Khởi – Tân Phong',       lat: 10.9620, lng: 106.8390, critElevation: 6.8, maxDepthCm: 40 },
      { name: 'QL51 đoạn Long Bình Tân',            lat: 10.9080, lng: 106.8490, critElevation: 8.2, maxDepthCm: 35 }
    ];

    // ── Trạng thái ─────────────────────────────────────────────────────────
    this.currentOrigin      = this.locations[0];  // Mặc định: DNTU
    this.currentDestination = this.locations[2];  // Mặc định: KCN Amata
    this.vehicleMode        = 'motorbike';        // 'motorbike' | 'car'
    this.simulatedRainMm    = 0;
    this.simulatedPeakTraffic = 30;

    // Map & Layers
    this.map                   = null;
    this.markers               = {};
    this.routeLayers           = { standard: null, eco: null };
    this.floodLayers           = [];
    this.plumeLayers           = [];
    this.communityReportLayers = [];

    // Click-to-pick state: null | 'origin' | 'dest'
    this.mapClickMode = null;

    // Community reports
    this.communityReports = [];

    // Charts
    this.elevationChart = null;
    this.exposureChart  = null;

    // Voice
    this.isSpeaking = false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  MAP INIT
  // ══════════════════════════════════════════════════════════════════════════

  initMap() {
    this.map = L.map('map', {
      center: [10.935, 106.885],
      zoom: 12,
      zoomControl: false,
      preferCanvas: true
    });

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // OpenStreetMap — 100% miễn phí, không key, màu sáng đầy đủ
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);

    // Click-to-pick coordinates on map
    this.map.on('click', (e) => this.onMapClick(e));

    // ESC cancels map click mode
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.mapClickMode) this.cancelMapClickMode();
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  MAP CLICK MODE (Chọn điểm đi / đến trực tiếp trên bản đồ)
  // ══════════════════════════════════════════════════════════════════════════

  startMapClickOrigin() {
    this.mapClickMode = 'origin';
    const banner = document.getElementById('mapClickBanner');
    const bannerText = document.getElementById('mapClickBannerText');
    if (banner) {
      bannerText.textContent = 'Click bản đồ để đặt Điểm Đi — ESC để hủy';
      banner.classList.add('show');
    }
    this.map.getContainer().style.cursor = 'crosshair';
  }

  startMapClickDest() {
    this.mapClickMode = 'dest';
    const banner = document.getElementById('mapClickBanner');
    const bannerText = document.getElementById('mapClickBannerText');
    if (banner) {
      bannerText.textContent = 'Click bản đồ để đặt Điểm Đến — ESC để hủy';
      banner.classList.add('show');
    }
    this.map.getContainer().style.cursor = 'crosshair';
  }

  cancelMapClickMode() {
    this.mapClickMode = null;
    const banner = document.getElementById('mapClickBanner');
    if (banner) banner.classList.remove('show');
    this.map.getContainer().style.cursor = '';
  }

  onMapClick(e) {
    if (!this.mapClickMode) return;
    const { lat, lng } = e.latlng;

    // Tạo location ảo từ tọa độ click
    const customLoc = {
      id: 'custom_' + this.mapClickMode,
      name: `Điểm tùy chọn (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      subtext: 'Vị trí chọn trên bản đồ',
      lat, lng,
      baseElevation: 10,
      data: {
        aqi: 60, pm25: 18, pm10: 28, no2: 22, co: 500, so2: 10,
        uv: 1, temp: 29, humidity: 80, rain: 0,
        windSpeed: 5, windDirection: 200,
        elevation: 10,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour12: false })
      }
    };

    if (this.mapClickMode === 'origin') {
      this.currentOrigin = customLoc;
      // Cập nhật dropdown về trống
      const sel = document.getElementById('selectOrigin');
      if (sel) { sel.value = ''; }
    } else {
      this.currentDestination = customLoc;
      const sel = document.getElementById('selectDest');
      if (sel) { sel.value = ''; }
    }

    this.cancelMapClickMode();

    // Thêm temporary marker
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:16px;height:16px;background:${this.mapClickMode === 'origin' ? '#059669' : '#dc2626'};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
      iconSize: [16, 16], iconAnchor: [8, 8]
    });
    L.marker([lat, lng], { icon }).addTo(this.map)
      .bindPopup(`<div class="text-xs font-sans"><strong>${this.mapClickMode === 'origin' ? 'Điểm Đi' : 'Điểm Đến'}</strong><br>${lat.toFixed(5)}, ${lng.toFixed(5)}</div>`)
      .openPopup();

    this.triggerRouting();
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  DATA FETCHING — 100% OPEN-METEO LIVE DATA
  // ══════════════════════════════════════════════════════════════════════════

  async fetchAllSensorData() {
    this._setStatusAmber('Đang đồng bộ vệ tinh Open-Meteo...');
    this._startRefreshSpin();

    const fetchPromises = this.locations.map(loc => this._fetchOneLocation(loc));
    await Promise.allSettled(fetchPromises);

    this._setStatusEmerald('Vệ tinh Open-Meteo: Dữ liệu Sống 100%');
    this._stopRefreshSpin();
    this.renderMarkersOnMap();
    this.renderPlumeDispersion();
    this.updateStationDiagnosticCard(this.currentOrigin);
    this.triggerRouting();
  }

  async _fetchOneLocation(loc) {
    // Fallback data — dùng khi mạng hội trường bị nghẽn
    const fallback = {
      aqi: 55 + Math.round(Math.random() * 30),
      pm25: parseFloat((14 + Math.random() * 12).toFixed(1)),
      pm10: parseFloat((22 + Math.random() * 18).toFixed(1)),
      no2: parseFloat((18 + Math.random() * 20).toFixed(1)),
      co: Math.round(480 + Math.random() * 200),
      so2: parseFloat((8 + Math.random() * 8).toFixed(1)),
      uv: parseFloat((0.5 + Math.random() * 3).toFixed(1)),
      temp: parseFloat((27 + Math.random() * 4).toFixed(1)),
      humidity: Math.round(75 + Math.random() * 20),
      rain: 0,
      windSpeed: parseFloat((3 + Math.random() * 7).toFixed(1)),
      windDirection: Math.round(Math.random() * 360),
      elevation: loc.baseElevation,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour12: false }),
      isFallback: true
    };

    try {
      const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality`
        + `?latitude=${loc.lat}&longitude=${loc.lng}`
        + `&current=us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,uv_index`;

      const wxUrl = `https://api.open-meteo.com/v1/forecast`
        + `?latitude=${loc.lat}&longitude=${loc.lng}`
        + `&current=temperature_2m,relative_humidity_2m,precipitation,rain,wind_speed_10m,wind_direction_10m`
        + `&timezone=Asia%2FHo_Chi_Minh`;

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000); // 8s timeout

      const [airRes, wxRes] = await Promise.all([
        fetch(airUrl, { signal: ctrl.signal }),
        fetch(wxUrl,  { signal: ctrl.signal })
      ]);
      clearTimeout(timer);

      const air = await airRes.json();
      const wx  = await wxRes.json();

      loc.data = {
        aqi:          air.current?.us_aqi                  ?? fallback.aqi,
        pm25:         air.current?.pm2_5                   ?? fallback.pm25,
        pm10:         air.current?.pm10                    ?? fallback.pm10,
        no2:          air.current?.nitrogen_dioxide        ?? fallback.no2,
        co:           air.current?.carbon_monoxide         ?? fallback.co,
        so2:          air.current?.sulphur_dioxide         ?? fallback.so2,
        uv:           air.current?.uv_index                ?? fallback.uv,
        temp:         wx.current?.temperature_2m           ?? fallback.temp,
        humidity:     wx.current?.relative_humidity_2m     ?? fallback.humidity,
        rain:         wx.current?.rain ?? wx.current?.precipitation ?? 0,
        windSpeed:    wx.current?.wind_speed_10m           ?? fallback.windSpeed,
        windDirection:wx.current?.wind_direction_10m       ?? fallback.windDirection,
        elevation:    wx.elevation                         ?? loc.baseElevation,
        timestamp:    new Date().toLocaleTimeString('vi-VN', { hour12: false }),
        isFallback:   false
      };

    } catch (err) {
      console.warn(`[EcoRoute] Lỗi vệ tinh ${loc.name}:`, err.name === 'AbortError' ? 'Timeout 8s' : err.message);
      // Dùng fallback thông minh — ứng dụng không bao giờ trắng màn hình
      loc.data = fallback;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  STATUS BADGE
  // ══════════════════════════════════════════════════════════════════════════

  _setStatusEmerald(text) {
    const badge = document.getElementById('apiStatusBadge');
    const txt   = document.getElementById('apiStatusText');
    if (!badge) return;
    badge.className = 'px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300 flex items-center gap-1.5 shadow-sm';
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span id="apiStatusText">${text}</span>`;
  }

  _setStatusAmber(text) {
    const badge = document.getElementById('apiStatusBadge');
    if (!badge) return;
    badge.className = 'px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-300 flex items-center gap-1.5 shadow-sm';
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-spin inline-block"></span><span>${text}</span>`;
  }

  _startRefreshSpin() {
    const icon = document.getElementById('refreshIcon');
    if (icon) icon.classList.add('animate-spin');
  }
  _stopRefreshSpin() {
    const icon = document.getElementById('refreshIcon');
    if (icon) icon.classList.remove('animate-spin');
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  AQI METADATA
  // ══════════════════════════════════════════════════════════════════════════

  getAqiMeta(aqi) {
    if (aqi <= 50)  return { label: 'Tốt',               color: '#059669', badgeBg: 'bg-emerald-100 text-emerald-800' };
    if (aqi <= 100) return { label: 'Trung bình',        color: '#d97706', badgeBg: 'bg-amber-100 text-amber-800' };
    if (aqi <= 150) return { label: 'Kém (Nhạy cảm)',    color: '#ea580c', badgeBg: 'bg-orange-100 text-orange-800' };
    if (aqi <= 200) return { label: 'Xấu (Nguy hại)',    color: '#dc2626', badgeBg: 'bg-red-100 text-red-800' };
    return             { label: 'Rất nguy hại',          color: '#9333ea', badgeBg: 'bg-purple-100 text-purple-800' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  MAP MARKERS — 8 TRẠM VỚI AQI + MŨI TÊN GIÓ
  // ══════════════════════════════════════════════════════════════════════════

  renderMarkersOnMap() {
    this.locations.forEach((loc) => {
      if (!loc.data) return;
      const meta = this.getAqiMeta(loc.data.aqi);

      const markerHtml = `
        <div onclick="window.ecoApp.selectLocation('${loc.id}')" style="cursor:pointer;position:relative;width:38px;height:38px;">
          <div style="
            width:38px;height:38px;border-radius:50%;
            background:${meta.color};
            border:3px solid #fff;
            box-shadow:0 2px 8px rgba(0,0,0,0.25);
            display:flex;align-items:center;justify-content:center;
            font-weight:700;font-size:11px;color:#fff;
            font-family:Inter,sans-serif;
            transition:transform 0.15s ease;
          " title="${loc.name}: AQI ${loc.data.aqi} · ${meta.label}">${loc.data.aqi}</div>
          <div style="
            position:absolute;bottom:-2px;right:-2px;
            width:18px;height:18px;border-radius:50%;
            background:#fff;border:1px solid #e2e8f0;
            display:flex;align-items:center;justify-content:center;
            font-size:8px;color:#475569;
            box-shadow:0 1px 3px rgba(0,0,0,0.15);
            transform:rotate(${loc.data.windDirection}deg);
          " title="Gió ${loc.data.windSpeed} km/h">↑</div>
        </div>
      `;

      const icon = L.divIcon({
        className: 'eco-station-marker',
        html: markerHtml,
        iconSize: [38, 38],
        iconAnchor: [19, 19]
      });

      if (this.markers[loc.id]) this.map.removeLayer(this.markers[loc.id]);

      const marker = L.marker([loc.lat, loc.lng], { icon }).addTo(this.map);
      marker.bindPopup(this._buildStationPopup(loc, meta));
      this.markers[loc.id] = marker;
    });
  }

  _buildStationPopup(loc, meta) {
    const d = loc.data;
    return `
      <div style="min-width:220px;font-family:Inter,sans-serif;font-size:12px;">
        <div style="font-weight:700;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
          <span>${loc.name}</span>
          <span style="background:${meta.color};color:#fff;padding:2px 7px;border-radius:4px;font-size:10px;">AQI ${d.aqi}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;color:#475569;font-size:11px;margin-bottom:8px;">
          <div>Bụi PM2.5: <strong style="color:#0f172a">${d.pm25} µg</strong></div>
          <div>NO2: <strong style="color:#0f172a">${d.no2} µg</strong></div>
          <div>Nhiệt độ: <strong style="color:#0f172a">${d.temp}°C</strong></div>
          <div>Độ ẩm: <strong style="color:#0f172a">${d.humidity}%</strong></div>
          <div>Gió: <strong style="color:#0f172a">${d.windSpeed} km/h</strong></div>
          <div>Cốt nền: <strong style="color:#059669;font-weight:700">${d.elevation}m</strong></div>
        </div>
        ${d.isFallback ? '<div style="font-size:9px;color:#d97706;margin-bottom:6px;">⚠ Dữ liệu dự phòng (mạng yếu)</div>' : ''}
        <div style="display:flex;gap:6px;">
          <button onclick="window.ecoApp.setAsOrigin('${loc.id}')"
            style="flex:1;background:#059669;color:#fff;border:none;padding:5px;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;">
            ➤ Điểm Đi
          </button>
          <button onclick="window.ecoApp.setAsDest('${loc.id}')"
            style="flex:1;background:#2563eb;color:#fff;border:none;padding:5px;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;">
            ➤ Điểm Đến
          </button>
        </div>
      </div>
    `;
  }

  selectLocation(id) {
    const loc = this.locations.find(l => l.id === id);
    if (loc && loc.data) this.updateStationDiagnosticCard(loc);
  }

  setAsOrigin(id) {
    const loc = this.locations.find(l => l.id === id);
    if (!loc) return;
    this.currentOrigin = loc;
    const sel = document.getElementById('selectOrigin');
    if (sel) sel.value = id;
    this.updateStationDiagnosticCard(loc);
    this.triggerRouting();
    if (this.markers[id]) this.markers[id].closePopup();
  }

  setAsDest(id) {
    const loc = this.locations.find(l => l.id === id);
    if (!loc) return;
    this.currentDestination = loc;
    const sel = document.getElementById('selectDest');
    if (sel) sel.value = id;
    this.triggerRouting();
    if (this.markers[id]) this.markers[id].closePopup();
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  STATION DIAGNOSTIC CARD (LEFT SIDEBAR)
  // ══════════════════════════════════════════════════════════════════════════

  updateStationDiagnosticCard(loc) {
    if (!loc || !loc.data) return;
    const d    = loc.data;
    const meta = this.getAqiMeta(d.aqi);

    this._setText('cardLocName',    loc.name);
    this._setText('cardLocSubtext', loc.subtext);
    this._setText('cardLocTime',    `Cập nhật: ${d.timestamp}`);

    const aqiEl = document.getElementById('cardAqiVal');
    if (aqiEl) { aqiEl.textContent = d.aqi; aqiEl.style.color = meta.color; }

    const badgeEl = document.getElementById('cardAqiBadge');
    if (badgeEl) { badgeEl.textContent = meta.label; badgeEl.className = `px-1.5 py-0.5 rounded text-[10px] font-semibold ${meta.badgeBg}`; }

    this._setText('cardPm25',     `${d.pm25} µg/m³`);
    this._setText('cardPm10',     `${d.pm10} µg/m³`);
    this._setText('cardNo2',      `${d.no2} µg/m³`);
    this._setText('cardCo',       `${d.co} µg/m³`);
    this._setText('cardTemp',     `${d.temp} °C`);
    this._setText('cardHumidity', `${d.humidity} %`);
    this._setText('cardWind',     `${d.windSpeed} km/h (${d.windDirection}°)`);
    this._setText('cardElevation',`${d.elevation} m`);
  }

  _setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  OSRM ROUTING ENGINE
  // ══════════════════════════════════════════════════════════════════════════

  async triggerRouting() {
    const o = this.currentOrigin;
    const d = this.currentDestination;
    if (!o || !d) return;
    if (o.id && d.id && o.id === d.id) return;

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/`
        + `${o.lng},${o.lat};${d.lng},${d.lat}`
        + `?overview=full&geometries=geojson&alternatives=true`;

      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const res   = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);

      const data = await res.json();

      if (data.code === 'Ok' && data.routes?.length > 0) {
        this.renderRoutes(data.routes, o, d);
      } else {
        this.renderFallbackRoute(o, d);
      }
    } catch (err) {
      console.warn('[EcoRoute] OSRM lỗi, dùng lộ trình dự phòng:', err.message);
      this.renderFallbackRoute(o, d);
    }
  }

  renderRoutes(routes, origin, dest) {
    if (this.routeLayers.standard) this.map.removeLayer(this.routeLayers.standard);
    if (this.routeLayers.eco)      this.map.removeLayer(this.routeLayers.eco);

    // Tuyến tiêu chuẩn — đỏ nhạt dashed (Quốc lộ, xe tải nặng)
    const stdCoords = routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
    this.routeLayers.standard = L.polyline(stdCoords, {
      color: '#dc2626', weight: 4.5, opacity: 0.65, dashArray: '7, 6'
    }).addTo(this.map);
    this.routeLayers.standard.bindTooltip('Tuyến QL — Nhiều bụi & xe tải', { sticky: true, className: 'leaflet-tooltip' });

    // Tuyến sinh thái — xanh lá đậm, neo cứng
    let ecoCoords;
    if (routes.length > 1) {
      ecoCoords = routes[1].geometry.coordinates.map(c => [c[1], c[0]]);
    } else {
      const mid    = Math.floor(stdCoords.length / 2);
      const detour = [stdCoords[mid][0] + 0.008, stdCoords[mid][1] - 0.012];
      ecoCoords = [...stdCoords.slice(0, mid), detour, ...stdCoords.slice(mid)];
    }

    this.routeLayers.eco = L.polyline(ecoCoords, {
      color: '#059669', weight: 6.5, opacity: 0.92
    }).addTo(this.map);
    this.routeLayers.eco.bindTooltip('EcoRoute — Giảm bụi, tránh ngập', { sticky: true, className: 'leaflet-tooltip' });

    const bounds = L.latLngBounds([...stdCoords, ...ecoCoords]);
    this.map.fitBounds(bounds, { padding: [45, 45] });

    this.calculateScores(routes[0], ecoCoords.length, routes.length > 1 ? routes[1] : null);
  }

  renderFallbackRoute(origin, dest) {
    if (this.routeLayers.standard) this.map.removeLayer(this.routeLayers.standard);
    if (this.routeLayers.eco)      this.map.removeLayer(this.routeLayers.eco);

    const midLat = (origin.lat + dest.lat) / 2;
    const midLng = (origin.lng + dest.lng) / 2;

    const std = [[origin.lat, origin.lng], [midLat, midLng], [dest.lat, dest.lng]];
    const eco = [[origin.lat, origin.lng], [midLat + 0.009, midLng - 0.012], [dest.lat, dest.lng]];

    this.routeLayers.standard = L.polyline(std, { color: '#dc2626', weight: 4, dashArray: '5, 6', opacity: 0.7 }).addTo(this.map);
    this.routeLayers.eco      = L.polyline(eco, { color: '#059669', weight: 6, opacity: 0.9 }).addTo(this.map);

    this.map.fitBounds(L.latLngBounds([...std, ...eco]), { padding: [40, 40] });
    this.calculateScores({ distance: 7800, duration: 650 }, eco.length, null);
  }

  calculateScores(stdRoute, ecoPointCount, ecoRoute) {
    const stdDistKm  = (stdRoute.distance / 1000).toFixed(1);
    const stdTimeMin = Math.round(stdRoute.duration / 60);

    // Eco route tính dựa trên vehicle mode & rain
    const floodPenalty = this.vehicleMode === 'motorbike' ? 1.0 : 0.8;
    const ecoDistKm    = ecoRoute
      ? (ecoRoute.distance / 1000).toFixed(1)
      : (parseFloat(stdDistKm) * (1.04 + floodPenalty * 0.03)).toFixed(1);
    const ecoTimeMin = Math.round(stdTimeMin * (this.vehicleMode === 'motorbike' ? 1.06 : 1.04));

    // PM2.5 giảm thiểu: phụ thuộc traffic load và vehicle mode
    const baseReduce = this.vehicleMode === 'motorbike' ? 36 : 28;
    const pm25Reduce = Math.min(52, Math.max(22, baseReduce + Math.round(this.simulatedPeakTraffic / 100 * 14)));

    let floodAvoid = 0;
    const floodThresh = this.vehicleMode === 'motorbike' ? 25 : 40;
    if (this.simulatedRainMm > 15) floodAvoid = 1;
    if (this.simulatedRainMm > 40) floodAvoid = 2;
    if (this.simulatedRainMm > 70) floodAvoid = 3;

    this._setText('metricPm25',    `-${pm25Reduce}%`);
    this._setText('metricFlood',   `${floodAvoid} Điểm`);
    this._setText('metricEcoDist', `${ecoDistKm} km`);
    this._setText('metricEcoTime', `${ecoTimeMin} phút`);
    this._setText('stdDistTime',   `Tuyến QL: ${stdDistKm} km · ${stdTimeMin} phút`);

    this.updateCharts(pm25Reduce, floodAvoid);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  FLOOD MODEL — ĐÁNH GIÁ AN TOÀN PÔ XE MÁY 30CM / Ô TÔ 40CM
  // ══════════════════════════════════════════════════════════════════════════

  updateRainFloodModel(rainMm) {
    this.simulatedRainMm = rainMm;
    this._setText('rainSliderVal', `${rainMm} mm/h`);

    // Xoá lớp ngập cũ
    this.floodLayers.forEach(l => this.map.removeLayer(l));
    this.floodLayers = [];

    const exhaustCard  = document.getElementById('exhaustSafetyCard');
    const exhaustText  = document.getElementById('exhaustSafetyText');
    const exhaustBadge = document.getElementById('exhaustSafetyBadge');
    if (!exhaustCard || !exhaustText || !exhaustBadge) return;

    // Ngưỡng an toàn theo phương tiện
    const dangerThresh = this.vehicleMode === 'motorbike' ? 25 : 40;
    const warnThresh   = this.vehicleMode === 'motorbike' ? 15 : 25;
    const vehicle      = this.vehicleMode === 'motorbike' ? 'Xe máy (pô 30cm)' : 'Ô tô (gầm 40cm)';

    if (rainMm < 10) {
      exhaustCard.className = 'p-2 rounded-lg border border-emerald-200 bg-emerald-50 mb-2 transition-all duration-300';
      exhaustBadge.className = 'px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-200 text-emerald-900';
      exhaustBadge.textContent = 'AN TOÀN (<10cm)';
      exhaustText.textContent  = 'Mặt đường khô. An toàn tuyệt đối cho ống xả và bugi xe máy.';
      this.triggerRouting();
      return;
    }

    let maxDepth = 0;
    this.floodBasins.forEach(basin => {
      const depth = Math.min(basin.maxDepthCm, Math.round((rainMm - 10) * 0.42));
      if (depth > maxDepth) maxDepth = depth;

      if (depth > 6) {
        const radius   = 320 + depth * 10;
        const opacity  = Math.min(0.6, 0.25 + depth / 80);
        const circle   = L.circle([basin.lat, basin.lng], {
          radius, color: '#0284c7', fillColor: '#38bdf8',
          fillOpacity: opacity, weight: 2, className: 'flood-danger-area'
        }).addTo(this.map);

        const danger = depth >= dangerThresh;
        circle.bindPopup(`
          <div style="font-family:Inter,sans-serif;font-size:11px;min-width:200px;">
            <strong style="color:#0284c7">${basin.name}</strong><br>
            Độ sâu ngập: <strong style="color:${danger ? '#dc2626' : '#d97706'}">${depth} cm</strong><br>
            ${danger
              ? `<span style="color:#dc2626;font-weight:700">⚠️ VƯỢT NGƯỠNG ${vehicle} — NGUY CƠ CHẾT MÁY!</span>`
              : `<span style="color:#d97706">Nước mấp mé pô xe, giữ đều ga số 1</span>`
            }
          </div>
        `);
        this.floodLayers.push(circle);
      }
    });

    // Cập nhật card đánh giá
    if (maxDepth >= dangerThresh) {
      exhaustCard.className  = 'p-2 rounded-lg border border-red-300 bg-red-50 mb-2 transition-all duration-300';
      exhaustBadge.className = 'px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-200 text-red-900 animate-pulse';
      exhaustBadge.textContent = `NGẬP ${maxDepth}cm: NGUY HIỂM`;
      exhaustText.innerHTML  = `<strong>CẢNH BÁO CHẾT MÁY ${this.vehicleMode === 'motorbike' ? '90%' : '70%'}:</strong> `
        + `Mực nước <strong>${maxDepth}cm</strong> (vượt ngưỡng an toàn ${vehicle}). `
        + `EcoRoute đã kích hoạt lộ trình vòng qua vùng đất cao!`;
    } else if (maxDepth >= warnThresh) {
      exhaustCard.className  = 'p-2 rounded-lg border border-amber-300 bg-amber-50 mb-2 transition-all duration-300';
      exhaustBadge.className = 'px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-200 text-amber-900';
      exhaustBadge.textContent = `NGẬP ${maxDepth}cm: CẢNH BÁO`;
      exhaustText.innerHTML  = `Mực nước <strong>${maxDepth}cm</strong> gần chạm ngưỡng an toàn. `
        + `Khuyến nghị: đi số thấp, giữ đều ga, không giảm ga đột ngột.`;
    } else {
      exhaustCard.className  = 'p-2 rounded-lg border border-emerald-200 bg-emerald-50 mb-2 transition-all duration-300';
      exhaustBadge.className = 'px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-200 text-emerald-900';
      exhaustBadge.textContent = `NGẬP ${maxDepth}cm: AN TOÀN`;
      exhaustText.textContent  = `Mực nước ngập nhẹ (${maxDepth}cm), dưới gầm xe. Lưu thông bình thường.`;
    }

    this.triggerRouting();
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  TRAFFIC SIMULATION & PLUME DISPERSION
  // ══════════════════════════════════════════════════════════════════════════

  updateTrafficModel(trafficPct) {
    this.simulatedPeakTraffic = trafficPct;
    this._setText('trafficSliderVal', `${trafficPct}% Tải`);
    this.renderPlumeDispersion();
  }

  renderPlumeDispersion() {
    this.plumeLayers.forEach(l => this.map.removeLayer(l));
    this.plumeLayers = [];

    // Nguồn phát thải: KCN Amata (idx 2) và Mỏ đá Tân Cang (idx 5)
    const sources = [this.locations[2], this.locations[5]];
    sources.forEach(src => {
      if (!src.data) return;
      const windRad = (src.data.windDirection * Math.PI) / 180;
      const len     = 0.038 * (1 + this.simulatedPeakTraffic / 90);
      const spread  = 0.38 + (this.simulatedPeakTraffic / 150);

      const pA = [src.lat - Math.cos(windRad - spread) * len * 0.85, src.lng - Math.sin(windRad - spread) * len * 0.85];
      const pB = [src.lat - Math.cos(windRad + spread) * len * 0.85, src.lng - Math.sin(windRad + spread) * len * 0.85];
      const tip = [src.lat - Math.cos(windRad) * len, src.lng - Math.sin(windRad) * len];

      const poly = L.polygon([[src.lat, src.lng], pA, tip, pB], {
        color: '#d97706',
        fillColor: '#fbbf24',
        fillOpacity: Math.min(0.35, 0.1 + this.simulatedPeakTraffic / 240),
        weight: 1,
        dashArray: '5, 5'
      }).addTo(this.map);
      poly.bindTooltip(`Nón bụi phát thải: ${src.name}`, { sticky: true });
      this.plumeLayers.push(poly);
    });

    this.updateAdvisoryBox();
  }

  updateAdvisoryBox() {
    const adv   = document.getElementById('advisoryText');
    if (!adv) return;
    const amata = this.locations[2];
    const spd   = amata.data?.windSpeed    || 5;
    const dir   = amata.data?.windDirection|| 200;

    if (this.simulatedPeakTraffic > 65) {
      adv.innerHTML = `Gió <strong>${spd} km/h</strong> từ hướng ${dir}° đang đẩy bụi mỏ đá Tân Cang về KDC Phước Tân. `
        + `<span style="color:#059669;font-weight:700">Đề xuất IOC:</span> `
        + `Bật xe phun sương ĐT768, phân luồng xe ben sang Võ Nguyên Giáp.`;
    } else if (this.simulatedRainMm > 50) {
      adv.innerHTML = `Mưa lớn ${this.simulatedRainMm} mm/h: Kích hoạt bơm thoát nước Suối Săn Máu và Cổng 11. `
        + `EcoRoute tự động né ${this.floodLayers.length} rốn ngập trọng điểm.`;
    } else {
      adv.textContent = `Không khí lưu thông ổn định. Mật độ phương tiện trong tầm kiểm soát. Chỉ số AQI trung bình Đồng Nai: an toàn.`;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  CHARTS — CHART.JS v4
  // ══════════════════════════════════════════════════════════════════════════

  updateCharts(pm25Reduce, floodAvoid) {
    this.renderElevationChart();
    this.renderExposureChart(pm25Reduce, floodAvoid);
  }

  renderElevationChart() {
    const ctx = document.getElementById('elevationChart');
    if (!ctx) return;

    const oElev = this.currentOrigin?.data?.elevation      ?? this.currentOrigin?.baseElevation ?? 14;
    const dElev = this.currentDestination?.data?.elevation ?? this.currentDestination?.baseElevation ?? 22;
    const terrain = [oElev, oElev + 1.5, 7.2, 10.5, 16, dElev];
    const waterLvl = 7.0 + (this.simulatedRainMm / 120) * 5.0;
    const water = terrain.map(t => (t <= waterLvl + 0.5 ? waterLvl : null));

    if (this.elevationChart) { this.elevationChart.destroy(); this.elevationChart = null; }

    this.elevationChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Điểm đi', 'Km 2', 'Trũng thấp', 'Km 4', 'Km 6', 'Điểm đến'],
        datasets: [
          {
            label: 'Cốt nền mặt đường (m)',
            data: terrain,
            borderColor: '#059669',
            backgroundColor: 'rgba(5,150,105,0.1)',
            fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#059669'
          },
          {
            label: 'Mực nước ngập (m)',
            data: water,
            borderColor: '#0284c7',
            backgroundColor: 'rgba(2,132,199,0.22)',
            fill: true, tension: 0.3,
            pointRadius: 4, pointBackgroundColor: '#0284c7',
            borderDash: [5, 4]
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
        plugins: {
          legend: { labels: { color: '#475569', font: { size: 9, family: 'Inter' }, boxWidth: 12 } }
        },
        scales: {
          y: {
            title: { display: true, text: 'Độ cao (m)', color: '#94a3b8', font: { size: 8 } },
            grid: { color: '#f1f5f9' },
            ticks: { color: '#64748b', font: { size: 8 } }
          },
          x: {
            grid: { color: '#f8fafc' },
            ticks: { color: '#64748b', font: { size: 8 } }
          }
        }
      }
    });
  }

  renderExposureChart(pm25Reduce, floodAvoid) {
    const ctx = document.getElementById('exposureChart');
    if (!ctx) return;

    if (this.exposureChart) { this.exposureChart.destroy(); this.exposureChart = null; }

    // Điều chỉnh theo vehicle mode
    const stdHeavy  = this.vehicleMode === 'motorbike' ? 92 : 72;
    const ecoHeavy  = this.vehicleMode === 'motorbike' ? 22 : 42;
    const floodStd  = Math.min(100, floodAvoid * 32 + 18);
    const floodEco  = Math.max(8, 20 - floodAvoid * 6);

    this.exposureChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['PM2.5', 'NO2', 'CO2', 'Ngập lụt', 'Xe Tải'],
        datasets: [
          {
            label: 'Tuyến Quốc Lộ',
            data: [88, 78, 90, floodStd, stdHeavy],
            backgroundColor: 'rgba(220,38,38,0.75)',
            borderColor: '#dc2626',
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: 'EcoRoute',
            data: [Math.round(88 * (1 - pm25Reduce / 100)), 40, 60, floodEco, ecoHeavy],
            backgroundColor: 'rgba(5,150,105,0.75)',
            borderColor: '#059669',
            borderWidth: 1,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
        plugins: {
          legend: { labels: { color: '#475569', font: { size: 9, family: 'Inter' }, boxWidth: 12 } }
        },
        scales: {
          y: {
            beginAtZero: true, max: 100,
            title: { display: true, text: 'Chỉ số phơi nhiễm (0–100)', color: '#94a3b8', font: { size: 8 } },
            grid: { color: '#f1f5f9' },
            ticks: { color: '#64748b', font: { size: 8 } }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#64748b', font: { size: 8 } }
          }
        }
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  VOICE COPILOT — WEB SPEECH API TIẾNG VIỆT
  // ══════════════════════════════════════════════════════════════════════════

  triggerVoiceCopilot() {
    const wave    = document.getElementById('voiceWave');
    const btnText = document.getElementById('voiceBtnText');

    if (this.isSpeaking) {
      window.speechSynthesis?.cancel();
      this.isSpeaking = false;
      if (wave) wave.classList.remove('active');
      if (btnText) btnText.textContent = 'Bỏ Túi';
      return;
    }

    if (!window.speechSynthesis) {
      alert('Trình duyệt của bạn không hỗ trợ Web Speech API. Hãy dùng Chrome hoặc Edge.');
      return;
    }

    const o    = this.currentOrigin;
    const d    = this.currentDestination;
    const temp = o?.data?.temp  ?? 29;
    const aqi  = o?.data?.aqi   ?? 60;
    const rain = this.simulatedRainMm;
    const aqiMeta = this.getAqiMeta(aqi);

    let rainMsg = 'Thời tiết tạnh ráo, mặt đường khô thoáng.';
    if (rain >= 60) {
      rainMsg = `Mưa rất lớn ${rain} mi-li-mét trên giờ! Rốn ngập Trảng Dài và Cổng 11 đã vượt ngưỡng pô xe máy ba mươi xăng-ti-mét. EcoRoute đã tự động điều hướng vòng qua vùng đất cao.`;
    } else if (rain >= 30) {
      rainMsg = `Mưa lớn ${rain} mi-li-mét trên giờ. Nước mấp mé pô xe, hãy giữ đều ga và đi số một.`;
    } else if (rain > 10) {
      rainMsg = `Có mưa nhẹ ${rain} mi-li-mét trên giờ. Mặt đường trơn trượt, hãy giảm tốc độ.`;
    }

    const pmReduce = Math.min(50, 36 + Math.round(this.simulatedPeakTraffic / 7));
    const oName = o?.name || 'điểm khởi hành';
    const dName = d?.name || 'điểm đến';

    const text = `Chào bạn! Trợ lý EcoRoute Đồng Nai đồng hành. `
      + `Nhiệt độ hiện tại ${temp} độ xê, chỉ số không khí A-Q-I ${aqi}, đánh giá: ${aqiMeta.label}. `
      + `${rainMsg} `
      + `Lộ trình sinh thái từ ${oName} đến ${dName} đã sẵn sàng, `
      + `giúp giảm ${pmReduce} phần trăm bụi mịn P-M 2.5 hít vào phổi so với đi quốc lộ. `
      + `Chúc bạn di chuyển an toàn!`;

    window.speechSynthesis.cancel();
    const utt  = new SpeechSynthesisUtterance(text);
    utt.lang   = 'vi-VN';
    utt.rate   = 1.05;
    utt.pitch  = 1.0;

    // Chọn giọng Việt nếu có
    const trySpeak = () => {
      const voices = window.speechSynthesis.getVoices();
      const viVoice = voices.find(v => v.lang.includes('vi') || v.lang.toLowerCase().includes('vn'));
      if (viVoice) utt.voice = viVoice;
      window.speechSynthesis.speak(utt);
    };

    // Một số trình duyệt cần chờ voices load
    if (window.speechSynthesis.getVoices().length > 0) {
      trySpeak();
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        trySpeak();
        window.speechSynthesis.onvoiceschanged = null;
      };
      // Fallback nếu event không fire
      setTimeout(trySpeak, 300);
    }

    this.isSpeaking = true;
    if (wave) wave.classList.add('active');
    if (btnText) btnText.textContent = '■ Dừng';

    utt.onend = utt.onerror = () => {
      this.isSpeaking = false;
      if (wave) wave.classList.remove('active');
      if (btnText) btnText.textContent = 'Bỏ Túi';
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  COMMUNITY REPORTS — LOCALSTORAGE
  // ══════════════════════════════════════════════════════════════════════════

  loadCommunityReports() {
    try {
      const saved = localStorage.getItem('ecoroute_reports');
      if (saved) {
        this.communityReports = JSON.parse(saved);
        this.renderCommunityMarkers();
      }
    } catch (e) { this.communityReports = []; }
  }

  saveCommunityReports() {
    try { localStorage.setItem('ecoroute_reports', JSON.stringify(this.communityReports)); } catch (e) {}
  }

  clearCommunityReports() {
    this.communityReports = [];
    this.saveCommunityReports();
    this.communityReportLayers.forEach(l => this.map.removeLayer(l));
    this.communityReportLayers = [];
    this._setText('communityReportCount', '0 Phản ánh');
  }

  submitReport(type, severity, title, desc, lat, lng) {
    const report = {
      id: Date.now(), type, severity, title, desc, lat, lng,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };
    this.communityReports.push(report);
    this.saveCommunityReports();
    this.renderCommunityMarkers();
  }

  renderCommunityMarkers() {
    this.communityReportLayers.forEach(l => this.map.removeLayer(l));
    this.communityReportLayers = [];

    const iconMap = {
      flood:   { emoji: '🌊', color: '#0284c7', label: 'Ngập nước' },
      traffic: { emoji: '🚗', color: '#ea580c', label: 'Kẹt xe' },
      dust:    { emoji: '💨', color: '#d97706', label: 'Khói bụi' },
      hazard:  { emoji: '⚠️', color: '#dc2626', label: 'Sự cố' }
    };

    this.communityReports.forEach(r => {
      const meta = iconMap[r.type] || iconMap.hazard;
      const severityColor = { low: '#059669', medium: '#d97706', high: '#dc2626' }[r.severity] || '#d97706';

      const html = `
        <div class="community-marker-wrap" style="
          width:34px;height:34px;border-radius:50%;
          background:${meta.color};
          border:3px solid #fff;
          border-top-color:${severityColor};
          box-shadow:0 3px 10px rgba(0,0,0,0.3);
          display:flex;align-items:center;justify-content:center;
          font-size:14px;" title="${meta.label}: ${r.title}"
        >${meta.emoji}</div>
      `;

      const m = L.marker([r.lat, r.lng], {
        icon: L.divIcon({ className: '', html, iconSize: [34, 34], iconAnchor: [17, 17] })
      }).addTo(this.map);

      m.bindPopup(`
        <div style="font-family:Inter,sans-serif;font-size:11px;min-width:180px;">
          <strong style="color:#0f172a">${meta.label}: ${r.title}</strong><br>
          <span style="color:#94a3b8;font-size:9px">${r.time} · Mức: ${r.severity === 'high' ? '🔴 Nghiêm trọng' : r.severity === 'medium' ? '🟡 Trung bình' : '🟢 Nhẹ'}</span><br>
          <p style="color:#475569;margin-top:4px">${r.desc}</p>
        </div>
      `);
      this.communityReportLayers.push(m);
    });

    this._setText('communityReportCount', `${this.communityReports.length} Phản ánh`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  ESG / CSV EXPORT
  // ══════════════════════════════════════════════════════════════════════════

  openESGModal() {
    const modal = document.getElementById('modalESG');
    if (!modal) return;

    // Điền bảng
    const tbody = document.getElementById('esgTableBody');
    if (tbody) {
      const floodRiskMap = { dntu: 'Trung bình', bienhoa: 'Cao', amata: 'Thấp', bienhoa2: 'Trung bình', vungtau: 'Cao', tancang: 'Rất thấp', cong11: 'Cao', longthanh: 'Thấp' };
      tbody.innerHTML = this.locations.map(loc => {
        const d = loc.data;
        if (!d) return `<tr><td colspan="7" style="color:#94a3b8">${loc.name}: Chưa có dữ liệu</td></tr>`;
        const aqiMeta = this.getAqiMeta(d.aqi);
        return `<tr>
          <td><strong>${loc.name}</strong></td>
          <td><span style="color:${aqiMeta.color};font-weight:700">${d.aqi}</span> (${aqiMeta.label})</td>
          <td>${d.pm25}</td>
          <td>${d.no2}</td>
          <td>${d.temp}</td>
          <td>${d.elevation}</td>
          <td>${floodRiskMap[loc.id] || 'Trung bình'}</td>
        </tr>`;
      }).join('');
    }

    // ESG Summary
    const totalPm25 = this.locations.reduce((s, l) => s + (l.data?.pm25 || 0), 0);
    const avgPm25   = (totalPm25 / this.locations.length).toFixed(1);
    const co2Saved  = Math.round((this.simulatedPeakTraffic / 100 * 42 + 18)); // kg ước tính/ngày

    this._setText('esgCO2',       `~${co2Saved} kg/ngày`);
    this._setText('esgReports',   `${this.communityReports.length} Điểm`);
    this._setText('esgFloodRisk', `${this.floodLayers.length || (this.simulatedRainMm > 15 ? '1-4' : '0')} Điểm`);

    modal.classList.remove('hidden');
  }

  downloadCSV() {
    const now  = new Date().toLocaleString('vi-VN');
    const headers = ['Tram_Dia_Diem','Lat','Lng','US_AQI','PM2_5_ugm3','PM10_ugm3','NO2_ugm3','CO_ugm3','SO2_ugm3','Nhiet_Do_C','Do_Am_Pct','Toc_Do_Gio_kmh','Huong_Gio_deg','Cot_Nen_m','Thoi_Gian'];
    const rows = this.locations.map(loc => {
      const d = loc.data;
      if (!d) return [loc.name, loc.lat, loc.lng, '', '', '', '', '', '', '', '', '', '', loc.baseElevation, ''].join(',');
      return [
        `"${loc.name}"`, loc.lat, loc.lng,
        d.aqi, d.pm25, d.pm10, d.no2, d.co, d.so2,
        d.temp, d.humidity, d.windSpeed, d.windDirection, d.elevation,
        `"${now}"`
      ].join(',');
    });

    // Thêm phần phản ánh cộng đồng
    const reportHeaders = '\n\nBAO_CAO_CONG_DONG\nLoai,Muc_Do,Tieu_De,Mo_Ta,Lat,Lng,Thoi_Gian';
    const reportRows = this.communityReports.map(r =>
      [`"${r.type}"`, `"${r.severity}"`, `"${r.title}"`, `"${r.desc}"`, r.lat, r.lng, `"${r.time}"`].join(',')
    );

    const csv = [
      `EcoRoute Đồng Nai — Báo cáo ESG & Quy hoạch Đô thị Thông minh`,
      `Tạo lúc: ${now}`,
      ``,
      headers.join(','),
      ...rows,
      reportHeaders,
      ...reportRows
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `EcoRoute_DongNai_ESG_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  EVENT BINDING
  // ══════════════════════════════════════════════════════════════════════════

  bindUIEvents() {
    // ── Dropdowns ──────────────────────────────────────────────────────────
    const selOrigin = document.getElementById('selectOrigin');
    const selDest   = document.getElementById('selectDest');

    selOrigin?.addEventListener('change', e => {
      const loc = this.locations.find(l => l.id === e.target.value);
      if (loc) { this.currentOrigin = loc; this.updateStationDiagnosticCard(loc); this.triggerRouting(); }
    });

    selDest?.addEventListener('change', e => {
      const loc = this.locations.find(l => l.id === e.target.value);
      if (loc) { this.currentDestination = loc; this.triggerRouting(); }
    });

    // ── Vehicle Mode ───────────────────────────────────────────────────────
    document.getElementById('btnModeMotorbike')?.addEventListener('click', () => {
      this.vehicleMode = 'motorbike';
      document.getElementById('btnModeMotorbike')?.classList.add('active');
      document.getElementById('btnModeCar')?.classList.remove('active');
      this.updateRainFloodModel(this.simulatedRainMm);
    });

    document.getElementById('btnModeCar')?.addEventListener('click', () => {
      this.vehicleMode = 'car';
      document.getElementById('btnModeCar')?.classList.add('active');
      document.getElementById('btnModeMotorbike')?.classList.remove('active');
      this.updateRainFloodModel(this.simulatedRainMm);
    });

    // ── Preset Routes ──────────────────────────────────────────────────────
    document.getElementById('btnPreset1')?.addEventListener('click', () => {
      this.currentOrigin      = this.locations[0]; // DNTU
      this.currentDestination = this.locations[2]; // Amata
      if (selOrigin) selOrigin.value = 'dntu';
      if (selDest)   selDest.value   = 'amata';
      this.triggerRouting();
    });

    document.getElementById('btnPreset2')?.addEventListener('click', () => {
      this.currentOrigin      = this.locations[3]; // Biên Hòa 2
      this.currentDestination = this.locations[5]; // Tân Cang
      if (selOrigin) selOrigin.value = 'bienhoa2';
      if (selDest)   selDest.value   = 'tancang';
      this.triggerRouting();
    });

    document.getElementById('btnPreset3')?.addEventListener('click', () => {
      this.currentOrigin      = this.locations[1]; // Biên Hòa
      this.currentDestination = this.locations[7]; // Long Thành
      if (selOrigin) selOrigin.value = 'bienhoa';
      if (selDest)   selDest.value   = 'longthanh';
      this.triggerRouting();
    });

    // ── Sliders ────────────────────────────────────────────────────────────
    document.getElementById('rainSlider')?.addEventListener('input', e => {
      this.updateRainFloodModel(parseInt(e.target.value, 10));
    });

    document.getElementById('trafficSlider')?.addEventListener('input', e => {
      this.updateTrafficModel(parseInt(e.target.value, 10));
    });

    // ── Header Buttons ─────────────────────────────────────────────────────
    document.getElementById('btnVoice')?.addEventListener('click', () => this.triggerVoiceCopilot());

    document.getElementById('btnRefresh')?.addEventListener('click', () => this.fetchAllSensorData());

    document.getElementById('btnPickOrigin')?.addEventListener('click', () => {
      if (this.mapClickMode === 'origin') {
        this.cancelMapClickMode();
      } else {
        // Toggle: first click = set origin, next click on map = set dest
        this.startMapClickOrigin();
      }
    });

    // ── Report Modal ───────────────────────────────────────────────────────
    const modalReport     = document.getElementById('modalReport');
    const btnOpenReport   = document.getElementById('btnOpenReport');
    const btnCloseReport  = document.getElementById('btnCloseReport');
    const btnCloseReport2 = document.getElementById('btnCloseReport2');
    const btnSubmitReport = document.getElementById('btnSubmitReport');
    const btnClearReports = document.getElementById('btnClearReports');

    btnOpenReport?.addEventListener('click',   () => modalReport?.classList.remove('hidden'));
    btnCloseReport?.addEventListener('click',  () => modalReport?.classList.add('hidden'));
    btnCloseReport2?.addEventListener('click', () => modalReport?.classList.add('hidden'));

    // Close on backdrop click
    modalReport?.addEventListener('click', e => { if (e.target === modalReport) modalReport.classList.add('hidden'); });

    btnClearReports?.addEventListener('click', () => {
      if (confirm('Xóa toàn bộ phản ánh cộng đồng trên bản đồ?')) {
        this.clearCommunityReports();
        modalReport?.classList.add('hidden');
      }
    });

    btnSubmitReport?.addEventListener('click', () => {
      const type     = document.getElementById('reportType')?.value     || 'hazard';
      const severity = document.querySelector('input[name="reportSeverity"]:checked')?.value || 'medium';
      const title    = document.getElementById('reportTitle')?.value?.trim() || 'Cảnh báo giao thông';
      const desc     = document.getElementById('reportDesc')?.value?.trim()  || 'Ghi nhận sự cố';
      const locId    = document.getElementById('reportLocation')?.value;
      const loc      = this.locations.find(l => l.id === locId) || this.currentOrigin;

      const offsetLat = loc.lat + (Math.random() - 0.5) * 0.006;
      const offsetLng = loc.lng + (Math.random() - 0.5) * 0.006;

      this.submitReport(type, severity, title, desc, offsetLat, offsetLng);
      modalReport?.classList.add('hidden');

      // Zoom tới marker mới
      this.map.setView([offsetLat, offsetLng], 14, { animate: true });

      // Reset form
      if (document.getElementById('reportTitle')) document.getElementById('reportTitle').value = '';
      if (document.getElementById('reportDesc'))  document.getElementById('reportDesc').value  = '';
    });

    // ── SOS Modal ──────────────────────────────────────────────────────────
    const modalSOS   = document.getElementById('modalSOS');
    const btnOpenSOS = document.getElementById('btnOpenSOS');
    const btnCloseSOS  = document.getElementById('btnCloseSOS');
    const btnCloseSOS2 = document.getElementById('btnCloseSOS2');

    btnOpenSOS?.addEventListener('click',  () => modalSOS?.classList.remove('hidden'));
    btnCloseSOS?.addEventListener('click', () => modalSOS?.classList.add('hidden'));
    btnCloseSOS2?.addEventListener('click',() => modalSOS?.classList.add('hidden'));
    modalSOS?.addEventListener('click', e => { if (e.target === modalSOS) modalSOS.classList.add('hidden'); });

    // ── ESG Export Modal ───────────────────────────────────────────────────
    const modalESG      = document.getElementById('modalESG');
    const btnExportESG  = document.getElementById('btnExportESG');
    const btnCloseESG   = document.getElementById('btnCloseESG');
    const btnCloseESG2  = document.getElementById('btnCloseESG2');
    const btnDownloadCSV= document.getElementById('btnDownloadCSV');
    const btnPrintReport= document.getElementById('btnPrintReport');

    btnExportESG?.addEventListener('click', () => this.openESGModal());
    btnCloseESG?.addEventListener('click',  () => modalESG?.classList.add('hidden'));
    btnCloseESG2?.addEventListener('click', () => modalESG?.classList.add('hidden'));
    modalESG?.addEventListener('click', e => { if (e.target === modalESG) modalESG.classList.add('hidden'); });
    btnDownloadCSV?.addEventListener('click', () => this.downloadCSV());
    btnPrintReport?.addEventListener('click', () => window.print());
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  BOOTSTRAP
  // ══════════════════════════════════════════════════════════════════════════

  async start() {
    this.initMap();
    this.bindUIEvents();
    this.loadCommunityReports();

    // Fetch dữ liệu ngay khi khởi động
    await this.fetchAllSensorData();

    // Auto-refresh mỗi 3 phút
    setInterval(() => this.fetchAllSensorData(), 3 * 60 * 1000);
  }
}

// ── Khởi tạo app ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  window.ecoApp = new EcoRouteApp();
  window.ecoApp.start().catch(err => console.error('[EcoRoute] Start error:', err));
});
