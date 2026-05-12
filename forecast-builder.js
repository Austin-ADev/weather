// forecast-builder.js
// Final fix: marker lock color + tooltip + strict lock + auto-scroll only while hovering

import { getUnitParams } from './utils.js';
import { WEATHER_TEXT } from './constants.js';

// -----------------------------
// buildHourly
// -----------------------------
export async function buildHourly(hourly, timezone) {
  const forecastEl = document.getElementById("forecast");
  if (!forecastEl) return;
  forecastEl.innerHTML = "";
  const units = getUnitParams();
  if (!hourly || !hourly.time) return;

  const now = new Date().toLocaleString("en-US", { timeZone: timezone });
  const currentHour = new Date(now).getHours();

  let startIndex = hourly.time.findIndex(t => {
    const d = new Date(t);
    return d.getHours() === currentHour;
  });
  if (startIndex < 0) startIndex = 0;

  const endIndex = Math.min(startIndex + 24, hourly.time.length);

  const temps = [];
  const labels = [];
  const conditions = [];

  for (let i = startIndex; i < endIndex; i++) {
    const t = new Date(hourly.time[i]);
    const hour = t.toLocaleTimeString([], { hour: "numeric" });

    temps.push(hourly.temperature_2m[i]);
    labels.push(hour);
    conditions.push(WEATHER_TEXT[hourly.weather_code[i]] || "—");

    const row = document.createElement("div");
    row.className = "forecast-hour";
    row.innerHTML = `
      <div>${hour}</div>
      <div>${Math.round(hourly.temperature_2m[i])}${units.tempSymbol}</div>
      <div>${WEATHER_TEXT[hourly.weather_code[i]] || "—"}</div>
    `;
    forecastEl.appendChild(row);
  }

  await drawHourlyChart(temps, labels, units.tempSymbol, conditions);
  try { await createBaseBitmapSnapshot(); } catch (e) { /* non-fatal */ }
  try { setupHourlyHover(temps, labels, conditions, units.tempSymbol); } catch (e) { console.warn(e); }
  try { setupHourlyTap(temps, labels, conditions, units.tempSymbol); } catch (e) { console.warn(e); }
}

// -----------------------------
// drawHourlyChart
// -----------------------------
export async function drawHourlyChart(temps, labels, symbol, conditions) {
  const canvas = document.getElementById("hourlyChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const hourWidth = 80; // CSS px per hour
  const cssH = 120;
  const cssW = Math.round(hourWidth * temps.length); // integer CSS width
  const DPR = window.devicePixelRatio || 1;

  // set CSS size and backing store size
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  canvas.width = Math.round(cssW * DPR);
  canvas.height = Math.round(cssH * DPR);

  // store CSS width for handlers
  canvas._cssWidth = cssW;
  canvas._cssHeight = cssH;
  canvas._DPR = DPR;
  canvas._hourWidth = hourWidth;

  // draw in CSS pixels
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const w = cssW, h = cssH, pad = 20;
  const max = Math.max(...temps), min = Math.min(...temps);

  // dense sampling: one sample per CSS pixel (length = cssW)
  const dense = new Array(w);
  for (let x = 0; x < w; x++) {
    const hourIndex = x / hourWidth;
    const i = Math.floor(hourIndex);
    if (i < 0) { dense[x] = { x, y: null }; continue; }
    if (i >= temps.length - 1) {
      const yLast = h - pad - ((temps[temps.length - 1] - min) / (max - min || 1)) * (h - pad * 2);
      dense[x] = { x, y: yLast };
      continue;
    }
    const t = hourIndex - i;
    const y1 = h - pad - ((temps[i] - min) / (max - min || 1)) * (h - pad * 2);
    const y2 = h - pad - ((temps[i + 1] - min) / (max - min || 1)) * (h - pad * 2);
    dense[x] = { x, y: y1 + (y2 - y1) * t };
  }

  // draw polyline
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.lineWidth = 3;
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#4fd1ff";
  let started = false;
  for (let i = 0; i < dense.length; i++) {
    const p = dense[i];
    if (!p || p.y == null) { started = false; continue; }
    if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();

  // compute center points and draw high/low markers (CSS px)
  const points = temps.map((t, i) => {
    const x = i * hourWidth + hourWidth / 2;
    const y = h - pad - ((t - min) / (max - min || 1)) * (h - pad * 2);
    return { x, y, temp: t, index: i };
  });

  const markers = [];
  const hiIndex = temps.indexOf(max);
  const loIndex = temps.indexOf(min);

  if (hiIndex >= 0) {
    ctx.fillStyle = "#bd1818";
    ctx.beginPath();
    ctx.arc(points[hiIndex].x, points[hiIndex].y, 5, 0, Math.PI * 2);
    ctx.fill();
    markers.push({
      type: "high",
      x: points[hiIndex].x,
      y: points[hiIndex].y,
      color: "#bd1818",
      temp: max,
      index: hiIndex,
      hitRadius: 20,
      hitBox: { w: 40, h: 40 }
    });
  }
  if (loIndex >= 0) {
    ctx.fillStyle = "#183eb9";
    ctx.beginPath();
    ctx.arc(points[loIndex].x, points[loIndex].y, 5, 0, Math.PI * 2);
    ctx.fill();
    markers.push({
      type: "low",
      x: points[loIndex].x,
      y: points[loIndex].y,
      color: "#183eb9",
      temp: min,
      index: loIndex,
      hitRadius: 20,
      hitBox: { w: 40, h: 40 }
    });
  }

  // store for handlers
  canvas._densePoints = dense;
  canvas._markers = markers;

  // cache ImageData fallback and create ImageBitmap snapshot
  try { canvas._baseImage = ctx.getImageData(0, 0, Math.round(cssW * DPR), Math.round(cssH * DPR)); } catch (e) { canvas._baseImage = null; }
  try { canvas._baseBitmap = await createImageBitmap(canvas); } catch (e) { canvas._baseBitmap = null; }
}

// -----------------------------
// createBaseBitmapSnapshot
// -----------------------------
export async function createBaseBitmapSnapshot() {
  const canvas = document.getElementById("hourlyChart");
  if (!canvas) return;
  try {
    canvas._baseBitmap = await createImageBitmap(canvas);
    console.log("baseBitmap ready");
  } catch (e) {
    console.warn("createImageBitmap failed", e);
    canvas._baseBitmap = null;
  }
}

// -----------------------------
// setupHourlyHover
// -----------------------------
export function setupHourlyHover(temps, labels, conditions, symbol) {
  const canvas = document.getElementById("hourlyChart");
  const scroll = document.getElementById("hourlyScroll");
  const tooltip = document.getElementById("hourlyTooltip");
  if (!canvas || !scroll || !tooltip) return;
  const ctx = canvas.getContext("2d");
  if (!canvas._densePoints) return;

  const dense = canvas._densePoints;
  const markers = canvas._markers || [];
  const hourWidth = canvas._hourWidth || 80;
  const cssW = canvas._cssWidth || canvas.clientWidth;
  const DPR = canvas._DPR || window.devicePixelRatio || 1;
  const cssH = canvas._cssHeight || 120;

  // state
  const hover = { active: false, screenX: 0, screenY: 0 };
  let lastPointerX = null, lastPointerTime = 0;

  // unified animation state
  let scrollTarget = null;
  let dotWorldX = Math.max(0, Math.min(dense.length - 1, scroll.scrollLeft + (scroll.clientWidth / 2)));
  let dotY = (function(){ const s = sampleYAtWorldX(dotWorldX); return s != null ? s : cssH/2; })();
  let targetWorldX = dotWorldX;
  let targetY = dotY;
  let rafId = null;

  // marker lock state
  let markerLock = null; // { x, y, color, index }
  const MARKER_HYSTERESIS = 22; // px screen hysteresis to keep lock

  let pauseAutoScroll = false, pauseTimer = null;
  const PAUSE_MS = 180;
  const VELOCITY_THRESHOLD = 0.6;
  let userScrolling = false, userScrollTimer = null;
  const USER_SCROLL_IDLE = 220;

  function cancelAutoScroll() { scrollTarget = null; }
  function ensureRaf() { if (!rafId) rafId = requestAnimationFrame(unifiedStep); }

  // IMPORTANT: only allow JS auto-scroll when pointer is actively over the chart
  function easeScrollTo(target) {
    if (pauseAutoScroll || userScrolling || !hover.active) return;
    const maxLeft = Math.max(0, cssW - scroll.clientWidth);
    scrollTarget = Math.max(0, Math.min(maxLeft, target));
    ensureRaf();
  }

  function restoreBase() {
    if (canvas._baseBitmap) {
      ctx.save(); ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(canvas._baseBitmap, 0, 0, canvas.width, canvas.height);
      ctx.setTransform(DPR,0,0,DPR,0,0); ctx.restore();
      return true;
    }
    if (canvas._baseImage) {
      try { ctx.putImageData(canvas._baseImage, 0, 0); return true; } catch(e) {}
    }
    return false;
  }

  function drawDotAtScreenX(screenX, y, color = "#fff") {
    restoreBase();
    ctx.save(); ctx.setTransform(DPR,0,0,DPR,0,0);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(screenX, y, 6, 0, Math.PI*2);
    ctx.fill();
    if (color === "#fff") { ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.stroke(); }
    ctx.restore();
  }

  function sampleYAtWorldX(worldX) {
    const x = Math.max(0, Math.min(dense.length - 1, worldX));
    const i = Math.floor(x);
    const t = x - i;
    const a = dense[i];
    const b = dense[i + 1] || a;
    if (!a || a.y == null) return null;
    if (!b || b.y == null) return a.y;
    return a.y + (b.y - a.y) * t;
  }

  function clampIndex(i, len) { return Math.max(0, Math.min(len - 1, i)); }

  function computeTooltipLeftAndTransform(screenX) {
    const tipW = tooltip.getBoundingClientRect().width || 120;
    const half = tipW / 2;
    const minCenter = 6 + half;
    const maxCenter = scroll.clientWidth - 6 - half;
    if (screenX >= minCenter && screenX <= maxCenter) return { leftPx: screenX, useCenterTransform: true };
    return { leftPx: Math.max(minCenter, Math.min(maxCenter, screenX)), useCenterTransform: false };
  }

  function updateTooltipAndDraw(screenX, y, hourIndex, color = "#fff", markerType = null, markerTemp = null) {
    const { leftPx, useCenterTransform } = computeTooltipLeftAndTransform(screenX);
    if (markerType && markerTemp != null) {
      // marker tooltip (HIGH / LOW)
      tooltip.innerHTML = `<strong>${markerType.toUpperCase()}: ${Math.round(markerTemp)}${symbol}</strong>`;
    } else {
      tooltip.innerHTML = `<strong>${labels[hourIndex]}</strong><div>${Math.round(temps[hourIndex])}${symbol}</div>`;
    }
    tooltip.style.left = leftPx + "px";
    tooltip.style.top = (y - 20) + "px";
    tooltip.style.opacity = 1;
    tooltip.style.transform = useCenterTransform ? "translateX(-50%)" : "translateX(0)";
    drawDotAtScreenX(screenX, y, color);
  }

  // unified RAF: animate scroll and dot (X and Y)
  function unifiedStep() {
    // scroll easing
    if (scrollTarget !== null) {
      const cur = scroll.scrollLeft;
      const d = scrollTarget - cur;
      const sf = 0.12;
      if (Math.abs(d) < 0.5) { scroll.scrollLeft = scrollTarget; scrollTarget = null; }
      else scroll.scrollLeft = cur + d * sf;
    }

    // dot soft-snap X and Y (unless markerLock engaged, in which case targets are marker coords)
    const dx = targetWorldX - dotWorldX;
    const dy = targetY - dotY;
    const xf = 0.22, yf = 0.28;
    if (Math.abs(dx) > 0.25) dotWorldX += dx * xf; else dotWorldX = targetWorldX;
    if (Math.abs(dy) > 0.25) dotY += dy * yf; else dotY = targetY;

    if (hover.active) {
      const screenX = Math.max(0, Math.min(scroll.clientWidth, dotWorldX - scroll.scrollLeft));
      const hourIndex = clampIndex(Math.floor(dotWorldX / hourWidth + 0.5), temps.length);

      // color: marker color if locked, else white
      const color = markerLock ? (markerLock.color || "#fff") : "#fff";
      const markerType = markerLock ? markerLock.type : null;
      const markerTemp = markerLock ? markerLock.temp : null;
      updateTooltipAndDraw(screenX, dotY, hourIndex, color, markerType, markerTemp);
    }

    if (scrollTarget !== null || Math.abs(targetWorldX - dotWorldX) > 0.25 || Math.abs(targetY - dotY) > 0.25) {
      rafId = requestAnimationFrame(unifiedStep);
    } else {
      rafId = null;
    }
  }

  // pointer scheduling (pointermove covers mouse/touch/pen)
  function schedulePointerUpdate(screenX, screenY) {
    const now = performance.now();
    let velocity = 0;
    if (lastPointerX !== null) {
      const dx = Math.abs(screenX - lastPointerX);
      const dt = Math.max(1, now - lastPointerTime);
      velocity = dx / dt;
    }
    lastPointerX = screenX;
    lastPointerTime = now;

    // pause auto-scroll while moving fast
    if (velocity > VELOCITY_THRESHOLD) {
      pauseAutoScroll = true;
      cancelAutoScroll();
      clearTimeout(pauseTimer);
      pauseTimer = setTimeout(() => { pauseAutoScroll = false; }, PAUSE_MS);
    } else {
      clearTimeout(pauseTimer);
      pauseTimer = setTimeout(() => { pauseAutoScroll = false; }, PAUSE_MS);
    }

    hover.screenX = Math.max(0, Math.min(scroll.clientWidth, screenX));
    hover.screenY = screenY;
    hover.active = true;

    // world coordinate under pointer
    const worldFromPointer = scroll.scrollLeft + hover.screenX;

    // marker detection in SCREEN space (so scroll doesn't change hit detection)
    let foundMarker = null;
    for (const m of markers) {
      const markerScreenX = m.x - scroll.scrollLeft;
      const dxScreen = Math.abs(hover.screenX - markerScreenX);
      const dyScreen = Math.abs(hover.screenY - m.y);
      const radial = Math.hypot(dxScreen, dyScreen) <= (m.hitRadius || 0);
      const hw = (m.hitBox && m.hitBox.w) ? m.hitBox.w / 2 : 0;
      const rectHit = dxScreen <= hw && dyScreen <= (m.hitBox && m.hitBox.h ? m.hitBox.h / 2 : 0);
      if (radial || rectHit) { foundMarker = m; break; }
    }

    if (foundMarker) {
      // engage marker lock immediately: set targets to exact marker coords and snap dot to them
      markerLock = { x: foundMarker.x, y: foundMarker.y, color: foundMarker.color, index: foundMarker.index, type: foundMarker.type, temp: foundMarker.temp };
      targetWorldX = foundMarker.x;
      targetY = foundMarker.y;
      // snap immediately to avoid any sampling mismatch
      dotWorldX = targetWorldX;
      dotY = targetY;

      // nudge scroll if marker near edges (only if pointer is over chart)
      const markerScreenX = Math.max(0, Math.min(scroll.clientWidth, foundMarker.x - scroll.scrollLeft));
      const margin = 60, vw = scroll.clientWidth;
      if (!pauseAutoScroll && !userScrolling && hover.active) {
        if (markerScreenX < margin) easeScrollTo(Math.max(0, foundMarker.x - margin));
        else if (markerScreenX > vw - margin) easeScrollTo(Math.min(cssW - vw, foundMarker.x - (vw - margin)));
      }
    } else if (markerLock) {
      // if locked, check hysteresis in screen space; keep lock while pointer remains near marker
      const lockedScreenX = markerLock.x - scroll.scrollLeft;
      const lockedScreenY = markerLock.y;
      const dist = Math.hypot(hover.screenX - lockedScreenX, hover.screenY - lockedScreenY);
      if (dist <= MARKER_HYSTERESIS) {
        // keep lock: targets remain marker coords (no change)
        targetWorldX = markerLock.x;
        targetY = markerLock.y;
        // ensure dot is exactly on marker (prevent drift)
        dotWorldX = targetWorldX;
        dotY = targetY;
      } else {
        // release lock and fall back to pointer sampling
        markerLock = null;
        targetWorldX = Math.max(0, Math.min(dense.length - 1, worldFromPointer));
        const sampledY = sampleYAtWorldX(targetWorldX);
        targetY = sampledY != null ? sampledY : targetY;
      }
    } else {
      // normal pointer: pointer has priority
      targetWorldX = Math.max(0, Math.min(dense.length - 1, worldFromPointer));
      const sampledY = sampleYAtWorldX(targetWorldX);
      targetY = sampledY != null ? sampledY : targetY;

      const visibleX = hover.screenX, margin = 60, vw = scroll.clientWidth;
      if (!pauseAutoScroll && !userScrolling && hover.active) {
        if (visibleX < margin) easeScrollTo(Math.max(0, targetWorldX - margin));
        else if (visibleX > vw - margin) easeScrollTo(Math.min(cssW - vw, targetWorldX - (vw - margin)));
      }
    }

    ensureRaf();
  }

  // pointer handlers
  function onPointerMove(ev) {
    if (ev.isPrimary === false) return;
    const rect = canvas.getBoundingClientRect();
    const xInCanvas = ev.clientX - rect.left;
    const screenX = xInCanvas;
    const screenY = ev.clientY - rect.top;
    schedulePointerUpdate(screenX, screenY);
  }

  function onPointerLeave() {
    hover.active = false;
    tooltip.style.opacity = 0;
    restoreBase();
    clearTimeout(pauseTimer);
    pauseAutoScroll = false;
    markerLock = null;
  }

  function onUserScroll() {
    userScrolling = true;
    cancelAutoScroll();
    clearTimeout(userScrollTimer);
    userScrollTimer = setTimeout(() => { userScrolling = false; }, USER_SCROLL_IDLE);
  }

  // attach pointer handlers (avoid duplicates)
  canvas.removeEventListener("pointermove", canvas._hourlyPointerMove);
  canvas.removeEventListener("pointerleave", canvas._hourlyPointerLeave);
  canvas._hourlyPointerMove = onPointerMove;
  canvas._hourlyPointerLeave = onPointerLeave;
  canvas.addEventListener("pointermove", onPointerMove, { passive: true });
  canvas.addEventListener("pointerleave", onPointerLeave, { passive: true });

  // user scroll detection
  scroll.removeEventListener("wheel", scroll._hourlyWheel);
  scroll._hourlyWheel = onUserScroll;
  scroll.addEventListener("wheel", onUserScroll, { passive: true });

  scroll.removeEventListener("pointerdown", scroll._hourlyPointerDown);
  scroll._hourlyPointerDown = onUserScroll;
  scroll.addEventListener("pointerdown", scroll._hourlyPointerDown, { passive: true });

  scroll.removeEventListener("scroll", scroll._hourlyScroll);
  scroll._hourlyScroll = () => {
    userScrolling = true;
    cancelAutoScroll();
    clearTimeout(userScrollTimer);
    userScrollTimer = setTimeout(() => { userScrolling = false; }, USER_SCROLL_IDLE);
  };
  scroll.addEventListener("scroll", scroll._hourlyScroll, { passive: true });

  scroll.removeEventListener("touchmove", scroll._hourlyTouchMove);
  scroll._hourlyTouchMove = () => {
    userScrolling = true;
    cancelAutoScroll();
    clearTimeout(userScrollTimer);
    userScrollTimer = setTimeout(() => { userScrolling = false; }, USER_SCROLL_IDLE);
  };
  scroll.addEventListener("touchmove", scroll._hourlyTouchMove, { passive: true });

  // helper used inside this scope
  function sampleYAtWorldX(worldX) {
    const x = Math.max(0, Math.min(dense.length - 1, worldX));
    const i = Math.floor(x);
    const t = x - i;
    const a = dense[i];
    const b = dense[i + 1] || a;
    if (!a || a.y == null) return null;
    if (!b || b.y == null) return a.y;
    return a.y + (b.y - a.y) * t;
  }
}

// -----------------------------
// setupHourlyTap
// -----------------------------
export function setupHourlyTap(temps, labels, conditions, symbol) {
  const canvas = document.getElementById("hourlyChart");
  const scroll = document.getElementById("hourlyScroll");
  const tooltip = document.getElementById("hourlyTooltip");
  if (!canvas || !scroll || !tooltip) return;
  const ctx = canvas.getContext("2d");
  if (!canvas._densePoints) return;

  const dense = canvas._densePoints;
  const markers = canvas._markers || [];
  const hourWidth = canvas._hourWidth || 80;
  const cssW = canvas._cssWidth || canvas.clientWidth;
  const DPR = canvas._DPR || window.devicePixelRatio || 1;
  const cssH = canvas._cssHeight || 120;

  let pauseAutoScroll = false, pauseTimer = null;
  const PAUSE_MS = 180;
  let userScrolling = false, userScrollTimer = null;
  const USER_SCROLL_IDLE = 220;

  let scrollTarget = null, rafId = null;

  function cancelAutoScroll() {
    scrollTarget = null;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function easeScrollTo(target, keepScreenX = null) {
    if (pauseAutoScroll || userScrolling) return;
    const maxLeft = Math.max(0, cssW - scroll.clientWidth);
    scrollTarget = Math.max(0, Math.min(maxLeft, target));
    if (rafId) return;
    function step() {
      if (scrollTarget === null) { rafId = null; return; }
      const cur = scroll.scrollLeft;
      const d = scrollTarget - cur;
      const f = 0.12;
      if (Math.abs(d) < 0.5) { scroll.scrollLeft = scrollTarget; scrollTarget = null; rafId = null; return; }
      scroll.scrollLeft = cur + d * f;
      if (keepScreenX !== null) {
        const worldX = scroll.scrollLeft + keepScreenX;
        const y = sampleYAtWorldX(worldX);
        if (y != null) {
          const hourIndex = Math.max(0, Math.min(temps.length - 1, Math.floor(worldX / hourWidth + 0.5)));
          tooltip.innerHTML = `<strong>${labels[hourIndex]}</strong><div>${Math.round(temps[hourIndex])}${symbol}</div>`;
          tooltip.style.left = clampTooltipLeft(keepScreenX) + "px";
          tooltip.style.top = (y - 20) + "px";
          tooltip.style.opacity = 1;
          drawDotAtScreenX(keepScreenX, y, "#fff");
        }
      }
      rafId = requestAnimationFrame(step);
    }
    rafId = requestAnimationFrame(step);
  }

  function restoreBase() {
    if (canvas._baseBitmap) {
      ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(canvas._baseBitmap, 0, 0, canvas.width, canvas.height);
      ctx.setTransform(DPR,0,0,DPR,0,0); ctx.restore();
      return true;
    }
    if (canvas._baseImage) {
      try { ctx.putImageData(canvas._baseImage, 0, 0); return true; } catch(e) {}
    }
    return false;
  }

  function sampleYAtWorldX(worldX) {
    const x = Math.max(0, Math.min(dense.length - 1, worldX));
    const i = Math.floor(x);
    const t = x - i;
    const a = dense[i], b = dense[i+1] || a;
    if (!a || a.y == null) return null;
    if (!b || b.y == null) return a.y;
    return a.y + (b.y - a.y) * t;
  }

  function drawDotAtScreenX(screenX, y, color = "#fff") {
    restoreBase();
    ctx.save(); ctx.setTransform(DPR,0,0,DPR,0,0);
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(screenX, y, 6, 0, Math.PI*2); ctx.fill();
    if (color === "#fff") { ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.stroke(); }
    ctx.restore();
  }

  function clampTooltipLeft(screenX) {
    const tipW = tooltip.getBoundingClientRect().width || 120;
    const half = tipW / 2;
    const minCenter = 6 + half;
    const maxCenter = scroll.clientWidth - 6 - half;
    if (screenX >= minCenter && screenX <= maxCenter) {
      tooltip.style.transform = "translateX(-50%)";
      return screenX;
    }
    tooltip.style.transform = "translateX(0)";
    return Math.max(minCenter, Math.min(maxCenter, screenX));
  }

  function pauseBriefly() {
    pauseAutoScroll = true;
    clearTimeout(pauseTimer);
    pauseTimer = setTimeout(() => { pauseAutoScroll = false; }, PAUSE_MS);
  }

  function onUserScroll() {
    userScrolling = true;
    cancelAutoScroll();
    clearTimeout(userScrollTimer);
    userScrollTimer = setTimeout(() => { userScrolling = false; }, USER_SCROLL_IDLE);
  }

  function onPointerDown(ev) {
    if (ev.isPrimary === false) return;
    const rect = canvas.getBoundingClientRect();
    const xInCanvas = ev.clientX - rect.left;
    const screenX = Math.max(0, Math.min(scroll.clientWidth, xInCanvas));
    const canvasY = ev.clientY - rect.top;
    const worldX = scroll.scrollLeft + screenX;

    pauseBriefly();

    // marker priority: detect in screen space
    for (const m of markers) {
      const markerScreenX = m.x - scroll.scrollLeft;
      const dx = Math.abs(screenX - markerScreenX), dy = Math.abs(canvasY - m.y);
      if (Math.hypot(dx,dy) <= (m.hitRadius||0) || (dx <= (m.hitBox?.w||0)/2 && dy <= (m.hitBox?.h||0)/2)) {
        // snap exactly to marker and use its color and tooltip label
        const label = m.type === "high" ? `HIGH: ${Math.round(m.temp)}${symbol}` : `LOW: ${Math.round(m.temp)}${symbol}`;
        tooltip.innerHTML = `<strong>${label}</strong>`;
        tooltip.style.left = clampTooltipLeft(markerScreenX) + "px";
        tooltip.style.top = (m.y - 20) + "px";
        tooltip.style.opacity = 1;
        drawDotAtScreenX(markerScreenX, m.y, m.color || "#fff");

        const visibleX = markerScreenX, margin = 60, vw = scroll.clientWidth;
        if (!pauseAutoScroll && !userScrolling) {
          if (visibleX < margin) easeScrollTo(Math.max(0, m.x - margin), markerScreenX);
          else if (visibleX > vw - margin) easeScrollTo(Math.min(cssW - vw, m.x - (vw - margin)), markerScreenX);
        }
        return;
      }
    }

    // normal line tap
    const y = sampleYAtWorldX(worldX);
    if (y == null) { tooltip.style.opacity = 0; restoreBase(); return; }
    if (Math.abs(canvasY - y) > 60) { tooltip.style.opacity = 0; restoreBase(); return; }

    const hourIndex = Math.max(0, Math.min(temps.length - 1, Math.floor(worldX / hourWidth + 0.5)));
    tooltip.innerHTML = `<strong>${labels[hourIndex]}</strong><div>${Math.round(temps[hourIndex])}${symbol}</div>`;
    tooltip.style.left = clampTooltipLeft(screenX) + "px";
    tooltip.style.top = (y - 20) + "px";
    tooltip.style.opacity = 1;

    const visibleX = screenX, margin = 60, vw = scroll.clientWidth;
    if (!pauseAutoScroll && !userScrolling) {
      if (visibleX < margin) easeScrollTo(Math.max(0, worldX - margin), screenX);
      else if (visibleX > vw - margin) easeScrollTo(Math.min(cssW - vw, worldX - (vw - margin)), screenX);
    }

    drawDotAtScreenX(screenX, y, "#fff");
  }

  canvas.removeEventListener("pointerdown", canvas._hourlyTapHandler);
  canvas._hourlyTapHandler = onPointerDown;
  canvas.addEventListener("pointerdown", onPointerDown, { passive: false });

  scroll.removeEventListener("wheel", scroll._hourlyWheel);
  scroll._hourlyWheel = onUserScroll;
  scroll.addEventListener("wheel", onUserScroll, { passive: true });

  scroll.removeEventListener("pointerdown", scroll._hourlyPointerDown);
  scroll._hourlyPointerDown = onUserScroll;
  scroll.addEventListener("pointerdown", scroll._hourlyPointerDown, { passive: true });

  scroll.removeEventListener("scroll", scroll._hourlyScroll);
  scroll._hourlyScroll = () => {
    userScrolling = true;
    cancelAutoScroll();
    clearTimeout(userScrollTimer);
    userScrollTimer = setTimeout(() => { userScrolling = false; }, USER_SCROLL_IDLE);
  };
  scroll.addEventListener("scroll", scroll._hourlyScroll, { passive: true });

  scroll.removeEventListener("touchmove", scroll._hourlyTouchMove);
  scroll._hourlyTouchMove = () => {
    userScrolling = true;
    cancelAutoScroll();
    clearTimeout(userScrollTimer);
    userScrollTimer = setTimeout(() => { userScrolling = false; }, USER_SCROLL_IDLE);
  };
  scroll.addEventListener("touchmove", scroll._hourlyTouchMove, { passive: true });
}

// -----------------------------
// buildDaily
// -----------------------------
export function buildDaily(daily) {
  const dailyForecastEl = document.getElementById("dailyForecast");
  if (!dailyForecastEl) return;
  dailyForecastEl.innerHTML = "";
  const units = getUnitParams();

  if (!daily || !daily.time) return;

  for (let i = 0; i < daily.time.length; i++) {
    const row = document.createElement("div");
    row.className = "daily-row";
    const date = new Date(daily.time[i]).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric"
    });
    row.innerHTML = `
      <div>${date}</div>
      <div>${Math.round(daily.temperature_2m_max[i])}${units.tempSymbol} /
           ${Math.round(daily.temperature_2m_min[i])}${units.tempSymbol}</div>
      <div>${WEATHER_TEXT[daily.weather_code[i]] || "—"}</div>
    `;
    dailyForecastEl.appendChild(row);
  }
}
