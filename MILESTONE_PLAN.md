# ATC Hub — Milestone Roadmap
### Soekarno-Hatta (WIII/CGK) ATC Simulator & Training Platform
**Visi:** Simulator ATC berbasis web paling komprehensif untuk Bandara Soekarno-Hatta — alat pelatihan bagi pemula dan arena simulasi realistis bagi veteran controller.

---

## Status Milestone

| # | Milestone | Status |
|---|-----------|--------|
| 1 | Radar Separation & Safety Alerts | ✅ Selesai |
| 2 | Electronic Flight Strip & FDE Scratchpad | ✅ Selesai |
| 3 | Multi-Sektor, Frekuensi VHF & AI Spectator | ✅ Selesai |
| 4 | Cuaca Dinamis, ATIS & Konfigurasi Runway | 🔜 Berikutnya |
| 5 | Perintah Taktis Resolusi Konflik | 📋 Direncanakan |
| 6 | Arrival Sequencer (AMAN) & Holding Pattern | 📋 Direncanakan |
| 7 | Learning Academy & Guided Training | 📋 Direncanakan |
| 8 | Multiplayer, Skenario & Scoring | 📋 Direncanakan |
| 9 | Bandara Tambahan & Ekspor Data | 📋 Direncanakan |
| 10 | Polish, Performa & Deployment Produksi | 📋 Direncanakan |

---

## Milestone 1 — Radar Separation & Safety Alerts ✅

**Tujuan:** Fondasi keselamatan penerbangan berstandar ICAO.

- [x] **Separasi Radar ICAO TMA:** 3 NM lateral / 1.000 ft vertikal.
- [x] **STCA (Short Term Conflict Alert):** Proyeksi vektor 60 detik, visual jalur konflik, tag berkedip, dan peringatan audio sawtooth.
- [x] **MSAW (Minimum Safe Altitude Warning):** Batas 1.800 ft, indikator terrain merah.
- [x] **Visual conflict vectors** dan *conflict bubble* di radar TMA.
- [x] **Dry-run test suite:** `tests/dry_run_milestone1.js` — 4/4 PASS.

**Commit:** `0b25ee2`

---

## Milestone 2 — Electronic Flight Strip & FDE Scratchpad ✅

**Tujuan:** Alat bantu taktis controller untuk melacak instruksi aktif setiap pesawat.

- [x] **Flight Strip Bay Tabs:** `ALL`, `DEP`, `TWR`, `APP` — strip terkelompok otomatis berdasarkan fase penerbangan.
- [x] **FDE Scratchpad:** Input manual CFL (Cleared Flight Level), SPD (Assigned Airspeed), DIR (Direct-To Fix) yang tersinkronisasi ke radar data block.
- [x] **Auto-Sync CFL:** Instruksi ketinggian dari suara, tombol, atau AI otomatis memperbarui kotak CFL strip dan label radar (`A030`, `FL140`, `FL240`, `GND`).
- [x] **Transponder Squawk IDENT:** Bloom visual 18 detik di radar saat aktivasi.
- [x] **Dry-run test suite:** `tests/dry_run_milestone2.js` — 4/4 PASS.

**Commit:** `2a0498a` + `5be37a7`

---

## Milestone 3 — Multi-Sektor, Frekuensi VHF & AI Spectator ✅

**Tujuan:** Operasi multi-posisi realistis dengan pembagian tanggung jawab ATC.

- [x] **3 Frekuensi VHF Resmi:** Ground 121.600 MHz, Tower 118.200 MHz, Approach 119.750 MHz.
- [x] **Controller Role Selection:** `ALL` (manual penuh), `GND`, `TWR`, `APP` (delegasi sektor lain ke AI), `AI SPECTATOR` (full autopilot).
- [x] **AI Co-Controller Loop:** FSM deterministik yang mengoperasikan sektor yang didelegasikan — pushback, taxi, lineup, takeoff, approach, landing, taxi-in — lengkap dengan frasa radio ICAO Doc 9432.
- [x] **Runway Occupancy Safety Barrier:** AI menahan lineup/takeoff jika runway terisi pesawat pada fase FINAL/LANDED.
- [x] **Spawner Inbound Multi-Koridor:** Rotasi DOLTA (Selatan), BUNTO (Timur), GOMBA (Utara) dengan feeder leg 15 NM sebelum fix.
- [x] **Dynamic Forward Waypoint Splicing:** Reroute runway/STAR di udara tanpa memutar balik ke waypoint awal dan tanpa melompat ke rollout.
- [x] **Cross-Sector Reroute Protection:** Perpindahan sektor berlawanan (>18 NM) diarahkan ke entry fix rute baru.
- [x] **Dry-run test suite:** `tests/dry_run_milestone3.js` — 4/4 PASS.

**Commit:** `a52ce0f` → `c357449`

---

## Milestone 4 — Cuaca Dinamis, ATIS & Konfigurasi Runway 🔜

**Tujuan:** Kondisi operasi bandara yang berubah sesuai cuaca dan notifikasi ATIS otomatis.

- [ ] **METAR Parser & Weather Engine:** Dekode data METAR real-time (angin, visibilitas, awan, QNH) atau skenario cuaca preset.
- [ ] **Konfigurasi Runway Berbasis Angin:** Otomatis menyarankan runway aktif berdasarkan komponen headwind/crosswind (threshold 10 kt tailwind).
- [ ] **ATIS Broadcast (128.0 MHz):** Informasi alfa-bravo-charlie yang terus diperbarui dan dibacakan via Edge-TTS pada frekuensi keempat.
- [ ] **Visual Cuaca di Radar:** Overlay hujan (cell hijau/kuning/merah), lapisan awan, dan indikator visibilitas rendah.
- [ ] **Efek Cuaca pada Operasi:** Separasi IFR/VFR yang berubah, CAT III autoland saat low visibility, dan pembatasan runway basah.
- [ ] **QNH Transition Altitude:** Otomatis transisi altimeter antara QNH dan standard pressure (FL) pada 11.000 ft.
- [ ] **Dry-run test suite:** Validasi decode METAR, pemilihan runway, dan perubahan separasi.

---

## Milestone 5 — Perintah Taktis Resolusi Konflik

**Tujuan:** Instruksi ATC aktif untuk mengelola separasi dan sequencing secara manual.

- [ ] **Radar Vectoring:** Instruksi heading eksplisit (*"Turn left heading 180"*, *"Turn right heading 270"*) yang langsung mengubah lintasan pesawat di udara. Vektor taktis divisualisasikan sebagai garis putus-putus di radar.
- [ ] **Immediate Altitude Step:** Instruksi *"Climb/Descend and maintain FL[xxx]"* yang dapat diberikan kapan saja selama fase approach atau departure, mengubah target ketinggian FDE secara real-time.
- [ ] **Speed Control:** Instruksi *"Reduce speed to [xxx] knots"* / *"Maintain [xxx] knots"* / *"No speed restriction"* untuk mengatur jarak antar pesawat berurutan. Perubahan kecepatan tervisual di speed leader line radar.
- [ ] **Go-Around / Missed Approach:** Instruksi pembatalan pendaratan di fase FINAL — pesawat memanjat kembali ke 3.000 ft, melintasi ujung landasan, dan memasuki holding/re-sequence.
- [ ] **Visual Separation Monitoring:** Ruler tool untuk mengukur jarak antar pesawat di radar secara langsung (klik pesawat A ↔ B).
- [ ] **Voice Command Integration:** Semua instruksi taktis dapat diberikan melalui Push-to-Talk speech recognition.
- [ ] **Dry-run test suite:** Validasi perubahan heading, altitude step, speed braking, dan prosedur go-around.

---

## Milestone 6 — Arrival Sequencer (AMAN) & Holding Pattern

**Tujuan:** Manajemen antrean kedatangan otomatis dan mekanisme penundaan terbang.

- [ ] **AMAN (Arrival Manager):** Panel urutan kedatangan yang menghitung Estimated Landing Time (ELDT) setiap pesawat berdasarkan jarak, kecepatan, dan slot runway.
- [ ] **Slot Assignment:** Drag-and-drop untuk mengatur ulang urutan antrean kedatangan.
- [ ] **Spacing Advisor:** Saran kecepatan dan heading untuk menjaga jarak antar pesawat berurutan pada final approach.
- [ ] **Holding Pattern Otomatis:** Jika slot belum tersedia, pesawat masuk ke racetrack holding pattern standar (inbound leg 1 menit, outbound leg 1 menit, standard rate turn) di atas fix yang ditentukan (TEGID, RAKIT, dll).
- [ ] **Holding Stack Management:** Panel visual menampilkan tumpukan ketinggian holding (FL100, FL110, FL120...) dan urutan masuk/keluar.
- [ ] **Hold Exit Clearance:** Instruksi *"Leave holding, resume approach"* secara manual atau otomatis saat slot tersedia.
- [ ] **Fuel & Endurance Timer:** Indikator estimasi fuel remaining di strip — alert jika pesawat mendekat batas bingo fuel saat holding terlalu lama.
- [ ] **Dry-run test suite:** Validasi urutan AMAN, masuk/keluar holding, dan fuel timer.

---

## Milestone 7 — Learning Academy & Guided Training 🎓

**Tujuan:** Modul pelatihan terstruktur agar pemula dapat belajar ATC dari nol hingga mahir.

### 7A — Tutorial Interaktif
- [ ] **Tutorial Mode:** Overlay panduan langkah-demi-langkah dengan sorotan elemen UI, panah instruksi, dan tooltip penjelasan.
- [ ] **Lesson 1 — Pengenalan Radar:** Navigasi peta, zoom/pan, membaca data block pesawat.
- [ ] **Lesson 2 — Komunikasi Radio:** Cara PTT, fraseologi ICAO dasar (*"Push and start approved"*, *"Taxi to holding point"*), alfabet fonetik.
- [ ] **Lesson 3 — Ground Control:** Pushback, taxi routing, runway crossing protocol.
- [ ] **Lesson 4 — Tower Control:** Lineup, takeoff clearance, landing clearance, runway management.
- [ ] **Lesson 5 — Approach Control:** Membaca STAR, memberikan ILS clearance, sequencing inbound.
- [ ] **Lesson 6 — Emergency Handling:** Go-around, holding, konflik separasi.

### 7B — Skenario Latihan Terkurasi
- [ ] **Scenario Editor:** Preset skenario dengan jumlah pesawat, cuaca, dan konfigurasi runway tertentu.
- [ ] **Difficulty Levels:**
  - 🟢 *Cadet* — 1-2 pesawat, cuaca cerah, satu runway, Easy Mode prompter aktif.
  - 🟡 *Controller* — 4-6 pesawat, angin variabel, dual runway ops, tanpa Easy Mode.
  - 🔴 *Supervisor* — 8-12 pesawat, low visibility, configuration change mid-session, emergency.
  - ⚫ *Veteran* — 15+ pesawat, cuaca buruk, runway closure, NORDO/radio failure, realistic workload.
- [ ] **Replay & Debrief:** Rekaman sesi yang dapat diputar ulang dengan timeline, termasuk semua transmisi radio dan pergerakan pesawat.

### 7C — Referensi & Buku Panduan
- [ ] **ATC Phraseology Handbook:** Kamus frasa radio ICAO lengkap dengan contoh audio.
- [ ] **SID/STAR Chart Viewer:** Peta prosedur resmi AIP yang terintegrasi dengan radar overlay.
- [ ] **Keyboard Shortcut Cheat Sheet:** Panel referensi in-game.

---

## Milestone 8 — Multiplayer, Skenario & Scoring 🏆

**Tujuan:** Simulasi kolaboratif dan kompetitif antar pemain.

### 8A — Multiplayer
- [ ] **WebSocket Multi-Session:** Beberapa pemain terhubung ke sesi simulasi yang sama secara real-time.
- [ ] **Role Distribution:** Satu pemain sebagai Ground, satu sebagai Tower, satu sebagai Approach — bekerja bersama mengelola trafik.
- [ ] **Handoff Protocol:** Mekanisme transfer pesawat antar controller (radar handoff tag flash + konfirmasi) sesuai standar MATS.
- [ ] **Chat Radio Lintas Posisi:** Controller dapat berkomunikasi di frekuensi internal coordination (`123.450 MHz`).

### 8B — Scoring & Leaderboard
- [ ] **Performance Metrics:**
  - *Separation violations* (jumlah & durasi).
  - *Average landing interval* (efisiensi throughput).
  - *Radio discipline* (kepatuhan fraseologi ICAO).
  - *Taxi time* (efisiensi ground routing).
  - *Go-around rate* (kemampuan sequencing).
  - *Fuel efficiency* (minimalisasi holding).
- [ ] **Score Card Post-Session:** Ringkasan performa setelah sesi selesai dengan grade (A/B/C/D/F).
- [ ] **Leaderboard:** Papan peringkat lokal dan online.

### 8C — Skenario Kustom
- [ ] **Scenario Creator UI:** Rancang skenario sendiri — tentukan armada, rute, cuaca, kegagalan, event.
- [ ] **Scenario Sharing:** Ekspor/impor skenario antar pemain (JSON).
- [ ] **Challenge Mode:** Skenario teka-teki — *"Selesaikan 10 landing dalam 30 menit dengan 1 runway ditutup."*

---

## Milestone 9 — Bandara Tambahan & Ekspor Data

**Tujuan:** Ekspansi ke bandara Indonesia lainnya dan integrasi data profesional.

- [ ] **Airport Data Pipeline:** Framework generik untuk menambahkan bandara baru dari data OSM + AIP (parser `parse_osm.py` diperluas).
- [ ] **Bandara Prioritas:**
  - 🇮🇩 WARR — Juanda (Surabaya)
  - 🇮🇩 WIII — Soekarno-Hatta (sudah aktif)
  - 🇮🇩 WADD — Ngurah Rai (Bali)
  - 🇮🇩 WIMM — Kualanamu (Medan)
  - 🇮🇩 WALL — Sepinggan (Balikpapan)
- [ ] **Airport Selector UI:** Dropdown pemilihan bandara di halaman utama.
- [ ] **Flight Plan Import:** Baca rute penerbangan dari SimBrief / IVAO / VATSIM (format `.fpl`).
- [ ] **Data Export:** Ekspor log operasi (CSV/JSON) — waktu takeoff, landing, separasi, pelanggaran — untuk analisis pasca-sesi.
- [ ] **API Endpoint:** REST API untuk integrasi dengan platform training eksternal atau LMS.

---

## Milestone 10 — Polish, Performa & Deployment Produksi

**Tujuan:** Kualitas produksi, optimasi, dan kesiapan deployment.

### 10A — UI/UX Polish
- [ ] **Dark/Light Theme Toggle.**
- [ ] **Responsive Layout:** Optimasi untuk tablet dan layar sentuh (12" ke atas).
- [ ] **Accessibility:** Label ARIA, navigasi keyboard penuh, ukuran teks skalabel.
- [ ] **Sound Design:** Ambient ATC tower room (hujan, angin, kebisingan radio latar).
- [ ] **Notification System:** Toast alerts untuk event penting (separation breach, runway incursion, handoff pending).

### 10B — Performa & Optimasi
- [ ] **Canvas Rendering Optimization:** RequestAnimationFrame throttle, offscreen canvas untuk label statis, spatial indexing untuk pesawat.
- [ ] **WebGL Radar Mode (opsional):** GPU-accelerated rendering untuk skenario >20 pesawat.
- [ ] **Audio Pool & Preloading:** Pre-cache TTS audio untuk frasa umum, mengurangi latensi suara.
- [ ] **Memory Management:** Pembersihan otomatis pesawat yang sudah `PARKED` atau `HANDED_OFF` dari array aktif.

### 10C — Deployment & Infrastruktur
- [ ] **Docker Container:** `Dockerfile` + `docker-compose.yml` untuk one-click deployment.
- [ ] **SSL/TLS Auto-Renewal:** Let's Encrypt certbot integration.
- [ ] **User Authentication:** Login sederhana (username/password atau OAuth) untuk menyimpan progress training dan skor.
- [ ] **Progressive Web App (PWA):** Dukungan install di desktop dan mobile.
- [ ] **Monitoring & Logging:** Health check endpoint, error tracking, dan usage analytics.

---

## Prinsip Pengembangan

1. **Standards First:** Seluruh prosedur mengacu pada ICAO Doc 4444 (PANS-ATM), Doc 9432 (Radiotelephony), dan AIP Indonesia.
2. **Physics Over Animation:** Pergerakan pesawat dihitung dari formula geodesik waktu-jarak-kecepatan, bukan animasi arbitrer.
3. **Test Before Ship:** Setiap milestone wajib memiliki dry-run test suite otomatis dengan 100% pass rate.
4. **Security:** Tidak ada IP, token, atau kredensial yang bocor ke commit Git atau output publik.
5. **Incremental Delivery:** Setiap milestone dapat di-deploy dan diuji secara mandiri tanpa membutuhkan milestone berikutnya.

---

*Dokumen ini akan diperbarui seiring pengembangan. Terakhir diperbarui: September 2026.*
