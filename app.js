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
let setsExerciseId = null; // exercício aberto no modal de sets (modo clássico)
let exerciseLibraryMode = "active"; // 'active' | 'routine'
let restTimerId = null;

// ======== HELPERS ========
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showCriticalError(msg) {
  const bar = $("#critical-error-bar");
  if (!bar) return;
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

function formatSeconds(total) {
  const t = Math.max(0, total | 0);
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getExerciseMeta(exId) {
  return EXERCISE_LIBRARY.find((e) => e.id === exId) || null;
}

// ======== NAV / RENDER ========
function renderApp() {
  $("#loading-state").classList.add("hidden");
  $("#app-content").classList.remove("hidden");
  renderCurrentView();
  renderFab();
  if (window.lucide) lucide.createIcons();
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

// ======== TODAY VIEW (RASTREAR) ========

function renderTodayView() {
  const cont = $("#today-container");

  if (!activeWorkout) {
    cont.innerHTML = `
      <div class="empty-state mt-10">
        <i data-lucide="dumbbell" class="w-8 h-8 mx-auto mb-3 text-slate-500"></i>
        <p class="mb-1">Não há treino em andamento.</p>
        <p class="text-xs mb-4 text-slate-500">Comece um novo treino iniciando uma rotina ou adicionando o primeiro exercício.</p>
        <button class="btn-primary" onclick="openLibraryModal('active')">
          <i data-lucide="plus" class="w-4 h-4"></i> Adicionar Exercício
        </button>
      </div>`;
    if (window.lucide) lucide.createIcons();
    return;
  }

  if (activeWorkout.mode === "guided") {
    renderGuidedWorkoutView(cont);
  } else {
    renderClassicTodayView(cont);
  }
}

// --- modo clássico (lista de exercícios, como antes) ---
function renderClassicTodayView(cont) {
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
  if (window.lucide) lucide.createIcons();
}

// --- modo guiado (uma série por vez + descanso) ---

function getCurrentGuidedExercise() {
  if (!activeWorkout) return null;
  const idx = activeWorkout.currentExerciseIndex || 0;
  return activeWorkout.exercises?.[idx] || null;
}

function getCurrentGuidedSet() {
  const ex = getCurrentGuidedExercise();
  if (!ex || !Array.isArray(ex.sets) || !ex.sets.length) return null;
  const sIdx = activeWorkout.currentSetIndex || 0;
  return ex.sets[sIdx] || null;
}

function renderGuidedWorkoutView(cont) {
  const ex = getCurrentGuidedExercise();
  const totalExercises = activeWorkout.exercises?.length || 0;

  // Sem exercícios na rotina
  if (!ex) {
    cont.innerHTML = `
      <div class="empty-state mt-10">
        <p class="mb-1">Nenhum exercício nesta rotina.</p>
        <p class="text-xs mb-4 text-slate-500">Edite a rotina para adicionar exercícios.</p>
      </div>`;
    return;
  }

  if (activeWorkout.resting) {
    renderRestView(cont);
    return;
  }

  const set = getCurrentGuidedSet();
  if (!set) {
    cont.innerHTML = `
      <div class="empty-state mt-10">
        <p class="mb-1">Este exercício não possui séries configuradas.</p>
        <p class="text-xs mb-4 text-slate-500">Edite a rotina para ajustar as séries.</p>
      </div>`;
    return;
  }

  const exIndex = activeWorkout.currentExerciseIndex || 0;
  const setIndex = activeWorkout.currentSetIndex || 0;
  const groupLabel = ex.group || getExerciseMeta(ex.id)?.group || "";

  const restLabel =
    set.restSeconds && set.restSeconds > 0
      ? `Descanso após esta série: ${formatSeconds(set.restSeconds)}`
      : "Sem descanso configurado para esta série.";

  cont.innerHTML = `
    <div class="card mb-3 p-3">
      <div class="flex justify-between items-center mb-1">
        <div>
          <p class="text-[11px] text-blue-300 uppercase tracking-wide">Treino guiado</p>
          <p class="text-sm font-semibold text-slate-100">${activeWorkout.name || "Treino"}</p>
        </div>
        <button class="text-[11px] text-slate-300 border border-slate-600 rounded-full px-2 py-1"
                onclick="cancelWorkout()">
          Encerrar
        </button>
      </div>
      <p class="text-[11px] text-slate-400">
        Exercício ${exIndex + 1} de ${totalExercises}
      </p>
    </div>

    <div class="card mb-3 p-4 space-y-2">
      <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Exercício atual</p>
      <p class="text-base font-semibold text-slate-100">${ex.name}</p>
      ${
        groupLabel
          ? `<p class="text-[11px] text-slate-400">${groupLabel}</p>`
          : ""
      }
    </div>

    <div class="card p-4 space-y-3">
      <div class="flex justify-between items-center mb-1">
        <p class="text-xs font-semibold text-slate-300">
          Série ${setIndex + 1} de ${ex.sets.length}
        </p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <p class="text-[11px] text-slate-400 mb-1">Carga (kg)</p>
          <input
            id="guided-weight-input"
            type="number"
            min="0"
            class="input-dark"
            value="${set.weight ?? 10}"
          />
        </div>
        <div>
          <p class="text-[11px] text-slate-400 mb-1">Reps</p>
          <input
            id="guided-reps-input"
            type="number"
            min="1"
            class="input-dark"
            value="${set.reps ?? 10}"
          />
        </div>
      </div>

      <p class="text-[11px] text-slate-500 mt-1">${restLabel}</p>

      <button class="btn-primary w-full mt-2" onclick="completeGuidedSeries()">
        Concluir série
      </button>

      <button class="w-full text-[11px] text-slate-400 mt-2 underline"
              onclick="skipCurrentExercise()">
        Pular exercício (volta nele antes de finalizar)
      </button>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

function renderRestView(cont) {
  const ex = getCurrentGuidedExercise();
  const set = getCurrentGuidedSet();
  if (!ex || !set) {
    activeWorkout.resting = false;
    activeWorkout.restRemaining = 0;
    saveState();
    renderGuidedWorkoutView(cont);
    return;
  }

  const remaining = activeWorkout.restRemaining ?? set.restSeconds ?? 0;

  // Próximo passo (próxima série ou próximo exercício)
  const [nextLabel, nextDetails] = getNextStepPreview();

  cont.innerHTML = `
    <div class="card mb-3 p-3">
      <div class="flex justify-between items-center mb-1">
        <div>
          <p class="text-[11px] text-blue-300 uppercase tracking-wide">Descanso</p>
          <p class="text-sm font-semibold text-slate-100">${ex.name}</p>
        </div>
        <button class="text-[11px] text-slate-300 border border-slate-600 rounded-full px-2 py-1"
                onclick="cancelWorkout()">
          Encerrar
        </button>
      </div>
    </div>

    <div class="card p-4 space-y-4">
      <div class="flex flex-col items-center">
        <p class="text-xs text-slate-400 mb-1">Tempo de descanso</p>
        <p id="rest-timer-display" class="text-3xl font-semibold text-slate-100">
          ${formatSeconds(remaining)}
        </p>
      </div>

      <div class="flex items-center justify-center gap-4">
        <button class="px-3 py-2 rounded-full border border-slate-600 text-xs"
                onclick="adjustRest(-15)">
          -15s
        </button>
        <button class="px-3 py-2 rounded-full border border-slate-600 text-xs"
                onclick="adjustRest(15)">
          +15s
        </button>
      </div>

      <button class="btn-primary w-full" onclick="skipRest()">
        Pular descanso
      </button>

      <div class="mt-3 p-3 rounded-lg bg-slate-900/70 border border-slate-700/70 text-[11px]">
        <p class="text-slate-400 mb-1">${nextLabel}</p>
        <p class="text-slate-200">${nextDetails}</p>
      </div>

      <button class="w-full text-[11px] text-slate-400 mt-2 underline"
              onclick="skipCurrentExercise()">
        Pular exercício atual
      </button>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

function getNextStepPreview() {
  const ex = getCurrentGuidedExercise();
  const set = getCurrentGuidedSet();
  if (!activeWorkout || !ex || !set) return ["Próxima etapa", "Indisponível."];

  const exIdx = activeWorkout.currentExerciseIndex || 0;
  const setIdx = activeWorkout.currentSetIndex || 0;

  // próxima série dentro do mesmo exercício
  if (setIdx + 1 < ex.sets.length) {
    const nextSet = ex.sets[setIdx + 1];
    return [
      "Próxima série neste exercício",
      `Série ${setIdx + 2} de ${ex.sets.length} — ${nextSet.weight || 0} kg x ${
        nextSet.reps || 0
      } reps`,
    ];
  }

  // senão, próximo exercício
  const nextExIdx = findNextExerciseIndex(true); // inclui pulados
  if (nextExIdx !== -1 && nextExIdx !== exIdx) {
    const nextEx = activeWorkout.exercises[nextExIdx];
    return [
      "Próximo exercício",
      `${nextEx.name} — ${
        nextEx.sets?.length || 0
      } série(s) configuradas.`,
    ];
  }

  return ["Quase lá", "Essa é a última série do treino."];
}

function completeGuidedSeries() {
  if (!activeWorkout || activeWorkout.mode !== "guided") return;
  const ex = getCurrentGuidedExercise();
  const set = getCurrentGuidedSet();
  if (!ex || !set) return;

  const weightInput = $("#guided-weight-input");
  const repsInput = $("#guided-reps-input");

  const weight = parseFloat(weightInput?.value) || 0;
  const reps = parseInt(repsInput?.value) || 0;

  if (!weight || !reps) {
    alert("Informe carga e repetições válidas.");
    return;
  }

  set.weight = weight;
  set.reps = reps;
  set.done = true;

  saveState();

  const restSeconds = set.restSeconds || 0;
  if (restSeconds > 0) {
    startRest(restSeconds);
  } else {
    advanceAfterSeriesOrRest();
  }
}

function startRest(seconds) {
  if (!activeWorkout || activeWorkout.mode !== "guided") return;

  if (restTimerId) {
    clearInterval(restTimerId);
    restTimerId = null;
  }

  activeWorkout.resting = true;
  activeWorkout.restRemaining = Math.max(0, Math.round(seconds));
  saveState();

  renderTodayView(); // desenha tela de descanso

  restTimerId = setInterval(() => {
    if (!activeWorkout || activeWorkout.mode !== "guided" || !activeWorkout.resting) {
      clearInterval(restTimerId);
      restTimerId = null;
      return;
    }

    activeWorkout.restRemaining = Math.max(
      0,
      (activeWorkout.restRemaining || 0) - 1
    );

    const display = $("#rest-timer-display");
    if (display) {
      display.textContent = formatSeconds(activeWorkout.restRemaining);
    }

    if (activeWorkout.restRemaining <= 0) {
      clearInterval(restTimerId);
      restTimerId = null;
      activeWorkout.resting = false;
      activeWorkout.restRemaining = 0;
      saveState();
      advanceAfterSeriesOrRest();
    }
  }, 1000);
}

function adjustRest(delta) {
  if (!activeWorkout || activeWorkout.mode !== "guided" || !activeWorkout.resting) return;
  activeWorkout.restRemaining = Math.max(
    0,
    (activeWorkout.restRemaining || 0) + delta
  );
  const display = $("#rest-timer-display");
  if (display) {
    display.textContent = formatSeconds(activeWorkout.restRemaining);
  }
}

function skipRest() {
  if (!activeWorkout || activeWorkout.mode !== "guided") return;
  if (restTimerId) {
    clearInterval(restTimerId);
    restTimerId = null;
  }
  activeWorkout.resting = false;
  activeWorkout.restRemaining = 0;
  saveState();
  advanceAfterSeriesOrRest();
}

function findNextExerciseIndex(includeSkipped = false) {
  if (!activeWorkout || !Array.isArray(activeWorkout.exercises)) return -1;
  const list = activeWorkout.exercises;
  const len = list.length;
  const current = activeWorkout.currentExerciseIndex || 0;

  // primeiro: não concluídos e não pulados
  for (let i = current + 1; i < len; i++) {
    const e = list[i];
    if (!e.completed && (!e.skipped || includeSkipped)) return i;
  }
  for (let i = 0; i <= current; i++) {
    const e = list[i];
    if (!e.completed && (!e.skipped || includeSkipped)) return i;
  }
  return -1;
}

function advanceAfterSeriesOrRest() {
  if (!activeWorkout || activeWorkout.mode !== "guided") return;

  const ex = getCurrentGuidedExercise();
  if (!ex) {
    renderTodayView();
    return;
  }

  const setIdx = activeWorkout.currentSetIndex || 0;

  // ainda tem série dentro do exercício
  if (setIdx + 1 < ex.sets.length) {
    activeWorkout.currentSetIndex = setIdx + 1;
    activeWorkout.resting = false;
    activeWorkout.restRemaining = 0;
    saveState();
    renderTodayView();
    return;
  }

  // acabou as séries desse exercício
  ex.completed = true;
  activeWorkout.currentSetIndex = 0;
  activeWorkout.resting = false;
  activeWorkout.restRemaining = 0;

  const nextIdx = findNextExerciseIndex(false);
  if (nextIdx === -1) {
    // não há mais exercícios não pulados; tenta os pulados
    const skippedIdx = findNextExerciseIndex(true);
    if (skippedIdx === -1) {
      // tudo concluído de verdade
      saveState();
      const cont = $("#today-container");
      cont.innerHTML = `
        <div class="card p-4 space-y-3 mt-6">
          <p class="text-sm font-semibold text-slate-100 mb-1">
            Todos os exercícios desta rotina foram concluídos.
          </p>
          <p class="text-[11px] text-slate-400 mb-3">
            Toque em <b>FINALIZAR TREINO</b> abaixo para registrar no histórico.
          </p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    } else {
      activeWorkout.currentExerciseIndex = skippedIdx;
      activeWorkout.currentSetIndex = 0;
      activeWorkout.exercises[skippedIdx].skipped = false;
    }
  } else {
    activeWorkout.currentExerciseIndex = nextIdx;
    activeWorkout.currentSetIndex = 0;
  }

  saveState();
  renderTodayView();
}

function skipCurrentExercise() {
  if (!activeWorkout || activeWorkout.mode !== "guided") return;
  const ex = getCurrentGuidedExercise();
  if (!ex) return;

  ex.skipped = true;
  ex.completed = false;

  const nextIdx = findNextExerciseIndex(false);
  if (nextIdx === -1) {
    // não tem mais ninguém não pulado; apenas mostra mensagem
    saveState();
    renderTodayView();
    return;
  }

  activeWorkout.currentExerciseIndex = nextIdx;
  activeWorkout.currentSetIndex = 0;
  activeWorkout.resting = false;
  activeWorkout.restRemaining = 0;
  saveState();
  renderTodayView();
}

// ======== CONTROLE DO TREINO (GERAL) ========

function startWorkoutIfNeeded() {
  if (!activeWorkout) {
    activeWorkout = {
      id: "w_" + Date.now(),
      name: "Treino de " + new Date().toLocaleDateString("pt-BR"),
      startedAt: Date.now(),
      mode: "classic",
      exercises: [],
    };
  }
}

function cancelWorkout() {
  if (!confirm("Cancelar e apagar o treino atual?")) return;

  if (restTimerId) {
    clearInterval(restTimerId);
    restTimerId = null;
  }

  activeWorkout = null;
  saveState();
  renderApp();
}

function finishWorkout() {
  if (!activeWorkout) return;

  const hasSets =
    Array.isArray(activeWorkout.exercises) &&
    activeWorkout.exercises.some(
      (ex) => Array.isArray(ex.sets) && ex.sets.length
    );

  if (!hasSets) {
    alert("Adicione pelo menos um exercício e uma série antes de finalizar.");
    return;
  }

  const workout = {
    ...activeWorkout,
    finishedAt: Date.now(),
  };

  // Atualiza PRs
  for (const ex of workout.exercises || []) {
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

  if (restTimerId) {
    clearInterval(restTimerId);
    restTimerId = null;
  }

  activeWorkout = null;
  saveState();
  alert("Treino finalizado!");
  openTab("feed");
  renderApp();
}

// ======== BIBLIOTECA DE EXERCÍCIOS / TREINO ATIVO ========

function openLibraryModal(mode) {
  exerciseLibraryMode = mode || "active"; // 'active' ou 'routine'

  const libraryModal = $("#exercise-library-modal");
  const routineModal = $("#routine-modal");

  if (exerciseLibraryMode === "routine" && routineModal) {
    routineModal.classList.remove("show");
  }

  libraryModal.classList.add("show");
  renderExerciseList(EXERCISE_LIBRARY);
  const search = $("#exercise-search");
  if (search) search.value = "";
  if (window.lucide) lucide.createIcons();
}

function closeModal(id) {
  const modal = $("#" + id);
  if (!modal) return;

  modal.classList.remove("show");

  if (id === "exercise-library-modal" && exerciseLibraryMode === "routine") {
    const routineModal = $("#routine-modal");
    if (routineModal) {
      routineModal.classList.add("show");
    }
  }
}

function renderExerciseList(listData) {
  const list = $("#exercise-list");
  if (!list) return;

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
    // modo clássico
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
  if (window.lucide) lucide.createIcons();
}

// ======== SETS MODAL (MODO CLÁSSICO) ========

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
  if (window.lucide) lucide.createIcons();
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
      <span class="text-[11px] text-slate-200 font-semibold">${s.weight} kg x ${
        s.reps
      } reps</span>
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
  renderClassicTodayView($("#today-container"));
}

// ======== ROTINAS ========

function renderRoutinesView() {
  const cont = $("#routines-container");
  if (!routines.length) {
    cont.innerHTML = `
      <div class="empty-state mt-8">
        <i data-lucide="clipboard-list" class="w-8 h-8 mx-auto mb-3 text-slate-500"></i>
        <p class="mb-1">Você ainda não tem rotinas salvas.</p>
        <p class="text-[11px] text-slate-500">Use o botão flutuante para criar a primeira.</p>
      </div>`;
    if (window.lucide) lucide.createIcons();
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
  if (window.lucide) lucide.createIcons();
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
  if (window.lucide) lucide.createIcons();
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

  const exercises = (r.exercises || []).map((ex) => {
    const meta = getExerciseMeta(ex.id) || {};
    return {
      id: ex.id,
      name: ex.name || meta.name || "Exercício",
      group: meta.group || "",
      // por enquanto: 1 série padrão por exercício (pode ajustar na hora)
      sets: [
        {
          weight: 10,
          reps: 10,
          restSeconds: 60,
          done: false,
        },
      ],
      completed: false,
      skipped: false,
    };
  });

  activeWorkout = {
    id: "w_" + Date.now(),
    name: r.name || "Treino",
    startedAt: Date.now(),
    mode: "guided",
    currentExerciseIndex: 0,
    currentSetIndex: 0,
    resting: false,
    restRemaining: 0,
    exercises,
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
    if (window.lucide) lucide.createIcons();
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
  if (window.lucide) lucide.createIcons();
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

  const prsHtml = personalRecords.length
    ? personalRecords
        .map(
          (pr) => `
        <div class="flex justify-between items-center px-2 py-1 rounded-md bg-slate-900/70 mb-1">
          <span class="text-[11px] text-slate-200">${pr.exerciseName}</span>
          <span class="text-[11px] text-emerald-300 font-semibold">${pr.maxWeight} kg</span>
        </div>`
        )
        .join("")
    : '<p class="text-[11px] text-slate-500">Finalize treinos com séries para ver PRs aqui.</p>';

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

    <div class="card p-3 mb-3">
      <p class="text-xs font-semibold text-slate-300 mb-2">Recordes Pessoais (PR)</p>
      ${prsHtml}
    </div>

    <div class="card p-3">
      <p class="text-xs font-semibold text-slate-300 mb-2">Ferramentas</p>
      <button class="w-full text-[11px] text-red-300 border border-red-500/60 rounded-full px-3 py-2"
              onclick="clearAllData()">
        Limpar todos os dados locais
      </button>
      <p class="text-[10px] text-slate-500 mt-1">
        Apaga treinos, rotinas e recordes deste dispositivo.
      </p>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

function clearAllData() {
  if (!confirm("Apagar todos os dados locais do app neste dispositivo?")) return;
  try {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_WORKOUT);
    localStorage.removeItem(STORAGE_KEYS.ROUTINES);
    localStorage.removeItem(STORAGE_KEYS.FEED);
    localStorage.removeItem(STORAGE_KEYS.PRS);
  } catch (e) {
    console.error(e);
  }
  if (restTimerId) {
    clearInterval(restTimerId);
    restTimerId = null;
  }
  activeWorkout = null;
  routines = [];
  communityFeed = [];
  personalRecords = [];
  currentRoutine = null;
  setsExerciseId = null;

  alert("Dados apagados. O app será recarregado.");
  location.reload();
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
  if (deleteRoutineBtn)
    deleteRoutineBtn.addEventListener("click", deleteRoutine);

  loadState();
  renderApp();

  // Se o app foi recarregado no meio de um descanso guiado, retoma o timer
  if (
    activeWorkout &&
    activeWorkout.mode === "guided" &&
    activeWorkout.resting &&
    activeWorkout.restRemaining > 0
  ) {
    startRest(activeWorkout.restRemaining);
  }
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
window.completeGuidedSeries = completeGuidedSeries;
window.adjustRest = adjustRest;
window.skipRest = skipRest;
window.skipCurrentExercise = skipCurrentExercise;
window.clearAllData = clearAllData;
