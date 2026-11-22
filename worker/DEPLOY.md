# Déploiement du proxy Cloudflare (une seule fois)

Le token GitHub ne doit **jamais** être mis dans le dépôt ni dans le site. Il est stocké uniquement comme **secret Cloudflare**.

## 1. Se connecter à Cloudflare

Dans un terminal, dans le dossier `worker/` du projet :

```bash
npx wrangler login
```

Une page Cloudflare s’ouvre : authorizez.

## 2. Enregistrer le token comme secret

```bash
npx wrangler secret put GITHUB_TOKEN
```

Quand le message `Enter a secret value` apparaît, collez le token GitHub puis Entrée.

Alternative sans terminal : Cloudflare Dashboard → **Workers & Pages** → `storage-optimizer-sync` → **Settings** → **Variables** → **Add variable** → Type **Secret**, nom `GITHUB_TOKEN`, valeur le token → **Deploy**.

## 3. Déployer le Worker

```bash
npx wrangler deploy
```

Wrangler affiche une URL, par exemple :

```
https://storage-optimizer-sync.<votre-sous-domaine>.workers.dev
```

## 4. Me transmettre cette URL

Copiez cette URL et envoyez-la-moi. Je la mets dans `PROXY_URL` en haut de `js/sync.js`, je commit et je push. Ensuite, **plus aucun appareil n’aura quoi que ce soit à saisir** : la synchro s’allume toute seule à l’ouverture du site.

## Révocation

Le token peut être révoqué à tout moment dans GitHub (Settings → Developer settings → Personal access tokens), ou remplacé dans Cloudflare avec la commande de l’étape 2.
