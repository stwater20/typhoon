/* 颱風假機率計算器：縣市資料、估算模型、介面互動。
 */
(function () {
  'use strict';

  // 近10年颱風假機率(%)，資料來源見 README。順序沿用舊版，舊版 localStorage 存的 index 才對得起來。
  const COUNTIES = [
    { code: 'PIF', name: '屏東縣', pct: 87.5, hint: '含恆春半島' },
    { code: 'KHH', name: '高雄市', pct: 84.4 },
    { code: 'TNN', name: '台南市', pct: 75.0 },
    { code: 'HUA', name: '花蓮縣', pct: 71.9 },
    { code: 'CYQ', name: '嘉義縣', pct: 65.6 },
    { code: 'PEN', name: '澎湖縣', pct: 62.5 },
    { code: 'TTT', name: '台東縣', pct: 62.5 },
    { code: 'CYI', name: '嘉義市', pct: 59.4 },
    { code: 'ILA', name: '宜蘭縣', pct: 56.3 },
    { code: 'YUN', name: '雲林縣', pct: 56.3 },
    { code: 'NAN', name: '南投縣', pct: 50.0 },
    { code: 'NWT', name: '新北市', pct: 46.9 },
    { code: 'LIE', name: '連江縣', pct: 46.9, hint: '馬祖' },
    { code: 'TPE', name: '台北市', pct: 43.8 },
    { code: 'KEE', name: '基隆市', pct: 43.8 },
    { code: 'CHA', name: '彰化縣', pct: 43.8 },
    { code: 'TXG', name: '台中市', pct: 43.8 },
    { code: 'HSQ', name: '新竹縣', pct: 43.8 },
    { code: 'KIN', name: '金門縣', pct: 43.8 },
    { code: 'TAO', name: '桃園市', pct: 40.6 },
    { code: 'HSZ', name: '新竹市', pct: 40.6 },
    { code: 'MIA', name: '苗栗縣', pct: 40.6 },
  ];
  const AVG_PCT = COUNTIES.reduce((s, c) => s + c.pct, 0) / COUNTIES.length;
  const byCode = Object.fromEntries(COUNTIES.map((c) => [c.code, c]));

  // ---------- 小工具 ----------
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* 私密模式等 */ } },
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
    const msg = text || '🌀 明天放不放颱風假？算機率＋看全台網友怎麼預測！';
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

  // ---------- 縣市選擇 ----------
  let currentCode = (function () {
    const saved = store.get('typhoon-county-code');
    if (saved && byCode[saved]) return saved;
    const legacyIdx = store.get('typhoon-county'); // 舊版存的是陣列 index
    if (legacyIdx !== null && COUNTIES[legacyIdx]) return COUNTIES[legacyIdx].code;
    return 'NWT';
  })();

  function setCounty(code) {
    if (!byCode[code] || code === currentCode) return;
    currentCode = code;
    store.set('typhoon-county-code', code);
    $('county').value = code;
    updateCountyBadge();
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
    $('heroCounty').textContent = c.name;
    $('heroPct').textContent = `${c.pct}%`;
    $('wishChief').textContent = chiefOf(c);
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
          setCounty(code);
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

  // 結果下方的俏皮話，每次隨機挑一句
  const QUIPS = {
    high: ['棉被枕頭準備好，明天大概率可以躺平 🛌', '可以開始想明天要追哪部劇了 🍿', '泡麵、零食、行動電源，颱風假三寶備好了嗎？', '老闆的訊息可以先已讀了（誤）'],
    mid: ['建議睡前再 check 一次氣象署跟縣市政府粉專公告', '五五波，今晚 10 點前請保持手機有電 🔋', '可以先把鬧鐘設好，再偷偷期待一下', '這種時候最適合一直重新整理人事總處網頁'],
    low: ['鬧鐘還是先設一下，別太早開香檳', '雨傘記得帶，假可能放不到 ☔', '心裡可以期待，但報告還是要寫', '先別急著跟同事說明天見不到了'],
    none: ['大概率要正常上班上課，早點睡吧', '颱風可能只是路過打個招呼 👋', '明天的你還是要準時打卡喔', '今晚的放假夢，留到下次颱風再做'],
  };
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  // 連按「我覺得市長想放」會越講越誇張
  let wishCount = parseInt(store.get('typhoon-wish-count'), 10) || 0;
  function wishLine(n, chief) {
    if (n === 1) return '這是許願不是估算 🙏 真正放不放，還是要看今晚的官方公告';
    if (n < 5) return `第 ${n} 次許願，${chief}好像有點感應了 👀（但還是要看官方公告）`;
    if (n < 10) return `你已經許願 ${n} 次了，${chief}應該聽到了吧 📣`;
    if (n < 30) return `許願 ${n} 次！這份誠意足以感動天地，但感動不了人事總處 😂`;
    return `許願 ${n} 次的你，就是本站最虔誠的颱風假信徒 🙇`;
  }

  // 撒一陣 emoji，兩三秒後自己消失；使用者設定減少動態效果時不播
  function emojiRain(emojis) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (document.querySelector('.emoji-rain')) return; // 連按時不疊加
    const wrap = document.createElement('div');
    wrap.className = 'emoji-rain';
    wrap.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 26; i++) {
      const el = document.createElement('span');
      el.textContent = pick(emojis);
      el.style.left = `${Math.random() * 100}%`;
      el.style.fontSize = `${18 + Math.random() * 18}px`;
      el.style.animationDuration = `${1.8 + Math.random() * 1.4}s`;
      el.style.animationDelay = `${Math.random() * 0.6}s`;
      wrap.appendChild(el);
    }
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 3800);
  }

  // 首長稱謂：直轄市與市是市長，其餘是縣長
  const chiefOf = (county) => (county.name.endsWith('市') ? '市長' : '縣長');

  // wish＝「我覺得市長想放」：直接 100%，但標明是許願，檢核清單和實際估算照常顯示
  function calculate(e, wish) {
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
    const pct = wish ? 100 : r.pct;
    const county = byCode[currentCode];
    $('result').classList.toggle('wish', !!wish);
    $('wishTag').hidden = !wish;
    $('gaugeCaption').textContent = wish ? '許願放假機率' : '模型估算放假機率';

    const color = wish ? 'var(--wish)' : pct >= 70 ? 'var(--good)' : pct >= 40 ? 'var(--mid)' : 'var(--low)';
    $('percent').textContent = pct + '%';
    $('percent').style.color = color;
    const gauge = $('gaugeValue');
    const circ = 2 * Math.PI * 52;
    gauge.style.stroke = color;
    gauge.style.strokeDashoffset = String(circ * (1 - pct / 100));

    let topMsg, bottomMsg;
    if (wish) {
      const n = wishCount + 1;
      wishCount = n;
      store.set('typhoon-wish-count', String(n));
      topMsg = `${chiefOf(county)}說放就放，風雨什麼的不重要`;
      bottomMsg = wishLine(n, chiefOf(county));
    } else if (pct >= 85) {
      topMsg = '已明顯達到法規門檻，條件相當夠力';
      bottomMsg = pick(QUIPS.high);
    } else if (pct >= 60) {
      topMsg = '已達或接近法規門檻，但地方仍有裁量空間';
      bottomMsg = pick(QUIPS.mid);
    } else if (pct >= 35) {
      topMsg = '尚未明顯達標，機率偏低';
      bottomMsg = pick(QUIPS.low);
    } else {
      topMsg = '目前條件離法規門檻還有距離';
      bottomMsg = pick(QUIPS.none);
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

    $('histLine').textContent = wish
      ? `冷靜一下：依你輸入的風雨條件，模型實際估算是 ${r.pct}%（${county.name}近10年颱風假機率 ${county.pct}%）。`
      : `參考：${county.name}近10年颱風假機率為 ${county.pct}%（全國平均約 ${AVG_PCT.toFixed(1)}%），本次估算已將此歷史傾向納入計算。`;

    let isWeekend = false;
    if (dateInput) {
      const day = new Date(dateInput + 'T00:00:00').getDay();
      isWeekend = day === 0 || day === 6;
    }
    $('holidayNote').classList.toggle('show', isWeekend);
    $('result').classList.add('show');
    if (wish || pct >= 85) emojiRain(wish ? ['🙏', '🏖️', '🎉', '🛌'] : ['🏖️', '🛌', '🍿', '🎮']);


    if (window.matchMedia('(max-width: 959px)').matches) {
      $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ---------- 主題 ----------
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    $('themeBtn').textContent = theme === 'light' ? '☀️ 淺色' : '🌙 深色';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#e6f4ff' : '#0b1220');
    store.set('typhoon-theme', theme);
  }

  // ---------- 初始化 ----------
  function init() {
    fillCountySelect($('county'));
    $('county').addEventListener('change', (e) => setCounty(e.target.value));
    updateCountyBadge();
    $('date').value = twDate(1);
    $('locateBtn').addEventListener('click', locateMe);
    $('calcForm').addEventListener('submit', calculate);
    $('wishBtn').addEventListener('click', () => calculate(null, true));
    $('themeBtn').addEventListener('click', () => {
      applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
    });
    applyTheme(document.documentElement.getAttribute('data-theme') || 'light');
    document.querySelectorAll('[data-share]').forEach((btn) => {
      btn.addEventListener('click', () => share(btn.dataset.share));
    });
    $('year').textContent = String(new Date().getFullYear());
  }


  init();
})();
