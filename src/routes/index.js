const { Router } = require('express');
const { requireUser: auth, optionalUser: opt } = require('../middlewares/auth');

const users = require('../controllers/userController');
const events = require('../controllers/eventController');
const groups = require('../controllers/groupController');
const threads = require('../controllers/threadController');
const albums = require('../controllers/albumController');
const polls = require('../controllers/pollController');
const tickets = require('../controllers/ticketController');
const shopping = require('../controllers/shoppingController');
const carpools = require('../controllers/carpoolController');

const r = Router();

/* ===== 2.1 Utilisateurs ===== */
r.get('/users', users.list);
r.post('/users', users.create);
r.get('/users/:id', users.get);
r.patch('/users/:id', auth, users.update);
r.delete('/users/:id', auth, users.remove);
r.get('/users/:id/events', users.events);
r.get('/users/:id/groups', users.groups);

/* ===== 2.2 Événements ===== */
r.get('/events', events.list);
r.post('/events', auth, events.create);
r.get('/events/:id', events.get);
r.patch('/events/:id', auth, events.update);
r.delete('/events/:id', auth, events.remove);
r.get('/events/:id/participants', events.listParticipants);
r.post('/events/:id/participants', auth, events.addParticipant);
r.delete('/events/:id/participants/:userId', auth, events.removeParticipant);
r.post('/events/:id/organizers', auth, events.addOrganizer);
r.delete('/events/:id/organizers/:userId', auth, events.removeOrganizer);
r.get('/events/:id/share', auth, events.share);

/* ===== 2.3 Groupes ===== */
r.get('/groups', groups.list);
r.post('/groups', auth, groups.create);
r.get('/groups/:id', groups.get);
r.patch('/groups/:id', auth, groups.update);
r.delete('/groups/:id', auth, groups.remove);
r.post('/groups/:id/members', auth, groups.addMember);
r.delete('/groups/:id/members/:userId', auth, groups.removeMember);
r.post('/groups/:id/admins', auth, groups.addAdmin);
r.delete('/groups/:id/admins/:userId', auth, groups.removeAdmin);
r.get('/groups/:id/events', groups.listEvents);
r.post('/groups/:id/events', auth, groups.createEvent);
r.get('/groups/:id/threads', groups.listThreads);

/* ===== 2.4 Fils de discussion ===== */
const T = '/threads/:threadId';
const M = `${T}/messages/:messageId`;
r.get('/threads', opt, threads.list);
r.post('/threads', auth, threads.create);
r.get(T, opt, threads.get);
r.patch(T, auth, threads.update);
r.delete(T, auth, threads.remove);
r.get(`${T}/messages`, opt, threads.listMessages);
r.post(`${T}/messages`, auth, threads.createMessage);
r.get(M, opt, threads.getMessage);
r.patch(M, auth, threads.updateMessage);
r.delete(M, auth, threads.removeMessage);
r.get(`${M}/comments`, opt, threads.listComments);
r.post(`${M}/comments`, auth, threads.createComment);
r.get(`${M}/comments/:commentId`, opt, threads.getComment);
r.patch(`${M}/comments/:commentId`, auth, threads.updateComment);
r.delete(`${M}/comments/:commentId`, auth, threads.removeComment);

/* ===== 2.5 Albums photo ===== */
const A = '/albums/:albumId';
const P = `${A}/photos/:photoId`;
r.get('/albums', opt, albums.list);
r.post('/albums', auth, albums.create);
r.get(A, opt, albums.get);
r.patch(A, auth, albums.update);
r.delete(A, auth, albums.remove);
r.get(`${A}/photos`, opt, albums.listPhotos);
r.post(`${A}/photos`, auth, albums.createPhoto);
r.get(P, opt, albums.getPhoto);
r.patch(P, auth, albums.updatePhoto);
r.delete(P, auth, albums.removePhoto);
r.get(`${P}/comments`, opt, albums.listComments);
r.post(`${P}/comments`, auth, albums.createComment);
r.get(`${P}/comments/:commentId`, opt, albums.getComment);
r.patch(`${P}/comments/:commentId`, auth, albums.updateComment);
r.delete(`${P}/comments/:commentId`, auth, albums.removeComment);

/* ===== 2.6 Sondages ===== */
const S = '/polls/:pollId';
r.get('/polls', opt, polls.list);
r.post('/polls', auth, polls.create);
r.get(S, opt, polls.get);
r.patch(S, auth, polls.update);
r.delete(S, auth, polls.remove);
r.get(`${S}/results`, opt, polls.results);
r.get(`${S}/answers`, opt, polls.listAnswers);
r.post(`${S}/answers`, auth, polls.createAnswer);
r.get(`${S}/answers/:answerId`, opt, polls.getAnswer);
r.patch(`${S}/answers/:answerId`, auth, polls.updateAnswer);
r.delete(`${S}/answers/:answerId`, auth, polls.removeAnswer);

/* ===== 2.7 Billetterie ===== */
const E = '/events/:eventId';
r.get(`${E}/ticket-types`, tickets.listTypes);
r.post(`${E}/ticket-types`, auth, tickets.createType);
r.get(`${E}/ticket-types/:ticketTypeId`, tickets.getType);
r.patch(`${E}/ticket-types/:ticketTypeId`, auth, tickets.updateType);
r.delete(`${E}/ticket-types/:ticketTypeId`, auth, tickets.removeType);
r.post(`${E}/tickets`, tickets.buy); // achat ouvert aux personnes extérieures
r.get(`${E}/tickets`, auth, tickets.list);
r.get(`${E}/tickets/:ticketId`, auth, tickets.get);
r.patch(`${E}/tickets/:ticketId`, auth, tickets.update);
r.delete(`${E}/tickets/:ticketId`, auth, tickets.remove);

/* ===== 2.8 Shopping list ===== */
r.get(`${E}/shopping-items`, opt, shopping.list);
r.post(`${E}/shopping-items`, auth, shopping.create);
r.get(`${E}/shopping-items/:itemId`, opt, shopping.get);
r.patch(`${E}/shopping-items/:itemId`, auth, shopping.update);
r.delete(`${E}/shopping-items/:itemId`, auth, shopping.remove);

/* ===== 3 Covoiturage (bonus) ===== */
const C = `${E}/carpools/:carpoolId`;
r.get(`${E}/carpools`, opt, carpools.list);
r.post(`${E}/carpools`, auth, carpools.create);
r.get(C, opt, carpools.get);
r.patch(C, auth, carpools.update);
r.delete(C, auth, carpools.remove);
r.post(`${C}/passengers`, auth, carpools.join);
r.delete(`${C}/passengers/:userId`, auth, carpools.leave);

module.exports = r;
