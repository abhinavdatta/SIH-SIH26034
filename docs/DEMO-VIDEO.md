# LMCC Demo Video — Paste-Ready Script (Trupeer / Guidde / Clueso)

Target length: **3:30–4:15** · 1920×1080 · MP4 (H.264)

**Two ways to use this doc:**

1. **AI-recorded route (Trupeer / Guidde / Clueso):** record each scene as its
   own take, paste the `VOICEOVER` block into that step's narration/TTS field,
   and follow the `ACTIONS` list on screen. The tool handles zooms, cutting,
   captions, and voiceover automatically.
2. **Manual route (OBS + CapCut):** the same blocks are your shot list and
   teleprompter; record your own voice over them.

**TTS paste rules:** the voiceover blocks are plain text — no markdown, no
symbols. Periods mark pauses. "OCR", "API", "MRP" read fine as letters.
Do **not** paste the ACTIONS list into the voiceover field.

**Rendered previews:** each beat has a captured screenshot in `images/`
(`NN-*.png`, numbered in demo-timeline order, 1920×1080 dark mode),
produced by `node scripts/capture-demo-screens.cjs` — useful as framing
references while recording.

| # | File | Beat |
|---|------|------|
| 01 | `01-dashboard.png` | Scene 1 — hook / dashboard |
| 02 | `02-signup-roles.png` | Scene 2 — sign-up + role selector |
| 03 | `03-forgot-questions.png` | Scene 2 — forgot-password questions step |
| 04 | `04-account-security.png` | Scene 2 — 2FA + backup codes section |
| 05 | `05-mode-hybrid-builtin.png` | Scene 3 — hybrid preselected + built-in banner |
| 06 | `06-scan-start.png` | Scene 3 — progress steps begin |
| 07 | `07-scan-console.png` | Scene 3 — live activity console |
| 08 | `08-scan-results.png` | Scene 3 — extracted fields with confidence |
| 09 | `09-compliance-report.png` | Scene 4 — verdict, rule citations, export |
| 10 | `10-scan-history.png` | Scene 5 — history list |
| 11 | `11-product-audit.png` | Scene 5 — manual entry / edit form |
| 12 | `12-ai-providers.png` | Scene 6 — BYOK provider config |

---

## Scene 1 — Hook + Problem (0:00–0:25)

**VOICEOVER — paste into the narration field:**

```
Every packaged product sold in India must follow the Legal Metrology Packaged Commodities Rules 2011. MRP with taxes included. Manufacturer details. Net quantity. Month and year of manufacture. Yet non-compliant labels reach shelves every day, and checking them manually is slow, inconsistent, and does not scale. This is LMCC, an AI-assisted compliance checker that verifies a label in under a minute.
```

**ACTIONS:**

1. Show title card / slide, then 3 real packaged products (milk, biscuits, salt)
2. Cut to the app's dashboard at the last sentence

**FOOTAGE NOTE:** product photos can be static B-roll; this is the only scene
without screen capture.

---

## Scene 2 — Roles + Security Model (0:25–1:00)

**VOICEOVER:**

```
LMCC is multi-user with role-based access. Sellers upload and audit their products. Compliance Officers review flagged ones. Passwords are never sent or stored in plaintext. Only a salted, stretched verifier crosses the network. Accounts work from any device, protected by authenticator app two-factor authentication with single-use backup codes.
```

**ACTIONS:**

1. Login panel → click the **Sign Up** tab
2. Point the mouse at the **Seller** / **Compliance Officer** role selector
3. Click **Forgot password?** — show security questions for ~3 seconds, back out
4. Settings → Account → **Account Security**: show the 2FA QR section and
   backup codes (already configured — do NOT record typing any password)

**FOOTAGE NOTE:** be logged in before recording starts. If the tool splits by
clicks (Guidde), each click above becomes one auto-generated step.

---

## Scene 3 — The Core Demo: Hybrid OCR Scan (1:00–2:10) ⭐

**VOICEOVER:**

```
Here is the core. Upload a label and LMCC runs a hybrid pipeline. Fast on-device OCR extracts what it can, then a vision model fills in the low confidence fields. One model is pre-configured server-side, so this works out of the box, and teams can still bring their own API keys for any other model. Watch the console. Every step is visible and auditable. And every extracted field shows its confidence and the AI's reasoning, not just a bare value.
```

**ACTIONS:**

1. Scan Product → **Upload Mode**
2. Point at the OCR mode selector — **Hybrid is preselected by default**;
   hover the "Built-in default active" note
3. Upload the compliant label image
4. **Do not scroll away** — let the console lines appear live:
   "Hybrid mode: local extraction first…" → "Local OCR: detecting regions…" →
   "Extraction method resolved: hybrid"
5. Result appears: fields with confidence scores and per-field reasoning —
   slowly move the mouse down the field list

**FOOTAGE NOTE:** the vision call takes 30–60s. If the tool auto-trims silence,
narrate over the wait ("while this runs…") or split this scene into two steps:
(3a) upload + console starts, (3b) result reveal. Keep at least 5 seconds of
real-time console visible.

---

## Scene 4 — Trust Engineering: Network Tab + Verdict (2:10–2:55)

**VOICEOVER:**

```
Everything is inspectable. The network tab shows the label going to our own API. The built-in model's key never leaves the server, and no password ever appears in plaintext. The result is a full compliance report citing the exact rules violated, exportable as a PDF stamped with the auditor's employee ID.
```

**ACTIONS:**

1. Open DevTools → Network tab, filter `vision-fallback`
2. Run a second scan; click the request and show the payload —
   **no API key and no password anywhere in the request**
3. Close DevTools. Scroll the Compliance Report: violation cards with rule
   citations (e.g. Rule 6 — MRP inclusive of taxes), severity badges, verdict
4. Click **Export PDF** — show the report with the employee ID

---

## Scene 5 — Cross-device Dashboard + Review Workflow (2:55–3:30)

**VOICEOVER:**

```
Scans sync to the account, so the same history appears on any device. OCR is never silently trusted. A Compliance Officer can correct a misread field, and the compliance verdict recomputes instantly.
```

**ACTIONS:**

1. Dashboard: totals, compliance rate, violation-type chart (2s pan)
2. Scan History → open the earlier **violating** label
3. Click **Edit** on a scanned product, correct one misread field, save —
   the verdict flips
4. (Optional, two devices side by side) log in on the second device — same
   account, same history, proving sync

---

## Scene 6 — Close + Stack (3:30–3:50)

**VOICEOVER:**

```
LMCC. On-device-first OCR. One zero-config AI model, with bring your own key for everything else. Role-based review workflow. Full audit trail. Built with Next.js, Supabase, and Tesseract.js, deployable on a free tier. Compliance checking that used to take an expert an hour now takes anyone under a minute.
```

**ACTIONS:**

1. End card: repo URL `github.com/abhinavdatta` + live site URL
2. Hold 3 seconds

---

## Pre-recording checklist (day of recording)

- [ ] Fresh Chrome profile, 100% zoom, dark mode ON, bookmarks bar hidden
- [ ] Server running (`npm run dev` → `http://localhost:3000`), already logged in
- [ ] Two label images on desktop: one compliant, one violating
- [ ] Notifications off; mic level checked (record 10s and listen)
- [ ] DevTools closed (open only in Scene 4)

## Recording / editing tips

- **Never show** real API keys, `.env` files, or the Supabase dashboard.
- **Console realism:** during Scene 3 keep ≥5s of uncut, real-time console
  lines — that moment builds trust; don't let auto-editing trim it away.
- **Cursor discipline:** move deliberately, highlight with the tool's zoom on
  the mode selector and console output.
- **Have a spare take:** record both labels' scans once beforehand so a failed
  live AI call can be spliced.
- **Captions:** enable burned-in subtitles (accessibility is scored too).

## Shot list summary

| # | Scene | Duration | Source |
|---|-------|----------|--------|
| 1 | Hook + problem | 25s | slide + product photos |
| 2 | Roles + security | 35s | screen: login, settings |
| 3 | Hybrid scan ⭐ | 70s | screen: scan + console |
| 4 | Network tab + report | 45s | screen: devtools + PDF |
| 5 | Dashboard + edit + sync | 35s | screen: dashboard, history |
| 6 | Close + stack | 20s | slide |

Total ≈ 3:50.
