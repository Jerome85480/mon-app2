/* Popote — moteur : règles, prix, liste de courses et génération du menu.
   Aucune dépendance au navigateur : ce fichier est testé tel quel avec Node (voir tests/). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.createPlanner = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DIETS = [
    { id: "vege", label: "Végétarien", bans: ["viande", "porc", "poisson"] },
    { id: "pesco", label: "Poisson oui, viande non", bans: ["viande", "porc"] },
    { id: "sans_porc", label: "Sans porc", bans: ["porc"] },
    { id: "sans_gluten", label: "Sans gluten", bans: ["gluten"] },
    { id: "sans_lactose", label: "Sans lactose", bans: ["lactose"] },
  ];
  const FLAG_LABELS = { viande: "de la viande", porc: "du porc", poisson: "du poisson", gluten: "du gluten", lactose: "du lactose" };
  const LEVELS = [
    { v: 1, label: "Débutant" },
    { v: 2, label: "À l'aise" },
    { v: 3, label: "Cordon-bleu" },
  ];
  const TIMES = [20, 30, 45, 60];
  const DINNER_COUNTS = [3, 4, 5, 6, 7];
  const EQUIPMENT = [
    { id: "plaque", label: "Plaques (induction, vitro, gaz)", short: "Plaques" },
    { id: "four", label: "Four", short: "Four" },
    { id: "airfryer", label: "Air fryer", short: "Air fryer" },
  ];
  /* Indice de prix moyen par enseigne, base 1 = E.Leclerc.
     Sources : palmarès UFC-Que Choisir 2026 (Intermarché hyper +3 %, Carrefour hyper +6,7 %,
     Auchan ≈ +13 %) et étude de mars 2025 sur 80 produits (Leclerc 2,5 % plus cher que Lidl).
     C'est une moyenne nationale : l'écart réel dépend du magasin et des produits. */
  const STORES = [
    { id: "lidl", name: "Lidl", index: 0.975, site: "lidl.fr", searchUrl: "https://www.lidl.fr/q/search?q=" },
    { id: "leclerc", name: "E.Leclerc", index: 1, site: "e.leclerc", searchUrl: "https://www.e.leclerc/recherche?q=" },
    { id: "intermarche", name: "Intermarché", index: 1.03 },
    { id: "carrefour", name: "Carrefour", index: 1.067 },
    { id: "auchan", name: "Auchan", index: 1.13 },
  ];
  const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const DAY_PLAN = { 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] };
  // Ingrédient « principal » et féculent d'un plat, pour varier la semaine.
  const MAINS = ["poulet", "dinde", "boeuf", "merguez", "saucisses", "lardons", "jambon", "chorizo", "saumon", "cabillaud", "crevettes", "thon", "sardines", "tofu", "pois_chiches", "lentilles", "haricots", "oeufs", "gnocchis", "ravioli"];
  const STARCHES = ["pates", "riz", "riz_rond", "pdt", "patate_douce", "semoule", "quinoa", "tortillas", "pate_pizza", "pate_brisee", "pate_feuilletee", "nouilles", "pain_burger"];
  // Fonds de placard qui ne « comptent » pas comme une raison de choisir un plat.
  const BASICS = new Set(["huile", "curry", "paprika", "bouillon", "sauce_soja", "cumin", "herbes"]);

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

  /* ---------- Dates ---------- */
  /* Lundi de la semaine à planifier. Le week-end, on prépare la semaine suivante. */
  function weekStart(now = new Date()) {
    const d = new Date(now);
    const dow = (d.getDay() + 6) % 7; // 0 = lundi
    d.setDate(d.getDate() - dow + (dow >= 5 ? 7 : 0));
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function isoDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  /* Jour (0 = lundi) du i-ème dîner selon le nombre de dîners prévus. */
  function dayOffset(dinners, i) {
    const plan = DAY_PLAN[dinners] || DAY_PLAN[5];
    return plan[i] ?? i;
  }

  return function createPlanner({ INGREDIENTS: ING, RECIPES }) {
    const index = new Map(RECIPES.map((r) => [r.id, r]));
    const byId = (id) => index.get(id);
    const storeOf = (id) => STORES.find((s) => s.id === id) || STORES[1];
    const levelLabel = (v) => (LEVELS.find((l) => l.v === v) || LEVELS[0]).label;
    const priceOf = (id, storeId) => ING[id].price * storeOf(storeId).index;

    /* ---------- Quantités ---------- */
    function fmtQty(id, q) {
      const u = ING[id].unit;
      if (u === "pc") {
        const whole = Math.floor(q + 1e-9);
        const frac = q - whole;
        const fr = frac < 0.13 ? "" : frac < 0.38 ? "¼" : frac < 0.63 ? "½" : frac < 0.88 ? "¾" : "";
        const w = frac >= 0.88 ? whole + 1 : whole;
        return (w ? String(w) : "") + (fr ? (w ? " " : "") + fr : "") || "¼";
      }
      const big = u === "g" ? "kg" : "L";
      if (q >= 1000) return ((Math.round(q / 50) * 50) / 1000).toLocaleString("fr-FR") + " " + big;
      return (q < 100 ? Math.max(5, Math.round(q / 5) * 5) : Math.round(q / 10) * 10) + " " + u;
    }
    function fmtPack(id) {
      const g = ING[id];
      if (g.unit === "pc") return g.pack === 1 ? "" : `${g.pack} pc`;
      return fmtQty(id, g.pack);
    }

    /* ---------- Règles ---------- */
    function flagsOf(r) {
      const f = new Set();
      for (const id of Object.keys(r.ing)) for (const x of ING[id].flags || []) f.add(x);
      return f;
    }
    const has = (prefs, eq) => prefs.equipment.includes(eq);
    /* Le four peut être remplacé par l'air fryer quand la recette le permet (champ af). */
    const missingEquipment = (r, prefs) =>
      (r.need || []).filter((n) => !has(prefs, n) && !(n === "four" && has(prefs, "airfryer") && !!r.af));
    const canCook = (r, prefs) => missingEquipment(r, prefs).length === 0;
    const ovenToAF = (r, prefs) => (r.need || []).includes("four") && !has(prefs, "four") && has(prefs, "airfryer") && !!r.af;
    function devicesLabel(r, prefs) {
      if (!(r.need || []).length) return "Sans cuisson";
      return r.need.map((n) => (n === "four" && ovenToAF(r, prefs) ? "Air fryer" : EQUIPMENT.find((e) => e.id === n).short)).join(" + ");
    }

    /* Raisons pour lesquelles une recette ne correspond pas aux réglages (liste vide = elle convient). */
    function whyNot(r, prefs) {
      const out = [];
      if (r.time > prefs.time) out.push(`demande ${r.time} min (ton maximum : ${prefs.time} min)`);
      if (r.level > prefs.level) out.push(`niveau « ${levelLabel(r.level)} »`);
      const miss = missingEquipment(r, prefs);
      if (miss.length) out.push("il faut : " + miss.map((n) => EQUIPMENT.find((e) => e.id === n).short.toLowerCase()).join(" et "));
      const flags = flagsOf(r);
      const banned = new Set();
      for (const d of prefs.diets) {
        const diet = DIETS.find((x) => x.id === d);
        if (diet) for (const b of diet.bans) if (flags.has(b)) banned.add(b);
      }
      for (const b of banned) out.push("contient " + FLAG_LABELS[b]);
      for (const id of Object.keys(r.ing)) if (prefs.dislikes.includes(id)) out.push(`contient : ${ING[id].name.toLowerCase()}`);
      return out;
    }
    const eligible = (r, prefs) => whyNot(r, prefs).length === 0;
    const isVegetarian = (r) => {
      const f = flagsOf(r);
      return !f.has("viande") && !f.has("porc") && !f.has("poisson");
    };
    const pantryUse = (r, prefs) => Object.keys(r.ing).filter((id) => prefs.pantry.includes(id) && !BASICS.has(id));

    /* ---------- Prix ---------- */
    /* Prix « consommé » par personne (part du paquet réellement utilisée). */
    function portionCost(r, storeId) {
      let c = 0;
      for (const [id, q] of Object.entries(r.ing)) {
        const g = ING[id];
        const p = priceOf(id, storeId);
        if (g.pack) c += (q / g.pack) * p;
        else if (g.unit === "pc") c += q * p;
        else c += (q / 1000) * p;
      }
      return c;
    }
    /* Ce qu'on achète vraiment : paquets entiers, vrac arrondi à 50 g, pièces entières. */
    function buyLine(id, qty, storeId) {
      const g = ING[id];
      const p = priceOf(id, storeId);
      if (g.pack) {
        const packs = Math.max(1, Math.ceil(qty / g.pack - 1e-6));
        return { qty, packs, cost: packs * p, leftover: packs * g.pack - qty };
      }
      if (g.unit === "pc") {
        const n = Math.max(1, Math.ceil(qty - 1e-6));
        return { qty: n, packs: 0, cost: n * p, leftover: n - qty };
      }
      const w = Math.max(50, Math.ceil(qty / 50 - 1e-6) * 50);
      return { qty: w, packs: 0, cost: (w / 1000) * p, leftover: 0 };
    }
    function needs(menu, people) {
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
    function shoppingLines(menu, prefs, storeId = prefs.store) {
      return Object.entries(needs(menu, prefs.people))
        .filter(([id]) => !prefs.pantry.includes(id))
        .map(([id, n]) => ({ id, ...buyLine(id, n.qty, storeId), need: n.qty, recipes: n.recipes }));
    }
    const shoppingTotal = (menu, prefs, storeId = prefs.store) =>
      shoppingLines(menu, prefs, storeId).reduce((s, l) => s + l.cost, 0);
    const storeTotals = (menu, prefs) => STORES.map((st) => ({ ...st, total: shoppingTotal(menu, prefs, st.id) }));
    const pantryUsed = (menu, prefs) => Object.keys(needs(menu, prefs.people)).filter((id) => prefs.pantry.includes(id));

    /* ---------- Génération du menu ---------- */
    const mainOf = (r) => MAINS.find((m) => r.ing[m] !== undefined);
    const starchOf = (r) => STARCHES.find((m) => r.ing[m] !== undefined);

    function score(r, chosen, ctx) {
      const { prefs, favorites = [], history = [], rng = Math.random } = ctx;
      let s = rng() * 1.4;
      const ids = Object.keys(r.ing);
      // Anti-gaspi : utilise le placard…
      s += 0.35 * pantryUse(r, prefs).length;
      // …et finit les paquets ouverts par les autres dîners.
      const used = new Set(chosen.flatMap((c) => Object.keys(byId(c.id).ing)));
      s += 0.3 * ids.filter((id) => used.has(id) && ING[id].pack && !prefs.pantry.includes(id)).length;
      if (has(prefs, "airfryer") && (r.af || r.afTip)) s += 0.25;
      if (favorites.includes(r.id)) s += 0.6;
      // Pas la même chose que les semaines passées
      if ((history[0] || []).includes(r.id)) s -= 1.2;
      else if ((history[1] || []).includes(r.id)) s -= 0.5;
      // Variété dans la semaine
      const main = mainOf(r);
      if (main && chosen.some((c) => mainOf(byId(c.id)) === main)) s -= 1.6;
      const st = starchOf(r);
      if (st) s -= 0.5 * chosen.filter((c) => starchOf(byId(c.id)) === st).length;
      // Budget : pénalise les plats chers par rapport au budget par assiette
      const target = prefs.budget / Math.max(1, prefs.dinners * prefs.people);
      const pc = portionCost(r, prefs.store);
      if (pc > target) s -= ((pc - target) / target) * 1.2;
      return s;
    }

    function pickBest(pool, chosen, avoid, ctx) {
      const taken = new Set(chosen.map((c) => c.id).concat(avoid));
      let best = null;
      let bestS = -Infinity;
      for (const r of pool) {
        if (taken.has(r.id)) continue;
        const s = score(r, chosen, ctx);
        if (s > bestS) { bestS = s; best = r; }
      }
      return best;
    }

    /* Recettes proposables : celles qui conviennent, sans celles de la semaine dernière s'il reste assez de choix. */
    function poolFor(prefs, history = []) {
      const all = RECIPES.filter((r) => eligible(r, prefs));
      const last = new Set(history[0] || []);
      const fresh = all.filter((r) => !last.has(r.id));
      return fresh.length >= prefs.dinners * 2 ? fresh : all;
    }

    /* Tant que le menu dépasse le budget, remplace le dîner (non gardé) qui fait le plus baisser la note. */
    function fitBudget(menu, pool, prefs) {
      for (let round = 0; round < 25; round++) {
        const total = shoppingTotal(menu, prefs);
        if (total <= prefs.budget) break;
        let bestTotal = total;
        let move = null;
        const ids = new Set(menu.map((m) => m.id));
        menu.forEach((m, i) => {
          if (m.locked) return;
          for (const r of pool) {
            if (ids.has(r.id)) continue;
            const trial = menu.slice();
            trial[i] = { id: r.id, locked: false };
            const t = shoppingTotal(trial, prefs);
            if (t < bestTotal - 0.01) { bestTotal = t; move = [i, r.id]; }
          }
        });
        if (!move) break;
        menu[move[0]] = { id: move[1], locked: false };
      }
      return menu;
    }

    /* ctx : { prefs, previous (menu actuel), favorites, history, rng, keepLocked } */
    function generate(ctx) {
      const { prefs, previous = [], history = [], keepLocked = true } = ctx;
      const pool = poolFor(prefs, history);
      const ok = new Set(RECIPES.filter((r) => eligible(r, prefs)).map((r) => r.id));
      const slots = new Array(prefs.dinners).fill(null);
      if (keepLocked) {
        // Les dîners gardés conservent leur jour quand c'est possible.
        previous.forEach((m, i) => {
          if (!m.locked || !ok.has(m.id) || slots.some((s) => s && s.id === m.id)) return;
          const at = i < prefs.dinners && !slots[i] ? i : slots.indexOf(null);
          if (at >= 0) slots[at] = { id: m.id, locked: true };
        });
      }
      for (let i = 0; i < prefs.dinners; i++) {
        if (slots[i]) continue;
        const r = pickBest(pool, slots.filter(Boolean), [], ctx);
        if (r) slots[i] = { id: r.id, locked: false };
      }
      return fitBudget(slots.filter(Boolean), pool, prefs);
    }

    /* Remplace le dîner i par une autre recette. Renvoie le nouveau menu, ou null s'il n'y a pas d'alternative. */
    function swap(menu, i, ctx) {
      const pool = poolFor(ctx.prefs, ctx.history);
      const others = menu.filter((_, j) => j !== i);
      const r = pickBest(pool, others, [menu[i].id], ctx);
      if (!r) return null;
      const next = menu.slice();
      next[i] = { id: r.id, locked: false };
      return next;
    }

    return {
      DIETS, LEVELS, TIMES, DINNER_COUNTS, EQUIPMENT, STORES, DAY_NAMES, BASICS, DEFAULTS,
      weekStart, isoDate, dayOffset,
      byId, storeOf, levelLabel, priceOf, fmtQty, fmtPack,
      flagsOf, canCook, ovenToAF, devicesLabel, whyNot, eligible, isVegetarian, pantryUse,
      portionCost, buyLine, needs, shoppingLines, shoppingTotal, storeTotals, pantryUsed,
      poolFor, fitBudget, generate, swap,
    };
  };
});
