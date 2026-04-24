// ==================== CONFIGURACIÓN ====================
const ALL_TESTS = {
  "Carreras Planas": ["100m", "200m", "400m"],
  "Relevos": ["4x100", "4x400"],
  "Relevo Comb.": ["4x100 comb"],
  "Vallas": ["110m vallas", "100m vallas", "400m vallas"],
  "Saltos": ["Salto largo", "Salto triple"],
  "Lanzamientos": ["Bala", "Jabalina", "Disco"]
};
let allTestsFlat = Object.values(ALL_TESTS).flat();
let selectedTests = [];
let currentAthleteIdForResult = null;
let currentPage = 1;
let athletesData = [];

// Elementos DOM
const viewTitle = document.getElementById('view-title');
const viewSubtitle = document.getElementById('view-subtitle');
const dashboardView = document.getElementById('dashboard-view');
const tableView = document.getElementById('table-view');
const rankingSelect = document.getElementById('ranking-test-select');
const rankingList = document.getElementById('ranking-list');
const selectedCountBadge = document.getElementById('selected-count-badge');
const saveAthleteBtn = document.getElementById('save-athlete');
const clearFormBtn = document.getElementById('clear-form');
const nombreInput = document.getElementById('nombre');
const edadInput = document.getElementById('edad');
const clubInput = document.getElementById('club');
const ligaSelect = document.getElementById('liga');
const formMessage = document.getElementById('form-message');
const searchInput = document.getElementById('search-athlete');
const filterBtn = document.getElementById('filter-table');
const refreshRankingBtn = document.getElementById('refresh-ranking');
const modal = document.getElementById('result-modal');
const modalAthleteName = document.getElementById('modal-athlete-name');
const modalTestSelect = document.getElementById('modal-test-select');
const resultValueInput = document.getElementById('result-value');
const modalCancel = document.getElementById('modal-cancel');
const modalSave = document.getElementById('modal-save');
const topRankingsContainer = document.getElementById('top-rankings-container');

let barChart, donutChart;

// ==================== UTILIDADES ====================
function updateSelectedBadge() {
  selectedCountBadge.innerText = `${selectedTests.length} / 4`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// ==================== RANKING ====================
async function loadRanking() {
  const testName = rankingSelect.value;
  if (!testName) return;
  const topRankings = await window.electronAPI.getTopRankings();
  const rankings = topRankings[testName] || [];
  rankingList.innerHTML = '';
  if (rankings.length === 0) {
    rankingList.innerHTML = '<div style="padding:10px; text-align:center;">Sin resultados aún</div>';
    return;
  }
  rankings.forEach((r, idx) => {
    let posClass = 'other';
    if (idx === 0) posClass = 'gold';
    else if (idx === 1) posClass = 'silver';
    else if (idx === 2) posClass = 'bronze';
    const row = document.createElement('div');
    row.className = 'ranking-row';
    row.innerHTML = `
      <div class="rank-pos ${posClass}">${idx+1}</div>
      <div class="rank-info">
        <div class="rank-name">${escapeHtml(r.athlete_name)}</div>
        <div class="rank-club">${r.club || '?'}</div>
      </div>
      <div style="text-align:right">
        <div class="rank-time">${r.value}</div>
        <div class="rank-date">${new Date(r.date).toLocaleDateString()}</div>
      </div>
    `;
    rankingList.appendChild(row);
  });
}

async function loadRankingSelect() {
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

// ==================== ESTADÍSTICAS SUPERIORES ====================
async function loadStats() {
  const data = await window.electronAPI.getAthletes();
  const totalAthletes = data.athletes.length;
  let totalInscripciones = 0;
  data.athletes.forEach(a => totalInscripciones += a.tests.length);
  const uniqueClubs = new Set(data.athletes.map(a => a.club).filter(c => c));
  document.querySelector('.stat-cards').innerHTML = `
    <div class="stat-card"><div class="stat-icon blue">👥</div><div><div class="stat-num" style="color:var(--accent-blue)">${totalAthletes}</div><div class="stat-label">Atletas</div></div></div>
    <div class="stat-card"><div class="stat-icon green">⚡</div><div><div class="stat-num" style="color:var(--accent-green)">${totalInscripciones}</div><div class="stat-label">Inscripciones</div></div></div>
    <div class="stat-card"><div class="stat-icon purple">🏅</div><div><div class="stat-num" style="color:var(--accent-purple)">0</div><div class="stat-label">Récords</div></div></div>
    <div class="stat-card"><div class="stat-icon orange">🏟️</div><div><div class="stat-num" style="color:var(--accent-orange)">${uniqueClubs.size}</div><div class="stat-label">Clubes</div></div></div>
  `;
}

// ==================== TABLA DE ATLETAS CON BOTÓN "REGISTRAR MARCA" ====================
async function loadTable(page = 1, search = '') {
  const { athletes, allTests } = await window.electronAPI.getAthletes();
  athletesData = athletes;
  let filtered = athletesData;
  if (search) {
    filtered = athletesData.filter(a => a.nombre.toLowerCase().includes(search.toLowerCase()));
  }
  const itemsPerPage = 8;
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const start = (page - 1) * itemsPerPage;
  const paginated = filtered.slice(start, start + itemsPerPage);
  
  // Encabezado (igual que antes, pero añadimos columna de acciones)
  const thead = document.getElementById('table-header');
  thead.innerHTML = `
    <tr><th rowspan="2" class="left">#</th><th rowspan="2" class="left">Nombre</th><th rowspan="2">Edad</th><th rowspan="2">Club</th><th rowspan="2">Liga</th>
    <th colspan="3" class="col-header-group">CARRERAS PLANAS</th>
    <th colspan="2" class="col-header-group">RELEVOS</th>
    <th colspan="1" class="col-header-group">RELEVO COMB.</th>
    <th colspan="3" class="col-header-group">VALLAS</th>
    <th colspan="2" class="col-header-group">SALTOS</th>
    <th colspan="3" class="col-header-group">LANZAMIENTOS</th>
    <th rowspan="2">Acciones</th>
    </tr>
    <tr>
      <th>100m</th><th>200m</th><th>400m</th>
      <th>4x100</th><th>4x400</th>
      <th>4x100 comb</th>
      <th>110m vallas</th><th>100m vallas</th><th>400m vallas</th>
      <th>Largo</th><th>Triple</th>
      <th>Bala</th><th>Jabalina</th><th>Disco</th>
    </tr>
  `;
  
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '';
  for (let idx = 0; idx < paginated.length; idx++) {
    const athlete = paginated[idx];
    const row = tbody.insertRow();
    row.insertCell(0).innerText = start + idx + 1;
    row.insertCell(1).innerHTML = `<span class="athlete-name">${escapeHtml(athlete.nombre)}</span>`;
    row.insertCell(2).innerText = athlete.edad || '-';
    row.insertCell(3).innerText = athlete.club || '-';
    row.insertCell(4).innerText = athlete.liga || '-';
    
    for (let test of allTestsFlat) {
      const cell = row.insertCell();
      const isSelected = athlete.tests.includes(test);
      if (isSelected) {
        cell.innerHTML = '✔️';
        cell.classList.add('check-green');
        // Opcional: si quieres mantener el clic directo también, pero ahora usamos botón
      } else {
        cell.innerHTML = '—';
      }
    }
    // Botón de registrar marca
    const actionCell = row.insertCell();
    const btn = document.createElement('button');
    btn.textContent = '📝 Registrar marca';
    btn.className = 'btn-primary';
    btn.style.padding = '4px 8px';
    btn.style.fontSize = '10px';
    btn.addEventListener('click', () => openResultModalForAthlete(athlete.id, athlete.nombre));
    actionCell.appendChild(btn);
  }
  
  document.getElementById('table-info').innerText = `Mostrando ${start+1} a ${Math.min(start+itemsPerPage, filtered.length)} de ${filtered.length} atletas`;
  const paginationDiv = document.getElementById('pagination');
  paginationDiv.innerHTML = '';
  for (let i=1; i<=totalPages; i++) {
    const btn = document.createElement('div');
    btn.className = `page-btn ${i===page ? 'active' : ''}`;
    btn.innerText = i;
    btn.addEventListener('click', () => loadTable(i, search));
    paginationDiv.appendChild(btn);
  }
}

// Abrir modal con las pruebas específicas del atleta
async function openResultModalForAthlete(athleteId, athleteName) {
  currentAthleteIdForResult = athleteId;
  modalAthleteName.innerText = athleteName;
  const tests = await window.electronAPI.getAthleteTests(athleteId);
  modalTestSelect.innerHTML = '';
  if (tests.length === 0) {
    modalTestSelect.innerHTML = '<option>No tiene pruebas inscritas</option>';
    return;
  }
  tests.forEach(test => {
    const opt = document.createElement('option');
    opt.value = test;
    opt.textContent = test;
    modalTestSelect.appendChild(opt);
  });
  resultValueInput.value = '';
  modal.classList.remove('hidden');
}

// ==================== DASHBOARD: MEJORES PARTICIPANTES POR PRUEBA ====================
async function loadTopRankings() {
  const topRankings = await window.electronAPI.getTopRankings();
  topRankingsContainer.innerHTML = '';
  for (const [test, rankings] of Object.entries(topRankings)) {
    if (rankings.length === 0) continue;
    const card = document.createElement('div');
    card.className = 'stat-card'; // reutilizamos estilo
    card.style.display = 'block';
    card.style.padding = '12px';
    let html = `<h3 style="margin-bottom:8px;">${test}</h3>`;
    rankings.forEach((r, idx) => {
      html += `<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
        <span><strong>${idx+1}.</strong> ${escapeHtml(r.athlete_name)}</span>
        <span style="color:var(--accent-blue);">${r.value}</span>
      </div>`;
    });
    card.innerHTML = html;
    topRankingsContainer.appendChild(card);
  }
}

// Gráficos de barras (mejores marcas)
async function loadBarChart() {
  const bestMarks = await window.electronAPI.getBestMarks();
  const labels = bestMarks.filter(b => b.bestValue !== null).map(b => b.test);
  const data = bestMarks.filter(b => b.bestValue !== null).map(b => b.bestValue);
  if (barChart) barChart.destroy();
  const ctx = document.getElementById('barChart').getContext('2d');
  barChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Mejor Marca', data, backgroundColor: '#22c55e' }] },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { color: '#64748b' } } } }
  });
}

// Donut de distribución de inscripciones
async function loadDonutChart() {
  const { athletes } = await window.electronAPI.getAthletes();
  let counts = { "Carreras Planas":0, "Relevos":0, "Relevo Comb.":0, "Vallas":0, "Saltos":0, "Lanzamientos":0 };
  for (let athlete of athletes) {
    for (let test of athlete.tests) {
      for (let [cat, testsArr] of Object.entries(ALL_TESTS)) {
        if (testsArr.includes(test)) { counts[cat]++; break; }
      }
    }
  }
  const total = Object.values(counts).reduce((a,b)=>a+b,0);
  document.getElementById('total-inscripciones').innerText = total;
  const legendDiv = document.getElementById('donut-legend');
  legendDiv.innerHTML = '';
  const colors = ['#3b82f6','#8b5cf6','#22c55e','#ef4444','#f97316','#eab308'];
  let idx=0;
  for (let [cat, val] of Object.entries(counts)) {
    const pct = total ? ((val/total)*100).toFixed(1) : 0;
    legendDiv.innerHTML += `<div class="legend-item"><span class="legend-dot" style="background:${colors[idx]}"></span>${cat} <span class="legend-pct">${val} (${pct}%)</span></div>`;
    idx++;
  }
  if (donutChart) donutChart.destroy();
  const donutCtx = document.getElementById('donutChart').getContext('2d');
  donutChart = new Chart(donutCtx, {
    type: 'doughnut',
    data: { labels: Object.keys(counts), datasets: [{ data: Object.values(counts), backgroundColor: colors, borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false } } }
  });
}

async function loadDashboard() {
  await loadTopRankings();
  await loadBarChart();
  await loadDonutChart();
}

// ==================== FORMULARIO DE REGISTRO DE ATLETAS ====================
function buildPruebasUI() {
  const tabsContainer = document.getElementById('pruebas-tabs-container');
  const categories = Object.keys(ALL_TESTS);
  tabsContainer.innerHTML = '';
  categories.forEach(cat => {
    const tab = document.createElement('div');
    tab.className = 'prueba-tab';
    tab.innerText = cat;
    tab.addEventListener('click', () => {
      document.querySelectorAll('.prueba-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      showSubTabs(cat);
    });
    tabsContainer.appendChild(tab);
  });
  document.querySelectorAll('.prueba-tab')[0]?.classList.add('active');
  showSubTabs(categories[0]);
}

function showSubTabs(category) {
  const subContainer = document.getElementById('sub-tabs-container');
  const tests = ALL_TESTS[category];
  subContainer.innerHTML = '';
  tests.forEach(test => {
    const subTab = document.createElement('div');
    subTab.className = 'sub-tab';
    subTab.innerText = test;
    if (selectedTests.includes(test)) subTab.classList.add('active');
    subTab.addEventListener('click', () => {
      if (selectedTests.includes(test)) {
        selectedTests = selectedTests.filter(t => t !== test);
        subTab.classList.remove('active');
      } else {
        if (selectedTests.length >= 4) {
          alert('Máximo 4 pruebas permitidas');
          return;
        }
        selectedTests.push(test);
        subTab.classList.add('active');
      }
      updateSelectedBadge();
      document.querySelectorAll('.sub-tab').forEach(st => {
        if (selectedTests.includes(st.innerText)) st.classList.add('active');
        else st.classList.remove('active');
      });
    });
    subContainer.appendChild(subTab);
  });
}

saveAthleteBtn.addEventListener('click', async () => {
  const nombre = nombreInput.value.trim();
  if (!nombre) { formMessage.innerText = 'Nombre es obligatorio'; return; }
  if (selectedTests.length === 0) { formMessage.innerText = 'Seleccione al menos una prueba'; return; }
  const athlete = { nombre, fecha_nacimiento: null, edad: edadInput.value || null, club: clubInput.value || null, liga: ligaSelect.value || null };
  const res = await window.electronAPI.saveAthlete({ athlete, selectedTests });
  if (res.success) {
    formMessage.innerText = 'Atleta guardado exitosamente';
    nombreInput.value = ''; edadInput.value = ''; clubInput.value = ''; ligaSelect.value = 'Bolívar';
    selectedTests = []; updateSelectedBadge();
    document.querySelectorAll('.sub-tab').forEach(st => st.classList.remove('active'));
    loadStats(); loadTable(currentPage, searchInput.value); loadDashboard(); loadRanking();
  } else {
    formMessage.innerText = 'Error: ' + res.error;
  }
});

clearFormBtn.addEventListener('click', () => {
  nombreInput.value = ''; edadInput.value = ''; clubInput.value = ''; ligaSelect.value = 'Bolívar';
  selectedTests = []; updateSelectedBadge();
  document.querySelectorAll('.sub-tab').forEach(st => st.classList.remove('active'));
  formMessage.innerText = '';
});

// ==================== NAVEGACIÓN ====================
function showView(view) {
  if (view === 'dashboard') {
    dashboardView.style.display = 'flex';
    tableView.style.display = 'none';
    viewTitle.innerText = 'Dashboard';
    viewSubtitle.innerText = 'Mejores atletas y estadísticas';
    loadDashboard();
  } else if (view === 'table') {
    dashboardView.style.display = 'none';
    tableView.style.display = 'flex';
    viewTitle.innerText = 'Tabla General';
    viewSubtitle.innerText = 'Consulta de atletas y registro de marcas';
    loadTable(currentPage, searchInput.value);
  } else if (view === 'register') {
    dashboardView.style.display = 'flex';
    tableView.style.display = 'none';
    viewTitle.innerText = 'Registrar Atleta';
    viewSubtitle.innerText = 'Ingrese los datos del nuevo atleta';
  }
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    showView(item.getAttribute('data-view'));
  });
});

// Modal guardar resultado
modalSave.addEventListener('click', async () => {
  const testName = modalTestSelect.value;
  const value = parseFloat(resultValueInput.value);
  if (!testName || isNaN(value)) {
    alert('Seleccione una prueba y un valor válido');
    return;
  }
  const res = await window.electronAPI.saveResult({ athleteId: currentAthleteIdForResult, testName, value });
  if (res.success) {
    modal.classList.add('hidden');
    loadTable(currentPage, searchInput.value);
    loadRanking();
    loadDashboard();
  } else {
    alert('Error al guardar: ' + res.error);
  }
});
modalCancel.addEventListener('click', () => modal.classList.add('hidden'));

searchInput.addEventListener('input', () => loadTable(1, searchInput.value));
filterBtn.addEventListener('click', () => loadTable(1, searchInput.value));
refreshRankingBtn.addEventListener('click', loadRanking);
rankingSelect.addEventListener('change', loadRanking);

// Inicialización
async function init() {
  buildPruebasUI();
  await loadRankingSelect();
  await loadStats();
  await loadTable(1, '');
  await loadDashboard();
  showView('dashboard');
  document.querySelector('.nav-item[data-view="dashboard"]').classList.add('active');
}
init();