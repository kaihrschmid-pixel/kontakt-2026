/* ── STARS ── */

(function () {
  const canvas = document.getElementById('stars');
  const context = canvas.getContext('2d');

  if (!context) {
    return;
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let width = 0;
  let height = 0;
  let stars = [];
  let frameId = 0;
  let lastTimestamp = 0;

  function starCount() {
    if (reducedMotion.matches) {
      return 0;
    }

    return window.innerWidth < 700 ? 60 : 120;
  }

  function resizeCanvas() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  function buildStars() {
    stars = [];

    for (let i = 0; i < starCount(); i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.6 + 0.2,
        a: Math.random(),
        s: (Math.random() - 0.5) * 0.006,
        cx: Math.random() > 0.83,
      });
    }
  }

  function drawStars(timestamp) {
    if (document.hidden || reducedMotion.matches) {
      return;
    }

    if (lastTimestamp && timestamp - lastTimestamp < 1000 / 24) {
      frameId = requestAnimationFrame(drawStars);
      return;
    }

    lastTimestamp = timestamp;
    context.clearRect(0, 0, width, height);

    stars.forEach(star => {
      star.a = Math.max(0.05, Math.min(1, star.a + star.s));

      if (star.a <= 0.05 || star.a >= 1) {
        star.s *= -1;
      }

      context.globalAlpha = star.a;

      if (star.cx) {
        context.fillStyle = '#c8b0e0';
        context.fillRect(star.x - star.r * 0.4, star.y - star.r * 2.2, star.r * 0.8, star.r * 4.4);
        context.fillRect(star.x - star.r * 2.2, star.y - star.r * 0.4, star.r * 4.4, star.r * 0.8);
      } else {
        context.fillStyle = star.r > 1 ? '#b8a8d8' : '#e0d8f0';
        context.beginPath();
        context.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        context.fill();
      }
    });

    context.globalAlpha = 1;
    frameId = requestAnimationFrame(drawStars);
  }

  function restartAnimation() {
    cancelAnimationFrame(frameId);
    lastTimestamp = 0;

    if (reducedMotion.matches) {
      canvas.style.display = 'none';
      return;
    }

    canvas.style.display = '';
    frameId = requestAnimationFrame(drawStars);
  }

  resizeCanvas();
  buildStars();
  restartAnimation();

  window.addEventListener(
    'resize',
    () => {
      resizeCanvas();
      buildStars();
    },
    { passive: true },
  );

  if (reducedMotion.addEventListener) {
    reducedMotion.addEventListener('change', () => {
      buildStars();
      restartAnimation();
    });
  } else if (reducedMotion.addListener) {
    reducedMotion.addListener(() => {
      buildStars();
      restartAnimation();
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frameId);
    } else {
      restartAnimation();
    }
  });
})();

/* ── CONFIG ── */

const TR = {
  Konzert: { color: '#EF7B1E', icon: '♪' },
  'DJ-Set': { color: '#5BAF60', icon: '◈' },
  Workshop: { color: '#0E70AB', icon: '◆' },
  Vortrag: { color: '#316044', icon: '▸' },
  Performance: { color: '#C062A3', icon: '◇' },
  Theater: { color: '#5F5BA5', icon: '△' },
  Tanz: { color: '#FAB313', icon: '✦' },
  Film: { color: '#9EA7CD', icon: '▶' },
  Jamsession: { color: '#EF7B1E', icon: '♫' },
};

const RI = {
  Triebwerk: '▶',
  Maschinenraum: '◈',
  Zeitkapsel: '◎',
  Funkraum: '◉',
  Rohteilchenbeschleuniger: '✦',
  Landeplatz: '▽',
  Satelit: '◆',
  Sternenwiese: '✧',
  'B.U.S.': '■',
};

const RO = [
  'Triebwerk',
  'Maschinenraum',
  'Zeitkapsel',
  'Funkraum',
  'Rohteilchenbeschleuniger',
  'Landeplatz',
  'Satelit',
  'Sternenwiese',
  'B.U.S.',
];

const SK = new Set(['Team-Einreichung', 'Soundcheck']);

const trackColor = t => TR[t]?.color || 'rgba(240,232,221,0.35)';
const trackIcon = t => TR[t]?.icon || '✦';

const BASE = 'https://cfp.kntkt.de';
const XML_URL = 'https://cfp.kntkt.de/kontakt-2026/schedule/export/schedule.xml';
const FEST_DATES = ['2026-05-21', '2026-05-22', '2026-05-23', '2026-05-24'];

/* ── STATE ── */

const WDAY = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function dayLabel(ds) {
  const date = new Date(`${ds}T12:00:00`);

  return `${WDAY[date.getDay()]} ${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}`;
}

let activeDay = 0;
let activeFormats = new Set();
let activeRooms = new Set();
let DAYS = [];
let query = '';
let currentEv = null;

let favs = new Set(JSON.parse(localStorage.getItem('kontakt_favs') || '[]'));
let historyOverlaySync = false;

let renderedDayBlocks = new Map();
let syncedGrids = [];
let activeScrollGrid = null;
let horizontalScrollSettleTimer = 0;
let stickyResizeObserver = null;
let dayBlockObserver = null;
let cardImageObserver = null;
let progressiveRenderToken = 0;
let programmaticDayScroll = false;
let dayScrollSettleTimer = 0;

/* ── TIME UTILS ── */

function localDateStr(d) {
  const date = d || new Date();

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function timeToMinutes(t) {
  const [hours, minutes] = t.split(':').map(Number);
  const total = hours * 60 + minutes;

  return total < 360 ? total + 1440 : total;
}

function formatDuration(d) {
  const [hours, minutes] = d.split(':').map(Number);

  if (!hours) {
    return `${minutes}min`;
  }

  if (!minutes) {
    return `${hours}h`;
  }

  return `${hours}h${minutes}`;
}

/* ── NOW (with dev override) ── */

let devMin = null;

function currentMinutes() {
  const raw = devMin !== null ? devMin : new Date().getHours() * 60 + new Date().getMinutes();
  return raw < 360 ? raw + 1440 : raw;
}

function todayDate() {
  if (devMin !== null) {
    return document.getElementById('devDate')?.value || localDateStr();
  }

  return localDateStr();
}

function programmeDate() {
  if (devMin !== null) {
    const devDate = document.getElementById('devDate')?.value;

    if (!devDate) {
      return localDateStr();
    }

    if (devMin < 360) {
      const date = new Date(`${devDate}T12:00:00`);
      date.setDate(date.getDate() - 1);
      return localDateStr(date);
    }

    return devDate;
  }

  const hours = new Date().getHours();

  if (hours < 6) {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return localDateStr(date);
  }

  return localDateStr();
}

function isLive(ev) {
  if (ev.date !== programmeDate()) {
    return false;
  }

  const now = currentMinutes();
  const start = timeToMinutes(ev.s);
  const [durationHours, durationMinutes] = (ev.d || '00:30').split(':').map(Number);
  const end = start + durationHours * 60 + durationMinutes;

  return now >= start && now < end;
}

/* ── XML PARSER ── */

function txt(el, tag) {
  for (const child of el.children) {
    if (child.tagName === tag) {
      return child.textContent.trim();
    }
  }

  return '';
}

function parseXML(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  const days = [];

  for (const dayEl of doc.getElementsByTagName('day')) {
    const date = dayEl.getAttribute('date');

    if (!date) {
      continue;
    }

    const rooms = {};

    for (const roomEl of dayEl.children) {
      if (roomEl.tagName !== 'room') {
        continue;
      }

      const roomName = roomEl.getAttribute('name');

      if (!roomName) {
        continue;
      }

      const events = [];

      for (const ev of roomEl.children) {
        if (ev.tagName !== 'event') {
          continue;
        }

        const track = txt(ev, 'track');

        if (SK.has(track)) {
          continue;
        }

        const logo = txt(ev, 'logo');
        const persons = [];

        for (const child of ev.children) {
          if (child.tagName === 'persons') {
            for (const person of child.children) {
              if (person.tagName === 'person' && person.textContent.trim()) {
                persons.push(person.textContent.trim());
              }
            }
          }
        }

        events.push({
          t: txt(ev, 'title'),
          tr: track.replace(/ regional$/, '') || null,
          s: txt(ev, 'start') || '00:00',
          d: txt(ev, 'duration') || '00:30',
          l: logo ? BASE + logo : '',
          desc: txt(ev, 'description').replace(/^None$/, ''),
          u: txt(ev, 'url'),
          p: persons,
          room: roomName,
          date,
        });
      }

      if (events.length) {
        rooms[roomName] = events;
      }
    }

    if (Object.keys(rooms).length) {
      days.push({ date, rooms });
    }
  }

  return days.filter(day => Object.keys(day.rooms).length > 0);
}

function asciiSlug(value, maxLen) {
  const normalized = (value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7F]/g, '');

  const slug = normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug.slice(0, maxLen).replace(/-+$/g, '') || 'event';
}

function eventId(ev) {
  return `${ev.date}-${ev.s.replace(':', '')}-${asciiSlug(ev.room, 24)}-${asciiSlug(ev.t, 48)}`;
}

function imageBasePath(ev) {
  const room = asciiSlug(ev.room, 24);
  const title = asciiSlug(ev.t, 48);
  return `artist-images/${ev.date}-${ev.s.replace(':', '')}-${room}-${title}`;
}

function setBgImage(bg, src, src2x) {
  if (!bg) {
    return;
  }

  if (
    src &&
    src2x &&
    window.CSS?.supports?.('background-image', `image-set(url("${src}") 1x, url("${src2x}") 2x)`)
  ) {
    bg.style.backgroundImage = `image-set(url('${src}') 1x, url('${src2x}') 2x)`;
    return;
  }

  bg.style.backgroundImage = src ? `url('${src}')` : '';
}

function setImgSrc(img, src, srcset, sizes) {
  if (srcset) {
    img.srcset = srcset;
  } else {
    img.removeAttribute('srcset');
  }

  if (sizes) {
    img.sizes = sizes;
  } else {
    img.removeAttribute('sizes');
  }

  img.src = src;
}

function observeCardImage(el, load) {
  if (!('IntersectionObserver' in window)) {
    load();
    return;
  }

  if (!cardImageObserver) {
    cardImageObserver = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) {
            return;
          }

          const loader = entry.target.__lazyImageLoader;

          if (!loader) {
            return;
          }

          delete entry.target.__lazyImageLoader;
          cardImageObserver.unobserve(entry.target);
          loader();
        });
      },
      { rootMargin: '320px 0px' },
    );
  }

  el.__lazyImageLoader = load;
  cardImageObserver.observe(el);
}

function attachEventImage(img, bg, ev, variant, onMissing, opts = {}) {
  const { defer = false, background = 'eager' } = opts;
  const base = imageBasePath(ev);
  const localSrc = `${base}-${variant}.webp`;
  const localSrc2x = `${base}-${variant}@2x.webp`;
  const fallback = ev.l || '';

  const fail = () => {
    if (onMissing) {
      onMissing();
    }
  };

  img.decoding = 'async';

  img.onload = () => {
    if (background === 'after-load') {
      setBgImage(bg, img.currentSrc || img.src, '');
    }
  };

  img.onerror = () => {
    if (fallback && img.dataset.fallbackLoaded !== '1') {
      img.dataset.fallbackLoaded = '1';

      if (background === 'eager') {
        setBgImage(bg, fallback, '');
      }

      setImgSrc(img, fallback, '', '');
      return;
    }

    img.onerror = null;
    fail();
  };

  const load = () => {
    if (background === 'eager') {
      setBgImage(bg, localSrc, localSrc2x);
    }

    setImgSrc(
      img,
      localSrc,
      `${localSrc} 1x, ${localSrc2x} 2x`,
      variant === 'hero'
        ? '(max-width: 600px) calc(100vw - 3rem), 560px'
        : '(max-width: 600px) calc(100vw - 1.5rem), 272px',
    );
  };

  if (defer) {
    observeCardImage(img, load);
  } else {
    load();
  }

  return true;
}

function syncDayTabs(date) {
  document.querySelectorAll('.dta').forEach((tab, index) => {
    tab.classList.toggle('scrollactive', DAYS[index]?.date === date);
  });
}

function beginProgrammaticDayScroll(date) {
  programmaticDayScroll = true;
  syncDayTabs(date);
}

function scheduleProgrammaticDayScrollRelease() {
  if (!programmaticDayScroll) {
    return;
  }

  clearTimeout(dayScrollSettleTimer);
  dayScrollSettleTimer = setTimeout(() => {
    programmaticDayScroll = false;
  }, 140);
}

window.addEventListener('scroll', scheduleProgrammaticDayScrollRelease, { passive: true });

function refreshDayBlockObserver() {
  if (dayBlockObserver) {
    dayBlockObserver.disconnect();
  }

  const threshold = (document.querySelector('.sb')?.offsetHeight || 0) + (document.querySelector('.day-header')?.offsetHeight || 66) + 8;

  dayBlockObserver = new IntersectionObserver(
    entries => {
      if (programmaticDayScroll) {
        return;
      }

      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

      if (visible[0]) {
        syncDayTabs(visible[0].target.dataset.date);
      }
    },
    {
      rootMargin: `-${threshold}px 0px -65% 0px`,
      threshold: [0, 0.01],
    },
  );

  document.querySelectorAll('.day-block').forEach(block => dayBlockObserver.observe(block));
}

function updateStickyOffsets() {
  const stickyBarHeight = document.querySelector('.sb')?.offsetHeight || 0;
  const roomNamesHeight = document.querySelector('.rnames')?.offsetHeight || 34;

  document.documentElement.style.setProperty('--sb-height', `${stickyBarHeight}px`);
  document.documentElement.style.setProperty('--rnames-h', `${roomNamesHeight}px`);

  if (document.querySelector('.day-block')) {
    refreshDayBlockObserver();
  }
}

function registerGrid(grid, roomNamesEl) {
  grid.addEventListener(
    'scroll',
    () => {
      if (activeScrollGrid && activeScrollGrid !== grid) {
        return;
      }

      activeScrollGrid = grid;
      clearTimeout(horizontalScrollSettleTimer);
      horizontalScrollSettleTimer = setTimeout(() => {
        if (activeScrollGrid === grid) {
          activeScrollGrid = null;
        }
      }, 120);

      roomNamesEl.scrollLeft = grid.scrollLeft;

      const x = grid.scrollLeft;
      syncedGrids.forEach(other => {
        if (other !== grid) {
          other.scrollLeft = x;
        }
      });
    },
    { passive: true },
  );

  if (syncedGrids.length) {
    grid.scrollLeft = syncedGrids[0].scrollLeft;
  }

  syncedGrids.push(grid);
}

/* ── URL STATE ── */

function overlaylessState() {
  return history.state?.overlay ? null : history.state || null;
}

function urlWithState(extraParams) {
  const params = new URLSearchParams();

  if (activeFormats.size) {
    params.set('format', [...activeFormats].join(','));
  }

  if (activeRooms.size) {
    params.set('raum', [...activeRooms].join(','));
  }

  if (query) {
    params.set('q', query);
  }

  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value) {
        params.set(key, value);
      }
    }
  }

  const search = params.toString();
  return search ? `?${search}` : location.pathname;
}

function syncUrlState() {
  history.replaceState(overlaylessState(), '', urlWithState());
}

function loadUrlState() {
  const params = new URLSearchParams(location.search);

  if (params.has('format')) {
    params.get('format').split(',').forEach(format => activeFormats.add(format));
  }

  if (params.has('raum')) {
    params.get('raum').split(',').forEach(room => activeRooms.add(room));
  }

  if (params.has('q')) {
    query = params.get('q');
  }

  if (params.has('date')) {
    window.__scrollToDate = params.get('date');
  }

  if (params.has('event')) {
    window.__openEventId = params.get('event');
  }
}

function pushOverlayState(state, extraParams) {
  history.pushState(state, '', urlWithState(extraParams));
}

function resolveEventFromUrlParam(value) {
  if (!value) {
    return null;
  }

  return (
    window.__evById?.get(value) ||
    DAYS.flatMap(day => Object.values(day.rooms).flat()).find(ev => ev.t.slice(0, 40) === value) ||
    null
  );
}

function applyOverlayState(state) {
  const favPanel = document.getElementById('favPanel');
  const modal = document.getElementById('mo');
  const overlay = state?.overlay || null;

  historyOverlaySync = true;

  if (overlay === 'event' && state.eventKey) {
    const ev = window.__evMap?.get(state.eventKey);

    if (ev) {
      openEventModal(ev, { skipHistory: true });
    } else {
      closeEventModal({ skipHistory: true });
    }

    closeFavPanel({ skipHistory: true });
    historyOverlaySync = false;
    return;
  }

  if (overlay === 'favorites') {
    if (!favPanel.classList.contains('open')) {
      favPanel.classList.add('open');
      renderFavPanel();
    }

    closeEventModal({ skipHistory: true });
    historyOverlaySync = false;
    return;
  }

  if (modal.classList.contains('open')) {
    closeEventModal({ skipHistory: true });
  }

  if (favPanel.classList.contains('open')) {
    closeFavPanel({ skipHistory: true });
  }

  historyOverlaySync = false;
}

window.addEventListener('popstate', event => applyOverlayState(event.state));

/* ── SKELETON ── */

function showSkeleton() {
  const main = document.getElementById('mainContent');
  const grid = document.createElement('div');

  grid.className = 'skel-grid';
  grid.style.padding = '1.25rem 0 1.5rem 0';

  for (let i = 0; i < 5; i++) {
    const column = document.createElement('div');
    column.className = 'skel-col';
    column.innerHTML = `<div class="skel-h"></div>${[90, 60, 110, 75]
      .map(
        height =>
          `<div class="skel-c" style="height:${height}px;animation-delay:${i * 0.1 + Math.random() * 0.2}s"></div>`,
      )
      .join('')}`;
    grid.appendChild(column);
  }

  main.innerHTML = '';
  main.appendChild(grid);
}

/* ── FAVOURITES ── */

function favKey(ev) {
  return `${ev.date}|${ev.s}|${ev.t}`;
}

function saveFavs() {
  localStorage.setItem('kontakt_favs', JSON.stringify([...favs]));
}

function toggleFav(ev) {
  const key = favKey(ev);

  if (favs.has(key)) {
    favs.delete(key);
  } else {
    favs.add(key);
  }

  saveFavs();
  updateFavBtn();
  renderFavPanel();
  renderSchedule();
}

function toggleFavFromModal() {
  if (currentEv) {
    toggleFav(currentEv);
  }

  updateModalFavBtn();
}

function updateFavBtn() {
  const button = document.getElementById('favBtn');
  const badge = document.getElementById('favBadge');
  const count = favs.size;

  badge.textContent = count;
  button.classList.toggle('visible', count > 0);
}

function closeFavPanel(opts = {}) {
  const { skipHistory = false } = opts;
  const panel = document.getElementById('favPanel');

  if (!panel.classList.contains('open')) {
    return;
  }

  if (!skipHistory && !historyOverlaySync && history.state?.overlay === 'favorites') {
    history.back();
    return;
  }

  panel.classList.remove('open');
}

document.getElementById('icalExportBtn').addEventListener('click', exportIcal);
document.querySelector('.fav-panel-h button:last-child').addEventListener('click', closeFavPanel);

document.getElementById('favBtn').addEventListener('click', () => {
  const panel = document.getElementById('favPanel');

  if (panel.classList.contains('open')) {
    closeFavPanel();
    return;
  }

  panel.classList.add('open');
  renderFavPanel();

  if (!historyOverlaySync) {
    pushOverlayState({ overlay: 'favorites' });
  }
});

document.getElementById('mfavBtn').addEventListener('click', toggleFavFromModal);

function updateModalFavBtn() {
  if (!currentEv) {
    return;
  }

  const button = document.getElementById('mfavBtn');
  const on = favs.has(favKey(currentEv));

  button.classList.toggle('on', on);
  button.textContent = on ? '★ Gemerkt' : '☆ Merken';
}

function hasConflict(ev) {
  const key = favKey(ev);

  if (!favs.has(key)) {
    return false;
  }

  const startA = timeToMinutes(ev.s);
  const [durationHoursA, durationMinutesA] = (ev.d || '00:30').split(':').map(Number);
  const endA = startA + durationHoursA * 60 + durationMinutesA;

  for (const day of DAYS) {
    for (const events of Object.values(day.rooms)) {
      for (const other of events) {
        if (favKey(other) === key || !favs.has(favKey(other))) {
          continue;
        }

        if (other.date !== ev.date) {
          continue;
        }

        const startB = timeToMinutes(other.s);
        const [durationHoursB, durationMinutesB] = (other.d || '00:30').split(':').map(Number);
        const endB = startB + durationHoursB * 60 + durationMinutesB;

        if (startA < endB && endA > startB) {
          return true;
        }
      }
    }
  }

  return false;
}

function renderFavPanel() {
  const list = document.getElementById('favList');

  if (!favs.size) {
    list.innerHTML = '<div class="fav-empty">✦ Noch keine Acts gemerkt<br>Klick auf ☆ bei einem Act</div>';
    return;
  }

  const all = [];

  for (const day of DAYS) {
    for (const events of Object.values(day.rooms)) {
      for (const ev of events) {
        if (favs.has(favKey(ev))) {
          all.push(ev);
        }
      }
    }
  }

  all.sort((a, b) => a.date.localeCompare(b.date) || timeToMinutes(a.s) - timeToMinutes(b.s));
  list.innerHTML = '';

  let lastDate = '';

  all.forEach(ev => {
    const conflict = hasConflict(ev);

    if (ev.date !== lastDate) {
      const separator = document.createElement('div');
      separator.style.cssText =
        "padding:0.4rem 1rem 0.2rem;font-family:'Share Tech Mono',monospace;font-size:0.58rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--yellow);border-bottom:1px solid rgba(245,216,0,0.1)";
      separator.textContent = dayLabel(ev.date);
      list.appendChild(separator);
      lastDate = ev.date;
    }

    const item = document.createElement('div');
    item.className = `fav-item${conflict ? ' fav-conflict' : ''}`;
    item.dataset.favkey = favKey(ev);
    item.addEventListener('click', () => openMbyKey(item.dataset.favkey));

    const timeEl = document.createElement('div');
    timeEl.className = 'fav-item-time';
    timeEl.textContent = `${ev.s} · ${formatDuration(ev.d)}`;

    const titleEl = document.createElement('div');
    titleEl.className = 'fav-item-title';
    titleEl.textContent = ev.t;

    const roomEl = document.createElement('div');
    roomEl.className = 'fav-item-room';
    roomEl.textContent = `${RI[ev.room] || '◆'} ${ev.room}`;

    item.appendChild(timeEl);
    item.appendChild(titleEl);
    item.appendChild(roomEl);
    list.appendChild(item);
  });
}

function exportIcal() {
  if (!favs.size) {
    return;
  }

  const all = [];

  for (const day of DAYS) {
    for (const events of Object.values(day.rooms)) {
      for (const ev of events) {
        if (favs.has(favKey(ev))) {
          all.push(ev);
        }
      }
    }
  }

  if (!all.length) {
    return;
  }

  const pad = n => String(n).padStart(2, '0');

  function toIcalDT(dateStr, timeStr) {
    const [y, mo, d] = dateStr.split('-');
    const [h, mi] = timeStr.split(':');
    return `${y}${pad(mo)}${pad(d)}T${pad(h)}${pad(mi)}00`;
  }

  function addDuration(dateStr, timeStr, durStr) {
    const [durationHours, durationMinutes] = durStr.split(':').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + durationHours * 60 + durationMinutes;
    const endHours = Math.floor(totalMinutes / 60) % 24;
    const endMinutes = totalMinutes % 60;

    let [y, mo, d] = dateStr.split('-').map(Number);

    if (totalMinutes >= 1440) {
      const dt = new Date(y, mo - 1, d + 1);
      y = dt.getFullYear();
      mo = dt.getMonth() + 1;
      d = dt.getDate();
    }

    return `${y}${pad(mo)}${pad(d)}T${pad(endHours)}${pad(endMinutes)}00`;
  }

  const uidBase = Date.now();

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//kontakt 2026//Programm//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:kontakt 2026 – Mein Plan',
    'X-WR-TIMEZONE:Europe/Berlin',
  ];

  all.forEach((ev, index) => {
    const dtstart = toIcalDT(ev.date, ev.s);
    const dtend = addDuration(ev.date, ev.s, ev.d || '00:30');
    const summary = ev.t.replace(/[\\;,]/g, c => `\\${c}`);
    const location = ev.room.replace(/[\\;,]/g, c => `\\${c}`);
    const desc = (ev.desc || '')
      .replace(/\n/g, '\\n')
      .replace(/[\\;,]/g, c => `\\${c}`)
      .slice(0, 500);
    const persons = ev.p?.length ? `Mitwirkende: ${ev.p.join(', ')}\\n` : '';

    lines.push(
      'BEGIN:VEVENT',
      `UID:kontakt2026-${uidBase}-${index}@kntkt.de`,
      `DTSTART;TZID=Europe/Berlin:${dtstart}`,
      `DTEND;TZID=Europe/Berlin:${dtend}`,
      `SUMMARY:${summary}`,
      `LOCATION:${location}`,
      `DESCRIPTION:${persons}${desc}`,
    );

    if (ev.u) {
      lines.push(`URL:${ev.u}`);
    }

    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');

  const ics = lines.join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = 'kontakt2026-meinplan.ics';
  link.click();

  URL.revokeObjectURL(url);
}

function openMbyKey(key) {
  for (const day of DAYS) {
    for (const events of Object.values(day.rooms)) {
      for (const ev of events) {
        if (favKey(ev) === key) {
          closeFavPanel({ skipHistory: true });
          openEventModal(ev);
          return;
        }
      }
    }
  }
}

function matchesQuery(ev) {
  if (!query) {
    return true;
  }

  return (
    ev.t.toLowerCase().includes(query) ||
    ev.p.some(person => person.toLowerCase().includes(query)) ||
    (ev.tr || '').toLowerCase().includes(query) ||
    ev.room.toLowerCase().includes(query)
  );
}

/* ── RENDER: continuous timeline, all days ── */

const PX_PER_MIN = 1.8;
const CARD_MIN_H = 82;
const COL_PAD_BOTTOM = 60;

function buildDayBlock(day) {
  const today = todayDate();
  const isToday = day.date === today;
  const rooms = [
    ...RO.filter(room => day.rooms[room]?.length),
    ...Object.keys(day.rooms)
      .filter(room => !RO.includes(room) && day.rooms[room]?.length)
      .sort(),
  ];

  const block = document.createElement('div');
  block.className = 'day-block';
  block.dataset.date = day.date;

  const dayHeader = document.createElement('div');
  dayHeader.className = 'day-header';

  const divider = document.createElement('div');
  divider.className = `day-div${isToday ? ' today' : ''}`;
  divider.innerHTML = `<span class="day-div-label">${dayLabel(day.date)}</span><span class="day-div-dot"></span>`;
  dayHeader.appendChild(divider);

  const roomNamesEl = document.createElement('div');
  roomNamesEl.className = 'rnames';

  rooms.forEach(roomName => {
    const item = document.createElement('div');
    item.className = 'rname-item';
    item.dataset.room = roomName;

    const icon = document.createElement('span');
    icon.textContent = RI[roomName] || '◆';

    item.appendChild(icon);
    item.appendChild(document.createTextNode(` ${roomName}`));
    roomNamesEl.appendChild(item);
  });

  dayHeader.appendChild(roomNamesEl);
  block.appendChild(dayHeader);

  const grid = document.createElement('div');
  grid.className = 'rg';
  grid.dataset.date = day.date;

  let dayStart = Infinity;
  let dayEnd = 0;

  rooms.forEach(roomName => {
    day.rooms[roomName].forEach(ev => {
      const start = timeToMinutes(ev.s);
      const [durationHours, durationMinutes] = (ev.d || '00:30').split(':').map(Number);
      const end = start + durationHours * 60 + durationMinutes;

      if (start < dayStart) {
        dayStart = start;
      }

      if (end > dayEnd) {
        dayEnd = end;
      }
    });
  });

  const columnHeight = Math.max((dayEnd - dayStart) * PX_PER_MIN + COL_PAD_BOTTOM, 300);
  const columnData = [];

  rooms.forEach(roomName => {
    const events = [...day.rooms[roomName]].sort((a, b) => timeToMinutes(a.s) - timeToMinutes(b.s));

    const column = document.createElement('div');
    column.className = 'rc';
    column.dataset.room = roomName;

    const roomHeaderEl = document.createElement('div');
    roomHeaderEl.className = 'rh';
    roomHeaderEl.innerHTML = `<span>${RI[roomName] || '◆'}</span>${roomName}`;
    column.appendChild(roomHeaderEl);

    const eventWrapper = document.createElement('div');
    eventWrapper.className = 're';
    eventWrapper.style.height = `${columnHeight}px`;
    column.appendChild(eventWrapper);

    let placedCards = [];

    events.forEach(ev => {
      if (SK.has(ev.tr)) {
        return;
      }

      const color = trackColor(ev.tr);
      const icon = trackIcon(ev.tr);
      const live = isLive(ev);
      const faved = favs.has(favKey(ev));
      const conflict = hasConflict(ev);
      const idealTop = (timeToMinutes(ev.s) - dayStart) * PX_PER_MIN;
      const [durationHours, durationMinutes] = (ev.d || '00:30').split(':').map(Number);
      const durationMinutesTotal = durationHours * 60 + durationMinutes;
      const idealHeight = Math.max(durationMinutesTotal * PX_PER_MIN, CARD_MIN_H);

      let top = idealTop;

      for (const placed of placedCards) {
        if (top < placed.bottom + 4) {
          top = placed.bottom + 4;
        }
      }

      placedCards.push({ top, bottom: top + idealHeight });

      const card = document.createElement('div');
      card.__ev = ev;
      card.className = `ec${live ? ' live' : ''}${faved ? ' faved' : ''}`;
      card.dataset.evkey = favKey(ev);
      card.style.setProperty('--tc', color);
      card.style.top = `${top}px`;
      card.style.height = `${idealHeight}px`;

      if (conflict) {
        card.style.boxShadow = 'inset 0 0 0 1px #ff456060';
      }

      if (ev.l) {
        const imageWrapper = document.createElement('div');
        imageWrapper.className = 'ew';

        const bg = document.createElement('div');
        bg.className = 'ew-bg';

        const img = document.createElement('img');
        img.className = 'et';
        img.alt = '';
        img.loading = 'lazy';
        img.fetchPriority = 'low';

        attachEventImage(
          img,
          bg,
          ev,
          'card',
          () => {
            imageWrapper.remove();
            card.classList.add('noimg');
          },
          { defer: true, background: 'after-load' },
        );

        imageWrapper.appendChild(bg);
        imageWrapper.appendChild(img);
        card.appendChild(imageWrapper);

        const scrim = document.createElement('div');
        scrim.className = 'escrim';
        card.appendChild(scrim);
      } else {
        card.classList.add('noimg');
      }

      const overlay = document.createElement('div');
      overlay.className = 'eov';

      const topRow = document.createElement('div');
      topRow.className = 'eto';

      const timeEl = document.createElement('span');
      timeEl.className = 'etm';
      timeEl.textContent = ev.s;

      const durationEl = document.createElement('span');
      durationEl.className = 'edu';
      durationEl.textContent = formatDuration(ev.d);

      topRow.appendChild(timeEl);
      topRow.appendChild(durationEl);
      overlay.appendChild(topRow);

      const titleEl = document.createElement('div');
      titleEl.className = 'eti';
      titleEl.textContent = ev.t;
      overlay.appendChild(titleEl);

      const meta = document.createElement('div');
      meta.className = 'em';

      if (ev.tr) {
        const badge = document.createElement('span');
        badge.className = 'eb';
        badge.style.background = color;

        const badgeIcon = document.createElement('span');
        badgeIcon.className = 'bi';
        badgeIcon.textContent = icon;

        badge.appendChild(badgeIcon);
        badge.appendChild(document.createTextNode(ev.tr));
        meta.appendChild(badge);
      }

      overlay.appendChild(meta);

      if (ev.p?.length) {
        const authors = document.createElement('div');
        authors.className = 'ea';
        authors.textContent = ev.p.join(', ');
        overlay.appendChild(authors);
      }

      const star = document.createElement('span');
      star.className = 'fav';
      star.textContent = faved ? '★' : '☆';
      star.addEventListener('click', event => {
        event.stopPropagation();
        toggleFav(ev);
      });

      card.appendChild(overlay);
      card.appendChild(star);
      card.addEventListener('click', () => openEventModal(ev));
      eventWrapper.appendChild(card);
    });

    const maxBottom = placedCards.length > 0 ? Math.max(...placedCards.map(placed => placed.bottom)) : 0;
    const actualHeight = Math.max(columnHeight, maxBottom + COL_PAD_BOTTOM);

    columnData.push({ evW: eventWrapper, actualH: actualHeight });
    grid.appendChild(column);
  });

  if (columnData.length > 0) {
    const maxHeight = Math.max(...columnData.map(data => data.actualH));
    columnData.forEach(data => {
      data.evW.style.height = `${maxHeight}px`;
    });
  }

  registerGrid(grid, roomNamesEl);
  block.appendChild(grid);
  renderedDayBlocks.set(day.date, block);

  if (dayBlockObserver) {
    dayBlockObserver.observe(block);
  }

  return block;
}

function buildScheduleDOM() {
  const main = document.getElementById('mainContent');

  main.innerHTML = '';
  renderedDayBlocks.clear();
  syncedGrids = [];
  activeScrollGrid = null;
  progressiveRenderToken++;

  if (dayBlockObserver) {
    dayBlockObserver.disconnect();
  }

  if (cardImageObserver) {
    cardImageObserver.disconnect();
  }

  if (!DAYS.length) {
    main.innerHTML = '<p class="ed">✦ Keine Programmpunkte</p>';
    return;
  }

  const initialDate = window.__scrollToDate || programmeDate();
  const ordered = [...DAYS].sort((a, b) => {
    if (a.date === initialDate) {
      return -1;
    }

    if (b.date === initialDate) {
      return 1;
    }

    return DAYS.indexOf(a) - DAYS.indexOf(b);
  });

  const [firstDay, ...restDays] = ordered;

  if (firstDay) {
    main.appendChild(buildDayBlock(firstDay));
  }

  renderSchedule();
  updateStickyOffsets();
  syncDayTabs(firstDay?.date || null);

  const token = progressiveRenderToken;
  const defer = window.requestIdleCallback
    ? callback => window.requestIdleCallback(callback, { timeout: 180 })
    : callback => setTimeout(callback, 16);

  const scheduleMore = index => {
    if (token !== progressiveRenderToken) {
      return;
    }

    if (index >= restDays.length) {
      updateStickyOffsets();
      return;
    }

    const day = restDays[index];

    if (day && !renderedDayBlocks.has(day.date)) {
      main.appendChild(buildDayBlock(day));
    }

    renderSchedule();
    updateStickyOffsets();
    defer(() => scheduleMore(index + 1));
  };

  defer(() => scheduleMore(0));
}

function renderSchedule() {
  let visibleCount = 0;

  document.querySelectorAll('.ec').forEach(card => {
    const ev = card.__ev;

    if (!ev) {
      return;
    }

    const matchQ = matchesQuery(ev);
    const matchF = activeFormats.size === 0 || (ev.tr && activeFormats.has(ev.tr));
    const show = matchQ && matchF;

    card.classList.toggle('dm', !show);

    if (show) {
      visibleCount++;
    }
  });

  document.querySelectorAll('.rc').forEach(col => {
    const roomName = col.dataset.room;

    if (!roomName) {
      return;
    }

    const isActive = activeRooms.has(roomName);
    col.style.opacity = activeRooms.size > 0 && !isActive ? '0.1' : '';
    col.style.order = activeRooms.size > 0 ? (isActive ? '0' : '1') : '';
  });

  document.querySelectorAll('.rname-item').forEach(item => {
    const roomName = item.dataset.room;

    if (!roomName) {
      return;
    }

    const isActive = activeRooms.has(roomName);
    item.style.opacity = activeRooms.size > 0 && !isActive ? '0.1' : '';
    item.style.order = activeRooms.size > 0 ? (isActive ? '0' : '1') : '';
  });

  const main = document.getElementById('mainContent');
  const existing = main.querySelector('.ed');

  if (visibleCount === 0) {
    if (!existing) {
      const message = document.createElement('p');
      message.className = 'ed';
      message.textContent = '✦ Keine Ergebnisse für diese Filter';
      main.appendChild(message);
    }
  } else if (existing) {
    existing.remove();
  }
}

function initFiltersAndTabs() {
  window.__evMap = new Map();

  for (const day of DAYS) {
    for (const events of Object.values(day.rooms)) {
      for (const ev of events) {
        window.__evMap.set(favKey(ev), ev);
      }
    }
  }

  window.__evById = new Map();

  for (const day of DAYS) {
    for (const events of Object.values(day.rooms)) {
      for (const ev of events) {
        window.__evById.set(eventId(ev), ev);
      }
    }
  }

  loadUrlState();

  const allTracks = new Set();
  DAYS.forEach(day => {
    Object.values(day.rooms).forEach(events => {
      events.forEach(ev => {
        if (ev.tr && !SK.has(ev.tr)) {
          allTracks.add(ev.tr);
        }
      });
    });
  });

  const allRooms = new Set();
  DAYS.forEach(day => RO.filter(room => day.rooms[room]?.length).forEach(room => allRooms.add(room)));
  DAYS.forEach(day => {
    Object.keys(day.rooms)
      .filter(room => !RO.includes(room) && day.rooms[room]?.length)
      .forEach(room => allRooms.add(room));
  });

  const formatFiltersEl = document.getElementById('trackFilters');

  while (formatFiltersEl.children.length > 1) {
    formatFiltersEl.removeChild(formatFiltersEl.lastChild);
  }

  allTracks.forEach(track => {
    const button = document.createElement('button');
    button.className = `tp${activeFormats.has(track) ? ' active' : ''}`;
    button.style.setProperty('--pc', trackColor(track));
    button.setAttribute('aria-pressed', activeFormats.has(track) ? 'true' : 'false');
    button.innerHTML = `<span class="pi">${trackIcon(track)}</span>${track}`;

    button.addEventListener('click', () => {
      if (activeFormats.has(track)) {
        activeFormats.delete(track);
        button.classList.remove('active');
      } else {
        activeFormats.add(track);
        button.classList.add('active');
      }

      button.setAttribute('aria-pressed', activeFormats.has(track) ? 'true' : 'false');
      syncUrlState();
      renderSchedule();
    });

    formatFiltersEl.appendChild(button);
  });

  const roomFiltersEl = document.getElementById('roomFilters');

  while (roomFiltersEl.children.length > 1) {
    roomFiltersEl.removeChild(roomFiltersEl.lastChild);
  }

  const roomOrder = [...RO.filter(room => allRooms.has(room)), ...[...allRooms].filter(room => !RO.includes(room)).sort()];

  roomOrder.forEach(roomName => {
    const button = document.createElement('button');
    button.className = `tp${activeRooms.has(roomName) ? ' active' : ''}`;
    button.style.setProperty('--pc', 'rgba(240,232,221,0.55)');
    button.setAttribute('aria-pressed', activeRooms.has(roomName) ? 'true' : 'false');
    button.innerHTML = `<span class="pi">${RI[roomName] || '◆'}</span>${roomName}`;

    button.addEventListener('click', () => {
      if (activeRooms.has(roomName)) {
        activeRooms.delete(roomName);
        button.classList.remove('active');
      } else {
        activeRooms.add(roomName);
        button.classList.add('active');
      }

      button.setAttribute('aria-pressed', activeRooms.has(roomName) ? 'true' : 'false');
      syncUrlState();
      renderSchedule();
    });

    roomFiltersEl.appendChild(button);
  });

  const today = todayDate();
  const tabEl = document.getElementById('dayTabs');
  tabEl.innerHTML = '';

  DAYS.forEach(day => {
    const isToday = day.date === today;
    const tab = document.createElement('div');

    tab.className = `dta${isToday ? ' today' : ''}`;
    tab.setAttribute('role', 'tab');
    tab.innerHTML = `${dayLabel(day.date)}<span class="livedot"></span>`;
    tab.addEventListener('click', () => scrollToDate(day.date));

    tabEl.appendChild(tab);
  });

  updateFavBtn();

  const searchEl = document.getElementById('search');

  if (searchEl) {
    searchEl.value = query;

    let debounceTimer;

    searchEl.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        query = searchEl.value.trim().toLowerCase();
        renderSchedule();
        syncUrlState();
      }, 250);
    });
  }

  buildScheduleDOM();
  renderSchedule();

  if (window.__openEventId) {
    const ev = resolveEventFromUrlParam(window.__openEventId);
    delete window.__openEventId;

    if (ev) {
      history.replaceState(overlaylessState(), '', urlWithState());
      history.pushState({ overlay: 'event', eventKey: favKey(ev) }, '', urlWithState({ event: eventId(ev) }));
      openEventModal(ev, { skipHistory: true });
    }
  }

  updateStickyOffsets();

  if (stickyResizeObserver) {
    stickyResizeObserver.disconnect();
  }

  stickyResizeObserver = new ResizeObserver(updateStickyOffsets);
  stickyResizeObserver.observe(document.querySelector('.sb'));

  const main = document.getElementById('mainContent');

  const doScroll = () => {
    if (window.__scrollToDate) {
      scrollToDate(window.__scrollToDate);
      delete window.__scrollToDate;
    } else {
      scrollToNow();
    }
  };

  if (main.scrollHeight > 200) {
    requestAnimationFrame(doScroll);
  } else {
    const resizeObserver = new ResizeObserver(entries => {
      if (entries[0].contentRect.height > 200) {
        resizeObserver.disconnect();
        requestAnimationFrame(doScroll);
      }
    });

    resizeObserver.observe(main);
    setTimeout(() => {
      resizeObserver.disconnect();
      doScroll();
    }, 3000);
  }

  setInterval(() => {
    document.querySelectorAll('.ec').forEach(card => {
      const key = card.dataset.evkey;

      if (!key) {
        return;
      }

      const ev = window.__evMap?.get(key);

      if (!ev) {
        return;
      }

      card.classList.toggle('live', isLive(ev));
    });

    const currentDate = todayDate();
    document.querySelectorAll('.dta').forEach((tab, index) => {
      tab.classList.toggle('today', DAYS[index]?.date === currentDate);
    });
  }, 30000);
}

/* ── SCROLL HELPERS ── */

function scrollToDate(date) {
  let block = renderedDayBlocks.get(date) || document.querySelector(`.day-block[data-date="${date}"]`);

  if (!block) {
    const day = DAYS.find(d => d.date === date);

    if (day) {
      block = buildDayBlock(day);
      document.getElementById('mainContent').appendChild(block);
      renderSchedule();
      updateStickyOffsets();
    }
  }

  if (!block) {
    return;
  }

  const stickyBarHeight = document.querySelector('.sb')?.offsetHeight || 0;
  const blockTop = block.getBoundingClientRect().top + window.scrollY;

  beginProgrammaticDayScroll(date);

  window.scrollTo({
    top: Math.max(0, blockTop - stickyBarHeight - 8),
    behavior: 'smooth',
  });

  scheduleProgrammaticDayScrollRelease();
}

function scrollToNow() {
  const targetDate = programmeDate();
  const targetMinutes = devMin !== null ? (devMin < 360 ? devMin + 1440 : devMin) : currentMinutes();
  const day = DAYS.find(d => d.date === targetDate);

  if (!day) {
    console.log('[stn] day not found', targetDate);
    return;
  }

  let dayStart = Infinity;

  Object.values(day.rooms).forEach(events => {
    events.forEach(ev => {
      const minutes = timeToMinutes(ev.s);

      if (minutes < dayStart) {
        dayStart = minutes;
      }
    });
  });

  if (targetMinutes < dayStart) {
    console.log('[stn] before start', targetMinutes, dayStart);
    return;
  }

  const block = document.querySelector(`.day-block[data-date="${targetDate}"]`);

  if (!block) {
    console.log('[stn] no block');
    return;
  }

  document.body.offsetHeight;

  const stickyBarHeight = document.querySelector('.sb')?.offsetHeight || 0;
  const topPx = (targetMinutes - dayStart) * PX_PER_MIN;
  const blockRect = block.getBoundingClientRect();
  const blockTop = blockRect.top + window.scrollY;
  const dividerHeight = block.querySelector('.day-div')?.getBoundingClientRect().height || 40;
  const target = Math.max(0, blockTop + dividerHeight + topPx - stickyBarHeight - 60);

  const debug = document.getElementById('devDebug');

  if (debug) {
    debug.textContent = [
      `date: ${targetDate}`,
      `targetMin: ${targetMinutes} (dayStart: ${dayStart})`,
      `topPx: ${Math.round(topPx)}px`,
      `blockTop: ${Math.round(blockTop)}px`,
      `divH: ${Math.round(dividerHeight)}px  stickyH: ${stickyBarHeight}px`,
      `scrollTo: ${Math.round(target)}px / pageH: ${document.body.scrollHeight}px`,
    ].join('\n');
  }

  console.log('[stn]', {
    targetDate,
    targetMin: targetMinutes,
    dayStart,
    topPx,
    blockTop,
    divH: dividerHeight,
    stickyH: stickyBarHeight,
    target,
  });

  beginProgrammaticDayScroll(targetDate);
  window.scrollTo({ top: target, behavior: 'smooth' });
  scheduleProgrammaticDayScrollRelease();
}

function openEventModal(ev, opts = {}) {
  const { skipHistory = false } = opts;

  currentEv = ev;

  const color = trackColor(ev.tr);
  const icon = trackIcon(ev.tr);
  const wrap = document.getElementById('mheroWrap');
  const hero = document.getElementById('mhero');
  const bg = document.getElementById('mheroBg');

  if (ev.l) {
    wrap.style.display = 'grid';
    attachEventImage(hero, bg, ev, 'hero', () => {
      wrap.style.display = 'none';
    });
  } else {
    wrap.style.display = 'none';
  }

  const live = isLive(ev);
  document.getElementById('mlive').style.display = live ? 'flex' : 'none';

  const trackBadge = document.getElementById('mtb');
  trackBadge.innerHTML = '';
  trackBadge.style.background = color;

  const badgeIcon = document.createElement('span');
  badgeIcon.className = 'bi';
  badgeIcon.textContent = icon;

  trackBadge.appendChild(badgeIcon);
  trackBadge.appendChild(document.createTextNode(ev.tr || 'Programm'));

  document.getElementById('mn').textContent = ev.t;

  const info = document.getElementById('minf');
  info.innerHTML = '';

  const timeInfo = document.createElement('span');
  timeInfo.textContent = `⬡ ${ev.s} Uhr`;
  info.appendChild(timeInfo);

  const durationInfo = document.createElement('span');
  durationInfo.textContent = `◷ ${formatDuration(ev.d)}`;
  info.appendChild(durationInfo);

  if (ev.p?.length) {
    const personsInfo = document.createElement('span');
    personsInfo.textContent = `✦ ${ev.p.join(', ')}`;
    info.appendChild(personsInfo);
  }

  if (ev.room) {
    const roomInfo = document.createElement('span');
    roomInfo.textContent = `${RI[ev.room] || '◆'} ${ev.room}`;
    info.appendChild(roomInfo);
  }

  document.getElementById('mde').textContent = (ev.desc || '').trim();

  const safeUrl = ev.u && (ev.u.startsWith('https://') || ev.u.startsWith('http://')) ? ev.u : '#';
  document.getElementById('mlink').href = safeUrl;

  updateModalFavBtn();

  document.getElementById('mo').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('mcl').focus();

  if (!skipHistory && !historyOverlaySync) {
    pushOverlayState({ overlay: 'event', eventKey: favKey(ev) }, { event: eventId(ev) });
  }
}

function closeEventModal(opts = {}) {
  const { skipHistory = false } = opts;
  const modal = document.getElementById('mo');

  if (!modal.classList.contains('open')) {
    return;
  }

  if (!skipHistory && !historyOverlaySync && history.state?.overlay === 'event') {
    history.back();
    return;
  }

  modal.classList.remove('open');
  document.body.style.overflow = '';
  currentEv = null;

  if (!skipHistory) {
    syncUrlState();
  }
}

document.getElementById('mcl').addEventListener('click', closeEventModal);
document.getElementById('mo').addEventListener('click', event => {
  if (event.target === event.currentTarget) {
    closeEventModal();
  }
});

document.addEventListener('keydown', event => {
  const modalOpen = document.getElementById('mo').classList.contains('open');

  if (event.key === 'Escape') {
    if (modalOpen) {
      closeEventModal();
    } else {
      closeFavPanel();
    }
  }

  if (event.key === 'Tab' && modalOpen) {
    const focusable = [...document.querySelector('.md').querySelectorAll('button,[href],input,[tabindex]:not([tabindex="-1"])')].filter(
      el => !el.disabled,
    );

    if (!focusable.length) {
      return;
    }

    const index = focusable.indexOf(document.activeElement);

    if (event.shiftKey) {
      event.preventDefault();
      focusable[index <= 0 ? focusable.length - 1 : index - 1].focus();
    } else {
      event.preventDefault();
      focusable[index >= focusable.length - 1 ? 0 : index + 1].focus();
    }
  }
});

/* ── DEV MODE ── */

const isLocalhost = ['localhost', '127.0.0.1', ''].includes(location.hostname);

if (isLocalhost && new URLSearchParams(location.search).get('dev') === '1') {
  document.getElementById('devPanel').style.display = 'block';

  const slider = document.getElementById('devTime');
  const label = document.getElementById('devTimeLabel');

  slider.addEventListener('input', () => {
    const hours = Math.floor(slider.value / 60)
      .toString()
      .padStart(2, '0');
    const minutes = (slider.value % 60).toString().padStart(2, '0');

    label.textContent = `${hours}:${minutes}`;
  });
}

document.getElementById('devApplyBtn').addEventListener('click', applyDevTime);

function applyDevTime() {
  devMin = parseInt(document.getElementById('devTime').value);
  buildScheduleDOM();
  renderSchedule();
  requestAnimationFrame(() => requestAnimationFrame(() => scrollToNow()));
}

/* ── LOAD ── */

function showStatus(msg, isError) {
  document.getElementById('mainContent').innerHTML = `<p class="ed ${isError ? 'ed-error' : 'ed-info'}">${msg}</p>`;
}

async function loadSchedule() {
  showSkeleton();

  let xml;

  const CACHE_KEY = 'kontakt_xml';
  const CACHE_TTL = 5 * 60 * 1000;
  const cached = sessionStorage.getItem(CACHE_KEY);
  const cachedAt = parseInt(sessionStorage.getItem(`${CACHE_KEY}_ts`) || '0');

  if (cached && Date.now() - cachedAt < CACHE_TTL) {
    xml = cached;
  } else {
    try {
      const response = await fetch(XML_URL, { cache: 'no-cache' });

      if (!response.ok) {
        throw 0;
      }

      xml = await response.text();
      sessionStorage.setItem(CACHE_KEY, xml);
      sessionStorage.setItem(`${CACHE_KEY}_ts`, Date.now());
    } catch {
      showStatus('✗ Programm konnte nicht geladen werden. Bitte Seite neu laden.', true);
      return;
    }
  }

  DAYS = parseXML(xml);

  if (!DAYS.length) {
    showStatus('✗ Keine Daten gefunden.', true);
    return;
  }

  initFiltersAndTabs();
}

loadSchedule();
