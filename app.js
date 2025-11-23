// ======== ESTADO GLOBAL (modo 100% offline/localStorage) ========
const STORAGE_KEYS = {
  ACTIVE_WORKOUT: "tt_activeWorkout",
  ROUTINES: "tt_routines",
  FEED: "tt_feed",
  PRS: "tt_prs",
};

let activeTab = "today";
let activeWorkout = null;
let routines = [];
let communityFeed = [];
let personalRecords = [];
let currentRoutine = null; // rotina sendo editada
let setsExerciseId = null; // exercício aberto no modal de sets
let exerciseLibraryMode = "active"; // 'active' | 'routine'

const EXERCISE_LIBRARY = [
  { id: "supino_reto", name: "Supino Reto com Barra", group: "Peito" },
  { id: "supino_inclinado", name: "Supino Inclinado com Halteres", group: "Peito" },
  { id: "crucifixo_maquina", name: "Crucifixo no Voador", group: "Peito" },
  { id: "flexao", name: "Flexão de Braços", group: "Peito / Tríceps" },
  { id: "agachamento", name: "Agachamento Livre", group: "Pernas" },
  { id: "leg_press", name: "Leg Press 45°", group: "Pernas" },
  { id: "extensora", name: "Cadeira Extensora", group: "Quadríceps" },
  { id: "flexora", name: "Cadeira Flexora", group: "Posterior" },
  { id: "panturrilha", name: "Panturrilha em Pé", group: "Panturrilha" },
  { id: "remada_barra", name: "Remada Curvada com Barra", group: "Costas" },
  { id: "puxada_alta", name: "Puxada Alta", group: "Costas" },
  { id: "remada_baixa", name: "Remada Baixa", group: "Costas" },
  { id: "rosca_direta", name: "Rosca Direta", group: "Bíceps" },
  { id: "rosca_martelo", name: "Rosca Martelo", group: "Bíceps" },
  { id: "triceps_corda", name: "Tríceps Corda", group: "Tríceps" },
  { id: "triceps_testa", name: "Tríceps Testa", group: "Tríceps" },
  { id: "desenvolvimento", name: "Desenvolvimento com Halteres", group: "Ombros" },
  { id: "elevacao_lateral", name: "Elevação Lateral", group: "Ombros" },
];

// ======== HELPERS ========
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showCriticalError(msg) {
  const bar = $("#critical-error-bar");
  bar.textContent = msg;
  bar.classList.remove("hidden");
}

function loadState() {
  try {
    const aw = localStorage.getItem(STORAGE_KEYS.ACTIVE_WORKOUT);
    const rt = localStorage.getItem(STORAGE_KEYS.ROUTINES);
    const fd = localStorage.getItem(STORAGE_KEYS.FEED);
    const pr = localStorage.getItem(STORAGE_KEYS.PRS);

    activeWorkout = aw ? JSON.parse(aw) : null;
    routines = rt ? JSON.parse(rt) : [];
    communityFeed = fd ? JSON.parse(fd) : [];
    personalRecords = pr ? JSON.parse(pr) : [];
  } catch (e) {
    console.error("Erro ao carregar estado:", e);
    showCriticalError("Erro ao ler dados locais (localStorage).");
  }
}

function saveState() {
  try {
    if (activeWorkout) {
      localStorage.setItem(
        STORAGE_KEYS.ACTIVE_WORKOUT,
        JSON.stringify(activeWorkout)
      );
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_WORKOUT);
    }
    localStorage.setItem(STORAGE_KEYS.ROUTINES, JSON.stringify(routines));
    localStorage.setItem(STORAGE_KEYS.FEED, JSON.stringify(communityFeed));
    localStorage.setItem(STORAGE_KEYS.PRS, JSON.stringify(personalRecords));
  } catch (e) {
    console.error("Erro ao salvar estado:", e);
  }
}

function formatTime(dateMs) {
  const d = new Date(dateMs);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function formatDateTime(dateMs) {
  const d = new Date(dateMs);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ======== NAV / RENDER ========
function renderApp() {
  $("#loading-state").classList.add("hidden");
  $("#app-content").classList.remove("hidden");
  renderCurrentView();
  renderFab();
  lucide.createIcons();
}

function renderCurrentView() {
  $$(".tab-btn").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.tab === activeTab)
  );
  $$(".view-content").forEach((sec) => sec.classList.add("hidden"));
  $("#" + activeTab + "-view").classList.remove("hidden");

  if (activeTab === "today") renderTodayView();
  else if (activeTab === "routines") renderRoutinesView();
  else if (activeTab === "feed") renderFeedView();
  else if (activeTab === "profile") renderProfileView();
}

function openTab(tab) {
  activeTab = tab;
  renderCurrentView();
  renderFab();
}

function renderFab() {
  const fab = $("#fab-button");
  const wrapper = $("#fab-container");

  if (activeTab === "today" && activeWorkout) {
    fab.textContent = "FINALIZAR TREINO";
    fab.className = "fab bg-red-600 hover:bg-red-700 text-white";
    fab.onclick = finishWorkout;
    wrapper.classList.remove("hidden");
  } else if (activeTab === "routines") {
    fab.textContent = "CRIAR NOVA ROTINA";
    fab.className = "fab bg-blue-600 hover:bg-blue-700 text-white";
    fab.onclick = () => openRoutineModal();
    wrapper.classList.remove("hidden");
  } else {
    wrapper.classList.add("hidden");
  }
}

// ======== TODAY VIEW ========
function renderTodayView() {
  const cont = $("#today-container");
  if (!activeWorkout) {
    cont.innerHTML = `
      <div class="empty-state mt-10">
        <i data-lucide="dumbbell" class="w-8 h-8 mx-auto mb-3 text-slate-500"></i>
        <p class="mb-1">Não há treino em andamento.</p>
        <p class="text-xs mb-4 text-slate-500">Comece um novo treino adicionando o primeiro exercício.</p>
        <button class="btn-primary" onclick="openLibraryModal('active')">
          <i data-lucide="plus" class="w-4 h-4"></i> Adicionar Exercício
        </button>
      </div>`;
    lucide.createIcons();
    return;
  }

  const startedAtLabel = activeWorkout.startedAt
    ? formatTime(activeWorkout.startedAt)
    : "—";

  const exHtml =
    activeWorkout.exercises && activeWorkout.exercises.length
      ? activeWorkout.exercises
          .map((ex) => {
            const sets = Array.isArray(ex.sets) ? ex.sets.length : 0;
            return `
          <div class="card p-3 mb-2 cursor-pointer hover:bg-slate-900"
               onclick="openSetsModal('${ex.id}')">
            <div class="flex justify-between items-center">
              <div class="flex items-center gap-2">
                <i data-lucide="barbell" class="w-5 h-5 text-yellow-400"></i>
                <div>
                  <p class="text-sm font-semibold">${ex.name}</p>
                  <p class="text-[11px] text-slate-400">${sets} série(s)</p>
                </div>
              </div>
              <i data-lucide="chevron-right" class="w-4 h-4 text-slate-500"></i>
            </div>
          </div>`;
          })
          .join("")
      : `<div class="empty-state mt-3 text-xs">
          Nenhum exercício ainda. Toque em <b>Adicionar Exercício</b> para começar.
        </div>`;

  cont.innerHTML = `
    <div class="card mb-3">
      <div class="card-header">
        <div>
          <div class="card-title text-blue-300">Treino Ativo</div>
          <p class="text-[11px] text-blue-400">Iniciado às ${startedAtLabel}</p>
        </div>
        <button class="text-[11px] text-slate-300 border border-slate-600 rounded-full px-2 py-1"
                onclick="cancelWorkout()" title="Apagar treino atual">
          Cancelar
        </button>
      </div>
    </div>

    <div class="flex justify-between items-center mb-2">
      <p class="text-xs font-semibold text-slate-300 uppercase tracking-wide">Exercícios</p>
      <button class="btn-primary text-[11px] px-2 py-1" onclick="openLibraryModal('active')">
        <i data-lucide="plus" class="w-3 h-3"></i> Exercício
      </button>
    </div>

    <div>${exHtml}</div>`;
  lucide.createIcons();
}

function startWorkoutIfNeeded() {
  if (!activeWorkout) {
    activeWorkout = {
      id: "w_" + Date.now(),
      name: "Treino de " + new Date().toLocaleDateString("pt-BR"),
      startedAt: Date.now(),
      exercises: [],
    };
  }
}

function cancelWorkout() {
  if (confirm("Cancelar e apagar o treino atual?")) {
    activeWorkout = null;
    saveState();
    renderApp();
  }
}

function finishWorkout() {
  if (!activeWorkout || !activeWorkout.exercises.length) {
    alert("Adicione pelo menos um exercício e uma série antes de finalizar.");
    return;
  }

  const workout = {
    ...activeWorkout,
    finishedAt: Date.now(),
  };

  // Atualiza PRs
  for (const ex of workout.exercises) {
    if (!Array.isArray(ex.sets)) continue;
    const maxWeight = ex.sets.reduce(
      (m, s) => (s.weight > m ? s.weight : m),
      0
    );
    if (!maxWeight) continue;

    const existing = personalRecords.find((p) => p.exerciseId === ex.id);
    const pr = {
      exerciseId: ex.id,
      exerciseName: ex.name,
      maxWeight,
      date: workout.finishedAt,
    };
    if (existing) {
      const idx = personalRecords.findIndex((p) => p.exerciseId === ex.id);
      personalRecords[idx] = pr;
    } else {
      personalRecords.push(pr);
    }
  }

  communityFeed.unshift(workout);
  if (communityFeed.length > 20) communityFeed.pop();

  activeWorkout = null;
  saveState();
  alert("Treino finalizado!");
  openTab("feed");
  renderApp();
}

// ======== EXERCISE LIBRARY / ACTIVE WORKOUT ========
// >>> CORRIGIDO para esconder/mostrar o modal de rotina corretamente
function openLibraryModal(mode) {
  exerciseLibraryMode = mode || "active"; // 'active' ou 'routine'

  const libraryModal = $("#exercise-library-modal");
  const routineModal = $("#routine-modal");

  // se vier da rotina, esconde o modal de rotina enquanto a biblioteca está aberta
  if (exerciseLibraryMode === "routine" && routineModal) {
    routineModal.classList.remove("show");
  }

  libraryModal.classList.add("show");
  renderExerciseList(EXERCISE_LIBRARY);
  const search = $("#exercise-search");
  if (search) search.value = "";
  lucide.createIcons();
}

// >>> CORRIGIDO para reabrir a rotina quando fechar a biblioteca (se for o caso)
function closeModal(id) {
  const modal = $("#" + id);
  if (!modal) return;

  modal.classList.remove("show");

  // se fechou a biblioteca e ela estava em modo "routine", volta com o modal de rotina
  if (id === "exercise-library-modal" && exerciseLibraryMode === "routine") {
    const routineModal = $("#routine-modal");
    if (routineModal) {
      routineModal.classList.add("show");
    }
  }
}

function renderExerciseList(listData) {
  const list = $("#exercise-list");
  if (!listData.length) {
    list.innerHTML =
      '<p class="text-[11px] text-slate-500">Nenhum exercício encontrado.</p>';
    return;
  }
  list.innerHTML = listData
    .map(
      (ex) => `
    <button class="w-full text-left text-xs px-3 py-2 rounded-lg bg-slate-900/70 hover:bg-slate-800 flex justify-between items-center"
            onclick="selectExerciseFromLibrary('${ex.id}')">
      <div>
        <p class="font-semibold text-slate-100">${ex.name}</p>
        <p class="text-[10px] text-slate-400">${ex.group}</p>
      </div>
      <i data-lucide="plus" class="w-4 h-4 text-blue-400"></i>
    </button>`
    )
    .join("");
}

function selectExerciseFromLibrary(exId) {
  const exBase = EXERCISE_LIBRARY.find((e) => e.id === exId);
  if (!exBase) return;

  if (exerciseLibraryMode === "active") {
    startWorkoutIfNeeded();
    if (activeWorkout.exercises.find((e) => e.id === exBase.id)) {
      alert("Esse exercício já está no treino.");
    } else {
      activeWorkout.exercises.push({
        id: exBase.id,
        name: exBase.name,
        sets: [],
      });
      saveState();
    }
    closeModal("exercise-library-modal");
    renderApp();
    openSetsModal(exBase.id);
  } else if (exerciseLibraryMode === "routine" && currentRoutine) {
    if (currentRoutine.exercises.find((e) => e.id === exBase.id)) {
      alert("Esse exercício já está na rotina.");
    } else {
      currentRoutine.exercises.push({
        id: exBase.id,
        name: exBase.name,
      });
      renderRoutineModalContent();
    }
    closeModal("exercise-library-modal");
  }
}

function handleExerciseSearch(e) {
  const term = e.target.value.toLowerCase().trim();
  const filtered = EXERCISE_LIBRARY.filter(
    (ex) =>
      ex.name.toLowerCase().includes(term) ||
      ex.group.toLowerCase().includes(term)
  );
  renderExerciseList(filtered);
  lucide.createIcons();
}

// ======== SETS MODAL ========
function openSetsModal(exerciseId) {
  if (!activeWorkout) return;
  const ex = activeWorkout.exercises.find((e) => e.id === exerciseId);
  if (!ex) return;

  setsExerciseId = exerciseId;
  $("#sets-modal-title").textContent = ex.name;
  $("#sets-exercise-info").textContent =
    "Registre peso e repetições para cada série.";
  $("#set-weight-input").value = ex.sets?.[ex.sets.length - 1]?.weight || 10;
  $("#set-reps-input").value = ex.sets?.[ex.sets.length - 1]?.reps || 10;

  renderSetsTable(ex);
  $("#sets-modal").classList.add("show");
  lucide.createIcons();
}

function renderSetsTable(ex) {
  const cont = $("#sets-table");
  const sets = Array.isArray(ex.sets) ? ex.sets : [];
  if (!sets.length) {
    cont.innerHTML =
      '<p class="text-[11px] text-slate-500">Nenhuma série registrada ainda.</p>';
    return;
  }
  cont.innerHTML = sets
    .map(
      (s, idx) => `
    <div class="flex justify-between items-center px-2 py-1 rounded-md bg-slate-900/70 mb-1">
      <span class="text-[11px] text-slate-400">Série ${idx + 1}</span>
      <span class="text-[11px] text-slate-200 font-semibold">${s.weight} kg x ${s.reps} reps</span>
    </div>`
    )
    .join("");
}

function addSetToCurrentExercise() {
  if (!activeWorkout || !setsExerciseId) return;
  const ex = activeWorkout.exercises.find((e) => e.id === setsExerciseId);
  if (!ex) return;

  const weight = parseFloat($("#set-weight-input").value) || 0;
  const reps = parseInt($("#set-reps-input").value) || 0;
  if (!weight || !reps) {
    alert("Informe peso e repetições válidos.");
    return;
  }

  ex.sets = ex.sets || [];
  ex.sets.push({ weight, reps, ts: Date.now() });
  saveState();
  renderSetsTable(ex);
  renderTodayView();
}

// ======== ROUTINES ========
function renderRoutinesView() {
  const cont = $("#routines-container");
  if (!routines.length) {
    cont.innerHTML = `
      <div class="empty-state mt-8">
        <i data-lucide="clipboard-list" class="w-8 h-8 mx-auto mb-3 text-slate-500"></i>
        <p class="mb-1">Você ainda não tem rotinas salvas.</p>
        <p class="text-[11px] text-slate-500">Use o botão abaixo para criar a primeira.</p>
      </div>`;
    lucide.createIcons();
    return;
  }

  cont.innerHTML = routines
    .map(
      (r) => `
    <div class="card p-3 mb-2">
      <div class="flex justify-between items-start mb-1">
        <div>
          <p class="text-sm font-semibold">${r.name}</p>
          <p class="text-[11px] text-slate-400">${r.exercises.length} exercício(s)</p>
        </div>
        <button class="text-[11px] text-slate-300 underline"
                onclick="openRoutineModal('${r.id}')">
          Editar
        </button>
      </div>
      <p class="text-[11px] text-slate-400 mb-2">
        ${r.exercises.map((e) => e.name).join(", ") || "Sem exercícios"}
      </p>
      <button class="btn-primary w-full text-[11px]"
              onclick="startWorkoutFromRoutine('${r.id}')">
        Iniciar Treino com esta Rotina
      </button>
    </div>`
    )
    .join("");
  lucide.createIcons();
}

function openRoutineModal(routineId) {
  if (routineId) {
    currentRoutine = routines.find((r) => r.id === routineId);
    if (!currentRoutine) return;
    $("#routine-modal-title").textContent = "Editar Rotina";
    $("#delete-routine-btn").classList.remove("hidden");
  } else {
    currentRoutine = { id: "r_" + Date.now(), name: "", exercises: [] };
    $("#routine-modal-title").textContent = "Nova Rotina";
    $("#delete-routine-btn").classList.add("hidden");
  }

  $("#routine-name-input").value = currentRoutine.name || "";
  renderRoutineModalContent();
  $("#routine-modal").classList.add("show");
  lucide.createIcons();
}

function renderRoutineModalContent() {
  const list = $("#routine-exercises-list");
  if (!currentRoutine || !currentRoutine.exercises.length) {
    list.innerHTML =
      '<p class="text-[11px] text-slate-500">Nenhum exercício ainda.</p>';
    return;
  }
  list.innerHTML = currentRoutine.exercises
    .map(
      (ex) => `
    <div class="flex justify-between items-center px-2 py-1 rounded-md bg-slate-900/70 mb-1">
      <span class="text-[11px] text-slate-200">${ex.name}</span>
      <button class="text-[11px] text-red-400"
              onclick="removeExerciseFromRoutine('${ex.id}')">
        Remover
      </button>
    </div>`
    )
    .join("");
}

function removeExerciseFromRoutine(exId) {
  if (!currentRoutine) return;
  currentRoutine.exercises = currentRoutine.exercises.filter(
    (e) => e.id !== exId
  );
  renderRoutineModalContent();
}

function saveRoutine() {
  if (!currentRoutine) return;
  const name = $("#routine-name-input").value.trim();
  if (name.length < 3) {
    alert("O nome da rotina deve ter pelo menos 3 caracteres.");
    return;
  }
  currentRoutine.name = name;

  const existingIdx = routines.findIndex((r) => r.id === currentRoutine.id);
  if (existingIdx >= 0) routines[existingIdx] = currentRoutine;
  else routines.push(currentRoutine);

  saveState();
  closeModal("routine-modal");
  renderRoutinesView();
}

function deleteRoutine() {
  if (!currentRoutine) return;
  if (!confirm("Deseja apagar esta rotina?")) return;
  routines = routines.filter((r) => r.id !== currentRoutine.id);
  currentRoutine = null;
  saveState();
  closeModal("routine-modal");
  renderRoutinesView();
}

function startWorkoutFromRoutine(routineId) {
  const r = routines.find((rt) => rt.id === routineId);
  if (!r) return;
  activeWorkout = {
    id: "w_" + Date.now(),
    name: r.name,
    startedAt: Date.now(),
    exercises: r.exercises.map((ex) => ({
      id: ex.id,
      name: ex.name,
      sets: [],
    })),
  };
  saveState();
  openTab("today");
  renderApp();
}

// ======== FEED ========
function renderFeedView() {
  const cont = $("#feed-container");
  if (!communityFeed.length) {
    cont.innerHTML = `
      <div class="empty-state mt-8">
        <i data-lucide="activity" class="w-8 h-8 mx-auto mb-3 text-slate-500"></i>
        <p class="mb-1">Ainda não há treinos finalizados.</p>
        <p class="text-[11px] text-slate-500">
          Finalize um treino na aba <b>Rastrear</b> para vê-lo aqui.
        </p>
      </div>`;
    lucide.createIcons();
    return;
  }

  cont.innerHTML = communityFeed
    .map((w) => {
      const dateLabel = w.finishedAt
        ? formatDateTime(w.finishedAt)
        : "Data desconhecida";
      const exSummary = (w.exercises || [])
        .map(
          (ex) =>
            `${ex.name} (${Array.isArray(ex.sets) ? ex.sets.length : 0} sets)`
        )
        .join(", ");
      return `
      <div class="card p-3 mb-2">
        <div class="flex justify-between items-center mb-1">
          <p class="text-[11px] text-slate-400">${dateLabel}</p>
          <span class="text-[10px] px-2 py-[2px] rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
            Finalizado
          </span>
        </div>
        <p class="text-sm font-semibold mb-1">${w.name}</p>
        <p class="text-[11px] text-slate-400">${exSummary || "Sem exercícios"}</p>
      </div>`;
    })
    .join("");
  lucide.createIcons();
}

// ======== PROFILE ========
function renderProfileView() {
  const cont = $("#profile-container");
  const totalWorkouts = communityFeed.length;
  const totalSets = communityFeed.reduce((acc, w) => {
    return (
      acc +
      (w.exercises || []).reduce(
        (a, ex) => a + (Array.isArray(ex.sets) ? ex.sets.length : 0),
        0
      )
    );
  }, 0);

  cont.innerHTML = `
    <div class="card p-3 mb-3">
      <p class="text-xs font-semibold text-slate-300 mb-2">Estatísticas Gerais</p>
      <div class="grid grid-cols-2 gap-3 text-[11px]">
        <div>
          <p class="text-slate-400">Treinos finalizados</p>
          <p class="text-lg font-semibold text-slate-100">${totalWorkouts}</p>
        </div>
        <div>
          <p class="text-slate-400">Total de séries</p>
          <p class="text-lg font-semibold text-slate-100">${totalSets}</p>
        </div>
      </div>
    </div>

    <div class="card p-3">
      <p class="text-xs font-semibold text-slate-300 mb-2">Recordes Pessoais (PR)</p>
      ${
        personalRecords.length
          ? personalRecords
              .map(
                (pr) => `
        <div class="flex justify-between items-center px-2 py-1 rounded-md bg-slate-900/70 mb-1">
          <span class="text-[11px] text-slate-200">${pr.exerciseName}</span>
          <span class="text-[11px] text-emerald-300 font-semibold">${pr.maxWeight} kg</span>
        </div>`
              )
              .join("")
          : '<p class="text-[11px] text-slate-500">Finalize treinos com séries para ver PRs aqui.</p>'
      }
    </div>`;
  lucide.createIcons();
}

// ======== INIT ========
window.addEventListener("DOMContentLoaded", () => {
  // Tabs
  $$(".tab-btn").forEach((btn) =>
    btn.addEventListener("click", () => openTab(btn.dataset.tab))
  );

  const searchInput = $("#exercise-search");
  if (searchInput) {
    searchInput.addEventListener("input", handleExerciseSearch);
  }

  const addSetBtn = $("#add-set-btn");
  if (addSetBtn) {
    addSetBtn.addEventListener("click", addSetToCurrentExercise);
  }

  const saveRoutineBtn = $("#save-routine-btn");
  if (saveRoutineBtn) saveRoutineBtn.addEventListener("click", saveRoutine);

  const deleteRoutineBtn = $("#delete-routine-btn");
  if (deleteRoutineBtn) deleteRoutineBtn.addEventListener("click", deleteRoutine);

  loadState();
  renderApp();
});

// Expor funções usadas em onclick no HTML
window.openTab = openTab;
window.openLibraryModal = openLibraryModal;
window.closeModal = closeModal;
window.openSetsModal = openSetsModal;
window.openRoutineModal = openRoutineModal;
window.removeExerciseFromRoutine = removeExerciseFromRoutine;
window.saveRoutine = saveRoutine;
window.deleteRoutine = deleteRoutine;
window.startWorkoutFromRoutine = startWorkoutFromRoutine;
