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

### 3. Ground Collision Avoidance System
* **Safety Cushion Detection:** Setiap pesawat memindai lintasan di depannya dalam radius aman 70 meter (rentang bentang sayap) dan 50 meter terhadap target node.
* **Forward Bearing Check:** Analisis vektor *dot product* arah haluan memastikan pesawat hanya mengerem bila terdapat rintangan di depan jalurnya (*traffic ahead*).
* **Automatic Hold & Resume:** Pengereman darat otomatis (`groundSpeed = 0`) dengan indikator peringatan merah `HOLD (TRAFFIC AHEAD)` hingga jalur steril.

### 4. Navigasi Darat Presisi OSM, Dynamic Multi-Terminal Routing & Runway Crossing
* **Dijkstra Taxiway Routing (2.642 Nodes OSM):** Jalur taxiway dihitung secara real-time menggunakan graf OpenStreetMap presisi bandara Soekarno-Hatta (North/South Taxiway, cross corridors, apron taxilanes).
* **Multi-Terminal & 66 Gate Network (T1, T2, T3):**
  * **Terminal 1 (21 Stand):** Concourse A, B, C (alokasi maskapai Lion Air, Super Air Jet).
  * **Terminal 2 (21 Stand):** Concourse D, E, F (alokasi maskapai Batik Air, AirAsia, Umrah/Regional).
  * **Terminal 3 (24 Stand):** Pier 1 & 2 (alokasi Garuda Indonesia, SkyTeam, penerbangan internasional & kargo).
  * Pemilihan stand otomatis berbasis maskapai riil dan dapat disesuaikan manual via Electronic Flight Strip.
* **Mandatory Runway Crossing Protocol:** Rute taxi apron utara menuju Runway Selatan (25L/07R) secara otomatis berhenti di stop bar Taxiway NP1 (`HOLD_SHORT_CROSS`). Pilot melapor di stop bar dan membutuhkan instruksi resmi ATC (*"Cross runway [rwy] at [taxiway], report vacated"*) sebelum melintas.
* **Full Taxi-In Cycle:** Pesawat mendarat meluncur menyusuri *rapid exit taxiway* (N4, S4, dsb.) dan taxi masuk ke stand gate tujuan yang ditugaskan hingga mesin dimatikan (`PARKED`).

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

### Prosedur Standard Instrument Departure (SID)
* **Runway 25R & 25L:** `DOLTA 1C` (via IMUBA), `BUNTO 1C` (via CA), `KRAKE 1C` (via TOPIN)
* **Runway 07L & 07R:** `DOLTA 1D` (via ESLAM), `BUNTO 1D` (via TEGID), `KRAKE 1D` (via CA ➔ TOPIN)
* **Runway 24:** `KRAKE 2A` (via TOPIN), `DOLTA 2A` (via IMUBA)
* **Runway 06:** `BUNTO 2A` (via CA), `DOLTA 2B` (via ESLAM)

### Prosedur Standard Terminal Arrival Route (STAR)
* **Runway 25R & 25L:** `DOLTA 1A` (via BUNTO ➔ TEGID), `BUNTO 1A` (via TEGID), `KRAKE 1A` (via TOPIN ➔ CA)
* **Runway 07L & 07R:** `DOLTA 1B` (via ESLAM ➔ IMUBA), `KRAKE 1B` (via TOPIN ➔ IMUBA), `BUNTO 1B` (via CA ➔ IMUBA)
* **Runway 24 & 06:** `DOLTA 2C`, `KRAKE 2C`

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

### Akses Web Browser:
* **HTTP:** `http://<server-ip>:8010`
* **HTTPS:** `https://<server-ip>:8011`
*(Gunakan shortcut `Ctrl + Shift + R` untuk memastikan aset JavaScript terbaru termuat).*

---

## 📜 Lisensi & Atribusi
* Dikembangkan oleh **trancexe** untuk simulasi dan platform edukasi ATC Bandara Internasional Soekarno-Hatta (WIII).
* Data geospasial taxiway dan runway bersumber dari kontributor OpenStreetMap (ODbL).
