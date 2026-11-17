const mongoose = require('mongoose');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');

/**
 * Authentification simplifiée (simulée) :
 * l'utilisateur qui effectue l'action est identifié par le header `X-User-Id`.
 * Dans une vraie mise en production ce middleware serait remplacé par une
 * vérification de token (JWT / OAuth) sans changer le reste du code.
 */
async function requireUser(req, res, next) {
  const id = req.get('X-User-Id');
  if (!id) return next(new ApiError(401, 'Header X-User-Id manquant : identifiez l\'utilisateur qui effectue l\'action'));
  if (!mongoose.isValidObjectId(id)) return next(new ApiError(401, 'X-User-Id invalide'));
  const user = await User.findById(id).lean();
  if (!user) return next(new ApiError(401, 'Utilisateur (X-User-Id) introuvable'));
  req.user = user;
  req.userId = String(user._id);
  return next();
}

/** Variante optionnelle : utilisée en lecture (contenus privés visibles seulement par leurs membres) */
async function optionalUser(req, res, next) {
  if (!req.get('X-User-Id')) return next();
  return requireUser(req, res, next);
}

module.exports = { requireUser, optionalUser };
