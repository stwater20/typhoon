/* 網友開票所：投票、即時開票看板、公告揭曉與預言家戰績。
 * 有 FIREBASE_CONFIG 時連 Firestore（全站共用票數），否則跑示範模式。 */
import { FIREBASE_CONFIG } from './config.js';

const T = window.Typhoon;
const { COUNTIES, byCode, store, twDate, toast } = T;

const FIREBASE_VERSION = '10.12.2';
const HOUR = 3600e3;
const MY_VOTES_KEY = 'typhoon-my-votes';
const CELEBRATED_KEY = 'typhoon-celebrated';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);

// ---------- 投票時間（必須與 firestore.rules 一致） ----------
// 預測 D 日：D-2 日 00:00 開放投票，D-1 日 19:00（台灣時間）截止，之後進入開票。
function pollTimes(date) {
  const [y, m, d] = date.split('-').map(Number);
  const dayStartTw = Date.UTC(y, m - 1, d) - 8 * HOUR;
  return { openAt: dayStartTw - 48 * HOUR, closeAt: dayStartTw - 5 * HOUR };
}

function pollStatus(date, result) {
  const { openAt, closeAt } = pollTimes(date);
  const now = Date.now();
  // 大颱風時縣市可能在 19:00 前就公告，一有公告就停止投票、直接揭曉
  if (result && Object.keys(result).length) return 'revealed';
  if (now < openAt) return 'upcoming';
  return now < closeAt ? 'voting' : 'counting';
}

function dateLabel(date) {
  const [y, m, d] = date.split('-').map(Number);
  const dow = '日一二三四五六'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}/${d}（${dow}）`;
}

// 官方結果：off＝停班停課、partial＝部分停班停課（算放假）、on＝照常上班上課
const actualChoice = (r) => (r === 'off' || r === 'partial' ? 'yes' : r === 'on' ? 'no' : null);

function tallyOf(tally, code) {
  const yes = Number(tally[`${code}_yes`]) || 0;
  const no = Number(tally[`${code}_no`]) || 0;
  return { yes, no, total: yes + no, ratio: yes + no ? yes / (yes + no) : null };
}

// ---------- 後端：Firebase ----------
async function createFirebaseBackend(cfg) {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
  const [appMod, authMod, fs] = await Promise.all([
    import(base + 'firebase-app.js'),
    import(base + 'firebase-auth.js'),
    import(base + 'firebase-firestore.js'),
  ]);
  const { emulator, ...appConfig } = cfg;
  const app = appMod.initializeApp(appConfig);
  const auth = authMod.getAuth(app);
  const db = fs.getFirestore(app);
  if (emulator) { // 本機開發用：{ emulator: { host: '127.0.0.1', authPort: 9099, firestorePort: 8080 } }
    authMod.connectAuthEmulator(auth, `http://${emulator.host}:${emulator.authPort}`, { disableWarnings: true });
    fs.connectFirestoreEmulator(db, emulator.host, emulator.firestorePort);
  }

  // 匿名登入：不收任何個資，只用來確保同一個瀏覽器一天只能投一票
  async function user() {
    await auth.authStateReady();
    return auth.currentUser || (await authMod.signInAnonymously(auth)).user;
  }

  return {
    mode: 'live',
    subscribe(date, onTally, onResult, onError) {
      const u1 = fs.onSnapshot(fs.doc(db, 'days', date), (s) => onTally(s.exists() ? s.data() : {}), onError);
      const u2 = fs.onSnapshot(fs.doc(db, 'results', date), (s) => onResult(s.exists() ? s.data() : null), onError);
      return () => { u1(); u2(); };
    },
    async myVote(date) {
      const u = await user();
      const s = await fs.getDoc(fs.doc(db, 'days', date, 'votes', u.uid));
      return s.exists() ? { county: s.data().county, choice: s.data().choice } : null;
    },
    async vote(date, county, choice) {
      const u = await user();
      // 投票紀錄與計票必須同一批寫入，firestore.rules 會檢查兩者一致
      const batch = fs.writeBatch(db);
      batch.set(fs.doc(db, 'days', date, 'votes', u.uid), { county, choice, ts: fs.serverTimestamp() });
      batch.set(fs.doc(db, 'days', date), { [`${county}_${choice}`]: fs.increment(1) }, { merge: true });
      await batch.commit();
    },
    async getResult(date) {
      const s = await fs.getDoc(fs.doc(db, 'results', date));
      return s.exists() ? s.data() : null;
    },
  };
}

// ---------- 後端：示範模式 ----------
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createDemoBackend() {
  const KEY = 'typhoon-demo-votes';
  const emitters = new Set();

  function tally(date) {
    const { openAt, closeAt } = pollTimes(date);
    const progress = Math.min(1, Math.max(0.04, (Date.now() - openAt) / (closeAt - openAt)));
    const data = {};
    COUNTIES.forEach((c) => {
      const r = rng(hashStr(date + c.code));
      const n = Math.round((60 + r() * 520) * progress);
      const ratio = Math.min(0.95, Math.max(0.05, c.pct / 100 + (r() - 0.5) * 0.35));
      data[`${c.code}_yes`] = Math.round(n * ratio);
      data[`${c.code}_no`] = n - Math.round(n * ratio);
    });
    const mine = store.getJSON(KEY, {})[date];
    if (mine) data[`${mine.county}_${mine.choice}`] += 1;
    return data;
  }

  return {
    mode: 'demo',
    subscribe(date, onTally, onResult) {
      const emit = () => onTally(tally(date));
      emitters.add(emit);
      emit();
      onResult(null);
      const timer = setInterval(emit, 15000);
      return () => { clearInterval(timer); emitters.delete(emit); };
    },
    async myVote(date) { return store.getJSON(KEY, {})[date] || null; },
    async vote(date, county, choice) {
      const all = store.getJSON(KEY, {});
      if (all[date]) throw Object.assign(new Error('already voted'), { code: 'permission-denied' });
      all[date] = { county, choice };
      store.setJSON(KEY, all);
      emitters.forEach((fn) => fn());
    },
    async getResult() { return null; },
  };
}

// ---------- 狀態 ----------
const state = {
  backend: null,
  dates: [],
  date: null,
  code: T.getCounty(),
  tally: {},
  result: null,
  myVote: null,
  status: 'voting',
  unsubscribe: null,
  tallyLoaded: false,
  animatePending: false,
  busy: false,
};

const isRevealed = () => !!state.myVote || state.status === 'counting' || state.status === 'revealed';

// ---------- 數字動畫 ----------
function animateNumber(el, to, fmt) {
  const from = Number(el.dataset.val) || 0;
  el.dataset.val = String(to);
  if (reduceMotion || from === to) { el.textContent = fmt(to); return; }
  const start = performance.now();
  const dur = 900;
  (function step(now) {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(from + (to - from) * eased);
    if (p < 1 && el.dataset.val === String(to)) requestAnimationFrame(step);
  })(start);
}
const fmtInt = (v) => Math.round(v).toLocaleString('zh-TW');
const fmtPct = (v) => `${Math.round(v)}%`;

// ---------- 建立靜態元件 ----------
function buildTabs() {
  const wrap = $('dateTabs');
  wrap.innerHTML = '';
  state.dates.forEach((date, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab';
    b.setAttribute('role', 'tab');
    b.dataset.date = date;
    b.textContent = `${i === 0 ? '明天' : '後天'} ${dateLabel(date)}`;
    b.addEventListener('click', () => selectDate(date));
    wrap.appendChild(b);
  });
}

function buildTiles() {
  const map = $('tileMap');
  COUNTIES.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tile hidden-val';
    b.id = `tile-${c.code}`;
    b.style.gridRow = String(c.row);
    b.style.gridColumn = String(c.col);
    b.innerHTML = `<span class="t-name">${c.short}</span><span class="t-val">？？</span><span class="t-bar"><i></i></span>`;
    b.addEventListener('click', () => T.setCounty(c.code, 'vote'));
    map.appendChild(b);
  });
}

// ---------- 畫面更新 ----------
function renderToolbar() {
  document.querySelectorAll('#dateTabs .tab').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.date === state.date));
  });
  const labels = { upcoming: ['voting', '尚未開放'], voting: ['voting', '投票中'], counting: ['counting', '開票中'], revealed: ['revealed', '公告揭曉'] };
  const [cls, text] = labels[state.status];
  $('pollStatus').innerHTML = `<span class="pill ${cls}">${text}</span>`;
  renderCountdown();
}

function renderCountdown() {
  const el = $('countdown');
  const { closeAt } = pollTimes(state.date);
  if (state.status === 'voting') {
    const left = Math.max(0, closeAt - Date.now());
    const h = Math.floor(left / HOUR);
    const m = Math.floor((left % HOUR) / 60e3);
    const s = Math.floor((left % 60e3) / 1e3);
    el.innerHTML = `距投票截止 <b>${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}</b>`;
  } else if (state.status === 'counting') {
    el.innerHTML = '投票已截止，等待縣市公告（通常 19:00–22:00）';
  } else if (state.status === 'revealed') {
    const n = COUNTIES.filter((c) => actualChoice(state.result[c.code])).length;
    el.innerHTML = `已公告 <b>${n}</b> / 22 縣市`;
  } else {
    el.textContent = '';
  }
}

function renderBoard(animate) {
  const revealed = isRevealed();
  let total = 0;
  const rows = COUNTIES.map((c) => ({ c, t: tallyOf(state.tally, c.code) }));
  rows.forEach(({ c, t }, i) => {
    total += t.total;
    const tile = $(`tile-${c.code}`);
    const val = tile.querySelector('.t-val');
    const bar = tile.querySelector('.t-bar i');
    tile.classList.toggle('hidden-val', !revealed);
    tile.classList.toggle('has-votes', revealed && t.total > 0);
    bar.style.width = revealed && t.ratio !== null ? `${Math.round(t.ratio * 100)}%` : '0';
    tile.classList.remove('lean-yes', 'lean-no');
    tile.setAttribute('aria-pressed', String(c.code === state.code));

    let label;
    if (!revealed) {
      val.textContent = '？？';
      label = `${c.name}，投票後解鎖`;
    } else if (t.ratio === null) {
      val.textContent = '—';
      label = `${c.name}，尚無人投票`;
    } else {
      const pct = Math.round(t.ratio * 100);
      tile.classList.add(t.ratio >= 0.5 ? 'lean-yes' : 'lean-no');
      tile.style.setProperty('--s', (0.12 + Math.abs(t.ratio - 0.5) * 0.9).toFixed(2));
      label = `${c.name}，${pct}% 猜放假，共 ${t.total} 票`;
      if (animate && !reduceMotion) {
        val.dataset.val = '0';
        tile.classList.remove('flip');
        tile.style.animationDelay = `${i * 55}ms`;
        void tile.offsetWidth; // 重新觸發動畫
        tile.classList.add('flip');
        setTimeout(() => animateNumber(val, pct, fmtPct), i * 55);
      } else {
        animateNumber(val, pct, fmtPct);
      }
    }

    let stamp = tile.querySelector('.t-stamp');
    const actual = state.result && actualChoice(state.result[c.code]);
    if (actual) {
      if (!stamp) { stamp = document.createElement('span'); tile.appendChild(stamp); }
      stamp.className = `t-stamp${actual === 'no' ? ' work' : ''}`;
      stamp.textContent = actual === 'yes' ? '休' : '班';
      label += `，官方公告${actual === 'yes' ? '停班停課' : '照常上班'}`;
    } else if (stamp) {
      stamp.remove();
    }
    tile.setAttribute('aria-label', label);
  });
  animateNumber($('totalVotes'), total, fmtInt);

  const chip = $('heroChipText');
  const tomorrow = state.dates[0];
  if (state.date === tomorrow) {
    const st = state.status === 'voting' ? '放假預測投票中' : state.status === 'counting' ? '開票中' : '公告揭曉';
    chip.textContent = `明天 ${dateLabel(tomorrow)} ${st}・已有 ${fmtInt(total)} 人投票`;
  }

  renderRanking(rows, revealed);
  renderTicker(rows, revealed, total);
}

// 開票快訊跑馬燈：內容重複兩份，CSS 位移 -50% 就能無縫循環
function renderTicker(rows, revealed, total) {
  const when = dateLabel(state.date);
  let html;
  if (!revealed) {
    html = `<b>${when}</b> 放假預測投票中<span class="sep">◆</span>全台已有 <b>${fmtInt(total)}</b> 人投票`
      + '<span class="sep">◆</span>投下一票解鎖各縣市開票結果<span class="sep">◆</span>前一天 19:00 截止投票<span class="sep">◆</span>';
  } else {
    const items = rows.filter((r) => r.t.total > 0)
      .sort((a, b) => b.t.total - a.t.total)
      .map(({ c, t }) => {
        const actual = state.result && actualChoice(state.result[c.code]);
        if (actual) return `${c.short} 官方公告 <b class="${actual === 'yes' ? 'ty' : 'tn'}">${actual === 'yes' ? '放假' : '照常'}</b>`;
        const pct = Math.round(t.ratio * 100);
        return pct >= 50 ? `${c.short} <b class="ty">${pct}%</b> 猜放假` : `${c.short} <b class="tn">${100 - pct}%</b> 猜上班`;
      });
    html = `<b>${when}</b> 開票快訊・總票數 <b>${fmtInt(total)}</b><span class="sep">◆</span>`
      + (items.length ? items.join('<span class="sep">◆</span>') : '還沒有人投票，搶頭香！') + '<span class="sep">◆</span>';
  }
  const inner = $('tickerInner');
  if (inner.dataset.html === html) return;
  inner.dataset.html = html;
  inner.innerHTML = `<span>${html}</span><span aria-hidden="true">${html}</span>`;
}

function renderRanking(rows, revealed) {
  const ol = $('ranking');
  if (!revealed) {
    ol.innerHTML = '<li class="empty-note" style="display:block">🔒 投票後解鎖排行榜</li>';
    return;
  }
  const top = rows.filter((r) => r.t.total > 0)
    .sort((a, b) => b.t.ratio - a.t.ratio || b.t.total - a.t.total)
    .slice(0, 6);
  if (!top.length) {
    ol.innerHTML = '<li class="empty-note" style="display:block">還沒有人投票，搶頭香！</li>';
    return;
  }
  ol.innerHTML = top.map((r, i) => {
    const pct = Math.round(r.t.ratio * 100);
    return `<li><span class="rk">${i + 1}</span><span>${r.c.name}</span><span class="bar"><span style="width:${pct}%"></span></span><span class="pv">${pct}%</span></li>`;
  }).join('');
}

function renderDetail() {
  const c = byCode[state.code];
  const t = tallyOf(state.tally, c.code);
  const revealed = isRevealed();
  $('detailName').textContent = c.name;
  $('detailSub').textContent = `${dateLabel(state.date)} 放假預測・${fmtInt(t.total)} 票`;
  $('voteCounty').value = c.code;

  const vs = $('versus');
  const actual = state.result && actualChoice(state.result[c.code]);
  if (!revealed) {
    vs.innerHTML = `<div class="versus-hidden">🔒 投下你的一票，立即解鎖開票結果<br>全台目前已有 <b class="num">${fmtInt(Number($('totalVotes').dataset.val) || 0)}</b> 人投票</div>`;
  } else {
    const yp = t.ratio === null ? 0 : Math.round(t.ratio * 100);
    const np = t.ratio === null ? 0 : 100 - yp;
    const stamp = actual ? `<div class="stamp${actual === 'no' ? ' work' : ''}">${actual === 'yes' ? '確定放假' : '照常上班'}</div>` : '';
    const existing = vs.querySelector('.versus-nums');
    if (!existing) {
      vs.innerHTML = `
        <div class="versus-nums">
          <div class="side yes"><span class="tag">🏖️ 會放假</span><span class="pct" id="vsYes">0%</span><span class="cnt" id="vsYesCnt"></span></div>
          <div class="side no right"><span class="tag">💼 照常上班</span><span class="pct" id="vsNo">0%</span><span class="cnt" id="vsNoCnt"></span></div>
        </div>
        <div class="split-bar"><span class="y" id="vsBarY" style="width:0"></span><span class="gap"></span><span class="n" id="vsBarN" style="width:0"></span></div>
        <div id="vsStamp"></div>`;
    }
    animateNumber($('vsYes'), yp, fmtPct);
    animateNumber($('vsNo'), np, fmtPct);
    $('vsYesCnt').textContent = `${fmtInt(t.yes)} 票`;
    $('vsNoCnt').textContent = t.total ? `${fmtInt(t.no)} 票` : '尚無人投票';
    requestAnimationFrame(() => {
      $('vsBarY').style.width = `${yp}%`;
      $('vsBarN').style.width = `${np}%`;
    });
    const stampWrap = $('vsStamp');
    if (stampWrap.dataset.key !== `${state.date}-${c.code}-${actual}`) {
      stampWrap.dataset.key = `${state.date}-${c.code}-${actual}`;
      stampWrap.innerHTML = stamp;
    }
  }

  const model = T.getEstimate(c.code);
  $('modelPct').innerHTML = model === null ? '<small>先到上方估算</small>' : `${model}%`;
  $('histPct').textContent = `${c.pct}%`;
  renderVoteControls();
}

function renderVoteControls() {
  const c = byCode[state.code];
  const mine = state.myVote;
  const open = state.status === 'voting';
  const buttons = document.querySelectorAll('.vote-btn');
  buttons.forEach((b) => {
    b.disabled = state.busy || !!mine || !open;
    b.classList.toggle('chosen', !!mine && mine.choice === b.dataset.choice && mine.county === c.code);
  });

  const q = $('voteQuestion');
  const msg = $('voteMsg');
  if (mine) {
    const mc = byCode[mine.county];
    q.textContent = `你預測 ${mc.name} ${dateLabel(state.date)}：`;
    msg.className = 'vote-msg ok';
    msg.textContent = mine.county === c.code
      ? `✅ 已投票：${mine.choice === 'yes' ? '會放假' : '照常上班'}（每人每天一票）`
      : `你這天已經替 ${mc.name} 投過票了（每人每天一票）`;
  } else if (!state.busy) {
    q.textContent = `你覺得 ${c.name} ${dateLabel(state.date)} 會放颱風假嗎？`;
    msg.className = 'vote-msg';
    msg.textContent = open ? '投出後不能更改，請替你所在或關心的縣市投票。' : '這天的投票已截止，來看開票結果吧！';
  }
  $('voteShare').hidden = !mine;
}

function renderAll() {
  renderToolbar();
  updateBoard();
  renderDetail();
}

// 每個日期第一次「解鎖＋拿到票數」時跑一次開票動畫，之後只做數字更新
function updateBoard() {
  if (state.animatePending && state.tallyLoaded && isRevealed()) {
    state.animatePending = false;
    $('versus').innerHTML = '';
    renderBoard(true);
  } else {
    renderBoard(false);
  }
}

// ---------- 戰績 ----------
function myVotes() { return store.getJSON(MY_VOTES_KEY, {}); }

async function refreshRecord() {
  const votes = myVotes();
  const dates = Object.keys(votes).sort().reverse().slice(0, 30);
  let settled = 0;
  let hits = 0;
  await Promise.all(dates.map(async (d) => {
    let result = d === state.date ? state.result : null;
    // 只對已經可能公告的日子查結果，省讀取次數
    if (!result && d <= twDate(1)) {
      try { result = await state.backend.getResult(d); } catch (e) { result = null; }
    }
    const actual = result && actualChoice(result[votes[d].county]);
    if (!actual) return;
    settled += 1;
    if (actual === votes[d].choice) hits += 1;
  }));

  const total = dates.length;
  const rate = settled ? hits / settled : 0;
  let medal = '🔭', title = '見習觀測員';
  if (settled) {
    if (settled >= 3 && rate >= 0.8) { medal = '🔮'; title = '颱風假預言家'; }
    else if (rate >= 0.6) { medal = '🌀'; title = '資深氣象迷'; }
    else if (hits > 0) { medal = '🌦️'; title = '颱風觀察員'; }
    else { medal = '🌧️'; title = '菜鳥觀測員'; }
  }
  const stats = !total ? '投票後等公告，猜中就能升級成颱風假預言家。'
    : settled ? `已投 ${total} 票・揭曉 ${settled} 場・猜中 ${hits} 場（${Math.round(rate * 100)}%）`
    : `已投 ${total} 票，等待縣市公告揭曉`;
  $('record').innerHTML = `<div class="medal" aria-hidden="true">${medal}</div><div><div class="title">${title}</div><div class="stats">${stats}</div></div>`;
}

function maybeCelebrate() {
  const mine = state.myVote;
  if (!mine || !state.result) return;
  const actual = actualChoice(state.result[mine.county]);
  if (!actual) return;
  const done = store.getJSON(CELEBRATED_KEY, []);
  if (done.includes(state.date)) return;
  store.setJSON(CELEBRATED_KEY, done.concat(state.date).slice(-30));
  if (actual === mine.choice) {
    toast(`🎉 猜中了！${byCode[mine.county].name}${actual === 'yes' ? '確定放假' : '照常上班'}`);
    confetti();
  } else {
    toast(`😅 差一點！${byCode[mine.county].name}官方公告${actual === 'yes' ? '放假' : '照常上班'}`);
  }
}

function confetti() {
  if (reduceMotion) return;
  const wrap = document.createElement('div');
  wrap.className = 'confetti';
  const colors = ['#a78bfa', '#38bdf8', '#fbbf24', '#f472b6', '#4ade80'];
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = `${1.8 + Math.random() * 1.6}s`;
    p.style.animationDelay = `${Math.random() * 0.4}s`;
    wrap.appendChild(p);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 4000);
}

// ---------- 互動 ----------
async function selectDate(date) {
  if (state.unsubscribe) state.unsubscribe();
  state.date = date;
  state.tally = {};
  state.result = null;
  state.myVote = myVotes()[date] || null;
  state.status = pollStatus(date, null);
  state.tallyLoaded = false;
  state.animatePending = true;
  $('versus').innerHTML = '';
  renderAll();

  state.unsubscribe = state.backend.subscribe(date, (tally) => {
    if (state.date !== date) return;
    state.tally = tally;
    state.tallyLoaded = true;
    updateBoard();
    renderDetail();
  }, (result) => {
    if (state.date !== date) return;
    state.result = result;
    state.status = pollStatus(date, result);
    renderAll();
    maybeCelebrate();
    if (result) refreshRecord();
  }, (err) => {
    console.warn('[vote] subscribe failed', err);
    $('modeBadge').textContent = '⚠️ 連線中斷';
  });

  try {
    const server = await state.backend.myVote(date);
    if (state.date !== date) return;
    if (server) {
      state.myVote = server;
      const all = myVotes();
      all[date] = server;
      store.setJSON(MY_VOTES_KEY, all);
    }
  } catch (e) {
    console.warn('[vote] myVote failed', e);
  }
  updateBoard();
  renderDetail();
}

async function castVote(choice) {
  if (state.myVote || state.status !== 'voting' || state.busy) return;
  const code = state.code;
  const date = state.date;
  state.busy = true;
  renderVoteControls();
  $('voteMsg').className = 'vote-msg';
  $('voteMsg').textContent = '🗳️ 投票中…';
  try {
    await state.backend.vote(date, code, choice);
    state.myVote = { county: code, choice };
    const all = myVotes();
    all[date] = state.myVote;
    store.setJSON(MY_VOTES_KEY, all);
    state.busy = false;
    toast('✅ 投票成功！開票結果已解鎖');
    updateBoard();
    renderDetail();
    refreshRecord();
    document.getElementById('tileMap').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  } catch (e) {
    state.busy = false;
    renderVoteControls();
    const msg = $('voteMsg');
    msg.className = 'vote-msg err';
    msg.textContent = e && e.code === 'permission-denied'
      ? '⚠️ 投票失敗：這天可能已經投過票，或投票已截止。'
      : '⚠️ 投票失敗，請檢查網路後再試一次。';
    console.warn('[vote] cast failed', e);
  }
}

function shareVote() {
  const mine = state.myVote;
  if (!mine) return;
  const c = byCode[mine.county];
  const t = tallyOf(state.tally, c.code);
  const pct = t.ratio === null ? null : Math.round(t.ratio * 100);
  const text = `🌀 我預測${c.name} ${dateLabel(state.date)}${mine.choice === 'yes' ? '會放颱風假 🏖️' : '照常上班 💼'}！`
    + (pct === null ? '' : `目前 ${pct}% 網友猜放假，`) + '你覺得呢？來投一票 👉';
  if (navigator.share) {
    navigator.share({ title: '颱風假網友開票所', text, url: T.siteUrl() + '#vote' }).catch(() => {});
  } else {
    T.copyText(`${text} ${T.siteUrl()}#vote`).then((ok) => toast(ok ? '✅ 已複製，貼給朋友一起投票吧' : '⚠️ 複製失敗'));
  }
}

function tick() {
  const prev = state.status;
  state.status = pollStatus(state.date, state.result);
  if (prev !== state.status) {
    renderAll();
  } else {
    renderCountdown();
  }
  // 跨日時把日期分頁往後推
  if (state.dates[0] !== twDate(1)) {
    state.dates = [twDate(1), twDate(2)];
    buildTabs();
    selectDate(state.dates[0]);
  }
}

// ---------- 啟動 ----------
async function boot() {
  state.dates = [twDate(1), twDate(2)];
  buildTabs();
  buildTiles();
  T.fillCountySelect($('voteCounty'));
  $('voteCounty').addEventListener('change', (e) => T.setCounty(e.target.value, 'vote'));
  document.querySelectorAll('.vote-btn').forEach((b) => b.addEventListener('click', () => castVote(b.dataset.choice)));
  $('shareVoteBtn').addEventListener('click', shareVote);
  T.onCountyChange((code) => {
    state.code = code;
    renderBoard(false);
    renderDetail();
  });
  document.addEventListener('typhoon:estimate', () => renderDetail());

  const badge = $('modeBadge');
  if (FIREBASE_CONFIG) {
    try {
      state.backend = await createFirebaseBackend(FIREBASE_CONFIG);
      badge.textContent = '● 即時連線';
      badge.classList.add('live');
    } catch (e) {
      console.warn('[vote] Firebase 載入失敗，改用示範模式', e);
      state.backend = createDemoBackend();
      badge.textContent = '離線示範資料';
      badge.title = '無法連上投票伺服器，目前顯示的是模擬票數';
    }
  } else {
    state.backend = createDemoBackend();
    badge.textContent = '示範資料・模擬票數';
    badge.title = '尚未連接投票伺服器：其他縣市的票數為模擬資料，你的票只存在這個瀏覽器';
  }

  await selectDate(state.dates[0]);
  refreshRecord();
  setInterval(tick, 1000);
}

boot();
