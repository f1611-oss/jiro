const STORAGE_KEY = "jiro-log-records-v1";
const DB_NAME = "jiro-log-db";
const DB_STORE = "app-data";
const CLOUD_READY_KEY = "jiro-log-cloud-initialized-v1";
const scoreFields = [
  ["soup", "スープ"],
  ["noodles", "麺"],
  ["pork", "豚"],
  ["balance", "バランス"],
  ["return", "また来たいか"],
];
const genres = ["二郎系（乳化）", "二郎系（非乳化）", "汁なし"];
const prefectures = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
];

const state = {
  page: "home",
  records: [],
  editingId: null,
  detailId: null,
  rankingMetric: "total",
  rankingGenre: "all",
  rankingYear: "all",
  listQuery: "",
  listGenre: "all",
  listSort: "new",
  wishlist: [],
  wishlistFormOpen: false,
  addPrefill: null,
  wishlistSourceId: null,
  syncing: false,
};

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const restoreInput = document.querySelector("#restore-input");

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadRecords() {
  try {
    const db = await openDatabase();
    const records = await new Promise((resolve, reject) => {
      const request = db.transaction(DB_STORE).objectStore(DB_STORE).get("records");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (Array.isArray(records)) return records;
    const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(legacy) && legacy.length) {
      state.records = legacy;
      await saveRecords();
      localStorage.removeItem(STORAGE_KEY);
      return legacy;
    }
    return [];
  } catch {
    try {
      const fallback = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(fallback) ? fallback : [];
    } catch {
      return [];
    }
  }
}

async function saveRecords() {
  try {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const request = db.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).put(state.records, "records");
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
    db.close();
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
  }
}

async function loadWishlist() {
  try {
    const db = await openDatabase();
    const wishlist = await new Promise((resolve, reject) => {
      const request = db.transaction(DB_STORE).objectStore(DB_STORE).get("wishlist");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return Array.isArray(wishlist) ? wishlist : [];
  } catch {
    try {
      const fallback = JSON.parse(localStorage.getItem("jiro-log-wishlist-v1") || "[]");
      return Array.isArray(fallback) ? fallback : [];
    } catch {
      return [];
    }
  }
}

async function saveWishlist() {
  try {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const request = db.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).put(state.wishlist, "wishlist");
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
    db.close();
  } catch {
    localStorage.setItem("jiro-log-wishlist-v1", JSON.stringify(state.wishlist));
  }
}

function totalScore(scores) {
  const sum = scoreFields.reduce((total, [key]) => total + Number(scores[key] || 0), 0);
  return (sum / 5 * 10).toFixed(1);
}

function formatDate(date) {
  if (!date) return "";
  const [y, m, d] = date.split("-");
  return `${y}.${m}.${d}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function cloudConfigured() {
  return Boolean(window.JiroCloud?.configured());
}

function cloudActive() {
  return cloudConfigured();
}

function cloudBadge() {
  if (!cloudConfigured()) return "";
  return `<span class="cloud-badge ${cloudActive() ? "online" : ""}">${cloudActive() ? "● 公開共有中" : "○ 未接続"}</span>`;
}

function navigate(page, options = {}) {
  state.page = page;
  if (options.id) state.detailId = options.id;
  if (page === "add" && !options.keepEdit) {
    state.editingId = null;
    if (!options.keepPrefill) {
      state.addPrefill = null;
      state.wishlistSourceId = null;
    }
  }
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function nav() {
  const items = [
    ["home", "⌂", "ホーム"],
    ["list", "▤", "記録一覧"],
    ["add", "+", "新規登録"],
    ["ranking", "♛", "ランキング"],
    ["settings", "⚙", "設定"],
  ];
  return `<nav class="bottom-nav" aria-label="メインメニュー"><div class="nav-items">
    ${items.map(([page, icon, label]) => `
      <button class="nav-button ${page === "add" ? "add" : ""} ${state.page === page ? "active" : ""}" data-nav="${page}">
        <span class="nav-icon">${icon}</span><span>${label}</span>
      </button>`).join("")}
  </div></nav>`;
}

function pageHeader(eyebrow, title, action = "") {
  return `<header class="page-header"><div>${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ""}<h1>${title}</h1></div>${action}</header>`;
}

function recordCard(record, { ranking = false, index = 0, metric = "total" } = {}) {
  const score = metric === "total" ? totalScore(record.scores) : Number(record.scores[metric]).toFixed(1);
  const best = [...scoreFields].sort((a, b) => record.scores[b[0]] - record.scores[a[0]])[0];
  const location = [record.prefecture || record.area, record.station].filter(Boolean).join("・");
  return `<article class="record-card ${ranking ? `ranking-card top-${index + 1}` : ""}" data-detail="${record.id}">
    ${ranking ? `<div class="rank-number">${index + 1}</div>` : ""}
    <img class="record-thumb" src="${record.photo}" alt="${escapeHtml(record.shop)}のラーメン">
    <div class="record-main">
      <h3>${escapeHtml(record.shop)}</h3>
      <p>${escapeHtml(record.menu)}</p>
      <p>${escapeHtml(record.genre)} · ${formatDate(record.date)}</p>
      ${location ? `<p class="location-line">⌖ ${escapeHtml(location)}</p>` : ""}
      ${ranking && metric === "total" ? `<p class="best-label">BEST：${best[1]} ${Number(record.scores[best[0]]).toFixed(1)}</p>` : ""}
    </div>
    <div class="score">${score}<small>${metric === "total" ? "総合点" : "10点満点"}</small></div>
  </article>`;
}

function homePage() {
  const sorted = [...state.records].sort((a, b) => Number(totalScore(b.scores)) - Number(totalScore(a.scores)));
  const recent = [...state.records].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const average = state.records.length
    ? (state.records.reduce((sum, record) => sum + Number(totalScore(record.scores)), 0) / state.records.length).toFixed(1)
    : "—";
  const top = sorted[0];

  return `
    ${pageHeader("", "JIRO LOG", cloudBadge())}
    ${top ? `<section class="hero" data-detail="${top.id}">
      <img src="${top.photo}" alt="${escapeHtml(top.shop)}のラーメン">
      <div class="hero-info">
        <div class="rank-crown">♛ 歴代ランキング 1位</div>
        <div class="hero-score">${totalScore(top.scores)}<small> 点</small></div>
        <p class="hero-title">${escapeHtml(top.shop)}</p>
        <p class="hero-sub">${escapeHtml(top.menu)}</p>
      </div>
    </section>` : `<section class="hero hero-empty">
      <div><div class="empty-mark">丼</div><h2>最初の一杯を記録しよう</h2><p class="muted">写真と5つの採点だけで、ランキングが始まります。</p></div>
    </section>`}
    <div class="stats">
      <div class="stat"><strong>${state.records.length}</strong><span>記録した総杯数</span></div>
      <div class="stat"><strong>${average}</strong><span>平均総合点</span></div>
      <div class="stat"><strong>${new Set(state.records.map(r => r.shop)).size}</strong><span>訪問店舗</span></div>
    </div>
    <button class="primary-button block" data-nav="add">＋ ラーメンを記録する</button>
    <button class="wishlist-entry" data-nav="wishlist">
      <span class="wishlist-entry-icon">◎</span>
      <span><strong>行きたい店</strong><small>${state.wishlist.length ? `${state.wishlist.length}店を登録中` : "気になる店をメモ"}</small></span>
      <span class="wishlist-entry-arrow">›</span>
    </button>
    ${recent.length ? `<section class="section">
      <div class="section-head"><h2>最近の記録</h2><button class="text-button" data-nav="list">すべて見る</button></div>
      <div class="record-list">${recent.map(record => recordCard(record)).join("")}</div>
    </section>` : ""}
    ${sorted.length ? `<section class="section">
      <div class="section-head"><h2>現在のTOP 3</h2><button class="text-button" data-nav="ranking">ランキングへ</button></div>
      <div class="record-list">${sorted.slice(0, 3).map((record, index) => recordCard(record, { ranking: true, index })).join("")}</div>
    </section>` : ""}
  `;
}

function addPage() {
  const record = state.records.find(r => r.id === state.editingId);
  const defaults = record || state.addPrefill || {
    shop: "", menu: "", date: new Date().toISOString().slice(0, 10), genre: genres[0],
    photo: "", price: "", prefecture: "", station: "", wait: "", comment: "", favorite: false, revisit: false,
    scores: Object.fromEntries(scoreFields.map(([key]) => [key, 5])),
  };
  defaults.prefecture = defaults.prefecture || defaults.area || "";
  defaults.station = defaults.station || "";

  return `
    ${pageHeader(record ? "EDIT LOG" : "NEW LOG", record ? "記録を編集" : "一杯を記録")}
    <form id="record-form">
      <div class="field">
        <label class="required">ラーメンの写真</label>
        <label class="photo-picker">
          <input id="photo-input" type="file" accept="image/*" capture="environment" ${record ? "" : "required"}>
          <div id="photo-preview">${defaults.photo
            ? `<img src="${defaults.photo}" alt="選択中の写真">`
            : `<div class="photo-placeholder"><span class="camera-mark">◎</span><strong>写真を撮る・選ぶ</strong><small>タップしてカメラまたは写真ライブラリを開く</small></div>`}</div>
        </label>
      </div>
      <input type="hidden" id="photo-data" value="${defaults.photo}">
      <div class="field-grid">
        <div class="field"><label class="required" for="shop">店名</label><input id="shop" name="shop" value="${escapeHtml(defaults.shop)}" autocomplete="organization" required></div>
        <div class="field"><label class="required" for="menu">メニュー名</label><input id="menu" name="menu" value="${escapeHtml(defaults.menu)}" required></div>
      </div>
      <div class="field"><label class="required" for="date">訪問日</label><input id="date" name="date" type="date" value="${defaults.date}" required></div>
      <div class="field">
        <label class="required">ジャンル</label>
        <div class="genre-options">${genres.map(genre => `<label class="genre-option"><input type="radio" name="genre" value="${genre}" ${defaults.genre === genre ? "checked" : ""}><span>${genre.replace("二郎系", "二郎系<br>")}</span></label>`).join("")}</div>
      </div>
      <section class="score-panel">
        <div class="live-total"><div><p class="eyebrow">LIVE SCORE</p><strong>総合点</strong></div><strong id="live-total">${totalScore(defaults.scores)}<small> 点</small></strong></div>
        ${scoreFields.map(([key, label]) => `<div class="score-control">
          <div class="score-control-head"><label for="score-${key}">${label}</label><output id="output-${key}">${Number(defaults.scores[key]).toFixed(1)}</output></div>
          <input id="score-${key}" name="${key}" type="range" min="0" max="10" step="0.5" value="${defaults.scores[key]}">
        </div>`).join("")}
      </section>
      <h2>任意情報</h2>
      <div class="field-grid">
        <div class="field"><label for="price">価格（円）</label><input id="price" name="price" type="number" min="0" inputmode="numeric" value="${escapeHtml(defaults.price)}" placeholder="1000"></div>
        <div class="field"><label for="wait">待ち時間（分）</label><input id="wait" name="wait" type="number" min="0" inputmode="numeric" value="${escapeHtml(defaults.wait)}" placeholder="20"></div>
      </div>
      <div class="field-grid">
        <div class="field"><label for="prefecture">都道府県</label><select id="prefecture" name="prefecture"><option value="">選択してください</option>${defaults.prefecture && !prefectures.includes(defaults.prefecture) ? `<option value="${escapeHtml(defaults.prefecture)}" selected>${escapeHtml(defaults.prefecture)}（既存データ）</option>` : ""}${prefectures.map(prefecture => `<option value="${prefecture}" ${defaults.prefecture === prefecture ? "selected" : ""}>${prefecture}</option>`).join("")}</select></div>
        <div class="field"><label for="station">最寄り駅</label><input id="station" name="station" value="${escapeHtml(defaults.station)}" placeholder="例：神保町駅"></div>
      </div>
      <div class="field"><label for="comment">コメント</label><textarea id="comment" name="comment" placeholder="今日の一杯について">${escapeHtml(defaults.comment)}</textarea></div>
      <div class="field toggle-row">
        <label class="toggle"><input name="favorite" type="checkbox" ${defaults.favorite ? "checked" : ""}><span>★ お気に入り</span></label>
        <label class="toggle"><input name="revisit" type="checkbox" ${defaults.revisit ? "checked" : ""}><span>↻ 再訪したい</span></label>
      </div>
      <button class="primary-button block" type="submit">${record ? "変更を保存" : "この一杯を保存"}</button>
    </form>
  `;
}

function wishlistCard(shop) {
  const location = [shop.prefecture, shop.station].filter(Boolean).join("・");
  return `<article class="wishlist-card">
    <div class="wishlist-pin">◎</div>
    <div class="wishlist-main">
      <h3>${escapeHtml(shop.shop)}</h3>
      ${shop.menu ? `<p>${escapeHtml(shop.menu)}</p>` : ""}
      ${location ? `<p class="location-line">⌖ ${escapeHtml(location)}</p>` : ""}
      ${shop.memo ? `<p class="wishlist-memo">${escapeHtml(shop.memo)}</p>` : ""}
    </div>
    <div class="wishlist-actions">
      <button class="visit-button" data-visit-wishlist="${shop.id}">食べたので記録</button>
      <button class="icon-button danger" aria-label="${escapeHtml(shop.shop)}を削除" data-delete-wishlist="${shop.id}">×</button>
    </div>
  </article>`;
}

function wishlistPage() {
  const shops = [...state.wishlist].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return `
    <header class="page-header"><button class="text-button" data-home>‹ ホーム</button><div><p class="eyebrow">WANT TO GO</p><h1>行きたい店</h1></div><button class="round-add" id="toggle-wishlist-form" aria-label="店を追加">${state.wishlistFormOpen ? "×" : "+"}</button></header>
    ${state.wishlistFormOpen ? `<form id="wishlist-form" class="wishlist-form">
      <div class="field"><label class="required" for="wishlist-shop">店名</label><input id="wishlist-shop" name="shop" required autocomplete="organization" placeholder="例：ラーメン二郎 神田神保町店"></div>
      <div class="field-grid">
        <div class="field"><label for="wishlist-prefecture">都道府県</label><select id="wishlist-prefecture" name="prefecture"><option value="">選択してください</option>${prefectures.map(prefecture => `<option value="${prefecture}">${prefecture}</option>`).join("")}</select></div>
        <div class="field"><label for="wishlist-station">最寄り駅</label><input id="wishlist-station" name="station" placeholder="例：神保町駅"></div>
      </div>
      <div class="field"><label for="wishlist-menu">狙っているメニュー</label><input id="wishlist-menu" name="menu" placeholder="例：小ラーメン"></div>
      <div class="field"><label for="wishlist-memo">メモ</label><textarea id="wishlist-memo" name="memo" placeholder="営業時間、定休日など"></textarea></div>
      <button class="primary-button block" type="submit">行きたい店に追加</button>
    </form>` : ""}
    <section class="section">
      <div class="section-head"><h2>${shops.length}店</h2>${!state.wishlistFormOpen ? `<button class="text-button" id="open-wishlist-form">＋ 店を追加</button>` : ""}</div>
      <div class="wishlist-list">${shops.length ? shops.map(wishlistCard).join("") : emptyState("行きたい店はまだありません", "気になる二郎系の店を登録しておけます。")}</div>
    </section>
  `;
}

function listPage() {
  let records = [...state.records];
  const query = state.listQuery.trim().toLowerCase();
  if (query) records = records.filter(r => `${r.shop} ${r.menu} ${r.prefecture || r.area || ""} ${r.station || ""}`.toLowerCase().includes(query));
  if (state.listGenre !== "all") records = records.filter(r => r.genre === state.listGenre);
  records.sort(state.listSort === "score"
    ? (a, b) => Number(totalScore(b.scores)) - Number(totalScore(a.scores))
    : (a, b) => b.date.localeCompare(a.date));

  return `
    ${pageHeader("ALL LOGS", "記録一覧", `<strong class="accent">${records.length}杯</strong>`)}
    <div class="search-wrap"><input id="list-search" type="search" value="${escapeHtml(state.listQuery)}" placeholder="店名・メニュー名で検索"></div>
    <div class="filters">
      <select id="list-genre" aria-label="ジャンル">${genreOptions(state.listGenre)}</select>
      <select id="list-sort" aria-label="並び順"><option value="new" ${state.listSort === "new" ? "selected" : ""}>新しい順</option><option value="score" ${state.listSort === "score" ? "selected" : ""}>得点順</option></select>
    </div>
    <div class="record-list">${records.length ? records.map(record => recordCard(record)).join("") : emptyState("記録が見つかりません", "条件を変えるか、新しい一杯を記録してください。")}</div>
  `;
}

function genreOptions(selected) {
  return `<option value="all">全ジャンル</option>${genres.map(g => `<option value="${g}" ${selected === g ? "selected" : ""}>${g}</option>`).join("")}`;
}

function rankingPage() {
  const years = [...new Set(state.records.map(r => r.date.slice(0, 4)))].sort().reverse();
  let records = [...state.records];
  if (state.rankingGenre !== "all") records = records.filter(r => r.genre === state.rankingGenre);
  if (state.rankingYear !== "all") records = records.filter(r => r.date.startsWith(state.rankingYear));
  const metric = state.rankingMetric;
  records.sort((a, b) => {
    const aScore = metric === "total" ? Number(totalScore(a.scores)) : a.scores[metric];
    const bScore = metric === "total" ? Number(totalScore(b.scores)) : b.scores[metric];
    return bScore - aScore || b.date.localeCompare(a.date);
  });

  const tabs = [["total", "総合"], ...scoreFields];
  return `
    ${pageHeader("RANKING", "俺の一杯。")}
    <div class="segmented">${tabs.map(([key, label]) => `<button class="segment ${metric === key ? "active" : ""}" data-metric="${key}">${label}</button>`).join("")}</div>
    <div class="filters">
      <select id="ranking-genre" aria-label="ジャンル">${genreOptions(state.rankingGenre)}</select>
      <select id="ranking-year" aria-label="訪問年"><option value="all">全年</option>${years.map(year => `<option value="${year}" ${state.rankingYear === year ? "selected" : ""}>${year}年</option>`).join("")}</select>
    </div>
    <div class="record-list">${records.length ? records.map((record, index) => recordCard(record, { ranking: true, index, metric })).join("") : emptyState("ランキングはまだありません", "一杯記録すると、自動で順位が決まります。")}</div>
  `;
}

function radarSvg(scores) {
  const center = 120;
  const maxRadius = 86;
  const points = scoreFields.map((_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / 5;
    const radius = maxRadius * Number(scores[scoreFields[index][0]]) / 10;
    return `${center + Math.cos(angle) * radius},${center + Math.sin(angle) * radius}`;
  }).join(" ");
  const grid = [0.25, 0.5, 0.75, 1].map(scale => {
    const gridPoints = scoreFields.map((_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / 5;
      return `${center + Math.cos(angle) * maxRadius * scale},${center + Math.sin(angle) * maxRadius * scale}`;
    }).join(" ");
    return `<polygon points="${gridPoints}" fill="none" stroke="#39393f" stroke-width="1"/>`;
  }).join("");
  const labels = scoreFields.map(([, label], index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / 5;
    const x = center + Math.cos(angle) * 108;
    const y = center + Math.sin(angle) * 108 + 4;
    return `<text x="${x}" y="${y}" text-anchor="middle" fill="#aaaab0" font-size="11">${label}</text>`;
  }).join("");
  return `<svg width="260" height="250" viewBox="-10 -5 260 250" role="img" aria-label="5項目のレーダーチャート">${grid}<polygon points="${points}" fill="rgba(229,29,42,.28)" stroke="#e51d2a" stroke-width="3"/>${labels}</svg>`;
}

function detailPage() {
  const record = state.records.find(r => r.id === state.detailId);
  if (!record) return `${pageHeader("DETAIL", "記録がありません")}${emptyState("記録が見つかりません", "")}`;
  const details = [
    record.price && `${Number(record.price).toLocaleString()}円`,
    record.prefecture || record.area,
    record.station && `最寄り ${record.station}`,
    record.wait !== "" && `待ち ${record.wait}分`,
  ].filter(Boolean);
  return `
    <header class="page-header"><button class="text-button" data-back>‹ 戻る</button><p class="eyebrow">DETAIL LOG</p><span></span></header>
    <img class="detail-photo" src="${record.photo}" alt="${escapeHtml(record.shop)} ${escapeHtml(record.menu)}">
    <section class="detail-heading">
      <div class="score">${totalScore(record.scores)}<small>総合点</small></div>
      <h1>${escapeHtml(record.shop)}</h1>
      <p class="muted">${escapeHtml(record.menu)}</p>
      <div class="detail-meta">
        <span class="chip">${escapeHtml(record.genre)}</span><span class="chip">${formatDate(record.date)}</span>
        ${record.favorite ? `<span class="chip accent">★ お気に入り</span>` : ""}
        ${record.revisit ? `<span class="chip accent">↻ 再訪希望</span>` : ""}
      </div>
    </section>
    <section class="section"><h2>スコア</h2><div class="score-grid">${scoreFields.map(([key, label]) => `<div class="score-cell"><span>${label}</span><strong>${Number(record.scores[key]).toFixed(1)}</strong></div>`).join("")}</div><div class="radar-wrap">${radarSvg(record.scores)}</div></section>
    ${details.length ? `<section class="section"><h2>情報</h2><div class="detail-meta">${details.map(d => `<span class="chip">${escapeHtml(d)}</span>`).join("")}</div></section>` : ""}
    ${record.comment ? `<section class="section"><h2>コメント</h2><p class="detail-text">${escapeHtml(record.comment)}</p></section>` : ""}
    <div class="button-row"><button class="secondary-button" data-edit="${record.id}">編集する</button><button class="danger-button" data-delete="${record.id}">削除する</button></div>
  `;
}

function settingsPage() {
  return `
    ${pageHeader("SETTINGS", "設定")}
    <section class="section">
      <h2>クラウド同期</h2>
      ${cloudSettings()}
    </section>
    <section class="section">
      <h2>データ管理</h2>
      <div class="settings-list">
        <button class="setting-item" id="backup-button"><span><strong>バックアップ</strong><small>写真を含むJSONファイルを保存</small></span><span>↓</span></button>
        <button class="setting-item" id="restore-button"><span><strong>復元</strong><small>バックアップファイルから読み込み</small></span><span>↑</span></button>
        <button class="setting-item danger" id="clear-button"><span><strong>全データ削除</strong><small>記録${state.records.length}件・行きたい店${state.wishlist.length}件</small></span><span>›</span></button>
      </div>
    </section>
    <section class="section">
      <h2>表示</h2>
      <div class="settings-list">
        <button class="setting-item" id="theme-button"><span><strong>表示テーマ</strong><small>端末の設定に合わせます</small></span><span>ダーク</span></button>
      </div>
    </section>
    <section class="section">
      <h2>アプリ情報</h2>
      <div class="settings-list"><div class="setting-item"><span><strong>JIRO LOG</strong><small>二郎系ラーメン記録・ランキング</small></span><span class="muted">v2.0.0</span></div></div>
      <p class="muted" style="margin-top:12px;font-size:12px">クラウド接続中は2台で同じデータを共有し、端末内にも一時保存します。</p>
    </section>
  `;
}

function cloudSettings() {
  if (!cloudConfigured()) {
    return `<div class="cloud-panel">
      <div class="cloud-status"><span class="status-dot"></span><div><strong>未設定</strong><small>Supabaseの接続情報を設定してください</small></div></div>
      <p class="muted cloud-help">同梱のセットアップ手順に沿って無料プロジェクトを接続すると、2台で共有できます。</p>
    </div>`;
  }
  return `<div class="cloud-panel">
    <div class="cloud-status online"><span class="status-dot"></span><div><strong>公開共有中</strong><small>このURLを開いた人は全データを閲覧・登録・編集・削除できます</small></div></div>
    <div class="cloud-actions">
      <button class="secondary-button" id="sync-now-button">${state.syncing ? "同期中..." : "今すぐ同期"}</button>
      <button class="secondary-button" id="upload-local-button">端末データを移行</button>
    </div>
  </div>`;
}

function emptyState(title, description) {
  return `<div class="empty-state"><strong>${title}</strong><span>${description}</span></div>`;
}

function render() {
  const pages = { home: homePage, add: addPage, list: listPage, ranking: rankingPage, detail: detailPage, wishlist: wishlistPage, settings: settingsPage };
  app.innerHTML = `<main class="app-shell">${pages[state.page]()}</main>${nav()}`;
  bindEvents();
}

function bindEvents() {
  document.querySelectorAll("[data-nav]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.nav)));
  document.querySelectorAll("[data-detail]").forEach(card => card.addEventListener("click", () => navigate("detail", { id: card.dataset.detail })));
  document.querySelector("[data-back]")?.addEventListener("click", () => navigate("list"));
  document.querySelector("[data-edit]")?.addEventListener("click", event => {
    state.editingId = event.currentTarget.dataset.edit;
    navigate("add", { keepEdit: true });
  });
  document.querySelector("[data-delete]")?.addEventListener("click", deleteRecord);
  document.querySelector("[data-home]")?.addEventListener("click", () => navigate("home"));
  document.querySelector("#toggle-wishlist-form")?.addEventListener("click", toggleWishlistForm);
  document.querySelector("#open-wishlist-form")?.addEventListener("click", toggleWishlistForm);
  document.querySelector("#wishlist-form")?.addEventListener("submit", submitWishlist);
  document.querySelectorAll("[data-visit-wishlist]").forEach(button => button.addEventListener("click", visitWishlist));
  document.querySelectorAll("[data-delete-wishlist]").forEach(button => button.addEventListener("click", deleteWishlist));

  const form = document.querySelector("#record-form");
  form?.addEventListener("submit", submitRecord);
  document.querySelector("#photo-input")?.addEventListener("change", handlePhoto);
  scoreFields.forEach(([key]) => document.querySelector(`#score-${key}`)?.addEventListener("input", updateLiveScore));

  document.querySelector("#list-search")?.addEventListener("input", event => {
    state.listQuery = event.target.value;
    listRerenderKeepFocus(event.target.selectionStart);
  });
  document.querySelector("#list-genre")?.addEventListener("change", event => { state.listGenre = event.target.value; render(); });
  document.querySelector("#list-sort")?.addEventListener("change", event => { state.listSort = event.target.value; render(); });
  document.querySelectorAll("[data-metric]").forEach(button => button.addEventListener("click", () => { state.rankingMetric = button.dataset.metric; render(); }));
  document.querySelector("#ranking-genre")?.addEventListener("change", event => { state.rankingGenre = event.target.value; render(); });
  document.querySelector("#ranking-year")?.addEventListener("change", event => { state.rankingYear = event.target.value; render(); });

  document.querySelector("#backup-button")?.addEventListener("click", backupData);
  document.querySelector("#restore-button")?.addEventListener("click", () => restoreInput.click());
  document.querySelector("#clear-button")?.addEventListener("click", clearData);
  document.querySelector("#theme-button")?.addEventListener("click", () => showToast("現在はiPhoneに最適なダークテーマです"));
  document.querySelector("#sync-now-button")?.addEventListener("click", syncFromCloud);
  document.querySelector("#upload-local-button")?.addEventListener("click", uploadLocalToCloud);
}

function listRerenderKeepFocus(cursor) {
  render();
  const input = document.querySelector("#list-search");
  input?.focus();
  input?.setSelectionRange(cursor, cursor);
}

async function handlePhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const compressed = await compressImage(file);
    document.querySelector("#photo-data").value = compressed;
    document.querySelector("#photo-preview").innerHTML = `<img src="${compressed}" alt="選択中の写真">`;
  } catch {
    showToast("写真を読み込めませんでした");
  }
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const max = 1400;
        const scale = Math.min(1, max / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", .78));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function currentScores() {
  return Object.fromEntries(scoreFields.map(([key]) => [key, Number(document.querySelector(`#score-${key}`).value)]));
}

function updateLiveScore(event) {
  document.querySelector(`#output-${event.target.name}`).textContent = Number(event.target.value).toFixed(1);
  document.querySelector("#live-total").innerHTML = `${totalScore(currentScores())}<small> 点</small>`;
}

function normalized(value) {
  return value.trim().toLocaleLowerCase("ja");
}

async function submitRecord(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const photo = document.querySelector("#photo-data").value;
  if (!photo) return showToast("写真を選んでください");
  const shop = String(form.get("shop")).trim();
  const menu = String(form.get("menu")).trim();
  const duplicate = state.records.find(record =>
    record.id !== state.editingId &&
    normalized(record.shop) === normalized(shop) &&
    normalized(record.menu) === normalized(menu)
  );
  if (duplicate) {
    if (confirm("この店舗・メニューはすでに登録されています。\n既存の記録を編集しますか？")) {
      state.editingId = duplicate.id;
      navigate("add", { keepEdit: true });
    }
    return;
  }

  const record = {
    id: state.editingId || crypto.randomUUID(),
    photo, shop, menu,
    date: String(form.get("date")),
    genre: String(form.get("genre")),
    scores: currentScores(),
    price: String(form.get("price") || ""),
    prefecture: String(form.get("prefecture") || ""),
    station: String(form.get("station") || "").trim(),
    wait: String(form.get("wait") || ""),
    comment: String(form.get("comment") || "").trim(),
    favorite: form.get("favorite") === "on",
    revisit: form.get("revisit") === "on",
    updatedAt: new Date().toISOString(),
  };
  if (cloudActive()) {
    try {
      Object.assign(record, await window.JiroCloud.saveRecord(record));
    } catch (error) {
      showToast(`同期できませんでした：${error.message}`);
      return;
    }
  }
  const index = state.records.findIndex(r => r.id === record.id);
  if (index >= 0) state.records[index] = record;
  else state.records.push(record);
  await saveRecords();
  if (state.wishlistSourceId) {
    if (cloudActive()) {
      try {
        await window.JiroCloud.deleteWishlist(state.wishlistSourceId);
      } catch {
        showToast("記録は保存しましたが、行きたい店の整理に失敗しました");
      }
    }
    state.wishlist = state.wishlist.filter(shop => shop.id !== state.wishlistSourceId);
    await saveWishlist();
  }
  state.editingId = null;
  state.addPrefill = null;
  state.wishlistSourceId = null;
  state.detailId = record.id;
  navigate("detail", { id: record.id });
  showToast(index >= 0 ? "変更を保存しました" : "一杯を記録しました");
}

function toggleWishlistForm() {
  state.wishlistFormOpen = !state.wishlistFormOpen;
  render();
  if (state.wishlistFormOpen) setTimeout(() => document.querySelector("#wishlist-shop")?.focus(), 0);
}

async function submitWishlist(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const shopName = String(form.get("shop")).trim();
  const duplicate = state.wishlist.find(shop => normalized(shop.shop) === normalized(shopName));
  if (duplicate) return showToast("この店はすでに登録されています");
  const shop = {
    id: crypto.randomUUID(),
    shop: shopName,
    prefecture: String(form.get("prefecture") || ""),
    station: String(form.get("station") || "").trim(),
    menu: String(form.get("menu") || "").trim(),
    memo: String(form.get("memo") || "").trim(),
    createdAt: new Date().toISOString(),
  };
  if (cloudActive()) {
    try {
      await window.JiroCloud.saveWishlist(shop);
    } catch (error) {
      showToast(`同期できませんでした：${error.message}`);
      return;
    }
  }
  state.wishlist.push(shop);
  await saveWishlist();
  state.wishlistFormOpen = false;
  render();
  showToast("行きたい店に追加しました");
}

function visitWishlist(event) {
  const shop = state.wishlist.find(item => item.id === event.currentTarget.dataset.visitWishlist);
  if (!shop) return;
  state.addPrefill = {
    shop: shop.shop,
    menu: shop.menu,
    date: new Date().toISOString().slice(0, 10),
    genre: genres[0],
    photo: "",
    price: "",
    prefecture: shop.prefecture,
    station: shop.station,
    wait: "",
    comment: shop.memo,
    favorite: false,
    revisit: false,
    scores: Object.fromEntries(scoreFields.map(([key]) => [key, 5])),
  };
  state.wishlistSourceId = shop.id;
  navigate("add", { keepPrefill: true });
}

async function deleteWishlist(event) {
  const id = event.currentTarget.dataset.deleteWishlist;
  const shop = state.wishlist.find(item => item.id === id);
  if (!shop || !confirm(`「${shop.shop}」を行きたい店から削除しますか？`)) return;
  if (cloudActive()) {
    try {
      await window.JiroCloud.deleteWishlist(id);
    } catch (error) {
      showToast(`削除を同期できませんでした：${error.message}`);
      return;
    }
  }
  state.wishlist = state.wishlist.filter(item => item.id !== id);
  await saveWishlist();
  render();
  showToast("行きたい店から削除しました");
}

async function deleteRecord(event) {
  const id = event.currentTarget.dataset.delete;
  if (!confirm("この記録を削除しますか？\nこの操作は取り消せません。")) return;
  const target = state.records.find(record => record.id === id);
  if (cloudActive()) {
    try {
      await window.JiroCloud.deleteRecord(target);
    } catch (error) {
      showToast(`削除を同期できませんでした：${error.message}`);
      return;
    }
  }
  state.records = state.records.filter(record => record.id !== id);
  await saveRecords();
  navigate("list");
  showToast("記録を削除しました");
}

async function imageToDataUrl(source) {
  if (!source || source.startsWith("data:")) return source;
  const response = await fetch(source);
  if (!response.ok) throw new Error("写真を取得できませんでした");
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function backupData() {
  showToast("バックアップを作成しています");
  let records;
  try {
    records = await Promise.all(state.records.map(async record => ({
      ...record,
      photo: await imageToDataUrl(record.photo)
    })));
  } catch (error) {
    showToast(`バックアップできませんでした：${error.message}`);
    return;
  }
  const data = {
    app: "JIRO LOG",
    version: 2,
    exportedAt: new Date().toISOString(),
    records,
    wishlist: state.wishlist,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `jiro-log-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("バックアップを作成しました");
}

restoreInput.addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.records)) throw new Error();
    if (!confirm(`${data.records.length}件の記録と${Array.isArray(data.wishlist) ? data.wishlist.length : 0}件の行きたい店を復元します。\n現在のデータは置き換えられます。`)) return;
    state.records = data.records;
    state.wishlist = Array.isArray(data.wishlist) ? data.wishlist : [];
    await saveRecords();
    await saveWishlist();
    if (cloudActive()) await uploadLocalToCloud(false);
    render();
    showToast("データを復元しました");
  } catch {
    showToast("有効なバックアップではありません");
  } finally {
    restoreInput.value = "";
  }
});

async function clearData() {
  if (!state.records.length && !state.wishlist.length) return showToast("削除するデータがありません");
  if (!confirm(`全${state.records.length}件の記録と${state.wishlist.length}件の行きたい店を削除しますか？\nこの操作は取り消せません。`)) return;
  if (cloudActive()) {
    try {
      for (const record of state.records) await window.JiroCloud.deleteRecord(record);
      for (const shop of state.wishlist) await window.JiroCloud.deleteWishlist(shop.id);
    } catch (error) {
      showToast(`クラウドから削除できませんでした：${error.message}`);
      return;
    }
  }
  state.records = [];
  state.wishlist = [];
  await saveRecords();
  await saveWishlist();
  render();
  showToast("全データを削除しました");
}

async function syncFromCloud(notify = true) {
  if (!cloudActive() || state.syncing) return;
  state.syncing = true;
  render();
  try {
    const cloudData = await window.JiroCloud.fetchAll();
    const cloudIsEmpty = !cloudData.records.length && !cloudData.wishlist.length;
    const localHasData = state.records.length || state.wishlist.length;
    const cloudWasInitialized = localStorage.getItem(CLOUD_READY_KEY) === "true";
    if (cloudIsEmpty && localHasData && !cloudWasInitialized) {
      if (notify) showToast("端末データがあります。「端末データを移行」を押してください");
      return;
    }
    state.records = cloudData.records;
    state.wishlist = cloudData.wishlist;
    localStorage.setItem(CLOUD_READY_KEY, "true");
    await Promise.all([saveRecords(), saveWishlist()]);
    if (notify) showToast("最新データに同期しました");
  } catch (error) {
    showToast(`同期できませんでした：${error.message}`);
  } finally {
    state.syncing = false;
    render();
  }
}

async function uploadLocalToCloud(confirmFirst = true) {
  if (!cloudActive()) return;
  if (confirmFirst && !confirm(`端末内の記録${state.records.length}件と行きたい店${state.wishlist.length}件をクラウドへ移行しますか？`)) return;
  state.syncing = true;
  render();
  try {
    for (let index = 0; index < state.records.length; index += 1) {
      state.records[index] = await window.JiroCloud.saveRecord(state.records[index]);
    }
    for (const shop of state.wishlist) await window.JiroCloud.saveWishlist(shop);
    await Promise.all([saveRecords(), saveWishlist()]);
    const cloudData = await window.JiroCloud.fetchAll();
    state.records = cloudData.records;
    state.wishlist = cloudData.wishlist;
    localStorage.setItem(CLOUD_READY_KEY, "true");
    await Promise.all([saveRecords(), saveWishlist()]);
    showToast("端末データをクラウドへ移行しました");
  } catch (error) {
    showToast(`移行できませんでした：${error.message}`);
  } finally {
    state.syncing = false;
    render();
  }
}

async function init() {
  [state.records, state.wishlist] = await Promise.all([loadRecords(), loadWishlist()]);
  if (cloudConfigured()) {
    await syncFromCloud(false);
  }
  render();
}

init();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}

window.addEventListener("focus", () => {
  if (cloudActive()) syncFromCloud(false);
});
