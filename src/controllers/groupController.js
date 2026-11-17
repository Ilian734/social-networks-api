const Group = require('../models/Group');
const Event = require('../models/Event');
const Thread = require('../models/Thread');
const ApiError = require('../utils/ApiError');
const { paginatedList, findOr404, pick } = require('../utils/helpers');
const { assertUsersExist, assertUserExists, USER_PUBLIC_FIELDS } = require('../utils/users');
const { deleteThreads } = require('../utils/cascade');
const { createEvent } = require('./eventController');

const FIELDS = ['name', 'description', 'icon', 'coverPhoto', 'type', 'allowMembersToPost', 'allowMembersToCreateEvents'];

exports.list = async (req, res) => {
  const { type, member, search } = req.query;
  const filter = {};
  if (member) filter.$or = [{ members: member }, { admins: member }];
  if (type) filter.type = type;
  // Les groupes secrets ne sont visibles que par leurs membres
  if (!member) filter.type = type && type !== 'secret' ? type : { $ne: 'secret' };
  if (search) filter.name = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  res.json(await paginatedList(Group, filter, req.query, { sort: { name: 1 }, select: '-members' }));
};

exports.get = async (req, res) => {
  const group = await findOr404(Group, req.params.id, 'Groupe');
  await group.populate([
    { path: 'admins', select: USER_PUBLIC_FIELDS },
    { path: 'members', select: USER_PUBLIC_FIELDS }
  ]);
  res.json(group);
};

exports.create = async (req, res) => {
  const data = pick(req.body, FIELDS);
  data.admins = await assertUsersExist([req.userId, ...(req.body.admins || [])], 'admins');
  data.members = await assertUsersExist(req.body.members || [], 'members');
  const group = await Group.create(data);
  // Un fil de discussion est mis à disposition dans chaque groupe
  await Thread.create({ title: `Discussion - ${group.name}`, group: group._id, createdBy: req.userId });
  res.status(201).json(group);
};

exports.update = async (req, res) => {
  const group = await findOr404(Group, req.params.id, 'Groupe');
  if (!group.isAdmin(req.userId)) throw ApiError.forbidden('Seul un administrateur peut modifier le groupe');
  group.set(pick(req.body, FIELDS));
  await group.save();
  res.json(group);
};

exports.remove = async (req, res) => {
  const group = await findOr404(Group, req.params.id, 'Groupe');
  if (!group.isAdmin(req.userId)) throw ApiError.forbidden('Seul un administrateur peut supprimer le groupe');
  await Promise.all([
    deleteThreads({ group: group._id }),
    // Les événements du groupe sont conservés mais détachés du groupe
    Event.updateMany({ group: group._id }, { $set: { group: null } })
  ]);
  await group.deleteOne();
  res.status(204).end();
};

/* ---------- Membres ---------- */

exports.addMember = async (req, res) => {
  const group = await findOr404(Group, req.params.id, 'Groupe');
  const userId = await assertUserExists(req.body.userId || req.userId, 'userId');
  const self = userId === req.userId;
  // Groupe public : on peut rejoindre librement. Privé / secret : ajout par un admin uniquement
  if (group.type !== 'public' && !group.isAdmin(req.userId)) {
    throw ApiError.forbidden(`Groupe ${group.type} : seuls les administrateurs peuvent ajouter des membres`);
  }
  if (!self && !group.isAdmin(req.userId)) throw ApiError.forbidden('Seul un administrateur peut ajouter une autre personne');
  if (group.isMember(userId)) throw ApiError.conflict('Cet utilisateur est déjà membre du groupe');
  group.members.push(userId);
  await group.save();
  res.status(201).json({ message: 'Membre ajouté', members: group.members });
};

exports.removeMember = async (req, res) => {
  const group = await findOr404(Group, req.params.id, 'Groupe');
  const { userId } = req.params;
  if (userId !== req.userId && !group.isAdmin(req.userId)) {
    throw ApiError.forbidden('Seul un administrateur peut retirer un autre membre');
  }
  if (!group.isMember(userId)) throw ApiError.notFound('Cet utilisateur n\'est pas membre du groupe');
  if (group.isAdmin(userId)) {
    if (group.admins.length === 1) throw ApiError.conflict('Un groupe doit garder au moins 1 administrateur');
    group.admins.pull(userId);
  }
  group.members.pull(userId);
  await group.save();
  res.status(204).end();
};

/* ---------- Administrateurs ---------- */

exports.addAdmin = async (req, res) => {
  const group = await findOr404(Group, req.params.id, 'Groupe');
  if (!group.isAdmin(req.userId)) throw ApiError.forbidden('Seul un administrateur peut nommer un administrateur');
  const userId = await assertUserExists(req.body.userId, 'userId');
  if (group.isAdmin(userId)) throw ApiError.conflict('Cet utilisateur est déjà administrateur');
  group.admins.push(userId);
  await group.save();
  res.status(201).json({ message: 'Administrateur ajouté', admins: group.admins });
};

exports.removeAdmin = async (req, res) => {
  const group = await findOr404(Group, req.params.id, 'Groupe');
  if (!group.isAdmin(req.userId)) throw ApiError.forbidden('Seul un administrateur peut retirer un administrateur');
  const { userId } = req.params;
  if (!group.isAdmin(userId)) throw ApiError.notFound('Cet utilisateur n\'est pas administrateur');
  if (group.admins.length === 1) throw ApiError.conflict('Un groupe doit garder au moins 1 administrateur');
  group.admins.pull(userId); // il reste membre
  await group.save();
  res.status(204).end();
};

/* ---------- Événements du groupe ---------- */

exports.listEvents = async (req, res) => {
  const group = await findOr404(Group, req.params.id, 'Groupe');
  res.json(await paginatedList(Event, { group: group._id }, req.query, { sort: { startDate: 1 }, select: '-participants' }));
};

// POST /groups/:id/events : création d'un événement avec invitation de tous les membres en 1 clic
exports.createEvent = async (req, res) => {
  const group = await findOr404(Group, req.params.id, 'Groupe');
  const allowed = group.isAdmin(req.userId) || (group.allowMembersToCreateEvents && group.isMember(req.userId));
  if (!allowed) throw ApiError.forbidden('Vous n\'êtes pas autorisé à créer un événement dans ce groupe');
  const event = await createEvent(req.body, req.userId, group);
  res.status(201).json(event);
};

exports.listThreads = async (req, res) => {
  const group = await findOr404(Group, req.params.id, 'Groupe');
  res.json(await paginatedList(Thread, { group: group._id }, req.query));
};
