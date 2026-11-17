const Album = require('../models/Album');
const Photo = require('../models/Photo');
const Comment = require('../models/Comment');
const Event = require('../models/Event');
const ApiError = require('../utils/ApiError');
const { paginatedList, findOr404, pick, idEq } = require('../utils/helpers');
const { USER_PUBLIC_FIELDS } = require('../utils/users');
const { deleteAlbums, deletePhotos } = require('../utils/cascade');

const AUTHOR = { path: 'author', select: USER_PUBLIC_FIELDS };

function canRead(event, userId) {
  return event.visibility === 'public' || event.isParticipant(userId);
}

async function loadAlbum(req) {
  const album = await findOr404(Album, req.params.albumId, 'Album');
  const event = await findOr404(Event, album.event, 'Événement');
  if (!canRead(event, req.userId)) throw ApiError.forbidden('Album réservé aux participants de l\'événement');
  return { album, event };
}

async function loadPhoto(req, album) {
  const photo = await findOr404(Photo, req.params.photoId, 'Photo');
  if (!idEq(photo.album, album._id)) throw ApiError.notFound('Cette photo n\'appartient pas à cet album');
  return photo;
}

/* ---------- Albums ---------- */

// GET /albums?event=<id>
exports.list = async (req, res) => {
  if (!req.query.event) throw ApiError.badRequest('Précisez ?event=<id>');
  const event = await findOr404(Event, req.query.event, 'Événement');
  if (!canRead(event, req.userId)) throw ApiError.forbidden('Albums réservés aux participants de l\'événement');
  res.json(await paginatedList(Album, { event: event._id }, req.query));
};

exports.get = async (req, res) => {
  const { album } = await loadAlbum(req);
  const photosCount = await Photo.countDocuments({ album: album._id });
  res.json({ ...album.toJSON(), photosCount });
};

exports.create = async (req, res) => {
  const event = await findOr404(Event, req.body.event, 'Événement');
  if (!event.isParticipant(req.userId)) throw ApiError.forbidden('Seuls les participants de l\'événement peuvent créer un album');
  const album = await Album.create({ ...pick(req.body, ['name', 'description']), event: event._id, createdBy: req.userId });
  res.status(201).json(album);
};

exports.update = async (req, res) => {
  const { album, event } = await loadAlbum(req);
  if (!idEq(album.createdBy, req.userId) && !event.isOrganizer(req.userId)) {
    throw ApiError.forbidden('Seul le créateur de l\'album ou un organisateur peut le modifier');
  }
  album.set(pick(req.body, ['name', 'description']));
  await album.save();
  res.json(album);
};

exports.remove = async (req, res) => {
  const { album, event } = await loadAlbum(req);
  if (!idEq(album.createdBy, req.userId) && !event.isOrganizer(req.userId)) {
    throw ApiError.forbidden('Seul le créateur de l\'album ou un organisateur peut le supprimer');
  }
  await deleteAlbums({ _id: album._id });
  res.status(204).end();
};

/* ---------- Photos ---------- */

exports.listPhotos = async (req, res) => {
  const { album } = await loadAlbum(req);
  res.json(await paginatedList(Photo, { album: album._id }, req.query, { populate: AUTHOR }));
};

exports.getPhoto = async (req, res) => {
  const { album } = await loadAlbum(req);
  const photo = await loadPhoto(req, album);
  await photo.populate(AUTHOR);
  res.json(photo);
};

// Une photo est postée par 1 participant de l'événement
exports.createPhoto = async (req, res) => {
  const { album, event } = await loadAlbum(req);
  if (!event.isParticipant(req.userId)) throw ApiError.forbidden('Seuls les participants de l\'événement peuvent poster des photos');
  const photo = await Photo.create({ ...pick(req.body, ['url', 'caption']), album: album._id, author: req.userId });
  res.status(201).json(photo);
};

exports.updatePhoto = async (req, res) => {
  const { album } = await loadAlbum(req);
  const photo = await loadPhoto(req, album);
  if (!idEq(photo.author, req.userId)) throw ApiError.forbidden('Seul l\'auteur peut modifier sa photo');
  photo.set(pick(req.body, ['url', 'caption']));
  await photo.save();
  res.json(photo);
};

exports.removePhoto = async (req, res) => {
  const { album, event } = await loadAlbum(req);
  const photo = await loadPhoto(req, album);
  if (!idEq(photo.author, req.userId) && !event.isOrganizer(req.userId)) {
    throw ApiError.forbidden('Seul l\'auteur ou un organisateur peut supprimer cette photo');
  }
  await deletePhotos({ _id: photo._id });
  res.status(204).end();
};

/* ---------- Commentaires sur une photo ---------- */

async function loadComment(req, photo) {
  const comment = await findOr404(Comment, req.params.commentId, 'Commentaire');
  if (comment.targetType !== 'Photo' || !idEq(comment.target, photo._id)) {
    throw ApiError.notFound('Ce commentaire n\'appartient pas à cette photo');
  }
  return comment;
}

exports.listComments = async (req, res) => {
  const { album } = await loadAlbum(req);
  const photo = await loadPhoto(req, album);
  const filter = { targetType: 'Photo', target: photo._id };
  res.json(await paginatedList(Comment, filter, req.query, { populate: AUTHOR, sort: { createdAt: 1 } }));
};

exports.getComment = async (req, res) => {
  const { album } = await loadAlbum(req);
  const comment = await loadComment(req, await loadPhoto(req, album));
  await comment.populate(AUTHOR);
  res.json(comment);
};

// Les photos peuvent être commentées par les participants de l'événement
exports.createComment = async (req, res) => {
  const { album, event } = await loadAlbum(req);
  const photo = await loadPhoto(req, album);
  if (!event.isParticipant(req.userId)) throw ApiError.forbidden('Seuls les participants de l\'événement peuvent commenter');
  const comment = await Comment.create({ targetType: 'Photo', target: photo._id, author: req.userId, content: req.body.content });
  res.status(201).json(comment);
};

exports.updateComment = async (req, res) => {
  const { album } = await loadAlbum(req);
  const comment = await loadComment(req, await loadPhoto(req, album));
  if (!idEq(comment.author, req.userId)) throw ApiError.forbidden('Seul l\'auteur peut modifier son commentaire');
  comment.content = req.body.content;
  await comment.save();
  res.json(comment);
};

exports.removeComment = async (req, res) => {
  const { album, event } = await loadAlbum(req);
  const comment = await loadComment(req, await loadPhoto(req, album));
  if (!idEq(comment.author, req.userId) && !event.isOrganizer(req.userId)) {
    throw ApiError.forbidden('Seul l\'auteur ou un organisateur peut supprimer ce commentaire');
  }
  await comment.deleteOne();
  res.status(204).end();
};
