# Voir 4GIx V02 en local (avant l’exécutable Desktop)

Objectif : travailler dans le **navigateur** avec le **backend Python** — sans Electron ni PyInstaller.

## Prérequis

- Python 3 avec les deps : `pip install -r requirements.txt`
- Node.js 18+

## Une seule commande (recommandé)

À la racine du projet :

```powershell
cd "D:\CODE\4gix V02\4gix V02"
npm run install:all   # première fois uniquement
npm start
```

(`npm start` = `npm run local` : API sur le port **8000** + interface sur **http://127.0.0.1:5173**)

Ou :

```powershell
.\local.ps1
```

Le navigateur s’ouvre sur l’éditeur React Flow (palette, canvas, panneau de config).

## Deux terminaux (alternative)

**Terminal 1 — API**

```powershell
cd apps\backend
python main.py
```

**Terminal 2 — interface**

```powershell
cd apps\frontend
npm install
npm run dev
```

Ouvrir **http://127.0.0.1:5173**

## Vérifier que l’API répond

http://127.0.0.1:8000/api/health → `{"status":"ok",...}`

## Plus tard : fenêtre Desktop (Electron)

Quand la preview navigateur vous convient :

```powershell
npm run desktop:build
```

Depuis `apps\desktop` avec UI déjà buildée : `npm start` (sans `FOURGIX_DEV`).

L’exécutable Windows (PyInstaller / electron-builder) viendra dans une étape packaging dédiée.
