const Poll = require('../models/Poll');
const PollAnswer = require('../models/PollAnswer');
const Event = require('../models/Event');
const ApiError = require('../utils/ApiError');
const { paginatedList, findOr404, idEq } = require('../utils/helpers');
const { USER_PUBLIC_FIELDS } = require('../utils/users');

async function loadPoll(req) {
  const poll = await findOr404(Poll, req.params.pollId, 'Sondage');
  const event = await findOr404(Event, poll.event, 'Événement');
  if (event.visibility !== 'public' && !event.isParticipant(req.userId)) {
    throw ApiError.forbidden('Sondage réservé aux participants de l\'événement');
  }
  return { poll, event };
}

/**
 * Vérifie qu'il y a exactement 1 réponse par question et que chaque option
 * appartient bien à sa question. Renvoie les réponses normalisées.
 */
function validateAnswers(poll, answers) {
  if (!Array.isArray(answers) || answers.length === 0) {
    throw ApiError.badRequest('Le champ "answers" doit être un tableau [{ question, option }]');
  }
  const seen = new Set();
  const normalized = answers.map(({ question, option } = {}) => {
    const q = poll.questions.id(question);
    if (!q) throw ApiError.badRequest(`Question inconnue : ${question}`);
    if (seen.has(String(q._id))) throw ApiError.badRequest(`Une seule réponse possible pour la question "${q.text}"`);
    seen.add(String(q._id));
    if (!q.options.id(option)) throw ApiError.badRequest(`Réponse ${option} invalide pour la question "${q.text}"`);
    return { question: q._id, option };
  });
  const missing = poll.questions.filter((q) => !seen.has(String(q._id)));
  if (missing.length) {
    throw ApiError.badRequest('Il faut répondre à toutes les questions', missing.map((q) => ({ question: q._id, text: q.text })));
  }
  return normalized;
}

/* ---------- Sondages ---------- */

// GET /polls?event=<id>
exports.list = async (req, res) => {
  if (!req.query.event) throw ApiError.badRequest('Précisez ?event=<id>');
  const event = await findOr404(Event, req.query.event, 'Événement');
  if (event.visibility !== 'public' && !event.isParticipant(req.userId)) {
    throw ApiError.forbidden('Sondages réservés aux participants de l\'événement');
  }
  res.json(await paginatedList(Poll, { event: event._id }, req.query));
};

exports.get = async (req, res) => {
  const { poll } = await loadPoll(req);
  res.json(poll);
};

// Un sondage est créé par un organisateur de l'événement
exports.create = async (req, res) => {
  const event = await findOr404(Event, req.body.event, 'Événement');
  if (!event.isOrganizer(req.userId)) throw ApiError.forbidden('Seul un organisateur peut créer un sondage');
  const poll = await Poll.create({
    event: event._id,
    title: req.body.title,
    questions: req.body.questions,
    createdBy: req.userId
  });
  res.status(201).json(poll);
};

exports.update = async (req, res) => {
  const { poll, event } = await loadPoll(req);
  if (!event.isOrganizer(req.userId)) throw ApiError.forbidden('Seul un organisateur peut modifier un sondage');
  if (req.body.title !== undefined) poll.title = req.body.title;
  if (req.body.questions !== undefined) {
    if (await PollAnswer.exists({ poll: poll._id })) {
      throw ApiError.conflict('Impossible de modifier les questions : des participants ont déjà répondu');
    }
    poll.questions = req.body.questions;
  }
  await poll.save();
  res.json(poll);
};

exports.remove = async (req, res) => {
  const { poll, event } = await loadPoll(req);
  if (!event.isOrganizer(req.userId)) throw ApiError.forbidden('Seul un organisateur peut supprimer un sondage');
  await PollAnswer.deleteMany({ poll: poll._id });
  await poll.deleteOne();
  res.status(204).end();
};

/* ---------- Réponses ---------- */

exports.listAnswers = async (req, res) => {
  const { poll } = await loadPoll(req);
  res.json(await paginatedList(PollAnswer, { poll: poll._id }, req.query, { populate: { path: 'user', select: USER_PUBLIC_FIELDS } }));
};

exports.getAnswer = async (req, res) => {
  const { poll } = await loadPoll(req);
  const answer = await findOr404(PollAnswer, req.params.answerId, 'Réponse');
  if (!idEq(answer.poll, poll._id)) throw ApiError.notFound('Cette réponse n\'appartient pas à ce sondage');
  res.json(answer);
};

// Chaque participant répond au sondage en choisissant 1 réponse par question
exports.createAnswer = async (req, res) => {
  const { poll, event } = await loadPoll(req);
  if (!event.isParticipant(req.userId)) throw ApiError.forbidden('Seuls les participants de l\'événement peuvent répondre');
  if (await PollAnswer.exists({ poll: poll._id, user: req.userId })) {
    throw ApiError.conflict('Vous avez déjà répondu à ce sondage (utilisez PATCH pour modifier votre réponse)');
  }
  const answers = validateAnswers(poll, req.body.answers);
  const answer = await PollAnswer.create({ poll: poll._id, user: req.userId, answers });
  res.status(201).json(answer);
};

exports.updateAnswer = async (req, res) => {
  const { poll } = await loadPoll(req);
  const answer = await findOr404(PollAnswer, req.params.answerId, 'Réponse');
  if (!idEq(answer.poll, poll._id)) throw ApiError.notFound('Cette réponse n\'appartient pas à ce sondage');
  if (!idEq(answer.user, req.userId)) throw ApiError.forbidden('Vous ne pouvez modifier que votre propre réponse');
  answer.answers = validateAnswers(poll, req.body.answers);
  await answer.save();
  res.json(answer);
};

exports.removeAnswer = async (req, res) => {
  const { poll } = await loadPoll(req);
  const answer = await findOr404(PollAnswer, req.params.answerId, 'Réponse');
  if (!idEq(answer.poll, poll._id)) throw ApiError.notFound('Cette réponse n\'appartient pas à ce sondage');
  if (!idEq(answer.user, req.userId)) throw ApiError.forbidden('Vous ne pouvez supprimer que votre propre réponse');
  await answer.deleteOne();
  res.status(204).end();
};

// GET /polls/:pollId/results : nombre de votes par réponse pour chaque question
exports.results = async (req, res) => {
  const { poll } = await loadPoll(req);
  const answers = await PollAnswer.find({ poll: poll._id }).select('answers').lean();
  const counts = {};
  answers.forEach((a) => a.answers.forEach(({ option }) => { counts[option] = (counts[option] || 0) + 1; }));
  res.json({
    poll: { _id: poll._id, title: poll.title },
    totalVoters: answers.length,
    questions: poll.questions.map((q) => ({
      _id: q._id,
      text: q.text,
      options: q.options.map((o) => ({ _id: o._id, text: o.text, votes: counts[o._id] || 0 }))
    }))
  });
};
