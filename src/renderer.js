// ============================================================
//  RÉCORD BOLÍVAR — renderer.js
//  FIX DEFINITIVO:
//  1. .modal.hidden usa display:none — elimina el modal del stacking
//     context para que no bloquee inputs aunque sea invisible.
//  2. Las animaciones fadeIn/modalIn fueron eliminadas — en Electron,
//     el opacity:0 inicial congela el foco en los inputs.
//  3. confirm() nativo reemplazado por showConfirm() HTML propio —
//     el confirm() nativo deja el foco atrapado en el proceso del SO.
// ============================================================

// ==================== CONFIGURACIÓN ====================
const ALL_TESTS = {
  "Carreras Planas": ["100m", "200m", "400m"],
  "Relevos":         ["4x100", "4x400"],
  "Relevo Comb.":    ["4x100 comb"],
  "Vallas":          ["110m vallas", "100m vallas", "400m vallas"],
  "Saltos":          ["Salto largo", "Salto triple"],
  "Lanzamientos":    ["Bala", "Jabalina", "Disco"]
};
const allTestsFlat = Object.values(ALL_TESTS).flat();

let selectedTests = [];
let currentMultipleAthleteId = null;
let currentPage = 1;
let athletesData = [];
let barChart = null;
let donutChart = null;
let currentFilters = { category: '', club: '', liga: '' };

// ==================== DOM REFS ====================
const viewTitle   = document.getElementById('view-title');
const viewSubtitle = document.getElementById('view-subtitle');
const rankingSelect = document.getElementById('ranking-test-select');
const rankingList   = document.getElementById('ranking-list');
const selectedBadge = document.getElementById('selected-count-badge');
const saveAthleteBtn = document.getElementById('save-athlete');
const clearFormBtn   = document.getElementById('clear-form');
const nombreInput    = document.getElementById('nombre');
const edadInput      = document.getElementById('edad');
const clubInput      = document.getElementById('club');
const ligaSelect     = document.getElementById('liga');
const formMessage    = document.getElementById('form-message');
const searchInput    = document.getElementById('search-athlete');
const filterBtn      = document.getElementById('filter-table');
const refreshRankingBtn    = document.getElementById('refresh-ranking');
const topRankingsContainer = document.getElementById('top-rankings-container');
const editingBadge   = document.getElementById('editing-badge');

// ==================== UTILS ====================
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function updateSelectedBadge() {
  if (selectedBadge) selectedBadge.textContent = selectedTests.length;
}

function showMessage(msg, isError = false) {
  formMessage.textContent = msg;
  formMessage.className = 'form-message' + (isError ? ' error' : '');
  if (msg) setTimeout(() => { formMessage.textContent = ''; }, 3000);
}

// FIX DEFINITIVO: Reemplazamos confirm() nativo de Electron por un diálogo
// HTML propio. El confirm() nativo deja el foco atrapado en el proceso del
// diálogo del SO al cerrarse, bloqueando los inputs del renderer.
function showConfirm(title, message) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('confirm-dialog');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    dialog.classList.remove('hidden');

    function onOk() {
      cleanup();
      resolve(true);
    }
    function onCancel() {
      cleanup();
      resolve(false);
    }
    function cleanup() {
      dialog.classList.add('hidden');
      document.getElementById('confirm-ok-btn').removeEventListener('click', onOk);
      document.getElementById('confirm-cancel-btn').removeEventListener('click', onCancel);
      document.getElementById('confirm-backdrop').removeEventListener('click', onCancel);
    }

    document.getElementById('confirm-ok-btn').addEventListener('click', onOk);
    document.getElementById('confirm-cancel-btn').addEventListener('click', onCancel);
    document.getElementById('confirm-backdrop').addEventListener('click', onCancel);
  });
}

// ==================== TEMA ====================
// IMPLEMENTACIÓN COMPLETA — antes estaba vacía como stub, causando
// que el toggle no funcionara y que el estado del tema fuera inconsistente.
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('rb-theme', theme);

  const label = document.getElementById('theme-label');
  if (label) label.textContent = theme === 'dark' ? 'Modo claro' : 'Modo oscuro';

  // Actualizar gráficas si existen
  updateChartColors();
}

function updateChartColors() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor  = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const tickColor  = isDark ? '#4e5669' : '#95a0b4';
  const borderColor = isDark ? '#12151b' : '#ffffff';

  if (barChart) {
    barChart.options.scales.x.ticks.color  = tickColor;
    barChart.options.scales.y.ticks.color  = tickColor;
    barChart.options.scales.x.grid.color   = gridColor;
    barChart.options.scales.y.grid.color   = gridColor;
    barChart.update();
  }
  if (donutChart) {
    donutChart.data.datasets[0].borderColor = borderColor;
    donutChart.update();
  }
}

// Aplicar tema guardado al cargar
const savedTheme = localStorage.getItem('rb-theme') || 'dark';
applyTheme(savedTheme);

document.getElementById('theme-toggle')?.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ==================== NAVEGACIÓN ====================
const VIEWS = {
  dashboard: {
    title: 'Dashboard', subtitle: 'Resumen general del evento',
    el: document.getElementById('dashboard-view'),
    onShow: loadDashboard
  },
  register: {
    title: 'Registrar Atleta', subtitle: 'Ingrese los datos del nuevo atleta',
    el: document.getElementById('register-view'),
    onShow: () => loadSmallTable()
  },
  table: {
    title: 'Tabla General', subtitle: 'Consulta de atletas y registro de marcas',
    el: document.getElementById('table-view'),
    onShow: () => loadTableWithFilters(currentPage, searchInput?.value || '')
  },
  config: {
    title: 'Configuración', subtitle: 'Opciones de exportación y datos',
    el: document.getElementById('config-view'),
    onShow: null
  }
};

function showView(name) {
  for (const [key, v] of Object.entries(VIEWS)) {
    if (v.el) v.el.classList.toggle('active', key === name);
  }
  if (viewTitle)    viewTitle.textContent    = VIEWS[name]?.title    || '';
  if (viewSubtitle) viewSubtitle.textContent = VIEWS[name]?.subtitle || '';
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.view === name);
  });
  if (VIEWS[name]?.onShow) VIEWS[name].onShow();
}

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => showView(link.dataset.view));
});

// Sidebar toggle
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebar = document.getElementById('sidebar');
let sidebarOpen = true;
sidebarToggle?.addEventListener('click', () => {
  sidebarOpen = !sidebarOpen;
  sidebar.style.width = sidebarOpen ? 'var(--sidebar-w)' : '0px';
});

// ==================== STATS TOPBAR ====================
async function loadStats() {
  try {
    const data = await window.electronAPI.getAthletes();
    const totalAthletes = data.athletes.length;
    let totalInscripciones = 0;
    data.athletes.forEach(a => { totalInscripciones += a.tests.length; });
    const uniqueClubs = new Set(data.athletes.map(a => a.club).filter(Boolean));
    const statCards = document.getElementById('stat-cards');
    if (statCards) {
      statCards.innerHTML = `
        <div class="stat-chip">
          <span class="stat-chip-icon">👥</span>
          <div><div class="stat-chip-num">${totalAthletes}</div><div class="stat-chip-label">Atletas</div></div>
        </div>
        <div class="stat-chip">
          <span class="stat-chip-icon">⚡</span>
          <div><div class="stat-chip-num">${totalInscripciones}</div><div class="stat-chip-label">Inscripciones</div></div>
        </div>
        <div class="stat-chip">
          <span class="stat-chip-icon">🏟️</span>
          <div><div class="stat-chip-num">${uniqueClubs.size}</div><div class="stat-chip-label">Clubes</div></div>
        </div>
      `;
    }
  } catch (err) { console.error('loadStats:', err); }
}

// ==================== EXPORTAR A EXCEL ====================
async function exportToExcel() {
  try {
    const buffer = await window.electronAPI.exportToExcel();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'informe_atletas.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    alert('Error al exportar a Excel: ' + err.message);
  }
}

// ==================== RANKING ====================
async function loadRanking() {
  const testName = rankingSelect?.value;
  if (!testName) return;
  try {
    const topRankings = await window.electronAPI.getTopRankings();
    const rankings = topRankings[testName] || [];
    if (!rankingList) return;
    rankingList.innerHTML = '';
    if (rankings.length === 0) {
      rankingList.innerHTML = '<div style="padding:16px 20px;font-size:12.5px;color:var(--text-3)">Sin resultados registrados para esta prueba</div>';
      return;
    }
    rankings.forEach((r, idx) => {
      const posClass = idx === 0 ? 'gold' : idx === 1 ? 'silver' : 'bronze';
      const row = document.createElement('div');
      row.className = 'ranking-row';
      row.innerHTML = `
        <div class="rank-pos ${posClass}">${idx + 1}</div>
        <div class="rank-info">
          <div class="rank-name">${escapeHtml(r.athlete_name)}</div>
          <div class="rank-club">${escapeHtml(r.club || '—')}</div>
        </div>
        <div style="text-align:right">
          <div class="rank-time">${r.value}</div>
          <div class="rank-date">${new Date(r.date).toLocaleDateString('es-CO')}</div>
        </div>
      `;
      rankingList.appendChild(row);
    });
  } catch (err) { console.error('loadRanking:', err); }
}

async function loadRankingSelect() {
  if (!rankingSelect) return;
  rankingSelect.innerHTML = '';
  allTestsFlat.forEach(test => {
    const opt = document.createElement('option');
    opt.value = test;
    opt.textContent = test;
    rankingSelect.appendChild(opt);
  });
  rankingSelect.value = '100m';
  await loadRanking();
}

// ==================== TABLA PRINCIPAL ====================
function applyFiltersToAthletes(athletes, filters, searchText) {
  let filtered = [...athletes];
  if (searchText) filtered = filtered.filter(a => a.nombre.toLowerCase().includes(searchText.toLowerCase()));
  if (filters.club)     filtered = filtered.filter(a => a.club === filters.club);
  if (filters.liga)     filtered = filtered.filter(a => a.liga === filters.liga);
  if (filters.category) {
    const pruebas = ALL_TESTS[filters.category] || [];
    filtered = filtered.filter(a => a.tests.some(t => pruebas.includes(t)));
  }
  return filtered;
}

async function loadTableWithFilters(page = 1, search = '') {
  try {
    const data = await window.electronAPI.getAthletes();
    if (!data || !data.athletes) return;
    const filtered = applyFiltersToAthletes(data.athletes, currentFilters, search);
    athletesData = filtered;
    const itemsPerPage = 8;
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const start = (page - 1) * itemsPerPage;
    const paginated = filtered.slice(start, start + itemsPerPage);

    const thead = document.getElementById('table-header');
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th rowspan="2" class="left">#</th>
          <th rowspan="2" class="left">Nombre</th>
          <th rowspan="2">Edad</th>
          <th rowspan="2">Club</th>
          <th rowspan="2">Liga</th>
          <th colspan="3" class="col-header-group">Carreras Planas</th>
          <th colspan="2" class="col-header-group">Relevos</th>
          <th colspan="1" class="col-header-group">Relevo Comb.</th>
          <th colspan="3" class="col-header-group">Vallas</th>
          <th colspan="2" class="col-header-group">Saltos</th>
          <th colspan="3" class="col-header-group">Lanzamientos</th>
          <th rowspan="2">Acciones</th>
        </tr>
        <tr>
          <th>100m</th><th>200m</th><th>400m</th>
          <th>4×100</th><th>4×400</th><th>4×100 c.</th>
          <th>110m v.</th><th>100m v.</th><th>400m v.</th>
          <th>Largo</th><th>Triple</th>
          <th>Bala</th><th>Jabalina</th><th>Disco</th>
        </tr>
      `;
    }

    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    for (let idx = 0; idx < paginated.length; idx++) {
      const athlete = paginated[idx];
      const row = tbody.insertRow();
      row.insertCell(0).textContent = start + idx + 1;
      row.insertCell(1).innerHTML = `<span class="athlete-name">${escapeHtml(athlete.nombre)}</span>`;
      row.insertCell(2).textContent = athlete.edad || '—';
      row.insertCell(3).textContent = athlete.club || '—';
      row.insertCell(4).textContent = athlete.liga || '—';
      for (const test of allTestsFlat) {
        const cell = row.insertCell();
        cell.innerHTML = athlete.tests.includes(test)
          ? '<span class="check-cell">✓</span>'
          : '<span class="dash-cell">·</span>';
      }
      const actionCell = row.insertCell();
      const btn = document.createElement('button');
      btn.textContent = '📝 Marcas';
      btn.className = 'btn-primary-sm';
      btn.addEventListener('click', () => openMultipleResultsModal(athlete.id, athlete.nombre));
      actionCell.appendChild(btn);
    }

    const infoSpan = document.getElementById('table-info');
    if (infoSpan) {
      infoSpan.textContent = filtered.length > 0
        ? `Mostrando ${start + 1}–${Math.min(start + itemsPerPage, filtered.length)} de ${filtered.length} atletas`
        : 'Sin resultados';
    }

    const paginationDiv = document.getElementById('pagination');
    if (paginationDiv) {
      paginationDiv.innerHTML = '';
      for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('div');
        btn.className = `page-btn${i === page ? ' active' : ''}`;
        btn.textContent = i;
        btn.addEventListener('click', () => {
          currentPage = i;
          loadTableWithFilters(i, searchInput?.value || '');
        });
        paginationDiv.appendChild(btn);
      }
    }
  } catch (err) { console.error('loadTableWithFilters:', err); }
}

async function loadClubFilterOptions() {
  try {
    const data = await window.electronAPI.getAthletes();
    const clubs = new Set(data.athletes.map(a => a.club).filter(Boolean));
    const clubSelect = document.getElementById('filter-club');
    if (clubSelect) {
      clubSelect.innerHTML = '<option value="">Todos los clubes</option>';
      Array.from(clubs).sort().forEach(club => {
        const opt = document.createElement('option');
        opt.value = club; opt.textContent = club;
        clubSelect.appendChild(opt);
      });
    }
  } catch (err) { console.error('loadClubFilterOptions:', err); }
}

filterBtn?.addEventListener('click', () => {
  const panel = document.getElementById('filters-panel');
  if (panel) panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
});

document.getElementById('apply-filters')?.addEventListener('click', () => {
  currentFilters = {
    category: document.getElementById('filter-category')?.value || '',
    club:     document.getElementById('filter-club')?.value     || '',
    liga:     document.getElementById('filter-liga')?.value     || ''
  };
  currentPage = 1;
  loadTableWithFilters(1, searchInput?.value || '');
});

document.getElementById('clear-filters')?.addEventListener('click', () => {
  const fc = document.getElementById('filter-category');
  const fclub = document.getElementById('filter-club');
  const fl = document.getElementById('filter-liga');
  if (fc)   fc.value   = '';
  if (fclub) fclub.value = '';
  if (fl)   fl.value   = '';
  currentFilters = { category: '', club: '', liga: '' };
  currentPage = 1;
  loadTableWithFilters(1, searchInput?.value || '');
});

// ==================== MODAL MÚLTIPLE MARCAS ====================
// FIX: Cerramos el modal usando classList (.hidden) que en CSS aplica
// visibility:hidden + pointer-events:none — NO display:none.
// Esto evita que el backdrop-filter de Electron/Chromium bloquee
// los inputs del formulario de registro.

function openModal() {
  document.getElementById('multiple-results-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('multiple-results-modal').classList.add('hidden');
  // display:none elimina el modal del DOM de render — restaurar foco al body
  document.body.focus();
}

async function openMultipleResultsModal(athleteId, athleteName) {
  currentMultipleAthleteId = athleteId;
  const nameEl = document.getElementById('multiple-modal-athlete-name');
  if (nameEl) nameEl.textContent = athleteName;

  const tests = await window.electronAPI.getAthleteTests(athleteId);
  const currentResults = await window.electronAPI.getCurrentResultsForAthlete(athleteId);

  const tbody = document.getElementById('multiple-results-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  for (const test of tests) {
    const row = tbody.insertRow();
    const nameCell = row.insertCell(0);
    nameCell.textContent = test;
    nameCell.style.cssText = 'padding:9px 14px;border-bottom:1px solid var(--border-subtle);font-size:13px;font-weight:500;color:var(--text-1);white-space:nowrap;';
    const inputCell = row.insertCell(1);
    inputCell.style.cssText = 'padding:7px 14px;border-bottom:1px solid var(--border-subtle);';
    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.placeholder = 'Ej: 11.24';
    input.value = currentResults[test] !== undefined ? currentResults[test] : '';
    input.dataset.test = test;
    inputCell.appendChild(input);
  }
  openModal();
}

document.getElementById('multiple-modal-cancel')?.addEventListener('click', closeModal);

// Cerrar modal al hacer click en el backdrop
document.getElementById('multiple-modal-backdrop')?.addEventListener('click', closeModal);

document.getElementById('multiple-modal-save')?.addEventListener('click', async () => {
  const inputs = document.querySelectorAll('#multiple-results-tbody input');
  let successCount = 0;
  for (const input of inputs) {
    const testName = input.dataset.test;
    const value = parseFloat(input.value);
    if (!isNaN(value)) {
      const res = await window.electronAPI.saveResult({ athleteId: currentMultipleAthleteId, testName, value });
      if (res.success) successCount++;
    }
  }
  if (successCount > 0) {
    closeModal();
    showMessage(`${successCount} marca(s) guardada(s) correctamente`);
    await refreshAll();
  } else {
    alert('No se ingresó ninguna marca válida');
  }
});

// ==================== TABLA PEQUEÑA (vista Register) ====================
async function loadSmallTable(page = 1, search = '') {
  try {
    const data = await window.electronAPI.getAthletes();
    let filtered = search
      ? data.athletes.filter(a => a.nombre.toLowerCase().includes(search.toLowerCase()))
      : data.athletes;
    const itemsPerPage = 5;
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const start = (page - 1) * itemsPerPage;
    const paginated = filtered.slice(start, start + itemsPerPage);
    const tbody = document.getElementById('reg-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    for (let idx = 0; idx < paginated.length; idx++) {
      const a = paginated[idx];
      const row = tbody.insertRow();
      row.insertCell(0).textContent = start + idx + 1;
      row.insertCell(1).innerHTML = `<span class="athlete-name">${escapeHtml(a.nombre)}</span>`;
      row.insertCell(2).textContent = a.edad || '—';
      row.insertCell(3).textContent = a.club || '—';
      row.insertCell(4).textContent = a.liga || '—';
      row.insertCell(5).textContent = a.tests.length;
      const actionCell = row.insertCell();
      actionCell.style.cssText = 'display:flex;gap:5px;justify-content:center;align-items:center;';

      const editBtn = document.createElement('button');
      editBtn.className = 'btn-icon';
      editBtn.title = 'Editar';
      editBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
      editBtn.addEventListener('click', (e) => {
        e.currentTarget.blur();
        editAthlete(a.id);
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'btn-icon delete';
      delBtn.title = 'Eliminar';
      delBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
      delBtn.addEventListener('click', () => confirmDelete(a.id, a.nombre));

      actionCell.appendChild(editBtn);
      actionCell.appendChild(delBtn);
    }

    const infoSpan = document.getElementById('reg-table-info');
    if (infoSpan) {
      infoSpan.textContent = filtered.length > 0
        ? `Mostrando ${start + 1}–${Math.min(start + itemsPerPage, filtered.length)} de ${filtered.length} atletas`
        : 'Sin atletas registrados';
    }

    const paginationDiv = document.getElementById('reg-pagination');
    if (paginationDiv) {
      paginationDiv.innerHTML = '';
      for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('div');
        btn.className = `page-btn${i === page ? ' active' : ''}`;
        btn.textContent = i;
        btn.addEventListener('click', () => loadSmallTable(i, search));
        paginationDiv.appendChild(btn);
      }
    }
  } catch (err) { console.error('loadSmallTable:', err); }
}

// Buscador en vista Register
document.getElementById('reg-search-athlete')?.addEventListener('input', (e) => {
  loadSmallTable(1, e.target.value);
});

// ==================== EDITAR / ELIMINAR ====================
async function editAthlete(id) {
  try {
    // CRÍTICO: hacer blur del botón ANTES de la llamada IPC async.
    // En Electron, cuando un botón tiene foco y se hace una llamada
    // IPC, el blur automático que ocurre durante la espera deja el
    // foco en null — bloqueando todos los inputs hasta refrescar la ventana.
    if (document.activeElement) document.activeElement.blur();

    const { athlete, tests } = await window.electronAPI.getAthleteById(id);
    if (!athlete) return;

    // Mostrar la vista sin disparar onShow (evita regenerar DOM durante el foco)
    for (const [key, v] of Object.entries(VIEWS)) {
      if (v.el) v.el.classList.toggle('active', key === 'register');
    }
    if (viewTitle)    viewTitle.textContent    = VIEWS.register.title;
    if (viewSubtitle) viewSubtitle.textContent = VIEWS.register.subtitle;
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.view === 'register');
    });

    clearForm(false);
    nombreInput.value = athlete.nombre;
    edadInput.value   = athlete.edad || '';
    clubInput.value   = athlete.club || '';
    ligaSelect.value  = athlete.liga || 'Bolívar';

    selectedTests = [...tests];
    updateSelectedBadge();
    document.querySelectorAll('.sub-tab').forEach(st => {
      st.classList.toggle('active', selectedTests.includes(st.textContent));
    });

    const saveBtn = document.getElementById('save-athlete');
    const saveBtnText = document.getElementById('save-btn-text');
    if (saveBtn) {
      saveBtn.dataset.editId = id;
      if (saveBtnText) saveBtnText.textContent = 'Actualizar Atleta';
    }
    if (editingBadge) editingBadge.classList.remove('hidden');
    showMessage('Editando atleta. Guarda los cambios.');

    setTimeout(() => loadSmallTable(), 50);
  } catch (err) { console.error('editAthlete:', err); }
}

async function confirmDelete(id, name) {
  const ok = await showConfirm('Eliminar atleta', `¿Eliminar permanentemente a ${name}?`);
  if (!ok) return;
  try {
    const res = await window.electronAPI.deleteAthlete(id);
    if (res.success) {
      await refreshAll();
    } else {
      alert('Error al eliminar: ' + res.error);
    }
  } catch (err) { console.error('confirmDelete:', err); }
}

// ==================== FORMULARIO ====================
function clearForm(resetSaveBtn = true) {
  nombreInput.value = '';
  edadInput.value   = '';
  clubInput.value   = '';
  ligaSelect.value  = 'Bolívar';
  selectedTests = [];
  updateSelectedBadge();
  document.querySelectorAll('.sub-tab').forEach(st => st.classList.remove('active'));
  if (resetSaveBtn) {
    const saveBtn = document.getElementById('save-athlete');
    const saveBtnText = document.getElementById('save-btn-text');
    if (saveBtn) {
      delete saveBtn.dataset.editId;
      if (saveBtnText) saveBtnText.textContent = 'Guardar Atleta';
    }
    if (editingBadge) editingBadge.classList.add('hidden');
  }
  formMessage.textContent = '';
  formMessage.className = 'form-message';
}

// Guardar atleta (nuevo o actualizar)
saveAthleteBtn?.addEventListener('click', async () => {
  const nombre = nombreInput.value.trim();
  if (!nombre) { showMessage('El nombre es obligatorio', true); return; }
  if (selectedTests.length === 0) { showMessage('Selecciona al menos una prueba', true); return; }

  const athleteData = {
    nombre,
    edad:  edadInput.value  || null,
    club:  clubInput.value  || null,
    liga:  ligaSelect.value || null
  };
  const editId = saveAthleteBtn.dataset.editId;

  if (editId) {
    const res = await window.electronAPI.updateAthlete({ athleteId: editId, athleteData, selectedTests });
    if (res.success) {
      clearForm(true);
      showMessage('Atleta actualizado correctamente');
      await refreshAll();
    } else {
      showMessage('Error: ' + res.error, true);
    }
  } else {
    const res = await window.electronAPI.saveAthlete({ athlete: athleteData, selectedTests });
    if (res.success) {
      clearForm(true);
      showMessage('Atleta guardado correctamente');
      await refreshAll();
    } else {
      showMessage('Error: ' + res.error, true);
    }
  }
});

clearFormBtn?.addEventListener('click', () => clearForm(true));

// ==================== DASHBOARD ====================
async function loadTopRankings() {
  try {
    const topRankings = await window.electronAPI.getTopRankings();
    if (!topRankingsContainer) return;
    topRankingsContainer.innerHTML = '';
    for (const [test, rankings] of Object.entries(topRankings)) {
      if (rankings.length === 0) continue;
      const card = document.createElement('div');
      card.className = 'ranking-card';
      card.innerHTML = `<div class="ranking-card-title">${escapeHtml(test)}</div>` +
        rankings.map((r, idx) => `
          <div class="ranking-card-item">
            <div class="rank-medal ${idx === 0 ? 'gold' : idx === 1 ? 'silver' : 'bronze'}">${idx + 1}</div>
            <div class="rank-card-info">
              <div class="rank-card-name">${escapeHtml(r.athlete_name)}</div>
              <div class="rank-card-club">${escapeHtml(r.club || '—')}</div>
            </div>
            <div class="rank-card-value">${r.value}</div>
          </div>
        `).join('');
      topRankingsContainer.appendChild(card);
    }
  } catch (err) { console.error('loadTopRankings:', err); }
}

async function loadBarChart() {
  try {
    const bestMarks = await window.electronAPI.getBestMarks();
    const filtered  = bestMarks.filter(b => b.bestValue !== null);
    const ctx = document.getElementById('barChart')?.getContext('2d');
    if (!ctx) return;
    if (barChart) { barChart.destroy(); barChart = null; }
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const tickColor = isDark ? '#4e5669' : '#95a0b4';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    barChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: filtered.map(b => b.test),
        datasets: [{
          label: 'Mejor Marca',
          data: filtered.map(b => b.bestValue),
          backgroundColor: '#2563eb',
          borderRadius: 5,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: tickColor, font: { size: 10 } }, grid: { color: gridColor } },
          y: { ticks: { color: tickColor, font: { size: 10 } }, grid: { color: gridColor } }
        }
      }
    });
  } catch (err) { console.error('loadBarChart:', err); }
}

async function loadDonutChart() {
  try {
    const { athletes } = await window.electronAPI.getAthletes();
    const counts = { "Carreras Planas": 0, "Relevos": 0, "Relevo Comb.": 0, "Vallas": 0, "Saltos": 0, "Lanzamientos": 0 };
    for (const athlete of athletes) {
      for (const test of athlete.tests) {
        for (const [cat, testsArr] of Object.entries(ALL_TESTS)) {
          if (testsArr.includes(test)) { counts[cat]++; break; }
        }
      }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const totalEl = document.getElementById('total-inscripciones');
    if (totalEl) totalEl.textContent = total;

    const colors = ['#2563eb','#7c3aed','#059669','#dc2626','#d97706','#0891b2'];
    const legendDiv = document.getElementById('donut-legend');
    if (legendDiv) {
      legendDiv.innerHTML = '';
      Object.entries(counts).forEach(([cat, val], i) => {
        const pct = total ? ((val / total) * 100).toFixed(1) : 0;
        legendDiv.innerHTML += `
          <div class="legend-item">
            <span class="legend-dot" style="background:${colors[i]}"></span>
            <span>${cat}</span>
            <span class="legend-pct">${val} (${pct}%)</span>
          </div>`;
      });
    }

    const ctx = document.getElementById('donutChart')?.getContext('2d');
    if (!ctx) return;
    if (donutChart) { donutChart.destroy(); donutChart = null; }
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    donutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(counts),
        datasets: [{
          data: Object.values(counts),
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: isDark ? '#12151b' : '#ffffff'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        plugins: { legend: { display: false } }
      }
    });
  } catch (err) { console.error('loadDonutChart:', err); }
}

async function loadDashboard() {
  await Promise.all([loadTopRankings(), loadBarChart(), loadDonutChart()]);
}

// ==================== PRUEBAS UI ====================
function buildPruebasUI() {
  const tabsContainer = document.getElementById('pruebas-tabs-container');
  if (!tabsContainer) return;
  const categories = Object.keys(ALL_TESTS);
  tabsContainer.innerHTML = '';
  categories.forEach((cat, i) => {
    const tab = document.createElement('div');
    tab.className = 'prueba-tab' + (i === 0 ? ' active' : '');
    tab.textContent = cat;
    tab.addEventListener('click', () => {
      document.querySelectorAll('.prueba-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      showSubTabs(cat);
    });
    tabsContainer.appendChild(tab);
  });
  showSubTabs(categories[0]);
}

function showSubTabs(category) {
  const subContainer = document.getElementById('sub-tabs-container');
  if (!subContainer) return;
  subContainer.innerHTML = '';
  ALL_TESTS[category].forEach(test => {
    const sub = document.createElement('div');
    sub.className = 'sub-tab' + (selectedTests.includes(test) ? ' active' : '');
    sub.textContent = test;
    sub.addEventListener('click', () => {
      if (selectedTests.includes(test)) {
        selectedTests = selectedTests.filter(t => t !== test);
        sub.classList.remove('active');
      } else {
        if (selectedTests.length >= 4) { alert('Máximo 4 pruebas por atleta'); return; }
        selectedTests.push(test);
        sub.classList.add('active');
      }
      updateSelectedBadge();
    });
    subContainer.appendChild(sub);
  });
}

// ==================== REFRESH ALL ====================
async function refreshAll() {
  await Promise.all([
    loadTableWithFilters(currentPage, searchInput?.value || ''),
    loadSmallTable(),
    loadStats(),
    loadClubFilterOptions(),
    loadRanking(),
    loadDashboard()
  ]);
}

// ==================== EVENTOS GLOBALES ====================
searchInput?.addEventListener('input', () => {
  currentPage = 1;
  loadTableWithFilters(1, searchInput.value);
});

refreshRankingBtn?.addEventListener('click', loadRanking);
rankingSelect?.addEventListener('change', loadRanking);

document.getElementById('export-csv-config')?.addEventListener('click', exportToExcel);

document.getElementById('clear-all-data-config')?.addEventListener('click', async () => {
  const ok = await showConfirm('⚠️ Borrar todos los datos', '¡ATENCIÓN! Vas a eliminar TODOS los datos. Esta acción no se puede deshacer.');
  if (!ok) return;
  const res = await window.electronAPI.clearAllData();
  if (res.success) {
    clearForm(true);
    await refreshAll();
    showMessage('Todos los datos eliminados correctamente.');
  } else {
    showMessage('Error: ' + res.error, true);
  }
});

// ==================== INIT ====================
async function init() {
  buildPruebasUI();
  await loadRankingSelect();
  await loadStats();
  await loadTableWithFilters(1, '');
  await loadSmallTable();
  await loadDashboard();
  await loadClubFilterOptions();
  showView('dashboard');
}

init();