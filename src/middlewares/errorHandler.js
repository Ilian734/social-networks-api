const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');

function notFound(req, res) {
  res.status(404).json({ error: { status: 404, message: `Route introuvable : ${req.method} ${req.originalUrl}` } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = 500;
  let message = 'Erreur interne du serveur';
  let details;

  if (err instanceof ApiError) {
    ({ status, message, details } = err);
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = 'Données invalides';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Valeur invalide pour "${err.path}" : ${JSON.stringify(err.value)}`;
  } else if (err.code === 11000) {
    status = 409;
    const fields = Object.keys(err.keyValue || err.keyPattern || {});
    message = `Doublon : une ressource existe déjà avec ${fields.join(', ') || 'ces valeurs'}`;
    details = err.keyValue;
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'JSON invalide dans le corps de la requête';
  } else {
    console.error(err);
  }

  res.status(status).json({ error: { status, message, ...(details ? { details } : {}) } });
}

module.exports = { notFound, errorHandler };
