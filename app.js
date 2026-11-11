/* Popote — interface. Les règles et les calculs sont dans planner.js, les assiettes dans plate.js. */
(() => {
  "use strict";

  const ING = window.INGREDIENTS;
  const RECIPES = window.RECIPES;
  const AISLES = window.AISLES;
  const P = window.createPlanner({ INGREDIENTS: ING, RECIPES });
  const { STORES, DIETS, LEVELS, TIMES, DINNER_COUNTS, EQUIPMENT } = P;

  const KEY = "popote.v1";
  const VERSION = "2.1";
  const TABS = ["menu", "recettes", "courses", "reglages"];
  const root = document.documentElement;
  const hostTheme = root.getAttribute("data-theme"); // thème imposé par la page qui héberge l'appli, s'il y en a un

  /* ---------- État ---------- */
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const freshState = () => ({
    prefs: clone(P.DEFAULTS), menu: [], checked: {}, extras: [], favorites: [], history: [], week: null, onboarded: false, theme: "auto",
  });
  let state = load();

  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { s = null; }
    if (!s || typeof s !== "object") return freshState();
    const ids = new Set(RECIPES.map((r) => r.id));
    const d = P.DEFAULTS;
    const sp = s.prefs && typeof s.prefs === "object" ? s.prefs : {};
    const list = (v, fallback, ok) => (Array.isArray(v) ? v.filter(ok) : fallback.slice());
    const num = (v, fallback, min, max) => (Number.isFinite(+v) ? Math.min(max, Math.max(min, +v)) : fallback);
    const prefs = {
      people: Math.round(num(sp.people, d.people, 1, 10)),
      dinners: DINNER_COUNTS.includes(+sp.dinners) ? +sp.dinners : d.dinners,
      sunday: typeof sp.sunday === "boolean" ? sp.sunday : d.sunday,
      budget: num(sp.budget, d.budget, 20, 160),
      level: LEVELS.some((l) => l.v === +sp.level) ? +sp.level : d.level,
      time: TIMES.includes(+sp.time) ? +sp.time : d.time,
      store: STORES.some((x) => x.id === sp.store) ? sp.store : d.store,
      diets: list(sp.diets, d.diets, (x) => DIETS.some((k) => k.id === x)),
      equipment: list(sp.equipment, d.equipment, (x) => EQUIPMENT.some((k) => k.id === x)),
      pantry: list(sp.pantry, d.pantry, (x) => !!ING[x]),
      dislikes: list(sp.dislikes, d.dislikes, (x) => !!ING[x]),
    };
    return {
      prefs,
      menu: Array.isArray(s.menu) ? s.menu.filter((m) => m && ids.has(m.id)).map((m) => (m.sun ? { id: m.id, locked: !!m.locked, sun: true } : { id: m.id, locked: !!m.locked })) : [],
      checked: s.checked && typeof s.checked === "object" ? s.checked : {},
      extras: Array.isArray(s.extras) ? s.extras.filter((e) => e && typeof e.name === "string" && e.id).map((e) => ({ id: String(e.id), name: e.name.slice(0, 60), done: !!e.done })) : [],
      favorites: Array.isArray(s.favorites) ? s.favorites.filter((id) => ids.has(id)) : [],
      history: Array.isArray(s.history) ? s.history.slice(0, 2).map((w) => (Array.isArray(w) ? w.filter((id) => ids.has(id)) : [])) : [],
      week: typeof s.week === "string" ? s.week : null,
      onboarded: !!(s.onboarded || s.customized),
      theme: ["auto", "light", "dark"].includes(s.theme) ? s.theme : "auto",
    };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* stockage indisponible : l'appli marche quand même */ }
  }

  /* ---------- Utilitaires ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
  const euroRound = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const fmtE = (n) => euro.format(n);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;
  const ctx = (extra) => ({ prefs: state.prefs, favorites: state.favorites, history: state.history, ...extra });
  const store = () => P.storeOf(state.prefs.store);
  const portion = (r) => P.portionCost(r, state.prefs.store);
  const inPantry = (id) => state.prefs.pantry.includes(id);
  /* Lundi de la semaine planifiée (avec le dimanche, la semaine dure jusqu'au dimanche soir). */
  const ws = () => P.weekStart(new Date(), P.lastOffset(state.prefs));
  const toggleIn = (arr, v) => { const k = arr.indexOf(v); if (k >= 0) arr.splice(k, 1); else arr.push(v); };

  const icons = {
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    hat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17h10v3H7zM7 17a4 4 0 1 1 1.5-7.7A4 4 0 0 1 16 8a4 4 0 0 1 1 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    pan: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="13" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 13h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    swap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h13l-3-3M20 15H7l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    unlock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    heart: '<svg class="heart-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5S4 15.6 4 9.8A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 20 9.8c0 5.8-8 10.7-8 10.7Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    out: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h9v9M18 6 7 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  const meta = (r, withLevel = true) =>
    `<span>${icons.clock}${P.fmtTime(r.time)}</span>${withLevel ? `<span>${icons.hat}${P.levelLabel(r.level)}</span>` : ""}<span>${icons.pan}${P.devicesLabel(r, state.prefs)}</span>`;

  /* ---------- Menu : opérations ---------- */
  function pruneChecked() {
    const need = P.needs(state.menu, state.prefs.people);
    for (const id of Object.keys(state.checked)) if (!need[id] || inPantry(id)) delete state.checked[id];
  }
  function regenerate(keepLocked = true) {
    state.menu = P.generate(ctx({ previous: state.menu, keepLocked }));
    pruneChecked();
    save();
  }
  /* Nouvelle semaine : l'ancien menu part dans l'historique (pour ne pas le reproposer) et on repart d'une liste vide. */
  function syncWeek() {
    const wk = P.isoDate(ws());
    if (state.week === wk) return false;
    if (state.week && state.menu.length) {
      state.history = [state.menu.map((m) => m.id), ...state.history].slice(0, 2);
      state.menu = [];
      state.checked = {};
      state.extras = state.extras.filter((e) => !e.done);
    }
    state.week = wk;
    return true;
  }
  /* Photographie du menu pour le bouton « Annuler ». */
  function snapshot() {
    const snap = JSON.stringify({ menu: state.menu, checked: state.checked });
    const sheetId = sheetCtx && sheetCtx.id;
    return () => {
      Object.assign(state, JSON.parse(snap));
      if (sheetCtx && sheetId) sheetCtx.id = sheetId;
      save();
      refresh();
      toast("C'est annulé.");
    };
  }

  function dayFromOff(off) {
    const d = ws();
    d.setDate(d.getDate() + off);
    const name = P.DAY_NAMES[off];
    return { off, name, short: name.slice(0, 3), num: d.getDate(), label: `${name} ${d.getDate()}` };
  }
  /* Jour du i-ème repas du menu. */
  const dayInfo = (i) => dayFromOff(P.menuDays(state.menu, state.prefs)[i] ?? i);
  const mealWord = (m) => (m && m.sun ? "le repas" : "le dîner");
  /* Le dîner de ce soir s'il est prévu, sinon le prochain. */
  function nextDinner() {
    if (!state.menu.length) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((today - ws()) / 864e5);
    for (let i = 0; i < state.menu.length; i++) {
      const off = dayInfo(i).off;
      if (off >= diff) return { i, tonight: off === diff };
    }
    return { i: 0, tonight: false };
  }

  /* ---------- Éléments communs ---------- */
  function listCounts() {
    const lines = P.shoppingLines(state.menu, state.prefs);
    const done = lines.filter((l) => state.checked[l.id]).length + state.extras.filter((e) => e.done).length;
    const total = lines.length + state.extras.length;
    return { lines, total, done, left: total - done };
  }
  function renderChrome() {
    const pill = $("#store-pill");
    pill.textContent = store().name;
    pill.setAttribute("aria-label", `Magasin : ${store().name}. Changer dans les réglages`);
    const { left } = listCounts();
    const badge = $("#tab-badge");
    badge.hidden = left <= 0;
    badge.textContent = left;
    $("#week-label").textContent = "Sem. du " + ws().toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  }

  /* ---------- Écran Menu ---------- */
  let tonightShown = null;

  function renderMenu(fresh = []) {
    const p = state.prefs;
    const n = state.menu.length;
    const wanted = P.slots(p).length;
    const weekN = state.menu.filter((m) => !m.sun).length;
    const hasSun = state.menu.some((m) => m.sun);
    $("#menu-sub").textContent = `${plural(weekN, "dîner")}${hasSun ? " + le dimanche" : ""} · ${plural(p.people, "personne")} · ${p.time === 60 ? "1 h" : p.time + " min"} max en semaine`
      + (n && n < wanted ? ` · seulement ${n} repas sur ${wanted} : pas assez de recettes pour tes réglages` : "");

    $("#dinners").innerHTML = !n
      ? `<li class="empty"><h2>Aucune recette ne correspond</h2><p class="muted">Tes réglages sont trop stricts. Ajoute un équipement, allonge le temps en cuisine ou retire un « je n'aime pas ».</p><button class="btn" type="button" data-act="nav" data-v="reglages">Ouvrir les réglages</button></li>`
      : state.menu.map((m, i) => {
        const r = P.byId(m.id);
        const d = dayInfo(i);
        const use = P.pantryUse(r, p).map((id) => ING[id].name.toLowerCase().replace(/\s*\(.*\)/, ""));
        return `<li class="dinner${m.sun ? " sunday" : ""}${m.locked ? " locked" : ""}${fresh.includes(i) ? " fresh" : ""}">
          ${m.sun ? `<span class="sun-ribbon">Plat du dimanche${r.sunday ? ` · ${P.fmtTime(r.time)}` : ""}</span>` : ""}
          ${m.locked ? '<span class="sticker">Gardé</span>' : ""}
          <div class="date" aria-hidden="true"><span>${d.short}</span><b>${d.num}</b></div>
          <div class="dinner-main">
            <button class="dinner-name" type="button" data-act="open" data-v="${i}"><span class="sr-only">${d.label} : </span>${esc(r.name)}</button>
            <div class="meta">${meta(r)}</div>
            ${use.length ? `<div><span class="pill">Placard : ${esc(use.slice(0, 2).join(", "))}</span></div>` : ""}
          </div>
          <button class="plate-btn" type="button" data-act="open" data-v="${i}" tabindex="-1" aria-hidden="true">${window.plateSVG(r)}</button>
          <div class="dinner-foot">
            <span class="tag">${fmtE(portion(r))} <small>la part</small></span>
            <div class="dinner-btns">
              <button class="icon-btn" type="button" data-act="swap" data-v="${i}" aria-label="Changer ${mealWord(m)} de ${d.name.toLowerCase()}" title="Changer">${icons.swap}</button>
              <button class="icon-btn" type="button" data-act="lock" data-v="${i}" aria-pressed="${m.locked}" aria-label="Garder ${mealWord(m)} de ${d.name.toLowerCase()}" title="${m.locked ? "Gardé pour le prochain menu" : "Garder"}">${m.locked ? icons.lock : icons.unlock}</button>
            </div>
          </div>
        </li>`;
      }).join("");

    renderTonight();
    renderBudget();
  }

  function renderTonight() {
    const box = $("#tonight");
    const nd = nextDinner();
    if (!nd) { box.className = "tonight"; box.innerHTML = ""; tonightShown = null; return; }
    const r = P.byId(state.menu[nd.i].id);
    const p = state.prefs;
    box.className = "tonight gingham" + (tonightShown !== r.id ? " anim" : "");
    tonightShown = r.id;
    box.innerHTML = `
      <div class="tonight-text">
        <p class="eyebrow">${state.menu[nd.i].sun ? (nd.tonight ? "Aujourd'hui · plat du dimanche" : `Plat du dimanche · ${dayInfo(nd.i).label}`) : `${nd.tonight ? "Ce soir" : "Prochain dîner"} · ${dayInfo(nd.i).label}`}</p>
        <h2>${esc(r.name)}</h2>
        <div class="meta">${meta(r, false)}<span>${fmtE(portion(r) * p.people)} pour ${p.people}</span></div>
        <div class="tonight-actions">
          <button class="btn btn-yellow" type="button" data-act="open" data-v="${nd.i}">Voir la recette</button>
          <button class="btn btn-outline-light" type="button" data-act="swap" data-v="${nd.i}">${icons.swap}Changer</button>
        </div>
        ${state.menu[nd.i].sun && r.time >= 90 ? `<p class="tonight-tip">Prévois ${P.fmtTime(r.time)} : lance-le en début d'après-midi pour un dîner, ou le matin pour le déjeuner.</p>` : ""}
      </div>
      <div class="tonight-plate" aria-hidden="true">${window.plateSVG(r, true)}</div>`;
  }

  function renderBudget() {
    const p = state.prefs;
    const n = state.menu.length;
    const total = P.shoppingTotal(state.menu, p);
    const ratio = p.budget ? total / p.budget : 0;
    const over = total > p.budget + 0.005;
    $("#receipt-store").textContent = store().name;
    $("#receipt-lines").innerHTML = `
      <div class="row"><dt>${n} repas × ${p.people} pers.</dt><dd>${plural(n * p.people, "assiette")}</dd></div>
      <div class="row"><dt>Courses estimées</dt><dd>${fmtE(total)}</dd></div>
      <div class="row"><dt>Budget</dt><dd>${fmtE(p.budget)}</dd></div>
      <div class="row total${over ? " over" : ""}"><dt>${over ? "Dépassement" : "Reste"}</dt><dd>${fmtE(Math.abs(p.budget - total))}</dd></div>`;
    $("#gauge-fill").style.width = Math.min(100, ratio * 100).toFixed(1) + "%";
    const gauge = $("#gauge");
    gauge.classList.toggle("over", over);
    gauge.setAttribute("aria-valuenow", Math.round(Math.min(1, ratio) * 100));
    gauge.setAttribute("aria-valuetext", `${fmtE(total)} sur ${fmtE(p.budget)}`);
    $("#budget").classList.toggle("over", over);
    const plates = n * p.people;
    $("#budget-note").textContent = !n ? "" : over
      ? "Même avec les plats les moins chers, ce menu dépasse. Augmente le budget, réduis le nombre de dîners ou coche ce que tu as déjà au placard."
      : `Dans le budget : ${fmtE(total / plates)} par assiette.`;
  }

  /* ---------- Écran Recettes ---------- */
  const catalog = { q: "", filter: "all" };
  const FILTERS = [
    { id: "all", label: "Toutes", test: () => true },
    { id: "mine", label: "Selon mes réglages", test: (r) => (r.sunday ? state.prefs.sunday && P.eligibleSunday(r, state.prefs) : P.eligible(r, state.prefs)) },
    { id: "sunday", label: "Du dimanche", test: (r) => !!r.sunday },
    { id: "fav", label: "Favoris", test: (r) => state.favorites.includes(r.id) },
    { id: "quick", label: "20 min max", test: (r) => r.time <= 20 },
    { id: "vege", label: "Végétariennes", test: (r) => P.isVegetarian(r) },
    { id: "af", label: "Air fryer", test: (r) => !!(r.af || r.afTip) },
    { id: "cheap", label: "Moins de 2 € la part", test: (r) => portion(r) < 2 },
  ];
  const searchIndex = new Map(RECIPES.map((r) => [r.id, norm(r.name + " " + Object.keys(r.ing).map((id) => ING[id].name).join(" "))]));
  const byName = RECIPES.slice().sort((a, b) => a.name.localeCompare(b.name, "fr"));

  function renderRecipes() {
    const f = FILTERS.find((x) => x.id === catalog.filter) || FILTERS[0];
    const words = norm(catalog.q).split(/\s+/).filter(Boolean);
    const list = byName.filter((r) => f.test(r) && words.every((w) => searchIndex.get(r.id).includes(w)));
    $("#recettes-sub").textContent = list.length === RECIPES.length
      ? `${RECIPES.length} recettes, à mettre au menu le jour que tu veux.`
      : `${plural(list.length, "recette")} sur ${RECIPES.length}`;
    $("#filters").innerHTML = FILTERS.map((x) => `<button type="button" class="chip" data-act="filter" data-v="${x.id}" aria-pressed="${x.id === f.id}">${x.label}</button>`).join("");

    const grid = $("#rgrid");
    if (!list.length) {
      const msg = f.id === "fav" && !words.length
        ? ["Pas encore de favori", "Touche le cœur d'une recette pour la retrouver ici. Popote propose plus souvent tes favoris."]
        : ["Aucune recette trouvée", words.length ? `Rien pour « ${esc(catalog.q.trim())} » avec ce filtre.` : "Aucune recette ne correspond à ce filtre."];
      grid.innerHTML = `<li class="empty"><h2>${msg[0]}</h2><p class="muted">${msg[1]}</p><button class="btn btn-ghost" type="button" data-act="filter" data-v="all" data-clear="1">Voir toutes les recettes</button></li>`;
      return;
    }
    grid.innerHTML = list.map((r) => {
      const idx = state.menu.findIndex((m) => m.id === r.id);
      const fav = state.favorites.includes(r.id);
      return `<li class="rcard">
        <button type="button" class="rcard-main" data-act="open-recipe" data-v="${r.id}">
          <span class="rcard-plate">${window.plateSVG(r)}</span>
          <span class="rcard-name">${esc(r.name)}</span>
          <span class="rcard-meta">${P.fmtTime(r.time)} · ${fmtE(portion(r))}</span>
          ${r.sunday && idx < 0 ? '<span class="rcard-badge rcard-sun">Du dimanche</span>' : ""}
          ${idx >= 0 ? `<span class="rcard-badge">Au menu · ${dayInfo(idx).short.toLowerCase()}.</span>` : ""}
        </button>
        <button type="button" class="heart" data-act="fav" data-v="${r.id}" aria-pressed="${fav}" aria-label="${fav ? "Retirer" : "Ajouter"} ${esc(r.name)} ${fav ? "des" : "aux"} favoris">${icons.heart}</button>
      </li>`;
    }).join("");
  }

  /* ---------- Écran Courses ---------- */
  const AISLE_LOOK = {
    legumes: [110, '<path d="M5 19C5 10 11 5 19 5c0 8-5 14-14 14Z M5 19l8-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'],
    boucherie: [8, '<path d="M3 12c3-4 7-5 11-4l6-3v14l-6-3c-4 1-8 0-11-4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="8" cy="11" r="1" fill="currentColor"/>'],
    frais: [205, '<path d="M8 3h8l1.5 4v14h-11V7Z M6.5 7h11" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'],
    epicerie: [38, '<path d="M7 3h10v3H7Z M6 6h12v15H6Z M6 11h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'],
    surgeles: [195, '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'],
    boulangerie: [28, '<path d="M3 14c0-5 4-8 9-8s9 3 9 8v4H3Z M9 9l-1.5 5M13 8.5l-1 5.5M17 9.5l-1 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'],
    extras: [280, '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'],
  };
  const aisleHead = (id, name, right) =>
    `<div class="aisle-head"><span class="aisle-icon" style="--h:${AISLE_LOOK[id][0]}"><svg viewBox="0 0 24 24" aria-hidden="true">${AISLE_LOOK[id][1]}</svg></span><h2>${name}</h2><span>${right}</span></div>`;

  function renderList() {
    const { lines, total, done } = listCounts();
    const sum = lines.reduce((s, l) => s + l.cost, 0);
    $("#list-total").textContent = fmtE(sum);
    $("#list-sub").textContent = total
      ? `${plural(total, "article")} chez ${store().name} · ${plural(state.menu.length, "dîner")}`
      : "Rien à acheter pour l'instant.";
    $("#ring").style.strokeDashoffset = (119.4 * (1 - (total ? done / total : 0))).toFixed(1);
    $("#ring-label").textContent = `${done}/${total}`;
    $("#done-banner").hidden = !(total > 0 && done === total);

    const extras = state.extras.length ? `<section class="aisle">
        ${aisleHead("extras", "Mes ajouts", plural(state.extras.length, "article"))}
        <ul class="items">${state.extras.map((e) => `<li class="item${e.done ? " done" : ""}">
          <input class="check" type="checkbox" id="x-${esc(e.id)}" data-extra="${esc(e.id)}" ${e.done ? "checked" : ""}>
          <div class="item-main"><label for="x-${esc(e.id)}"><span class="item-name">${esc(e.name)}</span></label></div>
          <button class="icon-btn icon-btn-sm" type="button" data-act="del-extra" data-v="${esc(e.id)}" aria-label="Retirer ${esc(e.name)} de la liste">${icons.x}</button>
        </li>`).join("")}</ul>
      </section>` : "";

    $("#aisles").innerHTML = extras + AISLES.map((a) => {
      const items = lines.filter((l) => ING[l.id].aisle === a.id).sort((x, y) => ING[x.id].name.localeCompare(ING[y.id].name, "fr"));
      if (!items.length) return "";
      return `<section class="aisle">
        ${aisleHead(a.id, a.name, fmtE(items.reduce((s, l) => s + l.cost, 0)))}
        <ul class="items">${items.map(itemHTML).join("")}</ul>
      </section>`;
    }).join("");

    renderCompare(sum);

    const used = P.pantryUsed(state.menu, state.prefs);
    $("#pantry-note").innerHTML = used.length
      ? `<b>Pas sur la liste, car déjà dans ton placard :</b> ${used.map((id) => esc(ING[id].name.toLowerCase())).join(", ")}. <button class="btn-link" type="button" data-act="nav" data-v="reglages">Modifier mon placard</button>`
      : "";
  }

  function itemHTML(l) {
    const g = ING[l.id];
    const checked = !!state.checked[l.id];
    const st = store();
    const unit = P.priceOf(l.id, st.id);
    let detail;
    if (g.pack) {
      detail = `${l.packs} × ${P.fmtPack(l.id) || "1"} · il en faut ${P.fmtQty(l.id, l.need)}`;
      if (l.leftover > g.pack * 0.15) detail += ` · <span class="leftover">reste ${P.fmtQty(l.id, l.leftover)}</span>`;
    } else if (g.unit === "pc") {
      detail = `${plural(l.qty, "pièce")} · ${fmtE(unit)} pièce`;
    } else {
      detail = `${P.fmtQty(l.id, l.qty)} au poids · ${fmtE(unit)}/kg`;
    }
    const perKg = g.pack && g.unit !== "pc" ? `<small>${fmtE((unit / g.pack) * 1000)}/${g.unit === "g" ? "kg" : "L"}</small>` : "";
    const link = st.searchUrl
      ? `<a class="find" href="${st.searchUrl + encodeURIComponent(g.name.replace(/\s*\(.*\)/, ""))}" target="_blank" rel="noopener">Voir sur ${st.site}${icons.out}</a>`
      : "";
    const have = window.PANTRY.includes(l.id) ? `<button class="btn-link" type="button" data-act="have" data-v="${l.id}">Je l'ai déjà</button>` : "";
    return `<li class="item${checked ? " done" : ""}">
      <input class="check" type="checkbox" id="chk-${l.id}" data-check="${l.id}" ${checked ? "checked" : ""}>
      <div class="item-main">
        <label for="chk-${l.id}"><span class="item-name">${esc(g.name)}</span><span class="item-sub">${detail}</span></label>
        ${link}
      </div>
      <div class="item-price"><b>${fmtE(l.cost)}</b>${perKg}${have}</div>
    </li>`;
  }

  function renderCompare(sum) {
    const box = $("#compare");
    if (!sum) { box.innerHTML = ""; return; }
    const rows = P.storeTotals(state.menu, state.prefs);
    const cur = rows.find((x) => x.id === store().id);
    const cheapest = rows.reduce((a, b) => (b.total < a.total ? b : a));
    const max = Math.max(...rows.map((x) => x.total));
    box.innerHTML = `
      <div class="compare-head">
        <h2 id="compare-title">Ce panier selon le magasin</h2>
        <span class="muted">Touche une enseigne pour la choisir</span>
      </div>
      <ul class="compare-list">${rows.map((r) => {
        const diff = r.total - cur.total;
        return `<li><button type="button" data-act="store" data-v="${r.id}" aria-pressed="${r.id === cur.id}">
          <span class="c-name">${r.name}</span>
          <span class="c-bar"><span style="width:${((r.total / max) * 100).toFixed(1)}%"></span></span>
          <span class="c-total">${fmtE(r.total)}</span>
          <span class="c-diff">${r.id === cur.id ? "ton choix" : (diff > 0 ? "+" : "−") + fmtE(Math.abs(diff))}</span>
        </button></li>`;
      }).join("")}</ul>
      <p class="compare-note">Estimation d'après les écarts moyens entre enseignes (palmarès UFC-Que Choisir 2026, étude 2025 sur 80 produits). ${cheapest.id === cur.id ? "Tu es déjà chez l'enseigne la moins chère en moyenne." : `Chez ${cheapest.name}, ce panier coûterait environ ${fmtE(cur.total - cheapest.total)} de moins. Si c'est plus loin, le trajet peut coûter davantage.`} Les prix réels varient d'un magasin à l'autre.</p>`;
  }

  function listText() {
    const { lines } = listCounts();
    const sum = lines.reduce((s, l) => s + l.cost, 0);
    const head = `Courses ${store().name}, semaine du ${ws().toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} (environ ${fmtE(sum)})`;
    const body = AISLES.map((a) => {
      const items = lines.filter((l) => ING[l.id].aisle === a.id);
      if (!items.length) return "";
      return `\n${a.name}\n` + items.map((l) => {
        const g = ING[l.id];
        const q = g.pack ? `${l.packs} × ${P.fmtPack(l.id) || "1"}` : g.unit === "pc" ? `${l.qty}` : P.fmtQty(l.id, l.qty);
        return `${state.checked[l.id] ? "☑" : "☐"} ${g.name} : ${q}`;
      }).join("\n");
    }).filter(Boolean).join("\n");
    const extras = state.extras.length ? "\n\nMes ajouts\n" + state.extras.map((e) => `${e.done ? "☑" : "☐"} ${e.name}`).join("\n") : "";
    const menu = "\n\nAu menu\n" + state.menu.map((m, i) => `${dayInfo(i).label} : ${P.byId(m.id).name}`).join("\n");
    return head + "\n" + body + extras + menu;
  }

  /* ---------- Réglages (aussi utilisés par l'accueil guidé) ---------- */
  const seg = (legend, attrs, options, current) =>
    `<fieldset class="field"><legend>${legend}</legend><div class="seg" role="radiogroup">${options.map(([v, label]) =>
      `<button type="button" role="radio" aria-checked="${String(v) === String(current)}" ${attrs} data-v="${v}">${label}</button>`).join("")}</div></fieldset>`;
  const chips = (legend, act, options, isOn, extraClass = "", hint = "") =>
    `<fieldset class="field"><legend>${legend}</legend>${hint ? `<p class="field-hint muted">${hint}</p>` : ""}<div class="chips ${extraClass}">${options.map(([v, label]) =>
      `<button type="button" class="chip" data-act="${act}" data-v="${v}" aria-pressed="${isOn(v)}">${esc(label)}</button>`).join("")}</div></fieldset>`;
  const plateHint = () => {
    const p = state.prefs;
    const meals = P.slots(p).length;
    return `Soit ${fmtE(p.budget / (meals * p.people))} par assiette pour ${meals} repas à ${p.people}.`;
  };

  const C = {
    people: () => `<fieldset class="field"><legend>Combien êtes-vous à table ?</legend>
      <div class="stepper">
        <button type="button" class="step" data-act="people" data-v="-1" aria-label="Une personne de moins">−</button>
        <output aria-live="polite">${state.prefs.people}</output>
        <button type="button" class="step" data-act="people" data-v="1" aria-label="Une personne de plus">+</button>
      </div></fieldset>`,
    dinners: () => seg("Combien de dîners par semaine ?", 'data-act="set" data-k="dinners"', DINNER_COUNTS.map((n) => [n, n]), state.prefs.dinners),
    sunday: () => seg("Le dimanche", 'data-act="sunday"', [[1, "Un plat plus élaboré"], [0, "Comme en semaine"]], state.prefs.sunday ? 1 : 0)
      .replace("</legend>", '</legend><p class="field-hint muted">Bourguignon, poulet rôti, lasagnes… Un plat plus long à préparer, sans la limite de temps des soirs de semaine. Il s\'ajoute aux dîners de la semaine.</p>'),
    store: () => seg("Où fais-tu tes courses ?", 'data-act="store"', STORES.map((s) => [s.id, s.name]), state.prefs.store),
    budget: (scope) => `<div class="field"><label class="legend" for="${scope}-budget">Budget courses par semaine</label>
      <div class="range-row"><input type="range" id="${scope}-budget" data-range="budget" min="20" max="160" step="5" value="${state.prefs.budget}"><output class="tag tag-mid" for="${scope}-budget">${euroRound.format(state.prefs.budget)}</output></div>
      <p class="field-hint muted">${plateHint()}</p></div>`,
    equipment: () => chips("Mon équipement", "equip", EQUIPMENT.map((e) => [e.id, e.label]), (v) => state.prefs.equipment.includes(v), "",
      "Sans four mais avec un air fryer, les gratins, pizzas et rôtis passent au air fryer."),
    level: () => seg("Mon niveau en cuisine", 'data-act="set" data-k="level"', LEVELS.map((l) => [l.v, l.label]), state.prefs.level),
    time: () => seg("Temps maximum le soir", 'data-act="set" data-k="time"', TIMES.map((t) => [t, t === 60 ? "1 h" : t + " min"]), state.prefs.time),
    diets: () => chips("Régime", "diet", [["", "Je mange de tout"], ...DIETS.map((d) => [d.id, d.label])], (v) => (v ? state.prefs.diets.includes(v) : !state.prefs.diets.length)),
    dislikes: () => chips("Je n'aime pas", "dislike", window.DISLIKES.map((id) => [id, ING[id].name]), (v) => state.prefs.dislikes.includes(v), "chips-no"),
    pantry: () => chips("Ce que j'ai déjà", "pantry", window.PANTRY.map((id) => [id, ING[id].name]), (v) => inPantry(v), "",
      "Ces ingrédients ne sont pas ajoutés à la liste, et le menu les utilise en priorité."),
    theme: () => seg("Thème", 'data-act="theme"', [["auto", "Automatique"], ["light", "Clair"], ["dark", "Sombre"]], state.theme),
  };
  const group = (title, body) => `<div class="group"><h2 class="group-title">${title}</h2>${body}</div>`;
  let confirmReset = false;

  function renderSettings() {
    const data = `
      <div class="field"><p class="legend">Accueil guidé</p><p class="field-hint muted">Refais les quatre questions du premier lancement.</p>
        <button type="button" class="btn btn-ghost btn-small" data-act="replay">Refaire la configuration</button></div>
      <div class="field"><p class="legend">Tout effacer</p>
        ${confirmReset
          ? `<p class="field-hint">Effacer tes réglages, tes favoris, ton menu et ta liste ? C'est définitif.</p>
             <div class="row-btns"><button type="button" class="btn btn-danger btn-small" data-act="reset-confirm">Oui, tout effacer</button><button type="button" class="btn btn-ghost btn-small" data-act="reset-cancel">Annuler</button></div>`
          : `<p class="field-hint muted">Réglages, favoris, menu et liste sont enregistrés sur cet appareil uniquement.</p>
             <button type="button" class="btn btn-ghost btn-small" data-act="reset-ask">Remettre à zéro</button>`}
      </div>`;
    $("#prefs").innerHTML =
      group("Le foyer", C.people() + C.dinners() + C.sunday()) +
      group("Les courses", C.store() + C.budget("set")) +
      group("En cuisine", C.equipment() + C.level() + C.time()) +
      group("Ce que je mange", C.diets() + C.dislikes()) +
      group("Mon placard", C.pantry()) +
      group("Apparence", C.theme()) +
      group("Mes données", data) +
      `<div class="about">
        <p><b>Popote ${VERSION}</b> · ${RECIPES.length} recettes</p>
        <p>Les prix sont des estimations : des moyennes de supermarché ajustées selon l'écart moyen entre enseignes (palmarès UFC-Que Choisir 2026). Ce ne sont pas les prix de ton magasin.</p>
        <p>Les régimes sont calculés à partir des ingrédients principaux. En cas d'allergie ou d'intolérance, vérifie toujours les étiquettes.</p>
      </div>`;
  }

  function prefsChanged({ regen = true } = {}) {
    if (obStep !== null) { save(); renderOnboarding(); return; }
    if (regen) regenerate(true); else { pruneChecked(); save(); }
    refresh();
  }

  function applyTheme() {
    if (state.theme === "auto") {
      if (hostTheme) root.setAttribute("data-theme", hostTheme); else root.removeAttribute("data-theme");
    } else root.setAttribute("data-theme", state.theme);
  }

  /* ---------- Accueil guidé ---------- */
  let obStep = null;
  const OB = [
    { title: "Pour combien de personnes ?", body: () => C.people() + C.dinners() + C.sunday() },
    { title: "Tes courses", lead: "Popote compose un menu qui tient dans ton budget et calcule les prix pour ton enseigne.", body: () => C.store() + C.budget("ob") },
    { title: "Ce que tu manges", lead: "Les recettes qui ne te conviennent pas ne seront jamais proposées.", body: () => C.diets() + C.dislikes() },
    { title: "Ta cuisine", lead: "Pour ne te proposer que ce que tu peux vraiment cuisiner un soir de semaine.", body: () => C.equipment() + C.level() + C.time() },
  ];

  function startOnboarding() {
    obStep = 0;
    if (!$("#sheet").hidden) closeSheet();
    $("#onboarding").hidden = false;
    $("#app").inert = true;
    renderOnboarding(true);
  }
  function renderOnboarding(focusTitle = false) {
    const s = OB[obStep];
    const welcome = obStep === 0 ? `
      <div class="ob-plates" aria-hidden="true">${["salade_nicoise", "shakshuka", "pesto"].map((id) => `<span>${window.plateSVG(P.byId(id), true)}</span>`).join("")}</div>
      <p class="ob-hello">Tes dîners de la semaine et ta liste de courses, dans ton budget.</p>
      <p class="muted">Quatre questions, moins d'une minute. Tu pourras tout changer ensuite.</p>` : "";
    $("#ob-progress").innerHTML = OB.map((_, i) => `<i class="${i <= obStep ? "on" : ""}"></i>`).join("");
    $("#ob-body").innerHTML = `${welcome}
      <p class="eyebrow ob-step">Question ${obStep + 1} sur ${OB.length}</p>
      <h1 id="ob-title" tabindex="-1">${s.title}</h1>
      ${s.lead ? `<p class="muted ob-lead">${s.lead}</p>` : ""}
      <div class="ob-fields">${s.body()}</div>`;
    $("#ob-back").hidden = obStep === 0;
    $("#ob-next").textContent = obStep === OB.length - 1 ? "Créer mon menu" : "Continuer";
    if (focusTitle) { $("#ob-body").scrollTop = 0; $("#ob-title").focus({ preventScroll: true }); }
  }
  function finishOnboarding() {
    obStep = null;
    state.onboarded = true;
    regenerate(true);
    $("#onboarding").hidden = true;
    $("#app").inert = false;
    tonightShown = null;
    if (location.hash && location.hash !== "#menu") go("menu"); else show("menu");
    renderChrome();
    toast("Ton menu de la semaine est prêt.");
  }

  /* ---------- Fiche recette ---------- */
  let sheetCtx = null; // { id, people, done:Set, anim } ou { copy:true }
  let lastFocus = null;

  function showSheet() {
    $("#sheet").hidden = false;
    $("#app").inert = true;
    document.body.style.overflow = "hidden";
    const sh = $("#sheet .sheet");
    sh.scrollTop = 0;
    sh.focus({ preventScroll: true });
  }
  function openSheet(id) {
    if (!id || !P.byId(id)) return;
    if ($("#sheet").hidden) lastFocus = document.activeElement;
    sheetCtx = { id, people: state.prefs.people, done: new Set(), anim: true };
    renderSheet();
    showSheet();
  }
  function closeSheet() {
    $("#sheet").hidden = true;
    $("#app").inert = obStep !== null;
    document.body.style.overflow = "";
    sheetCtx = null;
    if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }

  function renderSheet() {
    if (!sheetCtx || !sheetCtx.id) return;
    const r = P.byId(sheetCtx.id);
    const p = state.prefs;
    const { people, done } = sheetCtx;
    const idx = state.menu.findIndex((m) => m.id === r.id);
    const fav = state.favorites.includes(r.id);
    const why = r.sunday ? P.whyNotSunday(r, p) : P.whyNot(r, p);
    const toAF = P.ovenToAF(r, p);

    let afBox = "";
    if (p.equipment.includes("airfryer")) {
      if (toAF) afBox = `<div class="af-box"><b>Sans four, au air fryer</b><p>${esc(r.af)} Cette étape remplace le passage au four.</p></div>`;
      else if (r.af) afBox = `<div class="af-box"><b>Version air fryer</b><p>${esc(r.af)}</p></div>`;
      else if (r.afTip) afBox = `<div class="af-box"><b>Astuce air fryer</b><p>${esc(r.afTip)}</p></div>`;
    }

    const plan = idx >= 0
      ? `<section class="sheet-section plan">
          <h3>Au menu ${dayInfo(idx).name.toLowerCase()}${state.menu[idx].sun ? " (plat du dimanche)" : ""}</h3>
          <div class="row-btns">
            <button type="button" class="btn btn-ghost btn-small" data-act="swap" data-v="${idx}">${icons.swap}Changer ce plat</button>
            <button type="button" class="btn btn-ghost btn-small" data-act="lock" data-v="${idx}" aria-pressed="${state.menu[idx].locked}">${state.menu[idx].locked ? icons.lock + "Gardé" : icons.unlock + "Garder"}</button>
          </div>
        </section>`
      : `<section class="sheet-section plan">
          <h3>Mettre au menu</h3>
          <p class="muted small">Choisis le jour. Ce plat remplace celui qui est prévu et reste gardé.${r.sunday && !p.sunday ? " Tu peux aussi activer le plat du dimanche dans les réglages." : ""}</p>
          <div class="chips">${P.slots(p).map((slot, k) => {
            const d = dayFromOff(slot.off);
            const days = P.menuDays(state.menu, p);
            const cur = state.menu[days.indexOf(slot.off)];
            const curName = cur && P.byId(cur.id).name;
            return `<button type="button" class="chip${slot.sun ? " chip-sun" : ""}" data-act="put" data-v="${k}" aria-label="${d.label}${curName ? `, à la place de ${esc(curName)}` : ""}">${d.short} ${d.num}</button>`;
          }).join("")}</div>
        </section>`;

    $("#sheet-body").innerHTML = `
      <div class="sheet-hero gingham">
        <div class="sheet-plate${sheetCtx.anim ? " anim" : ""}" aria-hidden="true">${window.plateSVG(r, true)}</div>
        <p class="eyebrow">${idx >= 0 ? `Au menu · ${dayInfo(idx).label}` : "Recette"}</p>
        <h2 id="sheet-title">${esc(r.name)}</h2>
        <div class="meta">${meta(r)}</div>
        <div class="sheet-hero-row">
          <span class="tag">${fmtE(portion(r))} <small>la part</small></span>
          <button type="button" class="btn btn-small btn-outline-light fav-btn" data-act="fav" data-v="${r.id}" aria-pressed="${fav}">${icons.heart}${fav ? "Dans mes favoris" : "Ajouter aux favoris"}</button>
        </div>
      </div>
      <div class="sheet-body">
        ${why.length ? `<div class="note-warn"><b>Hors de tes réglages</b><p>Cette recette ${esc(why.join(", "))}.</p></div>` : ""}
        <section class="sheet-section">
          <div class="sheet-section-head">
            <h3>Ingrédients</h3>
            <div class="stepper stepper-sm" role="group" aria-label="Nombre de parts">
              <button type="button" class="step" data-act="sheet-people" data-v="-1" aria-label="Une part de moins">−</button>
              <output aria-live="polite">${people} <small>pers.</small></output>
              <button type="button" class="step" data-act="sheet-people" data-v="1" aria-label="Une part de plus">+</button>
            </div>
          </div>
          <ul class="ing-list">${Object.entries(r.ing).map(([id, q]) =>
            `<li><span>${esc(ING[id].name)}${inPantry(id) ? '<span class="have">placard</span>' : ""}</span><span class="qty">${P.fmtQty(id, q * people)}</span></li>`).join("")}</ul>
          <p class="sheet-note">Prévois aussi sel, poivre et un filet d'huile.</p>
        </section>
        <section class="sheet-section">
          <h3>Préparation</h3>
          ${afBox}
          <ol class="steps">${r.steps.map((s, k) => {
            const swapped = toAF && /four|°C/i.test(s);
            return `<li><button type="button" class="step-btn${swapped ? " swapped" : ""}" data-act="step-done" data-v="${k}" aria-pressed="${done.has(k)}"><span>${esc(s)}${swapped ? '<em class="swap-note">Au air fryer : voir l\'encadré ci-dessus.</em>' : ""}</span></button></li>`;
          }).join("")}</ol>
          <p class="sheet-note">Touche une étape pour la cocher au fur et à mesure.</p>
          ${r.tip ? `<div class="tip-box"><b>Le conseil</b><p>${esc(r.tip)}</p></div>` : ""}
        </section>
        ${plan}
      </div>`;
    sheetCtx.anim = false;
  }

  function showCopyFallback(text) {
    if ($("#sheet").hidden) lastFocus = document.activeElement;
    sheetCtx = { copy: true };
    $("#sheet-body").innerHTML = `<div class="sheet-body sheet-plain">
      <h2 id="sheet-title">Ta liste de courses</h2>
      <p class="muted">La copie automatique est bloquée ici. Sélectionne le texte, puis copie-le.</p>
      <label class="sr-only" for="copy-area">Liste de courses en texte</label>
      <textarea id="copy-area" readonly>${esc(text)}</textarea></div>`;
    showSheet();
    const ta = $("#copy-area");
    ta.focus();
    ta.select();
  }

  /* ---------- Toast ---------- */
  let toastT = 0;
  let undoFn = null;
  function toast(msg, undo) {
    const t = $("#toast");
    undoFn = undo || null;
    t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button" data-act="undo">Annuler</button>' : ""}`;
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.hidden = true; undoFn = null; }, undo ? 6000 : 2800);
  }

  /* ---------- Navigation ---------- */
  let current = "menu";
  function renderTab(tab, fresh) {
    if (tab === "menu") renderMenu(fresh);
    else if (tab === "recettes") renderRecipes();
    else if (tab === "courses") renderList();
    else renderSettings();
  }
  function refresh(fresh) {
    renderChrome();
    renderTab(current, fresh);
    if (sheetCtx && sheetCtx.id) renderSheet();
  }
  function show(tab) {
    if (!TABS.includes(tab)) tab = "menu";
    if (!$("#sheet").hidden) closeSheet();
    current = tab;
    confirmReset = false;
    TABS.forEach((t) => {
      $("#screen-" + t).hidden = t !== tab;
      const b = $(`.tab[data-v="${t}"]`);
      if (t === tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    $("#tabs-in").style.setProperty("--i", TABS.indexOf(tab));
    renderTab(tab);
    window.scrollTo({ top: 0 });
  }
  function go(tab) {
    if (location.hash === "#" + tab) return show(tab);
    try { location.hash = tab; } catch (e) { show(tab); }
  }
  window.addEventListener("hashchange", () => show(location.hash.slice(1)));

  /* ---------- Actions ---------- */
  const A = {
    nav: (v) => go(v),
    close: () => closeSheet(),
    open: (v) => openSheet(state.menu[+v] && state.menu[+v].id),
    "open-recipe": (v) => openSheet(v),
    undo: () => { const f = undoFn; undoFn = null; $("#toast").hidden = true; if (f) f(); },

    swap: (v) => {
      const i = +v;
      const old = state.menu[i];
      if (!old) return;
      const next = P.swap(state.menu, i, ctx());
      if (!next) return toast("Aucune autre recette ne correspond à tes réglages.");
      const undo = snapshot();
      state.menu = next;
      pruneChecked();
      save();
      if (sheetCtx && sheetCtx.id === old.id) Object.assign(sheetCtx, { id: next[i].id, done: new Set(), anim: true });
      refresh([i]);
      toast(`${dayInfo(i).name} : ${P.byId(next[i].id).name}`, undo);
    },
    lock: (v) => {
      const m = state.menu[+v];
      if (!m) return;
      m.locked = !m.locked;
      save();
      refresh();
      toast(m.locked ? "Gardé : ce dîner ne changera pas." : "Ce dîner pourra changer au prochain menu.");
    },
    regen: () => {
      if (state.menu.length && state.menu.every((m) => m.locked)) return toast("Tous les dîners sont gardés : rien à changer.");
      const undo = snapshot();
      const before = state.menu.map((m) => m.id);
      regenerate(true);
      refresh(state.menu.map((m, i) => (m.id !== before[i] ? i : -1)).filter((i) => i >= 0));
      toast("Voici un nouveau menu.", undo);
    },
    fav: (v) => {
      toggleIn(state.favorites, v);
      save();
      refresh();
      toast(state.favorites.includes(v) ? "Ajouté aux favoris. Popote le proposera plus souvent." : "Retiré des favoris.");
    },
    put: (v) => {
      const id = sheetCtx && sheetCtx.id;
      if (!id || state.menu.some((m) => m.id === id)) return;
      const slot = P.slots(state.prefs)[+v];
      if (!slot) return;
      const undo = snapshot();
      state.menu = P.place(state.menu, state.prefs, +v, id);
      // S'il manquait des repas (pas assez de recettes), on complète sans toucher au reste.
      if (state.menu.length < P.slots(state.prefs).length) state.menu = P.generate(ctx({ previous: state.menu, keepAll: true }));
      pruneChecked();
      save();
      const i = P.menuDays(state.menu, state.prefs).indexOf(slot.off);
      refresh([i]);
      const outside = !P.fitsHousehold(P.byId(id), state.prefs);
      toast(`${P.byId(id).name} est au menu de ${dayFromOff(slot.off).name.toLowerCase()}.`
        + (outside ? " Ce plat sort de ton régime : il sera remplacé si tu refais le menu." : ""), undo);
    },
    filter: (v, el) => {
      catalog.filter = v;
      if (el.dataset.clear) { catalog.q = ""; $("#search-input").value = ""; }
      renderRecipes();
    },

    copy: () => {
      const text = listText();
      const fallback = () => showCopyFallback(text);
      try {
        navigator.clipboard.writeText(text).then(() => toast("Liste copiée. Colle-la dans tes notes ou dans un message."), fallback);
      } catch (e) { fallback(); }
    },
    uncheck: () => {
      state.checked = {};
      state.extras.forEach((e) => { e.done = false; });
      save();
      refresh();
    },
    have: (v) => {
      state.prefs.pantry.push(v);
      delete state.checked[v];
      save();
      refresh();
      toast(`${ING[v].name} : noté dans ton placard.`, () => {
        state.prefs.pantry = state.prefs.pantry.filter((x) => x !== v);
        save();
        refresh();
      });
    },
    "del-extra": (v) => {
      const at = state.extras.findIndex((e) => e.id === v);
      if (at < 0) return;
      const [gone] = state.extras.splice(at, 1);
      save();
      refresh();
      toast(`${gone.name} retiré de la liste.`, () => { state.extras.splice(at, 0, gone); save(); refresh(); });
    },

    people: (v) => { state.prefs.people = Math.min(10, Math.max(1, state.prefs.people + +v)); prefsChanged(); },
    set: (v, el) => { state.prefs[el.dataset.k] = +v; prefsChanged(); },
    store: (v) => {
      state.prefs.store = v;
      prefsChanged({ regen: false });
      if (obStep === null) toast(`Prix estimés chez ${store().name}.`);
    },
    diet: (v) => {
      const p = state.prefs;
      if (!v) p.diets = [];
      else {
        toggleIn(p.diets, v);
        // « végétarien » et « poisson oui, viande non » s'excluent
        if (v === "vege") p.diets = p.diets.filter((x) => x !== "pesco");
        if (v === "pesco") p.diets = p.diets.filter((x) => x !== "vege");
      }
      prefsChanged();
    },
    equip: (v) => { toggleIn(state.prefs.equipment, v); prefsChanged(); },
    sunday: (v) => {
      state.prefs.sunday = v === "1";
      state.week = P.isoDate(ws()); // la fin de semaine change (vendredi ou dimanche) : on reste sur la même semaine
      prefsChanged();
      if (obStep === null) toast(state.prefs.sunday ? "Un plat du dimanche a été ajouté au menu." : "Plus de plat du dimanche : le menu ne compte que les dîners de la semaine.");
    },
    pantry: (v) => { toggleIn(state.prefs.pantry, v); prefsChanged(); },
    dislike: (v) => { toggleIn(state.prefs.dislikes, v); prefsChanged(); },
    theme: (v) => { state.theme = v; applyTheme(); save(); renderSettings(); },

    replay: () => startOnboarding(),
    "reset-ask": () => { confirmReset = true; renderSettings(); },
    "reset-cancel": () => { confirmReset = false; renderSettings(); },
    "reset-confirm": () => {
      state = freshState();
      confirmReset = false;
      try { localStorage.removeItem(KEY); } catch (e) { /* rien à effacer */ }
      applyTheme();
      syncWeek();
      regenerate(false);
      refresh();
      startOnboarding();
    },

    "ob-next": () => { if (obStep === OB.length - 1) finishOnboarding(); else { obStep++; renderOnboarding(true); } },
    "ob-back": () => { if (obStep > 0) { obStep--; renderOnboarding(true); } },
    "ob-skip": () => finishOnboarding(),

    "sheet-people": (v) => { if (sheetCtx) { sheetCtx.people = Math.min(12, Math.max(1, sheetCtx.people + +v)); renderSheet(); } },
    "step-done": (v) => {
      if (!sheetCtx) return;
      const k = +v;
      if (sheetCtx.done.has(k)) sheetCtx.done.delete(k); else sheetCtx.done.add(k);
      renderSheet();
    },
  };

  /* Après un nouveau rendu, remet le focus sur le même bouton (sinon le clavier repart du haut de la page). */
  const SCOPES = "#prefs, #ob-body, #sheet-body, #filters, #rgrid, #dinners, #aisles, #compare, #tonight";
  function focusKey(el) {
    if (!el || !el.closest) return null;
    const scope = el.closest(SCOPES);
    if (!scope) return null;
    const d = el.dataset;
    let sel = null;
    if (el.id) sel = "#" + CSS.escape(el.id);
    else if (d.act) sel = `[data-act="${d.act}"]` + (d.k ? `[data-k="${d.k}"]` : "") + (d.v !== undefined ? `[data-v="${CSS.escape(d.v)}"]` : "");
    return sel ? { scope: "#" + scope.id, sel } : null;
  }
  function restoreFocus(key) {
    if (!key) return;
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected) return;
    const el = $(`${key.scope} ${key.sel}`);
    if (el) el.focus({ preventScroll: true });
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const fn = A[el.dataset.act];
    if (!fn) return;
    const key = focusKey(el);
    fn(el.dataset.v, el);
    restoreFocus(key);
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "search-input") { catalog.q = t.value; renderRecipes(); return; }
    if (t.dataset && t.dataset.range === "budget") {
      state.prefs.budget = +t.value;
      const field = t.closest(".field");
      $("output", field).textContent = euroRound.format(state.prefs.budget);
      $(".field-hint", field).textContent = plateHint();
    }
  });

  document.addEventListener("change", (e) => {
    const t = e.target;
    const d = t.dataset || {};
    if (!d.range && !d.check && !d.extra) return;
    const key = focusKey(t);
    if (d.range === "budget") prefsChanged();
    else if (d.check) {
      if (t.checked) state.checked[d.check] = true; else delete state.checked[d.check];
      save();
      refresh();
    } else {
      const item = state.extras.find((x) => x.id === d.extra);
      if (item) item.done = t.checked;
      save();
      refresh();
    }
    restoreFocus(key);
  });

  $("#extra-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#extra-input");
    const name = input.value.trim().replace(/\s+/g, " ");
    if (!name) { input.focus(); return; }
    if (state.extras.some((x) => norm(x.name) === norm(name))) {
      toast(`${name} est déjà dans ta liste.`);
    } else {
      state.extras.push({ id: Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), name: name.slice(0, 60), done: false });
      save();
      refresh();
    }
    input.value = "";
    input.focus();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#sheet").hidden) closeSheet();
  });

  // Si l'appli reste ouverte jusqu'au week-end, elle passe à la semaine suivante au retour.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || obStep !== null) return;
    if (syncWeek()) { regenerate(false); tonightShown = null; refresh(); }
  });

  /* ---------- Démarrage ---------- */
  applyTheme();
  syncWeek();
  if (!state.menu.length) regenerate(false);
  else if (state.menu.length < P.slots(state.prefs).length) {
    // Menu enregistré par une version précédente (sans le dimanche) : on complète sans rien changer d'autre.
    state.menu = P.generate(ctx({ previous: state.menu, keepAll: true }));
    pruneChecked();
    save();
  } else { pruneChecked(); save(); }
  renderChrome();
  show(location.hash.slice(1) || "menu");
  if (!state.onboarded) startOnboarding();

  // Hors ligne : uniquement quand l'appli est servie comme un vrai site (pas dans un aperçu).
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol) && $('link[rel="manifest"]')) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* pas de mode hors ligne, l'appli marche quand même */ });
  }
})();
