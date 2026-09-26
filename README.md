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

### 4. Navigasi Darat Presisi OSM & Runway Crossing Protocol
* **Dijkstra Taxiway Routing:** Jalur taxiway dihitung menggunakan 2.642 simpul graf OpenStreetMap nyata dari stand parkir menuju seluruh 6 holding point runway.
* **Mandatory Runway Crossing Protocol:** Rute taxi apron utara menuju Runway Selatan (25L/07R) secara otomatis berhenti di stop bar Taxiway NP1 (`HOLD_SHORT_CROSS`). Pilot melapor di stop bar dan membutuhkan instruksi resmi ATC (*"Cross runway [rwy] at [taxiway], report vacated"*) sebelum melintas.
* **Full Taxi-In Cycle:** Pesawat mendarat meluncur menyusuri *rapid exit taxiway* (N4) dan taxi masuk ke stand Gate E1 hingga mesin dimatikan (`PARKED`).

### 5. Aerodynamic SID & STAR Departure/Arrival Physics
* **Eliminasi Belokan Patah 90°:**
  * *Departure (SID):* Pesawat melaju lurus di sumbu perpanjangan landasan pacu (*runway track initial climb*) sejauh ~2,1 NM (3 km) hingga ketinggian aman ~2.200 kaki, disusul kurva busur belok kubik Bézier (*standard rate turn arc*, ~3°/detik) dengan rotasi haluan bertahap menuju fix pertama.
  * *Arrival (STAR):* Transisi halus dari ujung STAR menyusuri kurva tangen busur Bézier yang mengintersep localizer ILS pada sudut ~30° menuju Final Approach Fix (FAF, 5 NM, 2.500 kaki), diikuti luncuran glideslope 3° kontinu.
* **Landing Rollout Realistis:** Touchdown pada kecepatan 135 knot dengan momentum nyata, meluncur di atas garis sumbu tengah landasan sambil mengerem gradual hingga 60 knot sebelum belok ke *rapid exit*.
* **Mesin Fisika Speed-Distance Geodesik:** Durasi pergerakan tiap simpul dihitung murni menggunakan jarak geodesik Haversine Nautical Miles terhadap kecepatan rata-rata ($4\times$ simulation multiplier), memastikan tempo jelajah dan belokan seimbang.

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

* **Frontend:** Vanilla JavaScript (ES6+), HTML5 Canvas 2D, Tailwind CSS, FontAwesome.
* **Backend:** FastAPI, Python 3.13, Uvicorn, Faster-Whisper, Edge-TTS.
* **Aeronautical Data:** `wiii_data.json` diekstraksi dari OpenStreetMap XML (`wiii_osm.xml`) dan publikasi AIP Indonesia.
* **Service Ports:**
  * HTTP Radar Interface: Port `8010`
  * HTTPS SSL Radar Interface: Port `8011`
  * Service Hub Integration: Port `9999`

---

## 🚀 Menjalankan Simulator

### Menjalankan via Systemd User Services:
```bash
# Restart HTTP Service
systemctl --user restart atc-hub

# Restart SSL Service
systemctl --user restart atc-hub-ssl

# Cek Status
systemctl --user status atc-hub
```

### Akses Web Browser:
* **HTTP:** `http://100.75.217.97:8010`
* **HTTPS:** `https://100.75.217.97:8011`
*(Gunakan shortcut `Ctrl + Shift + R` untuk memastikan aset JavaScript terbaru termuat).*

---

## 📜 Lisensi & Atribusi
* Dikembangkan oleh **trancexe** untuk simulasi dan platform edukasi ATC Bandara Internasional Soekarno-Hatta (WIII).
* Data geospasial taxiway dan runway bersumber dari kontributor OpenStreetMap (ODbL).
