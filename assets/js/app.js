/* 颱風假機率計算器：縣市資料、估算模型、介面互動。
 * 透過 window.Typhoon 提供給 vote.js 共用。 */
(function () {
  'use strict';

  // 近10年颱風假機率(%)，資料來源見 README。順序沿用舊版，舊版 localStorage 存的 index 才對得起來。
  // row/col 是開票看板上的方格地圖位置。
  const COUNTIES = [
    { code: 'PIF', name: '屏東縣', short: '屏東', pct: 87.5, hint: '含恆春半島', row: 9, col: 3 },
    { code: 'KHH', name: '高雄市', short: '高雄', pct: 84.4, row: 8, col: 3 },
    { code: 'TNN', name: '台南市', short: '台南', pct: 75.0, row: 8, col: 2 },
    { code: 'HUA', name: '花蓮縣', short: '花蓮', pct: 71.9, row: 4, col: 4 },
    { code: 'CYQ', name: '嘉義縣', short: '嘉義縣', pct: 65.6, row: 6, col: 3 },
    { code: 'PEN', name: '澎湖縣', short: '澎湖', pct: 62.5, row: 6, col: 1 },
    { code: 'TTT', name: '台東縣', short: '台東', pct: 62.5, row: 7, col: 4 },
    { code: 'CYI', name: '嘉義市', short: '嘉義市', pct: 59.4, row: 7, col: 2 },
    { code: 'ILA', name: '宜蘭縣', short: '宜蘭', pct: 56.3, row: 2, col: 4 },
    { code: 'YUN', name: '雲林縣', short: '雲林', pct: 56.3, row: 6, col: 2 },
    { code: 'NAN', name: '南投縣', short: '南投', pct: 50.0, row: 5, col: 3 },
    { code: 'NWT', name: '新北市', short: '新北', pct: 46.9, row: 2, col: 3 },
    { code: 'LIE', name: '連江縣', short: '連江', pct: 46.9, hint: '馬祖', row: 1, col: 1 },
    { code: 'TPE', name: '台北市', short: '台北', pct: 43.8, row: 1, col: 3 },
    { code: 'KEE', name: '基隆市', short: '基隆', pct: 43.8, row: 1, col: 4 },
    { code: 'CHA', name: '彰化縣', short: '彰化', pct: 43.8, row: 5, col: 2 },
    { code: 'TXG', name: '台中市', short: '台中', pct: 43.8, row: 4, col: 3 },
    { code: 'HSQ', name: '新竹縣', short: '新竹縣', pct: 43.8, row: 3, col: 3 },
    { code: 'KIN', name: '金門縣', short: '金門', pct: 43.8, row: 3, col: 1 },
    { code: 'TAO', name: '桃園市', short: '桃園', pct: 40.6, row: 2, col: 2 },
    { code: 'HSZ', name: '新竹市', short: '新竹市', pct: 40.6, row: 3, col: 2 },
    { code: 'MIA', name: '苗栗縣', short: '苗栗', pct: 40.6, row: 4, col: 2 },
  ];
  const AVG_PCT = COUNTIES.reduce((s, c) => s + c.pct, 0) / COUNTIES.length;
  const byCode = Object.fromEntries(COUNTIES.map((c) => [c.code, c]));

  // ---------- 小工具 ----------
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* 私密模式等 */ } },
    getJSON(key, fallback) {
      try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
    },
    setJSON(key, val) { this.set(key, JSON.stringify(val)); },
  };
  const $ = (id) => document.getElementById(id);

  // 台灣時間（UTC+8）的 YYYY-MM-DD，與使用者裝置時區無關
  function twDate(offsetDays) {
    const d = new Date(Date.now() + 8 * 3600e3 + (offsetDays || 0) * 86400e3);
    return d.toISOString().slice(0, 10);
  }

  let toastTimer;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, () => false);
    }
    return Promise.resolve(false);
  }

  function siteUrl() { return location.origin + location.pathname; }

  // 分享：手機優先用系統分享面板，桌機退回各平台連結
  function share(kind, text) {
    const url = siteUrl();
    const msg = text || '🌀 明天放不放颱風假？算機率＋全台網友開票中！';
    if (kind === 'native' && navigator.share) {
      navigator.share({ title: document.title, text: msg, url }).catch(() => {});
      return;
    }
    if (kind === 'facebook') {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'noopener,width=600,height=500');
    } else if (kind === 'threads') {
      window.open(`https://www.threads.net/intent/post?text=${encodeURIComponent(msg + ' ' + url)}`, '_blank', 'noopener');
    } else if (kind === 'line') {
      window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}&text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    } else {
      copyText(msg + ' ' + url).then((ok) => toast(ok ? '✅ 已複製，貼到 IG 限動或任何地方都可以' : '⚠️ 複製失敗，請手動複製網址'));
    }
  }

  // ---------- 縣市選擇（計算器與開票所共用） ----------
  const listeners = [];
  let currentCode = (function () {
    const saved = store.get('typhoon-county-code');
    if (saved && byCode[saved]) return saved;
    const legacyIdx = store.get('typhoon-county'); // 舊版存的是陣列 index
    if (legacyIdx !== null && COUNTIES[legacyIdx]) return COUNTIES[legacyIdx].code;
    return 'NWT';
  })();

  function setCounty(code, source) {
    if (!byCode[code] || code === currentCode && source !== 'init') return;
    currentCode = code;
    store.set('typhoon-county-code', code);
    $('county').value = code;
    updateCountyBadge();
    listeners.forEach((fn) => fn(code, source));
  }

  function fillCountySelect(sel) {
    COUNTIES.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.code;
      opt.textContent = c.hint ? `${c.name}（${c.hint}）` : c.name;
      sel.appendChild(opt);
    });
    sel.value = currentCode;
  }

  function updateCountyBadge() {
    const c = byCode[currentCode];
    $('countyBadge').innerHTML = `近10年颱風假機率：<b>${c.pct}%</b>（全國平均 ${AVG_PCT.toFixed(1)}%，歷史統計參考）`;
  }

  // ---------- 定位 ----------
  function normalizeName(s) { return (s || '').replace(/臺/g, '台'); }

  function findCountyCode(candidates) {
    const normed = candidates.filter(Boolean).map(normalizeName);
    const hit = COUNTIES.find((c) => normed.some((s) => s.includes(c.name)));
    return hit ? hit.code : null;
  }

  function locateMe() {
    const btn = $('locateBtn');
    const status = $('locateStatus');
    if (!navigator.geolocation) {
      status.textContent = '此瀏覽器不支援定位功能，請手動選擇縣市。';
      return;
    }
    btn.disabled = true;
    status.textContent = '📡 正在定位...';
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=zh-TW&zoom=10`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('reverse geocoding failed');
        const data = await res.json();
        const addr = data.address || {};
        const code = findCountyCode([addr.county, addr.city, addr.state, addr.town, addr.city_district, data.display_name]);
        if (code) {
          setCounty(code, 'locate');
          status.textContent = `✅ 已定位到：${byCode[code].name}`;
        } else {
          status.textContent = '⚠️ 定位成功，但無法對應到台灣縣市，請手動選擇。';
        }
      } catch (e) {
        status.textContent = '⚠️ 取得地區資訊失敗（可能離線或服務暫時無法使用），請手動選擇。';
      } finally {
        btn.disabled = false;
      }
    }, (err) => {
      btn.disabled = false;
      status.textContent = err.code === 1 ? '⚠️ 定位權限被拒絕，請手動選擇縣市。'
        : err.code === 3 ? '⚠️ 定位逾時，請再試一次或手動選擇。'
        : '⚠️ 無法取得目前位置，請手動選擇縣市。';
    }, { timeout: 8000 });
  }

  // ---------- 估算模型 ----------
  function estimate({ code, avgWind, gust, rainThreshold, rainAmount, disasterRisk }) {
    const exposure = byCode[code].pct / AVG_PCT;
    const windMeetsLaw = avgWind >= 7;
    const gustMeetsLaw = gust >= 10;
    const rainMeetsLaw = rainAmount >= rainThreshold && disasterRisk;

    // 未達法規門檻時只剩地方裁量或地形特殊情況
    const base = windMeetsLaw || gustMeetsLaw || rainMeetsLaw ? 65 : 8;
    const windBonus = Math.max(0, avgWind - 7) * 6;
    const gustBonus = Math.max(0, gust - 10) * 4;
    const rainBonus = rainMeetsLaw ? Math.min(20, ((rainAmount - rainThreshold) / rainThreshold) * 20) : 0;

    const raw = Math.min(98, Math.max(2, (base + windBonus + gustBonus + rainBonus) * exposure));
    return { pct: Math.round(raw), windMeetsLaw, gustMeetsLaw, rainMeetsLaw };
  }

  // 每個縣市最近一次的估算結果，給開票所做「模型 vs 網友」對照
  const estimates = store.getJSON('typhoon-estimates', {});

  function calculate(e) {
    if (e) e.preventDefault();
    const dateInput = $('date').value;
    const input = {
      code: currentCode,
      avgWind: parseFloat($('wind').value),
      gust: parseFloat($('gust').value),
      rainThreshold: parseFloat($('terrain').value),
      rainAmount: Math.max(0, parseFloat($('rain').value) || 0),
      disasterRisk: $('disasterRisk').checked,
    };
    const r = estimate(input);
    const pct = r.pct;
    const county = byCode[currentCode];

    const color = pct >= 70 ? 'var(--safe)' : pct >= 40 ? 'var(--warn)' : 'var(--danger)';
    $('percent').textContent = pct + '%';
    $('percent').style.color = color;
    const gauge = $('gaugeValue');
    const circ = 2 * Math.PI * 52;
    gauge.style.stroke = color;
    gauge.style.strokeDashoffset = String(circ * (1 - pct / 100));

    let topMsg, bottomMsg;
    if (pct >= 85) {
      topMsg = '已明顯達到法規門檻，條件相當夠力';
      bottomMsg = '棉被枕頭準備好，明天大概率可以躺平 🛌';
    } else if (pct >= 60) {
      topMsg = '已達或接近法規門檻，但地方仍有裁量空間';
      bottomMsg = '建議睡前再 check 一次氣象署跟縣市政府粉專公告';
    } else if (pct >= 35) {
      topMsg = '尚未明顯達標，機率偏低';
      bottomMsg = '鬧鐘還是先設一下，別太早開香檳';
    } else {
      topMsg = '目前條件離法規門檻還有距離';
      bottomMsg = '大概率要正常上班上課，早點睡吧';
    }
    $('msgTop').textContent = `${county.name}｜${topMsg}`;
    $('msgBottom').textContent = bottomMsg;

    const items = [
      { label: `平均風力達 7 級以上（目前：${input.avgWind} 級）`, met: r.windMeetsLaw },
      { label: `陣風達 10 級以上（目前：${input.gust} 級）`, met: r.gustMeetsLaw },
      { label: `累積雨量達門檻且有致災之虞（${input.rainAmount}mm / 門檻 ${input.rainThreshold}mm）`, met: r.rainMeetsLaw },
    ];
    $('checklist').innerHTML = items.map((it) => `
      <div class="check-item">
        <span class="dot ${it.met ? 'yes' : 'no'}">${it.met ? '✓' : '–'}</span>
        <span>${it.label}</span>
      </div>`).join('');

    $('histLine').textContent =
      `參考：${county.name}近10年颱風假機率為 ${county.pct}%（全國平均約 ${AVG_PCT.toFixed(1)}%），本次估算已將此歷史傾向納入計算。`;

    let isWeekend = false;
    if (dateInput) {
      const day = new Date(dateInput + 'T00:00:00').getDay();
      isWeekend = day === 0 || day === 6;
    }
    $('holidayNote').classList.toggle('show', isWeekend);
    $('result').classList.add('show');

    estimates[currentCode] = { pct, date: dateInput, at: Date.now() };
    store.setJSON('typhoon-estimates', estimates);
    document.dispatchEvent(new CustomEvent('typhoon:estimate', { detail: { code: currentCode, pct } }));

    if (window.matchMedia('(max-width: 959px)').matches) {
      $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function getEstimate(code) {
    const e = estimates[code];
    // 估算超過 2 天就不拿來對照，避免拿舊颱風的數字
    return e && Date.now() - e.at < 2 * 86400e3 ? e.pct : null;
  }

  // ---------- 主題 ----------
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    $('themeBtn').textContent = theme === 'light' ? '☀️ 淺色' : '🌙 深色';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f4f0e7' : '#070b14');
    store.set('typhoon-theme', theme);
  }

  // ---------- 初始化 ----------
  function init() {
    fillCountySelect($('county'));
    $('county').addEventListener('change', (e) => setCounty(e.target.value, 'calc'));
    updateCountyBadge();
    $('date').value = twDate(1);
    $('locateBtn').addEventListener('click', locateMe);
    $('calcForm').addEventListener('submit', calculate);
    $('themeBtn').addEventListener('click', () => {
      applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
    });
    applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');
    document.querySelectorAll('[data-share]').forEach((btn) => {
      btn.addEventListener('click', () => share(btn.dataset.share));
    });
    $('year').textContent = String(new Date().getFullYear());
  }

  window.Typhoon = {
    COUNTIES, AVG_PCT, byCode, store, twDate, toast, share, copyText, siteUrl,
    estimate, getEstimate, fillCountySelect,
    getCounty: () => currentCode,
    setCounty,
    onCountyChange: (fn) => listeners.push(fn),
  };

  init();
})();
