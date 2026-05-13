// forecast-builder.js
// FINAL ES-MODULE VERSION
// Smooth auto-scroll both ways, dot glued to line, snapping to high/low,
// tooltip above dot, dense sampling, world-space architecture,
// NO setupHourlyTap, but setupHourlyHover handles mouse + touch.

import { getUnitParams } from './utils.js';
import { WEATHER_TEXT } from './constants.js';

// ============================================================================
// EXPORT: buildHourly
// ============================================================================
export function buildHourly(hourly, timezone) {
  const canvas = document.getElementById("hourlyChart");
  const scroll = document.getElementById("hourlyScroll");
  const tooltip = document.getElementById("hourlyTooltip");

  if (!canvas || !scroll || !tooltip) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { temps, labels } = extractTempsAndLabels(hourly, timezone);
  const hourWidth = 80;
  const cssH = 120;
  const cssW = temps.length * hourWidth;
  const dpr = window.devicePixelRatio || 1;

  // Canvas sizing
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Build dense sampling
  const { dense, minTemp, maxTemp } = buildDenseSamples(temps, cssW, cssH, hourWidth);

  // Find high/low markers
  const markers = computeMarkers(temps, dense, hourWidth);

  // Draw base chart
  drawBaseChart(ctx, dense, markers, cssW, cssH);

  // Snapshot base chart for fast redraw
  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = canvas.width;
  baseCanvas.height = canvas.height;
  const baseCtx = baseCanvas.getContext("2d");
  baseCtx.drawImage(canvas, 0, 0);

  // Hover state
  const state = {
    canvas,
    ctx,
    scroll,
    tooltip,
    dense,
    labels,
    markers,
    hourWidth,
    cssW,
    cssH,
    dpr,
    baseCanvas,
    hoverActive: false,
    hoverWorldX: 0,
    snappedMarker: null
  };

  setupHourlyHover(state);
}

// ============================================================================
// EXPORT: drawHourlyChart (your app expects it, so we export a wrapper)
// ============================================================================
export function drawHourlyChart() {
  // buildHourly already draws the chart.
  // This function exists ONLY because your app imports it.
  // We keep it as a no-op to avoid breaking your app.
  console.warn("drawHourlyChart() is handled inside buildHourly().");
}

// ============================================================================
// EXPORT: createBaseBitmapSnapshot (your app expects it)
// ============================================================================
export function createBaseBitmapSnapshot() {
  // No longer needed — buildHourly creates its own base snapshot.
  // We keep this as a no-op so your app doesn't break.
  console.warn("createBaseBitmapSnapshot() is no longer required.");
}

// ============================================================================
// EXPORT: setupHourlyHover (your app expects it)
// ============================================================================
export function setupHourlyHover(state) {
  // If state was passed directly (from buildHourly), use it.
  // If app.js calls this manually, we reconstruct state from DOM.
  if (!state || !state.canvas) {
    state = rebuildStateFromDOM();
    if (!state) return;
  }

  const { scroll, canvas, tooltip } = state;

  tooltip.style.opacity = "0";
  tooltip.style.pointerEvents = "none";

  // Mouse + touch support
  scroll.addEventListener("mousemove", (ev) => handleMove(ev, state));
  scroll.addEventListener("touchmove", (ev) => {
    const t = ev.touches[0];
    if (t) handleMove(t, state);
  }, { passive: true });

  scroll.addEventListener("mouseleave", () => handleLeave(state));
  scroll.addEventListener("touchend", () => handleLeave(state));

  scroll.addEventListener("scroll", () => handleScroll(state));
}

// ============================================================================
// EXPORT: buildDaily
// ============================================================================
export function buildDaily(daily, timezone) {
  const container = document.getElementById("dailyForecast");
  if (!container) return;

  container.innerHTML = "";

  if (!daily || !daily.length) {
    container.textContent = "No daily data";
    return;
  }

  for (let i = 0; i < daily.length; i++) {
    const d = daily[i];
    const row = document.createElement("div");
    row.className = "daily-row";

    const date = d.dt ? new Date(d.dt * 1000) : new Date();
    const weekday = date.toLocaleDateString("en-US", { weekday: "short" });

    const max = d.temp?.max ?? d.max ?? null;
    const min = d.temp?.min ?? d.min ?? null;

    const tempText =
      max != null && min != null
        ? `${Math.round(max)}° / ${Math.round(min)}°`
        : "--";

    const desc =
      d.weather?.[0]?.description ??
      d.summary ??
      "";

    row.innerHTML = `
      <div>${weekday}</div>
      <div>${tempText}</div>
      <div>${desc}</div>
    `;

    container.appendChild(row);
  }
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================
function extractTempsAndLabels(hourly, timezone) {
  const temps = [];
  const labels = [];

  for (let i = 0; i < hourly.length; i++) {
    const h = hourly[i];
    const t = h.temp ?? h.temperature ?? 0;
    temps.push(t);

    let label = "";
    if (h.dt) {
      const d = new Date(h.dt * 1000);
      const hr = d.getHours();
      const ampm = hr >= 12 ? "PM" : "AM";
      const hr12 = ((hr + 11) % 12) + 1;
      label = `${hr12} ${ampm}`;
    } else {
      label = `${i}:00`;
    }

    labels.push(label);
  }

  return { temps, labels };
}

function buildDenseSamples(temps, cssW, cssH, hourWidth) {
  let min = Infinity;
  let max = -Infinity;
  for (const t of temps) {
    if (t < min) min = t;
    if (t > max) max = t;
  }
  if (max === min) {
    max += 1;
    min -= 1;
  }

  const topPad = 18;
  const bottomPad = 24;
  const usableH = cssH - topPad - bottomPad;

  function tempToY(temp) {
    const tNorm = (temp - min) / (max - min);
    return topPad + (1 - tNorm) * usableH;
  }

  const coarse = temps.map((t, i) => ({
    x: i * hourWidth + hourWidth / 2,
    y: tempToY(t),
    temp: t
  }));

  const dense = new Array(cssW);
  for (let x = 0; x < cssW; x++) {
    const t = x / hourWidth;
    const i0 = Math.floor(t);
    const i1 = Math.min(coarse.length - 1, i0 + 1);
    const frac = Math.min(1, Math.max(0, t - i0));

    const p0 = coarse[i0] ?? coarse[0];
    const p1 = coarse[i1] ?? coarse[coarse.length - 1];

    dense[x] = {
      x,
      y: p0.y + (p1.y - p0.y) * frac,
      temp: p0.temp + (p1.temp - p0.temp) * frac
    };
  }

  return { dense, minTemp: min, maxTemp: max };
}

function computeMarkers(temps, dense, hourWidth) {
  let maxIdx = 0;
  let minIdx = 0;

  for (let i = 1; i < temps.length; i++) {
    if (temps[i] > temps[maxIdx]) maxIdx = i;
    if (temps[i] < temps[minIdx]) minIdx = i;
  }

  const highX = Math.round(maxIdx * hourWidth + hourWidth / 2);
  const lowX = Math.round(minIdx * hourWidth + hourWidth / 2);

  return [
    {
      type: "high",
      worldX: highX,
      y: dense[highX].y,
      temp: temps[maxIdx],
      index: maxIdx
    },
    {
      type: "low",
      worldX: lowX,
      y: dense[lowX].y,
      temp: temps[minIdx],
      index: minIdx
    }
  ];
}

function drawBaseChart(ctx, dense, markers, cssW, cssH) {
  ctx.clearRect(0, 0, cssW, cssH);

  // Line
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#ffffff";
  ctx.beginPath();
  for (let i = 0; i < dense.length; i++) {
    const p = dense[i];
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();

  // Markers
  for (const m of markers) {
    ctx.save();
    ctx.fillStyle = m.type === "high" ? "#ff6b6b" : "#4fd1ff";
    ctx.beginPath();
    ctx.arc(m.worldX, m.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ============================================================================
// HOVER + DOT + AUTO-SCROLL
// ============================================================================
function handleMove(ev, state) {
  const { scroll, dense, markers } = state;

  const rect = scroll.getBoundingClientRect();
  const localX = ev.clientX - rect.left;
  const clampedX = Math.max(0, Math.min(rect.width, localX));
  const worldX = scroll.scrollLeft + clampedX;

  // Snapping
  const snap = findMarkerHit(worldX, markers);
  state.snappedMarker = snap;
  state.hoverWorldX = snap ? snap.worldX : worldX;
  state.hoverActive = true;

  drawDotAndTooltip(state);

  // Auto-scroll only when pointer is near edges
  const EDGE_ZONE = 40;
  if (localX < EDGE_ZONE) {
    smoothScrollTo(state, worldX - rect.width / 2);
  } else if (localX > rect.width - EDGE_ZONE) {
    smoothScrollTo(state, worldX - rect.width / 2);
  }
}

function handleLeave(state) {
  state.hoverActive = false;
  state.tooltip.style.opacity = "0";

  const { ctx, baseCanvas, cssW, cssH, dpr } = state;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.drawImage(baseCanvas, 0, 0);
}

function handleScroll(state) {
  if (!state.hoverActive) return;
  drawDotAndTooltip(state);
}

function findMarkerHit(worldX, markers) {
  const HITBOX = 12;
  let best = null;
  let bestDist = Infinity;

  for (const m of markers) {
    const d = Math.abs(worldX - m.worldX);
    if (d < HITBOX && d < bestDist) {
      best = m;
      bestDist = d;
    }
  }
  return best;
}

function drawDotAndTooltip(state) {
  const {
    ctx,
    baseCanvas,
    dense,
    scroll,
    tooltip,
    labels,
    hourWidth,
    cssW,
    cssH,
    dpr
  } = state;

  const worldX = state.hoverWorldX;
  const idx = Math.max(0, Math.min(dense.length - 1, Math.round(worldX)));
  const sample = dense[idx];

  const screenX = sample.x - scroll.scrollLeft;
  const y = sample.y;

  // Redraw base
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.drawImage(baseCanvas, 0, 0);

  // Draw dot
  ctx.save();
  ctx.fillStyle = state.snappedMarker
    ? state.snappedMarker.type === "high"
      ? "#ff6b6b"
      : "#4fd1ff"
    : "#ffffff";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sample.x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Tooltip
  const hourIndex = Math.round(sample.x / hourWidth);
  const safeIndex = Math.max(0, Math.min(labels.length - 1, hourIndex));
  const label = labels[safeIndex];

  tooltip.textContent = `${label} • ${Math.round(sample.temp)}°`;

  const scrollRect = scroll.getBoundingClientRect();
  tooltip.style.left = scrollRect.left + screenX + "px";
  tooltip.style.top = scrollRect.top + (y - 28) + "px";
  tooltip.style.opacity = "1";
}

// ============================================================================
// SMOOTH AUTO-SCROLL
// ============================================================================
function smoothScrollTo(state, target) {
  const { scroll, cssW } = state;

  const maxScroll = cssW - scroll.clientWidth;
  target = Math.max(0, Math.min(maxScroll, target));

  const current = scroll.scrollLeft;
  const next = current + (target - current) * 0.12;

  scroll.scrollLeft = next;
}

// ============================================================================
// REBUILD STATE (if app.js calls setupHourlyHover manually)
// ============================================================================
function rebuildStateFromDOM() {
  const canvas = document.getElementById("hourlyChart");
  const scroll = document.getElementById("hourlyScroll");
  const tooltip = document.getElementById("hourlyTooltip");
  if (!canvas || !scroll || !tooltip) return null;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const dense = canvas._densePoints;
  const markers = canvas._markers;
  const labels = canvas._labels;
  const hourWidth = canvas._hourWidth;
  const cssW = canvas._cssWidth;
  const cssH = canvas._cssHeight;
  const dpr = window.devicePixelRatio || 1;

  if (!dense || !markers || !labels) return null;

  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = canvas.width;
  baseCanvas.height = canvas.height;
  const baseCtx = baseCanvas.getContext("2d");
  baseCtx.drawImage(canvas, 0, 0);

  return {
    canvas,
    ctx,
    scroll,
    tooltip,
    dense,
    labels,
    markers,
    hourWidth,
    cssW,
    cssH,
    dpr,
    baseCanvas,
    hoverActive: false,
    hoverWorldX: 0,
    snappedMarker: null
  };
}
