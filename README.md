# Popote

Petite appli web qui propose **les dîners de la semaine** et **la liste de courses qui va avec**, dans ton budget.
Inspirée du principe des planificateurs de repas comme Pimzi, mais c'est une appli originale (nom, design et code).

## Ce qu'elle fait

- **Menu de la semaine** (3 à 7 dîners) calculé selon :
  - le nombre de personnes, le budget courses, le régime (végétarien, sans porc, sans gluten, sans lactose…),
  - le niveau en cuisine et le temps disponible le soir,
  - ce que tu as déjà dans ton placard et ce que tu n'aimes pas.
- **Respect du budget** : si le menu dépasse, l'appli remplace automatiquement les dîners les plus chers.
- **Anti-gaspi** : elle privilégie les recettes qui utilisent ton placard et qui finissent les paquets déjà ouverts.
  La liste indique ce qu'il restera de chaque paquet (« reste 360 g »).
- **Changer** un dîner en un geste, ou le **cadenasser** pour le garder au prochain menu.
- **Fiche recette** : quantités ajustables au nombre de parts, étapes à cocher pendant la cuisson.
- **Liste de courses par rayon** : paquets à acheter, prix estimé, prix au kilo, cases à cocher, bouton « Je l'ai déjà », copie en texte.
- **Choix du magasin** (Lidl, E.Leclerc, Intermarché, Carrefour, Auchan) : les prix sont ajustés selon l'écart moyen entre enseignes
  (palmarès UFC-Que Choisir 2026, étude 2025), avec une comparaison du panier et un lien de recherche sur lidl.fr ou e.leclerc.
- **Équipement** (plaques induction / vitro / gaz, four, air fryer) : le menu ne propose que ce que tu peux cuisiner.
  Sans four mais avec un air fryer, les gratins, pizzas, quiches et rôtis passent au air fryer (températures et temps indiqués).
- Design « table de cuisine » : assiettes illustrées générées à partir des ingrédients, bloc « Ce soir » sur nappe vichy,
  budget en ticket de caisse, prix en étiquettes de rayon.
- Mode sombre, utilisable au pouce sur mobile, installable comme appli (manifest). Tout est stocké sur l'appareil (localStorage).

## Limites à connaître

- Les **prix sont des moyennes estimées** (supermarché, France 2026), pas les prix réels d'un magasin. Le choix d'enseigne applique un écart moyen national, pas les prix du magasin près de chez toi.
  Avoir les prix exacts de ton magasin demanderait une vraie source de prix (API ou relevés).
- 64 recettes : avec beaucoup de filtres cumulés (ex. végétarien + sans gluten, ou air fryer seul), il en reste une dizaine.

## Lancer

Aucune installation ni build. Ouvre `index.html` dans un navigateur, ou sers le dossier :

```bash
npx serve .
```

Se déploie tel quel sur Vercel, Netlify ou GitHub Pages (site statique).

## Fichiers

- `index.html` : structure des trois écrans (Menu, Courses, Mes goûts)
- `styles.css` : design (thèmes clair et sombre)
- `data.js` : ingrédients (conditionnement, prix, rayon, allergènes) et recettes
- `plate.js` : dessin des assiettes (vue de dessus) à partir des ingrédients
- `app.js` : génération du menu, budget, liste de courses, interactions
