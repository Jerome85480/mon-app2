/* Popote — logique de l'appli (aucune dépendance). */
(() => {
  "use strict";

  const ING = window.INGREDIENTS;
  const RECIPES = window.RECIPES;
  const AISLES = window.AISLES;
  const KEY = "popote.v1";

  const DIETS = [
    { id: "vege", label: "Végétarien", bans: ["viande", "porc", "poisson"] },
    { id: "pesco", label: "Poisson oui, viande non", bans: ["viande", "porc"] },
    { id: "sans_porc", label: "Sans porc", bans: ["porc"] },
    { id: "sans_gluten", label: "Sans gluten", bans: ["gluten"] },
    { id: "sans_lactose", label: "Sans lactose", bans: ["lactose"] },
  ];
  const LEVELS = [
    { v: 1, label: "Débutant" },
    { v: 2, label: "À l'aise" },
    { v: 3, label: "Cordon-bleu" },
  ];
  const TIMES = [20, 30, 45, 60];
  const EQUIPMENT = [
    { id: "plaque", label: "Plaques (induction, vitro, gaz)", short: "Plaques" },
    { id: "four", label: "Four", short: "Four" },
    { id: "airfryer", label: "Air fryer", short: "Air fryer" },
  ];
  const DINNER_COUNTS = [3, 4, 5, 6, 7];
  const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const DAY_PLAN = { 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] };
  // Ingrédient « principal » d'un plat, pour éviter deux fois la même chose dans la semaine.
  const MAINS = ["poulet", "boeuf", "saucisses", "lardons", "jambon", "chorizo", "saumon", "cabillaud", "thon", "tofu", "pois_chiches", "lentilles", "haricots", "oeufs", "gnocchis"];
  const STARCHES = ["pates", "riz", "riz_rond", "pdt", "semoule", "tortillas", "pate_pizza", "pate_brisee", "nouilles"];
  const BASICS = new Set(["huile", "curry", "paprika", "bouillon", "sauce_soja"]);

  /* Indice de prix moyen par enseigne, base 1 = E.Leclerc.
     Sources : palmarès UFC-Que Choisir 2026 (Intermarché hyper +3 %, Carrefour hyper +6,7 %,
     Auchan ≈ +13 %) et étude de mars 2025 sur 80 produits (Leclerc 2,5 % plus cher que Lidl).
     C'est une moyenne nationale : l'écart réel dépend du magasin et des produits. */
  const STORES = [
    { id: "lidl", name: "Lidl", index: 0.975, search: (q) => "https://www.lidl.fr/q/search?q=" + encodeURIComponent(q) },
    { id: "leclerc", name: "E.Leclerc", index: 1, search: (q) => "https://www.e.leclerc/recherche?q=" + encodeURIComponent(q) },
    { id: "intermarche", name: "Intermarché", index: 1.03 },
    { id: "carrefour", name: "Carrefour", index: 1.067 },
    { id: "auchan", name: "Auchan", index: 1.13 },
  ];

  const DEFAULTS = {
    people: 2,
    dinners: 5,
    budget: 40,
    diets: [],
    level: 2,
    time: 45,
    pantry: ["huile", "pates", "riz", "oignon", "ail", "bouillon", "curry", "paprika"],
    dislikes: [],
    store: "leclerc",
    equipment: ["plaque", "four"],
  };

  /* ---------- État ---------- */
  let state = load();

  function load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { saved = null; }
    const prefs = Object.assign({}, DEFAULTS, saved && saved.prefs);
    const ids = new Set(RECIPES.map((r) => r.id));
    const menu = Array.isArray(saved && saved.menu) ? saved.menu.filter((m) => m && ids.has(m.id)) : [];
    return {
      prefs,
      menu,
      checked: (saved && saved.checked) || {},
      customized: !!(saved && saved.customized),
    };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* stockage indisponible : l'appli marche quand même */ }
  }

  /* ---------- Utilitaires ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const byId = (id) => RECIPES.find((r) => r.id === id);
  const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
  const fmtE = (n) => euro.format(n);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const inPantry = (id) => state.prefs.pantry.includes(id);
  const storeOf = (id = state.prefs.store) => STORES.find((x) => x.id === id) || STORES[1];
  let priceIndex = null; // forcé temporairement pour comparer les enseignes
  const price = (id) => ING[id].price * (priceIndex ?? storeOf().index);

  function fmtQty(id, q) {
    const u = ING[id].unit;
    if (u === "pc") {
      const whole = Math.floor(q + 1e-9);
      const frac = q - whole;
      const fr = frac < 0.13 ? "" : frac < 0.38 ? "¼" : frac < 0.63 ? "½" : frac < 0.88 ? "¾" : "";
      const w = frac >= 0.88 ? whole + 1 : whole;
      return (w ? String(w) : "") + (fr ? (w ? " " : "") + fr : "") || "¼";
    }
    if (u === "g") {
      if (q >= 1000) return (Math.round(q / 50) * 50 / 1000).toLocaleString("fr-FR") + " kg";
      return (q < 100 ? Math.max(5, Math.round(q / 5) * 5) : Math.round(q / 10) * 10) + " g";
    }
    if (q >= 1000) return (Math.round(q / 50) * 50 / 1000).toLocaleString("fr-FR") + " L";
    return (q < 100 ? Math.max(5, Math.round(q / 5) * 5) : Math.round(q / 10) * 10) + " ml";
  }
  function fmtPack(id) {
    const g = ING[id];
    if (g.unit === "pc") return g.pack === 1 ? "" : `${g.pack} pc`;
    return fmtQty(id, g.pack);
  }

  function recipeFlags(r) {
    const f = new Set();
    Object.keys(r.ing).forEach((id) => (ING[id].flags || []).forEach((x) => f.add(x)));
    return f;
  }
  const has = (eq, p = state.prefs) => p.equipment.includes(eq);
  /* Le four peut être remplacé par l'air fryer quand la recette le permet (champ af). */
  function canCook(r, p = state.prefs) {
    return (r.need || []).every((n) => has(n, p) || (n === "four" && has("airfryer", p) && !!r.af));
  }
  const ovenToAF = (r) => (r.need || []).includes("four") && !has("four") && has("airfryer") && !!r.af;
  function devicesLabel(r) {
    return (r.need || []).map((n) => (n === "four" && ovenToAF(r) ? "Air fryer" : EQUIPMENT.find((e) => e.id === n).short)).join(" + ");
  }

  function eligible(r, p = state.prefs) {
    if (r.time > p.time || r.level > p.level) return false;
    if (!canCook(r, p)) return false;
    const flags = recipeFlags(r);
    for (const d of p.diets) {
      const diet = DIETS.find((x) => x.id === d);
      if (diet && diet.bans.some((b) => flags.has(b))) return false;
    }
    return !Object.keys(r.ing).some((id) => p.dislikes.includes(id));
  }

  /* Prix « consommé » par personne (part du paquet réellement utilisée). */
  function portionCost(r) {
    let c = 0;
    for (const [id, q] of Object.entries(r.ing)) {
      const g = ING[id];
      if (g.pack) c += (q / g.pack) * price(id);
      else if (g.unit === "pc") c += q * price(id);
      else c += (q / 1000) * price(id);
    }
    return c;
  }

  /* Ce qu'on achète vraiment : paquets entiers, vrac arrondi à 50 g. */
  function buyLine(id, qty) {
    const g = ING[id];
    if (g.pack) {
      const packs = Math.max(1, Math.ceil(qty / g.pack - 1e-6));
      return { qty, packs, cost: packs * price(id), leftover: packs * g.pack - qty };
    }
    if (g.unit === "pc") {
      const n = Math.max(1, Math.ceil(qty - 1e-6));
      return { qty: n, packs: 0, cost: n * price(id), leftover: n - qty };
    }
    const w = Math.max(50, Math.ceil(qty / 50) * 50);
    return { qty: w, packs: 0, cost: (w / 1000) * price(id), leftover: 0 };
  }

  function needs(menu, people = state.prefs.people) {
    const need = {};
    for (const m of menu) {
      const r = byId(m.id);
      if (!r) continue;
      for (const [id, q] of Object.entries(r.ing)) {
        if (!need[id]) need[id] = { qty: 0, recipes: [] };
        need[id].qty += q * people;
        need[id].recipes.push(r.id);
      }
    }
    return need;
  }
  function shoppingTotal(menu) {
    let t = 0;
    for (const [id, n] of Object.entries(needs(menu))) if (!inPantry(id)) t += buyLine(id, n.qty).cost;
    return t;
  }

  /* ---------- Génération du menu ---------- */
  function mainOf(r) { return MAINS.find((m) => r.ing[m] !== undefined); }
  function starchOf(r) { return STARCHES.find((m) => r.ing[m] !== undefined); }

  function score(r, chosen) {
    const p = state.prefs;
    let s = Math.random() * 1.4;
    const ids = Object.keys(r.ing);
    // Anti-gaspi : utilise le placard…
    s += 0.35 * ids.filter((id) => inPantry(id) && !BASICS.has(id)).length;
    // …et finit les paquets ouverts par les autres dîners.
    const used = new Set(chosen.flatMap((c) => Object.keys(byId(c.id).ing)));
    s += 0.3 * ids.filter((id) => used.has(id) && ING[id].pack && !inPantry(id)).length;
    // Tu as un air fryer : on met en avant les plats qui en profitent
    if (has("airfryer") && (r.af || r.afTip)) s += 0.25;
    // Variété
    const main = mainOf(r);
    if (main && chosen.some((c) => mainOf(byId(c.id)) === main)) s -= 1.6;
    const st = starchOf(r);
    if (st) s -= 0.5 * chosen.filter((c) => starchOf(byId(c.id)) === st).length;
    // Budget : pénalise les plats chers par rapport au budget par portion
    const target = p.budget / Math.max(1, p.dinners * p.people);
    const pc = portionCost(r);
    if (pc > target) s -= ((pc - target) / target) * 1.2;
    return s;
  }

  function pickBest(pool, chosen, avoid = []) {
    const taken = new Set(chosen.map((c) => c.id).concat(avoid));
    let best = null, bestS = -Infinity;
    for (const r of pool) {
      if (taken.has(r.id)) continue;
      const s = score(r, chosen);
      if (s > bestS) { bestS = s; best = r; }
    }
    return best;
  }

  function fitBudget(menu, pool) {
    for (let round = 0; round < 25; round++) {
      let total = shoppingTotal(menu);
      if (total <= state.prefs.budget) return;
      let bestTotal = total, bestMove = null;
      const ids = new Set(menu.map((m) => m.id));
      menu.forEach((m, i) => {
        if (m.locked) return;
        for (const r of pool) {
          if (ids.has(r.id)) continue;
          const trial = menu.slice();
          trial[i] = { id: r.id, locked: false };
          const t = shoppingTotal(trial);
          if (t < bestTotal - 0.01) { bestTotal = t; bestMove = [i, r.id]; }
        }
      });
      if (!bestMove) return;
      menu[bestMove[0]] = { id: bestMove[1], locked: false };
    }
  }

  function generate(keepLocked = true) {
    const p = state.prefs;
    const pool = RECIPES.filter((r) => eligible(r));
    const kept = keepLocked ? state.menu.filter((m) => m.locked && pool.some((r) => r.id === m.id)).slice(0, p.dinners) : [];
    const menu = [];
    // Les dîners cadenassés gardent leur jour quand c'est possible.
    const slots = new Array(p.dinners).fill(null);
    kept.forEach((m) => {
      const i = state.menu.indexOf(m);
      const at = i < p.dinners && !slots[i] ? i : slots.indexOf(null);
      if (at >= 0) slots[at] = { id: m.id, locked: true };
    });
    for (let i = 0; i < p.dinners; i++) {
      if (slots[i]) continue;
      const r = pickBest(pool, slots.filter(Boolean));
      if (r) slots[i] = { id: r.id, locked: false };
    }
    slots.forEach((s) => s && menu.push(s));
    fitBudget(menu, pool);
    state.menu = menu;
    pruneChecked();
    save();
  }

  function swap(i) {
    const pool = RECIPES.filter((r) => eligible(r));
    const others = state.menu.filter((_, j) => j !== i);
    const current = state.menu[i].id;
    const r = pickBest(pool, others, [current]);
    if (!r) { toast("Aucune autre recette ne correspond à tes réglages."); return false; }
    state.menu[i] = { id: r.id, locked: false };
    pruneChecked();
    save();
    return true;
  }

  function pruneChecked() {
    const need = needs(state.menu);
    for (const id of Object.keys(state.checked)) if (!need[id]) delete state.checked[id];
  }

  /* ---------- Semaine ---------- */
  function weekStart() {
    const d = new Date();
    const dow = (d.getDay() + 6) % 7; // 0 = lundi
    d.setDate(d.getDate() - dow + (dow >= 5 ? 7 : 0)); // le week-end, on prépare la semaine suivante
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function dayLabel(i) {
    const plan = DAY_PLAN[state.prefs.dinners] || DAY_PLAN[5];
    const idx = plan[i] ?? i;
    const d = weekStart();
    d.setDate(d.getDate() + idx);
    return `${DAY_NAMES[idx]} ${d.getDate()}`;
  }
  function dayParts(i) {
    const plan = DAY_PLAN[state.prefs.dinners] || DAY_PLAN[5];
    const idx = plan[i] ?? i;
    const d = weekStart();
    d.setDate(d.getDate() + idx);
    return { short: DAY_NAMES[idx].slice(0, 3), num: d.getDate(), offset: idx };
  }
  /* Le dîner de ce soir s'il est prévu, sinon le prochain. */
  function nextDinner() {
    if (!state.menu.length) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((today - weekStart()) / 864e5);
    for (let i = 0; i < state.menu.length; i++) {
      const off = dayParts(i).offset;
      if (off >= diff) return { i, tonight: off === diff };
    }
    return { i: 0, tonight: false };
  }

  /* ---------- Rendu : menu ---------- */
  const icons = {
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    hat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17h10v3H7zM7 17a4 4 0 1 1 1.5-7.7A4 4 0 0 1 16 8a4 4 0 0 1 1 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    swap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h13l-3-3M20 15H7l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    pan: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="13" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 13h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    unlock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };
  const levelLabel = (v) => (LEVELS.find((l) => l.v === v) || LEVELS[0]).label;

  function pantryUse(r) {
    return Object.keys(r.ing).filter((id) => inPantry(id) && !BASICS.has(id)).map((id) => ING[id].name.toLowerCase());
  }

  function renderMenu(freshIndex = -1) {
    const p = state.prefs;
    const list = $("#dinners");
    $("#sample-banner").hidden = state.customized;
    $("#menu-sub").textContent = `${state.menu.length} dîner${state.menu.length > 1 ? "s" : ""} · ${p.people} personne${p.people > 1 ? "s" : ""} · ${p.time} min max`
      + (state.menu.length && state.menu.length < p.dinners ? ` · seulement ${state.menu.length} sur ${p.dinners} : pas assez de recettes pour tes réglages` : "");

    if (!state.menu.length) {
      list.innerHTML = `<li class="empty"><h2>Aucune recette ne passe tes filtres</h2><p class="muted">Ajoute un équipement, allonge le temps en cuisine, monte d'un niveau ou retire un « je n'aime pas ».</p><button class="btn" type="button" data-go="profil">Ajuster mes goûts</button></li>`;
    } else {
      list.innerHTML = state.menu.map((m, i) => {
        const r = byId(m.id);
        const use = pantryUse(r);
        const dp = dayParts(i);
        return `<li class="dinner${m.locked ? " locked" : ""}${i === freshIndex ? " fresh" : ""}" data-i="${i}">
          ${m.locked ? '<span class="sticker">Gardé</span>' : ""}
          <div class="date" aria-label="${dayLabel(i)}"><span>${dp.short}</span><b>${dp.num}</b></div>
          <div class="dinner-main">
            <button class="dinner-name" type="button" data-open="${i}">${esc(r.name)}</button>
            <div class="meta">
              <span>${icons.clock}${r.time} min</span>
              <span>${icons.hat}${levelLabel(r.level)}</span>
              <span>${icons.pan}${devicesLabel(r)}</span>
            </div>
            ${use.length ? `<div><span class="pill" title="Déjà dans ton placard">Placard : ${esc(use.slice(0, 2).join(", "))}</span></div>` : ""}
</div>
          <button class="plate-btn" type="button" data-open="${i}" aria-label="Voir la recette ${esc(r.name)}">${window.plateSVG(r)}</button>
          <div class="dinner-foot">
              <span class="tag">${fmtE(portionCost(r))} <small>la part</small></span>
              <div class="dinner-btns">
                <button class="icon-btn" type="button" data-swap="${i}" aria-label="Changer ce dîner" title="Changer ce dîner">${icons.swap}</button>
                <button class="icon-btn" type="button" data-lock="${i}" aria-pressed="${m.locked}" aria-label="${m.locked ? "Libérer ce dîner" : "Garder ce dîner"}" title="${m.locked ? "Gardé pour le prochain menu" : "Garder ce dîner"}">${m.locked ? icons.lock : icons.unlock}</button>
              </div>
          </div>
        </li>`;
      }).join("");
    }
    renderTonight();
    renderBudget();
  }

  function renderTonight() {
    const box = $("#tonight");
    const nd = nextDinner();
    box.className = "tonight gingham";
    if (!nd) { box.innerHTML = ""; return; }
    const r = byId(state.menu[nd.i].id);
    box.innerHTML = `
      <div class="tonight-text">
        <p class="eyebrow">${nd.tonight ? "Ce soir" : "Prochain dîner"} · ${dayLabel(nd.i)}</p>
        <h2>${esc(r.name)}</h2>
        <div class="meta"><span>${icons.clock}${r.time} min</span><span>${icons.pan}${devicesLabel(r)}</span><span>${fmtE(portionCost(r) * state.prefs.people)} pour ${state.prefs.people}</span></div>
        <div class="tonight-actions">
          <button class="btn btn-yellow" type="button" data-open="${nd.i}">Voir la recette</button>
          <button class="btn btn-outline-light" type="button" data-swap="${nd.i}">${icons.swap}Changer</button>
        </div>
      </div>
      <div class="tonight-plate" aria-hidden="true">${window.plateSVG(r)}</div>`;
  }

  function renderBudget() {
    const p = state.prefs;
    const total = shoppingTotal(state.menu);
    const ratio = p.budget ? total / p.budget : 0;
    const over = total > p.budget + 0.005;
    const left = p.budget - total;
    $("#receipt-store").textContent = storeOf().name;
    $("#store-pill").textContent = storeOf().name;
    $("#store-pill").setAttribute("aria-label", `Magasin : ${storeOf().name}. Changer`);
    $("#receipt-lines").innerHTML = `
      <div class="row"><dt>${state.menu.length} dîners × ${p.people} pers.</dt><dd>${state.menu.length * p.people} assiettes</dd></div>
      <div class="row"><dt>Courses estimées</dt><dd>${fmtE(total)}</dd></div>
      <div class="row"><dt>Budget</dt><dd>${fmtE(p.budget)}</dd></div>
      <div class="row total${over ? " over" : ""}"><dt>${over ? "Dépassement" : "Reste"}</dt><dd>${fmtE(Math.abs(left))}</dd></div>`;
    $("#gauge-fill").style.width = Math.min(100, ratio * 100).toFixed(1) + "%";
    $("#gauge").classList.toggle("over", over);
    $("#gauge").setAttribute("aria-valuenow", Math.round(ratio * 100));
    $("#budget").classList.toggle("over", over);
    const portions = state.menu.length * p.people;
    const perPortion = portions ? total / portions : 0;
    $("#budget-note").textContent = !state.menu.length ? "" : over
      ? `${fmtE(total - p.budget)} au-dessus du budget. Change un dîner cher ou ajoute ce que tu as déjà au placard.`
      : `Dans le budget, soit ${fmtE(perPortion)} par assiette.`;
  }

  /* ---------- Rendu : courses ---------- */
  function shoppingLines() {
    const need = needs(state.menu);
    return Object.entries(need)
      .filter(([id]) => !inPantry(id))
      .map(([id, n]) => ({ id, ...buyLine(id, n.qty), need: n.qty, recipes: n.recipes }));
  }

  const AISLE_LOOK = {
    legumes: [110, '<path d="M5 19C5 10 11 5 19 5c0 8-5 14-14 14Z M5 19l8-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'],
    boucherie: [8, '<path d="M3 12c3-4 7-5 11-4l6-3v14l-6-3c-4 1-8 0-11-4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="8" cy="11" r="1" fill="currentColor"/>'],
    frais: [205, '<path d="M8 3h8l1.5 4v14h-11V7Z M6.5 7h11" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'],
    epicerie: [38, '<path d="M7 3h10v3H7Z M6 6h12v15H6Z M6 11h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'],
    surgeles: [195, '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'],
    boulangerie: [28, '<path d="M3 14c0-5 4-8 9-8s9 3 9 8v4H3Z M9 9l-1.5 5M13 8.5l-1 5.5M17 9.5l-1 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'],
  };

  function renderList() {
    const lines = shoppingLines();
    const total = lines.reduce((s, l) => s + l.cost, 0);
    const done = lines.filter((l) => state.checked[l.id]).length;
    $("#list-total").textContent = fmtE(total);
    $("#list-sub").textContent = lines.length
      ? `${lines.length} articles chez ${storeOf().name} · ${state.menu.length} dîners`
      : "Rien à acheter pour l'instant.";
    $("#ring").style.strokeDashoffset = (119.4 * (1 - (lines.length ? done / lines.length : 0))).toFixed(1);
    $("#ring-label").textContent = `${done}/${lines.length}`;
    const complete = lines.length > 0 && done === lines.length;
    const banner = $("#done-banner");
    if (complete && banner.hidden) { banner.hidden = false; banner.replaceWith(banner.cloneNode(true)); } // relance les confettis
    if (!complete) banner.hidden = true;

    const badge = $("#tab-badge");
    const left = lines.length - done;
    badge.hidden = left <= 0;
    badge.textContent = left;

    renderCompare(total);

    $("#aisles").innerHTML = AISLES.map((a) => {
      const items = lines.filter((l) => ING[l.id].aisle === a.id).sort((x, y) => ING[x.id].name.localeCompare(ING[y.id].name, "fr"));
      if (!items.length) return "";
      const sub = items.reduce((s, l) => s + l.cost, 0);
      return `<section class="aisle">
        <div class="aisle-head"><span class="aisle-icon" style="--h:${AISLE_LOOK[a.id][0]}"><svg viewBox="0 0 24 24" aria-hidden="true">${AISLE_LOOK[a.id][1]}</svg></span><h2>${a.name}</h2><span>${fmtE(sub)}</span></div>
        <ul class="items">${items.map(itemHTML).join("")}</ul>
      </section>`;
    }).join("");

    const pantryUsed = Object.keys(needs(state.menu)).filter(inPantry);
    $("#pantry-note").innerHTML = pantryUsed.length
      ? `<b>Pas acheté, déjà dans ton placard :</b> ${pantryUsed.map((id) => esc(ING[id].name.toLowerCase())).join(", ")}. <button class="btn-link" type="button" data-go="profil">Modifier</button>`
      : "";
  }

  function storeTotals() {
    const out = STORES.map((st) => {
      priceIndex = st.index;
      const t = shoppingLines().reduce((s, l) => s + l.cost, 0);
      priceIndex = null;
      return { ...st, total: t };
    });
    return out;
  }

  function renderCompare(total) {
    const box = $("#compare");
    if (!total) { box.innerHTML = ""; return; }
    const rows = storeTotals();
    const cur = storeOf();
    const cheapest = rows.reduce((a, b) => (b.total < a.total ? b : a));
    box.innerHTML = `
      <div class="compare-head">
        <h2 id="compare-title">Ce panier selon le magasin</h2>
        <span class="muted">touche pour changer</span>
      </div>
      <ul class="compare-list">${rows.map((r) => {
        const diff = r.total - rows.find((x) => x.id === cur.id).total;
        return `<li><button type="button" data-store="${r.id}" aria-pressed="${r.id === cur.id}">
          <span class="c-name">${r.name}</span>
          <span class="c-bar"><span style="width:${((r.total / rows[rows.length - 1].total) * 100).toFixed(1)}%"></span></span>
          <span class="c-total">${fmtE(r.total)}</span>
          <span class="c-diff">${r.id === cur.id ? "ton choix" : (diff > 0 ? "+" : "−") + fmtE(Math.abs(diff))}</span>
        </button></li>`;
      }).join("")}</ul>
      <p class="compare-note">Estimation à partir des écarts moyens entre enseignes (palmarès UFC-Que Choisir 2026, étude 2025 sur 80 produits). ${cheapest.id === cur.id ? "Tu es déjà sur l'enseigne la moins chère en moyenne." : `Passer chez ${cheapest.name} ferait gagner environ ${fmtE(rows.find((x) => x.id === cur.id).total - cheapest.total)} sur ce panier : si c'est plus loin, le trajet peut coûter plus que ça.`} Les prix réels varient d'un magasin à l'autre.</p>`;
  }

  function itemHTML(l) {
    const g = ING[l.id];
    const checked = !!state.checked[l.id];
    let detail;
    if (g.pack) {
      const pack = fmtPack(l.id);
      detail = `${l.packs} × ${pack || "1"} · il en faut ${fmtQty(l.id, l.need)}`;
      if (l.leftover > g.pack * 0.15) detail += ` · <span class="leftover">reste ${fmtQty(l.id, l.leftover)}</span>`;
    } else if (g.unit === "pc") {
      detail = `${l.qty} pièce${l.qty > 1 ? "s" : ""} · ${fmtE(price(l.id))} pièce`;
    } else {
      detail = `${fmtQty(l.id, l.qty)} au poids · ${fmtE(price(l.id))}/kg`;
    }
    const st = storeOf();
    if (st.search) detail += ` · <a class="find" href="${st.search(g.name.replace(/\s*\(.*\)/, ""))}" target="_blank" rel="noopener">voir sur ${st.id === "lidl" ? "lidl.fr" : "e.leclerc"}</a>`;
    const unitPrice = g.pack && g.unit !== "pc" ? `<small>${fmtE((price(l.id) / g.pack) * 1000)}/${g.unit === "g" ? "kg" : "L"}</small>` : "";
    return `<li class="item${checked ? " done" : ""}">
      <input class="check" type="checkbox" id="chk-${l.id}" data-check="${l.id}" ${checked ? "checked" : ""} aria-label="${esc(g.name)} dans le caddie">
      <label class="item-main" for="chk-${l.id}">
        <span class="item-name">${esc(g.name)}</span>
        <span class="item-sub">${detail}</span>
      </label>
      <div class="item-price"><b>${fmtE(l.cost)}</b>${unitPrice}${state.prefs.pantry.includes(l.id) || !window.PANTRY.includes(l.id) ? "" : `<button class="btn-link" type="button" data-have="${l.id}">Je l'ai déjà</button>`}</div>
    </li>`;
  }

  function listText() {
    const lines = shoppingLines();
    const total = lines.reduce((s, l) => s + l.cost, 0);
    const d = weekStart();
    const head = `Courses ${storeOf().name}, semaine du ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} (≈ ${fmtE(total)})`;
    const body = AISLES.map((a) => {
      const items = lines.filter((l) => ING[l.id].aisle === a.id);
      if (!items.length) return "";
      return `\n${a.name}\n` + items.map((l) => {
        const g = ING[l.id];
        const q = g.pack ? `${l.packs} × ${fmtPack(l.id) || "1"}` : g.unit === "pc" ? `${l.qty}` : fmtQty(l.id, l.qty);
        return `${state.checked[l.id] ? "☑" : "☐"} ${g.name} : ${q}`;
      }).join("\n");
    }).join("\n");
    const menu = "\n\nAu menu\n" + state.menu.map((m, i) => `${dayLabel(i)} : ${byId(m.id).name}`).join("\n");
    return head + "\n" + body + menu;
  }

  /* ---------- Rendu : profil ---------- */
  function renderPrefs() {
    const p = state.prefs;
    $("#people-out").textContent = p.people;
    $("#people").value = p.people;
    $("#budget-input").value = p.budget;
    $("#budget-out").textContent = fmtE(p.budget).replace(",00", "");

    $("#store-seg").innerHTML = STORES.map((st) => `<button type="button" role="radio" aria-checked="${p.store === st.id}" data-store="${st.id}">${st.name}</button>`).join("");
    $("#dinners-seg").innerHTML = DINNER_COUNTS.map((n) => `<button type="button" role="radio" aria-checked="${p.dinners === n}" data-set="dinners" data-v="${n}">${n}</button>`).join("");
    $("#equip-chips").innerHTML = EQUIPMENT.map((e) => `<button type="button" class="chip" data-equip="${e.id}" aria-pressed="${p.equipment.includes(e.id)}">${e.label}</button>`).join("");
    $("#level-seg").innerHTML = LEVELS.map((l) => `<button type="button" role="radio" aria-checked="${p.level === l.v}" data-set="level" data-v="${l.v}">${l.label}</button>`).join("");
    $("#time-seg").innerHTML = TIMES.map((t) => `<button type="button" role="radio" aria-checked="${p.time === t}" data-set="time" data-v="${t}">${t === 60 ? "1 h" : t + " min"}</button>`).join("");
    $("#diet-chips").innerHTML =
      `<button type="button" class="chip" data-diet="" aria-pressed="${!p.diets.length}">Je mange de tout</button>` +
      DIETS.map((d) => `<button type="button" class="chip" data-diet="${d.id}" aria-pressed="${p.diets.includes(d.id)}">${d.label}</button>`).join("");
    $("#pantry-chips").innerHTML = window.PANTRY.map((id) => `<button type="button" class="chip" data-pantry="${id}" aria-pressed="${p.pantry.includes(id)}">${esc(ING[id].name)}</button>`).join("");
    $("#dislike-chips").innerHTML = window.DISLIKES.map((id) => `<button type="button" class="chip" data-dislike="${id}" aria-pressed="${p.dislikes.includes(id)}">${esc(ING[id].name)}</button>`).join("");
  }

  /* ---------- Fiche recette ---------- */
  let sheetCtx = null;
  let lastFocus = null;

  function openSheet(i) {
    const m = state.menu[i];
    if (!m) return;
    sheetCtx = { i, people: state.prefs.people, done: new Set() };
    lastFocus = document.activeElement;
    renderSheet();
    $("#sheet").hidden = false;
    document.body.style.overflow = "hidden";
    $("#sheet .sheet").focus();
  }
  function renderSheet() {
    const { i, people, done } = sheetCtx;
    const r = byId(state.menu[i].id);
    $("#sheet-body").innerHTML = `
      <div class="sheet-hero gingham">
        <div class="sheet-plate" aria-hidden="true">${window.plateSVG(r)}</div>
        <p class="eyebrow">${dayLabel(i)}</p>
        <h2 id="sheet-title">${esc(r.name)}</h2>
        <div class="meta"><span>${icons.clock}${r.time} min</span><span>${icons.hat}${levelLabel(r.level)}</span><span>${icons.pan}${devicesLabel(r)}</span></div>
        <span class="tag">${fmtE(portionCost(r))} <small>la part</small></span>
      </div>
      <div class="sheet-body">
        <section class="sheet-section">
          <div class="sheet-section-head">
            <h3>Ingrédients</h3>
            <div class="stepper">
              <button type="button" class="step" data-sheet-people="-1" aria-label="Une part de moins">−</button>
              <output aria-live="polite">${people}</output>
              <button type="button" class="step" data-sheet-people="1" aria-label="Une part de plus">+</button>
            </div>
          </div>
          <ul class="ing-list">${Object.entries(r.ing).map(([id, q]) => `<li><span>${esc(ING[id].name)}${inPantry(id) ? '<span class="have">placard</span>' : ""}</span><span class="qty">${fmtQty(id, q * people)}</span></li>`).join("")}</ul>
          <p class="sheet-note">Plus sel, poivre et un filet d'huile.</p>
        </section>
        <section class="sheet-section">
          <h3>Préparation <span class="muted" style="font-weight:400;font-size:.85rem">(touche une étape quand c'est fait)</span></h3>
          ${afBox(r)}
          <ol class="steps">${r.steps.map((s, k) => {
            const swapped = ovenToAF(r) && /four|°C/i.test(s);
            return `<li data-step-i="${k}" class="${done.has(k) ? "ok" : ""}${swapped ? " swapped" : ""}">${esc(s)}${swapped ? '<span class="swap-note">→ au air fryer, voir l\'encadré</span>' : ""}</li>`;
          }).join("")}</ol>
        </section>
        <div class="sheet-actions">
          <button type="button" class="btn btn-ghost" data-sheet-swap>${icons.swap} Changer ce dîner</button>
        </div>
      </div>`;
  }
  function afBox(r) {
    if (!has("airfryer")) return "";
    if (ovenToAF(r)) return `<div class="af-box"><b>Sans four, au air fryer</b><p>${esc(r.af)} Remplace l'étape au four par celle-ci.</p></div>`;
    if (r.af) return `<div class="af-box"><b>Version air fryer</b><p>${esc(r.af)}</p></div>`;
    if (r.afTip) return `<div class="af-box"><b>Astuce air fryer</b><p>${esc(r.afTip)}</p></div>`;
    return "";
  }

  function closeSheet() {
    $("#sheet").hidden = true;
    document.body.style.overflow = "";
    sheetCtx = null;
    if (lastFocus && lastFocus.isConnected) lastFocus.focus();
  }

  function showCopyFallback(text) {
    lastFocus = document.activeElement;
    sheetCtx = null;
    $("#sheet-body").innerHTML = `<h2 id="sheet-title" style="padding-right:48px">Ta liste de courses</h2>
      <p class="muted" style="margin:8px 0 12px">La copie automatique est bloquée ici. Sélectionne le texte et copie-le.</p>
      <textarea id="copy-area" readonly style="width:100%;min-height:50vh;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink);padding:12px;font:inherit;font-size:.9rem">${esc(text)}</textarea>`;
    $("#sheet").hidden = false;
    const ta = $("#copy-area");
    ta.focus();
    ta.select();
  }

  /* ---------- Toast ---------- */
  let toastT = 0;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => (t.hidden = true), 2600);
  }

  /* ---------- Navigation ---------- */
  const TABS = ["menu", "courses", "profil"];
  function show(tab) {
    if (!TABS.includes(tab)) tab = "menu";
    if (!$("#sheet").hidden) closeSheet();
    TABS.forEach((t) => {
      $("#screen-" + t).hidden = t !== tab;
      const b = document.querySelector(`.tab[data-tab="${t}"]`);
      if (t === tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
      if (t === tab) $("#tabs-in").style.setProperty("--i", TABS.indexOf(t));
    });
    if (tab === "courses") renderList();
    if (tab === "profil") renderPrefs();
    if (tab === "menu") renderMenu();
    window.scrollTo({ top: 0 });
  }
  function go(tab) {
    if (location.hash !== "#" + tab) {
      try { location.hash = tab; } catch (e) { show(tab); }
    } else show(tab);
  }
  window.addEventListener("hashchange", () => show(location.hash.slice(1)));

  /* ---------- Événements ---------- */
  function prefsChanged() {
    state.customized = true;
    generate(true);
    renderPrefs();
    renderBudget();
    renderList();
    save();
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, li[data-step-i], [data-close]");
    if (!t) return;
    const d = t.dataset;

    if (d.tab) return go(d.tab);
    if (d.go) { if (!$("#sheet").hidden) closeSheet(); return go(d.go); }
    if (d.close !== undefined) return closeSheet();

    if (d.open !== undefined) return openSheet(+d.open);
    if (d.swap !== undefined) {
      const i = +d.swap;
      if (swap(i)) { renderMenu(i); renderList(); toast(`Nouveau dîner : ${byId(state.menu[i].id).name}`); }
      return;
    }
    if (d.lock !== undefined) {
      const m = state.menu[+d.lock];
      m.locked = !m.locked;
      save();
      renderMenu();
      toast(m.locked ? "Gardé pour le prochain menu" : "Ce dîner pourra changer");
      return;
    }
    if (t.id === "regen") {
      generate(true);
      renderMenu();
      renderList();
      document.querySelectorAll(".dinner:not(.locked)").forEach((el) => el.classList.add("fresh"));
      return;
    }
    if (t.id === "copy-list") {
      const text = listText();
      const fallback = () => showCopyFallback(text);
      try {
        navigator.clipboard.writeText(text).then(() => toast("Liste copiée. Colle-la dans tes notes ou un message."), fallback);
      } catch (err) { fallback(); }
      return;
    }
    if (t.id === "uncheck-all") { state.checked = {}; save(); renderList(); return; }
    if (t.id === "reset") {
      state = { prefs: JSON.parse(JSON.stringify(DEFAULTS)), menu: [], checked: {}, customized: false };
      generate(false);
      renderPrefs();
      toast("Réglages remis à zéro");
      return;
    }
    if (d.have) {
      state.prefs.pantry.push(d.have);
      delete state.checked[d.have];
      state.customized = true;
      save();
      renderList();
      renderBudget();
      toast(`${ING[d.have].name} : noté dans ton placard`);
      return;
    }

    // Profil
    if (d.step) {
      const p = state.prefs;
      p.people = Math.min(10, Math.max(1, p.people + +d.delta));
      return prefsChanged();
    }
    if (d.set) { state.prefs[d.set] = +d.v; return prefsChanged(); }
    if (d.store) {
      state.prefs.store = d.store;
      state.customized = true;
      save(); // on garde le menu : seuls les prix changent
      renderPrefs();
      renderMenu();
      renderList();
      toast(`Prix estimés chez ${storeOf().name}`);
      return;
    }
    if (d.diet !== undefined) {
      const p = state.prefs;
      if (!d.diet) p.diets = [];
      else if (p.diets.includes(d.diet)) p.diets = p.diets.filter((x) => x !== d.diet);
      else {
        p.diets.push(d.diet);
        // végétarien et « poisson oui » s'excluent
        if (d.diet === "vege") p.diets = p.diets.filter((x) => x !== "pesco");
        if (d.diet === "pesco") p.diets = p.diets.filter((x) => x !== "vege");
      }
      return prefsChanged();
    }
    if (d.equip) { toggleIn(state.prefs.equipment, d.equip); return prefsChanged(); }
    if (d.pantry) { toggleIn(state.prefs.pantry, d.pantry); return prefsChanged(); }
    if (d.dislike) { toggleIn(state.prefs.dislikes, d.dislike); return prefsChanged(); }

    // Fiche
    if (d.sheetPeople && sheetCtx) {
      sheetCtx.people = Math.min(12, Math.max(1, sheetCtx.people + +d.sheetPeople));
      return renderSheet();
    }
    if (d.stepI !== undefined && sheetCtx) {
      const k = +d.stepI;
      sheetCtx.done.has(k) ? sheetCtx.done.delete(k) : sheetCtx.done.add(k);
      return renderSheet();
    }
    if (d.sheetSwap !== undefined && sheetCtx) {
      const i = sheetCtx.i;
      if (swap(i)) { sheetCtx.done.clear(); renderSheet(); renderMenu(i); renderList(); }
    }
  });

  function toggleIn(arr, v) {
    const k = arr.indexOf(v);
    k >= 0 ? arr.splice(k, 1) : arr.push(v);
  }

  document.addEventListener("change", (e) => {
    const id = e.target.dataset && e.target.dataset.check;
    if (!id) return;
    if (e.target.checked) state.checked[id] = true; else delete state.checked[id];
    save();
    renderList();
  });

  const budgetInput = $("#budget-input");
  budgetInput.addEventListener("input", () => {
    state.prefs.budget = +budgetInput.value;
    $("#budget-out").textContent = fmtE(state.prefs.budget).replace(",00", "");
  });
  budgetInput.addEventListener("change", prefsChanged);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#sheet").hidden) closeSheet();
  });

  /* ---------- Démarrage ---------- */
  const ws = weekStart();
  $("#week-label").textContent = "Sem. du " + ws.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  if (!state.menu.length || state.menu.length !== state.prefs.dinners) generate(true);
  renderList();
  show(location.hash.slice(1) || "menu");
})();
