const ShoppingItem = require('../models/ShoppingItem');
const Event = require('../models/Event');
const ApiError = require('../utils/ApiError');
const { paginatedList, findOr404, pick, idEq } = require('../utils/helpers');
const { USER_PUBLIC_FIELDS } = require('../utils/users');

const FIELDS = ['name', 'quantity', 'arrivalTime'];

async function loadEvent(req) {
  const event = await findOr404(Event, req.params.eventId, 'Événement');
  if (!event.shoppingListEnabled) throw ApiError.badRequest('La shopping list n\'est pas activée pour cet événement');
  if (event.visibility !== 'public' && !event.isParticipant(req.userId)) {
    throw ApiError.forbidden('Shopping list réservée aux participants de l\'événement');
  }
  return event;
}

async function loadItem(req, event) {
  const item = await findOr404(ShoppingItem, req.params.itemId, 'Élément');
  if (!idEq(item.event, event._id)) throw ApiError.notFound('Cet élément n\'appartient pas à cet événement');
  return item;
}

async function ensureUniqueName(event, name, exceptId) {
  if (!name) return;
  const existing = await ShoppingItem.findOne({ event: event._id, normalizedName: String(name).trim().toLowerCase() })
    .select('_id').lean();
  if (existing && !idEq(existing._id, exceptId)) {
    throw ApiError.conflict(`"${name}" est déjà apporté par un autre participant`);
  }
}

exports.list = async (req, res) => {
  const event = await loadEvent(req);
  res.json(await paginatedList(ShoppingItem, { event: event._id }, req.query, {
    populate: { path: 'user', select: USER_PUBLIC_FIELDS }, sort: { name: 1 }
  }));
};

exports.get = async (req, res) => {
  const event = await loadEvent(req);
  const item = await loadItem(req, event);
  await item.populate({ path: 'user', select: USER_PUBLIC_FIELDS });
  res.json(item);
};

exports.create = async (req, res) => {
  const event = await loadEvent(req);
  if (!event.isParticipant(req.userId)) throw ApiError.forbidden('Seuls les participants peuvent indiquer ce qu\'ils apportent');
  await ensureUniqueName(event, req.body.name);
  const item = await ShoppingItem.create({ ...pick(req.body, FIELDS), event: event._id, user: req.userId });
  res.status(201).json(item);
};

exports.update = async (req, res) => {
  const event = await loadEvent(req);
  const item = await loadItem(req, event);
  if (!idEq(item.user, req.userId)) throw ApiError.forbidden('Vous ne pouvez modifier que vos propres éléments');
  await ensureUniqueName(event, req.body.name, item._id);
  item.set(pick(req.body, FIELDS));
  await item.save();
  res.json(item);
};

exports.remove = async (req, res) => {
  const event = await loadEvent(req);
  const item = await loadItem(req, event);
  if (!idEq(item.user, req.userId) && !event.isOrganizer(req.userId)) {
    throw ApiError.forbidden('Seul l\'auteur ou un organisateur peut supprimer cet élément');
  }
  await item.deleteOne();
  res.status(204).end();
};
