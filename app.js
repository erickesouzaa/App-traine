// app.js (module)
// Requer: <script type="module" src="app.js"></script> no index.html

import { EXERCISE_LIBRARY } from './exercises.js';

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
let editingRoutineExercise = null; // exercício sendo editado na criação de rotina
let setsEditorIndex = null; // índice de série editando no modal
let setsExerciseId = null; // exercício aberto no modal de sets (treino)
let exerciseLibraryMode = "active"; // 'active' | 'routine'

// Timer / execução de treino
let restTimerInterval = null;
let restTimeRemaining = 0;
let currentExerciseIndex = 0;
let currentSeriesIndex = 0;
let skippedExercises = []; // array de índices pulados
let audioCtx = null;

// ======== HELPERS ========
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showCriticalError(msg) {
  const bar = $("#critical-error-bar");
  if (bar) {
    bar.textContent = msg;
    bar.classList.remove("hidden");
  } else {
    console.error(msg);
  }
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

// ---- beep simples para notificação (usa WebAudio)
function beep() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.05;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
    }, 180);
  } catch (e) {
    // Silencioso se não suportado
  }
}

// ======== NAV / RENDER ========
function renderApp() {
  const loading = $("#loading-state");
  if (loading) loading.classList.add("hidden");
  const app = $("#app-content");
  if (app) app.classList.remove("hidden");

  renderCurrentView();
  renderFab();
  if (window.lucide) window.lucide.createIcons && window.lucide.createIcons();
}

function renderCurrentView() {
  $$(".tab-btn").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.tab === activeTab)
  );
  $$(".view-content").forEach((sec) => sec.classList.add("hidden"));
  const view = $("#" + activeTab + "-view");
  if (view) view.classList.remove("hidden");

  if (activeTab === "today") renderTodayView();
  else if (activeTab === "routines") renderRoutinesView();
  else if (activeTab === "feed") renderFeedView();
  else if (activeTab === "profile") renderProfileView();
}

function openTab(tab) {
  activeTab = tab;
  // stop rest timer if moving away from workout execution UI
  stopRestTimer();
  renderCurrentView();
  renderFab();
}

function renderFab() {
  const fab = $("#fab-button");
  const wrapper = $("#fab-container");

  if (!fab || !wrapper) return;

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

// ======== TODAY VIEW (seção de execução / treino ativo) ========
function renderTodayView() {
  const cont = $("#today-container");
  if (!cont) return;

  // If there's an active workout AND it has an execution state (we'll treat activeWorkout.execution flag)
  if (activeWorkout && activeWorkout.executing) {
    renderExecutionScreen(cont);
    return;
  }

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
    window.lucide && window.lucide.createIcons && window.lucide.createIcons();
    return;
  }

  // Treino existe mas não em execução (pode ser um treino gerado a partir de rotina)
  const startedAtLabel = activeWorkout.startedAt ? formatTime(activeWorkout.startedAt) : "—";

  const exHtml =
    activeWorkout.exercises && activeWorkout.exercises.length
      ? activeWorkout.exercises
          .map((ex, idx) => {
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
              <div class="flex items-center gap-2">
                <button class="text-[11px] px-2 py-1 border rounded-full text-slate-300" onclick="startExecutionFromIndex(event, ${idx})">Iniciar daqui</button>
                <i data-lucide="chevron-right" class="w-4 h-4 text-slate-500"></i>
              </div>
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
  window.lucide && window.lucide.createIcons && window.lucide.createIcons();
}

function startExecutionFromIndex(evt, startIdx) {
  evt.stopPropagation();
  if (!activeWorkout) return;
  activeWorkout.executing = true;
  currentExerciseIndex = startIdx || 0;
  currentSeriesIndex = 0;
  skippedExercises = [];
  saveState();
  renderApp();
}

// chama quando o usuário clica em "Iniciar treino" em uma rotina
function startWorkoutFromRoutine(routineId) {
  const r = routines.find((rt) => rt.id === routineId);
  if (!r) return;
  // copy routine exercises into active workout (deep clone)
  activeWorkout = {
    id: "w_" + Date.now(),
    name: r.name,
    startedAt: Date.now(),
    exercises: r.exercises.map((ex) => ({
      id: ex.id,
      name: ex.name,
      sets: (ex.sets || []).map(s => ({ weight: s.weight, reps: s.reps, rest: s.rest })),
    })),
    executing: true,
  };
  currentExerciseIndex = 0;
  currentSeriesIndex = 0;
  skippedExercises = [];
  saveState();
  openTab("today");
  renderApp();
}

// Called when rendering the execution screen
function renderExecutionScreen(containerEl) {
  const cont = containerEl;
  if (!cont || !activeWorkout || !activeWorkout.executing) return;

  // normalize
  const exercises = activeWorkout.exercises || [];
  if (exercises.length === 0) {
    cont.innerHTML = `<div class="empty-state">Sem exercícios para executar.</div>`;
    return;
  }

  // If currentExerciseIndex is beyond last, handle skipped exercises or finish
  if (currentExerciseIndex >= exercises.length) {
    // if skipped exists, take the first skipped
    if (skippedExercises.length) {
      currentExerciseIndex = skippedExercises.shift();
      currentSeriesIndex = 0;
    } else {
      // finished
      finishWorkout(); // will save and redirect to feed
      return;
    }
  }

  const ex = exercises[currentExerciseIndex];
  const sets = ex.sets || [];
  const totalSeries = sets.length || 0;

  // guard in case there are no sets (shouldn't happen) -> mark done and go next
  if (totalSeries === 0) {
    // jump to next exercise
    currentExerciseIndex++;
    currentSeriesIndex = 0;
    saveState();
    renderApp();
    return;
  }

  if (currentSeriesIndex >= totalSeries) {
    // move to next exercise
    currentExerciseIndex++;
    currentSeriesIndex = 0;
    saveState();
    renderApp();
    return;
  }

  const currentSet = sets[currentSeriesIndex];

  // Next exercise info for display
  const nextInfo = (() => {
    // next series on same exercise?
    if (currentSeriesIndex + 1 < totalSeries) {
      return { name: ex.name, seriesLabel: `${currentSeriesIndex + 2}/${totalSeries}`, set: sets[currentSeriesIndex + 1] };
    }
    // else next exercise
    const nextIdx = findNextExerciseIndex(currentExerciseIndex + 1);
    if (typeof nextIdx === 'number') {
      const nxt = exercises[nextIdx];
      return { name: nxt.name, seriesLabel: `1/${(nxt.sets || []).length}`, set: nxt.sets?.[0] || null };
    }
    return null;
  })();

  cont.innerHTML = `
    <div class="card p-4 mb-3">
      <div class="flex justify-between items-start">
        <div>
          <p class="text-xs text-slate-400">Executando</p>
          <h3 class="text-lg font-semibold text-slate-100">${ex.name}</h3>
          <p class="text-[11px] text-slate-400 mt-1">Série ${currentSeriesIndex + 1} / ${totalSeries}</p>
        </div>
        <div class="text-right">
          <button class="text-xs text-slate-300 border px-2 py-1 rounded-full" onclick="skipCurrentExercise()">Pular</button>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-2 gap-3">
        <div class="card p-3">
          <p class="text-[11px] text-slate-400 mb-1">Carga (kg)</p>
          <input id="exec-weight-input" class="input-dark" type="number" min="0" value="${currentSet.weight ?? 0}" />
        </div>
        <div class="card p-3">
          <p class="text-[11px] text-slate-400 mb-1">Reps</p>
          <input id="exec-reps-input" class="input-dark" type="number" min="1" value="${currentSet.reps ?? 1}" />
        </div>
      </div>

      <div class="mt-3 flex gap-2">
        <button id="mark-done-btn" class="btn-primary flex-1">Concluído</button>
        <button id="open-sets-btn" class="text-xs px-3 py-2 border rounded-full">Ver séries</button>
      </div>

      <div id="rest-timer-container" class="mt-4 hidden card p-3">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-[11px] text-slate-400">Descanso</p>
            <p id="rest-timer-label" class="text-lg font-semibold">00:00</p>
          </div>
          <div class="flex flex-col gap-2">
            <div class="flex gap-2">
              <button id="rest-minus" class="text-xs px-2 py-1 border rounded-full">-15s</button>
              <button id="rest-plus" class="text-xs px-2 py-1 border rounded-full">+15s</button>
            </div>
            <button id="rest-skip" class="text-xs px-2 py-1 border rounded-full">Pular descanso</button>
          </div>
        </div>
        <div class="text-xs text-slate-400 mt-2" id="next-ex-info"></div>
      </div>

      <div id="exec-next-info" class="mt-3 text-[11px] text-slate-400">
        ${nextInfo ? `Próximo: ${nextInfo.name} — ${nextInfo.seriesLabel} ${nextInfo.set ? ` • ${nextInfo.set.weight}kg x ${nextInfo.set.reps}` : ''}` : 'Última série deste exercício'}
      </div>
    </div>
  `;

  // events
  $("#mark-done-btn").onclick = () => markCurrentSeriesDone();
  $("#open-sets-btn").onclick = () => openSetsModal(ex.id);

  $("#rest-plus").onclick = () => adjustRest(15);
  $("#rest-minus").onclick = () => adjustRest(-15);
  $("#rest-skip").onclick = () => {
    stopRestTimer();
    proceedToNextAfterRest();
  };

  // update next-ex-info when rest visible
  if (nextInfo) {
    $("#next-ex-info") && ( $("#next-ex-info").textContent = `Próximo: ${nextInfo.name} • ${nextInfo.seriesLabel} ${nextInfo.set ? ` • ${nextInfo.set.weight}kg x ${nextInfo.set.reps}` : ''}` );
  }

  window.lucide && window.lucide.createIcons && window.lucide.createIcons();
}

// helper: find next non-skipped exercise index or null
function findNextExerciseIndex(startIdx) {
  const exercises = activeWorkout.exercises || [];
  for (let i = startIdx; i < exercises.length; i++) {
    if (!skippedExercises.includes(i)) return i;
  }
  // none forward, check skipped to return them later
  if (skippedExercises.length) return skippedExercises[0];
  return null;
}

function markCurrentSeriesDone() {
  // save any edited weight/reps
  const weightInput = $("#exec-weight-input");
  const repsInput = $("#exec-reps-input");
  if (weightInput) {
    const w = parseFloat(weightInput.value) || 0;
    activeWorkout.exercises[currentExerciseIndex].sets[currentSeriesIndex].weight = w;
  }
  if (repsInput) {
    const r = parseInt(repsInput.value) || 0;
    activeWorkout.exercises[currentExerciseIndex].sets[currentSeriesIndex].reps = r;
  }

  // Save PR if applies (if weight > previous PR)
  const ex = activeWorkout.exercises[currentExerciseIndex];
  const set = ex.sets[currentSeriesIndex];
  if (set.weight) {
    const existing = personalRecords.find(p => p.exerciseId === ex.id);
    if (!existing || set.weight > existing.maxWeight) {
      const pr = { exerciseId: ex.id, exerciseName: ex.name, maxWeight: set.weight, date: Date.now() };
      if (existing) {
        const idx = personalRecords.findIndex(p => p.exerciseId === ex.id);
        personalRecords[idx] = pr;
      } else {
        personalRecords.push(pr);
      }
    }
  }

  // start rest for this set, unless it's the last series of the exercise and next exercise exists
  const restSeconds = set.rest || 60; // default 60s if not set
  if (restSeconds > 0) {
    startRestTimer(restSeconds);
    showRestUI(true);
  } else {
    proceedToNextAfterRest();
  }
  saveState();
}

function showRestUI(show) {
  const restContainer = $("#rest-timer-container");
  if (!restContainer) return;
  restContainer.classList.toggle("hidden", !show);
  if (show) {
    updateRestLabel();
  }
}

function startRestTimer(seconds) {
  stopRestTimer();
  restTimeRemaining = seconds;
  updateRestLabel();
  restTimerInterval = setInterval(() => {
    restTimeRemaining--;
    updateRestLabel();
    if (restTimeRemaining <= 0) {
      stopRestTimer();
      beep();
      proceedToNextAfterRest();
    }
  }, 1000);
}

function stopRestTimer() {
  if (restTimerInterval) {
    clearInterval(restTimerInterval);
    restTimerInterval = null;
  }
  const restContainer = $("#rest-timer-container");
  if (restContainer) restContainer.classList.add("hidden");
}

function adjustRest(deltaSec) {
  restTimeRemaining = Math.max(0, restTimeRemaining + deltaSec);
  updateRestLabel();
}

function updateRestLabel() {
  const lab = $("#rest-timer-label");
  if (!lab) return;
  const mm = String(Math.floor(restTimeRemaining / 60)).padStart(2, "0");
  const ss = String(restTimeRemaining % 60).padStart(2, "0");
  lab.textContent = `${mm}:${ss}`;
}

function proceedToNextAfterRest() {
  // advance series / exercise
  const ex = activeWorkout.exercises[currentExerciseIndex];
  if (currentSeriesIndex + 1 < (ex.sets || []).length) {
    currentSeriesIndex++;
  } else {
    // move to next exercise on list or skipped logic
    const nextIdx = findNextExerciseIndex(currentExerciseIndex + 1);
    if (nextIdx === null) {
      // maybe there are skipped to return later
      if (skippedExercises.length) {
        currentExerciseIndex = skippedExercises.shift();
        currentSeriesIndex = 0;
      } else {
        // finish workout
        finishWorkout();
        return;
      }
    } else {
      currentExerciseIndex = nextIdx;
      currentSeriesIndex = 0;
    }
  }
  saveState();
  renderApp();
}

// skip current exercise (push it to skipped list if not already skipped)
function skipCurrentExercise() {
  if (!activeWorkout) return;
  if (!skippedExercises.includes(currentExerciseIndex)) {
    skippedExercises.push(currentExerciseIndex);
  }
  // move on
  const nextIdx = findNextExerciseIndex(currentExerciseIndex + 1);
  if (nextIdx === null) {
    // if no next, but skipped exist (others), pick first skipped
    if (skippedExercises.length) {
      currentExerciseIndex = skippedExercises.shift();
      currentSeriesIndex = 0;
    } else {
      finishWorkout();
      return;
    }
  } else {
    currentExerciseIndex = nextIdx;
    currentSeriesIndex = 0;
  }
  saveState();
  renderApp();
}

// ======== EXERCISE LIBRARY / ACTIVE WORKOUT ========
function openLibraryModal(mode) {
  exerciseLibraryMode = mode || "active"; // 'active' ou 'routine'

  const libraryModal = $("#exercise-library-modal");
  const routineModal = $("#routine-modal");

  // se vier da rotina, esconde o modal de rotina enquanto a biblioteca está aberta
  if (exerciseLibraryMode === "routine" && routineModal) {
    // ensure routine modal is not centered open state
    routineModal.classList.remove("show");
  }

  libraryModal.classList.add("show");
  renderExerciseList(EXERCISE_LIBRARY);
  const search = $("#exercise-search");
  if (search) search.value = "";
  window.lucide && window.lucide.createIcons && window.lucide.createIcons();
}

function closeModal(id) {
  const modal = $("#" + id);
  if (!modal) return;

  modal.classList.remove("show");

  // se fechou a biblioteca e ela estava em modo "routine", volta com o modal de rotina
  if (id === "exercise-library-modal" && exerciseLibraryMode === "routine") {
    const routineModal = $("#routine-modal");
    if (routineModal) {
      routineModal.classList.add("show");
      routineModal.classList.add("center"); // re-center it if needed
    }
  }
}

function renderExerciseList(listData) {
  const list = $("#exercise-list");
  if (!list) return;

  if (!listData.length) {
    list.innerHTML = '<p class="text-[11px] text-slate-500">Nenhum exercício encontrado.</p>';
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

// Called when selecting an exercise from the library
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
  } else if (exerciseLibraryMode === "routine") {
    // open the routine-exercise editor in center so user defines sets immediately
    editingRoutineExercise = { id: exBase.id, name: exBase.name, sets: [] };
    openRoutineExerciseEditor();
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
  window.lucide && window.lucide.createIcons && window.lucide.createIcons();
}

// ======== SETS MODAL (para exercício ativo) ========
function openSetsModal(exerciseId) {
  if (!activeWorkout) return;
  const ex = activeWorkout.exercises.find((e) => e.id === exerciseId);
  if (!ex) return;

  setsExerciseId = exerciseId;
  $("#sets-modal-title").textContent = ex.name;
  $("#sets-exercise-info").textContent = "Registre peso e repetições para cada série.";
  $("#set-weight-input").value = ex.sets?.[ex.sets.length - 1]?.weight || 10;
  $("#set-reps-input").value = ex.sets?.[ex.sets.length - 1]?.reps || 10;

  renderSetsTable(ex);
  $("#sets-modal").classList.add("show");
  window.lucide && window.lucide.createIcons && window.lucide.createIcons();
}

function renderSetsTable(ex) {
  const cont = $("#sets-table");
  if (!cont) return;
  const sets = Array.isArray(ex.sets) ? ex.sets : [];
  if (!sets.length) {
    cont.innerHTML = '<p class="text-[11px] text-slate-500">Nenhuma série registrada ainda.</p>';
    return;
  }
  cont.innerHTML = sets
    .map(
      (s, idx) => `
    <div class="flex justify-between items-center px-2 py-1 rounded-md bg-slate-900/70 mb-1">
      <span class="text-[11px] text-slate-400">Série ${idx + 1}</span>
      <span class="text-[11px] text-slate-200 font-semibold">${s.weight} kg x ${s.reps} reps • ${s.rest ?? 60}s</span>
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
  ex.sets.push({ weight, reps, rest: 60, ts: Date.now() });
  saveState();
  renderSetsTable(ex);
  renderTodayView();
}

// ======== ROUTINES (nova criação com editor de séries por exercício) ========
function renderRoutinesView() {
  const cont = $("#routines-container");
  if (!cont) return;

  if (!routines.length) {
    cont.innerHTML = `
      <div class="empty-state mt-8">
        <i data-lucide="clipboard-list" class="w-8 h-8 mx-auto mb-3 text-slate-500"></i>
        <p class="mb-1">Você ainda não tem rotinas salvas.</p>
        <p class="text-[11px] text-slate-500">Use o botão abaixo para criar a primeira.</p>
      </div>`;
    window.lucide && window.lucide.createIcons && window.lucide.createIcons();
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
        <div class="flex flex-col gap-2">
          <button class="text-[11px] text-slate-300 underline" onclick="openRoutineModal('${r.id}')">Editar</button>
          <button class="btn-primary text-[11px]" onclick="startWorkoutFromRoutine('${r.id}')">Iniciar</button>
        </div>
      </div>
      <p class="text-[11px] text-slate-400 mb-2">
        ${r.exercises.map((e) => e.name).join(", ") || "Sem exercícios"}
      </p>
    </div>`
    )
    .join("");
  window.lucide && window.lucide.createIcons && window.lucide.createIcons();
}

// Open routine modal centered (we add .center class to backdrop to center it)
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
  const m = $("#routine-modal");
  if (m) {
    m.classList.add("show");
    m.classList.add("center"); // center this modal
  }
  window.lucide && window.lucide.createIcons && window.lucide.createIcons();
}

function renderRoutineModalContent() {
  const list = $("#routine-exercises-list");
  if (!list) return;
  if (!currentRoutine || !currentRoutine.exercises.length) {
    list.innerHTML = '<p class="text-[11px] text-slate-500">Nenhum exercício ainda.</p>';
    return;
  }
  list.innerHTML = currentRoutine.exercises
    .map(
      (ex) => `
    <div class="flex justify-between items-center px-2 py-1 rounded-md bg-slate-900/70 mb-1">
      <div>
        <div class="text-[12px] font-semibold">${ex.name}</div>
        <div class="text-[11px] text-slate-400">${(ex.sets||[]).length} série(s)</div>
      </div>
      <div class="flex gap-2">
        <button class="text-[11px] text-slate-300" onclick="editRoutineExercise('${ex.id}')">Editar</button>
        <button class="text-[11px] text-red-400" onclick="removeExerciseFromRoutine('${ex.id}')">Remover</button>
      </div>
    </div>`
    )
    .join("");
}

// open editor for exercise that is already in currentRoutine
function editRoutineExercise(exId) {
  const ex = currentRoutine.exercises.find(e => e.id === exId);
  if (!ex) return;
  editingRoutineExercise = JSON.parse(JSON.stringify(ex));
  openRoutineExerciseEditor(true);
}

// editor for a new/edited routine exercise (centered)
function openRoutineExerciseEditor() {
  // create a small dynamic modal inside #routine-modal or reuse exercise-library-modal area
  // We'll build a simple editor in the exercise-library-modal area for convenience
  const lib = $("#exercise-library-modal");
  if (!lib) return;

  // Prepare editingRoutineExercise if null (should be set by selectExerciseFromLibrary)
  if (!editingRoutineExercise) return;

  lib.innerHTML = `
    <div class="modal-panel">
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-sm font-semibold text-slate-100">Editar: ${editingRoutineExercise.name}</h2>
        <button id="close-lib-editor" class="p-1 rounded-full hover:bg-slate-800">
          <i data-lucide="x" class="w-4 h-4 text-slate-300"></i>
        </button>
      </div>

      <div id="routine-ex-editor" class="space-y-3">
        <div>
          <label class="text-xs text-slate-400">Séries (adicione abaixo)</label>
          <div id="routine-ex-sets-list" class="space-y-2 mt-2"></div>
          <div class="mt-2">
            <button id="add-series-btn" class="btn-primary text-xs">Adicionar série</button>
          </div>
        </div>

        <div class="flex gap-2">
          <button id="save-ex-to-routine" class="btn-primary flex-1">Salvar exercício</button>
          <button id="cancel-ex-to-routine" class="text-xs flex-1 border rounded-full">Cancelar</button>
        </div>
      </div>
    </div>
  `;
  lib.classList.add("show");
  // bind events
  document.getElementById("close-lib-editor").onclick = () => {
    lib.classList.remove("show");
    // restore library content
    renderExerciseList(EXERCISE_LIBRARY);
  };
  document.getElementById("add-series-btn").onclick = () => {
    const list = editingRoutineExercise.sets || (editingRoutineExercise.sets = []);
    list.push({ weight: 10, reps: 10, rest: 60 });
    renderRoutineExerciseSets();
  };

  document.getElementById("save-ex-to-routine").onclick = () => {
    // if we're editing existing exercise in routine, replace; else push
    const existingIdx = currentRoutine.exercises.findIndex(e => e.id === editingRoutineExercise.id);
    if (existingIdx >= 0) {
      currentRoutine.exercises[existingIdx] = editingRoutineExercise;
    } else {
      currentRoutine.exercises.push(editingRoutineExercise);
    }
    editingRoutineExercise = null;
    saveState();
    lib.classList.remove("show");
    renderRoutineModalContent();
    renderRoutinesView();
  };

  document.getElementById("cancel-ex-to-routine").onclick = () => {
    editingRoutineExercise = null;
    lib.classList.remove("show");
    renderExerciseList(EXERCISE_LIBRARY);
  };

  // initial render sets
  renderRoutineExerciseSets();
  window.lucide && window.lucide.createIcons && window.lucide.createIcons();
}

function renderRoutineExerciseSets() {
  const container = document.getElementById("routine-ex-sets-list");
  if (!container) return;
  container.innerHTML = "";
  const sets = editingRoutineExercise.sets || [];
  sets.forEach((s, idx) => {
    const el = document.createElement("div");
    el.className = "flex gap-2 items-center";
    el.innerHTML = `
      <input data-idx="${idx}" data-field="weight" class="input-dark" style="width:80px" value="${s.weight}" />
      <input data-idx="${idx}" data-field="reps" class="input-dark" style="width:80px" value="${s.reps}" />
      <input data-idx="${idx}" data-field="rest" class="input-dark" style="width:100px" value="${s.rest}" />
      <button data-remove="${idx}" class="text-xs text-red-400">Remover</button>
    `;
    container.appendChild(el);
  });

  // attach listeners
  container.querySelectorAll("[data-idx]").forEach(inp => {
    inp.oninput = (ev) => {
      const idx = parseInt(ev.target.dataset.idx);
      const field = ev.target.dataset.field;
      const v = parseInt(ev.target.value) || 0;
      editingRoutineExercise.sets[idx][field] = v;
    };
  });
  container.querySelectorAll("[data-remove]").forEach(btn => {
    btn.onclick = (ev) => {
      const idx = parseInt(ev.target.dataset.remove);
      editingRoutineExercise.sets.splice(idx, 1);
      renderRoutineExerciseSets();
    };
  });
}

function removeExerciseFromRoutine(exId) {
  if (!currentRoutine) return;
  currentRoutine.exercises = currentRoutine.exercises.filter((e) => e.id !== exId);
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

// ======== FEED ========
function renderFeedView() {
  const cont = $("#feed-container");
  if (!cont) return;
  if (!communityFeed.length) {
    cont.innerHTML = `
      <div class="empty-state mt-8">
        <i data-lucide="activity" class="w-8 h-8 mx-auto mb-3 text-slate-500"></i>
        <p class="mb-1">Ainda não há treinos finalizados.</p>
        <p class="text-[11px] text-slate-500">
          Finalize um treino na aba <b>Rastrear</b> para vê-lo aqui.
        </p>
      </div>`;
    window.lucide && window.lucide.createIcons && window.lucide.createIcons();
    return;
  }

  cont.innerHTML = communityFeed
    .map((w) => {
      const dateLabel = w.finishedAt ? formatDateTime(w.finishedAt) : "Data desconhecida";
      const exSummary = (w.exercises || []).map((ex) => `${ex.name} (${Array.isArray(ex.sets) ? ex.sets.length : 0} sets)`).join(", ");
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
  window.lucide && window.lucide.createIcons && window.lucide.createIcons();
}

// ======== PROFILE ========
function renderProfileView() {
  const cont = $("#profile-container");
  if (!cont) return;
  const totalWorkouts = communityFeed.length;
  const totalSets = communityFeed.reduce((acc, w) => {
    return acc + (w.exercises || []).reduce((a, ex) => a + (Array.isArray(ex.sets) ? ex.sets.length : 0), 0);
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
          ? personalRecords.map((pr) => `
        <div class="flex justify-between items-center px-2 py-1 rounded-md bg-slate-900/70 mb-1">
          <span class="text-[11px] text-slate-200">${pr.exerciseName}</span>
          <span class="text-[11px] text-emerald-300 font-semibold">${pr.maxWeight} kg</span>
        </div>`).join("")
          : '<p class="text-[11px] text-slate-500">Finalize treinos com séries para ver PRs aqui.</p>'
      }
    </div>`;
  window.lucide && window.lucide.createIcons && window.lucide.createIcons();
}

// ======== WORKOUT LIFECYCLE ========
function startWorkoutIfNeeded() {
  if (!activeWorkout) {
    activeWorkout = {
      id: "w_" + Date.now(),
      name: "Treino de " + new Date().toLocaleDateString("pt-BR"),
      startedAt: Date.now(),
      exercises: [],
      executing: false,
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
  if (!activeWorkout) {
    alert("Sem treino para finalizar.");
    return;
  }

  // finalize and add to feed
  const workout = { ...activeWorkout, finishedAt: Date.now() };
  communityFeed.unshift(workout);
  if (communityFeed.length > 50) communityFeed.pop();

  // update PRs already handled during marks but ensure saved
  activeWorkout = null;
  saveState();
  alert("Treino finalizado!");
  openTab("feed");
  renderApp();
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

// Expor funções usadas em onclick no HTML (para ser chamado a partir do DOM)
window.openTab = openTab;
window.openLibraryModal = openLibraryModal;
window.closeModal = closeModal;
window.openSetsModal = openSetsModal;
window.openRoutineModal = openRoutineModal;
window.removeExerciseFromRoutine = removeExerciseFromRoutine;
window.saveRoutine = saveRoutine;
window.deleteRoutine = deleteRoutine;
window.startWorkoutFromRoutine = startWorkoutFromRoutine;
window.selectExerciseFromLibrary = selectExerciseFromLibrary;
window.startExecutionFromIndex = startExecutionFromIndex;
window.skipCurrentExercise = skipCurrentExercise;
