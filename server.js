// YouTube 24/7 Stream Dashboard - server.js
// Faqat Node.js o'zi bilan ishlaydi, hech qanday npm install shart emas.
// 15 ta mustaqil kanal: har birining o'z videolari, o'z stream key'i,
// o'z 50GB xotira limiti va o'z efir holati bor.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const VIDEOS_DIR = path.join(ROOT, 'videos');
const DATA_DIR = path.join(ROOT, 'data');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');

const CHANNEL_COUNT = 15;
const STORAGE_LIMIT_PER_CHANNEL = 50 * 1024 * 1024 * 1024; // har bir kanal uchun 50 GB
const ALLOWED_EXT = ['.mp4', '.mov', '.mkv', '.avi', '.webm'];

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true });

// ---- Kanallarni boshlang'ich holatga keltirish ----
function defaultChannels() {
  const list = [];
  for (let i = 1; i <= CHANNEL_COUNT; i++) {
    list.push({
      id: `ch-${i}`,
      name: `Kanal ${i}`,
      key: null, // stream key hali qo'yilmagan
      createdAt: new Date().toISOString(),
    });
  }
  return list;
}

function readChannels() {
  try {
    const list = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf8'));
    if (Array.isArray(list) && list.length) return list;
    return defaultChannels();
  } catch {
    return defaultChannels();
  }
}

function writeChannels(list) {
  fs.writeFileSync(CHANNELS_FILE, JSON.stringify(list, null, 2));
}

if (!fs.existsSync(CHANNELS_FILE)) {
  writeChannels(defaultChannels());
}

// Har bir kanal uchun alohida videos/ch-N papkasi
function channelDir(channelId) {
  const dir = path.join(VIDEOS_DIR, channelId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ---- Streaming holati: channelId -> { live, video, startedAt, process } ----
const streams = {};
// Har bir kanal uchun ffmpeg'dan real vaqtda o'qilgan efir statistikasi
// (bitrate, fps, dropped frames) - faqat operativ xotirada, diskka yozilmaydi.
const liveStats = {};

// ---- Avtomatik qayta ulanish uchun rejalashtirilgan timerlar: channelId -> Timeout ----
// Bu alohida saqlanadi, chunki ffmpeg to'xtaganda streams[channelId] allaqachon
// o'chirib yuborilgan bo'ladi - lekin "10 soniyadan keyin qayta urinish" rejasi
// hali ham amalga oshishi mumkin (agar foydalanuvchi shu orada "To'xtatish"
// bossa yoki boshqa videoni qo'lda ishga tushirsa, buni bekor qilish uchun
// ushbu timer'ga murojaat qilinadi).
const reconnectTimers = {};

function cancelReconnect(channelId) {
  if (reconnectTimers[channelId]) {
    clearTimeout(reconnectTimers[channelId]);
    delete reconnectTimers[channelId];
  }
}

// ---- Yordamchi funksiyalar ----
function maskKey(key) {
  if (!key) return null;
  if (key.length <= 8) return '*'.repeat(key.length);
  return key.slice(0, 4) + '***' + key.slice(-4);
}

function getDirSize(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const f of fs.readdirSync(dir)) {
    if (f === '.gitkeep') continue;
    const stat = fs.statSync(path.join(dir, f));
    if (stat.isFile()) total += stat.size;
  }
  return total;
}

function safeFileName(name) {
  return path.basename(name).replace(/[^a-zA-Z0-9._\-]/g, '_');
}

function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function findChannel(channels, id) {
  return channels.find((c) => c.id === id);
}

function stopStreamForChannel(channelId) {
  cancelReconnect(channelId); // avvalgi avtomatik-qayta-ulanish rejasi bo'lsa, bekor qilinadi
  const s = streams[channelId];
  if (s && s.process) {
    try {
      s.process.kill('SIGTERM');
    } catch (e) {
      /* ignore */
    }
  }
  delete streams[channelId];
}

function stopAllStreams() {
  for (const channelId of Object.keys(streams)) stopStreamForChannel(channelId);
}

// Windows'da ffmpeg jarayoni SIGTERM olgandan keyin ham faylni darhol
// "bo'shatib" ulgurmasligi mumkin (fayl hali "band" holatda qoladi va
// EBUSY/EPERM xatoligi bilan o'chmaydi). Shu sabab, bir martalik urinish
// o'rniga bir necha marta, kichik kutish bilan qayta urinamiz.
function unlinkWithRetry(filePath, attemptsLeft, delayMs, callback) {
  fs.unlink(filePath, (err) => {
    if (!err || err.code === 'ENOENT') {
      // Muvaffaqiyatli o'chdi, yoki fayl allaqachon yo'q - ikkalasi ham "OK"
      return callback(null);
    }
    if ((err.code === 'EBUSY' || err.code === 'EPERM') && attemptsLeft > 0) {
      setTimeout(() => unlinkWithRetry(filePath, attemptsLeft - 1, delayMs, callback), delayMs);
      return;
    }
    callback(err);
  });
}

// Telefonda tushirilgan vertikal videolarda "aylanish" (rotation) metadatasi
// bo'ladi. Ba'zi hollarda FFmpeg buni RTMP orqali uzatishda to'g'ri qo'llamaydi
// va video yon tarafga aylanib chiqadi. Shuning uchun avval ffprobe orqali
// videoning haqiqiy burilishini o'qib, kerak bo'lsa uni pikselga "yopishtirib"
// (bake qilib) qo'yamiz.
function getRotationFilter(videoPath) {
  return new Promise((resolve) => {
    const probe = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream_side_data=rotation:stream_tags=rotate',
      '-of', 'json',
      videoPath,
    ]);

    let out = '';
    probe.stdout.on('data', (d) => (out += d));
    probe.on('error', () => resolve(null)); // ffprobe topilmasa, filtersiz davom etamiz
    probe.on('exit', () => {
      try {
        const data = JSON.parse(out);
        const stream = (data.streams && data.streams[0]) || {};
        let rotation = 0;

        const sideData = (stream.side_data_list || []).find((s) => typeof s.rotation === 'number');
        if (sideData) {
          rotation = sideData.rotation;
        } else if (stream.tags && stream.tags.rotate) {
          rotation = parseInt(stream.tags.rotate, 10) || 0;
        }

        const angle = ((rotation % 360) + 360) % 360;
        let filter = null;
        if (angle === 90) filter = 'transpose=2';
        else if (angle === 270) filter = 'transpose=1';
        else if (angle === 180) filter = 'hflip,vflip';

        resolve(filter);
      } catch (e) {
        resolve(null);
      }
    });
  });
}

async function startStreamForChannel(channelId, videoName, streamKeyValue) {
  const videoPath = path.join(channelDir(channelId), videoName);
  if (!fs.existsSync(videoPath)) {
    throw new Error('Video topilmadi');
  }
  stopStreamForChannel(channelId); // shu kanalning eski streamini to'xtatish (boshqa kanallarga tegmaydi)

  const rtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKeyValue}`;
  const rotationFilter = await getRotationFilter(videoPath);

  // Har doim: (1) kerak bo'lsa burishni tuzatamiz, (2) o'lchamni libx264 uchun
  // juft songa tushiramiz va uzun tomonini 1280px bilan cheklaymiz - bu ham
  // "buzilib ko'rinish" xatosining oldini oladi, ham internetga kam yuklama beradi.
  const filters = [];
  if (rotationFilter) filters.push(rotationFilter);
  filters.push("scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'");

  const args = [
    '-re',
    '-stream_loop', '-1',
    '-i', videoPath,
    '-vf', filters.join(','),
  ];

  if (rotationFilter) {
    args.push('-metadata:s:v:0', 'rotate=0');
  }

  args.push(
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-b:v', '2000k',
    '-maxrate', '2000k',
    '-bufsize', '4000k',
    '-pix_fmt', 'yuv420p',
    '-g', '60',
    '-r', '30',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-f', 'flv',
    rtmpUrl,
  );

  const proc = spawn('ffmpeg', args, { windowsHide: true });

  // ffmpeg stderr'ida davriy ravishda "frame=... fps=... bitrate=... drop=..."
  // ko'rinishidagi progress qatorlari chiqadi - shundan real statistikani o'qiymiz.
  const progressRe = /frame=\s*(\d+)\s+fps=\s*([\d.]+)\s+q=\S+\s+(?:size|Lsize)=\s*(\S+)\s+time=(\S+)\s+bitrate=\s*(\S+)\s+speed=\s*(\S+)x?(?:.*?dup=(\d+))?(?:.*?drop=(\d+))?/;

  proc.stderr.on('data', (d) => {
    const text = d.toString();
    process.stdout.write(`[ffmpeg:${channelId}] ${text}`);

    const lines = text.split(/\r|\n/);
    for (const line of lines) {
      const m = line.match(progressRe);
      if (m) {
        liveStats[channelId] = {
          frame: parseInt(m[1], 10) || 0,
          fps: parseFloat(m[2]) || 0,
          bitrateKbps: parseFloat(m[5]) || 0,
          speed: parseFloat(m[6]) || 0,
          dropped: parseInt(m[8], 10) || 0,
          updatedAt: new Date().toISOString(),
        };
      }
    }
  });

  proc.on('exit', (code) => {
    console.log(`[ffmpeg:${channelId}] to'xtadi, kod: ${code}`);
    delete liveStats[channelId];
    const current = streams[channelId];
    if (current && current.process === proc) {
      const wasLive = current.live;
      delete streams[channelId];
      if (wasLive) {
        console.log(`[${channelId}] 10 soniyadan keyin qayta urinilmoqda...`);
        reconnectTimers[channelId] = setTimeout(() => {
          delete reconnectTimers[channelId];
          startStreamForChannel(channelId, videoName, streamKeyValue).catch((e) => {
            console.log(`[${channelId}] Qayta ishga tushmadi:`, e.message);
          });
        }, 10000);
      }
    }
  });

  streams[channelId] = {
    live: true,
    video: videoName,
    startedAt: new Date().toISOString(),
    process: proc,
  };
}

// ---- Statik fayllarni uzatish ----
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
};

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.end(content);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function channelSummary(c) {
  const dir = channelDir(c.id);
  const used = getDirSize(dir);
  const s = streams[c.id];
  const files = fs.readdirSync(dir).filter((f) => f !== '.gitkeep');
  return {
    id: c.id,
    name: c.name,
    hasKey: !!c.key,
    maskedKey: maskKey(c.key),
    storage: { used, limit: STORAGE_LIMIT_PER_CHANNEL },
    videoCount: files.length,
    live: s ? { video: s.video, startedAt: s.startedAt } : null,
  };
}

// ---- API ishlovchilar ----
const server = http.createServer((req, res) => {
  (async () => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // GET /api/channels - barcha 15 kanalning umumiy holati
    if (pathname === '/api/channels' && req.method === 'GET') {
      const channels = readChannels();
      return sendJSON(res, 200, channels.map(channelSummary));
    }

    // PUT /api/channels/:id  { name }  - kanal nomini o'zgartirish
    const nameMatch = pathname.match(/^\/api\/channels\/([^/]+)\/name$/);
    if (nameMatch && req.method === 'PUT') {
      const channels = readChannels();
      const c = findChannel(channels, nameMatch[1]);
      if (!c) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Kanal topilmadi' })); }
      try {
        const { name } = JSON.parse(await readBody(req));
        if (!name || !name.trim()) { res.writeHead(400); return res.end(JSON.stringify({ error: "Nom bo'sh bo'lmasin" })); }
        c.name = name.trim().slice(0, 60);
        writeChannels(channels);
        return sendJSON(res, 200, channelSummary(c));
      } catch (e) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: "Noto'g'ri so'rov" }));
      }
    }

    // POST /api/channels/:id/key  { key }  - stream key qo'shish / yangilash
    const keyMatch = pathname.match(/^\/api\/channels\/([^/]+)\/key$/);
    if (keyMatch && req.method === 'POST') {
      const channels = readChannels();
      const c = findChannel(channels, keyMatch[1]);
      if (!c) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Kanal topilmadi' })); }
      try {
        const { key } = JSON.parse(await readBody(req));
        if (!key || typeof key !== 'string' || key.trim().length < 4) {
          res.writeHead(400);
          return res.end(JSON.stringify({ error: "Noto'g'ri stream key" }));
        }
        c.key = key.trim();
        writeChannels(channels);
        return sendJSON(res, 200, channelSummary(c));
      } catch (e) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: "Noto'g'ri so'rov" }));
      }
    }

    // DELETE /api/channels/:id/key - stream key'ni o'chirish
    if (keyMatch && req.method === 'DELETE') {
      const channels = readChannels();
      const c = findChannel(channels, keyMatch[1]);
      if (!c) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Kanal topilmadi' })); }
      stopStreamForChannel(c.id);
      c.key = null;
      writeChannels(channels);
      return sendJSON(res, 200, channelSummary(c));
    }

    // GET /api/channels/:id/videos
    const videosMatch = pathname.match(/^\/api\/channels\/([^/]+)\/videos$/);
    if (videosMatch && req.method === 'GET') {
      const channels = readChannels();
      const c = findChannel(channels, videosMatch[1]);
      if (!c) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Kanal topilmadi' })); }
      const dir = channelDir(c.id);
      const s = streams[c.id];
      const files = fs.readdirSync(dir).filter((f) => f !== '.gitkeep');
      const videos = files.map((f) => {
        const stat = fs.statSync(path.join(dir, f));
        return {
          name: f,
          size: stat.size,
          uploadedAt: stat.mtime,
          live: !!(s && s.live && s.video === f),
        };
      });
      return sendJSON(res, 200, videos);
    }

    // POST /api/channels/:id/upload?name=xxx.mp4
    const uploadMatch = pathname.match(/^\/api\/channels\/([^/]+)\/upload$/);
    if (uploadMatch && req.method === 'POST') {
      const channels = readChannels();
      const c = findChannel(channels, uploadMatch[1]);
      if (!c) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Kanal topilmadi' })); }

      const rawName = url.searchParams.get('name') || 'video.mp4';
      const ext = path.extname(rawName).toLowerCase();
      if (!ALLOWED_EXT.includes(ext)) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Ruxsat etilmagan format' }));
      }
      const name = safeFileName(rawName);
      const dir = channelDir(c.id);
      const contentLength = parseInt(req.headers['content-length'] || '0', 10);
      const used = getDirSize(dir);

      if (used + contentLength > STORAGE_LIMIT_PER_CHANNEL) {
        res.writeHead(413);
        return res.end(JSON.stringify({ error: 'Ushbu kanal uchun xotira limiti (50GB) dan oshib ketadi' }));
      }

      // Hozir efirga uzatilayotgan video bilan bir xil nomdagi faylni ustidan
      // yozishga yo'l qo'ymaymiz - aks holda ffmpeg diskdan aylanib o'qiyotgan
      // fayl birdaniga almashtirilib, efir buziladi yoki to'xtab qoladi.
      const liveStream = streams[c.id];
      if (liveStream && liveStream.live && liveStream.video === name) {
        res.writeHead(409);
        return res.end(JSON.stringify({ error: "Bu video hozir efirda - avval to'xtating, keyin qayta yuklang" }));
      }

      const destPath = path.join(dir, name);
      const writeStream = fs.createWriteStream(destPath);
      req.pipe(writeStream);

      req.on('aborted', () => {
        writeStream.destroy();
        fs.unlink(destPath, () => {});
      });

      writeStream.on('finish', () => {
        sendJSON(res, 200, { ok: true, name });
      });

      writeStream.on('error', (err) => {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      });
      return;
    }

    // DELETE /api/channels/:id/videos/:name
    const delVideoMatch = pathname.match(/^\/api\/channels\/([^/]+)\/videos\/(.+)$/);
    if (delVideoMatch && req.method === 'DELETE') {
      const channels = readChannels();
      const c = findChannel(channels, delVideoMatch[1]);
      if (!c) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Kanal topilmadi' })); }
      const name = decodeURIComponent(delVideoMatch[2]);
      const dir = channelDir(c.id);
      const filePath = path.join(dir, safeFileName(name));

      const s = streams[c.id];
      const wasLive = !!(s && s.video === name);
      if (wasLive) stopStreamForChannel(c.id);

      // Agar shu video hozirgina efirda bo'lgan bo'lsa, ffmpeg jarayoni faylni
      // to'liq bo'shatishi uchun bir necha marta (jami ~1 soniya) qayta urinamiz.
      const attempts = wasLive ? 5 : 1;
      unlinkWithRetry(filePath, attempts, 200, (err) => {
        if (err) {
          res.writeHead(err.code === 'ENOENT' ? 404 : 500);
          return res.end(JSON.stringify({ error: err.code === 'ENOENT' ? 'Topilmadi' : "Fayl hozircha band, birozdan so'ng qayta urinib ko'ring" }));
        }
        sendJSON(res, 200, { ok: true });
      });
      return;
    }

    // POST /api/channels/:id/stream/start  { video }
    const startMatch = pathname.match(/^\/api\/channels\/([^/]+)\/stream\/start$/);
    if (startMatch && req.method === 'POST') {
      const channels = readChannels();
      const c = findChannel(channels, startMatch[1]);
      if (!c) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Kanal topilmadi' })); }
      if (!c.key) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: "Avval shu kanal uchun stream key qo'shing" }));
      }
      try {
        const { video } = JSON.parse(await readBody(req));
        await startStreamForChannel(c.id, video, c.key);
        return sendJSON(res, 200, { ok: true, video });
      } catch (e) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: e.message }));
      }
    }

    // POST /api/channels/:id/stream/stop
    const stopMatch = pathname.match(/^\/api\/channels\/([^/]+)\/stream\/stop$/);
    if (stopMatch && req.method === 'POST') {
      const channels = readChannels();
      const c = findChannel(channels, stopMatch[1]);
      if (!c) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Kanal topilmadi' })); }
      stopStreamForChannel(c.id);
      return sendJSON(res, 200, { ok: true });
    }

    // GET /api/channels/:id/live-stats - real bitrate/fps/dropped frames
    const liveStatsMatch = pathname.match(/^\/api\/channels\/([^/]+)\/live-stats$/);
    if (liveStatsMatch && req.method === 'GET') {
      const channels = readChannels();
      const c = findChannel(channels, liveStatsMatch[1]);
      if (!c) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Kanal topilmadi' })); }
      const s = streams[c.id];
      if (!s || !s.live) return sendJSON(res, 200, { live: false });
      return sendJSON(res, 200, { live: true, startedAt: s.startedAt, stats: liveStats[c.id] || null });
    }

    // ---- aks holda statik fayl ----
    if (req.method === 'GET') {
      return serveStatic(req, res, pathname);
    }

    res.writeHead(404);
    res.end('Not found');
  })().catch((e) => {
    try {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    } catch (_) { /* headers already sent */ }
  });
});

server.listen(PORT, () => {
  console.log(`\n=======================================`);
  console.log(` Dashboard tayyor! 15 ta kanal faol.`);
  console.log(` Brauzerda oching: http://localhost:${PORT}`);
  console.log(`=======================================\n`);
});

process.on('SIGINT', () => {
  stopAllStreams();
  process.exit(0);
});
