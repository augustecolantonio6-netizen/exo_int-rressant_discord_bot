# Exo quotidien — bot Telegram / Discord

Un exercice de mathématiques court, original et un peu « méta » est proposé chaque jour. Tu le reçois d'abord en privé sur Telegram : tu peux le publier dans Discord ou demander une nouvelle proposition. Le salon Discord ne reçoit jamais la solution automatiquement.

## 1. Fonctionnement

1. Vercel déclenche la fonction quotidienne.
2. Gemini 3.5 Flash-Lite génère un exercice de 5 à 10 minutes, pour un niveau Terminale → début MPSI.
3. Gemini effectue une seconde vérification de l'énoncé et de la solution. Le code rejette les réponses incomplètes et retente au maximum trois fois.
4. Telegram t'envoie le sujet avec deux boutons : **Publier sur Discord** et **Un autre exercice**.
5. Après validation, le bot publie l'énoncé dans le salon **#exo quotidien** du serveur **LaTeX**.
6. Le message Discord contient un bouton **Solution**. Quand un membre clique, Discord ouvre une réponse éphémère : seul ce membre voit la correction.

Le vérificateur IA est une seconde lecture automatisée, pas une preuve mathématique formelle. La validation Telegram reste donc volontairement obligatoire.

## 2. Architecture

- **Vercel Functions** : héberge les webhooks Telegram et Discord ainsi que la tâche planifiée.
- **Vercel Cron** : déclenche la tâche deux fois dans la journée UTC pour couvrir le changement d'heure français et permettre une reprise si le premier déclenchement échoue.
- **Gemini API** : génère puis vérifie les exercices.
- **Supabase Postgres** : conserve les sujets, solutions, dates et états de publication.
- **Telegram Bot API** : envoie la proposition et reçoit tes validations.
- **Discord API** : publie l'énoncé et gère le bouton Solution en réponse éphémère.

Le bot Discord n'utilise pas de connexion Gateway/WebSocket permanente : les interactions du bouton arrivent sur une URL HTTPS configurée dans le Developer Portal.

## 3. Pré-requis

Crée ou prépare les comptes suivants :

- Un dépôt GitHub (celui-ci).
- Un compte Vercel.
- Un projet Supabase.
- Une clé Gemini API dans [Google AI Studio](https://aistudio.google.com/apikey).
- Un bot Telegram créé avec [@BotFather](https://t.me/BotFather).
- Une application Discord dans le [Discord Developer Portal](https://discord.com/developers/applications).

Pour les tests locaux, installe Node.js 20 ou plus récent. Le dépôt n'a pas de dépendance npm nécessaire à l'exécution : les appels HTTP utilisent l'API native de Node.js.

## 4. Vérifier le code avant le déploiement

Depuis un terminal à la racine du dépôt :

~~~powershell
node --version
npm run check
npm test
~~~

- **npm run check** vérifie la syntaxe de tous les fichiers JavaScript.
- **npm test** exécute les tests unitaires et les tests de routes avec des réponses simulées.
- GitHub Actions exécute automatiquement ces deux commandes à chaque push sur main et sur chaque pull request.

Ces tests ne nécessitent aucun token et ne publient rien sur Telegram ou Discord. Ils ne remplacent pas le test réel des services une fois les clés configurées.

## 5. Créer et configurer Supabase

### 5.1 Créer le projet

1. Ouvre [Supabase Dashboard](https://supabase.com/dashboard).
2. Crée un nouveau projet.
3. Choisis un nom, un mot de passe de base de données et une région proche de la France.
4. Attends que le projet soit créé.

### 5.2 Créer la table

1. Ouvre **SQL Editor** dans le projet.
2. Ouvre le fichier [supabase/schema.sql](supabase/schema.sql) dans GitHub.
3. Copie tout son contenu.
4. Colle-le dans une nouvelle requête SQL Editor.
5. Clique sur **Run**.
6. Ouvre **Table Editor** et vérifie que la table public.exercises apparaît.

Le script active RLS et donne les droits nécessaires au rôle serveur service_role. Aucune règle d'accès publique n'est créée : le bot accède à la base uniquement depuis Vercel.

### 5.3 Récupérer l'URL et la clé secrète

1. Dans Supabase, ouvre **Settings → API Keys**.
2. Copie la **Project URL** (ou l'URL Data API du projet).
3. Dans l'onglet des clés modernes, crée ou copie une **Secret key** commençant par sb_secret_.
4. Cette valeur ira dans **SUPABASE_SECRET_KEY** sur Vercel.

La clé secrète possède des droits élevés et contourne RLS. Elle ne doit jamais être mise dans le code source, dans un fichier public ou dans un navigateur. Le code l'envoie dans l'en-tête apikey, et non comme un JWT Bearer.

Compatibilité : si ton projet ne dispose encore que de l'ancienne clé JWT service_role, tu peux la mettre dans **SUPABASE_SERVICE_ROLE_KEY**. Le code accepte les deux formats, mais privilégie la nouvelle clé sb_secret_.

Documentation : [API keys Supabase](https://supabase.com/docs/guides/getting-started/api-keys).

## 6. Créer le bot Telegram

1. Ouvre [@BotFather](https://t.me/BotFather) dans Telegram.
2. Envoie /newbot.
3. Choisis le nom du bot, puis son username (qui doit se terminer par bot).
4. Copie le token fourni par BotFather. Il sera utilisé comme **TELEGRAM_BOT_TOKEN**.
5. Ouvre une conversation privée avec ton nouveau bot et envoie /start. Tu pourras récupérer ton identifiant numérique plus tard avec /id.

Ne partage pas le token et ne le mets jamais dans GitHub.

## 7. Créer l'application Discord

### 7.1 Créer l'application et le bot

1. Ouvre [Discord Developer Portal](https://discord.com/developers/applications).
2. Clique sur **New Application** et nomme-la, par exemple, Exo quotidien.
3. Dans **Bot**, crée le bot si nécessaire.
4. Copie son **Bot Token** : ce sera **DISCORD_BOT_TOKEN**.
5. Dans **General Information**, copie la **Public Key** : ce sera **DISCORD_PUBLIC_KEY**.

Ne confonds pas le Bot Token et la Public Key : ce sont deux valeurs différentes.

### 7.2 Installer le bot sur le serveur LaTeX

1. Dans **Installation** ou **OAuth2 → URL Generator**, active l'installation de type **Guild Install**.
2. Sélectionne le scope bot.
3. Accorde au bot les permissions **View Channels**, **Send Messages** et **Embed Links**.
4. Ouvre le lien d'installation généré et ajoute l'application au serveur **LaTeX**.
5. Vérifie que le rôle du bot a bien accès au salon **#exo quotidien**. Si le salon est privé, donne-lui explicitement accès.

Aucun intent privilégié et aucun scope de commande slash ne sont requis pour les fonctions actuelles.

### 7.3 Récupérer l'identifiant du salon

1. Dans Discord, ouvre **Paramètres → Avancés** et active le **Mode développeur**.
2. Fais un clic droit sur le salon **#exo quotidien**.
3. Clique sur **Copier l'identifiant du salon**.
4. Garde cette valeur pour **DISCORD_CHANNEL_ID**.

### 7.4 Définir l'URL des interactions

L'URL exacte sera connue après le déploiement Vercel. Tu la renseigneras à l'étape 12.

## 8. Préparer la clé Gemini

1. Ouvre [Google AI Studio — API keys](https://aistudio.google.com/apikey).
2. Crée une clé API.
3. Copie-la : ce sera **GEMINI_API_KEY**.
4. Le modèle utilisé par défaut est **gemini-3.5-flash-lite**. Garde exactement cette valeur dans **GEMINI_MODEL**.

Référence : [documentation officielle du modèle Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite).

## 9. Déployer le dépôt sur Vercel

### 9.1 Importer GitHub

1. Ouvre [Vercel — New Project](https://vercel.com/new).
2. Connecte GitHub si nécessaire.
3. Sélectionne le dépôt augustecolantonio6-netizen/exo_int-rressant_discord_bot.
4. Dans la configuration du projet, choisis **Framework Preset: Other**.
5. Laisse le **Root Directory** sur ./.
6. Ne définis pas de dossier de sortie statique : ce projet utilise des fonctions dans api/.
7. Lance le premier déploiement après avoir ajouté les variables ci-dessous.

### 9.2 Ajouter les variables d'environnement

Dans **Project → Settings → Environment Variables**, ajoute les variables suivantes pour **Production** :

| Nom | Valeur |
| --- | --- |
| GEMINI_API_KEY | Clé créée dans Google AI Studio |
| GEMINI_MODEL | gemini-3.5-flash-lite |
| TELEGRAM_BOT_TOKEN | Token obtenu avec BotFather |
| TELEGRAM_WEBHOOK_SECRET | Secret aléatoire en lettres/chiffres |
| DISCORD_BOT_TOKEN | Token du bot Discord |
| DISCORD_PUBLIC_KEY | Public Key de l'application Discord |
| DISCORD_CHANNEL_ID | ID du salon #exo quotidien |
| SUPABASE_URL | Project URL Supabase |
| SUPABASE_SECRET_KEY | Clé moderne sb_secret_ de Supabase |
| CRON_SECRET | Deuxième secret aléatoire |

Pour la première mise en ligne, **ne renseigne pas encore TELEGRAM_ADMIN_ID**. Tu le récupéreras à l'étape 11.

Tu peux générer un secret aléatoire de 32 octets depuis PowerShell si Node.js est installé :

~~~powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
~~~

Exécute la commande deux fois et utilise deux valeurs différentes : une pour **TELEGRAM_WEBHOOK_SECRET**, l'autre pour **CRON_SECRET**.

Le secret Telegram doit contenir uniquement des lettres, des chiffres, _ ou -. Une valeur hexadécimale issue de la commande ci-dessus convient.

Si tu utilises une ancienne clé Supabase, renseigne **SUPABASE_SERVICE_ROLE_KEY** à la place de **SUPABASE_SECRET_KEY**. Ne mets pas une clé publishable/anon dans ces variables.

### 9.3 Premier déploiement

1. Vérifie les noms des variables et leurs valeurs.
2. Clique sur **Deploy**.
3. Attends que le déploiement passe à l'état **Ready**.
4. Copie le domaine de production, par exemple https://ton-projet.vercel.app.

Chaque modification ultérieure des variables d'environnement nécessite un nouveau déploiement pour être prise en compte.

## 10. Vérifier la configuration Vercel

Ouvre cette adresse dans le navigateur :

~~~text
https://TON-DOMAINE.vercel.app/api/health
~~~

Tu dois voir un JSON avec status égal à ok et les champs de configuration à true, sauf telegramAdmin qui reste temporairement à false tant que l'identifiant Telegram n'est pas ajouté.

Ce endpoint ne révèle aucune valeur secrète. Il indique seulement si les variables sont présentes.

## 11. Connecter Telegram au webhook Vercel

### 11.1 Enregistrer le webhook

Ouvre PowerShell sur ton ordinateur et remplace les trois valeurs d'exemple :

~~~powershell
$botToken = "TON_TOKEN_BOTFATHER"
$webhookSecret = "TON_TELEGRAM_WEBHOOK_SECRET"
$domain = "https://TON-DOMAINE.vercel.app"

$body = @{
  url = "$domain/api/telegram/webhook"
  secret_token = $webhookSecret
  allowed_updates = @("message", "callback_query")
} | ConvertTo-Json -Compress

Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$botToken/setWebhook" -ContentType "application/json" -Body $body
~~~

La réponse doit contenir ok égal à true.

### 11.2 Vérifier le webhook

Dans la même fenêtre PowerShell :

~~~powershell
Invoke-RestMethod -Method Get -Uri "https://api.telegram.org/bot$botToken/getWebhookInfo"
~~~

Vérifie que le champ url correspond à https://TON-DOMAINE.vercel.app/api/telegram/webhook. S'il y a une erreur, regarde last_error_message.

### 11.3 Récupérer ton identifiant Telegram

1. Dans ta conversation privée avec le bot, envoie /start.
2. Envoie ensuite /id.
3. Le bot te répond avec ton identifiant numérique.
4. Dans Vercel, ajoute la variable **TELEGRAM_ADMIN_ID** avec ce nombre.
5. Redéploie le projet.
6. Retourne sur /api/health et vérifie que telegramAdmin vaut maintenant true.

Seul cet identifiant pourra utiliser les boutons de validation. La commande /id reste disponible pour afficher à chacun son propre identifiant, mais ne donne aucun droit de publication.

## 12. Connecter les interactions Discord

1. Retourne dans [Discord Developer Portal](https://discord.com/developers/applications).
2. Sélectionne l'application du bot.
3. Ouvre **General Information**.
4. Dans **Interactions Endpoint URL**, saisis :

~~~text
https://TON-DOMAINE.vercel.app/api/discord/interactions
~~~

5. Enregistre.

Discord envoie une requête de vérification (« ping »). Le serveur vérifie sa signature Ed25519 et répond au ping. L'enregistrement doit être accepté.

Si Discord refuse l'URL, vérifie que :
- le domaine Vercel est bien le domaine du déploiement Production ;
- DISCORD_PUBLIC_KEY correspond à la Public Key de cette même application ;
- /api/discord/interactions renvoie bien le ping signé de Discord.

## 13. Faire un test complet

Le test manuel utilise une requête protégée par **CRON_SECRET**. Il génère un exercice réel avec Gemini, l'enregistre dans Supabase et l'envoie uniquement à ton Telegram. Il ne publie rien sur Discord tant que tu n'appuies pas sur le bouton de validation.

Dans PowerShell :

~~~powershell
$domain = "https://TON-DOMAINE.vercel.app"
$cronSecret = "TON_CRON_SECRET"
$headers = @{ Authorization = "Bearer $cronSecret" }

Invoke-RestMethod -Method Get -Uri "$domain/api/cron/daily?force=1" -Headers $headers
~~~

Résultat attendu : ok égal à true et un message privé Telegram contenant un exercice.

Teste ensuite dans cet ordre :

1. **Un autre exercice** : le sujet Telegram doit être remplacé par un nouveau.
2. **Publier sur Discord** : le message doit apparaître dans **#exo quotidien** du serveur **LaTeX**.
3. Clique sur **Solution** : la correction doit apparaître uniquement pour le membre qui a cliqué, jamais dans le salon.
4. Demande à un autre membre de tester le bouton : il verra sa propre réponse éphémère, sans que la correction soit publiée dans le canal.

Si le cron renvoie skipped parce qu'un exercice existe déjà pour la date du jour, c'est normal : il empêche de créer plusieurs propositions quotidiennes. La valeur force=1 contourne uniquement la vérification de l'heure, pas cette protection anti-doublon.

## 14. Horaire automatique et changement d'heure

Les expressions Cron sont dans [vercel.json](vercel.json) :

- 0 16 * * * (16 h UTC).
- 0 17 * * * (17 h UTC).

Le code utilise le fuseau Europe/Paris et une fenêtre de secours :

- En été, 16 h UTC correspond à 18 h à Paris ; 17 h UTC correspond à 19 h.
- En hiver, 17 h UTC correspond à 18 h à Paris ; 16 h UTC correspond à 17 h et est ignoré.

Les deux Cron permettent de suivre le changement d'heure sans modifier le projet. Le second peut servir de reprise si le premier n'a pas réussi à créer ou envoyer la proposition. Un exercice actif existant empêche le second de générer ou publier un doublon.

**Limite du plan Vercel Hobby :** les tâches Cron sont déclenchées à un moment quelconque de l'heure planifiée (précision horaire, pas à la minute). Tu recevras donc normalement la proposition pendant l'heure de 18 h à Paris, mais l'envoi ne peut pas être garanti à 18:00 pile. Le déclenchement de secours peut fonctionner pendant l'heure de 19 h si le premier n'a pas laissé de proposition enregistrée. Les Cron Vercel s'exécutent sur le déploiement Production, pas sur les Preview Deployments.

Références : [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs), [limites Vercel](https://vercel.com/docs/limits).

## 15. Tests automatisés inclus

Le fichier tests/core.test.js couvre notamment :

- le calcul de la date et des heures de Paris en été et en hiver ;
- la validation des champs et tailles de réponse Gemini ;
- la génération Gemini suivie de sa vérification indépendante, avec une simulation de refus puis régénération ;
- les deux boutons Telegram et leurs identifiants ;
- l'authenticité des signatures Discord Ed25519, les requêtes modifiées et les signatures trop anciennes ;
- le caractère éphémère de la réponse Solution ;
- le ping Discord utilisé lors de l'enregistrement de l'endpoint ;
- le refus d'un utilisateur Telegram non autorisé ;
- le refus d'un webhook Telegram dont le secret est incorrect ;
- la commande /id avant l'initialisation de l'administrateur ;
- le flux complet de génération quotidienne et de publication, avec des réponses API simulées ;
- la protection du cron et les en-têtes Supabase.

Les tests utilisent des clés fictives et des réponses simulées : ils ne contactent pas Gemini, Telegram, Discord ou ton projet Supabase.

## 16. Dépannage

### Le déploiement Vercel échoue

- Vérifie que le dépôt est connecté à Vercel et que le Framework Preset est **Other**.
- Vérifie que vercel.json est à la racine du dépôt.
- Ouvre les logs du build et repère la première erreur.

### /api/health renvoie une configuration à false

La variable correspondante est absente ou vide. Vérifie son orthographe dans Vercel, puis redéploie.

### Telegram ne répond pas

- Vérifie getWebhookInfo et son champ last_error_message.
- Vérifie que le domaine est celui de Production.
- Vérifie que TELEGRAM_WEBHOOK_SECRET sur Vercel est exactement celui utilisé lors de setWebhook.
- Vérifie que tu as bien envoyé /start au bot en conversation privée.

### Le bouton Telegram ne publie rien

- Vérifie que TELEGRAM_ADMIN_ID contient ton identifiant Telegram et que le projet a été redéployé après son ajout.
- Vérifie DISCORD_BOT_TOKEN et DISCORD_CHANNEL_ID.
- Vérifie que le bot a accès au salon et possède **Send Messages** et **Embed Links**.
- Consulte **Vercel → Logs** pour l'erreur de l'invocation.

### Discord refuse l'Interactions Endpoint URL

- Vérifie l'URL complète, sans faute de frappe.
- Vérifie la Public Key.
- Vérifie que le déploiement Production est actif et que le endpoint accepte les requêtes POST.

### Supabase renvoie 401 ou 403

- Vérifie l'URL Supabase et utilise une **Secret key** sb_secret_, pas une Publishable key.
- Si tu utilises une ancienne clé, vérifie qu'il s'agit bien de service_role, pas de anon.
- Vérifie que le SQL du fichier supabase/schema.sql a été exécuté.

### Gemini ne produit pas d'exercice

- Vérifie GEMINI_API_KEY.
- Vérifie que GEMINI_MODEL vaut exactement gemini-3.5-flash-lite.
- Consulte les logs Vercel pour la réponse de l'API Gemini. Une proposition refusée par le vérificateur est régénérée, jusqu'à trois tentatives.

## 17. Sécurité

- Ne commit jamais .env, les tokens Telegram/Discord, la clé Gemini ou la clé secrète Supabase.
- Ne partage jamais les variables Vercel.
- La clé Supabase secrète donne un accès privilégié à la base et doit rester côté serveur.
- Le webhook Telegram exige le secret configuré dans Bot API.
- Le webhook Discord vérifie la signature Ed25519 et refuse les requêtes non authentiques ou trop anciennes.
- La solution est différée avec le flag Discord éphémère (64) ; elle n'est pas incluse dans le message public.

## 18. Endpoints du projet

| Méthode | URL | Rôle |
| --- | --- | --- |
| GET | /api/health | Vérifier la présence des variables |
| GET | /api/cron/daily | Générer et envoyer la proposition quotidienne ; protégé par CRON_SECRET |
| POST | /api/telegram/webhook | Commandes Telegram et boutons de validation |
| POST | /api/discord/interactions | Ping Discord et bouton Solution |
