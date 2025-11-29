// app.js - Versão Modelo A (séries por exercício) com timer e fluxo de rotina/treino

// ======== CONFIG / STORAGE KEYS ========
const STORAGE_KEYS = {
  ACTIVE_WORKOUT: "tt_activeWorkout",
  ROUTINES: "tt_routines",
  FEED: "tt_feed",
  PRS: "tt_prs",
};

// ======== ESTADO ========
let activeTab = "today";
let activeWorkout = null; // objeto com exercises: [{id,name,sets:[{weight,reps,rest,done,ts}]}], meta CURRENT indexes
let routines = [];
let communityFeed = [];
let personalRecords = [];
let currentRoutine = null; // rotina sendo editada
let exerciseLibraryMode = "active"; // 'active' | 'routine'
let setsExerciseId = null; // id do exercício aberto no modal de sets

// Import EXERCISE_LIBRARY from exercises.js if defined, else fallback
const EXERCISE_LIBRARY = window.EXERCISE_LIBRARY || [
  { id: "supino_reto", name: "Supino Reto com Barra", group: "Peito" },
  { id: "agachamento", name: "Agachamento Livre", group: "Pernas" },
  { id: "crucifixo_maquina", name: "Crucifixo no Voador", group: "Peitoral" },
  { id: "remada_barra", name: "Remada Curvada com Barra", group: "Costas" },
];

// ======== HELPERS DOM ========
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function showCriticalError(msg) {
  const bar = $("#critical-error-bar");
  if (bar) {
    bar.textContent = msg;
    bar.classList.remove("hidden");
  } else console.error(msg);
}

// ======== STORAGE ========
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
    // Migration: if routines use flat exercise objects (without sets), convert
    routines = routines.map((r) => {
      r.exercises = (r.exercises || []).map((ex) => {
        if (!ex.sets) {
          // if has weight/reps/rest flat, convert
          if (ex.weight || ex.reps || ex.rest) {
            return {
              id: ex.id,
              name: ex.name,
              sets: [{ weight: ex.weight || 0, reps: ex.reps || 0, rest: ex.rest || 60 }],
            };
          }
          return { id: ex.id, name: ex.name, sets: ex.sets || [] };
        }
        return ex;
      });
      return r;
    });
  } catch (e) {
    console.error("Erro ao carregar estado:", e);
    showCriticalError("Erro ao ler dados locais (localStorage).");
  }
}

function saveState() {
  try {
    if (activeWorkout) localStorage.setItem(STORAGE_KEYS.ACTIVE_WORKOUT, JSON.stringify(activeWorkout));
    else localStorage.removeItem(STORAGE_KEYS.ACTIVE_WORKOUT);
    localStorage.setItem(STORAGE_KEYS.ROUTINES, JSON.stringify(routines));
    localStorage.setItem(STORAGE_KEYS.FEED, JSON.stringify(communityFeed));
    localStorage.setItem(STORAGE_KEYS.PRS, JSON.stringify(personalRecords));
  } catch (e) {
    console.error("Erro ao salvar estado:", e);
  }
}

// ======== RENDER / NAV ========
function renderApp() {
  // hide loading & show app content
  const loading = $("#loading-state");
  const appContent = $("#app-content");
  if (loading) loading.classList.add("hidden");
  if (appContent) appContent.classList.remove("hidden");

  renderCurrentView();
  renderFab();
  if (window.lucide) lucide.createIcons();
}

function renderCurrentView() {
  $$(".tab-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === activeTab));
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

// ======== TODAY VIEW (execução do treino) ========
function renderTodayView() {
  const cont = $("#today-container");
  if (!cont) return;

  if (!activeWorkout) {
    cont.innerHTML = `
      <div class="empty-state mt-10">
        <i data-lucide="dumbbell" class="w-8 h-8 mx-auto mb-3 text-slate-500"></i>
        <p class="mb-1">Não há treino em andamento.</p>
        <p class="text-xs mb-4 text-slate-500">Comece por uma rotina ou adicione um exercício.</p>
        <div class="flex gap-2 justify-center">
          <button class="btn-primary" onclick="openLibraryModal('active')"><i data-lucide="plus" class="w-3 h-3"></i> Adicionar Exercício</button>
          <button class="btn-primary" onclick="openTab('routines')">Rotinas</button>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
    return;
  }

  // Se o treino estiver em progresso com índices, mostramos tela de execução por exercício
  if (activeWorkout.currentExerciseIndex == null) activeWorkout.currentExerciseIndex = 0;
  if (activeWorkout.currentSetIndex == null) activeWorkout.currentSetIndex = 0;
  if (!activeWorkout.skipped) activeWorkout.skipped = [];

  const ei = activeWorkout.currentExerciseIndex;
  const exObj = activeWorkout.exercises[ei];
  if (!exObj) {
    // fallback: show basic list
    cont.innerHTML = `<div class="card p-3">Erro: nenhum exercício encontrado no treino.</div>`;
    return;
  }

  // Build UI for current exercise
  const setIdx = Math.min(activeWorkout.currentSetIndex || 0, (exObj.sets || []).length - 1);
  const currentSet = exObj.sets && exObj.sets[setIdx] ? exObj.sets[setIdx] : { weight: 0, reps: 0, rest: 60 };

  // next exercise preview
  const nextExercise = findNextExerciseInfo();

  cont.innerHTML = `
    <div class="card p-3 mb-3">
      <div class="flex items-start gap-3">
        <div class="w-24 h-24 rounded bg-slate-800 flex items-center justify-center">
          <!-- Placeholder imagem -> futuramente trocar pela imagem do exercício -->
          <i data-lucide="image" class="w-6 h-6 text-slate-500"></i>
        </div>
        <div class="flex-1">
          <p class="text-xs text-slate-400">Exercício ${ei+1}/${activeWorkout.exercises.length}</p>
          <h3 class="text-lg font-semibold">${exObj.name}</h3>
          <p class="text-xs text-slate-400 mt-1">Série ${setIdx+1}/${exObj.sets.length}</p>
        </div>
        <div>
          <button class="text-xs text-slate-300 border border-slate-600 rounded-full px-2 py-1" onclick="skipCurrentExercise()">Pular</button>
        </div>
      </div>
    </div>

    <div class="card p-3 mb-3">
      <p class="text-xs text-slate-400 mb-2">Carga (kg) e Reps — toque para editar</p>
      <div class="grid grid-cols-2 gap-2 mb-2">
        <input id="play-weight-input" type="number" class="input-dark" value="${currentSet.weight}" />
        <input id="play-reps-input" type="number" class="input-dark" value="${currentSet.reps}" />
      </div>
      <div class="flex gap-2">
        <button id="btn-complete-set" class="btn-primary flex-1">Concluído</button>
      </div>
    </div>

    <div id="rest-timer-panel" class="card p-3 mb-3 hidden">
      <div class="flex justify-between items-center mb-2">
        <p class="text-xs text-slate-400">Descanso</p>
        <div class="text-sm font-semibold" id="rest-timer-display">00:00</div>
      </div>
      <div class="flex gap-2 items-center">
        <button id="btn-minus-15" class="btn-primary text-xs px-3 py-1">-15s</button>
        <button id="btn-plus-15" class="btn-primary text-xs px-3 py-1">+15s</button>
        <div class="flex-1 text-xs text-slate-400 text-right">Próximo: ${nextExercise ? nextExercise.name + ' (' + (nextExercise.sets ? nextExercise.sets.length : '?') + ' sets)' : 'Nenhum'}</div>
      </div>
    </div>

    <div class="card p-3">
      <p class="text-xs text-slate-400 mb-2">Próximo</p>
      <div class="text-sm text-slate-100">${nextExercise ? nextExercise.name : '—'}</div>
    </div>
  `;

  // Attach interactions
  if (window.lucide) lucide.createIcons();

  const weightInp = $("#play-weight-input");
  const repsInp = $("#play-reps-input");
  const btnComplete = $("#btn-complete-set");
  const restPanel = $("#rest-timer-panel");
  const restDisplay = $("#rest-timer-display");
  const plus15 = $("#btn-plus-15");
  const minus15 = $("#btn-minus-15");

  // Save edits live to the set (allows PR editing)
  function saveSetEdits() {
    const w = parseFloat(weightInp.value) || 0;
    const r = parseInt(repsInp.value) || 0;
    const setRef = activeWorkout.exercises[ei].sets[setIdx];
    setRef.weight = w;
    setRef.reps = r;
    saveState();
    // update PR if weight increased and reps>0
    maybeUpdatePR(activeWorkout.exercises[ei].id, activeWorkout.exercises[ei].name, w);
  }
  weightInp.onchange = saveSetEdits;
  repsInp.onchange = saveSetEdits;

  // Timer state
  if (!activeWorkout._timer) activeWorkout._timer = { secondsLeft: 0, intervalId: null, running: false };

  function showRestPanel(seconds) {
    activeWorkout._timer.secondsLeft = seconds;
    restDisplay.textContent = formatSeconds(seconds);
    restPanel.classList.remove("hidden");
    startTimer();
  }

  function hideRestPanel() {
    restPanel.classList.add("hidden");
    stopTimer();
  }

  function startTimer() {
    if (activeWorkout._timer.running) return;
    activeWorkout._timer.running = true;
    activeWorkout._timer.intervalId = setInterval(() => {
      activeWorkout._timer.secondsLeft = Math.max(0, activeWorkout._timer.secondsLeft - 1);
      restDisplay.textContent = formatSeconds(activeWorkout._timer.secondsLeft);
      if (activeWorkout._timer.secondsLeft <= 0) {
        stopTimer();
        playBeep();
        // avança automaticamente quando o descanso acabou
        onRestFinishedAdvance();
      }
    }, 1000);
  }

  function stopTimer() {
    if (activeWorkout._timer.intervalId) {
      clearInterval(activeWorkout._timer.intervalId);
      activeWorkout._timer.intervalId = null;
    }
    activeWorkout._timer.running = false;
  }

  plus15.onclick = () => {
    activeWorkout._timer.secondsLeft = (activeWorkout._timer.secondsLeft || 0) + 15;
    $("#rest-timer-display").textContent = formatSeconds(activeWorkout._timer.secondsLeft);
  };
  minus15.onclick = () => {
    activeWorkout._timer.secondsLeft = Math.max(0, (activeWorkout._timer.secondsLeft || 0) - 15);
    $("#rest-timer-display").textContent = formatSeconds(activeWorkout._timer.secondsLeft);
  };

  btnComplete.onclick = () => {
    // marcar set como feita e iniciar descanso (se não for a última série)
    // atualiza peso/reps antes
    saveSetEdits();

    const sets = activeWorkout.exercises[ei].sets || [];
    sets[setIdx].done = true;
    sets[setIdx].completedAt = Date.now();
    saveState();

    // se ainda houver próxima série no mesmo exercício -> start rest
    if (setIdx < sets.length - 1) {
      // pegar rest do set atual (ou próximo?) -> usamos rest do set atual
      const restSec = parseInt(sets[setIdx].rest || 60);
      showRestPanel(restSec);
    } else {
      // finalizou últimas séries do exercício -> ir para próximo exercício
      advanceToNextExercise();
    }

    // se a carga atual excedeu PR -> salvar
    maybeUpdatePR(exObj.id, exObj.name, sets[setIdx].weight);
  };

  // helper: quando descanso terminar
  function onRestFinishedAdvance() {
    // avança para próxima série automaticamente e abre view
    activeWorkout.currentSetIndex = (activeWorkout.currentSetIndex || 0) + 1;
    saveState();
    // força rerender
    renderTodayView();
  }

  function advanceToNextExercise() {
    // procura próximo exercício que não esteja concluído; se houver pulados, ir para eles depois
    activeWorkout.currentSetIndex = 0;
    // marcar exercício como done? We rely on sets[].done to determine
    // avança índice
    activeWorkout.currentExerciseIndex = (activeWorkout.currentExerciseIndex || 0) + 1;

    // se terminou a lista e tem pulados, volta a pulados
    if (activeWorkout.currentExerciseIndex >= activeWorkout.exercises.length) {
      if (activeWorkout.skipped && activeWorkout.skipped.length) {
        // reconstruir exercises list com os pulados (append)
        // aqui vamos colocar os exercícios pulados no final e limpar skipped
        const skippedIds = activeWorkout.skipped.slice();
        activeWorkout.skipped = [];
        const skippedObjects = skippedIds.map((id) => {
          return activeWorkout.exercises.find((e) => e.id === id) || null;
        }).filter(Boolean);
        activeWorkout.exercises = activeWorkout.exercises.concat(skippedObjects);
        activeWorkout.currentExerciseIndex = activeWorkout.exercises.length - skippedObjects.length; // ir para primeiro pulado
      } else {
        // realmente terminou o treino
        finishWorkout(); // finaliza automaticamente
        return;
      }
    }

    saveState();
    renderTodayView();
  }

  function skipCurrentExercise() {
    const currentId = exObj.id;
    if (!activeWorkout.skipped) activeWorkout.skipped = [];
    // add if not already in skipped and not last resort
    if (!activeWorkout.skipped.includes(currentId)) {
      activeWorkout.skipped.push(currentId);
    }
    // remove from current position by marking index increment
    activeWorkout.currentExerciseIndex = (activeWorkout.currentExerciseIndex || 0) + 1;
    if (activeWorkout.currentExerciseIndex >= activeWorkout.exercises.length) {
      // if end reached and skipped exist, move to skipped
      if (activeWorkout.skipped.length) {
        const skipped = activeWorkout.skipped.shift();
        const skippedObj = activeWorkout.exercises.find((e) => e.id === skipped);
        if (skippedObj) activeWorkout.exercises.push(skippedObj);
      } else {
        finishWorkout();
        return;
      }
    }
    saveState();
    renderTodayView();
  }
}

// Helper to find the next exercise (preview)
function findNextExerciseInfo() {
  if (!activeWorkout) return null;
  let idx = activeWorkout.currentExerciseIndex || 0;
  const exs = activeWorkout.exercises || [];
  // compute next index (maybe same exercise next set)
  const currentEx = exs[idx];
  if (!currentEx) return null;
  const setIdx = activeWorkout.currentSetIndex || 0;
  if (setIdx < (currentEx.sets?.length || 0) - 1) {
    return { name: currentEx.name, sets: currentEx.sets };
  } else {
    // next exercise
    const next = exs[idx + 1];
    return next || null;
  }
}

function formatSeconds(sec) {
  if (!sec || sec <= 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function playBeep() {
  // simples beep usando WebAudio
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.value = 0.0001;
    // fade in
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    o.start();
    setTimeout(() => {
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1);
      setTimeout(() => { o.stop(); ctx.close(); }, 120);
    }, 250);
  } catch (e) {
    console.warn("Audio error", e);
  }
}

// ======== START / CANCEL / FINISH ========
function startWorkoutIfNeeded() {
  if (!activeWorkout) {
    activeWorkout = {
      id: "w_" + Date.now(),
      name: "Treino de " + new Date().toLocaleDateString("pt-BR"),
      startedAt: Date.now(),
      exercises: [],
      currentExerciseIndex: 0,
      currentSetIndex: 0,
      skipped: [],
      _timer: { secondsLeft: 0, intervalId: null, running: false },
    };
  }
}

function cancelWorkout() {
  if (!confirm("Cancelar e apagar o treino atual?")) return;
  activeWorkout = null;
  saveState();
  renderApp();
}

function finishWorkout() {
  if (!activeWorkout) {
    alert("Nenhum treino em andamento.");
    return;
  }
  // validate that at least one set exists
  const hasSets = (activeWorkout.exercises || []).some((ex) => (ex.sets || []).length > 0);
  if (!hasSets) {
    alert("Adicione pelo menos um exercício com séries antes de finalizar.");
    return;
  }

  activeWorkout.finishedAt = Date.now();
  communityFeed.unshift(activeWorkout);
  if (communityFeed.length > 50) communityFeed.pop();
  activeWorkout = null;
  saveState();
  alert("Treino finalizado e salvo no feed!");
  openTab("feed");
  renderApp();
}

// ======== EXERCISE LIBRARY / MODALS ========
function openLibraryModal(mode) {
  exerciseLibraryMode = mode || "active"; // 'active' ou 'routine'
  const libraryModal = $("#exercise-library-modal");
  const routineModal = $("#routine-modal");
  if (!libraryModal) return;
  // esconder rotina se abriu a biblioteca em modo routine (vamos reabrir ao fechar)
  if (exerciseLibraryMode === "routine" && routineModal) routineModal.classList.remove("show");
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
  // se fechou biblioteca no modo rotina, reabre rotina
  if (id === "exercise-library-modal" && exerciseLibraryMode === "routine") {
    const routineModal = $("#routine-modal");
    if (routineModal) routineModal.classList.add("show");
  }
}

function renderExerciseList(listData) {
  const list = $("#exercise-list");
  if (!list) return;
  if (!listData.length) {
    list.innerHTML = '<p class="text-[11px] text-slate-500">Nenhum exercício encontrado.</p>';
    return;
  }
  list.innerHTML = listData.map(ex => `
    <button class="w-full text-left text-xs px-3 py-2 rounded-lg bg-slate-900/70 hover:bg-slate-800 flex justify-between items-center"
            onclick="selectExerciseFromLibrary('${ex.id}')">
      <div>
        <p class="font-semibold text-slate-100">${ex.name}</p>
        <p class="text-[10px] text-slate-400">${ex.group || ''}</p>
      </div>
      <i data-lucide="plus" class="w-4 h-4 text-blue-400"></i>
    </button>
  `).join("");
}

function selectExerciseFromLibrary(exId) {
  const exBase = EXERCISE_LIBRARY.find(e => e.id === exId);
  if (!exBase) return;

  if (exerciseLibraryMode === "active") {
    startWorkoutIfNeeded();
    if (activeWorkout.exercises.find(e => e.id === exBase.id)) {
      alert("Esse exercício já está no treino.");
    } else {
      activeWorkout.exercises.push({
        id: exBase.id,
        name: exBase.name,
        sets: [], // no modo adição direta ao treino, usuário adiciona sets manualmente
      });
      saveState();
    }
    closeModal("exercise-library-modal");
    renderApp();
    openSetsModal(exBase.id);
  } else if (exerciseLibraryMode === "routine") {
    // abrir editor para adicionar séries a esse exercício na rotina
    openRoutineExerciseEditor(exBase);
  }
}

function handleExerciseSearch(e) {
  const term = e.target.value.toLowerCase().trim();
  const filtered = EXERCISE_LIBRARY.filter(
    (ex) => ex.name.toLowerCase().includes(term) || (ex.group || "").toLowerCase().includes(term)
  );
  renderExerciseList(filtered);
  if (window.lucide) lucide.createIcons();
}

// ======== MODAL: EDITAR SÉRIES (ao criar rotina) ========
function openRoutineExerciseEditor(exBase) {
  // exBase = {id,name}
  // cria um overlay simples temporário para adicionar séries daquele exercício
  const overlayId = "routine-ex-editor";
  let overlay = $("#" + overlayId);
  if (overlay) overlay.remove();

  overlay = document.createElement("div");
  overlay.id = overlayId;
  overlay.className = "modal-backdrop show z-50";
  overlay.innerHTML = `
    <div class="modal-panel" style="max-width:420px; margin:auto;">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-semibold text-slate-100">Adicionar: ${exBase.name}</h3>
        <button id="${overlayId}-close" class="p-1 rounded-full hover:bg-slate-800"><i data-lucide="x" class="w-4 h-4 text-slate-300"></i></button>
      </div>
      <div id="${overlayId}-series-list" class="space-y-2 mb-3"></div>
      <div class="flex gap-2">
        <button id="${overlayId}-add-series" class="btn-primary flex-1">Adicionar Série</button>
        <button id="${overlayId}-save" class="flex-1 btn-primary">Salvar Exercício</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  if (window.lucide) lucide.createIcons();

  // series state
  const series = []; // cada item {weight,reps,rest}
  const listEl = $(`#${overlayId}-series-list`);

  function renderSeriesInputs() {
    listEl.innerHTML = series.length ? series.map((s, idx) => `
      <div class="rounded-md bg-slate-900/70 p-2 flex gap-2 items-center">
        <div class="flex-1 text-xs">
          <div class="flex gap-2">
            <input data-idx="${idx}" data-field="weight" class="input-dark text-xs" placeholder="Peso (kg)" value="${s.weight}" />
            <input data-idx="${idx}" data-field="reps" class="input-dark text-xs" placeholder="Reps" value="${s.reps}" />
            <input data-idx="${idx}" data-field="rest" class="input-dark text-xs" placeholder="Desc (seg)" value="${s.rest}" />
          </div>
        </div>
        <button data-del="${idx}" class="text-red-400 text-xs">Remover</button>
      </div>
    `).join('') : '<p class="text-[11px] text-slate-500">Nenhuma série ainda.</p>';
    // wire inputs
    const inputs = listEl.querySelectorAll("input[data-idx]");
    inputs.forEach(inp => {
      inp.oninput = (ev) => {
        const idx = parseInt(inp.dataset.idx);
        const field = inp.dataset.field;
        series[idx][field] = parseFloat(inp.value) || 0;
      };
    });
    listEl.querySelectorAll("[data-del]").forEach(btn => {
      btn.onclick = (ev) => {
        const idx = parseInt(btn.dataset.del);
        series.splice(idx,1);
        renderSeriesInputs();
      }
    });
  }

  // handlers
  $(`#${overlayId}-add-series`).onclick = () => {
    series.push({ weight: 10, reps: 10, rest: 60 });
    renderSeriesInputs();
  };

  $(`#${overlayId}-save`).onclick = () => {
    if (!series.length) { alert("Adicione pelo menos uma série."); return; }
    // find or create routine currentRoutine
    if (!currentRoutine) {
      alert("Erro: rotina atual não definida.");
      return;
    }
    // prevent duplicates
    if (currentRoutine.exercises.find(e => e.id === exBase.id)) {
      alert("Exercício já existe na rotina.");
      overlay.remove();
      return;
    }
    currentRoutine.exercises.push({
      id: exBase.id,
      name: exBase.name,
      sets: series.map(s => ({ weight: s.weight||0, reps: s.reps||0, rest: s.rest||60 }))
    });
    renderRoutineModalContent();
    overlay.remove();
    // re-open routine modal if it was hidden
    $("#routine-modal").classList.add("show");
    saveState();
  };

  $(`#${overlayId}-close`).onclick = () => {
    overlay.remove();
    // re-open routine modal if it was hidden
    $("#routine-modal").classList.add("show");
  };

  // start with one series by default
  series.push({ weight: 10, reps: 10, rest: 60 });
  renderSeriesInputs();
  // hide underlying routine modal while editor open
  $("#routine-modal").classList.remove("show");
}

// ======== SETS MODAL (ao editar sets diretamente no treino) ========
function openSetsModal(exerciseId) {
  if (!activeWorkout) return;
  const ex = activeWorkout.exercises.find(e => e.id === exerciseId);
  if (!ex) return;
  setsExerciseId = exerciseId;
  $("#sets-modal-title").textContent = ex.name;
  $("#sets-exercise-info").textContent = "Registre peso, reps e descanso para cada série.";
  $("#set-weight-input").value = ex.sets?.[ex.sets.length - 1]?.weight || 10;
  $("#set-reps-input").value = ex.sets?.[ex.sets.length - 1]?.reps || 10;
  $("#set-rest-input").value = ex.sets?.[ex.sets.length - 1]?.rest || 60;
  renderSetsTable(ex);
  $("#sets-modal").classList.add("show");
  if (window.lucide) lucide.createIcons();
}

function renderSetsTable(ex) {
  const cont = $("#sets-table");
  const sets = Array.isArray(ex.sets) ? ex.sets : [];
  if (!cont) return;
  if (!sets.length) {
    cont.innerHTML = '<p class="text-[11px] text-slate-500">Nenhuma série registrada ainda.</p>';
    return;
  }
  cont.innerHTML = sets.map((s, idx) => `
    <div class="flex justify-between items-center px-2 py-1 rounded-md bg-slate-900/70 mb-1">
      <span class="text-[11px] text-slate-400">Série ${idx+1}</span>
      <div class="flex gap-2 items-center">
        <span class="text-[11px] text-slate-200 font-semibold">${s.weight} kg x ${s.reps} reps</span>
        <button data-del="${idx}" class="text-red-400 text-xs">Remover</button>
      </div>
    </div>
  `).join("");
  // wire remove
  cont.querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.del);
      ex.sets.splice(idx,1);
      renderSetsTable(ex);
      saveState();
    };
  });
}

function addSetToCurrentExercise() {
  if (!activeWorkout || !setsExerciseId) return;
  const ex = activeWorkout.exercises.find(e => e.id === setsExerciseId);
  if (!ex) return;
  const weight = parseFloat($("#set-weight-input").value) || 0;
  const reps = parseInt($("#set-reps-input").value) || 0;
  const rest = parseInt($("#set-rest-input").value) || 60;
  if (!weight || !reps) { alert("Informe peso e repetições válidos."); return; }
  ex.sets = ex.sets || [];
  ex.sets.push({ weight, reps, rest, ts: Date.now() });
  saveState();
  renderSetsTable(ex);
  renderTodayView();
}

// ======== ROUTINES CRUD & UI ========
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
    if (window.lucide) lucide.createIcons();
    return;
  }

  cont.innerHTML = routines.map(r => `
    <div class="card p-3 mb-2">
      <div class="flex justify-between items-start mb-1">
        <div>
          <p class="text-sm font-semibold">${r.name}</p>
          <p class="text-[11px] text-slate-400">${r.exercises.length} exercício(s)</p>
        </div>
        <div class="flex gap-2">
          <button class="text-[11px] text-slate-300 underline" onclick="openRoutineModal('${r.id}')">Editar</button>
          <button class="text-[11px] text-red-400" onclick="deleteRoutineById('${r.id}')">Apagar</button>
        </div>
      </div>
      <p class="text-[11px] text-slate-400 mb-2">${r.exercises.map(e => e.name).join(", ") || "Sem exercícios"}</p>
      <button class="btn-primary w-full text-[11px]" onclick="startWorkoutFromRoutine('${r.id}')">Iniciar Treino com esta Rotina</button>
    </div>
  `).join("");
  if (window.lucide) lucide.createIcons();
}

function openRoutineModal(routineId) {
  if (routineId) {
    currentRoutine = routines.find(r => r.id === routineId);
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
  if (!list) return;
  if (!currentRoutine || !currentRoutine.exercises.length) {
    list.innerHTML = '<p class="text-[11px] text-slate-500">Nenhum exercício ainda.</p>';
    return;
  }
  list.innerHTML = currentRoutine.exercises.map((ex, idx) => `
    <div class="rounded-md bg-slate-900/70 p-2 flex justify-between items-start">
      <div>
        <p class="text-xs font-semibold text-slate-100">${ex.name}</p>
        <p class="text-[11px] text-slate-400">${ex.sets.length} séries</p>
      </div>
      <div class="flex flex-col gap-1">
        <button class="text-xs text-slate-300 underline" onclick="editRoutineExercise('${ex.id}')">Editar</button>
        <button class="text-xs text-red-400" onclick="removeExerciseFromRoutine('${ex.id}')">Remover</button>
      </div>
    </div>
  `).join("");
}

function editRoutineExercise(exId) {
  // abre editor com as séries existentes, reutiliza editor de adicionar exercício
  const exBase = currentRoutine.exercises.find(e => e.id === exId);
  if (!exBase) return;
  // remove routine modal, build overlay to edit exBase.sets
  const overlayId = "routine-ex-editor";
  let overlay = $("#" + overlayId);
  if (overlay) overlay.remove();

  overlay = document.createElement("div");
  overlay.id = overlayId;
  overlay.className = "modal-backdrop show z-50";
  overlay.innerHTML = `
    <div class="modal-panel" style="max-width:420px; margin:auto;">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-semibold text-slate-100">Editar: ${exBase.name}</h3>
        <button id="${overlayId}-close" class="p-1 rounded-full hover:bg-slate-800"><i data-lucide="x" class="w-4 h-4 text-slate-300"></i></button>
      </div>
      <div id="${overlayId}-series-list" class="space-y-2 mb-3"></div>
      <div class="flex gap-2">
        <button id="${overlayId}-add-series" class="btn-primary flex-1">Adicionar Série</button>
        <button id="${overlayId}-save" class="flex-1 btn-primary">Salvar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  if (window.lucide) lucide.createIcons();

  const series = exBase.sets.map(s => ({ ...s })); // clone
  const listEl = $(`#${overlayId}-series-list`);

  function renderSeriesInputs() {
    listEl.innerHTML = series.length ? series.map((s, idx) => `
      <div class="rounded-md bg-slate-900/70 p-2 flex gap-2 items-center">
        <div class="flex-1 text-xs">
          <div class="flex gap-2">
            <input data-idx="${idx}" data-field="weight" class="input-dark text-xs" placeholder="Peso (kg)" value="${s.weight}" />
            <input data-idx="${idx}" data-field="reps" class="input-dark text-xs" placeholder="Reps" value="${s.reps}" />
            <input data-idx="${idx}" data-field="rest" class="input-dark text-xs" placeholder="Desc (seg)" value="${s.rest}" />
          </div>
        </div>
        <button data-del="${idx}" class="text-red-400 text-xs">Remover</button>
      </div>
    `).join('') : '<p class="text-[11px] text-slate-500">Nenhuma série ainda.</p>';
    // wire inputs
    const inputs = listEl.querySelectorAll("input[data-idx]");
    inputs.forEach(inp => {
      inp.oninput = () => {
        const idx = parseInt(inp.dataset.idx);
        const field = inp.dataset.field;
        series[idx][field] = parseFloat(inp.value) || 0;
      };
    });
    listEl.querySelectorAll("[data-del]").forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.del);
        series.splice(idx,1);
        renderSeriesInputs();
      }
    });
  }

  $(`#${overlayId}-add-series`).onclick = () => {
    series.push({ weight: 10, reps: 10, rest: 60 });
    renderSeriesInputs();
  };

  $(`#${overlayId}-save`).onclick = () => {
    exBase.sets = series.map(s => ({ weight: s.weight||0, reps: s.reps||0, rest: s.rest||60 }));
    saveState();
    renderRoutineModalContent();
    overlay.remove();
    $("#routine-modal").classList.add("show");
  };

  $(`#${overlayId}-close`).onclick = () => {
    overlay.remove();
    $("#routine-modal").classList.add("show");
  };

  renderSeriesInputs();
  $("#routine-modal").classList.remove("show");
}

function removeExerciseFromRoutine(exId) {
  if (!currentRoutine) return;
  currentRoutine.exercises = currentRoutine.exercises.filter(e => e.id !== exId);
  renderRoutineModalContent();
}

function saveRoutine() {
  if (!currentRoutine) return;
  const name = $("#routine-name-input").value.trim();
  if (name.length < 3) { alert("O nome da rotina deve ter pelo menos 3 caracteres."); return; }
  currentRoutine.name = name;
  const existingIdx = routines.findIndex(r => r.id === currentRoutine.id);
  if (existingIdx >= 0) routines[existingIdx] = currentRoutine;
  else routines.push(currentRoutine);
  saveState();
  closeModal("routine-modal");
  renderRoutinesView();
}

function deleteRoutine() {
  if (!currentRoutine) return;
  if (!confirm("Deseja apagar esta rotina?")) return;
  routines = routines.filter(r => r.id !== currentRoutine.id);
  currentRoutine = null;
  saveState();
  closeModal("routine-modal");
  renderRoutinesView();
}
function deleteRoutineById(id) {
  if (!confirm("Apagar rotina permanentemente?")) return;
  routines = routines.filter(r => r.id !== id);
  saveState();
  renderRoutinesView();
}

function startWorkoutFromRoutine(routineId) {
  const r = routines.find(rt => rt.id === routineId);
  if (!r) return;
  // clone exercises and their sets into activeWorkout
  activeWorkout = {
    id: "w_" + Date.now(),
    name: r.name,
    startedAt: Date.now(),
    exercises: r.exercises.map(ex => ({
      id: ex.id,
      name: ex.name,
      sets: ex.sets.map(s => ({ weight: s.weight, reps: s.reps, rest: s.rest, done: false }))
    })),
    currentExerciseIndex: 0,
    currentSetIndex: 0,
    skipped: [],
    _timer: { secondsLeft: 0, intervalId: null, running: false }
  };
  saveState();
  openTab("today");
  renderApp();
}

// ======== FEED / PROFILE ========
function renderFeedView() {
  const cont = $("#feed-container");
  if (!cont) return;
  if (!communityFeed.length) {
    cont.innerHTML = `
      <div class="empty-state mt-8">
        <i data-lucide="activity" class="w-8 h-8 mx-auto mb-3 text-slate-500"></i>
        <p class="mb-1">Ainda não há treinos finalizados.</p>
        <p class="text-[11px] text-slate-500">Finalize um treino na aba Rastrear para vê-lo aqui.</p>
      </div>`;
    if (window.lucide) lucide.createIcons();
    return;
  }
  cont.innerHTML = communityFeed.map(w => {
    const dateLabel = w.finishedAt ? new Date(w.finishedAt).toLocaleString("pt-BR") : "Desconhecido";
    const exSummary = (w.exercises || []).map(ex => `${ex.name} (${(ex.sets||[]).length} sets)`).join(", ");
    return `
      <div class="card p-3 mb-2">
        <div class="flex justify-between items-center mb-1">
          <p class="text-[11px] text-slate-400">${dateLabel}</p>
          <span class="text-[10px] px-2 py-[2px] rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">Finalizado</span>
        </div>
        <p class="text-sm font-semibold mb-1">${w.name}</p>
        <p class="text-[11px] text-slate-400">${exSummary || "Sem exercícios"}</p>
      </div>
    `;
  }).join("");
  if (window.lucide) lucide.createIcons();
}

function renderProfileView() {
  const cont = $("#profile-container");
  if (!cont) return;
  const totalWorkouts = communityFeed.length;
  const totalSets = communityFeed.reduce((acc,w) => acc + ((w.exercises||[]).reduce((a,ex) => a + ((ex.sets||[]).length), 0)), 0);
  cont.innerHTML = `
    <div class="card p-3 mb-3">
      <p class="text-xs font-semibold text-slate-300 mb-2">Estatísticas Gerais</p>
      <div class="grid grid-cols-2 gap-3 text-[11px]">
        <div><p class="text-slate-400">Treinos finalizados</p><p class="text-lg font-semibold text-slate-100">${totalWorkouts}</p></div>
        <div><p class="text-slate-400">Total de séries</p><p class="text-lg font-semibold text-slate-100">${totalSets}</p></div>
      </div>
    </div>
    <div class="card p-3">
      <p class="text-xs font-semibold text-slate-300 mb-2">Recordes Pessoais (PR)</p>
      ${ personalRecords.length ? personalRecords.map(pr => `
        <div class="flex justify-between items-center px-2 py-1 rounded-md bg-slate-900/70 mb-1">
          <span class="text-[11px] text-slate-200">${pr.exerciseName}</span>
          <span class="text-[11px] text-emerald-300 font-semibold">${pr.maxWeight} kg</span>
        </div>
      `).join('') : '<p class="text-[11px] text-slate-500">Finalize treinos com séries para ver PRs aqui.</p>' }
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

// ======== PRs ========
function maybeUpdatePR(exerciseId, exerciseName, weight) {
  if (!weight || weight <= 0) return;
  const existingIdx = personalRecords.findIndex(p => p.exerciseId === exerciseId);
  const newPr = { exerciseId, exerciseName, maxWeight: weight, date: Date.now() };
  if (existingIdx >= 0) {
    if (weight > personalRecords[existingIdx].maxWeight) {
      personalRecords[existingIdx] = newPr;
      saveState();
    }
  } else {
    personalRecords.push(newPr);
    saveState();
  }
}

// ======== INIT ========
window.addEventListener("DOMContentLoaded", () => {
  // wire tab buttons
  $$(".tab-btn").forEach(btn => btn.addEventListener("click", () => openTab(btn.dataset.tab)));

  // wire search
  const searchInput = $("#exercise-search");
  if (searchInput) searchInput.addEventListener("input", handleExerciseSearch);

  // sets modal buttons
  const addSetBtn = $("#add-set-btn");
  if (addSetBtn) addSetBtn.addEventListener("click", addSetToCurrentExercise);

  // routine modal buttons
  const saveRoutineBtn = $("#save-routine-btn");
  if (saveRoutineBtn) saveRoutineBtn.addEventListener("click", saveRoutine);
  const deleteRoutineBtn = $("#delete-routine-btn");
  if (deleteRoutineBtn) deleteRoutineBtn.addEventListener("click", deleteRoutine);

  // top create routine (in Routines view header)
  const topCreate = $("#top-create-routine");
  if (topCreate) topCreate.addEventListener("click", () => openRoutineModal());

  // load state and render
  loadState();
  renderApp();
});

// Expose functions used by HTML onclick attributes
window.openTab = openTab;
window.openLibraryModal = openLibraryModal;
window.closeModal = closeModal;
window.openSetsModal = openSetsModal;
window.openRoutineModal = openRoutineModal;
window.removeExerciseFromRoutine = removeExerciseFromRoutine;
window.saveRoutine = saveRoutine;
window.deleteRoutine = deleteRoutine;
window.startWorkoutFromRoutine = startWorkoutFromRoutine;
window.editRoutineExercise = editRoutineExercise;
window.skipCurrentExercise = () => { if (activeWorkout) { /* placeholder for direct binding */ renderTodayView(); } };
