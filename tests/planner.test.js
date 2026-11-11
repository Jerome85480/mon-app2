/* Tests du moteur Popote. Lancer : npm test */
const test = require("node:test");
const assert = require("node:assert/strict");

globalThis.window = globalThis;
require("../data.js");
const createPlanner = require("../planner.js");

const { INGREDIENTS: ING, RECIPES, AISLES, PANTRY, DISLIKES } = globalThis;
const P = createPlanner({ INGREDIENTS: ING, RECIPES });

/* Générateur pseudo-aléatoire reproductible. */
function seeded(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const prefs = (over = {}) => ({ ...JSON.parse(JSON.stringify(P.DEFAULTS)), ...over });

test("données : chaque recette est complète et cohérente", () => {
  const aisles = new Set(AISLES.map((a) => a.id));
  const ids = new Set();
  for (const [id, g] of Object.entries(ING)) {
    assert.ok(g.name && g.price > 0, `ingrédient ${id} : nom et prix`);
    assert.ok(["g", "ml", "pc"].includes(g.unit), `ingrédient ${id} : unité`);
    assert.ok(aisles.has(g.aisle), `ingrédient ${id} : rayon connu`);
  }
  for (const r of RECIPES) {
    assert.ok(!ids.has(r.id), `id en double : ${r.id}`);
    ids.add(r.id);
    assert.ok(r.name && r.time > 0 && [1, 2, 3].includes(r.level), `${r.id} : nom, temps, niveau`);
    assert.ok(Array.isArray(r.need), `${r.id} : équipement`);
    for (const n of r.need) assert.ok(["plaque", "four"].includes(n), `${r.id} : équipement inconnu ${n}`);
    assert.ok(r.steps.length >= 2, `${r.id} : au moins deux étapes`);
    for (const [k, q] of Object.entries(r.ing)) {
      assert.ok(ING[k], `${r.id} : ingrédient inconnu ${k}`);
      assert.ok(q > 0, `${r.id} : quantité de ${k}`);
    }
    const cost = P.portionCost(r, "leclerc");
    assert.ok(cost > 0.3 && cost < 6, `${r.id} : prix par part plausible (${cost.toFixed(2)} €)`);
    if (r.sunday) assert.ok(r.time >= 45, `${r.id} : un plat du dimanche prend son temps`);
  }
  for (const id of [...PANTRY, ...DISLIKES]) assert.ok(ING[id], `liste placard / aversions : ${id}`);
});

test("régimes : aucune recette proposée ne contient un ingrédient interdit", () => {
  const cases = { vege: ["viande", "porc", "poisson"], pesco: ["viande", "porc"], sans_porc: ["porc"], sans_gluten: ["gluten"], sans_lactose: ["lactose"] };
  for (const [diet, bans] of Object.entries(cases)) {
    const ok = RECIPES.filter((r) => P.eligible(r, prefs({ diets: [diet], time: 60, level: 3 })));
    assert.ok(ok.length >= 10, `${diet} : au moins 10 recettes (${ok.length})`);
    for (const r of ok) for (const k of Object.keys(r.ing)) for (const f of ING[k].flags || []) assert.ok(!bans.includes(f), `${diet} : ${r.id} contient ${k}`);
  }
});

test("réglages : temps, niveau, aversions et équipement sont respectés", () => {
  const p = prefs({ time: 20, level: 1, dislikes: ["champignons"], equipment: ["plaque"] });
  for (const r of RECIPES.filter((x) => P.eligible(x, p))) {
    assert.ok(r.time <= 20 && r.level <= 1);
    assert.ok(!("champignons" in r.ing));
    assert.ok(!r.need.includes("four"));
  }
  // Sans four mais avec air fryer : seules les recettes qui ont une version air fryer passent.
  const af = prefs({ equipment: ["airfryer"], time: 60, level: 3 });
  const list = RECIPES.filter((x) => P.eligible(x, af));
  assert.ok(list.length >= 8);
  for (const r of list) {
    assert.ok(!r.need.includes("plaque"));
    if (r.need.includes("four")) { assert.ok(r.af); assert.ok(P.ovenToAF(r, af)); assert.equal(P.devicesLabel(r, af), "Air fryer"); }
  }
});

test("whyNot explique pourquoi une recette ne convient pas", () => {
  const carbonara = P.byId("carbonara");
  assert.deepEqual(P.whyNot(carbonara, prefs()), []);
  const reasons = P.whyNot(carbonara, prefs({ diets: ["vege", "sans_gluten"], time: 20 })).join(" | ");
  assert.match(reasons, /du porc/);
  assert.match(reasons, /du gluten/);
  assert.doesNotMatch(reasons, /min/); // 20 min : dans les temps
  assert.match(P.whyNot(P.byId("pizza_jambon"), prefs({ equipment: ["plaque"] })).join(), /four/);
});

test("achats : paquets entiers, vrac arrondi à 50 g, pièces entières", () => {
  // pâtes : paquet de 500 g
  let l = P.buyLine("pates", 440, "leclerc");
  assert.equal(l.packs, 1); assert.equal(l.leftover, 60); assert.equal(l.cost, ING.pates.price);
  l = P.buyLine("pates", 501, "leclerc");
  assert.equal(l.packs, 2);
  l = P.buyLine("pates", 500, "leclerc");
  assert.equal(l.packs, 1); assert.equal(l.leftover, 0);
  // courgettes : au poids
  l = P.buyLine("courgette", 160, "leclerc");
  assert.equal(l.qty, 200); assert.ok(Math.abs(l.cost - 0.2 * ING.courgette.price) < 1e-9);
  // poivrons : à la pièce
  l = P.buyLine("poivron", 1.5, "leclerc");
  assert.equal(l.qty, 2); assert.equal(l.cost, 2 * ING.poivron.price);
});

test("liste de courses : le placard n'est pas acheté et le total est la somme des lignes", () => {
  const menu = [{ id: "carbonara" }, { id: "chili" }, { id: "shakshuka" }];
  const p = prefs({ people: 4 });
  const lines = P.shoppingLines(menu, p);
  assert.ok(lines.every((l) => !p.pantry.includes(l.id)));
  assert.ok(!lines.some((l) => l.id === "pates"), "les pâtes sont au placard par défaut");
  assert.ok(Math.abs(P.shoppingTotal(menu, p) - lines.reduce((s, l) => s + l.cost, 0)) < 1e-9);
  // Les œufs sont mutualisés entre carbonara (1/pers) et shakshuka (2/pers) : 12 œufs = 2 boîtes de 6.
  const oeufs = lines.find((l) => l.id === "oeufs");
  assert.equal(oeufs.need, 12); assert.equal(oeufs.packs, 2);
  assert.deepEqual(oeufs.recipes.sort(), ["carbonara", "shakshuka"]);
  // Sans placard, la note monte.
  assert.ok(P.shoppingTotal(menu, prefs({ people: 4, pantry: [] })) > P.shoppingTotal(menu, p));
});

test("magasins : même panier, prix ordonnés selon l'indice de l'enseigne", () => {
  const menu = [{ id: "bolognaise" }, { id: "saumon" }, { id: "dahl" }];
  const t = Object.fromEntries(P.storeTotals(menu, prefs()).map((s) => [s.id, s.total]));
  assert.ok(t.lidl < t.leclerc && t.leclerc < t.intermarche && t.intermarche < t.carrefour && t.carrefour < t.auchan);
  assert.ok(Math.abs(t.auchan / t.leclerc - 1.13) < 1e-9);
});

test("menu : bon nombre de dîners, pas de doublon, uniquement des recettes qui conviennent", () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (const over of [{}, { diets: ["vege"] }, { dinners: 7, people: 4, budget: 90 }, { equipment: ["plaque", "airfryer"], time: 30 }]) {
      const p = prefs(over);
      const menu = P.generate({ prefs: p, rng: seeded(seed) });
      assert.equal(menu.length, P.slots(p).length);
      assert.equal(new Set(menu.map((m) => m.id)).size, menu.length);
      for (const m of menu) {
        const r = P.byId(m.id);
        assert.ok(m.sun ? P.eligibleSunday(r, p) || P.eligible(r, p) : P.eligible(r, p) && !r.sunday, `${m.id} ne convient pas`);
      }
    }
  }
});

test("menu : même graine, même menu", () => {
  const a = P.generate({ prefs: prefs(), rng: seeded(7) });
  const b = P.generate({ prefs: prefs(), rng: seeded(7) });
  assert.deepEqual(a, b);
});

test("budget : avec un budget normal le menu tient dedans", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const p = prefs({ budget: 50 }); // 2 personnes, 5 dîners + le dimanche, 50 €
    const menu = P.generate({ prefs: p, rng: seeded(seed) });
    assert.ok(P.shoppingTotal(menu, p) <= p.budget + 1e-9, `graine ${seed} : ${P.shoppingTotal(menu, p).toFixed(2)} €`);
  }
});

test("budget : s'il est intenable, le menu est au moins un optimum local (aucun échange simple ne fait mieux)", () => {
  const p = prefs({ budget: 20, people: 6, dinners: 7 });
  const menu = P.generate({ prefs: p, rng: seeded(3) });
  const total = P.shoppingTotal(menu, p);
  assert.ok(total > p.budget, "ce budget est volontairement intenable");
  const used = new Set(menu.map((m) => m.id));
  menu.forEach((m, i) => {
    for (const r of m.sun ? P.sundayPool(p) : P.poolFor(p)) {
      if (used.has(r.id)) continue;
      const trial = menu.slice(); trial[i] = { ...m, id: r.id };
      assert.ok(P.shoppingTotal(trial, p) >= total - 0.011);
    }
  });
});

test("dîners gardés : ils restent au même jour quand on refait le menu", () => {
  const p = prefs();
  const first = P.generate({ prefs: p, rng: seeded(11) });
  assert.ok(first.length >= 5);
  first[1].locked = true; first[4].locked = true;
  const next = P.generate({ prefs: p, previous: first, rng: seeded(99) });
  assert.deepEqual(next[1], first[1]);
  assert.deepEqual(next[4], first[4]);
  // Un dîner gardé qui ne convient plus (régime changé) est abandonné.
  const meat = [{ id: "chili", locked: true }];
  const vege = P.generate({ prefs: prefs({ diets: ["vege"] }), previous: meat, rng: seeded(5) });
  assert.ok(!vege.some((m) => m.id === "chili"));
});

test("historique : pas les plats de la semaine dernière quand il reste assez de choix", () => {
  const p = prefs();
  const lastWeek = P.generate({ prefs: p, rng: seeded(21) }).map((m) => m.id);
  for (let seed = 1; seed <= 30; seed++) {
    const menu = P.generate({ prefs: p, history: [lastWeek], rng: seeded(seed) });
    for (const m of menu) assert.ok(!lastWeek.includes(m.id), `${m.id} déjà mangé la semaine dernière`);
  }
});

test("changer un dîner : propose une autre recette et ne touche pas aux autres jours", () => {
  const p = prefs();
  const menu = P.generate({ prefs: p, rng: seeded(4) });
  const next = P.swap(menu, 2, { prefs: p, rng: seeded(8) });
  assert.notEqual(next[2].id, menu[2].id);
  assert.equal(new Set(next.map((m) => m.id)).size, next.length);
  [0, 1, 3, 4].forEach((i) => assert.deepEqual(next[i], menu[i]));
  // Aucune alternative : une seule recette possible.
  const narrow = prefs({ dinners: 3, equipment: [], time: 60, sunday: false });
  const only = P.generate({ prefs: narrow, rng: seeded(1) });
  assert.equal(only.length, 1);
  assert.equal(P.swap(only, 0, { prefs: narrow, rng: seeded(1) }), null);
});

test("semaine : on passe à la semaine suivante une fois le dernier repas prévu passé", () => {
  const wed = P.weekStart(new Date(2026, 10, 11, 15)); // mercredi 11 novembre 2026
  assert.equal(P.isoDate(wed), "2026-11-09");
  // Menu du lundi au vendredi : dès le samedi, on prépare la semaine suivante.
  assert.equal(P.isoDate(P.weekStart(new Date(2026, 10, 13, 23), 4)), "2026-11-09"); // vendredi soir
  assert.equal(P.isoDate(P.weekStart(new Date(2026, 10, 14, 8), 4)), "2026-11-16"); // samedi
  // Avec le plat du dimanche, la semaine dure jusqu'au dimanche soir.
  assert.equal(P.isoDate(P.weekStart(new Date(2026, 10, 14, 8), 6)), "2026-11-09"); // samedi
  assert.equal(P.isoDate(P.weekStart(new Date(2026, 10, 15, 20), 6)), "2026-11-09"); // dimanche soir
  assert.equal(P.isoDate(P.weekStart(new Date(2026, 10, 16, 8), 6)), "2026-11-16"); // lundi
  assert.equal(P.lastOffset(prefs({ sunday: false })), 4);
  assert.equal(P.lastOffset(prefs()), 6);
});

test("dimanche : un plat élaboré le dimanche, jamais en semaine", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const p = prefs({ budget: 60 });
    const menu = P.generate({ prefs: p, rng: seeded(seed) });
    const days = P.menuDays(menu, p);
    assert.deepEqual(days, [0, 1, 2, 3, 4, 6]);
    const sun = menu[menu.length - 1];
    assert.ok(sun.sun && P.byId(sun.id).sunday, `graine ${seed} : ${sun.id} n'est pas un plat du dimanche`);
    for (const m of menu.slice(0, -1)) assert.ok(!P.byId(m.id).sunday, `${m.id} un soir de semaine`);
  }
  // Le temps maximum ne s'applique pas au dimanche, mais le régime oui.
  const vege = prefs({ diets: ["vege"], time: 30, budget: 60 });
  const menu = P.generate({ prefs: vege, rng: seeded(2) });
  const sun = P.byId(menu.find((m) => m.sun).id);
  assert.ok(sun.sunday && sun.time > 30 && P.isVegetarian(sun));
  // Sans le dimanche : seulement les dîners demandés.
  const off = P.generate({ prefs: prefs({ sunday: false }), rng: seeded(2) });
  assert.equal(off.length, 5);
  assert.ok(off.every((m) => !m.sun && !P.byId(m.id).sunday));
  // Sept dîners + dimanche : le dimanche n'est pas compté deux fois.
  const seven = prefs({ dinners: 7, budget: 90 });
  assert.deepEqual(P.menuDays(P.generate({ prefs: seven, rng: seeded(3) }), seven), [0, 1, 2, 3, 4, 5, 6]);
});

test("dimanche : changer le plat propose un autre plat du dimanche", () => {
  const p = prefs({ budget: 60 });
  const menu = P.generate({ prefs: p, rng: seeded(6) });
  const i = menu.findIndex((m) => m.sun);
  for (let seed = 1; seed <= 10; seed++) {
    const next = P.swap(menu, i, { prefs: p, rng: seeded(seed) });
    assert.ok(next[i].sun && P.byId(next[i].id).sunday && next[i].id !== menu[i].id);
  }
});

test("mettre au menu : la recette choisie va au bon jour et reste gardée", () => {
  const p = prefs({ budget: 60 });
  const menu = P.generate({ prefs: p, rng: seeded(9) });
  const a = P.place(menu, p, 2, "lasagnes"); // mercredi
  assert.equal(a[2].id, "lasagnes"); assert.ok(a[2].locked);
  assert.equal(a.length, menu.length);
  const b = P.place(a, p, 5, "carbonara"); // dimanche
  const sun = b.find((m) => m.sun);
  assert.equal(sun.id, "carbonara"); assert.ok(sun.locked);
  assert.equal(P.menuDays(b, p)[b.indexOf(sun)], 6);
  // Déplacer une recette déjà au menu ne la duplique pas.
  const c = P.place(b, p, 0, "lasagnes");
  assert.equal(c.filter((m) => m.id === "lasagnes").length, 1);
  // Un repas gardé reste au même jour quand on refait le menu.
  const again = P.generate({ prefs: p, previous: b, rng: seeded(1) });
  assert.equal(again.find((m) => m.sun).id, "carbonara");
  assert.equal(again[2].id, "lasagnes");
});

test("durées : affichage lisible", () => {
  assert.equal(P.fmtTime(45), "45 min");
  assert.equal(P.fmtTime(60), "1 h");
  assert.equal(P.fmtTime(210), "3 h 30");
  assert.equal(P.fmtTime(75), "1 h 15");
});

test("quantités : affichage lisible", () => {
  assert.equal(P.fmtQty("pates", 220), "220 g");
  assert.equal(P.fmtQty("pates", 1250), "1,25 kg");
  assert.equal(P.fmtQty("poivron", 1.5), "1 ½");
  assert.equal(P.fmtQty("oignon", 0.25), "¼");
  assert.equal(P.fmtQty("lait", 120), "120 ml");
  assert.equal(P.fmtPack("oeufs"), "6 pc");
});
