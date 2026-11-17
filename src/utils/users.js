const mongoose = require('mongoose');
const User = require('../models/User');
const ApiError = require('./ApiError');
const { uniqIds } = require('./helpers');

/** Vérifie que tous les ids correspondent à des utilisateurs existants, renvoie les ids dédoublonnés */
async function assertUsersExist(ids = [], label = 'utilisateurs') {
  if (!Array.isArray(ids)) throw ApiError.badRequest(`Le champ "${label}" doit être un tableau d'identifiants`);
  const unique = uniqIds(ids);
  const invalid = unique.filter((id) => !mongoose.isValidObjectId(id));
  if (invalid.length) throw ApiError.badRequest(`Identifiants invalides dans "${label}"`, invalid);
  const count = await User.countDocuments({ _id: { $in: unique } });
  if (count !== unique.length) throw ApiError.badRequest(`Certains ${label} n'existent pas`);
  return unique;
}

async function assertUserExists(id, label = 'utilisateur') {
  if (!id || !mongoose.isValidObjectId(id)) throw ApiError.badRequest(`Le champ "${label}" doit être un identifiant valide`);
  if (!(await User.exists({ _id: id }))) throw ApiError.notFound(`Utilisateur ${id} introuvable`);
  return String(id);
}

const USER_PUBLIC_FIELDS = 'firstname lastname avatar';

module.exports = { assertUsersExist, assertUserExists, USER_PUBLIC_FIELDS };
