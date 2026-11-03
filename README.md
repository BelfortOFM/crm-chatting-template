# CRM Chatting

CRM web pour une agence de gestion de chatters OnlyFans. Deux espaces : Agence (admin) et Chatter (user) — planning, shifts, paie, objectifs, classement.

Stack : Next.js 16 (App Router) + Supabase (Postgres/Auth/RLS) + Tailwind CSS. Détails des règles métier dans `CLAUDE.md`.

## Démarrer en local

Prérequis : Node.js, Docker (pour le stack Supabase local), [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm install
supabase start      # démarre Postgres/Auth local (Docker)
supabase db reset   # applique les migrations + le seed de démo
cp .env.local.example .env.local
# puis colle les URL/clés affichées par `supabase start` dans .env.local
npm run dev
```

Comptes de démo (seed) : `admin@agence.test` / `lea@agence.test` / `nina@agence.test` / `sam@agence.test`, mot de passe `password123` pour tous.

## Déployer

Créer un projet Supabase (hébergé), y appliquer les migrations (`supabase db push` ou via le dashboard), puis déployer sur [Vercel](https://vercel.com/new) avec les variables d'environnement de `.env.local.example` renseignées (URL/clés du projet Supabase hébergé, pas celles du stack local).
