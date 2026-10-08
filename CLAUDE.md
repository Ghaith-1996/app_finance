# Instructions Claude

AGENTS.md est le document canonique des règles. Le lire explicitement avant de modifier le dépôt.
Ce renvoi n’est pas une hypothèse sur le comportement automatique de l’outil.
README.md fournit produit, démarrage, exploitation et limites ; ne pas maintenir une seconde copie ici.

## Règles critiques visibles dès cette entrée

- Respecter le périmètre et les autorisations de la demande ; préserver les changements locaux/concurrents.
- Éviter les commandes Git destructrices.
- Préserver auth, ownership, RLS, privilèges, quotas, billing, Turnstile, protections SSRF et idempotence.
- Ne pas importer service-role/env serveur côté client ; garder les exports use server asynchrones.
- Ne pas supprimer/renuméroter de migrations historiques pour réduire des fichiers ; vérifier les ledgers concernés.
- Conserver les pipelines current/candidate distincts et la voie StepFun/OpenRouter.
- Azure OpenAI Responses et Azure AI Foundry agent sont des endpoints différents.
- Privilégier les E2E avec artefact reproductible ; avant un test isolé, énumérer les modes de défaillance.
- Ne pas écrire de tests unitaires après le code ni supprimer une protection unique sans preuve.
- Ne pas exposer secrets/cookies/données réelles ; distinguer validation locale et vérification externe.
- Ne pas introduire de route de test privilégiée déployable ni modifier implicitement une décision produit ouverte.

Lire les règles complètes dans AGENTS.md et les fichiers ciblés avant toute action.
Si AGENTS.md est inaccessible, signaler cette limite ; ne pas déduire de ce renvoi une dispense de ses règles.
