// ATC HUB - Milestone 7: Learning Academy & Guided Interactive Training Engine

const TUTORIAL_LESSONS = [
  {
    id: "lesson-1",
    num: 1,
    title: "Lesson 1: Pengenalan Radar & Layar ATC",
    category: "Radar Basics",
    desc: "Memahami navigasi peta, kontrol zoom & pan, serta membaca data block (callsign, altitude, speed, squawk).",
    steps: [
      {
        targetId: "pane-ground",
        title: "1. Ground Radar (ASDE)",
        text: "Layar kiri menampilkan Surface Movement / Ground Radar Bandara Soekarno-Hatta (WIII). Di sini Anda memantau pergerakan apron, taxiway, dan gate.",
        position: "center"
      },
      {
        targetId: "pane-tma",
        title: "2. Terminal Radar (TMA)",
        text: "Layar kanan menampilkan Terminal Control Area (TMA 50 NM). Menampilkan jalur kedatangan (STAR), keberangkatan (SID), dan holding fix.",
        position: "center"
      },
      {
        targetId: "flight-strips-panel",
        title: "3. Electronic Flight Progress Strips",
        text: "Panel kanan adalah strip penerbangan digital. Menampilkan Callsign, Tipe Pesawat, Squawk Code, Runway tujuan, serta sisa bahan bakar (Endurance). Klik salah satu strip untuk memilih pesawat aktif!",
        position: "left"
      },
      {
        targetId: "btn-toggle-tw-labels",
        title: "4. Navigasi & Label Taxiway",
        text: "Gunakan tombol zoom (+/-) atau mouse wheel untuk zoom in/out. Tombol TWY dapat mengaktifkan atau menyembunyikan nama jalur taxiway.",
        position: "bottom"
      }
    ]
  },
  {
    id: "lesson-2",
    num: 2,
    title: "Lesson 2: Komunikasi Radio & Fraseologi ICAO",
    category: "Radio Phraseology",
    desc: "Mekanisme Push-to-Talk (PTT), alfabet fonetik penerbangan, dan konvensi angka standar ICAO Doc 4444.",
    steps: [
      {
        targetId: "ptt-status",
        title: "1. Mekanisme Push-to-Talk (PTT)",
        text: "Tekan dan tahan tombol SPASI pada keyboard atau klik dan tahan tombol mikrofon hijau untuk memulai transmisi suara.",
        position: "top"
      },
      {
        targetId: "easy-mode-prompter",
        title: "2. Easy Mode Prompter",
        text: "Untuk pemula, Easy Mode Prompter menampilkan frasa ICAO standar yang disarankan sesuai kondisi pesawat. Anda bisa membaca langsung teks tersebut ke mikrofon.",
        position: "top"
      },
      {
        targetId: "whisper-status",
        title: "3. Faster-Whisper AI Recognizer",
        text: "Suara Anda diproses secara on-device oleh model Whisper AI untuk mencocokkan intent kontrol (pushback, taxi, takeoff, approach).",
        position: "bottom"
      },
      {
        targetId: "toggle-logger-btn",
        title: "4. Live Telemetry & Pilot Readback",
        text: "Klik tombol LOGS untuk melihat apa yang didengar Whisper dan mendengarkan respon readback radio pilot VHF via audio sintetis real-time.",
        position: "bottom"
      }
    ]
  },
  {
    id: "lesson-3",
    num: 3,
    title: "Lesson 3: Ground Control — Pushback & Taxi Routing",
    category: "Ground Control",
    desc: "Prosedur pelepasan gate, izin dorong mundur menghadap arah tertentu, dan perutean taxiway menuju holding point.",
    steps: [
      {
        targetId: "bay-filter-dep",
        title: "1. Filter Bay Keberangkatan (DEP)",
        text: "Filter strip ke bay 'DEP' untuk melihat pesawat yang sedang parkir di terminal atau sedang bersiap untuk keberangkatan.",
        position: "bottom"
      },
      {
        targetId: "flight-strips",
        title: "2. Izin Pushback & Engine Start",
        text: "Ucapkan: '[Callsign], push and start approved, facing west'. Pesawat akan mulai didorong mundur dari gate oleh pushback tug.",
        position: "left"
      },
      {
        targetId: "pane-ground",
        title: "3. Taxi Routing & Holding Point",
        text: "Instruksikan taxi: '[Callsign], taxi to holding point runway 25R via NC1'. Pesawat akan mengikuti centerline taxiway menuju ujung landasan.",
        position: "center"
      },
      {
        targetId: "pane-ground",
        title: "4. Runway Crossing Protocol",
        text: "Sebelum menyeberangi runway aktif, pesawat wajib berhenti di holding point hingga ATC memberikan instruksi: 'Cross runway 25R at November Cross'.",
        position: "center"
      }
    ]
  },
  {
    id: "lesson-4",
    num: 4,
    title: "Lesson 4: Tower Control — Lineup & Clearances",
    category: "Tower Control",
    desc: "Manajemen landasan pacu aktif, instruksi masuk landasan (Line up & wait), dan izin lepas landas / mendarat.",
    steps: [
      {
        targetId: "bay-filter-twr",
        title: "1. Tower Strip Bay (TWR)",
        text: "Pesawat di ujung landasan dan di jalur final berada di bawah wewenang Tower Controller.",
        position: "bottom"
      },
      {
        targetId: "flight-strips",
        title: "2. Line Up and Wait",
        text: "Ucapkan: '[Callsign], line up and wait runway 25R'. Pesawat akan memasuki centerline runway dan berhenti bersiap takeoff.",
        position: "left"
      },
      {
        targetId: "metar-bar",
        title: "3. Cuaca & Izin Takeoff",
        text: "Pastikan runway bebas, sebutkan arah dan kecepatan angin: '[Callsign], wind 250 at 8 knots, runway 25R cleared for takeoff'.",
        position: "bottom"
      },
      {
        targetId: "pane-tma",
        title: "4. Cleared to Land & Runway Vacate",
        text: "Untuk pesawat kedatangan di final approach: '[Callsign], runway 25R cleared to land'. Setelah roda menyentuh runway, instruksikan untuk keluar di taxiway terdekat.",
        position: "center"
      }
    ]
  },
  {
    id: "lesson-5",
    num: 5,
    title: "Lesson 5: Approach Control — STAR & ILS Sequencing",
    category: "Approach Control",
    desc: "Navigasi rute kedatangan baku (STAR), otorisasi ILS glide slope, dan pengaturan jarak kedatangan via AMAN.",
    steps: [
      {
        targetId: "bay-filter-app",
        title: "1. Approach Strip Bay (APP)",
        text: "Semua pesawat kedatangan (Arrivals) yang memasuki TMA masuk dalam kategori APP.",
        position: "bottom"
      },
      {
        targetId: "pane-tma",
        title: "2. Standard Terminal Arrival Route (STAR)",
        text: "Pesawat masuk via fix navigasi seperti DOLTA, BUNTO, atau KRAKE sesuai STAR yang tertera pada strip penerbangan.",
        position: "center"
      },
      {
        targetId: "toggle-aman-btn",
        title: "3. Arrival Manager (AMAN)",
        text: "Buka panel AMAN untuk melihat urutan pendaratan berdasarkan Estimated Landing Time (ELDT) dan saran Spacing Advisor (5.0 NM separation).",
        position: "bottom"
      },
      {
        targetId: "prompt-tactical-chips",
        title: "4. ILS Approach Clearance",
        text: "Saat pesawat mengarah ke localizer: '[Callsign], descend to 3000 feet, cleared ILS runway 25R'. Pesawat akan mengunci glide slope dan turun secara otomatis.",
        position: "top"
      }
    ]
  },
  {
    id: "lesson-6",
    num: 6,
    title: "Lesson 6: Emergency & Tactical Separation",
    category: "Emergency & Safety",
    desc: "Prosedur Go-Around (pendaratan batal), instruksi Holding Pattern saat runway padat, dan peringatan STCA / Bingo Fuel.",
    steps: [
      {
        targetId: "prompt-tactical-chips",
        title: "1. Go-Around / Missed Approach",
        text: "Jika runway terhalang pesawat lain saat pesawat sudah dekat: Ucapkan '[Callsign], go around!' Pesawat akan langsung full throttle, mendaki ke 3000 ft dan berputar kembali.",
        position: "top"
      },
      {
        targetId: "toggle-aman-btn",
        title: "2. Holding Pattern & Holding Stack",
        text: "Jika antrean pendaratan padat, masukkan pesawat ke racetrack holding: '[Callsign], hold over TEGID, maintain FL100'. Pesawat akan berputar di fix TEGID.",
        position: "bottom"
      },
      {
        targetId: "flight-strips",
        title: "3. Bingo Fuel Alert & Emergency Priority",
        text: "Pantau indikator bahan bakar (ikon pompa bensin). Jika endurance tersisa < 15 menit, segera keluarkan dari holding ('Leave holding, resume approach') dan prioritaskan pendaratan!",
        position: "left"
      }
    ]
  }
];

let activeTutorialLesson = null;
let currentTutorialStepIndex = 0;
let isTutorialOverlayActive = false;

// Initialize Academy Tutorial View in UI
function initAcademyTutorial() {
  renderTutorialLessonsList();
}

function renderTutorialLessonsList() {
  const container = document.getElementById('academy-tutorial-grid');
  if (!container) return;

  container.innerHTML = TUTORIAL_LESSONS.map(l => {
    return `
      <div class="bg-slate-900 border border-slate-800 hover:border-emerald-700/80 p-4 rounded-xl transition flex flex-col justify-between space-y-3 group shadow-lg">
        <div>
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/80 uppercase">
              ${l.category}
            </span>
            <span class="text-xs font-mono text-slate-500">${l.steps.length} Steps</span>
          </div>
          <h4 class="text-sm font-bold text-white font-radar mt-2 group-hover:text-emerald-400 transition">${l.title}</h4>
          <p class="text-xs text-slate-400 mt-1 leading-relaxed">${l.desc}</p>
        </div>
        <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between">
          <span class="text-[10px] text-slate-500 font-mono"><i class="fa-solid fa-graduation-cap text-emerald-500 mr-1"></i>Guided Demo</span>
          <button onclick="startInteractiveTutorial('${l.id}')" class="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold font-radar flex items-center gap-1.5 shadow transition active:scale-95">
            <i class="fa-solid fa-play text-[10px]"></i> Mulai Panduan
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Start Interactive Tutorial Walkthrough
function startInteractiveTutorial(lessonId) {
  const lesson = TUTORIAL_LESSONS.find(l => l.id === lessonId);
  if (!lesson) return;

  activeTutorialLesson = lesson;
  currentTutorialStepIndex = 0;
  isTutorialOverlayActive = true;

  // Switch to Radar view tab so elements are visible
  if (typeof switchTab === 'function') {
    switchTab('radar');
  }

  showTutorialOverlayStep();
}

function showTutorialOverlayStep() {
  if (!activeTutorialLesson || !isTutorialOverlayActive) return;

  const step = activeTutorialLesson.steps[currentTutorialStepIndex];
  if (!step) {
    endInteractiveTutorial();
    return;
  }

  const overlay = document.getElementById('tutorial-spotlight-overlay');
  const card = document.getElementById('tutorial-guidance-card');
  if (!overlay || !card) return;

  overlay.classList.remove('hidden');

  // Set card contents
  document.getElementById('tutorial-step-indicator').textContent = `Langkah ${currentTutorialStepIndex + 1} dari ${activeTutorialLesson.steps.length}`;
  document.getElementById('tutorial-lesson-title').textContent = activeTutorialLesson.title;
  document.getElementById('tutorial-step-title').textContent = step.title;
  document.getElementById('tutorial-step-desc').textContent = step.text;

  // Position highlighting on target element if found
  const targetEl = document.getElementById(step.targetId);
  const spotlight = document.getElementById('tutorial-spotlight-box');

  if (targetEl && typeof targetEl.getBoundingClientRect === 'function' && spotlight) {
    const rect = targetEl.getBoundingClientRect();
    spotlight.style.top = `${Math.max(0, rect.top - 6)}px`;
    spotlight.style.left = `${Math.max(0, rect.left - 6)}px`;
    spotlight.style.width = `${rect.width + 12}px`;
    spotlight.style.height = `${rect.height + 12}px`;
    spotlight.classList.remove('hidden');

    // Auto-scroll target into view if needed
    if (typeof targetEl.scrollIntoView === 'function') {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } else if (spotlight) {
    spotlight.classList.add('hidden');
  }

  // Update button labels
  const nextBtn = document.getElementById('tutorial-next-btn');
  if (nextBtn) {
    nextBtn.innerHTML = (currentTutorialStepIndex === activeTutorialLesson.steps.length - 1)
      ? 'Selesai <i class="fa-solid fa-check ml-1"></i>'
      : 'Berikutnya <i class="fa-solid fa-arrow-right ml-1"></i>';
  }
}

function nextTutorialStep() {
  if (!activeTutorialLesson) return;
  currentTutorialStepIndex++;
  if (currentTutorialStepIndex >= activeTutorialLesson.steps.length) {
    endInteractiveTutorial();
  } else {
    showTutorialOverlayStep();
  }
}

function prevTutorialStep() {
  if (!activeTutorialLesson) return;
  if (currentTutorialStepIndex > 0) {
    currentTutorialStepIndex--;
    showTutorialOverlayStep();
  }
}

function endInteractiveTutorial() {
  isTutorialOverlayActive = false;
  activeTutorialLesson = null;
  const overlay = document.getElementById('tutorial-spotlight-overlay');
  if (overlay) overlay.classList.add('hidden');
}
