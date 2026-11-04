/* Popote — illustration d'assiette vue de dessus, générée à partir des ingrédients de la recette.
   Chaque ingrédient a une couleur et une forme ; la position des morceaux est tirée au hasard
   mais toujours la même pour une recette donnée (graine = id de la recette). */
(() => {
  "use strict";

  // [couleur, forme]. Formes de fond : strands (pâtes), grains (riz…), smooth (sauce, pâte, soupe).
  // Morceaux : chunk, dot, slice, strip, leaf, shred, egg. none = invisible une fois cuisiné.
  const LOOK = {
    pates: ["#E9C46A", "strands"], nouilles: ["#DDB25A", "strands"],
    riz: ["#F3EDDC", "grains"], riz_rond: ["#EEE4C8", "grains"], semoule: ["#E6CB86", "grains"], lentilles: ["#7A5A3A", "grains"],
    tomates_conc: ["#C8402E", "smooth"], lait_coco: ["#F1E7D6", "smooth"], creme: ["#F5EEDD", "smooth"],
    pate_brisee: ["#D9A55B", "smooth"], pate_pizza: ["#DDAE63", "smooth"], tortillas: ["#E6C68C", "smooth"],
    butternut: ["#E9963A", "smooth"],
    pois_chiches: ["#D9B26F", "dot"], haricots: ["#8E2F2B", "dot"], mais: ["#F2C230", "dot"], petits_pois: ["#6DA544", "dot"],
    gnocchis: ["#E9CF92", "dot"], mozzarella: ["#FAF8F1", "dot"], pesto: ["#4F7D2C", "dot"],
    thon: ["#C9A48A", "chunk"], feta: ["#F6F3EA", "chunk"], tofu: ["#EFE3C2", "chunk"], lardons: ["#C9705A", "chunk"],
    poulet: ["#E7C79A", "chunk"], boeuf: ["#7B3F2E", "chunk"], saumon: ["#F08A5D", "chunk"], cabillaud: ["#F4EFE7", "chunk"],
    pdt: ["#E8C27A", "chunk"], avocat: ["#9BBF4B", "chunk"],
    jambon: ["#E8A0A0", "slice"], chorizo: ["#B83A2A", "slice"], saucisses: ["#9B4A35", "slice"], carotte: ["#EC7A2C", "slice"],
    courgette: ["#6E9A3A", "slice"], tomate: ["#E04B3A", "slice"], champignons: ["#B89A7A", "slice"], poireau: ["#A6C77F", "slice"],
    citron: ["#F5D547", "slice"], pain: ["#C98E4A", "slice"], pain_mie: ["#E5C48F", "slice"],
    poivron: ["#D9412B", "strip"],
    epinards: ["#2F6B2F", "leaf"], brocoli: ["#3E7D32", "leaf"], salade: ["#7DB346", "leaf"], persil: ["#3F8F3A", "leaf"],
    fromage_rape: ["#F2D57E", "shred"], parmesan: ["#EEDC9A", "shred"],
    oeufs: ["#FFFDF6", "egg"],
    patate_douce: ["#E8823A", "chunk"], chou_fleur: ["#F1EAD2", "chunk"], aubergine: ["#5B3A6B", "slice"], concombre: ["#86B85E", "slice"],
    haricots_verts: ["#5E9A3A", "strip"], legumes_wok: ["#7DAA4A", "strip"], crevettes: ["#F29A7A", "chunk"], dinde: ["#E9CC9F", "chunk"],
    merguez: ["#8E3A26", "slice"], sardines: ["#8C95A2", "chunk"], quinoa: ["#E6D6A8", "grains"], olives: ["#2E2A26", "dot"],
    yaourt: ["#FBF8F0", "dot"], pate_feuilletee: ["#E2B66A", "smooth"], ravioli: ["#EED39A", "dot"], pain_burger: ["#D69A4E", "smooth"],
  };
  // Fonds de soupe et de sauce qui ne viennent pas d'un seul ingrédient
  const BASE_TINT = {
    soupe_poireaux: "#C9D99A", dahl: "#D9A441", curry_pc: "#E2B04A", chili: "#9C3A26", shakshuka: "#C8402E", basquaise: "#C9542F",
    omelette: "#F2CF6A", ratatouille: "#B8452E", soupe_lentilles: "#D98C3A", minestrone: "#C9643A", veloute_patate_douce: "#E98A3A",
    chili_sin_carne: "#9C3A26", salade_nicoise: "#9CC66A", tartines_sardines: "#C98E4A", poulet_coco: "#EBD9A8", bolognaise: "#A8402B",
    one_pot: "#C8402E", dinde_croustillante: "#C9D99A", nuggets: "#C9D99A", saumon_four: "#E9E3D2",
    gratin_dauphinois: "#E9C77A", gratin_chou_fleur: "#E9C77A", oeufs_cocotte: "#3E7A35", chou_fleur_curry: "#E2B04A",
    patate_douce_rotie: "#EADBB8", aubergines_roties: "#D9C9A0",
  };
  const BASE_KINDS = new Set(["strands", "grains", "smooth"]);

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
    return "#" + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((c) => c.toString(16).padStart(2, "0")).join("");
  }
  const r1 = (v) => Math.round(v * 10) / 10;

  function blob(rand, cx, cy, r, wobble = 0.08, pts = 11) {
    const p = [];
    for (let i = 0; i < pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const rr = r * (1 - wobble + rand() * wobble * 2);
      p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    let d = "";
    for (let i = 0; i < pts; i++) {
      const [x1, y1] = p[i];
      const [x2, y2] = p[(i + 1) % pts];
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      d += i === 0 ? `M${r1((p[pts - 1][0] + x1) / 2)} ${r1((p[pts - 1][1] + y1) / 2)}` : "";
      d += `Q${r1(x1)} ${r1(y1)} ${r1(mx)} ${r1(my)}`;
    }
    return d + "Z";
  }

  function inDisc(rand, R) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * R;
    return [50 + Math.cos(a) * d, 50 + Math.sin(a) * d];
  }

  function piece(kind, color, rand, R) {
    const [x, y] = inDisc(rand, R);
    const rot = Math.round(rand() * 180);
    const dark = shade(color, -0.12), light = shade(color, 0.1);
    switch (kind) {
      case "dot": {
        const r = 2.4 + rand() * 1.4;
        return `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" fill="${color}" stroke="${dark}" stroke-width=".5"/>`;
      }
      case "chunk": {
        const w = 6 + rand() * 3, h = 4.5 + rand() * 2;
        return `<rect x="${r1(x - w / 2)}" y="${r1(y - h / 2)}" width="${r1(w)}" height="${r1(h)}" rx="1.6" fill="${color}" stroke="${dark}" stroke-width=".5" transform="rotate(${rot} ${r1(x)} ${r1(y)})"/>`;
      }
      case "slice": {
        const r = 3.6 + rand() * 1.2;
        return `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" fill="${color}" stroke="${dark}" stroke-width=".6"/><circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r * 0.55)}" fill="${light}" opacity=".7"/>`;
      }
      case "strip": {
        const w = 10 + rand() * 4;
        return `<rect x="${r1(x - w / 2)}" y="${r1(y - 1.3)}" width="${r1(w)}" height="2.6" rx="1.3" fill="${color}" stroke="${dark}" stroke-width=".4" transform="rotate(${rot} ${r1(x)} ${r1(y)})"/>`;
      }
      case "leaf": {
        return `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(3.6 + rand() * 1.6)}" ry="${r1(1.8 + rand())}" fill="${color}" stroke="${dark}" stroke-width=".5" transform="rotate(${rot} ${r1(x)} ${r1(y)})"/>`;
      }
      case "shred": {
        const l = 3 + rand() * 2.5;
        const a = (rot * Math.PI) / 180;
        return `<line x1="${r1(x)}" y1="${r1(y)}" x2="${r1(x + Math.cos(a) * l)}" y2="${r1(y + Math.sin(a) * l)}" stroke="${color}" stroke-width="1.3" stroke-linecap="round"/>`;
      }
      default:
        return "";
    }
  }

  function count(kind, q) {
    const base = { dot: 7, chunk: 5, slice: 5, strip: 5, leaf: 5, shred: 12 }[kind] || 0;
    return q < 0.3 ? Math.ceil(base / 2) : base;
  }

  /* Renvoie le SVG d'une assiette pour la recette r. */
  window.plateSVG = function (r) {
    const rand = rng(hash(r.id));
    const uid = "p" + hash(r.id + Math.random()).toString(36);
    const ids = Object.keys(r.ing).filter((id) => LOOK[id] && LOOK[id][1] !== "none");
    const bases = ids.filter((id) => BASE_KINDS.has(LOOK[id][1]));
    const parts = [];

    // Fond : jusqu'à deux couches (ex. pâte à pizza + sauce tomate)
    const tint = BASE_TINT[r.id];
    const layers = bases.slice(0, 2);
    if (tint) layers.splice(layers.length ? 1 : 0, 1, null);
    if (!layers.length) layers.push(null);
    layers.forEach((id, k) => {
      const kind = id ? LOOK[id][1] : "smooth";
      const color = id ? LOOK[id][0] : tint || "#D8C3A0";
      const R = k === 0 ? 30 : 25;
      parts.push(`<path d="${blob(rand, 50, 50, R, k === 0 ? 0.07 : 0.1)}" fill="${color}"/>`);
      if (kind === "strands") {
        for (let i = 0; i < 16; i++) {
          const [x, y] = inDisc(rand, R - 6);
          const a = rand() * Math.PI * 2, l = 7 + rand() * 6;
          const cx = x + Math.cos(a + 1.2) * 5, cy = y + Math.sin(a + 1.2) * 5;
          parts.push(`<path d="M${r1(x)} ${r1(y)}Q${r1(cx)} ${r1(cy)} ${r1(x + Math.cos(a) * l)} ${r1(y + Math.sin(a) * l)}" stroke="${shade(color, i % 2 ? -0.1 : 0.08)}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`);
        }
      } else if (kind === "grains") {
        for (let i = 0; i < 46; i++) {
          const [x, y] = inDisc(rand, R - 2.5);
          parts.push(`<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="1.4" ry=".7" fill="${shade(color, rand() > 0.5 ? -0.09 : 0.06)}" transform="rotate(${Math.round(rand() * 180)} ${r1(x)} ${r1(y)})"/>`);
        }
      }
    });

    // Morceaux
    const R = layers.length > 1 ? 20 : 23;
    ids.filter((id) => !BASE_KINDS.has(LOOK[id][1])).forEach((id) => {
      const [color, kind] = LOOK[id];
      if (kind === "egg") {
        const n = Math.min(2, Math.max(1, Math.round(r.ing[id])));
        for (let i = 0; i < n; i++) {
          const [x, y] = inDisc(rand, 12);
          parts.push(`<path d="${blob(rand, x, y, 8, 0.16, 9)}" fill="${color}" stroke="#E9E2CF" stroke-width=".5"/><circle cx="${r1(x + 1)}" cy="${r1(y - 0.5)}" r="3.4" fill="#F2A922"/><circle cx="${r1(x)}" cy="${r1(y - 1.5)}" r="1" fill="#FFE3A1"/>`);
        }
        return;
      }
      const n = count(kind, r.ing[id]);
      for (let i = 0; i < n; i++) parts.push(piece(kind, color, rand, R));
    });

    // Persil / poivre en finition
    for (let i = 0; i < 9; i++) {
      const [x, y] = inDisc(rand, 26);
      parts.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(0.4 + rand() * 0.4)}" fill="${i % 3 ? "#3B3226" : "#4C8A3A"}" opacity=".7"/>`);
    }

    return `<svg class="plate-svg" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id="${uid}l" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></radialGradient>
        <clipPath id="${uid}c"><circle cx="50" cy="50" r="36"/></clipPath>
      </defs>
      <circle cx="51.5" cy="53" r="47" fill="#000" opacity=".14"/>
      <circle cx="50" cy="50" r="47" fill="var(--plate)" stroke="var(--plate-edge)" stroke-width="1"/>
      <circle cx="50" cy="50" r="37" fill="var(--plate-well)"/>
      <g clip-path="url(#${uid}c)">${parts.join("")}<circle cx="50" cy="50" r="36" fill="url(#${uid}l)"/></g>
      <circle cx="50" cy="50" r="42" fill="none" stroke="var(--plate-edge)" stroke-width=".6" opacity=".7"/>
    </svg>`;
  };
})();
