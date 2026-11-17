const TicketType = require('../models/TicketType');
const Ticket = require('../models/Ticket');
const Event = require('../models/Event');
const ApiError = require('../utils/ApiError');
const { paginatedList, findOr404, pick, idEq } = require('../utils/helpers');

async function loadEvent(req, { organizer = false } = {}) {
  const event = await findOr404(Event, req.params.eventId, 'Événement');
  if (event.visibility !== 'public' || !event.ticketingEnabled) {
    throw ApiError.badRequest('Cet événement ne possède pas de billetterie (événement public avec ticketingEnabled=true requis)');
  }
  if (organizer && !event.isOrganizer(req.userId)) throw ApiError.forbidden('Action réservée aux organisateurs');
  return event;
}

async function loadTicketType(req, event) {
  const type = await findOr404(TicketType, req.params.ticketTypeId, 'Type de billet');
  if (!idEq(type.event, event._id)) throw ApiError.notFound('Ce type de billet n\'appartient pas à cet événement');
  return type;
}

async function loadTicket(req, event) {
  const ticket = await findOr404(Ticket, req.params.ticketId, 'Billet');
  if (!idEq(ticket.event, event._id)) throw ApiError.notFound('Ce billet n\'appartient pas à cet événement');
  return ticket;
}

/* ---------- Types de billets (gérés par les organisateurs) ---------- */

exports.listTypes = async (req, res) => {
  const event = await loadEvent(req);
  res.json(await paginatedList(TicketType, { event: event._id }, req.query, { sort: { amount: 1 } }));
};

exports.getType = async (req, res) => {
  const event = await loadEvent(req);
  res.json(await loadTicketType(req, event));
};

exports.createType = async (req, res) => {
  const event = await loadEvent(req, { organizer: true });
  const type = await TicketType.create({ ...pick(req.body, ['name', 'amount', 'quantity']), event: event._id });
  res.status(201).json(type);
};

exports.updateType = async (req, res) => {
  const event = await loadEvent(req, { organizer: true });
  const type = await loadTicketType(req, event);
  type.set(pick(req.body, ['name', 'amount', 'quantity']));
  await type.save();
  res.json(type);
};

exports.removeType = async (req, res) => {
  const event = await loadEvent(req, { organizer: true });
  const type = await loadTicketType(req, event);
  if (type.sold > 0) throw ApiError.conflict('Impossible de supprimer un type de billet dont des billets ont été vendus');
  await type.deleteOne();
  res.status(204).end();
};

/* ---------- Billets ---------- */

// Achat d'un billet : ouvert aux personnes extérieures (pas besoin de compte)
exports.buy = async (req, res) => {
  const event = await loadEvent(req);
  const type = await findOr404(TicketType, req.body.ticketType, 'Type de billet');
  if (!idEq(type.event, event._id)) throw ApiError.badRequest('Ce type de billet n\'appartient pas à cet événement');

  const buyer = req.body.buyer || {};
  const ticket = new Ticket({ event: event._id, ticketType: type._id, buyer });
  await ticket.validate();

  // 1 seul billet par personne (email) et par événement
  if (await Ticket.exists({ event: event._id, 'buyer.email': ticket.buyer.email })) {
    throw ApiError.conflict('Cette personne possède déjà un billet pour cet événement');
  }

  // Réservation atomique d'une place : impossible de dépasser la quantité limitée
  const reserved = await TicketType.findOneAndUpdate(
    { _id: type._id, remaining: { $gt: 0 } },
    { $inc: { remaining: -1, sold: 1 } },
    { returnDocument: 'after' }
  );
  if (!reserved) throw ApiError.conflict(`Plus de billets disponibles pour "${type.name}"`);

  try {
    await ticket.save();
  } catch (err) {
    await TicketType.updateOne({ _id: type._id }, { $inc: { remaining: 1, sold: -1 } });
    throw err;
  }
  await ticket.populate({ path: 'ticketType', select: 'name amount' });
  res.status(201).json(ticket);
};

// Liste des billets vendus (données personnelles => organisateurs uniquement)
exports.list = async (req, res) => {
  const event = await loadEvent(req, { organizer: true });
  const filter = { event: event._id };
  if (req.query.ticketType) filter.ticketType = req.query.ticketType;
  res.json(await paginatedList(Ticket, filter, req.query, { populate: { path: 'ticketType', select: 'name amount' } }));
};

exports.get = async (req, res) => {
  const event = await loadEvent(req, { organizer: true });
  const ticket = await loadTicket(req, event);
  await ticket.populate({ path: 'ticketType', select: 'name amount' });
  res.json(ticket);
};

// Correction des informations de l'acheteur
exports.update = async (req, res) => {
  const event = await loadEvent(req, { organizer: true });
  const ticket = await loadTicket(req, event);
  const b = req.body.buyer || {};
  ['firstname', 'lastname', 'email'].forEach((f) => { if (b[f] !== undefined) ticket.buyer[f] = b[f]; });
  if (b.address) Object.entries(b.address).forEach(([k, v]) => ticket.set(`buyer.address.${k}`, v));
  await ticket.save();
  res.json(ticket);
};

// Annulation d'un billet : la place est remise en vente
exports.remove = async (req, res) => {
  const event = await loadEvent(req, { organizer: true });
  const ticket = await loadTicket(req, event);
  await ticket.deleteOne();
  await TicketType.updateOne({ _id: ticket.ticketType }, { $inc: { remaining: 1, sold: -1 } });
  res.status(204).end();
};
