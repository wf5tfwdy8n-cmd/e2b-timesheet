# Pointage d'Heures (PWA)

Application de pointage d'heures fonctionnant 100% en local (données dans le navigateur) avec installation sur écran d'accueil (PWA).

## Démarrer en local
```bash
npm install
npm run dev
```
Ouvrez l'URL indiquée par Vite.

## Build de production
```bash
npm run build
npm run preview
```

## Déployer gratuitement
- **Vercel** : Importez ce dossier dans un repo GitHub puis "New Project" > Framework Vite (build: `npm run build`, output: `dist`).
- **Netlify** : Déposez le dossier, build `npm run build`, publish directory `dist`.
- **GitHub Pages** : `npm run build` puis poussez le contenu du dossier `dist`.

Après le déploiement, ouvrez l'URL depuis votre téléphone et utilisez « Ajouter à l'écran d'accueil » pour l'installer.
