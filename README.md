# Exo quotidien

Bot Telegram privé qui te propose un petit problème de mathématiques chaque jour, puis le publie dans un salon Discord après validation.

## Fonctionnement

- À 18 h, Gemini 3.5 Flash-Lite crée un problème original de 5 à 10 minutes.
- Une seconde requête Gemini vérifie l'énoncé et la solution. Une proposition refusée est régénérée, dans la limite de trois essais.
- Telegram t'envoie la proposition avec deux boutons : **Publier sur Discord** ou **Un autre exercice**.
- Discord publie l'énoncé avec un bouton **Solution**.
- Le bouton Solution répond en message éphémère : seul le membre qui clique voit la correction.

## Technologies

Vercel Functions + Cron Jobs, Telegram Bot API, Discord Interactions + REST API, Gemini API et Supabase Postgres. Aucun processus permanent ni Gateway Discord/WebSocket n'est nécessaire.

## Déploiement

### 1. Créer Supabase

1. Crée un projet Supabase.
2. Ouvre **SQL Editor**.
3. Copie-colle et exécute le fichier supabase/schema.sql.
4. Récupère l'URL du projet et la clé serveur service_role dans **Project Settings → API**. Cette clé reste uniquement dans les variables Vercel.

### 2. Déployer sur Vercel

1. Importe ce dépôt GitHub dans Vercel.
2. Ajoute les variables ci-dessous dans **Settings → Environment Variables**.
3. Déploie le projet.

| Variable | Valeur |
| --- | --- |
| GEMINI_API_KEY | Clé API Google AI Studio |
| GEMINI_MODEL | gemini-3.5-flash-lite |
| TELEGRAM_BOT_TOKEN | Token du bot Telegram |
| TELEGRAM_ADMIN_ID | Ton identifiant Telegram numérique |
| TELEGRAM_WEBHOOK_SECRET | Secret aléatoire (lettres, chiffres, underscore ou tiret) |
| DISCORD_BOT_TOKEN | Token du bot Discord |
| DISCORD_PUBLIC_KEY | Public Key de l'application Discord |
| DISCORD_CHANNEL_ID | ID du salon Discord « exo quotidien » |
| SUPABASE_URL | URL du projet Supabase |
| SUPABASE_SERVICE_ROLE_KEY | Clé serveur Supabase |
| CRON_SECRET | Secret aléatoire long pour protéger le cron |

Tu peux générer un secret depuis un terminal avec :
~~~bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
~~~

### 3. Configurer Telegram

1. Ouvre une conversation privée avec ton bot Telegram et envoie /start.
2. Configure le webhook en remplaçant les valeurs :

~~~bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<TON-DOMAINE-VERCEL>/api/telegram/webhook","secret_token":"<TELEGRAM_WEBHOOK_SECRET>"}'
~~~

3. Envoie /id au bot. Il répond avec ton identifiant numérique.
4. Ajoute cet identifiant comme TELEGRAM_ADMIN_ID dans Vercel, puis redéploie.

La commande /id reste disponible pour permettre la première configuration. Toutes les autres commandes et validations sont réservées à cet identifiant.

### 4. Configurer Discord

1. Dans le [Discord Developer Portal](https://discord.com/developers/applications), crée une application pour ton serveur **LaTeX**.
2. Dans **Bot**, crée le bot et copie son token dans DISCORD_BOT_TOKEN.
3. Dans **General Information**, copie la **Public Key** dans DISCORD_PUBLIC_KEY.
4. Invite le bot sur ton serveur via OAuth2. Il lui faut les permissions **Send Messages** et **Embed Links**.
5. Active le mode développeur dans Discord, fais clic droit sur le salon **exo quotidien** et copie son ID dans DISCORD_CHANNEL_ID.
6. Dans **General Information → Interactions Endpoint URL**, saisis https://<TON-DOMAINE-VERCEL>/api/discord/interactions.
7. Enregistre puis vérifie que Discord accepte l'URL.

Le bot n'utilise pas de connexion Gateway persistante ni d'intents privilégiés : les clics sur les boutons arrivent par webhook HTTP.

### 5. Tester

Depuis un terminal, appelle manuellement le cron :

~~~bash
curl -H "Authorization: Bearer <CRON_SECRET>" \
  "https://<TON-DOMAINE-VERCEL>/api/cron/daily?force=1"
~~~

Tu dois recevoir une proposition sur Telegram. Essaie **Un autre exercice**, puis **Publier sur Discord**. Enfin, clique sur **Solution** : la réponse doit être privée.

## Horaire et fuseau

Vercel Cron utilise UTC. Deux déclenchements quotidiens sont configurés à 16 h et 17 h UTC ; le code n'agit que si l'heure locale de Paris est 18 h. Cela suit automatiquement le passage entre heure d'été et heure d'hiver.

Sur le plan Hobby, Vercel ne garantit pas une précision à la minute : l'exécution peut avoir lieu à différents moments de l'heure planifiée. Le bot vérifie l'heure locale avant l'envoi.

## Sécurité et limites

- Les secrets restent dans les variables d'environnement Vercel.
- Le webhook Telegram vérifie le secret de l'en-tête Telegram.
- Le webhook Discord vérifie la signature Ed25519.
- Le bouton Solution renvoie une réponse éphémère Discord (flag 64) et ne publie jamais la correction dans le salon.
- Supabase conserve l'historique et empêche deux propositions actives le même jour.
- Le vérificateur Gemini est une seconde vérification automatisée, pas une preuve formelle. Relis l'énoncé et la solution avant publication.

## Endpoints

- GET /api/health — état de présence des variables, sans révéler leurs valeurs.
- GET /api/cron/daily — cron quotidien protégé par CRON_SECRET.
- POST /api/telegram/webhook — commandes et boutons Telegram.
- POST /api/discord/interactions — ping Discord et bouton Solution.
