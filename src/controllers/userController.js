const User = require('../models/User');
const Event = require('../models/Event');
const Group = require('../models/Group');
const ApiError = require('../utils/ApiError');
const { hashPassword } = require('../utils/password');
const { paginatedList, findOr404, pick } = require('../utils/helpers');

const FIELDS = ['firstname', 'lastname', 'email', 'password', 'birthdate', 'phone', 'avatar', 'bio', 'address'];

function checkPassword(pwd) {
  if (typeof pwd !== 'string' || pwd.length < 8) {
    throw ApiError.badRequest('Le mot de passe doit contenir au moins 8 caractères');
  }
}

async function ensureEmailFree(email, exceptId) {
  if (!email) return;
  const existing = await User.findOne({ email: String(email).toLowerCase().trim() }).select('_id').lean();
  if (existing && String(existing._id) !== String(exceptId)) {
    throw ApiError.conflict('Un utilisateur existe déjà avec cet email');
  }
}

exports.list = async (req, res) => {
  const filter = {};
  if (req.query.search) {
    const rx = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ firstname: rx }, { lastname: rx }, { email: rx }];
  }
  res.json(await paginatedList(User, filter, req.query, { sort: { lastname: 1, firstname: 1 } }));
};

exports.get = async (req, res) => {
  res.json(await findOr404(User, req.params.id, 'Utilisateur'));
};

exports.create = async (req, res) => {
  const data = pick(req.body, FIELDS);
  checkPassword(data.password);
  await ensureEmailFree(data.email);
  data.password = hashPassword(data.password);
  const user = await User.create(data);
  res.status(201).json(user);
};

exports.update = async (req, res) => {
  const user = await findOr404(User, req.params.id, 'Utilisateur');
  if (req.userId !== String(user._id)) throw ApiError.forbidden('Vous ne pouvez modifier que votre propre compte');
  const data = pick(req.body, FIELDS);
  if (data.email) await ensureEmailFree(data.email, user._id);
  if (data.password !== undefined) {
    checkPassword(data.password);
    data.password = hashPassword(data.password);
  }
  user.set(data);
  await user.save();
  res.json(user);
};

exports.remove = async (req, res) => {
  const user = await findOr404(User, req.params.id, 'Utilisateur');
  if (req.userId !== String(user._id)) throw ApiError.forbidden('Vous ne pouvez supprimer que votre propre compte');

  // On empêche de laisser un événement / groupe sans organisateur / administrateur
  const soleOrganizer = await Event.exists({ organizers: [user._id] });
  const soleAdmin = await Group.exists({ admins: [user._id] });
  if (soleOrganizer || soleAdmin) {
    throw ApiError.conflict(
      "Impossible de supprimer ce compte : il est l'unique organisateur d'un événement ou l'unique administrateur d'un groupe"
    );
  }

  await Promise.all([
    Event.updateMany({}, { $pull: { organizers: user._id, participants: user._id } }),
    Group.updateMany({}, { $pull: { admins: user._id, members: user._id } }),
    user.deleteOne()
  ]);
  res.status(204).end();
};

// GET /users/:id/events : événements où l'utilisateur est organisateur ou participant
exports.events = async (req, res) => {
  const user = await findOr404(User, req.params.id, 'Utilisateur');
  const filter = { $or: [{ organizers: user._id }, { participants: user._id }] };
  res.json(await paginatedList(Event, filter, req.query, { sort: { startDate: 1 } }));
};

// GET /users/:id/groups : groupes dont l'utilisateur est membre ou administrateur
exports.groups = async (req, res) => {
  const user = await findOr404(User, req.params.id, 'Utilisateur');
  const filter = { $or: [{ admins: user._id }, { members: user._id }] };
  res.json(await paginatedList(Group, filter, req.query, { sort: { name: 1 } }));
};
