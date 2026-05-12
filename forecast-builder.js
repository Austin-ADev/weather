// forecast-builder.js
// Fixed forecast builder: consistent world coords, device-pixel-safe dot drawing,
// marker lock + color, and targeted logging.
//
// Exports: buildHourly, drawHourlyChart, createBaseBitmapSnapshot, setupHourlyHover, setupHourlyTap, buildDaily

import { getUnitParams } from './utils.js';
import { WEATHER_TEXT } from './constants.js';

// -----------------------------
// buildHourly
// -----------------------------
export async function buildHourly(hourly, timezone) {
  console.log("[FB] buildHourly() start", { hasHourly: !!hourly, timezone });
  const forecastEl = document.getElementById("forecast");
  if (!forecastEl) { console.warn("[FB] buildHourly: #forecast not found"); return; }
  forecastEl.innerHTML = "";
  const units = getUnitParams();
  if (!hourly || !hourly.time) { console.warn("[FB] buildHourly: hourly missing"); return; }

  const now = new Date().toLocaleString("en-US", { timeZone: timezone });
  const currentHour = new Date(now).getHours();

  let startIndex = hourly.time.findIndex(t => new Date(t).getHours() === currentHour);
  if (startIndex < 0) startIndex = 0;
  const endIndex = Math.min(startIndex + 24, hourly.time.length);

  const temps = [], labels = [], conditions = [];
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
  try { await createBaseBitmapSnapshot(); } catch (e) { console.warn("[FB] createBaseBitmapSnapshot failed", e); }
  try { setupHourlyHover(temps, labels, conditions, units.tempSymbol); } catch (e) { console.warn("[FB] setupHourlyHover failed", e); }
  try { setupHourlyTap(temps, labels, conditions, units.tempSymbol); } catch (e) { console.warn("[FB] setupHourlyTap failed", e); }

  console.log("[FB] buildHourly() done");
}

// -----------------------------
// drawHourlyChart
// -----------------------------
export async function drawHourlyChart(temps, labels, symbol, conditions) {
  console.log("[FB] drawHourlyChart() start", { tempsLen: temps.length });
  const canvas = document.getElementById("hourlyChart");
  if (!canvas) { console.warn("[FB] drawHourlyChart: #hourlyChart not found"); return; }
  const ctx = canvas.getContext("2d");
  if (!ctx) { console.warn("[FB] drawHourlyChart: 2d context not available"); return; }

  // CSS layout sizes (we treat dense sampling in CSS pixels)
  const hourWidth = 80; // CSS px per hour
  const cssH = 120;
  const cssW = Math.round(hourWidth * temps.length);
  const DPR = window.devicePixelRatio || 1;

  // set CSS size and backing store size
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  canvas.width = Math.round(cssW * DPR);
  canvas.height = Math.round(cssH * DPR);

  // store for handlers
  canvas._cssWidth = cssW;
  canvas._cssHeight = cssH;
  canvas._DPR = DPR;
  canvas._hourWidth = hourWidth;

  console.log("[FB] canvas sizing", { cssW, cssH, DPR, backingW: canvas.width, backingH: canvas.height });

  // draw in CSS pixels for sampling, but remember backing store is device pixels
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const w = cssW, h = cssH, pad = 20;
  const max = Math.max(...temps), min = Math.min(...temps);
  console.log("[FB] temps range", { min, max });

  // dense sampling: one sample per CSS pixel
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

  console.log("[FB] dense sampling complete", { denseLen: dense.length, expected: cssW });
  // draw polyline (CSS pixels)
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

  console.log("[FB] markers stored", { markers });

  // cache ImageData fallback and create ImageBitmap snapshot (device pixels)
  try { canvas._baseImage = ctx.getImageData(0, 0, Math.round(cssW * DPR), Math.round(cssH * DPR)); } catch (e) { canvas._baseImage = null; console.warn("[FB] getImageData failed", e); }
  try { canvas._baseBitmap = await createImageBitmap(canvas); } catch (e) { canvas._baseBitmap = null; console.warn("[FB] createImageBitmap failed", e); }

  console.log("[FB] drawHourlyChart() done");
}

// -----------------------------
// createBaseBitmapSnapshot
// -----------------------------
export async function createBaseBitmapSnapshot() {
  const canvas = document.getElementById("hourlyChart");
  if (!canvas) return;
  try {
    canvas._baseBitmap = await createImageBitmap(canvas);
    console.log("[FB] baseBitmap ready");
  } catch (e) {
    console.warn("[FB] createBaseBitmapSnapshot failed", e);
    canvas._baseBitmap = null;
  }
}

// -----------------------------
// setupHourlyHover
// -----------------------------
export function setupHourlyHover(temps, labels, conditions, symbol) {
  console.log("[FB] setupHourlyHover() start", { tempsLen: temps.length });
  const canvas = document.getElementById("hourlyChart");
  const scroll = document.getElementById("hourlyScroll");
  const tooltip = document.getElementById("hourlyTooltip");
  if (!canvas || !scroll || !tooltip) { console.warn("[FB] setupHourlyHover: missing DOM elements"); return; }
  const ctx = canvas.getContext("2d");
  if (!canvas._densePoints) { console.warn("[FB] setupHourlyHover: canvas._densePoints missing"); return; }

  const dense = canvas._densePoints;
  const markers = canvas._markers || [];
  const hourWidth = canvas._hourWidth || 80;
  const cssW = canvas._cssWidth || canvas.clientWidth;
  const DPR = canvas._DPR || window.devicePixelRatio || 1;
  const cssH = canvas._cssHeight || 120;

  console.log("[FB] hover init", { cssW, cssH, hourWidth, DPR, denseLen: dense.length, markers });

  // state (world coords)
  const hover = { active: false, screenX: 0, screenY: 0 };
  let lastPointerX = null, lastPointerTime = 0;

  // world-based dot state
  let dotWorldX = Math.max(0, Math.min(dense.length - 1, scroll.scrollLeft + (scroll.clientWidth / 2)));
  let dotY = sampleYAtWorldX(dotWorldX) ?? cssH / 2;
  let targetWorldX = dotWorldX;
  let targetY = dotY;
  let rafId = null;

  // marker lock
  let markerLock = null;
  const MARKER_HYSTERESIS = 22;

  let pauseAutoScroll = false, pauseTimer = null;
  const PAUSE_MS = 180;
  const VELOCITY_THRESHOLD = 0.6;
  let userScrolling = false, userScrollTimer = null;
  const USER_SCROLL_IDLE = 220;

  function cancelAutoScroll() { scrollTarget = null; }
  function ensureRaf() { if (!rafId) rafId = requestAnimationFrame(unifiedStep); }

  // easeScrollTo expects a worldX target (left position)
  let scrollTarget = null;
  function easeScrollTo(worldLeftTarget) {
    if (pauseAutoScroll || userScrolling || !hover.active) {
      console.log("[FB] easeScrollTo blocked", { pauseAutoScroll, userScrolling, hoverActive: hover.active });
      return;
    }
    const maxLeft = Math.max(0, cssW - scroll.clientWidth);
    scrollTarget = Math.max(0, Math.min(maxLeft, worldLeftTarget));
    console.log("[FB] easeScrollTo -> scrollTarget", { scrollTarget, maxLeft });
    ensureRaf();
  }

  // restore base: draw cached base bitmap (device pixels) into backing store
  function restoreBase() {
    if (canvas._baseBitmap) {
      // draw base bitmap in device pixels
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      try {
        ctx.drawImage(canvas._baseBitmap, 0, 0, canvas.width, canvas.height);
      } catch (e) {
        // fallback to putImageData if drawImage fails
        if (canvas._baseImage) {
          try { ctx.putImageData(canvas._baseImage, 0, 0); } catch (ee) { /* ignore */ }
        }
      }
      // restore CSS-pixel transform for subsequent sampling/drawing convenience
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.restore();
      return true;
    }
    if (canvas._baseImage) {
      try {
        ctx.putImageData(canvas._baseImage, 0, 0);
        return true;
      } catch (e) { /* ignore */ }
    }
    return false;
  }

  // draw dot using device pixels to avoid transform mismatch
  function drawDotAtScreenX(screenX_css, y_css, color = "#fff") {
    // screenX_css and y_css are CSS pixels relative to scroll container
    // convert to device pixels
    const sx = Math.round(screenX_css * DPR);
    const sy = Math.round(y_css * DPR);
    const radius = Math.max(1, Math.round(6 * DPR));

    // draw base bitmap first in device pixels
    if (canvas._baseBitmap) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      try { ctx.drawImage(canvas._baseBitmap, 0, 0, canvas.width, canvas.height); } catch (e) {
        if (canvas._baseImage) try { ctx.putImageData(canvas._baseImage, 0, 0); } catch (ee) {}
      }
      // draw dot in device pixels
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
      if (color === "#fff") {
        ctx.lineWidth = Math.max(1, Math.round(1.5 * DPR));
        ctx.strokeStyle = "rgba(0,0,0,0.18)";
        ctx.stroke();
      }
      // restore CSS transform for other code that expects it
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.restore();
    } else {
      // fallback: draw using CSS transform (less robust)
      ctx.save();
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(screenX_css, y_css, 6, 0, Math.PI * 2);
      ctx.fill();
      if (color === "#fff") { ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.stroke(); }
      ctx.restore();
    }

    console.log("[FB] drawDot", { screenX_css, y_css, color, dotWorldX, scrollLeft: scroll.scrollLeft, DPR });
  }

  // sample in world coords (CSS pixels)
  function sampleYAtWorldX(worldX) {
    const x = Math.max(0, Math.min(dense.length - 1, worldX));
    const i = Math.floor(x);
    const t = x - i;
    const a = dense[i];
    const b = dense[i + 1] || a;
    if (!a || a.y == null) { console.log("[FB] sampleYAtWorldX -> null (a missing)", { worldX, i }); return null; }
    if (!b || b.y == null) { console.log("[FB] sampleYAtWorldX -> a.y (b missing)", { worldX, i, aY: a.y }); return a.y; }
    const y = a.y + (b.y - a.y) * t;
    // occasional debug neighborhood
    if (Math.abs(worldX - dotWorldX) < 2) {
      console.log("[FB] sampleYAtWorldX neighborhood", { worldX, i, t, aY: a.y, bY: b.y, resultY: y });
    }
    return y;
  }

  function clampIndex(i, len) { return Math.max(0, Math.min(len - 1, i)); }

  // tooltip placement clamps to visible area but does not affect dot drawing
  function computeTooltipLeftAndTransform(screenX) {
    const tipW = tooltip.getBoundingClientRect().width || 120;
    const half = tipW / 2;
    const minCenter = 6 + half;
    const maxCenter = scroll.clientWidth - 6 - half;
    if (screenX >= minCenter && screenX <= maxCenter) return { leftPx: screenX, useCenterTransform: true };
    return { leftPx: Math.max(minCenter, Math.min(maxCenter, screenX)), useCenterTransform: false };
  }

  function updateTooltipAndDraw(screenX_css, y_css, hourIndex, color = "#fff", markerType = null, markerTemp = null) {
    const { leftPx, useCenterTransform } = computeTooltipLeftAndTransform(screenX_css);
    if (markerType && markerTemp != null) {
      tooltip.innerHTML = `<strong>${markerType.toUpperCase()}: ${Math.round(markerTemp)}${symbol}</strong>`;
    } else {
      tooltip.innerHTML = `<strong>${labels[hourIndex]}</strong><div>${Math.round(temps[hourIndex])}${symbol}</div>`;
    }
    tooltip.style.left = leftPx + "px";
    tooltip.style.top = (y_css - 20) + "px";
    tooltip.style.opacity = 1;
    tooltip.style.transform = useCenterTransform ? "translateX(-50%)" : "translateX(0)";
    drawDotAtScreenX(screenX_css, y_css, color);
  }

  // unified RAF: animate scroll and dot (world coords)
  function unifiedStep() {
    // scroll easing (scrollTarget is world-left)
    if (scrollTarget !== null) {
      const cur = scroll.scrollLeft;
      const d = scrollTarget - cur;
      const sf = 0.12;
      if (Math.abs(d) < 0.5) { scroll.scrollLeft = scrollTarget; scrollTarget = null; }
      else scroll.scrollLeft = cur + d * sf;
    }

    // dot soft-snap X and Y (unless markerLock engaged)
    const dx = targetWorldX - dotWorldX;
    const dy = targetY - dotY;
    const xf = 0.22, yf = 0.28;
    if (Math.abs(dx) > 0.25) dotWorldX += dx * xf; else dotWorldX = targetWorldX;
    if (Math.abs(dy) > 0.25) dotY += dy * yf; else dotY = targetY;

    if (hover.active) {
      // compute screenX from world coords (do NOT clamp)
      const screenX_css = dotWorldX - scroll.scrollLeft;
      const hourIndex = clampIndex(Math.floor(dotWorldX / hourWidth + 0.5), temps.length);

      // color: marker color if locked, else white
      const color = markerLock ? (markerLock.color || "#fff") : "#fff";
      const markerType = markerLock ? markerLock.type : null;
      const markerTemp = markerLock ? markerLock.temp : null;
      updateTooltipAndDraw(screenX_css, dotY, hourIndex, color, markerType, markerTemp);
    }

    if (scrollTarget !== null || Math.abs(targetWorldX - dotWorldX) > 0.25 || Math.abs(targetY - dotY) > 0.25) {
      rafId = requestAnimationFrame(unifiedStep);
    } else {
      rafId = null;
    }
  }

  // pointer scheduling
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

    if (velocity > VELOCITY_THRESHOLD) {
      pauseAutoScroll = true;
      cancelAutoScroll();
      clearTimeout(pauseTimer);
      pauseTimer = setTimeout(() => { pauseAutoScroll = false; }, PAUSE_MS);
      console.log("[FB] pointer velocity high, pausing auto-scroll", { velocity });
    } else {
      clearTimeout(pauseTimer);
      pauseTimer = setTimeout(() => { pauseAutoScroll = false; }, PAUSE_MS);
    }

    hover.screenX = screenX;
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

    console.log("[FB] pointer", { screenX, screenY, worldFromPointer, foundMarker: !!foundMarker, markerLock: !!markerLock });

    if (foundMarker) {
      // engage marker lock: exact world coords
      markerLock = { x: foundMarker.x, y: foundMarker.y, color: foundMarker.color, index: foundMarker.index, type: foundMarker.type, temp: foundMarker.temp };
      targetWorldX = foundMarker.x;
      targetY = foundMarker.y;
      // snap immediately
      dotWorldX = targetWorldX;
      dotY = targetY;
      console.log("[FB] markerLock ENGAGED", markerLock);

      // nudge scroll if marker near edges (only while hovering)
      const markerScreenX = foundMarker.x - scroll.scrollLeft;
      const margin = 60, vw = scroll.clientWidth;
      if (!pauseAutoScroll && !userScrolling && hover.active) {
        if (markerScreenX < margin) easeScrollTo(Math.max(0, foundMarker.x - margin));
        else if (markerScreenX > vw - margin) easeScrollTo(Math.min(cssW - vw, foundMarker.x - (vw - margin)));
      }
    } else if (markerLock) {
      // maintain lock while pointer remains near marker (hysteresis)
      const lockedScreenX = markerLock.x - scroll.scrollLeft;
      const lockedScreenY = markerLock.y;
      const dist = Math.hypot(hover.screenX - lockedScreenX, hover.screenY - lockedScreenY);
      if (dist <= MARKER_HYSTERESIS) {
        targetWorldX = markerLock.x;
        targetY = markerLock.y;
        dotWorldX = targetWorldX;
        dotY = targetY;
        // keep lock
      } else {
        console.log("[FB] markerLock RELEASED", { dist, MARKER_HYSTERESIS });
        markerLock = null;
        targetWorldX = Math.max(0, Math.min(dense.length - 1, worldFromPointer));
        const sampledY = sampleYAtWorldX(targetWorldX);
        targetY = sampledY != null ? sampledY : targetY;
      }
    } else {
      // normal pointer: set target in world coords
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
    console.log("[FB] pointer left chart, cleared hover and markerLock");
  }

  function onUserScroll() {
    userScrolling = true;
    cancelAutoScroll();
    clearTimeout(userScrollTimer);
    userScrollTimer = setTimeout(() => { userScrolling = false; }, USER_SCROLL_IDLE);
    console.log("[FB] user scroll detected");
  }

  // attach handlers (avoid duplicates)
  canvas.removeEventListener("pointermove", canvas._hourlyPointerMove);
  canvas.removeEventListener("pointerleave", canvas._hourlyPointerLeave);
  canvas._hourlyPointerMove = onPointerMove;
  canvas._hourlyPointerLeave = onPointerLeave;
  canvas.addEventListener("pointermove", onPointerMove, { passive: true });
  canvas.addEventListener("pointerleave", onPointerLeave, { passive: true });

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
    console.log("[FB] native scroll event");
  };
  scroll.addEventListener("scroll", scroll._hourlyScroll, { passive: true });

  scroll.removeEventListener("touchmove", scroll._hourlyTouchMove);
  scroll._hourlyTouchMove = () => {
    userScrolling = true;
    cancelAutoScroll();
    clearTimeout(userScrollTimer);
    userScrollTimer = setTimeout(() => { userScrolling = false; }, USER_SCROLL_IDLE);
    console.log("[FB] touchmove detected");
  };
  scroll.addEventListener("touchmove", scroll._hourlyTouchMove, { passive: true });

  console.log("[FB] setupHourlyHover() done");
}

// -----------------------------
// setupHourlyTap
// -----------------------------
export function setupHourlyTap(temps, labels, conditions, symbol) {
  console.log("[FB] setupHourlyTap() start");
  const canvas = document.getElementById("hourlyChart");
  const scroll = document.getElementById("hourlyScroll");
  const tooltip = document.getElementById("hourlyTooltip");
  if (!canvas || !scroll || !tooltip) { console.warn("[FB] setupHourlyTap: missing DOM elements"); return; }
  const ctx = canvas.getContext("2d");
  if (!canvas._densePoints) { console.warn("[FB] setupHourlyTap: canvas._densePoints missing"); return; }

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

  function cancelAutoScroll() { scrollTarget = null; if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

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
      try { ctx.drawImage(canvas._baseBitmap, 0, 0, canvas.width, canvas.height); } catch (e) {
        if (canvas._baseImage) try { ctx.putImageData(canvas._baseImage, 0, 0); } catch (ee) {}
      }
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
    // device-pixel-safe draw (same approach as hover)
    const DPR = canvas._DPR || window.devicePixelRatio || 1;
    const sx = Math.round(screenX * DPR);
    const sy = Math.round(y * DPR);
    const radius = Math.max(1, Math.round(6 * DPR));
    if (canvas._baseBitmap) {
      ctx.save(); ctx.setTransform(1,0,0,1,0,0);
      try { ctx.drawImage(canvas._baseBitmap, 0, 0, canvas.width, canvas.height); } catch (e) {
        if (canvas._baseImage) try { ctx.putImageData(canvas._baseImage, 0, 0); } catch (ee) {}
      }
      ctx.beginPath(); ctx.fillStyle = color; ctx.arc(sx, sy, radius, 0, Math.PI*2); ctx.fill();
      if (color === "#fff") { ctx.lineWidth = Math.max(1, Math.round(1.5 * DPR)); ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.stroke(); }
      ctx.setTransform(DPR,0,0,DPR,0,0); ctx.restore();
    } else {
      ctx.save(); ctx.setTransform(DPR,0,0,DPR,0,0);
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(screenX, y, 6, 0, Math.PI*2); ctx.fill();
      if (color === "#fff") { ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.stroke(); }
      ctx.restore();
    }
    console.log("[FB] tap drawDot", { screenX, y, color, scrollLeft: scroll.scrollLeft });
  }

  function clampTooltipLeft(screenX) {
    const tipW = tooltip.getBoundingClientRect().width || 120;
    const half = tipW / 2;
    const minCenter = 6 + half;
    const maxCenter = scroll.clientWidth - 6 - half;
    if (screenX >= minCenter && screenX <= maxCenter) { tooltip.style.transform = "translateX(-50%)"; return screenX; }
    tooltip.style.transform = "translateX(0)"; return Math.max(minCenter, Math.min(maxCenter, screenX));
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
    const screenX = xInCanvas;
    const canvasY = ev.clientY - rect.top;
    const worldX = scroll.scrollLeft + screenX;

    pauseBriefly();

    // marker priority (screen space)
    for (const m of markers) {
      const markerScreenX = m.x - scroll.scrollLeft;
      const dx = Math.abs(screenX - markerScreenX), dy = Math.abs(canvasY - m.y);
      if (Math.hypot(dx,dy) <= (m.hitRadius||0) || (dx <= (m.hitBox?.w||0)/2 && dy <= (m.hitBox?.h||0)/2)) {
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
        console.log("[FB] tap hit marker", m);
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
    console.log("[FB] tap normal point", { hourIndex, y });
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

  console.log("[FB] setupHourlyTap() done");
}

// -----------------------------
// buildDaily
// -----------------------------
export function buildDaily(daily) {
  const dailyForecastEl = document.getElementById("dailyForecast");
  if (!dailyForecastEl) { console.warn("[FB] buildDaily: #dailyForecast not found"); return; }
  dailyForecastEl.innerHTML = "";
  const units = getUnitParams();
  if (!daily || !daily.time) return;

  for (let i = 0; i < daily.time.length; i++) {
    const row = document.createElement("div");
    row.className = "daily-row";
    const date = new Date(daily.time[i]).toLocaleDateString(undefined, {
      weekday: "short", month: "short", day: "numeric"
    });
    row.innerHTML = `
      <div>${date}</div>
      <div>${Math.round(daily.temperature_2m_max[i])}${units.tempSymbol} /
           ${Math.round(daily.temperature_2m_min[i])}${units.tempSymbol}</div>
      <div>${WEATHER_TEXT[daily.weather_code[i]] || "—"}</div>
    `;
    dailyForecastEl.appendChild(row);
  }
  console.log("[FB] buildDaily done", { days: daily.time.length });
}
