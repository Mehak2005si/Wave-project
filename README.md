# Wave: Gesture-Controlled Media Player

An HCI project. You control a media player with hand gestures picked up by your webcam. Recognition uses Google's MediaPipe Gesture Recognizer and runs entirely in the browser. The app has a built-in user-study mode that compares gesture input with keyboard shortcuts, measuring task time, errors and SUS score.

## Run it in VS Code

You need [Node.js](https://nodejs.org) (any recent version), Chrome or Edge, a webcam, and an internet connection the first time (the gesture model loads from a CDN). There is nothing to `npm install`.

**Option A: press F5 (easiest)**
1. In VS Code, use **File → Open Folder…** and choose the `wave-project` folder.
2. Press **F5**, or go to Run and Debug → **"Run Wave in Chrome"**. This starts the server and opens Chrome for you.
3. Click **Start camera** and allow camera access.

**Option B: terminal**
```bash
npm start
```
Then open **http://localhost:8000**.

**Option C: Live Server extension**
Right-click `index.html` → **Open with Live Server**.

> Browsers only allow camera access on `localhost` or `https`, so don't double-click `index.html` to open it from the file system.

The app comes with three synthesized demo tracks, so it works right away. You can add your own audio or video files with **+ Add media** or by dragging them onto the player.

## Project structure

```
wave-project/
├── index.html          # Page layout: player, camera panel, study dialogs
├── css/style.css       # All styling
├── js/app.js           # Player, gesture engine, MediaPipe camera loop, user study
├── server.js           # Tiny static server (no dependencies)
├── package.json        # npm start → node server.js
└── .vscode/            # F5 launch config, server task, recommended extensions
```

In `js/app.js`:
- `CONFIG`: the MediaPipe URLs
- `DEFAULTS`: hold time, confidence threshold, cooldown
- `GESTURES`: the mapping from gesture to action (change it here to remap gestures)
- `feedGesture()`: the recognition logic (smoothing, then hold-to-confirm, then action)
- `study`: the user-study flow

## Gestures

| Gesture | Action |
|---|---|
| ✋ Open palm | Play / Pause |
| 👍 Thumbs up (hold) | Volume up (repeats while you hold it) |
| 👎 Thumbs down (hold) | Volume down (repeats while you hold it) |
| ✌️ Victory | Next track |
| ☝️ Point up | Previous track (or restart if more than 3 s in) |
| 🤟 Rock on | Mute / Unmute |
| ✊ Fist (hold 1 s) | Lock / unlock gestures |

Keyboard equivalents: `Space`, `↑` `↓`, `N`, `P`, `M`, `L`.

## HCI design decisions (use these in your report)

| Problem | What Wave does | Principle |
|---|---|---|
| **Midas-touch problem**: every hand movement could trigger something | Hold-to-confirm (400 ms by default) with a progress ring that fills up | Error prevention |
| Recognition flickers between frames | Majority vote over the last 5 frames, plus a cooldown between actions | Error prevention |
| Accidental commands while talking or gesturing | ✊ "clutch" that locks gesture input | User control & freedom |
| User can't tell whether they were recognized | Live hand skeleton, gesture name + confidence, the matching legend row lights up, large on-screen confirmation of the action | Visibility of system status, feedback |
| Users have to memorize gestures | Gesture legend is always visible | Recognition rather than recall |
| Different users, lighting and hands | Adjustable hold time, confidence threshold, cooldown and repeat rate | Flexibility & efficiency |
| Camera unavailable or gestures tiring | Full keyboard and mouse fallback | Flexibility; accessibility |
| Privacy | Video never leaves the browser | Trust |

## Running the user study

1. Click **🧪 User study**, enter a participant ID (P01, P02, …) and choose the input method.
2. The participant sees one command at a time, for example *"Go to the NEXT track"*, and does it as quickly as they can. The app logs:
   - **completion time** (from the prompt appearing to the correct action)
   - **errors** (wrong actions, including false activations)
   - **timeouts**
3. During a block, only the chosen input method is accepted.
4. At the end of each block the participant fills in the **SUS** (System Usability Scale) questionnaire.
5. Run **both** methods for each participant. **Counterbalance** the order: odd-numbered participants start with gestures, even-numbered with the keyboard.
6. **📊 Results** shows the summary tables. **⬇ Trials CSV** and **⬇ SUS CSV** export the raw data for your report. Data is saved in the browser until you clear it.

**Suggested setup:** 8–12 participants, 3 repetitions per command (18 trials per block), and a short practice run before each block.

**Analysis:** use a paired t-test (or Wilcoxon signed-rank test) on mean time per participant and on SUS score. Report the error rate per method. Expect the keyboard to be faster. The interesting findings are *how much* faster, which gestures cause the most errors, and whether SUS scores differ. Note that gesture times include the hold-to-confirm delay by design.

**Ideas for extending the project:**
- Compare hold times (200 vs 400 vs 700 ms) to explore the trade-off between speed and false activations.
- Add NASA-TLX to measure workload.
- Test under different lighting conditions.

## Testing without a camera

Open DevTools → Console and run `WaveDebug.simulate("Victory")`. This feeds a fake gesture through the same recognition pipeline.

## Offline use

To run without internet, download `@mediapipe/tasks-vision@1.2.2` (from npm) and `gesture_recognizer.task` into the folder, then change the three URLs in the `CONFIG` block at the top of `js/app.js`.

## Tech

Plain HTML/CSS/JavaScript in one file, with no build step. Hand landmarks and gesture classification come from the MediaPipe Tasks Vision `GestureRecognizer` (7 built-in gestures), which uses the GPU and falls back to the CPU.
