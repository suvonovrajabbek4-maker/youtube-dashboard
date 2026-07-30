const channelNav = document.getElementById('channel-nav');
const globalSummary = document.getElementById('global-summary');
const statLive = document.getElementById('stat-live');
const statStorage = document.getElementById('stat-storage');
const statUploaded = document.getElementById('stat-uploaded');
const rackCount = document.getElementById('rack-count');
const navChannelCount = document.getElementById('nav-channel-count');
const sidebarStorageBar = document.getElementById('sidebar-storage-bar');
const sidebarStorageLabel = document.getElementById('sidebar-storage-label');

const activeChannelNum = document.getElementById('active-channel-avatar');
const activeChannelName = document.getElementById('active-channel-name');
const renameBtn = document.getElementById('rename-btn');
const liveIndicator = document.getElementById('live-indicator');
const liveIndicatorText = document.getElementById('live-indicator-text');

const storageBar = document.getElementById('storage-bar');
const storageLabel = document.getElementById('storage-label');

const keyDisplay = document.getElementById('key-display');
const keyMasked = document.getElementById('key-masked');
const removeKeyBtn = document.getElementById('remove-key-btn');
const keyFormRow = document.getElementById('key-form-row');
const keyInput = document.getElementById('key-input');
const saveKeyBtn = document.getElementById('save-key-btn');
const keyNote = document.getElementById('key-note');

const fileInput = document.getElementById('file-input');
const fileNameLabel = document.getElementById('file-name');
const uploadBtn = document.getElementById('upload-btn');
const uploadProgressWrap = document.getElementById('upload-progress-wrap');
const uploadProgress = document.getElementById('upload-progress');

const videosList = document.getElementById('videos-list');
const videosEmpty = document.getElementById('videos-empty');

let channels = [];
let activeChannelId = null;
let selectedFile = null;

function formatBytes(bytes) {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return gb.toFixed(2) + ' GB';
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(1) + ' MB';
}

function formatDate(d) {
  const date = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function activeChannel() {
  return channels.find((c) => c.id === activeChannelId);
}

// "ch-7" -> "07" - kanal ID'sidan ikki xonali raqam chiqarish
function channelNumber(id) {
  const n = parseInt(String(id).replace(/[^0-9]/g, ''), 10) || 0;
  return String(n).padStart(2, '0');
}

// Kanal ID'siga qarab har doim bir xil, lekin har xil kanalga turli rangli gradient
const AVATAR_HUES = [262, 210, 340, 25, 165, 190, 45, 280, 5, 150, 235, 305, 90, 320, 15];
function avatarColor(id) {
  const n = parseInt(String(id).replace(/[^0-9]/g, ''), 10) || 0;
  const hue = AVATAR_HUES[n % AVATAR_HUES.length];
  return `background: linear-gradient(145deg, hsl(${hue} 70% 55%), hsl(${hue} 70% 38%)); color: #fff;`;
}

// Oddiy, deterministik sparkline (kanal ID asosida) - dizayn uchun
function sparklinePath(seed, w, h) {
  let s = seed || 1;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const points = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * w;
    const y = h - (0.25 + rand() * 0.6) * h;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return points.join(' ');
}

// ---- Sidebar ----
function renderSidebar() {
  const liveCount = channels.filter((c) => c.live).length;
  globalSummary.textContent = liveCount
    ? `${channels.length} kanal · ${liveCount} tasi efirda`
    : `${channels.length} kanal`;

  channelNav.innerHTML = '';
  for (const c of channels) {
    const statusLabel = c.live ? 'LIVE' : (c.hasKey ? 'READY' : 'OFFLINE');
    const el = document.createElement('div');
    el.className = 'channel-item' + (c.id === activeChannelId ? ' active' : '') + (c.live ? ' is-live' : '');
    el.dataset.id = c.id;
    el.innerHTML = `
      <span class="ch-avatar" style="${avatarColor(c.id)}">${channelNumber(c.id)}</span>
      <span class="ch-name">${c.name}<span class="ch-sub">${c.videoCount} video</span></span>
      <span class="ch-status">${statusLabel}</span>
    `;
    el.addEventListener('click', () => selectChannel(c.id));
    channelNav.appendChild(el);
  }

  renderMasterStats();
  renderKanallarPage();
  renderLivePage();
  renderSaqlashPage();
}

// ---- Kanallar sahifasi (to'liq jadval) ----
const kanallarRows = document.getElementById('kanallar-rows');
const kanallarTotal = document.getElementById('kanallar-total');
const kanallarLiveCount = document.getElementById('kanallar-live-count');

function renderKanallarPage() {
  if (!kanallarRows) return;
  const liveCount = channels.filter((c) => c.live).length;
  kanallarTotal.textContent = String(channels.length);
  kanallarLiveCount.textContent = String(liveCount);

  kanallarRows.innerHTML = '';
  for (const c of channels) {
    const statusKey = c.live ? 'live' : (c.hasKey ? 'ready' : '');
    const statusLabel = c.live ? 'LIVE' : (c.hasKey ? 'READY' : 'OFFLINE');
    const pct = c.storage.limit ? Math.min(100, (c.storage.used / c.storage.limit) * 100) : 0;

    const row = document.createElement('div');
    row.className = 'channel-row';
    row.dataset.id = c.id;
    row.innerHTML = `
      <div class="ch-cell-name">
        <span class="ch-avatar" style="${avatarColor(c.id)}">${channelNumber(c.id)}</span>
        <span class="ch-title">${c.name}<small>${c.hasKey ? 'Stream key qo\'shilgan' : "Stream key yo'q"}</small></span>
      </div>
      <span class="ch-status-pill ${statusKey}">${statusLabel}</span>
      <span class="ch-dim">${c.videoCount} ta</span>
      <div class="ch-storage-cell">
        <span class="ch-storage-label">${formatBytes(c.storage.used)} / ${formatBytes(c.storage.limit)}</span>
        <div class="vu-meter thin"><div class="vu-meter-fill" style="width:${pct.toFixed(1)}%"></div></div>
      </div>
      <span class="ch-dim">${c.live ? '●' : '—'}</span>
      <span class="ch-dim">—</span>
      <button class="ch-action-btn" data-goto="${c.id}">Ochish →</button>
    `;
    row.addEventListener('click', () => goToChannelOverview(c.id));
    kanallarRows.appendChild(row);
  }
}

function goToChannelOverview(id) {
  const overviewNavBtn = document.querySelector('.nav-item[data-page="overview"]');
  if (overviewNavBtn) overviewNavBtn.click();
  selectChannel(id);
}

// ---- Live Streamlar sahifasi ----
const livePageList = document.getElementById('live-page-list');
const livePageEmpty = document.getElementById('live-page-empty');
const livePageCount = document.getElementById('live-page-count');

function formatDuration(startedAt) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function renderLivePage() {
  if (!livePageList) return;
  const liveChannels = channels.filter((c) => c.live);
  livePageCount.textContent = String(liveChannels.length);
  livePageEmpty.style.display = liveChannels.length ? 'none' : 'flex';

  livePageList.innerHTML = '';
  for (const c of liveChannels) {
    const card = document.createElement('div');
    card.className = 'live-card';
    card.innerHTML = `
      <div class="live-card-head">
        <span class="ch-avatar" style="${avatarColor(c.id)}">${channelNumber(c.id)}</span>
        <span class="live-card-name">${c.name}</span>
        <span class="live-badge-pill">● LIVE</span>
      </div>
      <div class="live-card-video">Efirda: <b>${c.live.video}</b></div>
      <div class="live-card-meta">
        <span>Davomiyligi: ${formatDuration(c.live.startedAt)}</span>
        <span>${formatBytes(c.storage.used)} / ${formatBytes(c.storage.limit)}</span>
      </div>
      <div class="live-card-actions">
        <button class="btn btn-ghost btn-small" data-open="${c.id}">Ochish</button>
        <button class="btn btn-red btn-small" data-stop="${c.id}">To'xtatish</button>
      </div>
    `;
    livePageList.appendChild(card);
  }
}

if (livePageList) {
  livePageList.addEventListener('click', async (e) => {
    const openBtn = e.target.closest('[data-open]');
    const stopBtn = e.target.closest('[data-stop]');
    if (openBtn) {
      goToChannelOverview(openBtn.dataset.open);
      return;
    }
    if (stopBtn) {
      stopBtn.disabled = true;
      await fetch(`/api/channels/${stopBtn.dataset.stop}/stream/stop`, { method: 'POST' });
      await refreshChannels(true);
      if (activeChannelId === stopBtn.dataset.stop) await refreshVideos();
    }
  });
}

// ---- Saqlash sahifasi ----
const saqlashRows = document.getElementById('saqlash-rows');

function renderSaqlashPage() {
  if (!saqlashRows) return;
  const totalUsed = channels.reduce((sum, c) => sum + c.storage.used, 0);
  const totalLimit = channels.reduce((sum, c) => sum + c.storage.limit, 0);
  const totalVideos = channels.reduce((sum, c) => sum + c.videoCount, 0);
  const top = [...channels].sort((a, b) => b.storage.used - a.storage.used)[0];

  document.getElementById('saqlash-total-used').textContent = formatBytes(totalUsed);
  document.getElementById('saqlash-total-limit').textContent = formatBytes(totalLimit);
  document.getElementById('saqlash-total-videos').textContent = String(totalVideos);
  document.getElementById('saqlash-top-channel').textContent = top && top.storage.used > 0 ? top.name : '—';

  const sorted = [...channels].sort((a, b) => b.storage.used - a.storage.used);
  saqlashRows.innerHTML = '';
  for (const c of sorted) {
    const pct = c.storage.limit ? Math.min(100, (c.storage.used / c.storage.limit) * 100) : 0;
    const row = document.createElement('div');
    row.className = 'saqlash-row';
    row.innerHTML = `
      <span>${c.name}</span>
      <div class="sr-bar-wrap">
        <span class="sr-bar-label">${formatBytes(c.storage.used)} / ${formatBytes(c.storage.limit)}</span>
        <div class="vu-meter thin"><div class="vu-meter-fill" style="width:${pct.toFixed(1)}%"></div></div>
      </div>
      <span class="ch-dim">${pct.toFixed(1)}%</span>
      <span class="ch-dim">${c.videoCount} ta</span>
    `;
    saqlashRows.appendChild(row);
  }
}

// ---- Videolar (global) sahifasi ----
const videolarRows = document.getElementById('videolar-rows');
const videolarTotal = document.getElementById('videolar-total');
const videolarEmpty = document.getElementById('videolar-empty');
const videolarRefreshBtn = document.getElementById('videolar-refresh');

async function renderVideolarGlobalPage() {
  if (!videolarRows) return;
  videolarRows.innerHTML = '<div class="module-note" style="padding:16px;">Yuklanmoqda…</div>';

  const results = await Promise.all(
    channels.map(async (c) => {
      try {
        const res = await fetch(`/api/channels/${c.id}/videos`);
        const vids = await res.json();
        return vids.map((v) => ({ ...v, channelId: c.id, channelName: c.name }));
      } catch {
        return [];
      }
    })
  );

  const all = results.flat().sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  videolarTotal.textContent = String(all.length);
  videolarRows.innerHTML = '';
  videolarEmpty.style.display = all.length ? 'none' : 'block';

  for (const v of all) {
    const row = document.createElement('div');
    row.className = 'video-row-g';
    const dateStr = new Date(v.uploadedAt).toLocaleDateString('uz-UZ');
    row.innerHTML = `
      <span class="vg-name">${v.name}</span>
      <span class="vg-dim">${v.channelName}</span>
      <span class="vg-dim">${formatBytes(v.size)}</span>
      <span class="vg-dim">${dateStr}</span>
      <span class="badge ${v.live ? 'live' : ''}">${v.live ? 'LIVE' : 'READY'}</span>
      <button class="vg-open" data-goto="${v.channelId}">Ochish →</button>
    `;
    videolarRows.appendChild(row);
  }
}

if (videolarRows) {
  videolarRows.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-goto]');
    if (btn) goToChannelOverview(btn.dataset.goto);
  });
}
if (videolarRefreshBtn) videolarRefreshBtn.addEventListener('click', renderVideolarGlobalPage);

// ---- Master status bar / stat cards totals ----
function renderMasterStats() {
  // Sidebar'dagi umumiy xotira widjeti - bu har doim TIZIM bo'yicha (barcha kanallar)
  const totalUsed = channels.reduce((sum, c) => sum + c.storage.used, 0);
  const totalLimit = channels.reduce((sum, c) => sum + c.storage.limit, 0);
  if (rackCount) rackCount.textContent = String(channels.length);
  if (navChannelCount) navChannelCount.textContent = String(channels.length);
  if (sidebarStorageBar && sidebarStorageLabel) {
    const pct = totalLimit ? Math.min(100, (totalUsed / totalLimit) * 100) : 0;
    sidebarStorageBar.style.width = pct.toFixed(1) + '%';
    sidebarStorageLabel.textContent = `${formatBytes(totalUsed)} / ${formatBytes(totalLimit)}`;
  }

  // Yuqoridagi statistik kartalar - FAQAT hozir tanlangan kanal uchun
  const c = activeChannel();
  const nameEl = document.getElementById('stats-channel-name');
  if (nameEl) nameEl.textContent = c ? c.name : '—';

  const liveTrend = document.getElementById('stat-live-trend');
  if (statLive) {
    statLive.textContent = c && c.live ? 'LIVE' : 'OFFLINE';
    statLive.classList.toggle('has-live', !!(c && c.live));
  }
  if (liveTrend) {
    liveTrend.textContent = c && c.live ? '● efirda' : 'efirda emas';
    liveTrend.classList.toggle('on-air', !!(c && c.live));
  }

  if (c && statStorage) {
    statStorage.textContent = `${formatBytes(c.storage.used)} / ${formatBytes(c.storage.limit)}`;
  }
  if (c && statUploaded) {
    statUploaded.textContent = String(c.videoCount);
  }
}

function selectChannel(id) {
  activeChannelId = id;
  renderSidebar();
  renderChannelHeader();
  refreshVideos();
  const deckEl = document.querySelector('.deck');
  if (deckEl) {
    deckEl.classList.remove('deck-swap');
    void deckEl.offsetWidth;
    deckEl.classList.add('deck-swap');
  }
}

// ---- Header ----
function renderChannelHeader() {
  const c = activeChannel();
  if (!c) return;
  activeChannelNum.textContent = channelNumber(c.id);
  activeChannelNum.style = avatarColor(c.id);
  activeChannelName.textContent = c.name;

  if (c.live) {
    liveIndicator.classList.add('on');
    liveIndicatorText.textContent = `Efirda: ${c.live.video}`;
  } else {
    liveIndicator.classList.remove('on');
    liveIndicatorText.textContent = 'Efirda emas';
  }

  const pct = Math.min(100, (c.storage.used / c.storage.limit) * 100);
  storageBar.style.width = pct.toFixed(1) + '%';
  storageLabel.textContent = `${formatBytes(c.storage.used)} / ${formatBytes(c.storage.limit)} (${pct.toFixed(0)}%)`;

  if (c.hasKey) {
    keyDisplay.style.display = 'flex';
    keyFormRow.style.display = 'none';
    keyMasked.textContent = c.maskedKey;
    keyNote.textContent = "Boshqa key qo'yish uchun avval o'chiring.";
  } else {
    keyDisplay.style.display = 'none';
    keyFormRow.style.display = 'flex';
    keyNote.textContent = 'Bu kanal uchun hali stream key kiritilmagan.';
  }
}

// ---- Load all channels ----
async function refreshChannels(keepSelection) {
  const res = await fetch('/api/channels');
  channels = await res.json();
  if (!keepSelection || !activeChannelId) {
    activeChannelId = channels[0] ? channels[0].id : null;
  }
  renderSidebar();
  renderChannelHeader();
}

// ---- Videos ----
async function refreshVideos() {
  const c = activeChannel();
  if (!c) return;
  const res = await fetch(`/api/channels/${c.id}/videos`);
  const videos = await res.json();
  videosList.innerHTML = '';
  videosEmpty.style.display = videos.length ? 'none' : 'block';

  for (const [i, v] of videos.entries()) {
    const el = document.createElement('div');
    el.className = 'video-item';
    el.innerHTML = `
      <span class="row-num">${String(i + 1).padStart(2, '0')}</span>
      <div class="video-info">
        <div class="name">${v.name}</div>
        <div class="meta">
          <span>${formatBytes(v.size)}</span>
          <span>·</span>
          <span>${formatDate(v.uploadedAt)}</span>
          ${v.live ? '<span class="badge live">Efirda</span>' : '<span class="badge">Efirda emas</span>'}
        </div>
      </div>
      <div class="video-actions">
        ${
          v.live
            ? `<button class="btn btn-red btn-small" data-action="stop">To'xtatish</button>`
            : `<button class="btn btn-primary btn-small" data-action="start" data-name="${v.name}">Efirga uzatish</button>`
        }
        <button class="btn btn-ghost btn-small" data-action="delete" data-name="${v.name}">O'chirish</button>
      </div>
    `;
    videosList.appendChild(el);
  }
}

videosList.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const c = activeChannel();
  if (!c) return;
  const { action, name } = btn.dataset;

  if (action === 'delete') {
    if (!confirm(`"${name}" o'chirilsinmi? (Efirda bo'lsa, to'xtatiladi)`)) return;
    await fetch(`/api/channels/${c.id}/videos/${encodeURIComponent(name)}`, { method: 'DELETE' });
    await refreshChannels(true);
    await refreshVideos();
  }

  if (action === 'stop') {
    btn.disabled = true;
    await fetch(`/api/channels/${c.id}/stream/stop`, { method: 'POST' });
    await refreshChannels(true);
    await refreshVideos();
  }

  if (action === 'start') {
    if (!c.hasKey) {
      alert("Avval shu kanal uchun YouTube stream key qo'shing.");
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Boshlanmoqda...';
    const res = await fetch(`/api/channels/${c.id}/stream/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video: name }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Xatolik yuz berdi');
    }
    await refreshChannels(true);
    await refreshVideos();
  }
});

// ---- Rename ----
renameBtn.addEventListener('click', async () => {
  const c = activeChannel();
  if (!c) return;
  const name = prompt('Kanal nomi:', c.name);
  if (!name || !name.trim() || name.trim() === c.name) return;
  const res = await fetch(`/api/channels/${c.id}/name`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() }),
  });
  if (res.ok) {
    await refreshChannels(true);
  } else {
    const err = await res.json();
    alert(err.error || "O'zgartirib bo'lmadi");
  }
});

// ---- Stream key ----
saveKeyBtn.addEventListener('click', async () => {
  const c = activeChannel();
  if (!c) return;
  const key = keyInput.value.trim();
  if (!key) return;
  const res = await fetch(`/api/channels/${c.id}/key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  if (res.ok) {
    keyInput.value = '';
    await refreshChannels(true);
  } else {
    const err = await res.json();
    alert(err.error || "Qo'shib bo'lmadi");
  }
});

removeKeyBtn.addEventListener('click', async () => {
  const c = activeChannel();
  if (!c) return;
  if (!confirm("Ushbu kanalning stream key'i o'chirilsinmi? (Efirda bo'lsa, to'xtaydi)")) return;
  await fetch(`/api/channels/${c.id}/key`, { method: 'DELETE' });
  await refreshChannels(true);
  await refreshVideos();
});

// ---- Upload ----
fileInput.addEventListener('change', () => {
  selectedFile = fileInput.files[0] || null;
  fileNameLabel.textContent = selectedFile ? selectedFile.name : 'Fayl tanlanmagan';
});

uploadBtn.addEventListener('click', () => {
  const c = activeChannel();
  if (!c) return;
  if (!selectedFile) {
    alert('Avval fayl tanlang.');
    return;
  }
  uploadBtn.disabled = true;
  uploadProgressWrap.style.display = 'block';
  uploadProgress.style.width = '0%';

  const xhr = new XMLHttpRequest();
  xhr.open('POST', `/api/channels/${c.id}/upload?name=` + encodeURIComponent(selectedFile.name));

  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      const pct = (e.loaded / e.total) * 100;
      uploadProgress.style.width = pct.toFixed(1) + '%';
    }
  });

  xhr.onload = async () => {
    uploadBtn.disabled = false;
    uploadProgressWrap.style.display = 'none';
    if (xhr.status === 200) {
      selectedFile = null;
      fileInput.value = '';
      fileNameLabel.textContent = 'Fayl tanlanmagan';
      await refreshChannels(true);
      await refreshVideos();
    } else {
      try {
        const err = JSON.parse(xhr.responseText);
        alert(err.error || 'Yuklashda xatolik');
      } catch {
        alert('Yuklashda xatolik');
      }
    }
  };

  xhr.onerror = () => {
    uploadBtn.disabled = false;
    uploadProgressWrap.style.display = 'none';
    alert('Tarmoq xatoligi');
  };

  xhr.send(selectedFile);
});

// ---- Mobil hamburger menyu ----
const navToggle = document.getElementById('nav-toggle');
const shellEl = document.querySelector('.shell');
if (navToggle && shellEl) {
  navToggle.addEventListener('click', () => shellEl.classList.toggle('nav-open'));
  shellEl.addEventListener('click', (e) => {
    if (shellEl.classList.contains('nav-open') && !e.target.closest('.sidenav') && !e.target.closest('.nav-toggle')) {
      shellEl.classList.remove('nav-open');
    }
  });
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => shellEl.classList.remove('nav-open'));
  });
}

// ---- Sidenav: sahifalarni almashtirish ----
const pageTitles = {
  overview: ['Boshqaruv Markazi', '15 ta kanal boshqaruvi'],
  kanallar: ['Kanallar', 'Barcha kanallar ro\'yxati'],
  live: ['Live Streamlar', 'Hozir efirdagi kanallar'],
  videolar: ['Videolar', 'Barcha kanallardagi videolar kutubxonasi'],
  analytics: ['Analytics', 'Umumiy statistikalar'],
  playlistlar: ['Playlistlar', 'Kanallar bo\'yicha playlistlar'],
  saqlash: ['Saqlash', 'Xotira taqsimoti'],
  daromad: ['Daromad', 'Monetizatsiya hisobotlari'],
  sozlamalar: ['Sozlamalar', 'Tizim sozlamalari'],
  foydalanuvchilar: ['Foydalanuvchilar', 'Admin va operatorlar'],
};

const pageTitleEl = document.getElementById('page-title');
const pageSubtitleEl = document.getElementById('page-subtitle');

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.page;
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    const target = document.getElementById(`page-${key}`);
    if (target) target.classList.add('active');

    const meta = pageTitles[key];
    if (meta) {
      pageTitleEl.textContent = meta[0];
      pageSubtitleEl.textContent = meta[1];
    }

    if (key === 'videolar') renderVideolarGlobalPage();
    if (key !== 'overview') stopLiveStatsPolling();
  });
});

// ---- Deck tabs (kanal sahifasi ichidagi Videolar/Live Stream/Analytics...) ----
document.querySelectorAll('.deck-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.tab;
    document.querySelectorAll('.deck-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    document.querySelectorAll('.tab-content').forEach((t) => t.classList.remove('active'));
    const target = document.getElementById(`tab-content-${key}`);
    if (target) target.classList.add('active');

    if (key === 'livestream') startLiveStatsPolling();
    else stopLiveStatsPolling();
  });
});

// ---- Live Stream tab: real bitrate/fps/dropped frames (ffmpeg'dan) ----
let liveStatsTimer = null;
const lsOffline = document.getElementById('livestream-offline');
const lsOnline = document.getElementById('livestream-online');
const lsConnection = document.getElementById('ls-connection');
const lsBitrate = document.getElementById('ls-bitrate');
const lsFps = document.getElementById('ls-fps');
const lsDropped = document.getElementById('ls-dropped');
const lsSpeed = document.getElementById('ls-speed');
const lsDuration = document.getElementById('ls-duration');
const lsUpdated = document.getElementById('ls-updated');

async function pollLiveStats() {
  if (!activeChannelId) return;
  try {
    const res = await fetch(`/api/channels/${activeChannelId}/live-stats`);
    const data = await res.json();
    renderLiveStats(data);
  } catch {
    /* jimgina o'tkazib yuboramiz - keyingi tikda qayta urinamiz */
  }
}

function renderLiveStats(data) {
  if (!lsOffline || !lsOnline) return;
  if (!data.live) {
    lsOffline.style.display = 'flex';
    lsOnline.style.display = 'none';
    return;
  }
  lsOffline.style.display = 'none';
  lsOnline.style.display = 'block';

  lsDuration.textContent = formatDuration(data.startedAt);

  const s = data.stats;
  if (!s) {
    lsConnection.textContent = 'Ulanmoqda…';
    lsConnection.className = 'ls-card-value';
    lsBitrate.textContent = '—';
    lsFps.textContent = '—';
    lsDropped.textContent = '—';
    lsSpeed.textContent = '—';
    lsUpdated.textContent = 'Birinchi ma\'lumot kutilmoqda…';
    return;
  }

  lsBitrate.textContent = `${s.bitrateKbps.toFixed(0)} kb/s`;
  lsFps.textContent = s.fps.toFixed(0);
  lsDropped.textContent = String(s.dropped);
  lsSpeed.textContent = `${s.speed.toFixed(2)}x`;

  let quality = 'Excellent', cls = 'ok';
  if (s.dropped > 20 || s.speed < 0.85) { quality = 'Poor'; cls = 'bad'; }
  else if (s.dropped > 0 || s.speed < 0.97) { quality = 'Good'; cls = 'warn'; }
  lsConnection.textContent = quality;
  lsConnection.className = 'ls-card-value ' + cls;

  const secAgo = Math.max(0, Math.floor((Date.now() - new Date(s.updatedAt).getTime()) / 1000));
  lsUpdated.textContent = `Oxirgi yangilanish: ${secAgo} soniya oldin`;
}

function startLiveStatsPolling() {
  stopLiveStatsPolling();
  pollLiveStats();
  liveStatsTimer = setInterval(pollLiveStats, 3000);
}

function stopLiveStatsPolling() {
  if (liveStatsTimer) { clearInterval(liveStatsTimer); liveStatsTimer = null; }
}

// ---- Init ----
async function init() {
  await refreshChannels(false);
  await refreshVideos();
}
init();

// Holatni davriy yangilab turish (bir nechta kanal parallel efirda bo'lishi mumkin)
setInterval(async () => {
  await refreshChannels(true);
  await refreshVideos();
}, 8000);
