// forecast-builder.js
// Reworked implementation: single canonical "world" coordinate system (CSS pixels),
// dense sampling that covers the entire canvas, robust interpolation, marker hitboxes,
// marker lock with color + label, tooltip positioned above the dot (not covering it),
// device-pixel-safe drawing, and extensive targeted logging to diagnose remaining issues.
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
  if (!forecastEl) {
    console.warn("[FB] buildHourly: #forecast not found");
    return;
  }
  forecastEl.innerHTML = "";
  const units = getUnitParams();
  if (!hourly || !hourly.time) {
    console.warn("[FB] buildHourly: hourly data missing or malformed");
    return;
  }

  // Determine a sensible start index (attempt to align with local "current hour")
  let startIndex = 0;
  try {
    const now = new Date().toLocaleString("en-US", { timeZone: timezone });
    const currentHour = new Date(now).getHours();
    const found = hourly.time.findIndex(t => new Date(t).getHours() === currentHour);
    if (found >= 0) startIndex = found;
  } catch (e) {
    console.warn("[FB] buildHourly: timezone parsing failed", e);
  }

  const endIndex = Math.min(startIndex + 24, hourly.time.length);

  const temps = [];
  const labels = [];
  const conditions = [];
  const hourTimes = [];

  for (let i = startIndex; i < endIndex; i++) {
    const dt = new Date(hourly.time[i]);
    const hourLabel = dt.toLocaleTimeString([], { hour: "numeric" });
    temps.push(hourly.temperature_2m[i]);
    labels.push(hourLabel);
    conditions.push(WEATHER_TEXT[hourly.weather_code[i]] || "—");
    hourTimes.push(hourly.time[i]);

    const row = document.createElement("div");
    row.className = "forecast-hour";
    row.innerHTML = `
      <div>${hourLabel}</div>
      <div>${Math.round(hourly.temperature_2m[i])}${units.tempSymbol}</div>
      <div>${WEATHER_TEXT[hourly.weather_code[i]] || "—"}</div>
    `;
    forecastEl.appendChild(row);
  }

  console.log("[FB] buildHourly -> drawHourlyChart", { tempsLen: temps.length, startIndex, endIndex });
  await drawHourlyChart(temps, labels, units.tempSymbol, conditions);

  // store original timestamps for diagnostics and accurate labels
  const canvas = document.getElementById("hourlyChart");
  if (canvas) canvas._hourTimes = hourTimes;

  try { await createBaseBitmapSnapshot(); } catch (e) { console.warn("[FB] createBaseBitmapSnapshot failed", e); }
  try { setupHourlyHover(temps, labels, conditions, units.tempSymbol); } catch (e) { console.warn("[FB] setupHourlyHover failed", e); }
  try { setupHourlyTap(temps, labels, conditions, units.tempSymbol); } catch (e) { console.warn("[FB] setupHourlyTap failed", e); }

  console.log("[FB] buildHourly() done");
}

// -----------------------------
// drawHourlyChart
// -----------------------------
export async function drawHourlyChart(temps, labels, symbol, conditions) {
  console.log("[FB] drawHourlyChart() start", { tempsLen: temps.length, labelsLen: labels.length });
  const canvas = document.getElementById("hourlyChart");
  if (!canvas) {
    console.warn("[FB] drawHourlyChart: #hourlyChart not found");
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.warn("[FB] drawHourlyChart: 2d context not available");
    return;
  }

  // Layout constants (CSS pixels)
  const hourWidth = 80; // CSS px per hour
  const cssH = 120;
  const cssW = Math.max(1, Math.round(hourWidth * temps.length)); // ensure >=1
  const DPR = window.devicePixelRatio || 1;

  // Set CSS size and backing store size
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  canvas.width = Math.round(cssW * DPR);
  canvas.height = Math.round(cssH * DPR);

  // store metadata for handlers
  canvas._cssWidth = cssW;
  canvas._cssHeight = cssH;
  canvas._DPR = DPR;
  canvas._hourWidth = hourWidth;

  console.log("[FB] canvas sizing", { cssW, cssH, DPR, backingW: canvas.width, backingH: canvas.height });

  // Use CSS-pixel transform for drawing coordinates and sampling
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const w = cssW, h = cssH, pad = 20;
  const max = Math.max(...temps), min = Math.min(...temps);
  console.log("[FB] temps range", { min, max });

  // Dense sampling: one sample per CSS pixel across the entire width
  // This ensures the line exists for every worldX in [0, cssW)
  const dense = new Array(w);
  for (let x = 0; x < w; x++) {
    // map x (CSS px) to fractional hour index
    const hourIndexFloat = x / hourWidth;
    const i = Math.floor(hourIndexFloat);
    if (i < 0) { dense[x] = { x, y: null }; continue; }
    if (i >= temps.length - 1) {
      // clamp to last point
      const yLast = h - pad - ((temps[temps.length - 1] - min) / (max - min || 1)) * (h - pad * 2);
      dense[x] = { x, y: yLast };
      continue;
    }
    const t = hourIndexFloat - i;
    const y1 = h - pad - ((temps[i] - min) / (max - min || 1)) * (h - pad * 2);
    const y2 = h - pad - ((temps[i + 1] - min) / (max - min || 1)) * (h - pad * 2);
    dense[x] = { x, y: y1 + (y2 - y1) * t };
  }

  console.log("[FB] dense sampling complete", { denseLen: dense.length, expected: cssW });

  // Draw the polyline using dense[] so the line is continuous across the whole width
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

  // Compute center points for each hour (CSS px)
  const points = temps.map((t, i) => {
    const x = i * hourWidth + hourWidth / 2;
    const y = h - pad - ((t - min) / (max - min || 1)) * (h - pad * 2);
    return { x, y, temp: t, index: i };
  });

  // Draw high/low markers and store marker metadata (hitboxes/hitradius)
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
      hitRadius: 22,
      hitBox: { w: 44, h: 44 }
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
      hitRadius: 22,
      hitBox: { w: 44, h: 44 }
    });
  }

  // Save dense and markers for hover/tap handlers
  canvas._densePoints = dense;
  canvas._markers = markers;

  console.log("[FB] markers stored", { markers });

  // Cache base image/bitmap for fast redraws (device pixels)
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
// Utility: sample Y at worldX (CSS px) using dense[] interpolation
// -----------------------------
function sampleYAtWorldX(worldX, dense) {
  if (!dense || dense.length === 0) return null;
  const x = Math.max(0, Math.min(dense.length - 1, worldX));
  const i = Math.floor(x);
  const t = x - i;
  const a = dense[i];
  const b = dense[i + 1] || a;
  if (!a || a.y == null) return null;
  if (!b || b.y == null) return a.y;
  return a.y + (b.y - a.y) * t;
}

// Map worldX -> hour index (center-based rounding)
function worldXToHourIndex(worldX, hourWidth, hoursLen) {
  const idx = Math.round((worldX - hourWidth / 2) / hourWidth);
  return Math.max(0, Math.min(hoursLen - 1, idx));
}

// -----------------------------
// setupHourlyHover
// -----------------------------
export function setupHourlyHover(temps, labels, conditions, symbol) {
  console.log("[FB] setupHourlyHover() start", { tempsLen: temps.length });
  const canvas = document.getElementById("hourlyChart");
  const scroll = document.getElementById("hourlyScroll");
  const tooltip = document.getElementById("hourlyTooltip");
  if (!canvas || !scroll || !tooltip) {
    console.warn("[FB] setupHourlyHover: missing DOM elements", { canvas: !!canvas, scroll: !!scroll, tooltip: !!tooltip });
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!canvas._densePoints) {
    console.warn("[FB] setupHourlyHover: canvas._densePoints missing");
    return;
  }

  const dense = canvas._densePoints;
  const markers = canvas._markers || [];
  const hourWidth = canvas._hourWidth || 80;
  const cssW = canvas._cssWidth || canvas.clientWidth;
  const DPR = canvas._DPR || window.devicePixelRatio || 1;
  const cssH = canvas._cssHeight || 120;
  const hourTimes = canvas._hourTimes || [];

  console.log("[FB] hover init", { cssW, cssH, hourWidth, DPR, denseLen: dense.length, markers, hourTimesLen: hourTimes.length });

  // State (world coords)
  const hover = { active: false, screenX: 0, screenY: 0 };
  let lastPointerX = null, lastPointerTime = 0;

  // Dot state in world coords
  let dotWorldX = Math.max(0, Math.min(dense.length - 1, scroll.scrollLeft + (scroll.clientWidth / 2)));
  let dotY = sampleYAtWorldX(dotWorldX, dense) ?? cssH / 2;
  let targetWorldX = dotWorldX;
  let targetY = dotY;
  let rafId = null;

  // Marker lock
  let markerLock = null;
  const MARKER_HYSTERESIS = 22;

  // Auto-scroll / user scroll state
  let pauseAutoScroll = false, pauseTimer = null;
  const PAUSE_MS = 180;
  const VELOCITY_THRESHOLD = 0.6;
  let userScrolling = false, userScrollTimer = null;
  const USER_SCROLL_IDLE = 220;

  let scrollTarget = null;
  function cancelAutoScroll() { scrollTarget = null; }
  function ensureRaf() { if (!rafId) rafId = requestAnimationFrame(unifiedStep); }

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

  function restoreBase() {
    if (canvas._baseBitmap) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      try { ctx.drawImage(canvas._baseBitmap, 0, 0, canvas.width, canvas.height); } catch (e) {
        if (canvas._baseImage) try { ctx.putImageData(canvas._baseImage, 0, 0); } catch (ee) {}
      }
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.restore();
      return true;
    }
    if (canvas._baseImage) {
      try { ctx.putImageData(canvas._baseImage, 0, 0); return true; } catch (e) {}
    }
    return false;
  }

  // Draw dot using device-pixel-safe approach; screenX_css and y_css are CSS pixels
  function drawDotAtScreenX(screenX_css, y_css, color = "#fff") {
    const sx = Math.round(screenX_css * DPR);
    const sy = Math.round(y_css * DPR);
    const radius = Math.max(1, Math.round(6 * DPR));

    if (canvas._baseBitmap) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      try { ctx.drawImage(canvas._baseBitmap, 0, 0, canvas.width, canvas.height); } catch (e) {
        if (canvas._baseImage) try { ctx.putImageData(canvas._baseImage, 0, 0); } catch (ee) {}
      }
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
      if (color === "#fff") {
        ctx.lineWidth = Math.max(1, Math.round(1.5 * DPR));
        ctx.strokeStyle = "rgba(0,0,0,0.18)";
        ctx.stroke();
      }
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.restore();
    } else {
      ctx.save();
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(screenX_css, y_css, 6, 0, Math.PI * 2);
      ctx.fill();
      if (color === "#fff") { ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.stroke(); }
      ctx.restore();
    }

    console.log("[FB] drawDot", { screenX_css, y_css, color, dotWorldX, scrollLeft: scroll.scrollLeft });
  }

  // Tooltip placement: above the dot (so it doesn't cover it)
  function computeTooltipPosition(screenX_css, y_css) {
    const tipRect = tooltip.getBoundingClientRect();
    const tipW = tipRect.width || 120;
    const half = tipW / 2;
    const minCenter = 6 + half;
    const maxCenter = scroll.clientWidth - 6 - half;
    const left = Math.max(minCenter, Math.min(maxCenter, screenX_css));
    const top = Math.max(6, y_css - 36); // place tooltip above the dot (36px offset)
    const useCenter = screenX_css >= minCenter && screenX_css <= maxCenter;
    return { left, top, useCenter };
  }

  function updateTooltipAndDraw(screenX_css, y_css, hourIndex, color = "#fff", markerType = null, markerTemp = null) {
    // Diagnostic mapping log
    const hourTimes = canvas._hourTimes || [];
    const mappedLabel = labels[hourIndex];
    const mappedTime = hourTimes[hourIndex] || null;
    console.log("[FB][TOOLTIP-MAP]", {
      dotWorldX,
      screenX_css,
      hourIndex,
      mappedLabel,
      mappedTime,
      centerRoundIndex: Math.round((dotWorldX - hourWidth / 2) / hourWidth),
      simpleIndex: Math.round(dotWorldX / hourWidth)
    });

    const { left, top, useCenter } = computeTooltipPosition(screenX_css, y_css);
    if (markerType && markerTemp != null) {
      tooltip.innerHTML = `<strong>${markerType.toUpperCase()}: ${Math.round(markerTemp)}${symbol}</strong>`;
    } else {
      tooltip.innerHTML = `<strong>${mappedLabel}</strong><div>${Math.round(temps[hourIndex])}${symbol}</div>`;
    }
    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
    tooltip.style.opacity = 1;
    tooltip.style.transform = useCenter ? "translateX(-50%)" : "translateX(0)";
    drawDotAtScreenX(screenX_css, y_css, color);
  }

  // Unified RAF: animate scroll and dot (world coords)
  function unifiedStep() {
    // Scroll easing (scrollTarget is world-left)
    if (scrollTarget !== null) {
      const cur = scroll.scrollLeft;
      const d = scrollTarget - cur;
      const sf = 0.12;
      if (Math.abs(d) < 0.5) { scroll.scrollLeft = scrollTarget; scrollTarget = null; console.log("[FB] scrollTarget reached"); }
      else scroll.scrollLeft = cur + d * sf;
    }

    // Dot soft-snap X and Y (unless markerLock engaged)
    const dx = targetWorldX - dotWorldX;
    const dy = targetY - dotY;
    const xf = 0.22, yf = 0.28;
    if (Math.abs(dx) > 0.25) dotWorldX += dx * xf; else dotWorldX = targetWorldX;
    if (Math.abs(dy) > 0.25) dotY += dy * yf; else dotY = targetY;

    if (hover.active) {
      const screenX_css = dotWorldX - scroll.scrollLeft;
      const hourIndex = worldXToHourIndex(dotWorldX, hourWidth, temps.length);
      const color = markerLock ? (markerLock.color || "#fff") : "#fff";
      const markerType = markerLock ? markerLock.type : null;
      const markerTemp = markerLock ? markerLock.temp : null;
      updateTooltipAndDraw(screenX_css, dotY, hourIndex, color, markerType, markerTemp);
    }

    if (scrollTarget !== null || Math.abs(targetWorldX - dotWorldX) > 0.25 || Math.abs(targetY - dotY) > 0.25) {
      rafId = requestAnimationFrame(unifiedStep);
    } else {
      rafId = null;
      console.log("[FB] unifiedStep idle", { dotWorldX, dotY, targetWorldX, targetY, scrollLeft: scroll.scrollLeft });
    }
  }

  // Pointer scheduling
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

    // clamp screenX to visible area for hit detection only (do not clamp dotWorldX)
    hover.screenX = Math.max(0, Math.min(scroll.clientWidth, screenX));
    hover.screenY = screenY;
    hover.active = true;

    // world coordinate under pointer (CSS px)
    const worldFromPointer = scroll.scrollLeft + hover.screenX;

    // Marker detection in screen space (so scroll doesn't change hit detection)
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
      // Engage marker lock immediately: set targets to exact marker world coords and snap dot to them
      markerLock = { x: foundMarker.x, y: foundMarker.y, color: foundMarker.color, index: foundMarker.index, type: foundMarker.type, temp: foundMarker.temp };
      targetWorldX = foundMarker.x;
      targetY = foundMarker.y;
      // snap immediately to avoid sampling mismatch
      dotWorldX = targetWorldX;
      dotY = targetY;
      console.log("[FB] markerLock ENGAGED", markerLock);

      // Nudge scroll if marker near edges (only if pointer is over chart)
      const markerScreenX = Math.max(0, Math.min(scroll.clientWidth, foundMarker.x - scroll.scrollLeft));
      const margin = 60, vw = scroll.clientWidth;
      if (!pauseAutoScroll && !userScrolling && hover.active) {
        if (markerScreenX < margin) easeScrollTo(Math.max(0, foundMarker.x - margin));
        else if (markerScreenX > vw - margin) easeScrollTo(Math.min(cssW - vw, foundMarker.x - (vw - margin)));
      }
    } else if (markerLock) {
      // If locked, check hysteresis in screen space; keep lock while pointer remains near marker
      const lockedScreenX = markerLock.x - scroll.scrollLeft;
      const lockedScreenY = markerLock.y;
      const dist = Math.hypot(hover.screenX - lockedScreenX, hover.screenY - lockedScreenY);
      if (dist <= MARKER_HYSTERESIS) {
        // keep lock
        targetWorldX = markerLock.x;
        targetY = markerLock.y;
        dotWorldX = targetWorldX;
        dotY = targetY;
      } else {
        // release lock and fall back to pointer sampling
        console.log("[FB] markerLock RELEASED", { dist, MARKER_HYSTERESIS });
        markerLock = null;
        targetWorldX = Math.max(0, Math.min(dense.length - 1, worldFromPointer));
        const sampledY = sampleYAtWorldX(targetWorldX, dense);
        targetY = sampledY != null ? sampledY : targetY;
      }
    } else {
      // Normal pointer: pointer has priority (world coords)
      targetWorldX = Math.max(0, Math.min(dense.length - 1, worldFromPointer));
      const sampledY = sampleYAtWorldX(targetWorldX, dense);
      targetY = sampledY != null ? sampledY : targetY;

      const visibleX = hover.screenX, margin = 60, vw = scroll.clientWidth;
      if (!pauseAutoScroll && !userScrolling && hover.active) {
        if (visibleX < margin) easeScrollTo(Math.max(0, targetWorldX - margin));
        else if (visibleX > vw - margin) easeScrollTo(Math.min(cssW - vw, targetWorldX - (vw - margin)));
      }
    }

    ensureRaf();
  }

  // Pointer handlers
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

  // Attach pointer handlers (avoid duplicates)
  canvas.removeEventListener("pointermove", canvas._hourlyPointerMove);
  canvas.removeEventListener("pointerleave", canvas._hourlyPointerLeave);
  canvas._hourlyPointerMove = onPointerMove;
  canvas._hourlyPointerLeave = onPointerLeave;
  canvas.addEventListener("pointermove", onPointerMove, { passive: true });
  canvas.addEventListener("pointerleave", onPointerLeave, { passive: true });

  // User scroll detection
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
  if (!canvas || !scroll || !tooltip) {
    console.warn("[FB] setupHourlyTap: missing DOM elements");
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!canvas._densePoints) {
    console.warn("[FB] setupHourlyTap: canvas._densePoints missing");
    return;
  }

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
        const y = sampleYAtWorldX(worldX, dense);
        if (y != null) {
          const hourIndex = worldXToHourIndex(worldX, hourWidth, temps.length);
          tooltip.innerHTML = `<strong>${labels[hourIndex]}</strong><div>${Math.round(temps[hourIndex])}${symbol}</div>`;
          tooltip.style.left = clampTooltipLeft(keepScreenX, scroll) + "px";
          tooltip.style.top = (y - 36) + "px";
          tooltip.style.opacity = 1;
          drawDotAtScreenX(keepScreenX, y, "#fff", canvas, ctx);
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

  function sampleYAtWorldX(worldX, denseArr) {
    const x = Math.max(0, Math.min(denseArr.length - 1, worldX));
    const i = Math.floor(x);
    const t = x - i;
    const a = denseArr[i], b = denseArr[i+1] || a;
    if (!a || a.y == null) return null;
    if (!b || b.y == null) return a.y;
    return a.y + (b.y - a.y) * t;
  }

  function drawDotAtScreenX(screenX, y, color = "#fff") {
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

  function clampTooltipLeft(screenX, scrollEl) {
    const tipW = tooltip.getBoundingClientRect().width || 120;
    const half = tipW / 2;
    const minCenter = 6 + half;
    const maxCenter = scrollEl.clientWidth - 6 - half;
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

    // Marker priority (screen space)
    for (const m of markers) {
      const markerScreenX = m.x - scroll.scrollLeft;
      const dx = Math.abs(screenX - markerScreenX), dy = Math.abs(canvasY - m.y);
      if (Math.hypot(dx,dy) <= (m.hitRadius||0) || (dx <= (m.hitBox?.w||0)/2 && dy <= (m.hitBox?.h||0)/2)) {
        const label = m.type === "high" ? `HIGH: ${Math.round(m.temp)}${symbol}` : `LOW: ${Math.round(m.temp)}${symbol}`;
        tooltip.innerHTML = `<strong>${label}</strong>`;
        tooltip.style.left = clampTooltipLeft(markerScreenX, scroll) + "px";
        tooltip.style.top = (m.y - 36) + "px"; // above the dot
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

    // Normal line tap
    const y = sampleYAtWorldX(worldX, dense);
    if (y == null) { tooltip.style.opacity = 0; restoreBase(); return; }
    if (Math.abs(canvasY - y) > 60) { tooltip.style.opacity = 0; restoreBase(); return; }

    const hourIndex = worldXToHourIndex(worldX, hourWidth, temps.length);
    tooltip.innerHTML = `<strong>${labels[hourIndex]}</strong><div>${Math.round(temps[hourIndex])}${symbol}</div>`;
    tooltip.style.left = clampTooltipLeft(screenX, scroll) + "px";
    tooltip.style.top = (y - 36) + "px";
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

  console.log("[FB] buildDaily done", { days: daily.time.length });
}
