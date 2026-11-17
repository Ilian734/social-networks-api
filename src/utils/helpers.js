const mongoose = require('mongoose');
const ApiError = require('./ApiError');

/** Pagination : ?page=1&limit=20 (limit max 100) */
function paginate(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
}

/** Renvoie une liste paginée { data, pagination } */
async function paginatedList(Model, filter, query, { populate, sort = { createdAt: -1 }, select } = {}) {
  const { page, limit, skip } = paginate(query);
  let q = Model.find(filter).sort(sort).skip(skip).limit(limit);
  if (select) q = q.select(select);
  if (populate) q = q.populate(populate);
  const [data, total] = await Promise.all([q.lean(), Model.countDocuments(filter)]);
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } };
}

/** Récupère un document ou lève une 404 */
async function findOr404(Model, id, label = 'Ressource') {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest(`Identifiant invalide : ${id}`);
  const doc = await Model.findById(id);
  if (!doc) throw ApiError.notFound(`${label} introuvable`);
  return doc;
}

/** Garde uniquement les champs autorisés du body */
function pick(obj = {}, fields) {
  return fields.reduce((acc, f) => {
    if (obj[f] !== undefined) acc[f] = obj[f];
    return acc;
  }, {});
}

const idEq = (a, b) => String(a?._id ?? a) === String(b?._id ?? b);
const includesId = (arr = [], id) => arr.some((x) => idEq(x, id));
const uniqIds = (arr = []) => [...new Set(arr.map(String))];

module.exports = { paginate, paginatedList, findOr404, pick, idEq, includesId, uniqIds };
