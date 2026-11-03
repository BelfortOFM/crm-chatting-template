# CRM Agence / Chatters

CRM web pour une agence de gestion de chatters OnlyFans. Deux espaces : Agence (admin) et Chatter (user).

## Stack

- Next.js 16 (App Router), TypeScript strict
- Supabase (Postgres + Auth + RLS)
- Tailwind CSS
- Déploiement cible : Vercel

**Next.js 16 breaking change** : `middleware.ts` est déprécié, renommé `proxy.ts` (export `proxy(request)` au lieu de `middleware(request)`). Le fichier racine de ce projet est `proxy.ts`. Ne pas recréer de `middleware.ts` à la racine.

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
