/**
 * Génère la collection Postman (docs/social-networks-api.postman_collection.json).
 *
 * Le script exécute réellement chaque requête contre l'API (qui doit tourner sur BASE_URL)
 * afin d'enregistrer de vrais exemples de réponses dans la documentation, puis écrit
 * la collection. Il sert donc aussi de test de bout en bout.
 *
 *   npm start                 (dans un autre terminal)
 *   npm run postman:build
 */
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000/api';
const OUT = path.join(__dirname, 'social-networks-api.postman_collection.json');

/* ------------------------------------------------------------------ */
/* Définition des requêtes                                             */
/* ------------------------------------------------------------------ */

const ALICE = 'userAlice';
const BOB = 'userBob';
const CHLOE = 'userChloe';

const folders = [];
let current;
const folder = (name, description) => { current = { name, description, items: [] }; folders.push(current); };
/**
 * @param {object} o
 *  name, method, path, as (variable contenant l'id de l'utilisateur => header X-User-Id),
 *  body, query, desc, expect (status attendu), save ({ variable: 'expression JS sur json' })
 */
const req = (o) => current.items.push({ expect: 200, ...o });

const event = (extra = {}) => ({
  name: 'Soirée de lancement Social Networks',
  description: 'Présentation de la nouvelle application, DJ set et buffet.',
  startDate: '2027-06-20T18:00:00.000Z',
  endDate: '2027-06-21T02:00:00.000Z',
  location: '10 rue de la Paix, 75002 Paris',
  coverPhoto: 'https://picsum.photos/seed/launch/1200/400',
  visibility: 'public',
  ...extra
});

/* ===== 1. Utilisateurs ===== */
folder('1. Utilisateurs', `CRUD des utilisateurs.

**Attributs d'un utilisateur** : \`firstname\`*, \`lastname\`*, \`email\`* (unique), \`password\`* (≥ 8 caractères, stocké hashé, jamais renvoyé), \`birthdate\`, \`phone\`, \`avatar\` (URL), \`bio\`, \`address\` { street, city, zipcode, country }, \`createdAt\`, \`updatedAt\`.

Règle : **il ne peut pas y avoir deux utilisateurs avec le même email** (409 Conflict, insensible à la casse).`);

const userBody = (first, last, extra = {}) => ({
  firstname: first,
  lastname: last,
  email: `${first.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${last.toLowerCase()}.{{$timestamp}}@example.com`,
  password: 'MotDePasse123',
  ...extra
});

req({ name: 'Créer un utilisateur (Alice)', method: 'POST', path: '/users', expect: 201,
  body: userBody('Alice', 'Martin', { birthdate: '1998-04-12', phone: '0612345678', avatar: 'https://i.pravatar.cc/150?u=alice', bio: 'Organisatrice d\'événements', address: { street: '5 avenue Foch', city: 'Paris', zipcode: '75016', country: 'France' } }),
  desc: 'Crée un compte utilisateur. Le mot de passe est hashé (scrypt) et n\'est jamais renvoyé.\n\n**Retour** : 201 + l\'utilisateur créé.\n**Erreurs** : 400 (champ manquant / email invalide / mot de passe trop court), 409 (email déjà utilisé).',
  save: { userAlice: 'json._id', aliceEmail: 'json.email' } });
req({ name: 'Créer un utilisateur (Bob)', method: 'POST', path: '/users', expect: 201,
  body: userBody('Bob', 'Durand'), desc: 'Deuxième utilisateur utilisé dans les exemples (participant / membre).', save: { userBob: 'json._id' } });
req({ name: 'Créer un utilisateur (Chloé)', method: 'POST', path: '/users', expect: 201,
  body: userBody('Chloé', 'Petit'), desc: 'Troisième utilisateur utilisé dans les exemples.', save: { userChloe: 'json._id' } });
req({ name: 'Erreur - email déjà utilisé', method: 'POST', path: '/users', expect: 409,
  body: { firstname: 'Alice', lastname: 'Clone', email: '{{aliceEmail}}', password: 'MotDePasse123' },
  desc: 'Deux utilisateurs ne peuvent pas avoir le même email → **409 Conflict**.' });
req({ name: 'Lister les utilisateurs', method: 'GET', path: '/users', query: { search: 'martin', page: 1, limit: 20 },
  desc: 'Liste paginée des utilisateurs.\n\n**Query** : `search` (prénom, nom ou email), `page`, `limit` (max 100).\n\n**Retour** : `{ data: [User], pagination: { page, limit, total, pages } }`' });
req({ name: 'Récupérer un utilisateur', method: 'GET', path: '/users/{{userAlice}}', desc: 'Détail d\'un utilisateur.\n\n**Erreurs** : 400 (id invalide), 404.' });
req({ name: 'Modifier un utilisateur', method: 'PATCH', path: '/users/{{userAlice}}', as: ALICE,
  body: { bio: 'Organisatrice d\'événements et administratrice de groupes', phone: '0699999999' },
  desc: 'Mise à jour partielle de son propre compte (header `X-User-Id` = l\'utilisateur modifié). Si l\'email change, son unicité est vérifiée ; si le mot de passe change, il est re-hashé.\n\n**Erreurs** : 403 (compte d\'un autre), 409 (email déjà pris).' });
req({ name: 'Erreur - modifier le compte d\'un autre', method: 'PATCH', path: '/users/{{userBob}}', as: ALICE, expect: 403,
  body: { bio: 'hack' }, desc: 'Un utilisateur ne peut modifier que son propre compte → **403**.' });

/* ===== 2. Groupes ===== */
folder('2. Groupes', `CRUD des groupes + gestion des membres, administrateurs et événements du groupe.

**Paramètres d'un groupe** : \`name\`*, \`description\`, \`icon\` (URL), \`coverPhoto\` (URL), \`type\` (\`public\` | \`private\` | \`secret\`), \`allowMembersToPost\` (bool), \`allowMembersToCreateEvents\` (bool), \`admins\` (≥ 1), \`members\`.

Règles :
- le créateur devient automatiquement administrateur ; un groupe garde toujours au moins 1 administrateur ;
- un groupe **public** se rejoint librement ; **privé / secret** : seuls les admins ajoutent des membres ;
- un groupe **secret** n'apparaît pas dans la liste publique ;
- un **fil de discussion** est créé automatiquement avec le groupe ;
- \`POST /groups/:id/events\` crée un événement en **invitant tous les membres en 1 clic**.`);

req({ name: 'Créer un groupe', method: 'POST', path: '/groups', as: ALICE, expect: 201,
  body: { name: 'Les fans de concerts', description: 'Groupe pour organiser nos sorties concerts', icon: 'https://picsum.photos/seed/icon/100', coverPhoto: 'https://picsum.photos/seed/group/1200/400', type: 'public', allowMembersToPost: true, allowMembersToCreateEvents: false, members: ['{{userBob}}'] },
  desc: 'Crée un groupe. L\'utilisateur courant (`X-User-Id`) devient administrateur. `admins` / `members` optionnels (tableaux d\'ids). Un fil de discussion du groupe est créé automatiquement.\n\n**Retour** : 201 + le groupe.', save: { groupId: 'json._id' } });
req({ name: 'Créer un groupe secret', method: 'POST', path: '/groups', as: ALICE, expect: 201,
  body: { name: 'Comité d\'organisation', type: 'secret', allowMembersToPost: false }, desc: 'Groupe secret : invisible dans la liste publique.', save: { secretGroupId: 'json._id' } });
req({ name: 'Lister les groupes', method: 'GET', path: '/groups', query: { search: 'concerts' },
  desc: 'Liste paginée des groupes (sans la liste des membres).\n\n**Query** : `type`, `member` (id utilisateur : ses groupes, secrets inclus), `search`, `page`, `limit`.\n\nLes groupes secrets ne sont renvoyés qu\'avec le filtre `member`.' });
req({ name: 'Lister les groupes d\'un membre', method: 'GET', path: '/groups', query: { member: '{{userAlice}}' }, desc: 'Groupes dont l\'utilisateur est membre / admin (y compris secrets).' });
req({ name: 'Récupérer un groupe', method: 'GET', path: '/groups/{{groupId}}', desc: 'Détail du groupe avec admins et membres (prénom, nom, avatar).' });
req({ name: 'Modifier un groupe', method: 'PATCH', path: '/groups/{{groupId}}', as: ALICE,
  body: { description: 'Sorties concerts sur Paris et sa région', allowMembersToCreateEvents: false }, desc: 'Réservé aux administrateurs.' });
req({ name: 'Erreur - modifier sans être admin', method: 'PATCH', path: '/groups/{{groupId}}', as: BOB, expect: 403, body: { name: 'Pirate' }, desc: '→ **403** si l\'utilisateur n\'est pas administrateur.' });
req({ name: 'Rejoindre un groupe public', method: 'POST', path: '/groups/{{groupId}}/members', as: CHLOE, expect: 201,
  desc: 'Sans body : l\'utilisateur courant rejoint le groupe (groupe public uniquement). Avec `{ "userId": "..." }` : un admin ajoute quelqu\'un.\n\n**Erreurs** : 403 (groupe privé/secret et non-admin), 409 (déjà membre).' });
req({ name: 'Erreur - rejoindre un groupe secret', method: 'POST', path: '/groups/{{secretGroupId}}/members', as: CHLOE, expect: 403, desc: 'Groupe privé / secret : seul un admin peut ajouter des membres.' });
req({ name: 'Nommer un administrateur', method: 'POST', path: '/groups/{{groupId}}/admins', as: ALICE, expect: 201, body: { userId: '{{userBob}}' }, desc: 'Un admin nomme un autre admin.' });
req({ name: 'Retirer un administrateur', method: 'DELETE', path: '/groups/{{groupId}}/admins/{{userBob}}', as: ALICE, expect: 204, desc: 'L\'utilisateur reste membre. Impossible de retirer le dernier admin (409).' });
req({ name: 'Quitter / retirer un membre', method: 'DELETE', path: '/groups/{{groupId}}/members/{{userChloe}}', as: CHLOE, expect: 204, desc: 'Un membre peut quitter le groupe, un admin peut retirer n\'importe quel membre.' });
req({ name: 'Fils de discussion du groupe', method: 'GET', path: '/groups/{{groupId}}/threads', desc: 'Liste des fils de discussion du groupe (le fil par défaut est créé avec le groupe).', save: { groupThreadId: 'json.data[0]._id' } });
req({ name: 'Créer un événement dans le groupe (invitation de tous les membres)', method: 'POST', path: '/groups/{{groupId}}/events', as: ALICE, expect: 201,
  body: { ...event({ name: 'Concert de rentrée' }), inviteAllMembers: true },
  desc: 'Crée un événement rattaché au groupe. Avec `inviteAllMembers: true` (défaut), **tous les membres du groupe sont ajoutés comme participants en 1 clic**.\n\nAutorisé pour les admins, ou pour les membres si `allowMembersToCreateEvents = true`. Un événement d\'un groupe privé/secret est forcément privé.',
  save: { groupEventId: 'json._id' } });
req({ name: 'Erreur - membre non autorisé à créer un événement', method: 'POST', path: '/groups/{{groupId}}/events', as: BOB, expect: 403, body: event(), desc: '`allowMembersToCreateEvents = false` → **403**.' });
req({ name: 'Événements du groupe', method: 'GET', path: '/groups/{{groupId}}/events', desc: 'Liste paginée des événements du groupe.' });
req({ name: 'Supprimer un groupe', method: 'DELETE', path: '/groups/{{secretGroupId}}', as: ALICE, expect: 204, desc: 'Réservé aux admins. Supprime les fils de discussion du groupe ; les événements sont conservés mais détachés du groupe.' });

/* ===== 3. Événements ===== */
folder('3. Événements', `CRUD des événements (étape 1 : configuration).

**Attributs** : \`name\`*, \`description\`, \`startDate\`*, \`endDate\`* (> startDate), \`location\`*, \`coverPhoto\` (URL), \`visibility\` (\`public\` | \`private\`), \`organizers\` (≥ 1), \`participants\`, \`group\`, \`ticketingEnabled\` (public uniquement), \`shoppingListEnabled\`, \`carpoolEnabled\`.

Règles : le créateur devient organisateur ; un événement a toujours ≥ 1 organisateur ; événement **privé** = accessible uniquement aux personnes invitées par un organisateur.`);

req({ name: 'Créer un événement', method: 'POST', path: '/events', as: ALICE, expect: 201,
  body: event({ organizers: [], participants: [], ticketingEnabled: true, shoppingListEnabled: true, carpoolEnabled: true }),
  desc: 'Crée un événement. L\'utilisateur courant devient organisateur ; `organizers` / `participants` (ids) sont optionnels.\n\n**Erreurs** : 400 (dates incohérentes, billetterie sur un événement privé, champ manquant), 401 (pas de `X-User-Id`).',
  save: { eventId: 'json._id' } });
req({ name: 'Erreur - date de fin avant le début', method: 'POST', path: '/events', as: ALICE, expect: 400,
  body: event({ startDate: '2027-06-21T18:00:00.000Z', endDate: '2027-06-20T18:00:00.000Z' }), desc: '→ **400** avec le détail des champs invalides.' });
req({ name: 'Erreur - billetterie sur événement privé', method: 'POST', path: '/events', as: ALICE, expect: 400,
  body: event({ visibility: 'private', ticketingEnabled: true }), desc: 'La billetterie est réservée aux événements publics.' });
req({ name: 'Erreur - non authentifié', method: 'POST', path: '/events', expect: 401, body: event(), desc: 'Sans header `X-User-Id` → **401**.' });
req({ name: 'Lister les événements', method: 'GET', path: '/events', query: { upcoming: 'true', page: 1, limit: 20 },
  desc: 'Liste paginée (triée par date de début, sans la liste des participants).\n\n**Query** : `visibility`, `group`, `user` (événements d\'un utilisateur), `upcoming=true`, `search`, `page`, `limit`. Par défaut seuls les événements publics sont listés.' });
req({ name: 'Récupérer un événement', method: 'GET', path: '/events/{{eventId}}', desc: 'Détail complet : organisateurs et participants (prénom, nom, avatar), groupe.' });
req({ name: 'Modifier un événement', method: 'PATCH', path: '/events/{{eventId}}', as: ALICE,
  body: { description: 'Présentation de la nouvelle application, DJ set, buffet et surprises !', location: 'Station F, 5 parvis Alan Turing, 75013 Paris' }, desc: 'Réservé aux organisateurs.' });
req({ name: 'Erreur - modifier sans être organisateur', method: 'PATCH', path: '/events/{{eventId}}', as: BOB, expect: 403, body: { name: 'x' }, desc: '→ **403**.' });
req({ name: 'Participer à un événement', method: 'POST', path: '/events/{{eventId}}/participants', as: BOB, expect: 201,
  desc: 'Sans body : l\'utilisateur courant rejoint l\'événement public. Avec `{ "userId" }` : un organisateur invite quelqu\'un (obligatoire pour un événement privé).\n\n**Erreurs** : 403, 409 (déjà participant).' });
req({ name: 'Erreur - déjà participant', method: 'POST', path: '/events/{{eventId}}/participants', as: BOB, expect: 409, desc: '→ **409**.' });
req({ name: 'Inviter un participant', method: 'POST', path: '/events/{{eventId}}/participants', as: ALICE, expect: 201, body: { userId: '{{userChloe}}' }, desc: 'Un organisateur ajoute un participant.' });
req({ name: 'Lister organisateurs et participants', method: 'GET', path: '/events/{{eventId}}/participants', desc: 'Retour : `{ organizers: [User], participants: [User] }`' });
req({ name: 'Ajouter un organisateur', method: 'POST', path: '/events/{{eventId}}/organizers', as: ALICE, expect: 201, body: { userId: '{{userChloe}}' }, desc: 'Un événement est géré par 1 ou plusieurs organisateurs.' });
req({ name: 'Retirer un organisateur', method: 'DELETE', path: '/events/{{eventId}}/organizers/{{userChloe}}', as: ALICE, expect: 204, desc: 'L\'utilisateur redevient simple participant. Impossible de retirer le dernier organisateur (409).' });
req({ name: 'Partager sur les réseaux sociaux', method: 'GET', path: '/events/{{eventId}}/share', as: ALICE,
  desc: 'Renvoie des liens de partage (Facebook, X, LinkedIn, WhatsApp, email). Réservé aux organisateurs, pour un événement **public** hors groupe ou dans un **groupe public**.' });
req({ name: 'Événements d\'un utilisateur', method: 'GET', path: '/users/{{userBob}}/events', desc: 'Événements où l\'utilisateur est organisateur ou participant.' });
req({ name: 'Groupes d\'un utilisateur', method: 'GET', path: '/users/{{userBob}}/groups', desc: 'Groupes dont l\'utilisateur est membre ou administrateur.' });

/* ===== 4. Fils de discussion ===== */
folder('4. Fils de discussion', `CRUD des fils de discussion, messages et commentaires.

Règles :
- un fil est lié à **1 groupe OU 1 événement, jamais les deux** ;
- il contient 0..n messages écrits par un membre / participant ou un admin / organisateur (dans un groupe avec \`allowMembersToPost=false\`, seuls les admins publient) ;
- chaque membre / participant peut **commenter** un message ;
- lecture : libre pour un groupe / événement public, sinon réservée aux membres (header \`X-User-Id\`).`);

req({ name: 'Créer un fil (événement)', method: 'POST', path: '/threads', as: ALICE, expect: 201,
  body: { title: 'Infos pratiques', event: '{{eventId}}' }, desc: 'Body : `title`, et `group` **ou** `event`.\n\n**Erreurs** : 400 (aucun ou les deux), 403 (non membre).', save: { threadId: 'json._id' } });
req({ name: 'Erreur - groupe ET événement', method: 'POST', path: '/threads', as: ALICE, expect: 400,
  body: { title: 'Invalide', event: '{{eventId}}', group: '{{groupId}}' }, desc: '→ **400**.' });
req({ name: 'Lister les fils', method: 'GET', path: '/threads', query: { event: '{{eventId}}' }, desc: 'Query obligatoire : `group` ou `event`.' });
req({ name: 'Récupérer un fil', method: 'GET', path: '/threads/{{threadId}}', desc: 'Détail du fil.' });
req({ name: 'Modifier un fil', method: 'PATCH', path: '/threads/{{threadId}}', as: ALICE, body: { title: 'Infos pratiques & accès' }, desc: 'Créateur ou admin / organisateur.' });
req({ name: 'Poster un message', method: 'POST', path: '/threads/{{threadId}}/messages', as: BOB, expect: 201,
  body: { content: 'Est-ce qu\'il y a un vestiaire sur place ?' }, desc: 'Body : `content`. Auteur = utilisateur courant.', save: { messageId: 'json._id' } });
req({ name: 'Lister les messages', method: 'GET', path: '/threads/{{threadId}}/messages', desc: 'Messages paginés du plus récent au plus ancien, avec l\'auteur.' });
req({ name: 'Récupérer un message', method: 'GET', path: '/threads/{{threadId}}/messages/{{messageId}}', desc: 'Détail d\'un message.' });
req({ name: 'Modifier un message', method: 'PATCH', path: '/threads/{{threadId}}/messages/{{messageId}}', as: BOB, body: { content: 'Est-ce qu\'il y a un vestiaire sur place ? Merci !' }, desc: 'Réservé à l\'auteur.' });
req({ name: 'Erreur - modifier le message d\'un autre', method: 'PATCH', path: '/threads/{{threadId}}/messages/{{messageId}}', as: ALICE, expect: 403, body: { content: 'x' }, desc: '→ **403**.' });
req({ name: 'Commenter un message', method: 'POST', path: '/threads/{{threadId}}/messages/{{messageId}}/comments', as: CHLOE, expect: 201,
  body: { content: 'Oui, à l\'entrée !' }, desc: 'Tout membre / participant peut commenter.', save: { commentId: 'json._id' } });
req({ name: 'Lister les commentaires', method: 'GET', path: '/threads/{{threadId}}/messages/{{messageId}}/comments', desc: 'Commentaires du message (ordre chronologique).' });
req({ name: 'Récupérer un commentaire', method: 'GET', path: '/threads/{{threadId}}/messages/{{messageId}}/comments/{{commentId}}', desc: 'Détail.' });
req({ name: 'Modifier un commentaire', method: 'PATCH', path: '/threads/{{threadId}}/messages/{{messageId}}/comments/{{commentId}}', as: CHLOE, body: { content: 'Oui, à l\'entrée, c\'est gratuit !' }, desc: 'Réservé à l\'auteur.' });
req({ name: 'Supprimer un commentaire', method: 'DELETE', path: '/threads/{{threadId}}/messages/{{messageId}}/comments/{{commentId}}', as: ALICE, expect: 204, desc: 'Auteur ou admin / organisateur.' });
req({ name: 'Supprimer un message', method: 'DELETE', path: '/threads/{{threadId}}/messages/{{messageId}}', as: BOB, expect: 204, desc: 'Auteur ou admin / organisateur. Supprime aussi les commentaires.' });
req({ name: 'Poster dans le fil du groupe', method: 'POST', path: '/threads/{{groupThreadId}}/messages', as: BOB, expect: 201, body: { content: 'Qui vient au concert de rentrée ?' }, desc: 'Fil créé automatiquement avec le groupe.' });

/* ===== 5. Albums photo ===== */
folder('5. Albums photo', `CRUD des albums, photos et commentaires de photos.

Règles : un album est associé à **1 événement** ; il contient 0..n photos postées par **1 participant** de l'événement ; les photos peuvent être commentées par 0..n participants.`);

req({ name: 'Créer un album', method: 'POST', path: '/albums', as: ALICE, expect: 201,
  body: { event: '{{eventId}}', name: 'Photos de la soirée', description: 'Partagez vos meilleurs moments !' }, desc: 'Réservé aux participants (organisateurs inclus).', save: { albumId: 'json._id' } });
req({ name: 'Lister les albums d\'un événement', method: 'GET', path: '/albums', query: { event: '{{eventId}}' }, desc: 'Query obligatoire : `event`.' });
req({ name: 'Récupérer un album', method: 'GET', path: '/albums/{{albumId}}', desc: 'Détail + `photosCount`.' });
req({ name: 'Modifier un album', method: 'PATCH', path: '/albums/{{albumId}}', as: ALICE, body: { name: 'Photos de la soirée de lancement' }, desc: 'Créateur ou organisateur.' });
req({ name: 'Poster une photo', method: 'POST', path: '/albums/{{albumId}}/photos', as: BOB, expect: 201,
  body: { url: 'https://picsum.photos/seed/photo1/800/600', caption: 'Le DJ set !' }, desc: 'Body : `url`*, `caption`. Réservé aux participants.', save: { photoId: 'json._id' } });
req({ name: 'Lister les photos', method: 'GET', path: '/albums/{{albumId}}/photos', desc: 'Photos paginées avec leur auteur.' });
req({ name: 'Récupérer une photo', method: 'GET', path: '/albums/{{albumId}}/photos/{{photoId}}', desc: 'Détail.' });
req({ name: 'Modifier une photo', method: 'PATCH', path: '/albums/{{albumId}}/photos/{{photoId}}', as: BOB, body: { caption: 'Le DJ set de folie !' }, desc: 'Réservé à l\'auteur.' });
req({ name: 'Commenter une photo', method: 'POST', path: '/albums/{{albumId}}/photos/{{photoId}}/comments', as: CHLOE, expect: 201,
  body: { content: 'Trop belle photo 😍' }, desc: 'Réservé aux participants.', save: { photoCommentId: 'json._id' } });
req({ name: 'Lister les commentaires d\'une photo', method: 'GET', path: '/albums/{{albumId}}/photos/{{photoId}}/comments', desc: 'Ordre chronologique.' });
req({ name: 'Récupérer un commentaire de photo', method: 'GET', path: '/albums/{{albumId}}/photos/{{photoId}}/comments/{{photoCommentId}}', desc: 'Détail.' });
req({ name: 'Modifier un commentaire de photo', method: 'PATCH', path: '/albums/{{albumId}}/photos/{{photoId}}/comments/{{photoCommentId}}', as: CHLOE, body: { content: 'Trop belle photo !!' }, desc: 'Réservé à l\'auteur.' });
req({ name: 'Supprimer un commentaire de photo', method: 'DELETE', path: '/albums/{{albumId}}/photos/{{photoId}}/comments/{{photoCommentId}}', as: CHLOE, expect: 204, desc: 'Auteur ou organisateur.' });
req({ name: 'Supprimer une photo', method: 'DELETE', path: '/albums/{{albumId}}/photos/{{photoId}}', as: ALICE, expect: 204, desc: 'Auteur ou organisateur (supprime aussi les commentaires).' });
req({ name: 'Supprimer un album', method: 'DELETE', path: '/albums/{{albumId}}', as: ALICE, expect: 204, desc: 'Créateur ou organisateur (supprime photos et commentaires).' });

/* ===== 6. Sondages ===== */
folder('6. Sondages', `CRUD des sondages et des réponses.

Règles : un événement a 0..n sondages **créés par un organisateur** ; un sondage a ≥ 1 question ; chaque question a ≥ 2 réponses possibles mais **une seule peut être choisie** ; chaque participant répond une fois par sondage (il peut modifier sa réponse).`);

req({ name: 'Créer un sondage', method: 'POST', path: '/polls', as: ALICE, expect: 201,
  body: { event: '{{eventId}}', title: 'Organisation de la soirée', questions: [
    { text: 'Quel style de musique ?', options: [{ text: 'Électro' }, { text: 'Rap' }, { text: 'Rock' }] },
    { text: 'Buffet sucré ou salé ?', options: [{ text: 'Sucré' }, { text: 'Salé' }] }
  ] },
  desc: 'Body : `event`*, `title`*, `questions`* : `[{ text, options: [{ text }] }]`. Chaque question et option reçoit un `_id` utilisé pour répondre.',
  save: { pollId: 'json._id', q1: 'json.questions[0]._id', q1o1: 'json.questions[0].options[0]._id', q1o2: 'json.questions[0].options[1]._id', q2: 'json.questions[1]._id', q2o1: 'json.questions[1].options[0]._id', q2o2: 'json.questions[1].options[1]._id' } });
req({ name: 'Erreur - sondage créé par un non-organisateur', method: 'POST', path: '/polls', as: BOB, expect: 403,
  body: { event: '{{eventId}}', title: 'x', questions: [{ text: 'x', options: [{ text: 'a' }, { text: 'b' }] }] }, desc: '→ **403**.' });
req({ name: 'Lister les sondages', method: 'GET', path: '/polls', query: { event: '{{eventId}}' }, desc: 'Query obligatoire : `event`.' });
req({ name: 'Récupérer un sondage', method: 'GET', path: '/polls/{{pollId}}', desc: 'Sondage avec questions et options (ids).' });
req({ name: 'Modifier un sondage', method: 'PATCH', path: '/polls/{{pollId}}', as: ALICE, body: { title: 'Organisation de la soirée de lancement' }, desc: 'Réservé aux organisateurs. Les questions ne sont plus modifiables dès qu\'une réponse existe (409).' });
req({ name: 'Répondre à un sondage', method: 'POST', path: '/polls/{{pollId}}/answers', as: BOB, expect: 201,
  body: { answers: [{ question: '{{q1}}', option: '{{q1o1}}' }, { question: '{{q2}}', option: '{{q2o2}}' }] },
  desc: 'Body : `answers: [{ question, option }]` — **exactement 1 option par question**, toutes les questions doivent être renseignées.\n\n**Erreurs** : 400 (2 réponses à la même question, option invalide, question manquante), 403 (non participant), 409 (déjà répondu).', save: { answerId: 'json._id' } });
req({ name: 'Erreur - 2 réponses à la même question', method: 'POST', path: '/polls/{{pollId}}/answers', as: CHLOE, expect: 400,
  body: { answers: [{ question: '{{q1}}', option: '{{q1o1}}' }, { question: '{{q1}}', option: '{{q1o2}}' }, { question: '{{q2}}', option: '{{q2o1}}' }] }, desc: 'Une seule réponse peut être choisie par question → **400**.' });
req({ name: 'Répondre (Chloé)', method: 'POST', path: '/polls/{{pollId}}/answers', as: CHLOE, expect: 201,
  body: { answers: [{ question: '{{q1}}', option: '{{q1o2}}' }, { question: '{{q2}}', option: '{{q2o2}}' }] }, desc: 'Deuxième réponse pour les résultats.' });
req({ name: 'Erreur - répondre deux fois', method: 'POST', path: '/polls/{{pollId}}/answers', as: BOB, expect: 409,
  body: { answers: [{ question: '{{q1}}', option: '{{q1o1}}' }, { question: '{{q2}}', option: '{{q2o1}}' }] }, desc: '→ **409**, utiliser PATCH.' });
req({ name: 'Lister les réponses', method: 'GET', path: '/polls/{{pollId}}/answers', desc: 'Réponses paginées avec l\'utilisateur.' });
req({ name: 'Récupérer une réponse', method: 'GET', path: '/polls/{{pollId}}/answers/{{answerId}}', desc: 'Détail.' });
req({ name: 'Modifier sa réponse', method: 'PATCH', path: '/polls/{{pollId}}/answers/{{answerId}}', as: BOB,
  body: { answers: [{ question: '{{q1}}', option: '{{q1o1}}' }, { question: '{{q2}}', option: '{{q2o1}}' }] }, desc: 'Réservé à l\'auteur de la réponse.' });
req({ name: 'Résultats du sondage', method: 'GET', path: '/polls/{{pollId}}/results',
  desc: 'Nombre de votes par option pour chaque question.\n\nRetour : `{ poll, totalVoters, questions: [{ _id, text, options: [{ _id, text, votes }] }] }`' });
req({ name: 'Erreur - modifier les questions après des réponses', method: 'PATCH', path: '/polls/{{pollId}}', as: ALICE, expect: 409,
  body: { questions: [{ text: 'Nouvelle', options: [{ text: 'a' }, { text: 'b' }] }] }, desc: '→ **409**.' });
req({ name: 'Supprimer sa réponse', method: 'DELETE', path: '/polls/{{pollId}}/answers/{{answerId}}', as: BOB, expect: 204, desc: 'Réservé à l\'auteur.' });
req({ name: 'Supprimer un sondage', method: 'DELETE', path: '/polls/{{pollId}}', as: ALICE, expect: 204, desc: 'Réservé aux organisateurs (supprime les réponses).' });

/* ===== 7. Billetterie ===== */
folder('7. Billetterie', `Types de billets et billets d'un événement **public** avec \`ticketingEnabled = true\`.

**Type de billet** : \`name\`*, \`amount\`* (€), \`quantity\`* (quantité limitée) ; calculés : \`sold\`, \`remaining\`. Géré par les organisateurs.

**Billet** : \`ticketType\`*, \`buyer\` { \`firstname\`*, \`lastname\`*, \`email\`*, \`address\` { street, zipcode, city, country }* }, \`purchaseDate\` (auto).

Règles : l'achat est **ouvert aux personnes extérieures** (pas de compte requis) ; **une personne (email) ne peut obtenir qu'1 seul billet** par événement ; la quantité ne peut jamais être dépassée (décrément atomique) ; la liste des billets (données personnelles) est réservée aux organisateurs.`);

req({ name: 'Créer un type de billet', method: 'POST', path: '/events/{{eventId}}/ticket-types', as: ALICE, expect: 201,
  body: { name: 'Standard', amount: 15, quantity: 100 }, desc: 'Réservé aux organisateurs.', save: { ticketTypeId: 'json._id' } });
req({ name: 'Créer un type de billet (VIP, 1 place)', method: 'POST', path: '/events/{{eventId}}/ticket-types', as: ALICE, expect: 201,
  body: { name: 'VIP', amount: 50, quantity: 1 }, desc: 'Quantité limitée à 1 pour illustrer la rupture de stock.', save: { vipTypeId: 'json._id' } });
req({ name: 'Lister les types de billets', method: 'GET', path: '/events/{{eventId}}/ticket-types', desc: 'Public. Triés par montant, avec `sold` et `remaining`.' });
req({ name: 'Récupérer un type de billet', method: 'GET', path: '/events/{{eventId}}/ticket-types/{{ticketTypeId}}', desc: 'Détail.' });
req({ name: 'Modifier un type de billet', method: 'PATCH', path: '/events/{{eventId}}/ticket-types/{{ticketTypeId}}', as: ALICE,
  body: { amount: 12.5, quantity: 150 }, desc: 'La quantité ne peut pas descendre sous le nombre de billets vendus (400).' });
req({ name: 'Acheter un billet (personne extérieure)', method: 'POST', path: '/events/{{eventId}}/tickets', expect: 201,
  body: { ticketType: '{{ticketTypeId}}', buyer: { firstname: 'Jean', lastname: 'Dupont', email: 'jean.dupont.{{$timestamp}}@example.com', address: { street: '12 rue Victor Hugo', zipcode: '69002', city: 'Lyon', country: 'France' } } },
  desc: 'Aucune authentification requise. Retour : le billet avec son type, l\'acheteur et la date d\'achat.\n\n**Erreurs** : 400 (données manquantes), 409 (déjà un billet avec cet email, plus de places).',
  save: { ticketId: 'json._id', buyerEmail: 'json.buyer.email' } });
req({ name: 'Erreur - 2e billet pour la même personne', method: 'POST', path: '/events/{{eventId}}/tickets', expect: 409,
  body: { ticketType: '{{ticketTypeId}}', buyer: { firstname: 'Jean', lastname: 'Dupont', email: '{{buyerEmail}}', address: { street: '12 rue Victor Hugo', zipcode: '69002', city: 'Lyon', country: 'France' } } },
  desc: 'Une personne extérieure ne peut obtenir qu\'1 seul billet → **409**.' });
req({ name: 'Acheter le dernier billet VIP', method: 'POST', path: '/events/{{eventId}}/tickets', expect: 201,
  body: { ticketType: '{{vipTypeId}}', buyer: { firstname: 'Marie', lastname: 'Leroy', email: 'marie.leroy.{{$timestamp}}@example.com', address: { street: '3 place Bellecour', zipcode: '69002', city: 'Lyon', country: 'France' } } }, desc: 'Achat de l\'unique billet VIP.' });
req({ name: 'Erreur - plus de billets disponibles', method: 'POST', path: '/events/{{eventId}}/tickets', expect: 409,
  body: { ticketType: '{{vipTypeId}}', buyer: { firstname: 'Paul', lastname: 'Roux', email: 'paul.roux.{{$timestamp}}@example.com', address: { street: '1 rue de Rivoli', zipcode: '75001', city: 'Paris', country: 'France' } } }, desc: 'Quantité limitée atteinte → **409**.' });
req({ name: 'Lister les billets vendus', method: 'GET', path: '/events/{{eventId}}/tickets', as: ALICE, desc: 'Organisateurs uniquement. Query : `ticketType`, `page`, `limit`.' });
req({ name: 'Erreur - liste des billets sans être organisateur', method: 'GET', path: '/events/{{eventId}}/tickets', as: BOB, expect: 403, desc: '→ **403**.' });
req({ name: 'Récupérer un billet', method: 'GET', path: '/events/{{eventId}}/tickets/{{ticketId}}', as: ALICE, desc: 'Organisateurs uniquement.' });
req({ name: 'Modifier un billet', method: 'PATCH', path: '/events/{{eventId}}/tickets/{{ticketId}}', as: ALICE,
  body: { buyer: { address: { street: '14 rue Victor Hugo' } } }, desc: 'Correction des données de l\'acheteur (organisateurs).' });
req({ name: 'Annuler un billet', method: 'DELETE', path: '/events/{{eventId}}/tickets/{{ticketId}}', as: ALICE, expect: 204, desc: 'La place est remise en vente.' });
req({ name: 'Erreur - supprimer un type déjà vendu', method: 'DELETE', path: '/events/{{eventId}}/ticket-types/{{vipTypeId}}', as: ALICE, expect: 409, desc: '→ **409**.' });
req({ name: 'Supprimer un type de billet', method: 'DELETE', path: '/events/{{eventId}}/ticket-types/{{ticketTypeId}}', as: ALICE, expect: 204, desc: 'Possible seulement si aucun billet de ce type n\'est vendu.' });

/* ===== 8. Shopping list ===== */
folder('8. Shopping list', `Éléments apportés à un événement dont \`shoppingListEnabled = true\`.

**Élément** : \`name\`*, \`quantity\`*, \`arrivalTime\`* (heure d'arrivée), \`user\` (auto).

Règle : **chaque chose apportée est unique par événement** (comparaison insensible à la casse et aux espaces → 409).`);

req({ name: 'Ajouter un élément', method: 'POST', path: '/events/{{eventId}}/shopping-items', as: BOB, expect: 201,
  body: { name: 'Chips', quantity: 5, arrivalTime: '2027-06-20T18:30:00.000Z' }, desc: 'Réservé aux participants.', save: { itemId: 'json._id' } });
req({ name: 'Erreur - élément déjà apporté', method: 'POST', path: '/events/{{eventId}}/shopping-items', as: CHLOE, expect: 409,
  body: { name: ' chips ', quantity: 2, arrivalTime: '2027-06-20T19:00:00.000Z' }, desc: '→ **409**.' });
req({ name: 'Ajouter un élément (Chloé)', method: 'POST', path: '/events/{{eventId}}/shopping-items', as: CHLOE, expect: 201,
  body: { name: 'Boissons', quantity: 12, arrivalTime: '2027-06-20T19:00:00.000Z' }, desc: 'Autre élément.' });
req({ name: 'Lister la shopping list', method: 'GET', path: '/events/{{eventId}}/shopping-items', desc: 'Éléments triés par nom avec la personne qui les apporte.' });
req({ name: 'Récupérer un élément', method: 'GET', path: '/events/{{eventId}}/shopping-items/{{itemId}}', desc: 'Détail.' });
req({ name: 'Modifier un élément', method: 'PATCH', path: '/events/{{eventId}}/shopping-items/{{itemId}}', as: BOB, body: { quantity: 8 }, desc: 'Réservé à la personne qui l\'apporte.' });
req({ name: 'Supprimer un élément', method: 'DELETE', path: '/events/{{eventId}}/shopping-items/{{itemId}}', as: ALICE, expect: 204, desc: 'Auteur ou organisateur.' });

/* ===== 9. Covoiturage (bonus) ===== */
folder('9. Covoiturage (bonus)', `Trajets proposés pour un événement dont \`carpoolEnabled = true\`.

**Covoiturage** : \`departurePlace\`*, \`departureTime\`*, \`price\`*, \`seats\`* (places disponibles), \`maxDetourMinutes\`* (temps max d'écart : trajet de 2h30 + 30 min ⇒ 3h max), \`driver\` (auto), \`passengers\`, \`remainingSeats\` (calculé).`);

req({ name: 'Proposer un covoiturage', method: 'POST', path: '/events/{{eventId}}/carpools', as: BOB, expect: 201,
  body: { departurePlace: 'Gare de Lyon-Part-Dieu', departureTime: '2027-06-20T14:00:00.000Z', price: 25, seats: 3, maxDetourMinutes: 30 },
  desc: 'Réservé aux participants, 1 trajet par conducteur et par événement.', save: { carpoolId: 'json._id' } });
req({ name: 'Erreur - deuxième trajet pour le même conducteur', method: 'POST', path: '/events/{{eventId}}/carpools', as: BOB, expect: 409,
  body: { departurePlace: 'Lyon', departureTime: '2027-06-20T15:00:00.000Z', price: 20, seats: 2, maxDetourMinutes: 15 }, desc: '→ **409**.' });
req({ name: 'Lister les covoiturages', method: 'GET', path: '/events/{{eventId}}/carpools', query: { maxPrice: 30, minSeats: 1 }, desc: 'Query : `maxPrice`, `minSeats` (places restantes), `page`, `limit`.' });
req({ name: 'Récupérer un covoiturage', method: 'GET', path: '/events/{{eventId}}/carpools/{{carpoolId}}', desc: 'Avec conducteur, passagers et `remainingSeats`.' });
req({ name: 'Modifier un covoiturage', method: 'PATCH', path: '/events/{{eventId}}/carpools/{{carpoolId}}', as: BOB, body: { price: 22 }, desc: 'Réservé au conducteur.' });
req({ name: 'Réserver une place', method: 'POST', path: '/events/{{eventId}}/carpools/{{carpoolId}}/passengers', as: CHLOE, expect: 201, desc: 'L\'utilisateur courant devient passager (409 si complet ou déjà inscrit).' });
req({ name: 'Erreur - réserver deux fois', method: 'POST', path: '/events/{{eventId}}/carpools/{{carpoolId}}/passengers', as: CHLOE, expect: 409, desc: '→ **409**.' });
req({ name: 'Annuler une réservation', method: 'DELETE', path: '/events/{{eventId}}/carpools/{{carpoolId}}/passengers/{{userChloe}}', as: CHLOE, expect: 204, desc: 'Le passager ou le conducteur.' });
req({ name: 'Supprimer un covoiturage', method: 'DELETE', path: '/events/{{eventId}}/carpools/{{carpoolId}}', as: BOB, expect: 204, desc: 'Conducteur ou organisateur.' });

/* ===== 10. Suppressions ===== */
folder('10. Suppressions (nettoyage)', 'Suppressions finales : participants, fils, événements (en cascade), groupes et utilisateurs.');

req({ name: 'Quitter un événement', method: 'DELETE', path: '/events/{{eventId}}/participants/{{userChloe}}', as: CHLOE, expect: 204, desc: 'Un participant peut quitter, un organisateur peut retirer n\'importe quel participant.' });
req({ name: 'Supprimer un fil de discussion', method: 'DELETE', path: '/threads/{{threadId}}', as: ALICE, expect: 204, desc: 'Créateur ou admin / organisateur (messages et commentaires supprimés).' });
req({ name: 'Supprimer un événement', method: 'DELETE', path: '/events/{{eventId}}', as: ALICE, expect: 204,
  desc: 'Réservé aux organisateurs. Suppression **en cascade** : fils, messages, commentaires, albums, photos, sondages, réponses, billets, shopping list, covoiturages.' });
req({ name: 'Erreur - supprimer l\'unique admin / organisateur', method: 'DELETE', path: '/users/{{userAlice}}', as: ALICE, expect: 409, desc: 'Un groupe / événement ne peut pas rester sans admin / organisateur → **409**.' });
req({ name: 'Supprimer l\'événement du groupe', method: 'DELETE', path: '/events/{{groupEventId}}', as: ALICE, expect: 204, desc: '' });
req({ name: 'Supprimer le groupe', method: 'DELETE', path: '/groups/{{groupId}}', as: ALICE, expect: 204, desc: '' });
req({ name: 'Supprimer un utilisateur (Chloé)', method: 'DELETE', path: '/users/{{userChloe}}', as: CHLOE, expect: 204, desc: 'Supprime son propre compte et le retire des événements / groupes.' });
req({ name: 'Supprimer un utilisateur (Bob)', method: 'DELETE', path: '/users/{{userBob}}', as: BOB, expect: 204, desc: '' });
req({ name: 'Supprimer un utilisateur (Alice)', method: 'DELETE', path: '/users/{{userAlice}}', as: ALICE, expect: 204, desc: '' });

/* ------------------------------------------------------------------ */
/* Exécution réelle + génération                                       */
/* ------------------------------------------------------------------ */

const vars = {};
const ts = Date.now();
const resolve = (v) => {
  if (typeof v === 'string') {
    return v.replace(/\{\{\$timestamp\}\}/g, ts).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
  }
  if (Array.isArray(v)) return v.map(resolve);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x)]));
  return v;
};
const qs = (q) => (q ? `?${new URLSearchParams(q).toString()}` : '');
const STATUS_TEXT = { 200: 'OK', 201: 'Created', 204: 'No Content', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict' };

async function run() {
  let ok = 0;
  const failures = [];
  for (const f of folders) {
    for (const r of f.items) {
      const url = BASE_URL + resolve(r.path) + qs(resolve(r.query));
      const headers = { 'Content-Type': 'application/json' };
      if (r.as) headers['X-User-Id'] = vars[r.as];
      const res = await fetch(url, { method: r.method, headers, body: r.body ? JSON.stringify(resolve(r.body)) : undefined });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* vide */ }
      r.example = { status: res.status, body: text ? JSON.stringify(json, null, 2) : '' };
      if (res.status !== r.expect) {
        failures.push(`${f.name} > ${r.name} : attendu ${r.expect}, reçu ${res.status} ${text}`);
      } else ok += 1;
      if (r.save && json) {
        for (const [k, expr] of Object.entries(r.save)) {
          // eslint-disable-next-line no-new-func
          vars[k] = new Function('json', `return ${expr}`)(json);
        }
      }
    }
  }
  return { ok, failures };
}

function toPostman() {
  const allVars = new Set(['baseUrl']);
  const item = folders.map((f) => ({
    name: f.name,
    description: f.description,
    item: f.items.map((r) => {
      const header = [];
      if (r.body) header.push({ key: 'Content-Type', value: 'application/json' });
      if (r.as) { header.push({ key: 'X-User-Id', value: `{{${r.as}}}`, description: 'Utilisateur qui effectue l\'action' }); allVars.add(r.as); }
      const rawPath = r.path + (r.query ? `?${Object.entries(r.query).map(([k, v]) => `${k}=${v}`).join('&')}` : '');
      const url = {
        raw: `{{baseUrl}}${rawPath}`,
        host: ['{{baseUrl}}'],
        path: r.path.split('/').filter(Boolean),
        ...(r.query ? { query: Object.entries(r.query).map(([key, value]) => ({ key, value: String(value) })) } : {})
      };
      const exec = [
        `pm.test("Statut ${r.expect}", function () {`,
        `    pm.response.to.have.status(${r.expect});`,
        '});'
      ];
      if (r.save) {
        exec.push('const json = pm.response.json();');
        Object.entries(r.save).forEach(([k, expr]) => {
          allVars.add(k);
          exec.push(`pm.collectionVariables.set("${k}", ${expr});`);
        });
      }
      const request = {
        method: r.method,
        header,
        url,
        description: `**${r.method} ${rawPath}**${r.as ? `\n\n🔐 Header \`X-User-Id\` requis.` : ''}\n\n${r.desc || ''}`
      };
      if (r.body) request.body = { mode: 'raw', raw: JSON.stringify(r.body, null, 2), options: { raw: { language: 'json' } } };
      return {
        name: r.name,
        event: [{ listen: 'test', script: { type: 'text/javascript', exec } }],
        request,
        response: r.example ? [{
          name: `${r.example.status} ${STATUS_TEXT[r.example.status] || ''}`.trim(),
          originalRequest: request,
          status: STATUS_TEXT[r.example.status] || '',
          code: r.example.status,
          _postman_previewlanguage: 'json',
          header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
          body: r.example.body
        }] : []
      };
    })
  }));

  return {
    info: {
      name: 'Social Networks API',
      description: fs.readFileSync(path.join(__dirname, 'collection-description.md'), 'utf8'),
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item,
    variable: [...allVars].map((key) => ({ key, value: key === 'baseUrl' ? 'http://localhost:3000/api' : '' }))
  };
}

(async () => {
  const { ok, failures } = await run();
  const total = folders.reduce((n, f) => n + f.items.length, 0);
  console.log(`${ok}/${total} requêtes conformes`);
  failures.forEach((x) => console.log(' ✗', x));
  fs.writeFileSync(OUT, `${JSON.stringify(toPostman(), null, 2)}\n`);
  console.log(`Collection écrite : ${path.relative(process.cwd(), OUT)}`);
  process.exit(failures.length ? 1 : 0);
})();
