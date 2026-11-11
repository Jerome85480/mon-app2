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
  const MAINS = ["boeuf_braiser", "veau", "poulet_entier", "roti_porc", "poulet", "dinde", "boeuf", "merguez", "saucisses", "lardons", "jambon", "chorizo", "saumon", "cabillaud", "crevettes", "thon", "sardines", "tofu", "pois_chiches", "lentilles", "haricots", "oeufs", "gnocchis", "ravioli"];
  const STARCHES = ["pates", "riz", "riz_rond", "pdt", "patate_douce", "semoule", "quinoa", "tortillas", "pate_pizza", "pate_brisee", "pate_feuilletee", "nouilles", "pain_burger", "lasagnes"];
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
    sunday: true, // un plat plus élaboré le dimanche
  };

  /* ---------- Dates ---------- */
  /* Lundi de la semaine à planifier. Une fois le dernier repas prévu passé (lastOffset, 0 = lundi),
     on prépare la semaine suivante : dès le samedi pour un menu du lundi au vendredi,
     seulement le lundi quand il y a un plat du dimanche. */
  function weekStart(now = new Date(), lastOffset = 4) {
    const d = new Date(now);
    const dow = (d.getDay() + 6) % 7; // 0 = lundi
    d.setDate(d.getDate() - dow + (dow > lastOffset ? 7 : 0));
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function isoDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  /* Repas de la semaine : les dîners prévus (off = jour, 0 = lundi), plus le dimanche s'il a droit à son plat. */
  function slots(prefs) {
    const out = (DAY_PLAN[prefs.dinners] || DAY_PLAN[5]).filter((off) => !(prefs.sunday && off === 6)).map((off) => ({ off, sun: false }));
    if (prefs.sunday) out.push({ off: 6, sun: true });
    return out;
  }
  const lastOffset = (prefs) => Math.max(...slots(prefs).map((s) => s.off));
  /* Jour de chaque plat du menu : le plat du dimanche est toujours dimanche, les autres suivent l'ordre des dîners. */
  function menuDays(menu, prefs) {
    const week = slots(prefs).filter((s) => !s.sun).map((s) => s.off);
    let k = 0;
    return menu.map((m) => {
      if (m.sun) return 6;
      const off = week[k] ?? k;
      k++;
      return off;
    });
  }
  function fmtTime(min) {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
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
    /* Le dimanche, on a le temps : pas de durée maximum, et un cran de difficulté en plus. Régime, goûts et équipement restent respectés. */
    const sundayPrefs = (prefs) => ({ ...prefs, time: Infinity, level: Math.min(3, prefs.level + 1) });
    const whyNotSunday = (r, prefs) => whyNot(r, sundayPrefs(prefs));
    const eligibleSunday = (r, prefs) => !!r.sunday && whyNotSunday(r, prefs).length === 0;
    /* Un plat choisi ou gardé à la main reste au menu s'il respecte régime, goûts et équipement, même s'il est long. */
    const fitsHousehold = (r, prefs) => whyNot(r, { ...prefs, time: Infinity, level: 3 }).length === 0;
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
      // Le plat du dimanche a droit à une plus grosse part du budget (environ le double d'un dîner).
      const target = (prefs.budget / Math.max(1, slots(prefs).length * prefs.people)) * (r.sunday ? 2 : 1);
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
      // En semaine : pas les plats du dimanche (trop longs pour un soir de semaine).
      const all = RECIPES.filter((r) => !r.sunday && eligible(r, prefs));
      const last = new Set(history[0] || []);
      const fresh = all.filter((r) => !last.has(r.id));
      return fresh.length >= prefs.dinners * 2 ? fresh : all;
    }

    /* Plats du dimanche proposables, sans celui de la semaine dernière s'il reste du choix. */
    function sundayPool(prefs, history = []) {
      const all = RECIPES.filter((r) => eligibleSunday(r, prefs));
      const last = new Set(history[0] || []);
      const fresh = all.filter((r) => !last.has(r.id));
      return fresh.length >= 2 ? fresh : all;
    }

    /* Tant que le menu dépasse le budget, remplace le repas (non gardé) qui fait le plus baisser la note.
       pools : { pool, sunPool }. frozen : ids à ne pas toucher. */
    function fitBudget(menu, pools, prefs, frozen) {
      /* Meilleur échange possible parmi les repas qui passent le filtre « which ». */
      const bestMove = (which) => {
        let bestTotal = shoppingTotal(menu, prefs);
        let move = null;
        const ids = new Set(menu.map((m) => m.id));
        menu.forEach((m, i) => {
          if (m.locked || (frozen && frozen.has(m.id)) || !which(m)) return;
          for (const r of m.sun && pools.sunPool.length ? pools.sunPool : pools.pool) {
            if (ids.has(r.id)) continue;
            const trial = menu.slice();
            trial[i] = { ...m, id: r.id };
            const t = shoppingTotal(trial, prefs);
            if (t < bestTotal - 0.01) { bestTotal = t; move = [i, r.id]; }
          }
        });
        return move;
      };
      // D'abord alléger les dîners de semaine ; le plat du dimanche n'est simplifié qu'en dernier recours.
      for (const which of [(m) => !m.sun, () => true]) {
        for (let round = 0; round < 25; round++) {
          if (shoppingTotal(menu, prefs) <= prefs.budget) return menu;
          const move = bestMove(which);
          if (!move) break;
          menu[move[0]] = { ...menu[move[0]], id: move[1], locked: false };
        }
      }
      return menu;
    }

    /* ctx : { prefs, previous (menu actuel), favorites, history, rng, keepLocked, keepAll }
       keepAll : garde tout le menu actuel et ne remplit que les repas manquants. */
    function generate(ctx) {
      const { prefs, previous = [], history = [], keepLocked = true, keepAll = false } = ctx;
      const sl = slots(prefs);
      const sunAt = sl.findIndex((x) => x.sun);
      const pools = { pool: poolFor(prefs, history), sunPool: sundayPool(prefs, history) };
      const okKept = (id) => fitsHousehold(byId(id), prefs);
      const out = new Array(sl.length).fill(null);
      if (keepLocked || keepAll) {
        // Les repas gardés conservent leur jour quand c'est possible.
        let rank = 0;
        for (const m of previous) {
          const k = m.sun ? -1 : rank++;
          if (!(keepAll || m.locked) || !byId(m.id) || out.some((x) => x && x.id === m.id)) continue;
          if (!okKept(m.id)) continue;
          if (m.sun && sunAt >= 0 && !out[sunAt]) {
            out[sunAt] = { id: m.id, locked: !!m.locked, sun: true };
            continue;
          }
          const at = k >= 0 && k < sl.length && !sl[k].sun && !out[k] ? k : out.findIndex((x, i) => !x && !sl[i].sun);
          if (at >= 0) out[at] = { id: m.id, locked: !!m.locked };
        }
      }
      const frozen = keepAll ? new Set(out.filter(Boolean).map((x) => x.id)) : null;
      sl.forEach((slot, i) => {
        if (out[i]) return;
        const chosen = out.filter(Boolean);
        // Dimanche : un plat du dimanche si possible, sinon un dîner ordinaire.
        const r = (slot.sun && pickBest(pools.sunPool, chosen, [], ctx)) || pickBest(pools.pool, chosen, [], ctx);
        if (r) out[i] = slot.sun ? { id: r.id, locked: false, sun: true } : { id: r.id, locked: false };
      });
      return fitBudget(out.filter(Boolean), pools, prefs, frozen);
    }

    /* Remplace le repas i par une autre recette. Renvoie le nouveau menu, ou null s'il n'y a pas d'alternative. */
    function swap(menu, i, ctx) {
      const m = menu[i];
      const others = menu.filter((_, j) => j !== i);
      const r = (m.sun && pickBest(sundayPool(ctx.prefs, ctx.history), others, [m.id], ctx))
        || pickBest(poolFor(ctx.prefs, ctx.history), others, [m.id], ctx);
      if (!r) return null;
      const next = menu.slice();
      next[i] = m.sun ? { id: r.id, locked: false, sun: true } : { id: r.id, locked: false };
      return next;
    }

    /* Met une recette choisie à la main sur un repas de la semaine (slotIndex dans slots(prefs)). Elle est gardée. */
    function place(menu, prefs, slotIndex, id) {
      const slot = slots(prefs)[slotIndex];
      if (!slot) return menu;
      const next = menu.filter((m) => m.id !== id);
      if (slot.sun) {
        const at = next.findIndex((m) => m.sun);
        const item = { id, locked: true, sun: true };
        if (at >= 0) next[at] = item; else next.push(item);
        return next;
      }
      const item = { id, locked: true };
      let k = -1;
      for (let j = 0; j < next.length; j++) {
        if (!next[j].sun && ++k === slotIndex) { next[j] = item; return next; }
      }
      const sunAt = next.findIndex((m) => m.sun);
      if (sunAt >= 0) next.splice(sunAt, 0, item); else next.push(item);
      return next;
    }

    return {
      DIETS, LEVELS, TIMES, DINNER_COUNTS, EQUIPMENT, STORES, DAY_NAMES, BASICS, DEFAULTS,
      weekStart, isoDate, slots, lastOffset, menuDays, fmtTime,
      byId, storeOf, levelLabel, priceOf, fmtQty, fmtPack,
      flagsOf, canCook, ovenToAF, devicesLabel, whyNot, eligible, whyNotSunday, eligibleSunday, fitsHousehold, isVegetarian, pantryUse,
      portionCost, buyLine, needs, shoppingLines, shoppingTotal, storeTotals, pantryUsed,
      poolFor, sundayPool, generate, swap, place,
    };
  };
});
