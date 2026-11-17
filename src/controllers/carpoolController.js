const Carpool = require('../models/Carpool');
const Event = require('../models/Event');
const ApiError = require('../utils/ApiError');
const { paginatedList, findOr404, pick, idEq, includesId } = require('../utils/helpers');
const { USER_PUBLIC_FIELDS } = require('../utils/users');

const FIELDS = ['departurePlace', 'departureTime', 'price', 'seats', 'maxDetourMinutes'];
const POPULATE = [
  { path: 'driver', select: USER_PUBLIC_FIELDS },
  { path: 'passengers', select: USER_PUBLIC_FIELDS }
];

async function loadEvent(req) {
  const event = await findOr404(Event, req.params.eventId, 'Événement');
  if (!event.carpoolEnabled) throw ApiError.badRequest('Le covoiturage n\'est pas activé pour cet événement');
  if (event.visibility !== 'public' && !event.isParticipant(req.userId)) {
    throw ApiError.forbidden('Covoiturage réservé aux participants de l\'événement');
  }
  return event;
}

async function loadCarpool(req, event) {
  const carpool = await findOr404(Carpool, req.params.carpoolId, 'Covoiturage');
  if (!idEq(carpool.event, event._id)) throw ApiError.notFound('Ce covoiturage n\'appartient pas à cet événement');
  return carpool;
}

// GET /events/:eventId/carpools?minSeats=2&maxPrice=10
exports.list = async (req, res) => {
  const event = await loadEvent(req);
  const filter = { event: event._id };
  if (req.query.maxPrice) filter.price = { $lte: Number(req.query.maxPrice) };
  const result = await paginatedList(Carpool, filter, req.query, { populate: POPULATE, sort: { departureTime: 1 } });
  result.data = result.data.map((c) => ({ ...c, remainingSeats: c.seats - c.passengers.length }));
  if (req.query.minSeats) result.data = result.data.filter((c) => c.remainingSeats >= Number(req.query.minSeats));
  res.json(result);
};

exports.get = async (req, res) => {
  const event = await loadEvent(req);
  const carpool = await loadCarpool(req, event);
  await carpool.populate(POPULATE);
  res.json(carpool);
};

exports.create = async (req, res) => {
  const event = await loadEvent(req);
  if (!event.isParticipant(req.userId)) throw ApiError.forbidden('Seuls les participants peuvent proposer un covoiturage');
  if (await Carpool.exists({ event: event._id, driver: req.userId })) {
    throw ApiError.conflict('Vous proposez déjà un covoiturage pour cet événement');
  }
  const carpool = await Carpool.create({ ...pick(req.body, FIELDS), event: event._id, driver: req.userId });
  res.status(201).json(carpool);
};

exports.update = async (req, res) => {
  const event = await loadEvent(req);
  const carpool = await loadCarpool(req, event);
  if (!idEq(carpool.driver, req.userId)) throw ApiError.forbidden('Seul le conducteur peut modifier ce covoiturage');
  carpool.set(pick(req.body, FIELDS));
  await carpool.save();
  res.json(carpool);
};

exports.remove = async (req, res) => {
  const event = await loadEvent(req);
  const carpool = await loadCarpool(req, event);
  if (!idEq(carpool.driver, req.userId) && !event.isOrganizer(req.userId)) {
    throw ApiError.forbidden('Seul le conducteur ou un organisateur peut supprimer ce covoiturage');
  }
  await carpool.deleteOne();
  res.status(204).end();
};

/* ---------- Passagers ---------- */

// POST /events/:eventId/carpools/:carpoolId/passengers : réserver une place
exports.join = async (req, res) => {
  const event = await loadEvent(req);
  const carpool = await loadCarpool(req, event);
  if (!event.isParticipant(req.userId)) throw ApiError.forbidden('Seuls les participants peuvent réserver une place');
  if (idEq(carpool.driver, req.userId)) throw ApiError.badRequest('Le conducteur ne peut pas être passager');
  if (includesId(carpool.passengers, req.userId)) throw ApiError.conflict('Vous avez déjà une place dans ce covoiturage');
  if (carpool.passengers.length >= carpool.seats) throw ApiError.conflict('Plus de place disponible');
  carpool.passengers.push(req.userId);
  await carpool.save();
  res.status(201).json(carpool);
};

exports.leave = async (req, res) => {
  const event = await loadEvent(req);
  const carpool = await loadCarpool(req, event);
  const { userId } = req.params;
  if (userId !== req.userId && !idEq(carpool.driver, req.userId)) {
    throw ApiError.forbidden('Seul le passager lui-même ou le conducteur peut annuler cette réservation');
  }
  if (!includesId(carpool.passengers, userId)) throw ApiError.notFound('Ce passager n\'est pas dans ce covoiturage');
  carpool.passengers.pull(userId);
  await carpool.save();
  res.status(204).end();
};
