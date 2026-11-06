/* =========================================================================
   CONFIG — change these if you host the MediaPipe files yourself (offline use)
   ========================================================================= */
const CONFIG = {
  BUNDLE:    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/vision_bundle.mjs",
  WASM_BASE: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm",
  MODEL:     "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
};

const DEFAULTS = { holdMs: 400, threshold: 0.6, cooldownMs: 700, repeatMs: 300 };
const SMOOTH_FRAMES = 5;      // majority vote over the last N frames removes 1–2 frame flicker
const LOCK_HOLD_MS = 1000;    // the lock gesture needs a longer, deliberate hold

const ACTIONS = {
  togglePlay: { label: "Play / Pause",   icon: "⏯" },
  volUp:      { label: "Volume up",      icon: "🔊" },
  volDown:    { label: "Volume down",    icon: "🔉" },
  next:       { label: "Next track",     icon: "⏭" },
  prev:       { label: "Previous track", icon: "⏮" },
  mute:       { label: "Mute / Unmute",  icon: "🔇" },
  lock:       { label: "Lock / Unlock",  icon: "🔒" },
};
const GESTURES = [
  { name: "Open_Palm",   emoji: "✋", title: "Open palm",   hint: "All fingers spread",  action: "togglePlay" },
  { name: "Thumb_Up",    emoji: "👍", title: "Thumbs up",   hint: "Hold to keep raising", action: "volUp",   repeat: true },
  { name: "Thumb_Down",  emoji: "👎", title: "Thumbs down", hint: "Hold to keep lowering", action: "volDown", repeat: true },
  { name: "Victory",     emoji: "✌️", title: "Victory",     hint: "Two fingers up",      action: "next" },
  { name: "Pointing_Up", emoji: "☝️", title: "Point up",    hint: "Index finger up",     action: "prev" },
  { name: "ILoveYou",    emoji: "🤟", title: "Rock on",     hint: "Thumb, index, pinky", action: "mute" },
  { name: "Closed_Fist", emoji: "✊", title: "Fist",        hint: "Hold for 1 second",   action: "lock", holdMs: LOCK_HOLD_MS },
];
const G_BY_NAME = Object.fromEntries(GESTURES.map(g => [g.name, g]));
const KEYS = { " ": "togglePlay", ArrowUp: "volUp", ArrowDown: "volDown", n: "next", N: "next",
               p: "prev", P: "prev", m: "mute", M: "mute", l: "lock", L: "lock" };

const $ = (s, el = document) => el.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const settings = { ...DEFAULTS, ...store.get("wave-settings", {}) };

/* =========================================================================
   Toast + log (feedback)
   ========================================================================= */
let toastTimer;
function toast(text, kind = "") {
  const t = $("#toast");
  t.textContent = text;
  t.className = "toast show " + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast " + kind), 1100);
}
const logItems = [];
function logEvent(action, source, detail = "") {
  const d = new Date();
  logItems.unshift({ t: d.toTimeString().slice(0, 8), action, source, detail });
  logItems.length = Math.min(logItems.length, 40);
  $("#log").innerHTML = logItems.map(i =>
    `<li><span class="t">${i.t}</span><span>${ACTIONS[i.action].icon} ${ACTIONS[i.action].label}${i.detail ? " · " + i.detail : ""}</span><span class="src ${i.source}">${i.source}</span></li>`
  ).join("");
}

/* =========================================================================
   Media player
   ========================================================================= */
const media = $("#media");
const stage = $("#stage");
let playlist = [];   // {title, artist, url, kind: 'audio'|'video'}
let idx = -1;

function fmt(s) { if (!isFinite(s)) return "0:00"; s = Math.floor(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

function renderPlaylist() {
  $("#playlist").innerHTML = playlist.map((t, i) =>
    `<li data-i="${i}" class="${i === idx ? "cur" : ""}"><span class="n">${i === idx ? "▶" : i + 1}</span><span>${escapeHtml(t.title)}</span><span class="k">${t.kind}</span></li>`
  ).join("");
  $("#emptyMsg").style.display = playlist.length ? "none" : "flex";
}
function escapeHtml(s) { return s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function loadTrack(i, autoplay) {
  if (!playlist.length) return;
  idx = (i + playlist.length) % playlist.length;
  const t = playlist[idx];
  media.src = t.url;
  stage.classList.toggle("audio", t.kind === "audio");
  $("#posterTitle").textContent = t.title;
  $("#posterArtist").textContent = t.artist || "";
  $("#trackMeta").textContent = `${idx + 1} / ${playlist.length}`;
  renderPlaylist();
  if (autoplay) play();
}
async function play() {
  if (!playlist.length) { toast("Add some media first", "warn"); return false; }
  try { await media.play(); return true; }
  catch (e) { toast("Click the page once to allow sound", "warn"); return false; }
}
function updatePlayUi() {
  $("#bPlay").textContent = media.paused ? "▶" : "⏸";
  stage.classList.toggle("playing", !media.paused);
}
function updateVolUi() {
  const v = Math.round(media.volume * 100);
  $("#vol").value = v;
  $("#volLbl").textContent = media.muted ? "muted" : v + "%";
  $("#bMute").textContent = media.muted || v === 0 ? "🔇" : v < 50 ? "🔉" : "🔊";
}
media.addEventListener("play", updatePlayUi);
media.addEventListener("pause", updatePlayUi);
media.addEventListener("volumechange", updateVolUi);
media.addEventListener("ended", () => loadTrack(idx + 1, true));
media.addEventListener("timeupdate", () => {
  if (!seeking && media.duration) $("#seek").value = (media.currentTime / media.duration) * 1000;
  $("#time").textContent = `${fmt(media.currentTime)} / ${fmt(media.duration)}`;
});
let seeking = false;
$("#seek").addEventListener("input", () => { seeking = true; });
$("#seek").addEventListener("change", () => { if (media.duration) media.currentTime = ($("#seek").value / 1000) * media.duration; seeking = false; });
$("#vol").addEventListener("input", () => { media.volume = $("#vol").value / 100; media.muted = false; });

/* Core commands — every input method (gesture, keyboard, mouse) ends up here */
const commands = {
  async togglePlay() {
    if (media.paused) { if (await play()) return "▶ Play"; return null; }
    media.pause(); return "⏸ Paused";
  },
  volUp()   { media.muted = false; media.volume = Math.min(1, Math.round(media.volume * 10 + 1) / 10); return `🔊 ${Math.round(media.volume * 100)}%`; },
  volDown() { media.volume = Math.max(0, Math.round(media.volume * 10 - 1) / 10); return `🔉 ${Math.round(media.volume * 100)}%`; },
  next() {
    if (!playlist.length) return null;
    loadTrack(idx + 1, true); return `⏭ ${playlist[idx].title}`;
  },
  prev() {
    if (!playlist.length) return null;
    if (media.currentTime > 3) { media.currentTime = 0; return "⏮ Restart"; }
    loadTrack(idx - 1, true); return `⏮ ${playlist[idx].title}`;
  },
  mute() { media.muted = !media.muted; return media.muted ? "🔇 Muted" : `🔊 ${Math.round(media.volume * 100)}%`; },
  lock() { setLocked(!engine.locked); return engine.locked ? "🔒 Gestures locked" : "🔓 Gestures unlocked"; },
};

async function performAction(action, source) {
  // During a study block, only the block's input method is accepted (keeps the data clean).
  if (study.active && source !== study.condition) {
    toast(`Use ${study.condition === "gesture" ? "gestures" : "the keyboard"} for this block`, "warn");
    return;
  }
  if (study.active && action === "lock") return; // lock is disabled during studies
  const msg = await commands[action]();
  if (msg) toast(msg);
  logEvent(action, source);
  study.onAction(action);
}

$("#bPlay").onclick = () => performAction("togglePlay", "mouse");
$("#bNext").onclick = () => performAction("next", "mouse");
$("#bPrev").onclick = () => performAction("prev", "mouse");
$("#bMute").onclick = () => performAction("mute", "mouse");
$("#playlist").addEventListener("click", e => {
  const li = e.target.closest("li"); if (!li || study.active) return;
  loadTrack(+li.dataset.i, true);
});
document.addEventListener("click", e => { const b = e.target.closest("button"); if (b) b.blur(); });

window.addEventListener("keydown", e => {
  if (e.target.closest("input, select, textarea")) return;
  if (document.querySelector(".modal.open")) return;
  const a = KEYS[e.key];
  if (!a) return;
  if (e.repeat && a !== "volUp" && a !== "volDown") { e.preventDefault(); return; }
  e.preventDefault();
  performAction(a, "keyboard");
});

/* Adding files */
function addFiles(files) {
  const before = playlist.length;
  for (const f of files) {
    if (!/^(audio|video)\//.test(f.type)) continue;
    playlist.push({ title: f.name.replace(/\.[^.]+$/, ""), artist: "Local file", url: URL.createObjectURL(f), kind: f.type.startsWith("video") ? "video" : "audio" });
  }
  const added = playlist.length - before;
  if (!added) { toast("Only audio/video files", "warn"); return; }
  toast(`＋ ${added} added`);
  loadTrack(before, !media.paused); // jump to the first new file, keep play state
}
$("#bAdd").onclick = () => $("#fileIn").click();
$("#fileIn").onchange = e => { addFiles(e.target.files); e.target.value = ""; };
["dragenter", "dragover"].forEach(ev => stage.addEventListener(ev, e => { e.preventDefault(); stage.classList.add("drag"); }));
["dragleave", "drop"].forEach(ev => stage.addEventListener(ev, e => { e.preventDefault(); stage.classList.remove("drag"); }));
stage.addEventListener("drop", e => addFiles(e.dataTransfer.files));

/* Built-in demo tracks (synthesised, so the app works with zero setup) */
function midiHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function synthTrack({ chords, bpm, seconds = 24, octave = 0 }) {
  const sr = 22050, n = sr * seconds, data = new Float32Array(n);
  const beat = 60 / bpm, step = beat / 2;              // eighth-note arpeggio
  const steps = Math.floor(seconds / step);
  for (let s = 0; s < steps; s++) {
    const chord = chords[Math.floor(s / 8) % chords.length];
    const note = chord[[0, 1, 2, 1, 0, 2, 1, 2][s % 8]] + 12 * octave;
    const f = midiHz(note), start = Math.floor(s * step * sr), len = Math.floor(step * 1.8 * sr);
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / sr, env = Math.exp(-t * 5) * Math.min(1, t * 200);
      data[start + i] += 0.22 * env * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * 2 * f * t));
    }
    if (s % 2 === 0) { // bass on every beat
      const bf = midiHz(chord[0] - 24), blen = Math.floor(beat * sr);
      for (let i = 0; i < blen && start + i < n; i++) {
        const t = i / sr, env = Math.exp(-t * 3) * Math.min(1, t * 150);
        data[start + i] += 0.28 * env * Math.sin(2 * Math.PI * bf * t);
      }
    }
  }
  for (let i = 0; i < sr; i++) { data[i] *= i / sr; data[n - 1 - i] *= i / sr; } // fade in/out
  // encode 16-bit mono WAV
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 0x7fff, true);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}
function loadDemoTracks() {
  const demos = [
    { title: "Sunrise",     chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], bpm: 100 },
    { title: "Night Drive", chords: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]], bpm: 124 },
    { title: "Lo-fi Loop",  chords: [[62, 65, 69], [55, 59, 65], [60, 64, 71], [60, 64, 67]], bpm: 84, octave: 1 },
  ];
  playlist = demos.map(d => ({ title: d.title, artist: "Wave demo track", url: synthTrack(d), kind: "audio" }));
  media.volume = 0.7;
  loadTrack(0, false);
}

/* =========================================================================
   Gesture engine: smoothing → hold-to-confirm → cooldown / repeat → action
   ========================================================================= */
const engine = { recent: [], cand: "None", since: 0, fired: false, lastFire: -1e9, lastRepeat: 0, locked: false };

function setLocked(v) {
  engine.locked = v;
  $("#cam").classList.toggle("locked", v);
  const p = $("#pillLock");
  p.className = "pill " + (v ? "warn" : "ok");
  p.lastElementChild.textContent = v ? "Gestures locked" : "Gestures active";
  $("#bLock").textContent = v ? "🔓 Unlock gestures" : "🔒 Lock gestures";
  document.querySelectorAll(".legend .row").forEach(r => r.classList.toggle("disabled", v && r.dataset.g !== "Closed_Fist"));
}
$("#bLock").onclick = () => performAction("lock", "mouse");

function majority(arr) {
  const c = {}; let best = "None", bc = 0;
  for (const x of arr) { c[x] = (c[x] || 0) + 1; if (c[x] > bc) { bc = c[x]; best = x; } }
  return best;
}

/** Feed one frame of recognition output. `now` is a timestamp in ms. */
function feedGesture(rawName, score, now, handVisible = true) {
  const name = rawName && rawName !== "None" && score >= settings.threshold ? rawName : "None";
  engine.recent.push(name);
  if (engine.recent.length > SMOOTH_FRAMES) engine.recent.shift();
  const g0 = majority(engine.recent);

  if (g0 !== engine.cand) { engine.cand = g0; engine.since = now; engine.fired = false; }
  const g = G_BY_NAME[g0];
  let progress = 0, blocked = false;

  if (g) {
    const hold = g.holdMs ?? settings.holdMs;
    const held = now - engine.since;
    progress = Math.min(1, held / hold);
    blocked = (engine.locked && g.action !== "lock") || (study.active && g.action === "lock");
    if (!blocked && held >= hold) {
      if (g.repeat) {
        if (!engine.fired || now - engine.lastRepeat >= settings.repeatMs) {
          engine.fired = true; engine.lastRepeat = now; engine.lastFire = now;
          performAction(g.action, "gesture");
        }
      } else if (!engine.fired && now - engine.lastFire >= settings.cooldownMs) {
        engine.fired = true; engine.lastFire = now;
        performAction(g.action, "gesture");
      }
    }
  }
  renderGestureUi(g, score, progress, blocked, handVisible);
  return { gesture: g0, progress, fired: engine.fired };
}

const RING_C = 2 * Math.PI * 20;
function renderGestureUi(g, score, progress, blocked, handVisible) {
  const fired = engine.fired && !g?.repeat;
  $("#ringFg").style.strokeDashoffset = String(RING_C * (1 - (blocked ? 0 : progress)));
  $("#ringFg").style.stroke = fired ? "var(--accent2)" : "var(--accent)";
  if (g) {
    $("#gEmoji").textContent = g.emoji;
    $("#gName").textContent = g.title;
    $("#gConf").textContent = blocked ? "Locked" : `${ACTIONS[g.action].label} · ${Math.round(score * 100)}%`;
  } else {
    $("#gEmoji").textContent = handVisible ? "🖐" : "·";
    $("#gName").textContent = handVisible ? "Hand detected" : "No hand";
    $("#gConf").textContent = handVisible ? "Make one of the gestures below" : "Show your hand to the camera";
  }
  document.querySelectorAll(".legend .row").forEach(r => r.classList.toggle("active", !!g && r.dataset.g === g.name && !blocked));
}

/* Legend */
$("#legend").innerHTML = GESTURES.map(g =>
  `<div class="row" data-g="${g.name}"><div class="e">${g.emoji}</div><div class="g">${g.title}<small>${g.hint}</small></div><div class="a">${ACTIONS[g.action].icon} ${ACTIONS[g.action].label}</div></div>`
).join("");

/* Settings */
function bindSetting(id, out, key, fmtFn) {
  const el = $(id);
  el.value = settings[key];
  const sync = () => { settings[key] = +el.value; $(out).textContent = fmtFn(+el.value); store.set("wave-settings", settings); };
  el.addEventListener("input", sync); sync();
}
bindSetting("#sHold", "#oHold", "holdMs", v => `${v} ms`);
bindSetting("#sConf", "#oConf", "threshold", v => `${Math.round(v * 100)}%`);
bindSetting("#sCool", "#oCool", "cooldownMs", v => `${v} ms`);
bindSetting("#sRep", "#oRep", "repeatMs", v => `${v} ms`);
$("#bReset").onclick = () => {
  Object.assign(settings, DEFAULTS);
  for (const [id, k] of [["#sHold", "holdMs"], ["#sConf", "threshold"], ["#sCool", "cooldownMs"], ["#sRep", "repeatMs"]]) {
    $(id).value = settings[k]; $(id).dispatchEvent(new Event("input"));
  }
};

/* =========================================================================
   Camera + MediaPipe
   ========================================================================= */
const camVideo = $("#camVideo"), canvas = $("#camCanvas"), ctx = canvas.getContext("2d");
let recognizer = null, HAND_CONNECTIONS = [], stream = null, rafId = 0, lastVideoTime = -1;
let fpsFrames = 0, fpsT0 = performance.now();

function setPill(id, cls, text) { const p = $(id); p.className = "pill " + cls; p.lastElementChild.textContent = text; }

async function initModel() {
  setPill("#pillModel", "warn", "Loading model…");
  try {
    const vision = await import(CONFIG.BUNDLE);
    const fileset = await vision.FilesetResolver.forVisionTasks(CONFIG.WASM_BASE);
    let lastErr;
    for (const delegate of ["GPU", "CPU"]) {
      try {
        recognizer = await vision.GestureRecognizer.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: CONFIG.MODEL, delegate },
          runningMode: "VIDEO",
          numHands: 1,
        });
        HAND_CONNECTIONS = vision.GestureRecognizer.HAND_CONNECTIONS;
        setPill("#pillModel", "ok", `Model ready (${delegate})`);
        return;
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  } catch (e) {
    console.error(e);
    setPill("#pillModel", "bad", "Model failed to load");
    toast("Couldn't load the gesture model — check your internet", "bad");
  }
}

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: false });
  } catch (e) {
    console.error(e);
    setPill("#pillCam", "bad", "Camera blocked");
    toast("Camera permission denied", "bad");
    return;
  }
  camVideo.srcObject = stream;
  await camVideo.play();
  canvas.width = camVideo.videoWidth || 640;
  canvas.height = camVideo.videoHeight || 480;
  $("#camPlaceholder").style.display = "none";
  $("#cam").classList.add("live");
  $("#bCamStop").disabled = false;
  setPill("#pillCam", "ok", "Camera on");
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
  if (!recognizer) initModel();
}

function stopCamera() {
  cancelAnimationFrame(rafId);
  stream?.getTracks().forEach(t => t.stop());
  stream = null;
  $("#cam").classList.remove("live");
  $("#camPlaceholder").style.display = "flex";
  $("#bCamStop").disabled = true;
  setPill("#pillCam", "", "Camera off");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  feedGesture("None", 0, performance.now(), false);
}
$("#bCamStart").onclick = startCamera;
$("#bCamStop").onclick = stopCamera;

function loop() {
  if (camVideo.readyState >= 2 && camVideo.currentTime !== lastVideoTime) {
    lastVideoTime = camVideo.currentTime;
    const now = performance.now();
    let res = null;
    if (recognizer) {
      try { res = recognizer.recognizeForVideo(camVideo, now); } catch (e) { console.warn(e); }
    }
    draw(res);
    const top = res?.gestures?.[0]?.[0];
    feedGesture(top?.categoryName ?? "None", top?.score ?? 0, now, !!res?.landmarks?.length);

    fpsFrames++;
    if (now - fpsT0 > 1000) { $("#fps").textContent = `${Math.round(fpsFrames * 1000 / (now - fpsT0))} fps`; fpsFrames = 0; fpsT0 = now; }
  }
  rafId = requestAnimationFrame(loop);
}

function draw(res) {
  const W = canvas.width, H = canvas.height;
  ctx.save();
  ctx.translate(W, 0); ctx.scale(-1, 1);       // mirror, so it feels like a mirror to the user
  ctx.drawImage(camVideo, 0, 0, W, H);
  const lm = res?.landmarks?.[0];
  if (lm) {
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(76,195,138,.9)";
    for (const c of HAND_CONNECTIONS) {
      const a = lm[c.start], b = lm[c.end];
      ctx.beginPath(); ctx.moveTo(a.x * W, a.y * H); ctx.lineTo(b.x * W, b.y * H); ctx.stroke();
    }
    ctx.fillStyle = "#fff";
    for (const p of lm) { ctx.beginPath(); ctx.arc(p.x * W, p.y * H, 4, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

/* =========================================================================
   User study: timed command trials + SUS + CSV export
   ========================================================================= */
const STUDY_ACTIONS = ["togglePlay", "volUp", "volDown", "next", "prev", "mute"];
const SUS_ITEMS = [
  "I think that I would like to use this system frequently.",
  "I found the system unnecessarily complex.",
  "I thought the system was easy to use.",
  "I think that I would need the support of a technical person to be able to use this system.",
  "I found the various functions in this system were well integrated.",
  "I thought there was too much inconsistency in this system.",
  "I would imagine that most people would learn to use this system very quickly.",
  "I found the system very cumbersome to use.",
  "I felt very confident using the system.",
  "I needed to learn a lot of things before I could get going with this system.",
];
const data = store.get("wave-study-v1", { trials: [], sus: [] });
const saveData = () => store.set("wave-study-v1", data);

function shuffleNoRepeat(arr) {
  for (let tries = 0; tries < 200; tries++) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    if (a.every((x, i) => i === 0 || x !== a[i - 1])) return a;
  }
  return arr;
}
function promptFor(action) {
  return {
    togglePlay: media.paused ? "▶ Play the music" : "⏸ Pause the music",
    volUp: "🔊 Turn the volume UP", volDown: "🔉 Turn the volume DOWN",
    next: "⏭ Go to the NEXT track", prev: "⏮ Go to the PREVIOUS track",
    mute: media.muted ? "🔊 Unmute" : "🔇 Mute the sound",
  }[action];
}

const study = {
  active: false, condition: null, pid: "", blockId: "", order: [], i: 0, cur: null,
  timeoutMs: 10000, readyTimer: 0, timeoutTimer: 0, raf: 0,

  start(pid, condition, reps, timeoutMs) {
    if (!playlist.length) loadDemoTracks();
    if (condition === "gesture" && !recognizer && !window.WaveDebug?.allowNoModel) { toast("Start the camera first", "warn"); return false; }
    setLocked(false);
    Object.assign(this, { active: true, pid, condition, timeoutMs, i: 0, cur: null,
      blockId: `${pid}-${condition}-${Date.now()}`,
      order: shuffleNoRepeat(STUDY_ACTIONS.flatMap(a => Array(reps).fill(a))) });
    $("#studyBanner").classList.add("on");
    this.next();
    return true;
  },
  next() {
    clearTimeout(this.timeoutTimer); cancelAnimationFrame(this.raf);
    this.cur = null;
    if (this.i >= this.order.length) { this.finish(); return; }
    $("#studyCount").textContent = `Trial ${this.i + 1}/${this.order.length}`;
    const p = $("#studyPrompt"); p.textContent = "Get ready…"; p.className = "prompt ready";
    $("#studyTimer").style.width = "0";
    this.readyTimer = setTimeout(() => {
      const target = this.order[this.i];
      this.cur = { target, start: performance.now(), errors: 0, wrong: [] };
      p.textContent = promptFor(target); p.className = "prompt";
      this.timeoutTimer = setTimeout(() => this.record("timeout"), this.timeoutMs);
      const tick = () => {
        if (!this.cur) return;
        $("#studyTimer").style.width = `${Math.min(100, (performance.now() - this.cur.start) / this.timeoutMs * 100)}%`;
        this.raf = requestAnimationFrame(tick);
      };
      tick();
    }, 1200 + Math.random() * 600); // jittered delay so participants can't anticipate
  },
  onAction(action) {
    if (!this.active || !this.cur) return;
    if (action === this.cur.target) { this.record("correct"); return; }
    this.cur.errors++; this.cur.wrong.push(action);
    flashBanner("err");
  },
  record(outcome) {
    const c = this.cur; if (!c) return;
    const time = Math.round(performance.now() - c.start);
    data.trials.push({
      participant: this.pid, condition: this.condition, block: this.blockId, trial: this.i + 1,
      target: c.target, outcome, time_ms: outcome === "correct" ? time : "", errors: c.errors,
      wrong_actions: c.wrong.join("|"), hold_ms: settings.holdMs, threshold: settings.threshold,
      timestamp: new Date().toISOString(),
    });
    saveData();
    if (outcome === "correct") flashBanner("ok"); else toast("⏱ Time's up", "warn");
    this.i++;
    this.next();
  },
  finish() {
    this.stop(false);
    openSus(this.pid, this.condition, this.blockId);
  },
  stop(aborted = true) {
    clearTimeout(this.readyTimer); clearTimeout(this.timeoutTimer); cancelAnimationFrame(this.raf);
    this.active = false; this.cur = null;
    $("#studyBanner").classList.remove("on", "err", "ok");
    if (aborted) toast("Study stopped");
  },
};
function flashBanner(kind) {
  const b = $("#studyBanner");
  b.classList.remove("err", "ok"); void b.offsetWidth; b.classList.add(kind);
  setTimeout(() => b.classList.remove(kind), 350);
}
$("#studyStop").onclick = () => study.stop(true);

/* Modals */
function openModal(id) { $(id).classList.add("open"); }
function closeModal(id) { $(id).classList.remove("open"); }
document.querySelectorAll(".modal").forEach(m => m.addEventListener("click", e => {
  if (e.target === m || e.target.hasAttribute("data-close")) closeModal("#" + m.id);
}));

$("#btnStudy").onclick = () => {
  if (study.active) return;
  const n = data.trials.length ? new Set(data.trials.map(t => t.participant)).size + 1 : 1;
  if (!$("#fPid").value) $("#fPid").value = `P${String(n).padStart(2, "0")}`;
  openModal("#mSetup");
};
const updateSetupNote = () => {
  const r = +$("#fReps").value;
  $("#setupNote").textContent = `6 commands × ${r} = ${6 * r} trials, in random order. During the block, only the selected input method is accepted.`;
};
$("#fReps").onchange = updateSetupNote;
$("#fStart").onclick = () => {
  const pid = $("#fPid").value.trim() || "P00";
  if (study.start(pid, $("#fCond").value, +$("#fReps").value, +$("#fTimeout").value)) closeModal("#mSetup");
};

/* SUS */
let susCtx = null;
$("#susForm").innerHTML = SUS_ITEMS.map((q, i) =>
  `<div class="q"><div>${i + 1}. ${q}</div><div class="scale">${[1, 2, 3, 4, 5].map(v =>
    `<label><input type="radio" name="sus${i}" value="${v}">${v}</label>`).join("")}</div></div>`
).join("");
function openSus(pid, condition, blockId) {
  susCtx = { pid, condition, blockId };
  $("#susSub").style.color = "";
  $("#susSub").textContent = `${pid} — rate the ${condition === "gesture" ? "GESTURE" : "KEYBOARD"} controls you just used.`;
  document.querySelectorAll("#susForm input").forEach(i => (i.checked = false));
  openModal("#mSus");
}
$("#susSubmit").onclick = () => {
  const ans = SUS_ITEMS.map((_, i) => +(document.querySelector(`input[name=sus${i}]:checked`)?.value || 0));
  if (ans.includes(0)) { alertMissing(); return; }
  const score = ans.reduce((s, a, i) => s + (i % 2 === 0 ? a - 1 : 5 - a), 0) * 2.5;
  data.sus.push({ participant: susCtx.pid, condition: susCtx.condition, block: susCtx.blockId,
    ...Object.fromEntries(ans.map((a, i) => [`q${i + 1}`, a])), sus_score: score, timestamp: new Date().toISOString() });
  saveData();
  closeModal("#mSus");
  showResults();
};
function alertMissing() { const s = $("#susSub"); s.style.color = "var(--bad)"; s.textContent = "Please answer all 10 statements."; }
$("#susSkip").onclick = () => { closeModal("#mSus"); showResults(); };

/* Results */
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const median = a => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sd = a => { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const f0 = (x, suf = "") => isFinite(x) ? Math.round(x) + suf : "—";
const f1 = (x, suf = "") => isFinite(x) ? x.toFixed(1) + suf : "—";

function showResults() {
  const conds = ["gesture", "keyboard"];
  const rows = conds.map(c => {
    const t = data.trials.filter(r => r.condition === c);
    const ok = t.filter(r => r.outcome === "correct").map(r => r.time_ms);
    const errs = t.reduce((s, r) => s + r.errors, 0);
    const sus = data.sus.filter(r => r.condition === c).map(r => r.sus_score);
    return `<tr><td><b>${c === "gesture" ? "✋ Gesture" : "⌨️ Keyboard"}</b></td>
      <td class="num">${new Set(t.map(r => r.participant)).size}</td>
      <td class="num">${t.length}</td>
      <td class="num">${f0(mean(ok), " ms")} <small style="color:var(--muted)">± ${f0(sd(ok))}</small></td>
      <td class="num">${f0(median(ok), " ms")}</td>
      <td class="num">${t.length ? f1(errs / t.length) : "—"}</td>
      <td class="num">${t.length ? f1(100 * t.filter(r => r.outcome === "timeout").length / t.length, "%") : "—"}</td>
      <td class="num">${f1(mean(sus))}</td></tr>`;
  }).join("");
  const perCmd = STUDY_ACTIONS.map(a => {
    const cell = c => f0(mean(data.trials.filter(r => r.condition === c && r.target === a && r.outcome === "correct").map(r => r.time_ms)), " ms");
    return `<tr><td>${ACTIONS[a].icon} ${ACTIONS[a].label}</td><td class="num">${cell("gesture")}</td><td class="num">${cell("keyboard")}</td></tr>`;
  }).join("");
  $("#resBody").innerHTML = data.trials.length || data.sus.length ? `
    <table><thead><tr><th>Method</th><th>Participants</th><th>Trials</th><th>Mean time</th><th>Median</th><th>Errors / trial</th><th>Timeouts</th><th>Mean SUS</th></tr></thead><tbody>${rows}</tbody></table>
    <h4 style="margin:20px 0 4px">Mean completion time per command</h4>
    <table><thead><tr><th>Command</th><th>Gesture</th><th>Keyboard</th></tr></thead><tbody>${perCmd}</tbody></table>
    <div class="note">Times are from the moment the prompt appears to the moment the correct action fires (correct trials only). Gesture times include the ${settings.holdMs} ms hold-to-confirm. SUS above 68 is considered above average.</div>`
    : `<p class="muted">No study data yet. Click “🧪 User study” to run a block.</p>`;
  openModal("#mResults");
}
$("#btnResults").onclick = showResults;

function downloadCsv(name, rows) {
  if (!rows.length) { toast("Nothing to export yet", "warn"); return; }
  const cols = Object.keys(rows[0]);
  const esc = v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$("#rCsvTrials").onclick = () => downloadCsv("wave_trials.csv", data.trials);
$("#rCsvSus").onclick = () => downloadCsv("wave_sus.csv", data.sus);
$("#rClear").onclick = () => {
  if (!confirm("Delete all saved study data from this browser?")) return;
  data.trials = []; data.sus = []; saveData(); showResults();
};

/* =========================================================================
   Boot
   ========================================================================= */
loadDemoTracks();
updateVolUi(); updatePlayUi();
setLocked(false);
renderGestureUi(null, 0, 0, false, false);

// Exposed for automated testing and for demoing without a camera (open DevTools → WaveDebug.simulate("Victory"))
window.WaveDebug = {
  feedGesture, performAction, study, data, engine, settings, media,
  async simulate(name, ms = 800, fps = 30) {
    const t0 = performance.now();
    for (let t = 0; t <= ms; t += 1000 / fps) { feedGesture(name, 0.9, t0 + t); await new Promise(r => setTimeout(r, 1000 / fps)); }
    for (let i = 0; i < SMOOTH_FRAMES; i++) feedGesture("None", 0, t0 + ms + i * 33);
  },
};
