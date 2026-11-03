# CRM Agence / Chatters

CRM web pour une agence de gestion de chatters OnlyFans. Deux espaces : Agence (admin) et Chatter (user).

## Stack

- Next.js 16 (App Router), TypeScript strict
- Supabase (Postgres + Auth + RLS)
- Tailwind CSS
- Déploiement cible : Vercel

**Next.js 16 breaking change** : `middleware.ts` est déprécié, renommé `proxy.ts` (export `proxy(request)` au lieu de `middleware(request)`). Le fichier racine de ce projet est `proxy.ts`. Ne pas recréer de `middleware.ts` à la racine.

## Coordination multi-agents (lire avant tout travail non trivial)

Plusieurs sessions Claude Code / agents tournent en parallèle sur ce repo (souvent une dizaine ou plus), sur le même dossier de travail, sans branche dédiée. Deux incidents déjà survenus : un build cassé par une session qui a laissé un bug de typage dans un fichier non commité, et un déploiement qui a poussé en prod le travail à moitié fini d'une autre session en même temps que le sien.

- **Avant de commencer un travail non trivial** : `git status`. Si des fichiers non commités existent et ne sont pas les tiens, ne pas les modifier sans raison, et ne pas partir du principe qu'ils sont finis ou fonctionnels.
- **Committer dès qu'une fonctionnalité tient debout** (types OK, testée) plutôt que de la laisser trainer non commitée pendant des heures — ça transforme une collision silencieuse (deux sessions modifient la même zone sans le savoir) en conflit git visible et résolvable.
- **Avant un `next build` suivi d'un déploiement** (`active/deploy.sh`, ou build + `launchctl kickstart` manuel sur `com.belfort.crmchatter`) : `git status` d'abord. S'il y a des changements non commités qui ne sont pas les tiens, le build embarque aussi leur travail en cours — dans ce cas, prévenir les autres sessions actives avant de déployer (`ListAgents` pour lister les pairs, puis `SendMessage` vers celles dont le nom laisse penser qu'elles bossent sur ce repo, ex. `crmchatter-*`, `infloww-*`, `inflowreverse-*`) plutôt que déployer à l'aveugle.
- **Le déploiement redémarre le seul service de production** (port 3200, exposé via le tunnel Cloudflare sur `crmchatter.strivefarm.com`) : c'est une ressource partagée par toutes les sessions, jamais un bac à sable individuel. Un restart coupe les requêtes en cours pour tout le monde.
- Si tu corriges un bug qui bloque tout le monde (ex. une erreur de type dans un fichier non commité d'une autre session) : le fixer mécaniquement si c'est évident et sans ambiguïté, mais ne pas retravailler la logique/le design du code d'une autre session — signaler plutôt à l'utilisateur ou à la session concernée (`SendMessage`) ce qui a été touché et pourquoi.

## Règles métier

### Périodes de paie
4 périodes fixes par mois : P1 (1-7), P2 (8-15), P3 (16-22), P4 (23-fin de mois). Calculées dynamiquement via `lib/period.ts` (`getPeriodForDate`, `getPeriodsForMonth`), **jamais stockées en base**.

### Plateformes et devises
OnlyFans uniquement (→ USD) parmi les plateformes intégrées ; une agence peut ajouter ses propres plateformes personnalisées (table `custom_platforms`), chacune avec sa devise fixée à la création. Devise fixe par plateforme, non modifiable.

### Taux de change
Fixé manuellement par l'agence (pas d'API externe). Historisé (`exchange_rates`, `valid_from`). Chaque vente fige le taux en vigueur au moment de la déclaration (`exchange_rate_used`) — **ne jamais recalculer rétroactivement**. Tout affichage agrégé est en EUR, en reconvertissant chaque ligne à son taux figé individuel puis en sommant.

### Modèles et types de chatting
Modèles gérés uniquement côté agence : nom, plateforme (détermine devise), statut actif/inactif. Types de chatting (tags) créés/renommés/désactivés librement par l'agence (table dédiée + jointure many-to-many, pas de valeurs figées en dur).

### Assignation chatter ↔ modèle
Un chatter peut avoir plusieurs modèles assignés. Assignation historisée (`assigned_from`/`assigned_to` nullable), jamais un simple flag booléen.

### Commission
Taux % par chatter, paramétrable par l'agence, historisé (`valid_from`/`valid_to`). Salaire chatting (période) = taux % × CA généré (converti en EUR) sur la période.

### Bonus et sanctions
Ajoutés par l'agence, par chatter et période : montant fixe + motif libre. Plusieurs par période (liste). `Total Payé = Salaire chatting + Σ Bonus - Σ Sanctions`.

### Objectif du mois
Montant cible en EUR, fixé par l'agence, par chatter, par mois. Affichage : actuel/objectif, barre de progression, % atteint, reste à faire.

### Prévision de fin de mois
Moyenne du CA journalier déclaré depuis le début du mois × nombre de jours du mois. Basé uniquement sur les données déclarées par le chatter.

### Classement (leaderboard)
Deux vues : période en cours et mois cumulé. Tri décroissant par CA généré (EUR), pas par commission. Visible admin (gestion complète) et chatter (lecture seule, transparent entre tous les chatters de l'agence).

### Déclaration de shift
Par le chatter : date, heure début/fin, modèle (parmi ceux assignés), liste de montants de ventes individuelles (total auto-calculé). Plusieurs shifts/jour possibles. Taux de change figé à la saisie.

### Profil chatter
Total lifetime, total période en cours, meilleur modèle, meilleur type de chatting — ce dernier **toujours dérivé/calculé** (shifts → modèle → tags → agrégation CA), jamais saisi manuellement.

## Points de vigilance

- Jamais de recalcul rétroactif de conversion devise : toujours `exchange_rate_used` figé.
- Périodes toujours calculées dynamiquement.
- RLS stricte dès la première migration.
- Mobile-first (usage chatter très majoritairement mobile).
- Fonctions métier isolées (`lib/period.ts`, `lib/currency.ts`) plutôt que logique éparpillée dans les composants.
- Calculs agrégés (totaux, classements) en PL/pgSQL dans les migrations, pas côté application.

## Structure

Voir `app/(chatter)/`, `app/(agency)/admin/`, `lib/`, `components/`, `supabase/migrations/`.
