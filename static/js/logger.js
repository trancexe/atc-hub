// ATC HUB - Real-Time Telemetry & Blackbox Event Logger

let telemetryLogs = [];
let currentLogFilter = 'ALL';
let isLoggerPanelOpen = false;

function logTelemetry(category, title, details) {
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS
  const detailsStr = typeof details === 'object' ? JSON.stringify(details) : (details || "");

  const entry = {
    id: Date.now() + Math.random().toString(36).substr(2, 4),
    time: timeStr,
    category: category || 'SYSTEM',
    title: title || '',
    details: detailsStr
  };

  telemetryLogs.push(entry);
  if (telemetryLogs.length > 150) {
    telemetryLogs.shift();
  }

  // Update DOM if panel is mounted
  appendLogToUI(entry);

  // Update badge counter
  const badge = document.getElementById('logger-badge');
  if (badge) {
    badge.textContent = telemetryLogs.length;
  }

  // Fire-and-forget sync to backend API logger
  try {
    fetch('/api/telemetry/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    }).catch(() => {});
  } catch (e) {}

  console.log(`[ATC ${entry.category}] ${entry.time} | ${entry.title}`, entry.details);
}

function appendLogToUI(entry) {
  const stream = document.getElementById('telemetry-log-stream');
  if (!stream) return;

  // Check filter
  if (currentLogFilter !== 'ALL' && entry.category !== currentLogFilter) {
    return;
  }

  const badgeColorMap = {
    'VOICE': 'bg-sky-950/80 text-sky-300 border-sky-700',
    'BEHAVIOR': 'bg-amber-950/80 text-amber-300 border-amber-700',
    'READBACK': 'bg-emerald-950/80 text-emerald-300 border-emerald-700',
    'SAFETY': 'bg-red-950/90 text-red-300 border-red-700 animate-pulse font-bold',
    'AI': 'bg-purple-950/80 text-purple-300 border-purple-700',
    'SYSTEM': 'bg-slate-900 text-slate-400 border-slate-700'
  };

  const badgeClass = badgeColorMap[entry.category] || badgeColorMap['SYSTEM'];

  const row = document.createElement('div');
  row.className = "p-1.5 rounded bg-slate-900/70 border border-slate-800/80 hover:border-slate-700 transition space-y-0.5";
  row.dataset.category = entry.category;

  row.innerHTML = `
    <div class="flex items-center justify-between text-[10px]">
      <div class="flex items-center gap-1.5">
        <span class="text-slate-500 font-mono">${entry.time}</span>
        <span class="px-1 py-0.2 rounded border text-[9px] font-bold ${badgeClass}">
          ${entry.category}
        </span>
      </div>
      <span class="font-bold text-slate-200 truncate max-w-[200px]">${escapeHtml(entry.title)}</span>
    </div>
    ${entry.details ? `<div class="text-[10px] text-slate-400 font-mono pl-1 border-l border-slate-800 break-words">${escapeHtml(entry.details)}</div>` : ''}
  `;

  // Remove empty placeholder if present
  if (stream.children.length === 1 && stream.firstElementChild.classList.contains('italic')) {
    stream.innerHTML = '';
  }

  stream.appendChild(row);
  stream.scrollTop = stream.scrollHeight;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderAllLogs() {
  const stream = document.getElementById('telemetry-log-stream');
  if (!stream) return;

  stream.innerHTML = '';
  const filtered = currentLogFilter === 'ALL'
    ? telemetryLogs
    : telemetryLogs.filter(l => l.category === currentLogFilter);

  if (filtered.length === 0) {
    stream.innerHTML = '<div class="text-slate-500 italic text-[10px] p-2 text-center">No events for this filter.</div>';
    return;
  }

  filtered.forEach(entry => appendLogToUI(entry));
  stream.scrollTop = stream.scrollHeight;
}

function setLogFilter(filter) {
  currentLogFilter = filter;

  const btnMap = {
    'ALL': 'filter-all-btn',
    'VOICE': 'filter-voice-btn',
    'BEHAVIOR': 'filter-behavior-btn',
    'READBACK': 'filter-readback-btn',
    'SAFETY': 'filter-safety-btn'
  };

  Object.entries(btnMap).forEach(([f, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (f === filter) {
      el.className = "px-1.5 py-0.5 rounded bg-emerald-900 text-emerald-200 font-bold";
    } else {
      el.className = "px-1.5 py-0.5 rounded text-slate-400 hover:bg-slate-800";
    }
  });

  renderAllLogs();
}

function toggleTelemetryLogger() {
  const panel = document.getElementById('telemetry-logger-panel');
  const btn = document.getElementById('toggle-logger-btn');
  if (!panel) return;

  isLoggerPanelOpen = !isLoggerPanelOpen;
  if (isLoggerPanelOpen) {
    panel.classList.remove('hidden');
    if (btn) {
      btn.classList.add('bg-emerald-950', 'border-emerald-500', 'text-emerald-300');
      btn.classList.remove('bg-slate-900', 'border-slate-700', 'text-slate-300');
    }
    renderAllLogs();
  } else {
    panel.classList.add('hidden');
    if (btn) {
      btn.classList.remove('bg-emerald-950', 'border-emerald-500', 'text-emerald-300');
      btn.classList.add('bg-slate-900', 'border-slate-700', 'text-slate-300');
    }
  }
}

function clearTelemetryLogs() {
  telemetryLogs = [];
  const stream = document.getElementById('telemetry-log-stream');
  if (stream) {
    stream.innerHTML = '<div class="text-slate-500 italic text-[10px] p-2 text-center">Logs cleared. Waiting for new events...</div>';
  }
  const badge = document.getElementById('logger-badge');
  if (badge) badge.textContent = '0';
}
