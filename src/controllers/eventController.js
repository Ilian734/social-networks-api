const Event = require('../models/Event');
const Group = require('../models/Group');
const ApiError = require('../utils/ApiError');
const { paginatedList, findOr404, pick, includesId, uniqIds } = require('../utils/helpers');
const { assertUsersExist, assertUserExists, USER_PUBLIC_FIELDS } = require('../utils/users');
const { deleteEventData } = require('../utils/cascade');

const FIELDS = [
  'name', 'description', 'startDate', 'endDate', 'location', 'coverPhoto', 'visibility',
  'ticketingEnabled', 'shoppingListEnabled', 'carpoolEnabled'
];

const POPULATE = [
  { path: 'organizers', select: USER_PUBLIC_FIELDS },
  { path: 'participants', select: USER_PUBLIC_FIELDS },
  { path: 'group', select: 'name type' }
];

/**
 * Création d'un événement (utilisé aussi par POST /groups/:id/events).
 * L'utilisateur qui crée l'événement devient automatiquement organisateur.
 */
async function createEvent(body, actorId, group = null) {
  const data = pick(body, FIELDS);
  data.organizers = await assertUsersExist([actorId, ...(body.organizers || [])], 'organizers');
  let participants = await assertUsersExist(body.participants || [], 'participants');

  if (group) {
    data.group = group._id;
    // Invitation de tous les membres du groupe en 1 clic (activée par défaut)
    if (body.inviteAllMembers !== false) {
      participants = uniqIds([...participants, ...group.members, ...group.admins]);
    }
    // Un événement d'un groupe secret / privé ne peut pas être public
    if (group.type !== 'public' && data.visibility === 'public') {
      throw ApiError.badRequest(`Un événement d'un groupe ${group.type} ne peut pas être public`);
    }
    if (group.type !== 'public' && !data.visibility) data.visibility = 'private';
  }

  data.participants = participants.filter((p) => !data.organizers.includes(String(p)));
  return Event.create(data);
}
exports.createEvent = createEvent;

exports.list = async (req, res) => {
  const filter = {};
  const { visibility, group, user, upcoming, search } = req.query;
  if (visibility) filter.visibility = visibility;
  if (group) filter.group = group;
  if (user) filter.$or = [{ organizers: user }, { participants: user }];
  if (upcoming === 'true') filter.endDate = { $gte: new Date() };
  if (search) filter.name = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  // Par défaut on ne liste que les événements publics (sauf filtre explicite par utilisateur)
  if (!visibility && !user && !group) filter.visibility = 'public';
  res.json(await paginatedList(Event, filter, req.query, { sort: { startDate: 1 }, select: '-participants' }));
};

exports.get = async (req, res) => {
  const event = await findOr404(Event, req.params.id, 'Événement');
  await event.populate(POPULATE);
  res.json(event);
};

exports.create = async (req, res) => {
  if (req.body.group) {
    throw ApiError.badRequest('Pour créer un événement dans un groupe, utilisez POST /api/groups/:groupId/events');
  }
  const event = await createEvent(req.body, req.userId);
  res.status(201).json(event);
};

exports.update = async (req, res) => {
  const event = await findOr404(Event, req.params.id, 'Événement');
  if (!event.isOrganizer(req.userId)) throw ApiError.forbidden('Seul un organisateur peut modifier cet événement');
  event.set(pick(req.body, FIELDS));
  await event.save();
  res.json(event);
};

exports.remove = async (req, res) => {
  const event = await findOr404(Event, req.params.id, 'Événement');
  if (!event.isOrganizer(req.userId)) throw ApiError.forbidden('Seul un organisateur peut supprimer cet événement');
  await deleteEventData(event._id);
  await event.deleteOne();
  res.status(204).end();
};

/* ---------- Participants ---------- */

exports.listParticipants = async (req, res) => {
  const event = await findOr404(Event, req.params.id, 'Événement');
  await event.populate(POPULATE.slice(0, 2));
  res.json({ organizers: event.organizers, participants: event.participants });
};

// POST /events/:id/participants  { userId? }  (sans userId : l'utilisateur courant rejoint l'événement)
exports.addParticipant = async (req, res) => {
  const event = await findOr404(Event, req.params.id, 'Événement');
  const userId = await assertUserExists(req.body.userId || req.userId, 'userId');
  const self = userId === req.userId;

  if (event.visibility === 'private' && !event.isOrganizer(req.userId)) {
    throw ApiError.forbidden('Événement privé : seuls les organisateurs peuvent inviter des participants');
  }
  if (!self && !event.isOrganizer(req.userId)) {
    throw ApiError.forbidden('Seul un organisateur peut ajouter une autre personne');
  }
  if (event.isParticipant(userId)) throw ApiError.conflict('Cet utilisateur participe déjà à l\'événement');

  event.participants.push(userId);
  await event.save();
  res.status(201).json({ message: 'Participant ajouté', participants: event.participants });
};

exports.removeParticipant = async (req, res) => {
  const event = await findOr404(Event, req.params.id, 'Événement');
  const { userId } = req.params;
  if (userId !== req.userId && !event.isOrganizer(req.userId)) {
    throw ApiError.forbidden('Seul un organisateur peut retirer un autre participant');
  }
  if (!includesId(event.participants, userId)) throw ApiError.notFound('Ce participant ne fait pas partie de l\'événement');
  event.participants.pull(userId);
  await event.save();
  res.status(204).end();
};

/* ---------- Organisateurs ---------- */

exports.addOrganizer = async (req, res) => {
  const event = await findOr404(Event, req.params.id, 'Événement');
  if (!event.isOrganizer(req.userId)) throw ApiError.forbidden('Seul un organisateur peut ajouter un organisateur');
  const userId = await assertUserExists(req.body.userId, 'userId');
  if (event.isOrganizer(userId)) throw ApiError.conflict('Cet utilisateur est déjà organisateur');
  event.participants.pull(userId);
  event.organizers.push(userId);
  await event.save();
  res.status(201).json({ message: 'Organisateur ajouté', organizers: event.organizers });
};

exports.removeOrganizer = async (req, res) => {
  const event = await findOr404(Event, req.params.id, 'Événement');
  if (!event.isOrganizer(req.userId)) throw ApiError.forbidden('Seul un organisateur peut retirer un organisateur');
  const { userId } = req.params;
  if (!event.isOrganizer(userId)) throw ApiError.notFound('Cet utilisateur n\'est pas organisateur');
  if (event.organizers.length === 1) throw ApiError.conflict('Un événement doit garder au moins 1 organisateur');
  event.organizers.pull(userId);
  event.participants.push(userId); // il reste participant
  await event.save();
  res.status(204).end();
};

/* ---------- Partage sur les réseaux sociaux ---------- */

// GET /events/:id/share : liens de partage (événements publics, d'un groupe public ou hors groupe)
exports.share = async (req, res) => {
  const event = await findOr404(Event, req.params.id, 'Événement');
  if (!event.isOrganizer(req.userId)) throw ApiError.forbidden('Seul un organisateur peut partager l\'événement');
  if (event.visibility !== 'public') throw ApiError.forbidden('Seuls les événements publics peuvent être partagés');
  if (event.group) {
    const group = await Group.findById(event.group).select('type').lean();
    if (group && group.type !== 'public') {
      throw ApiError.forbidden('Seuls les événements des groupes publics peuvent être partagés');
    }
  }
  const base = process.env.PUBLIC_URL || 'https://www.facebook.com';
  const url = `${base}/events/${event._id}`;
  const u = encodeURIComponent(url);
  const text = encodeURIComponent(event.name);
  res.json({
    event: { _id: event._id, name: event.name, url },
    links: {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
      x: `https://x.com/intent/post?url=${u}&text=${text}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
      whatsapp: `https://wa.me/?text=${text}%20${u}`,
      email: `mailto:?subject=${text}&body=${u}`
    }
  });
};
