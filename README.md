# 🎥 charh.tv — rencontres vidéo aléatoires

Application web et mobile qui met en relation deux personnes au hasard pour une **conversation vidéo en direct**, avec un chat texte intégré. Projet personnel.

## ✨ Fonctionnalités
- Création de profil (pseudo, pays)
- **File d'attente** et mise en relation aléatoire entre utilisateurs en ligne
- **Appel vidéo et audio en temps réel en pair-à-pair** (WebRTC)
- Chat texte pendant l'appel
- Bouton « suivant » pour changer d'interlocuteur
- Compteur d'utilisateurs en ligne
- **Application installable** : PWA (service worker, manifest) et version **Android** via Capacitor

## 🏗️ Architecture
- **Front-end** : HTML, CSS, JavaScript (sans framework)
- **Back-end** : [Supabase](https://supabase.com) — base PostgreSQL et temps réel
  - tables `profiles`, `waiting_queue`, `matches`, `messages`, `webrtc_signals` (voir `supabase-schema.sql`)
  - **signalisation WebRTC** (offer / answer / ICE) transmise via Supabase Realtime
- **Déploiement** : Netlify (`netlify.toml`)
- **Mobile** : Capacitor (Android / iOS)

## ▶️ Lancer le projet
1. Créer un projet Supabase et exécuter `supabase-schema.sql`.
2. Renseigner `SUPABASE_URL` et `SUPABASE_KEY` en haut de `script.js`.
3. Lancer un serveur local :
```bash
npm run dev   # http://localhost:4173
```

## 🛠️ Technologies
JavaScript · WebRTC · Supabase (PostgreSQL, Realtime) · PWA · Capacitor · Netlify
