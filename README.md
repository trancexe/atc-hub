# ATC Hub — Soekarno-Hatta (WIII / CGK) Radar Simulator & ATC Training Platform

**ATC Hub** adalah platform simulasi dan pelatihan Air Traffic Control (ATC) interaktif berbasis web yang memadukan radar multi-display modern (Ground ASDE & TMA 100 NM), navigasi darat presisi berbasis OpenStreetMap (OSM Dijkstra), transmisi suara VHF interaktif dua arah (Push-to-Talk speech recognition via Faster-Whisper dan pilot readback via Microsoft Edge-TTS), serta mesin fisika aerodinamis realistis.

---

## 🛫 Fitur Utama

### 1. Dual Radar Display (Ground ASDE & TMA 100 NM)
* **Ground Radar (ASDE - Airport Surface Detection Equipment):**
  * Tampilan overview default `0.35x` yang merangkum seluruh area bandara Soekarno-Hatta (WIII): 3 landasan pacu aktif (`25R/07L`, `25L/07R`, `24/06`), Terminal 1/2/3, kargo, apron, dan marka taxiway.
  * Papan nama taxiway berstandar ICAO (papan hitam dengan border dan teks kuning tebal) beserta tombol toggle declutter `TWY: ON / OFF`.
  * Presisi jet bridge Gate Stand E1 dan 66 *pushback release points* resmi.
* **TMA Radar (Approach / Departure Radar):**
  * Skala overview default `0.016x` mencakup jangkauan **100 NM** dengan *range rings* konsentris (15, 30, 45, 60, 80, 100 NM).
  * Menampilkan seluruh rute Standard Instrument Departure (SID), Standard Terminal Arrival Route (STAR), Coordination Points (COP), serta koridor ATS Airways.
* **Camera Easing & Touchpad-Friendly UX:**
  * Pergantian fokus pesawat melalui flight strip atau tombol `TAB` menggunakan interpolasi kamera halus (*easeOutCubic* 400 ms) tanpa mengubah skala zoom pengguna.

### 2. Ikon Pesawat Aerodinamis & Skala Fisik Riil
Menggantikan marker dot bulat konvensional dengan siluet pesawat aerodinamis berskala fisik nyata (panjang bodi & bentang sayap proporsional):
* **B738 (Boeing 737-800):** $39.5\text{ m} \times 35.8\text{ m}$ (Medium Wake)
* **A320 (Airbus A320):** $37.6\text{ m} \times 35.8\text{ m}$ (Medium Wake)
* **A333 (Airbus A330-300):** $63.7\text{ m} \times 60.3\text{ m}$ (Heavy Wake)
* **B777 (Boeing 777-300ER):** $73.9\text{ m} \times 64.8\text{ m}$ (Heavy Wake)
* **B747 (Boeing 747-400 / 747-8):** $70.7 - 76.3\text{ m} \times 64.4 - 68.4\text{ m}$ (Heavy / Super Wake)
* Dilengkapi cincin rotasi taktis saat terpilih (*selected*) dan vektor haluan kecepatan (*velocity leader line*).

### 3. Ground Collision Avoidance System & Junction Interlocking (ICAO Doc 9476)
* **Dynamic Wingspan Envelope:** Ambang batas jarak aman berbasis bentang sayap fisik pesawat (Code E widebody: B777, A330, B747 bentang sayap ~65 m) dengan safety buffer minimal $\ge 120\text{ m}$.
* **Junction Interlocking Buffer:** Pesawat yang mendekati perjumpaan taxiway wajib *Hold Short* $90\text{ m}$ sebelum simpul jika persimpangan sedang dilewati atau didekati pesawat lain.
* **Deadlock Elimination & Right-of-Way:** Pesawat yang lebih dekat ke persimpangan atau sudah berada di dalam simpul mendapat hak jalan utama, mencegah situasi saling kunci di persimpangan kritis (seperti `NCY` / `NP1`).
* **Automatic Hold & Resume:** Pengereman darat otomatis (`groundSpeed = 0`) dengan indikator status merah `HOLD (TRAFFIC AHEAD)` hingga jalur steril.

### 4. Navigasi Darat Presisi Jeppesen 10-6, One-Way Corridors & Penataan Gate Maskapai
* **One-Way Corridors & Standard Taxi Routes:**
  * **Koridor Luar (NP - North Parallel):** Alur taksi satu arah keberangkatan (*outbound*) menuju Runway.
  * **Koridor Dalam (NC - North Central):** Alur taksi satu arah kedatangan (*inbound*) menuju Gate Terminal.
  * **Crossover West (WC1 & WC2):** Menghubungkan Terminal 1 ke Terminal 2/3 (WC1: arah selatan-utara, WC2: arah utara-selatan).
* **Auto-Suggest Taxiway Presisi & Easy Mode Prompter:**
  * ATC dipandu prompter dengan rute taksi resmi dalam ejaan fonetik ICAO, misalnya: `GIA880 taxi holding point runway 25R via November Charlie three, November Papa two, November two`.
  * Pesawat mendarat dipandu keluar melalui Rapid Exit resmi (**N4–N7** di 25R, **S4–S7** di 25L, **N2–N3** di 07L).
* **Penugasan Gate Realistis Berdasarkan Maskapai (T1, T2, T3):**
  * **Terminal 3 (Pier International 1–10):** Khusus widebody internasional (Garuda International `GIA880/888`, Singapore Airlines `SIA958`, Cargolux, dsb.).
  * **Terminal 3 (Pier Domestic 11–28):** Garuda Indonesia rute domestik.
  * **Terminal 2 (2D, 2E, 2F):** Batik Air (2D/2E), AirAsia & Scoot (2F LCC).
  * **Terminal 1 (1A, 1B, 1C):** Lion Air & Super Air Jet (1A/1B), Citilink (1C).
* **Mandatory Runway Crossing Protocol:** Rute taxi yang memotong landasan pacu aktif secara otomatis berhenti di stop bar Taxiway (`HOLD_SHORT_CROSS`). Pilot melapor di stop bar dan membutuhkan instruksi resmi ATC (*"Cross runway [rwy] at [taxiway], report vacated"*) sebelum melintas.

### 5. Aerodynamic SID & STAR Departure/Arrival Physics (Real-Time 1:1)
* **Real-Time 1:1 Physics Engine:** Kecepatan navigasi dan separasi dihitung murni $1:1$ sesuai kondisi nyata di dunia penerbangan (waktu tempuh approach ~3.8 menit dari BUNTO ke ILS 25R pada 210–180 kts).
* **Dead-Reckoning Tactical Vectoring:** Saat radar vectoring diaktifkan, pesawat melepaskan keterikatan interpolasi waypoint dan beralih ke navigasi dead-reckoning murni berdasarkan sudut haluan (*heading*) dan kecepatan (*groundspeed*).
* **Dynamic Departure Alignment:** Tracking sumbu landasan otomatis (*centerline snap*) saat takeoff roll dan perhitungan sudut heading dinamis pada fase climbing SID, mencegah deviasi orientasi ikon pesawat.
* **Eliminasi Belokan Patah 90°:**
  * *Departure (SID):* Pesawat melaju lurus di sumbu perpanjangan landasan pacu (*runway track initial climb*) sejauh ~2,1 NM (3 km) hingga ketinggian aman ~2.200 kaki, disusul kurva busur belok kubik Bézier (*standard rate turn arc*, ~3°/detik) dengan rotasi haluan bertahap menuju fix pertama.
  * *Arrival (STAR):* Transisi halus dari ujung STAR menyusuri kurva tangen busur Bézier yang mengintersep localizer ILS pada sudut ~30° menuju Final Approach Fix (FAF, 5 NM, 2.500 kaki), diikuti luncuran glideslope 3° kontinu.
* **Landing Rollout Realistis:** Touchdown pada kecepatan 135 knot dengan momentum nyata, meluncur di atas garis sumbu tengah landasan sambil mengerem gradual hingga 60 knot sebelum belok ke *rapid exit*.

### 6. Voice Recognition & Pilot Audio Feedback
* **Push-to-Talk (PTT) Speech Recognition:** Mendukung tombol spasi (*Spacebar*), tombol mouse, dan sentuh layar (*touch*) dengan intent matching perintah ATC ICAO.
* **Dynamic Callsign Voice Routing:** Pengenalan suara cerdas membedakan perintah berdasarkan callsign yang diucapkan (*"Indonesia 502"*, *"Supergreen 123"*), tanpa mengharuskan controller memilih kartu flight strip secara manual.
* **VHF Pilot Audio Pipeline:** Readback pilot realistis menggunakan Edge-TTS (`en-US-GuyNeural`) dengan filter bandpass radio VHF, suara chirp radio klik, dan ekspansi fonetik digit tunggal resmi ICAO (*"five zero two"* alih-alih *"five o two"*).

---

## 🗺️ Prosedur Resmi AIP WIII yang Tersedia

### Konfigurasi Runway (6 Arah)
1. **Runway 25R:** Operasi Barat (Heading 250°), Stop bar `HOLD N2 (25R)`
2. **Runway 07L:** Operasi Timur (Heading 070°), Stop bar `HOLD N8 (07L)`
3. **Runway 25L:** Operasi Barat Selatan (Heading 250°), Stop bar `HOLD S3 (25L)`
4. **Runway 07R:** Operasi Timur Selatan (Heading 070°), Stop bar `HOLD S7 (07R)`
5. **Runway 24:** Runway 3 Barat Daya (Heading 247°), Stop bar Perimeter Barat
6. **Runway 06:** Runway 3 Timur Laut (Heading 067°), Stop bar `HOLD M7 (06)`

### Prosedur Standard Instrument Departure (SID) — Jeppesen 10-3 Series
* **Runway 25R:** `DOLTA 2A` (via BIMUL ➔ NIPIP ➔ DOLTA climb FL140), `BUNIK 2H` (via BUNIK), `AKSOX 2A` (via CA ➔ AKSOX)
* **Runway 25L:** `DOLTA 2B` (via BIMUL ➔ NIPIP ➔ DOLTA climb FL140), `BUNIK 2H`, `AKSOX 2A`
* **Runway 07L:** `DOLTA 2C` (via DOLTA)
* **Runway 07R:** `DOLTA 2D` (via DOLTA)
* **Runway 24:** `BUNIK 2M` (via BUNIK)
* **Runway 06:** `AKSOX 2L` (via AKSOX)

### Prosedur Standard Terminal Arrival Route (STAR) — Jeppesen 10-2 Series (RNAV 1)
* **Runway 25L:** `LADIR 1C` (via LADIR ➔ IAF UBNUX ➔ IF OBGEG), `TOPAR 1C` (via TOPAR ➔ UBNUX ➔ OBGEG), `AKSOX 2G` (via AKSOX ➔ UBNUX ➔ OBGEG)
* **Runway 25R:** `DOLTA 1A` (via DOLTA ➔ IAF TIKAM ➔ IF LUVAX), `BUNTO 1A` (via BUNTO ➔ TIKAM ➔ LUVAX)
* **Runway 07L & 07R:** `LADIR 1B` (via LADIR ➔ RAKIT)
* **Runway 24 & 06:** `LADIR 1A`, `AKSOX 2L`

---

## 🛠️ Arsitektur & Teknologi

* **Frontend:** Arsitektur Modular ES6+ di `static/js/` (`state.js`, `audio.js`, `radar.js`, `strips.js`, `physics_ground.js`, `safety.js`, `tactical.js`, `weather.js`, `physics_air.js`, `controller.js`) dengan pipeline bundler `build.sh` ke `static/app.js`, HTML5 Canvas 2D, Tailwind CSS, FontAwesome.
* **Backend:** FastAPI, Python 3.13, Uvicorn, Faster-Whisper, Edge-TTS.
* **Aeronautical Data & Navigation Graph:** `wiii_data.json` memuat graf Dijkstra taxiway 2.642 node, 66 gate resmi (T1, T2, T3), runway mechanisms, holding points, rute SID/STAR, dan koordinat AIP Indonesia.
* **Service Ports:**
  * HTTP Radar Interface: Port `8010`
  * HTTPS SSL Radar Interface: Port `8011`
  * Service Hub Integration: Port `9999`

---

## 🚀 Menjalankan Simulator

### A. Windows (1-Click Run untuk Pengguna Awam):
1. **Cara Termudah (Script Otomatis):**
   * Download repository (ZIP) lalu ekstrak.
   * Klik ganda pada berkas **`start_windows.bat`**.
   * Script akan otomatis menginisialisasi Python venv, mengunduh pustaka yang diperlukan, menjalankan server lokal, dan langsung membuka browser ke `http://localhost:8010`.
2. **Standalone Executable (.exe):**
   * Di-build otomatis via GitHub Actions (`.github/workflows/build-windows.yml`) menjadi `atc-hub-windows-x64.zip`.
   * Ekstrak dan jalankan `atc-hub.exe` tanpa perlu install Python maupun Git.

### B. Linux / Server (Systemd User Services):
```bash
# Restart HTTP Service
systemctl --user restart atc-hub

# Restart SSL Service
systemctl --user restart atc-hub-ssl

# Cek Status
systemctl --user status atc-hub
```

### Akses Web Browser & Live Deployment:
* **Live Web (Public Domain):** [https://clearedtoland.my.id](https://clearedtoland.my.id)
* **Local Run:** `http://localhost:8010` (HTTP) / `https://localhost:8011` (HTTPS)
*(Gunakan shortcut `Ctrl + Shift + R` / `Ctrl + F5` untuk memastikan aset JavaScript terbaru termuat).*

---

## 📜 Lisensi & Atribusi
* Dikembangkan oleh **trancexe** untuk simulasi dan platform edukasi ATC Bandara Internasional Soekarno-Hatta (WIII).
* Data geospasial taxiway dan runway bersumber dari kontributor OpenStreetMap (ODbL).
