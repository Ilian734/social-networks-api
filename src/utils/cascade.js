const Thread = require('../models/Thread');
const Message = require('../models/Message');
const Comment = require('../models/Comment');
const Album = require('../models/Album');
const Photo = require('../models/Photo');
const Poll = require('../models/Poll');
const PollAnswer = require('../models/PollAnswer');
const TicketType = require('../models/TicketType');
const Ticket = require('../models/Ticket');
const ShoppingItem = require('../models/ShoppingItem');
const Carpool = require('../models/Carpool');

async function deleteMessages(messageFilter) {
  const ids = (await Message.find(messageFilter).select('_id').lean()).map((m) => m._id);
  if (ids.length) await Comment.deleteMany({ targetType: 'Message', target: { $in: ids } });
  await Message.deleteMany(messageFilter);
}

async function deleteThreads(threadFilter) {
  const ids = (await Thread.find(threadFilter).select('_id').lean()).map((t) => t._id);
  if (ids.length) await deleteMessages({ thread: { $in: ids } });
  await Thread.deleteMany(threadFilter);
}

async function deletePhotos(photoFilter) {
  const ids = (await Photo.find(photoFilter).select('_id').lean()).map((p) => p._id);
  if (ids.length) await Comment.deleteMany({ targetType: 'Photo', target: { $in: ids } });
  await Photo.deleteMany(photoFilter);
}

async function deleteAlbums(albumFilter) {
  const ids = (await Album.find(albumFilter).select('_id').lean()).map((a) => a._id);
  if (ids.length) await deletePhotos({ album: { $in: ids } });
  await Album.deleteMany(albumFilter);
}

/** Supprime toutes les données rattachées à un événement */
async function deleteEventData(eventId) {
  const pollIds = (await Poll.find({ event: eventId }).select('_id').lean()).map((p) => p._id);
  await Promise.all([
    deleteThreads({ event: eventId }),
    deleteAlbums({ event: eventId }),
    PollAnswer.deleteMany({ poll: { $in: pollIds } }),
    Poll.deleteMany({ event: eventId }),
    Ticket.deleteMany({ event: eventId }),
    TicketType.deleteMany({ event: eventId }),
    ShoppingItem.deleteMany({ event: eventId }),
    Carpool.deleteMany({ event: eventId })
  ]);
}

module.exports = { deleteMessages, deleteThreads, deletePhotos, deleteAlbums, deleteEventData };
