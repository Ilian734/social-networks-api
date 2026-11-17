# Social Networks API

API REST de la refonte des services Facebook : **utilisateurs, événements, groupes, fils de discussion, albums photo, sondages, billetterie, shopping list et covoiturage (bonus)**.

Stack : Node.js / Express 5 / MongoDB (Mongoose).

## URL de base

`{{baseUrl}}` = `http://localhost:3000/api` (variable de collection, à adapter si l'API est déployée).

## Authentification

Authentification simplifiée : l'utilisateur qui effectue une action est identifié par le header **`X-User-Id`** (id d'un utilisateur existant). Il est requis pour toutes les créations / modifications / suppressions (sauf la création de compte et l'achat de billet, ouverts à tous). En lecture il est optionnel et permet d'accéder aux contenus privés dont on est membre.

## Format des réponses

- **Ressource** : l'objet JSON (`_id`, champs, `createdAt`, `updatedAt`).
- **Liste** : `{ "data": [...], "pagination": { "page", "limit", "total", "pages" } }` — query `page` (défaut 1) et `limit` (défaut 20, max 100).
- **Suppression** : `204 No Content`.
- **Erreur** : `{ "error": { "status", "message", "details?" } }`

| Code | Signification |
|------|---------------|
| 200 / 201 / 204 | Succès |
| 400 | Données invalides (détail des champs dans `details`) |
| 401 | Header `X-User-Id` manquant ou invalide |
| 403 | Action non autorisée pour cet utilisateur |
| 404 | Ressource introuvable |
| 409 | Conflit (doublon, quota atteint, règle métier) |

## Exécuter la collection

Les requêtes sont ordonnées : lancer la collection entière dans le **Collection Runner** crée les données (3 utilisateurs, un groupe, des événements…), enregistre automatiquement les ids dans les variables de collection, vérifie chaque code de retour puis nettoie tout à la fin. Chaque requête contient un exemple de réponse réelle.
