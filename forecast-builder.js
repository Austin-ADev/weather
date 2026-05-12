// FORECAST BUILDERS (module)

import { getUnitParams } from './utils.js';
import { WEATHER_TEXT } from './constants.js';

// buildHourly

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

  // draw chart (ensures canvas._densePoints uses CSS pixels)
  await drawHourlyChart(temps, labels, units.tempSymbol, conditions);

  // snapshot (optional but recommended)
  try { await createBaseBitmapSnapshot(); } catch (e) { /* non-fatal */ }

  // attach handlers
  try { setupHourlyHover(temps, labels, conditions, units.tempSymbol); } catch (e) { console.warn(e); }
  try { setupHourlyTap(temps, labels, conditions, units.tempSymbol); } catch (e) { console.warn(e); }
}

// drawHourlyChart

export async function drawHourlyChart(temps, labels, symbol, conditions) {
  const canvas = document.getElementById("hourlyChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // CSS layout sizes (use clientWidth/clientHeight for sampling and scroll math)
  const hourWidth = 80; // CSS px per hour
  const cssH = 120;
  const cssW = hourWidth * temps.length; // CSS pixels width
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

  // set transform for drawing in CSS pixels
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

  // compute center points and draw high/low markers
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

  // store for handlers (dense length equals cssW)
  canvas._densePoints = dense;
  canvas._markers = markers;

  // cache ImageData fallback (device pixels) and create ImageBitmap snapshot
  try { canvas._baseImage = ctx.getImageData(0, 0, Math.round(cssW * DPR), Math.round(cssH * DPR)); } catch (e) { canvas._baseImage = null; }
  try { canvas._baseBitmap = await createImageBitmap(canvas); } catch (e) { canvas._baseBitmap = null; }
}

// createBaseBitmapSnapshot

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

// setupHourlyHover

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

  // state
  const hover = { active: false, screenX: 0, screenY: 0, lockedToMarker: false, lockedMarkerWorldX: null };
  let pendingFrame = false;
  let lastPointerX = null, lastPointerTime = 0;

  // scroll animation / control (single RAF loop)
  let scrollTarget = null, scrollRaf = null;
  let pauseAutoScroll = false, pauseTimer = null;
  const PAUSE_MS = 180;
  const VELOCITY_THRESHOLD = 0.6; // px per ms
  let userScrolling = false, userScrollTimer = null;
  const USER_SCROLL_IDLE = 220;

  // helpers
  function cancelAutoScroll() {
    scrollTarget = null;
    if (scrollRaf) { cancelAnimationFrame(scrollRaf); scrollRaf = null; }
  }

  function startScrollLoopIfNeeded() {
    if (!scrollTarget || scrollRaf) return;
    function step() {
      if (!scrollTarget) { scrollRaf = null; return; }
      const cur = scroll.scrollLeft;
      const d = scrollTarget - cur;
      const f = 0.12;
      if (Math.abs(d) < 0.5) { scroll.scrollLeft = scrollTarget; scrollTarget = null; scrollRaf = null; return; }
      scroll.scrollLeft = cur + d * f;

      // while scrolling, keep dot visually correct
      if (hover.active) {
        // if locked to marker, compute screenX from locked worldX
        const screenX = hover.lockedToMarker ? (hover.lockedMarkerWorldX - scroll.scrollLeft) : hover.screenX;
        const worldX = scroll.scrollLeft + screenX;
        const y = sampleYAtWorldX(worldX);
        if (y != null) {
          const hourIndex = clampIndex(Math.floor(worldX / hourWidth + 0.5), temps.length);
          updateTooltipAndDraw(screenX, y, hourIndex);
        }
      }
      scrollRaf = requestAnimationFrame(step);
    }
    scrollRaf = requestAnimationFrame(step);
  }

  function easeScrollTo(target) {
    if (pauseAutoScroll || userScrolling) return;
    const maxLeft = Math.max(0, cssW - scroll.clientWidth);
    scrollTarget = Math.max(0, Math.min(maxLeft, target));
    startScrollLoopIfNeeded();
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

  // fractional sampler (linear interpolation)
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

  // tooltip centering/clamping helper: returns left px and whether to use translateX(-50%)
  function computeTooltipLeftAndTransform(screenX) {
    const tipW = tooltip.getBoundingClientRect().width || 120;
    const half = tipW / 2;
    const minCenter = 6 + half;
    const maxCenter = scroll.clientWidth - 6 - half;
    if (screenX >= minCenter && screenX <= maxCenter) return { leftPx: screenX, useCenterTransform: true };
    return { leftPx: Math.max(minCenter, Math.min(maxCenter, screenX)), useCenterTransform: false };
  }

  function updateTooltipAndDraw(screenX, y, hourIndex) {
    const { leftPx, useCenterTransform } = computeTooltipLeftAndTransform(screenX);
    tooltip.innerHTML = `<strong>${labels[hourIndex]}</strong><div>${Math.round(temps[hourIndex])}${symbol}</div>`;
    tooltip.style.left = leftPx + "px";
    tooltip.style.top = (y - 20) + "px";
    tooltip.style.opacity = 1;
    tooltip.style.transform = useCenterTransform ? "translateX(-50%)" : "translateX(0)";
    drawDotAtScreenX(screenX, y, "#fff");
  }

  // pointer scheduling with velocity detection and rAF throttle
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

    // pause auto-scroll while moving fast; cancel any target
    if (velocity > VELOCITY_THRESHOLD) {
      pauseAutoScroll = true;
      cancelAutoScroll();
      clearTimeout(pauseTimer);
      pauseTimer = setTimeout(() => { pauseAutoScroll = false; }, PAUSE_MS);
    } else {
      clearTimeout(pauseTimer);
      pauseTimer = setTimeout(() => { pauseAutoScroll = false; }, PAUSE_MS);
    }

    // if we were locked to a marker but pointer moved away, unlock
    if (hover.lockedToMarker) {
      // compute distance in screen px between pointer and locked marker screenX
      const lockedScreenX = hover.lockedMarkerWorldX - scroll.scrollLeft;
      if (Math.abs(screenX - lockedScreenX) > 18) { // small hysteresis
        hover.lockedToMarker = false;
        hover.lockedMarkerWorldX = null;
      }
    }

    // if not locked, update hover.screenX; if locked, keep screenX derived from locked worldX
    hover.screenX = hover.lockedToMarker ? Math.max(0, Math.min(scroll.clientWidth, hover.lockedMarkerWorldX - scroll.scrollLeft)) : Math.max(0, Math.min(scroll.clientWidth, screenX));
    hover.screenY = screenY;
    hover.active = true;

    if (pendingFrame) return;
    pendingFrame = true;
    requestAnimationFrame(() => {
      pendingFrame = false;
      // worldX should reflect locked marker worldX if locked, else scrollLeft + screenX
      const worldX = hover.lockedToMarker ? hover.lockedMarkerWorldX : Math.max(0, Math.min(dense.length - 1, scroll.scrollLeft + hover.screenX));

      // marker priority (snap visually if pointer is inside marker hit area)
      for (const m of markers) {
        const dx = Math.abs(worldX - m.x);
        const dy = Math.abs(hover.screenY - m.y);
        const radial = Math.hypot(dx, dy) <= (m.hitRadius || 0);
        const hw = (m.hitBox && m.hitBox.w) ? m.hitBox.w/2 : 0;
        const rectHit = dx <= hw && dy <= (m.hitBox && m.hitBox.h ? m.hitBox.h/2 : 0);
        if (radial || rectHit) {
          // lock to this marker so the dot stays exactly on it
          hover.lockedToMarker = true;
          hover.lockedMarkerWorldX = m.x;
          const markerScreenX = Math.max(0, Math.min(scroll.clientWidth, m.x - scroll.scrollLeft));
          const { leftPx, useCenterTransform } = computeTooltipLeftAndTransform(markerScreenX);
          tooltip.innerHTML = `<strong>${m.type.toUpperCase()}</strong><div>${Math.round(m.temp)}${symbol}</div>`;
          tooltip.style.left = leftPx + "px";
          tooltip.style.top = (m.y - 20) + "px";
          tooltip.style.opacity = 1;
          tooltip.style.transform = useCenterTransform ? "translateX(-50%)" : "translateX(0)";

          // nudge scroll if marker near edges
          const visibleX = markerScreenX, margin = 60, vw = scroll.clientWidth;
          if (!pauseAutoScroll && !userScrolling) {
            if (visibleX < margin) easeScrollTo(Math.max(0, m.x - margin));
            else if (visibleX > vw - margin) easeScrollTo(Math.min(cssW - vw, m.x - (vw - margin)));
          }

          drawDotAtScreenX(markerScreenX, m.y, m.color || "#fff");
          return;
        }
      }

      // not on a marker: sample the line
      const y = sampleYAtWorldX(worldX);
      if (y == null) { tooltip.style.opacity = 0; restoreBase(); return; }
      if (Math.abs(hover.screenY - y) > 60) { tooltip.style.opacity = 0; restoreBase(); return; }

      const hourIndex = clampIndex(Math.floor(worldX / hourWidth + 0.5), temps.length);
      updateTooltipAndDraw(hover.screenX, y, hourIndex);

      // auto-scroll nudge if pointer near edges and not paused/user-scrolling
      const visibleX = hover.screenX, margin = 60, vw = scroll.clientWidth;
      if (!pauseAutoScroll && !userScrolling && !hover.lockedToMarker) {
        if (visibleX < margin) easeScrollTo(Math.max(0, worldX - margin));
        else if (visibleX > vw - margin) easeScrollTo(Math.min(cssW - vw, worldX - (vw - margin)));
      }
    });
  }

  // mouse handlers
  function onMouseMove(ev) {
    const rect = canvas.getBoundingClientRect();
    const xInCanvas = ev.clientX - rect.left;
    const screenX = xInCanvas;
    const screenY = ev.clientY - rect.top;
    schedulePointerUpdate(screenX, screenY);
  }
  function onMouseLeave() {
    hover.active = false;
    hover.lockedToMarker = false;
    hover.lockedMarkerWorldX = null;
    tooltip.style.opacity = 0;
    restoreBase();
    clearTimeout(pauseTimer);
    pauseAutoScroll = false;
  }

  // user scroll detection: cancel auto-scroll while user scrolls manually
  function onUserScroll() {
    userScrolling = true;
    cancelAutoScroll();
    clearTimeout(userScrollTimer);
    userScrollTimer = setTimeout(() => { userScrolling = false; }, USER_SCROLL_IDLE);
  }

  // attach handlers (avoid duplicates)
  canvas.removeEventListener("mousemove", canvas._hourlyMouseMove);
  canvas.removeEventListener("mouseleave", canvas._hourlyMouseLeave);
  canvas._hourlyMouseMove = onMouseMove;
  canvas._hourlyMouseLeave = onMouseLeave;
  canvas.addEventListener("mousemove", onMouseMove, { passive: true });
  canvas.addEventListener("mouseleave", onMouseLeave, { passive: true });

  scroll.removeEventListener("wheel", scroll._hourlyWheel);
  scroll._hourlyWheel = onUserScroll;
  scroll.addEventListener("wheel", onUserScroll, { passive: true });

  scroll.removeEventListener("pointerdown", scroll._hourlyPointerDown);
  scroll._hourlyPointerDown = onUserScroll;
  scroll.addEventListener("pointerdown", scroll._hourlyPointerDown, { passive: true });

  // cancel auto-scroll on native scroll/touchmove so JS never fights user gestures
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

// setupHourlyTap

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
    // handle touch/pen and mouse taps; allow mouse to still work if desired
    const rect = canvas.getBoundingClientRect();
    const xInCanvas = ev.clientX - rect.left;
    const screenX = Math.max(0, Math.min(scroll.clientWidth, xInCanvas));
    const canvasY = ev.clientY - rect.top;
    const worldX = scroll.scrollLeft + screenX;

    pauseBriefly();

    // marker priority: lock to marker if hit
    for (const m of markers) {
      const dx = Math.abs(worldX - m.x), dy = Math.abs(canvasY - m.y);
      if (Math.hypot(dx,dy) <= (m.hitRadius||0) || (dx <= (m.hitBox?.w||0)/2 && dy <= (m.hitBox?.h||0)/2)) {
        const markerScreenX = Math.max(0, Math.min(scroll.clientWidth, m.x - scroll.scrollLeft));
        // lock the visual dot to the marker world X while we nudge scroll
        const lockedWorldX = m.x;
        tooltip.innerHTML = `<strong>${m.type.toUpperCase()}</strong><div>${Math.round(m.temp)}${symbol}</div>`;
        tooltip.style.left = clampTooltipLeft(markerScreenX) + "px";
        tooltip.style.top = (m.y - 20) + "px";
        tooltip.style.opacity = 1;
        drawDotAtScreenX(markerScreenX, m.y, m.color || "#fff");

        // nudge scroll so marker is comfortably visible
        const visibleX = markerScreenX, margin = 60, vw = scroll.clientWidth;
        if (!pauseAutoScroll && !userScrolling) {
          if (visibleX < margin) easeScrollTo(Math.max(0, lockedWorldX - margin), markerScreenX);
          else if (visibleX > vw - margin) easeScrollTo(Math.min(cssW - vw, lockedWorldX - (vw - margin)), markerScreenX);
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

  // cancel auto-scroll on native scroll/touchmove
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

/**
 * buildDaily
 * - Simple daily list builder (unchanged).
 */
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