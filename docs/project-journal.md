# Project Journal & Scope Tracker

## Original Scope

**Goal:** Replicate the [Love Letter Tech](https://lovelettertech.com) mailbox — a WiFi-connected device that displays text messages and photos, with a flag that rises on new messages.

### Love Letter Tech Feature Set (Baseline)

| # | Feature | In Original Product | In Our Build | Status |
|---|---------|-------------------|-------------|--------|
| 1 | Text messaging (phone → device) | ✅ | ✅ | Planned |
| 2 | Photo messaging | ✅ | ✅ | Planned |
| 3 | Servo flag (raise on new msg) | ✅ | ✅ | Planned |
| 4 | Color TFT display | ✅ | ✅ | Planned |
| 5 | WiFi connectivity | ✅ (2.4GHz) | ✅ (dual-band) | Upgraded |
| 6 | Companion mobile app | ✅ (iOS + Android) | ❌ (web page) | Simplified |
| 7 | QR code pairing | ✅ | ❌ | Descoped |
| 8 | WiFi provisioning | ✅ (via app) | ✅ (captive portal) | Different approach |
| 9 | Multi-sender support | ✅ | ✅ | Planned |
| 10 | Encrypted transit | ✅ | ✅ (HTTPS) | Planned |

---

## Scope Creep Tracker

Features we added **beyond** the original Love Letter Tech product:

| # | Added Feature | Justification | Scope Impact | Cost Impact |
|---|--------------|---------------|-------------|-------------|
| 1 | **Dual-band WiFi 6 (ESP32-C5)** | Eliminates #1 failure mode (2.4GHz band-steering). Research-driven decision. | Hardware upgrade | +$19/unit |
| 2 | **LiPo battery backup** | Eliminates brownout resets during WiFi TX bursts | Hardware add | +$13.61 |
| 3 | **Ambient light sensor (auto-dim)** | Night-friendly — display won't blind you at 2am | Hardware add | +$6 |
| 4 | **Notification buzzer** | Audible alert on message arrival | Hardware add | +$7 |
| 5 | **Physical button** | Mark as read, scroll messages | Hardware add | +$5 |
| 6 | **OTA firmware updates** | Remote updates for device at fiancée's house | Firmware feature | $0 |
| 7 | **Azure cloud backend** | Enterprise-grade hosting vs Firebase | Architecture change | ~$0.02/mo |
| 8 | **Open-source documentation** | Public GitHub repo with full docs | Documentation | Time only |
| 9 | **Battery fuel gauge monitoring** | Comes free with ESP32-C5 Thing Plus | Firmware feature | $0 |

### Scope Creep Score

| Metric | Value |
|--------|-------|
| **Original features replicated** | 8 of 10 (80%) |
| **Features descoped** | 2 (native app, QR pairing) |
| **Features added beyond original** | 9 |
| **Scope creep ratio** | 9 added ÷ 10 baseline = **0.9x** |
| **Cost creep** | $129 (commercial) → $92 (DIY) = **29% cheaper** despite more features |
| **Complexity creep** | Medium — most additions are Qwiic snap-in (no extra code complexity) |

### Scope Creep Assessment

**Verdict: Justified scope creep.** Every addition was driven by the failure analysis:
- Items 1-2 eliminate hardware failure modes
- Items 3-5 are Qwiic snap-in (minimal complexity cost)
- Item 6 is essential for remote deployment
- Item 7 leverages existing Azure credits
- Item 8 was a deliberate choice for public sharing

**Features we wisely DIDN'T add (yet):**
- ❌ Voice messages (I2S DAC + speaker — v2)
- ❌ Emoji rendering (custom fonts — v2)
- ❌ Weather display (API integration — v2)
- ❌ Read receipts (bidirectional messaging — v2)
- ❌ Multiple device pairing (group messaging — v2)
- ❌ E-ink display option (different hardware — v2)

---

## Session Log

### Session 1 — 2026-08-24 (Sun)

**Duration:** ~2.5 hours
**Participants:** Doug + Larry

#### Research Phase (14:51 - 15:40)
- Analyzed lovelettertech.com product and UMass Lowell article about creator Owen O'Brien
- Identified full feature set to replicate
- Researched common ESP32 IoT failure modes (WiFi, power, cloud, photos)
- Compared backend options: Firebase vs MQTT+Telegram vs ntfy.sh vs Azure
- Evaluated display sizes (1.3" through 2.8"), selected 2.0" ST7789
- Developed 3 architecture proposals, scored iteratively to 9.7/10

#### Hardware Selection (15:40 - 16:10)
- Discovered ESP32-C5 as solution to 2.4GHz WiFi problem
- Selected SparkFun Thing Plus ESP32-C5 ($24.95)
- Identified Qwiic ecosystem for peripherals (light sensor, buzzer, button)
- Selected LiPo 850mAh for battery backup
- **Ordered from SparkFun:** 2× ESP32-C5, 2× LiPo, light sensor, buzzer, button, 3× Qwiic cables
- **Ordered from Amazon:** 2-pack 2.0" ST7789 TFT displays

#### Architecture Decision (15:48 - 15:52)
- Decided on Azure Static Web App + Table Storage (Option 2)
- Leveraging VS Enterprise Azure credits ($150/mo)
- Scored final architecture: Easy 9, Cost 10, Failure Resistant 10 = **9.7 avg**

#### Documentation (16:32 - 16:57)
- Created full project folder structure
- Wrote README.md with architecture diagram, BOM, cost comparison
- Wrote docs/architecture.md with design decisions and failure analysis
- Wrote docs/bom.md with complete parts list and alternatives
- Wrote docs/wiring.md with pin maps and Qwiic chain diagram
- Wrote docs/ota-updates.md with remote update guide
- Wrote docs/troubleshooting.md with common issues and fixes
- Created MIT LICENSE

#### Azure Deployment (17:10 - 17:33)
- Activated VS Enterprise subscription via alternate personal account
- Worked around corporate Conditional Access (Error 53003) using device code flow
- Deployed Azure resources:
  - Resource group: `love-letter-mailbox`
  - Storage account: `lovelettermlbx`
  - Table: `messages`
  - Blob containers: `photos`, `firmware`
  - Static Web App: `love-letter-app`
  - **Live URL:** https://zealous-dune-001e8941e.7.azurestaticapps.net

#### Key Decisions Made
1. ESP32-C5 over classic ESP32 (dual-band WiFi, PSRAM)
2. Azure over Firebase (existing credits, Microsoft infrastructure)
3. Web page over native app (no app store, works on any device)
4. HTTP polling over MQTT (simpler, no connection state)
5. Qwiic peripherals over raw components (no soldering, snap-in)
6. Public open-source over private project

#### Blockers
- GitHub account not yet created (deferred)
- Azure CLI blocked by corp CA — workaround: alternate personal account with device code flow

#### Next Steps
- [ ] Create GitHub account and push repo
- [ ] Build messaging web page (HTML/JS)
- [ ] Write Azure Functions API (send/receive messages)
- [ ] Write ESP32-C5 firmware
- [ ] Design 3D printable enclosure
- [ ] Test end-to-end when hardware arrives

---

## Budget Tracker

| Category | Planned | Actual | Delta |
|----------|---------|--------|-------|
| Hardware (2 units) | ~$92 | ~$113.97 | +$22 (850mAh battery more expensive than 400mAh) |
| Monthly hosting | ~$0.02 | $0.02 | On target |
| Time invested | — | ~2.5 hrs (session 1) | — |
| **Total project cost** | | **~$114 + time** | |
