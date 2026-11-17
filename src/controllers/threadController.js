const mongoose = require('mongoose');
const Thread = require('../models/Thread');
const Message = require('../models/Message');
const Comment = require('../models/Comment');
const Group = require('../models/Group');
const Event = require('../models/Event');
const ApiError = require('../utils/ApiError');
const { paginatedList, findOr404, idEq } = require('../utils/helpers');
const { USER_PUBLIC_FIELDS } = require('../utils/users');
const { threadContext } = require('../utils/permissions');
const { deleteThreads, deleteMessages } = require('../utils/cascade');

const AUTHOR = { path: 'author', select: USER_PUBLIC_FIELDS };

async function loadThread(req, { write = false } = {}) {
  const thread = await findOr404(Thread, req.params.threadId, 'Fil de discussion');
  const ctx = await threadContext(thread, req.userId);
  if (!ctx.canRead) throw ApiError.forbidden('Ce fil de discussion est réservé aux membres');
  if (write && !ctx.isMember) throw ApiError.forbidden('Vous devez être membre du groupe / participant de l\'événement');
  return { thread, ctx };
}

async function loadMessage(req, thread) {
  const message = await findOr404(Message, req.params.messageId, 'Message');
  if (!idEq(message.thread, thread._id)) throw ApiError.notFound('Ce message n\'appartient pas à ce fil');
  return message;
}

/* ---------- Fils de discussion ---------- */

// GET /threads?group=...  ou  ?event=...
exports.list = async (req, res) => {
  const { group, event } = req.query;
  if (!group && !event) throw ApiError.badRequest('Précisez ?group=<id> ou ?event=<id>');
  const filter = group ? { group } : { event };
  const parent = group ? await findOr404(Group, group, 'Groupe') : await findOr404(Event, event, 'Événement');
  const fake = group ? { group: parent._id } : { event: parent._id };
  const ctx = await threadContext(fake, req.userId);
  if (!ctx.canRead) throw ApiError.forbidden('Ces fils de discussion sont réservés aux membres');
  res.json(await paginatedList(Thread, filter, req.query));
};

exports.get = async (req, res) => {
  const { thread } = await loadThread(req);
  res.json(thread);
};

exports.create = async (req, res) => {
  const { group, event, title } = req.body;
  if ((!group && !event) || (group && event)) {
    throw ApiError.badRequest('Un fil de discussion doit être lié à 1 groupe OU 1 événement (pas les deux)');
  }
  const id = group || event;
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Identifiant de groupe / événement invalide');
  const draft = new Thread({ title, group: group || null, event: event || null, createdBy: req.userId });
  const ctx = await threadContext(draft, req.userId);
  if (!ctx.canPost) throw ApiError.forbidden('Vous n\'êtes pas autorisé à créer un fil de discussion ici');
  await draft.save();
  res.status(201).json(draft);
};

exports.update = async (req, res) => {
  const { thread, ctx } = await loadThread(req);
  if (!idEq(thread.createdBy, req.userId) && !ctx.isManager) {
    throw ApiError.forbidden('Seul le créateur ou un administrateur / organisateur peut modifier ce fil');
  }
  if (req.body.title !== undefined) thread.title = req.body.title;
  await thread.save();
  res.json(thread);
};

exports.remove = async (req, res) => {
  const { thread, ctx } = await loadThread(req);
  if (!idEq(thread.createdBy, req.userId) && !ctx.isManager) {
    throw ApiError.forbidden('Seul le créateur ou un administrateur / organisateur peut supprimer ce fil');
  }
  await deleteThreads({ _id: thread._id });
  res.status(204).end();
};

/* ---------- Messages ---------- */

exports.listMessages = async (req, res) => {
  const { thread } = await loadThread(req);
  res.json(await paginatedList(Message, { thread: thread._id }, req.query, { populate: AUTHOR }));
};

exports.getMessage = async (req, res) => {
  const { thread } = await loadThread(req);
  const message = await loadMessage(req, thread);
  await message.populate(AUTHOR);
  res.json(message);
};

exports.createMessage = async (req, res) => {
  const { thread, ctx } = await loadThread(req);
  if (!ctx.canPost) throw ApiError.forbidden('Vous n\'êtes pas autorisé à publier dans ce fil de discussion');
  const message = await Message.create({ thread: thread._id, author: req.userId, content: req.body.content });
  res.status(201).json(message);
};

exports.updateMessage = async (req, res) => {
  const { thread } = await loadThread(req);
  const message = await loadMessage(req, thread);
  if (!idEq(message.author, req.userId)) throw ApiError.forbidden('Seul l\'auteur peut modifier son message');
  message.content = req.body.content;
  await message.save();
  res.json(message);
};

exports.removeMessage = async (req, res) => {
  const { thread, ctx } = await loadThread(req);
  const message = await loadMessage(req, thread);
  if (!idEq(message.author, req.userId) && !ctx.isManager) {
    throw ApiError.forbidden('Seul l\'auteur ou un administrateur / organisateur peut supprimer ce message');
  }
  await deleteMessages({ _id: message._id });
  res.status(204).end();
};

/* ---------- Commentaires sur un message ---------- */

async function loadComment(req, message) {
  const comment = await findOr404(Comment, req.params.commentId, 'Commentaire');
  if (comment.targetType !== 'Message' || !idEq(comment.target, message._id)) {
    throw ApiError.notFound('Ce commentaire n\'appartient pas à ce message');
  }
  return comment;
}

exports.listComments = async (req, res) => {
  const { thread } = await loadThread(req);
  const message = await loadMessage(req, thread);
  const filter = { targetType: 'Message', target: message._id };
  res.json(await paginatedList(Comment, filter, req.query, { populate: AUTHOR, sort: { createdAt: 1 } }));
};

exports.getComment = async (req, res) => {
  const { thread } = await loadThread(req);
  const comment = await loadComment(req, await loadMessage(req, thread));
  await comment.populate(AUTHOR);
  res.json(comment);
};

// Chaque membre / participant peut commenter un message
exports.createComment = async (req, res) => {
  const { thread } = await loadThread(req, { write: true });
  const message = await loadMessage(req, thread);
  const comment = await Comment.create({
    targetType: 'Message', target: message._id, author: req.userId, content: req.body.content
  });
  res.status(201).json(comment);
};

exports.updateComment = async (req, res) => {
  const { thread } = await loadThread(req);
  const comment = await loadComment(req, await loadMessage(req, thread));
  if (!idEq(comment.author, req.userId)) throw ApiError.forbidden('Seul l\'auteur peut modifier son commentaire');
  comment.content = req.body.content;
  await comment.save();
  res.json(comment);
};

exports.removeComment = async (req, res) => {
  const { thread, ctx } = await loadThread(req);
  const comment = await loadComment(req, await loadMessage(req, thread));
  if (!idEq(comment.author, req.userId) && !ctx.isManager) {
    throw ApiError.forbidden('Seul l\'auteur ou un administrateur / organisateur peut supprimer ce commentaire');
  }
  await comment.deleteOne();
  res.status(204).end();
};
