# Popote

Application web qui propose **les dîners de la semaine** et **la liste de courses qui va avec**, dans ton budget.
Inspirée du principe des planificateurs de repas, mais c'est une application originale (nom, design et code).

## Ce qu'elle fait

**Menu**
- Un menu de 3 à 7 dîners, calculé selon le nombre de personnes, le budget, l'enseigne, le régime, le niveau,
  le temps disponible, l'équipement (plaques, four, air fryer), le placard et les aversions.
- Le budget est tenu : si le menu dépasse, les dîners les plus chers sont remplacés automatiquement.
- Anti-gaspi : priorité aux recettes qui utilisent le placard et finissent les paquets entamés.
- Changer un dîner en un geste, le garder d'un menu à l'autre, et **annuler** la dernière action.
- D'une semaine à l'autre, les plats de la semaine précédente ne sont pas reproposés.

**Recettes**
- Catalogue de 64 recettes avec recherche (plat ou ingrédient) et filtres : selon mes réglages, favoris,
  20 min max, végétariennes, air fryer, moins de 2 € la part.
- Favoris (proposés plus souvent) et « Mettre au menu » le jour de son choix.
- Fiche recette : quantités ajustables, étapes à cocher, version air fryer, avertissement si la recette sort des réglages.

**Courses**
- Liste par rayon : paquets à acheter, prix estimé, prix au kilo, restes prévus, « Je l'ai déjà ».
- Ajout d'articles personnels (café, éponges…), copie de la liste en texte.
- Comparaison du panier entre Lidl, E.Leclerc, Intermarché, Carrefour et Auchan.

**Confort**
- Accueil guidé en quatre questions au premier lancement.
- Thème clair, sombre ou automatique. Mise en page adaptée au téléphone et à l'ordinateur.
- Installable sur l'écran d'accueil et **utilisable sans réseau** (service worker).
- Tout est enregistré sur l'appareil (localStorage). Aucun compte, aucun serveur.

## Limites à connaître

- Les **prix sont des estimations** : des moyennes de supermarché, ajustées par un écart moyen entre enseignes
  (palmarès UFC-Que Choisir 2026, étude 2025 sur 80 produits). Ce ne sont pas les prix d'un magasin précis.
- Les recettes ont été rédigées pour l'application et n'ont pas été testées en cuisine une par une.
  Les temps air fryer sont des moyennes.
- Les régimes sont calculés à partir des ingrédients principaux : en cas d'allergie, vérifier les étiquettes.
- Les assiettes sont des illustrations générées à partir des ingrédients, pas des photos.

## Lancer

Aucune installation ni étape de build. Servir le dossier :

```bash
npm start        # ou : npx serve .
```

Se déploie tel quel sur Vercel, Netlify ou GitHub Pages (site statique).

## Tests

```bash
npm test
```

16 tests (Node, sans dépendance) vérifient le moteur : cohérence des données, respect des régimes et de
l'équipement, calcul des achats (paquets, vrac, pièces), tenue du budget, dîners gardés, historique, semaines.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure des quatre écrans (Menu, Recettes, Courses, Réglages), fiche recette, accueil guidé |
| `styles.css` | Design, thèmes clair et sombre, mise en page téléphone et ordinateur |
| `data.js` | Ingrédients (conditionnement, prix, rayon, allergènes) et recettes |
| `planner.js` | Moteur : règles, prix, liste de courses, génération du menu. Sans dépendance au navigateur |
| `plate.js` | Dessin des assiettes à partir des ingrédients |
| `app.js` | Interface : rendu des écrans, actions, enregistrement |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | Installation et mode hors ligne |
| `tests/planner.test.js` | Tests du moteur |
