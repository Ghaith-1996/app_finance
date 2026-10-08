# Instructions pour les agents

Ce fichier est la référence canonique des règles stables. Lire ensuite les fichiers nécessaires à la tâche.
README.md décrit le produit, le démarrage, l’exploitation et les limites des vérifications.
Les descriptions historiques et les compteurs ne prouvent jamais l’état courant du code ou des services.

## Règles de travail

- Respecter d’abord le périmètre et les autorisations de la demande en cours.
- Examiner les changements locaux avant toute modification ; préserver le travail concurrent.
- Éviter les commandes Git destructrices ; ne pas annuler les modifications d’une autre session.
- Lire le code courant avant de modifier son contrat. Les migrations et services priment sur les anciennes descriptions.
- Préférer une transformation locale vérifiable ; la taille d’un fichier ne suffit pas à justifier son découpage.
- Ne pas supprimer une fonctionnalité, une intégration ou un mode dégradé pour réduire le compteur.
- Conserver les deux pipelines current/candidate et leurs secrets distincts.
- Conserver la voie StepFun/OpenRouter sauf demande explicite de retrait.
- Ne pas confondre endpoint Azure OpenAI Responses et endpoint d’agent Azure AI Foundry.
- Ne pas publier secrets, cookies réutilisables ou données réelles dans les logs et artefacts.

## Politique de vérification

- Ne pas écrire des tests unitaires après le code.
- Privilégier les E2E pour les fonctions complexes et produire un artefact vérifiable et reproductible.
- Avant une exception isolée, énumérer les modes de défaillance et ce que les E2E ne couvrent pas raisonnablement.
- Ne retirer un cas que pour une redondance spécifique démontrée ou une protection de remplacement vérifiée.
- Les mocks ne prouvent ni transactions/RLS, ni exécution du worker, ni fonctionnement OAuth/fournisseur réel.
- Déclarer couches réelles et simulées, commit, données initiales, assertions, commande et résultats répétés.
- Ne pas transformer une ancienne réussite locale en résultat du checkout courant.
- Les scripts smoke de providers font des appels externes ; ils ne constituent pas une suite E2E.
- Les vérifications ordinaires n’envoient pas de paiements, SMS, emails réels ni générations payantes.
- Ne créer aucune route de test privilégiée ou contournement d’authentification déployable en production.
- Les commandes et prérequis de vérification ont leur référence opérationnelle dans README.md.

## Frontières à préserver

- Garder les frontières client/serveur ; un module service-role ou env serveur ne doit pas entrer dans un bundle client.
- Distinguer client Supabase navigateur, client session serveur et client service-role.
- Garder les exports des fichiers use server asynchrones ; placer les types/helpers synchrones hors de ces entrées.
- Conserver authentification, ownership, autorisation admin, validation runtime, RLS et privilèges SQL.
- Conserver quotas durables, droits billing, protections Turnstile et leur contrôle par requête.
- Conserver protections SSRF et de redirection à chaque frontière réseau concernée.
- Préserver transactions, idempotence, reprises et états uncertain ; un refactor ne simplifie pas un échec en succès.
- Les migrations historiques ne sont ni supprimées, ni squashed, ni renumérotées pour réduire des fichiers.
- Vérifier le ledger de chaque environnement avant tout changement concernant un ancien préfixe dupliqué.
- Déployer la migration requise avant le code qui dépend de ses RPC/colonnes.
- Les décisions produit encore ouvertes ne sont pas décidées implicitement par le refactor.

## Carte de lecture minimale

| Tâche | Premiers fichiers à lire |
|---|---|
| Auth/session | middleware.ts ; lib/supabase/server.ts ; app/auth/callback/route.ts |
| Import/positions | lib/actions/portfolio.ts ; lib/services/csv-parser.ts |
| Prix/valorisation | lib/services/valuation.ts ; lib/services/holding-pricing.ts ; lib/server/page-loaders.ts |
| Feed/article | app/feed/page.tsx ; components/app/feed-view.tsx ; app/api/feed/route.ts |
| Analyse | components/app/analysis-run-trigger.tsx ; lib/services/analysis.ts |
| AI/chat | lib/services/ai/index.ts ; app/api/article-chat/route.ts ; app/api/portfolio-copilot/route.ts |
| Jobs/worker | .github/workflows/news-cron.yml ; .github/workflows/news-cron-v2.yml ; workers/news_ingestion/cron_runner.py |
| Billing | lib/billing/plans.ts ; lib/billing/subscriptions.ts ; app/api/stripe/webhook/route.ts |
| Notifications | lib/notifications/daily-digest.ts ; lib/notifications/phone-verification.ts |
| Home/communauté | app/home/page.tsx ; app/community/page.tsx ; lib/actions/community.ts |
| SQL | supabase/README.md ; migrations et tests SQL concernés |

Les points d’entrée sont une orientation, pas une liste exhaustive de dépendances à lire.
Ne recopier ni l’arborescence entière, ni chaque export, ni le schéma SQL dans ce fichier.

## Références canoniques

- README.md : produit réel, architecture synthétique, démarrage, gates, schedulers, vérifications staging et limites.
- supabase/README.md : déploiement SQL, collisions de préfixes et validation locale jetable.
- workers/news_ingestion/TROUBLESHOOTING.md : environnement Python, sources et diagnostics.
- SECURITY.md : signalement des vulnérabilités.
- docs/audit/AUDIT_REMEDIATION_REPORT.md : décisions humaines durables, réserves et preuves datées par commit.
- TEST_AUDIT.md : décisions par cas de la campagne historique de suppression des tests.
- lib/legal/constants.ts et les pages légales : valeurs opérateur et obligations publiques ; ne pas les réinventer.

## Compte rendu

Présenter changement, raison, preuve, limites et éventuelles conditions non vérifiées.
Séparer refactor et correction d’un défaut : un correctif peut ajouter des lignes.
Compter retraits, remplacements, déplacements et infrastructure de vérification sans chevauchement.
Ne promettre ni minimum absolu ni préservation garantie par une simple compilation.
