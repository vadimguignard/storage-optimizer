# Storage Optimizer

Application web personnelle pour préparer un déménagement : décrire ses objets et ses cartons, définir un espace disponible, vérifier que tout rentre et visualiser une disposition 3D.

> Le problème traité est du **3D bin packing** : on ne compare pas seulement des volumes, on place des boîtes avec leurs trois dimensions, leurs rotations autorisées et sans collision.

## Fonctionnalités de la version 1

- Gestion des **objets** : nom, forme (boîte ou cylindre), dimensions, unité (mm/cm/m), rotations autorisées, quantité, couleur, recherche, ajout/modification/suppression.
- Gestion des **cartons** : dimensions, quantité, contenu déclaré et outil « cet objet rentre-t-il ? ».
- **Simulateur** :
  - mode « objets » : placement direct dans l'espace ;
  - mode « cartons » : les objets sont d'abord emballés dans les cartons, puis les cartons sont placés dans l'espace ;
  - contrainte globale sur les rotations, nombre d'essais réglable ;
  - résultats chiffrés (objets placés, taux de remplissage, hauteur utilisée, temps de calcul) et liste des objets non placés.
- **Visualisation 3D** avec Three.js : rotation/zoom à la souris, clic sur un objet pour voir son nom et ses dimensions, affichage/masquage du contour et des cartons.
- Données **éditables via GitHub** (`data/*.json`) et persistance dans le navigateur (`localStorage`), avec import/export JSON.

## Démarrage

### Option A — ouvrir directement `index.html`

Double-cliquez sur `index.html`. Les données d'exemple intégrées dans `js/data.js` sont utilisées, Three.js est présent dans `assets/vendor/`. Aucune connexion Internet n'est nécessaire.

### Option B — serveur local (recommandé)

```bash
npm start
# puis ouvrir http://localhost:8080
```

Le serveur Node inclus n'a aucune dépendance. Il permet notamment de charger les fichiers `data/*.json` comme jeu de données initial.

### Tests

```bash
npm test
```

Les tests couvrent la géométrie (unités, orientations, frontières, collisions), le packing (10 cas du cahier des charges) et le dépôt de données (import/export, validation).

## Utilisation

1. **Objets** : ajoutez vos affaires avec leurs dimensions. Le volume est calculé automatiquement. La quantité permet de représenter plusieurs exemplaires identiques.
2. **Cartons** : indiquez les cartons disponibles et leur nombre.
3. **Simulateur** :
   - renseignez l'espace (par exemple `3 × 2 × 2,5 m`) ;
   - choisissez le mode de calcul et les éléments à inclure ;
   - cliquez sur **Optimiser** ;
   - tournez la scène à la souris et cliquez sur un objet pour l'identifier.

## Architecture

```
├── index.html            Accueil et résumé
├── objects.html          Gestion des objets
├── containers.html       Gestion des cartons
├── simulator.html        Simulateur + visualisation
├── css/style.css         Interface
├── js/
│   ├── app.js            Navigation, modales, toasts, formatage, import/export
│   ├── data.js           Dépôt localStorage + amorçage depuis data/*.json
│   ├── objects.js        Logique de la page Objets
│   ├── containers.js     Logique de la page Cartons
│   ├── geometry.js       Unités, volumes, rotations, limites, collisions
│   ├── packing.js        Heuristique de placement + mode cartons
│   ├── viewer3d.js       Rendu Three.js
│   └── simulator.js      Orchestration du simulateur
├── data/                 Jeux de données JSON modifiables via GitHub
├── tests/                Tests Node (node:test)
├── assets/vendor/        Three.js (version locale, hors ligne)
└── server.js             Serveur statique optionnel
```

## Modèle de données

```json
{
  "id": "table-001",
  "name": "Table à manger",
  "type": "box",
  "dimensions": { "length": 180, "width": 80, "height": 75 },
  "unit": "cm",
  "rotations": "allowed",
  "quantity": 1,
  "color": "#3b82f6"
}
```

- `type` : `box` (`length`, `width`, `height`) ou `cylinder` (`diameter`, `height`). Un cylindre est approché par sa boîte englobante.
- `rotations` : `allowed` (6 orientations), `upright` (2 orientations, hauteur conservée), `none` (aucune).
- `unit` : `mm`, `cm` ou `m`. Toutes les conversions sont faites en interne en centimètres.

Un conteneur suit le même modèle avec `quantity` (nombre de cartons de ce type disponibles) et `contents` (liste indicative d'identifiants d'objets).

## Algorithme

`packing.js` implémente une heuristique « extreme points » :

1. normalisation des unités et expansion des quantités ;
2. tri des objets par volume décroissant ;
3. génération de points candidats (origine + sommets des objets déjà placés) ;
4. essai de chaque orientation autorisée à chaque point ;
5. rejet si dépassement des limites ou collision ;
6. score de placement : hauteur, puis position, puis nombre de faces en contact ;
7. plusieurs essais avec un ordre légèrement aléatoire, conservation de la meilleure solution (moins d'objets non placés, puis hauteur et empreinte au sol minimales).

Le mode cartons applique la même logique à deux niveaux : remplissage des cartons puis placement des cartons dans l'espace. Les objets contenus dans un carton restent visibles dans la scène 3D.

C'est volontairement une heuristique : une solution mathématiquement optimale devient très coûteuse à calculer dès que le nombre d'objets augmente. Ici, une très bonne solution en quelques secondes est préférable.

## Limites connues de la V1

- Géométrie alignée sur les axes uniquement (pas de rotation arbitraire).
- Les cylindres sont approchés par leur boîte englobante.
- Aucune contrainte avancée (fragilité, accès, poids, priorité de déballage).
- Le nombre de cartons ouverts est limité par la quantité déclarée ; le remplissage des cartons est glouton (first-fit).
- Les données sont stockées par navigateur : exportez le JSON pour les sauvegarder ou les versionner.

## Évolutions possibles

- Web Worker pour ne pas bloquer l'interface sur les gros calculs.
- Recherche locale / recuit simulé pour améliorer les scores.
- Solveur exact ou CP-SAT pour les petits cas critiques.
- TypeScript, base de données et mode collaboratif si le projet grandit.
- Export de la disposition (plan de chargement PDF, liste par carton).

## GitHub Pages

1. Créez un dépôt public et poussez tout le contenu du dossier.
2. Dans **Settings → Pages**, choisissez « Deploy from a branch » → `main` → `/ (root)`.
3. Le site est alors disponible sur `https://<pseudo>.github.io/<depot>/`.

`data/objects.json` et `data/containers.json` peuvent être modifiés directement sur GitHub : ils servent de données initiales tant que le navigateur n'a pas encore de données locales (bouton « Réinitialiser » pour repartir de ces fichiers).
