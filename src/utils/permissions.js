const Group = require('../models/Group');
const Event = require('../models/Event');
const ApiError = require('./ApiError');

/**
 * Charge le contexte (groupe ou événement) d'un fil de discussion et calcule
 * les droits de l'utilisateur dessus.
 */
async function threadContext(thread, userId) {
  if (thread.group) {
    const group = await Group.findById(thread.group);
    if (!group) throw ApiError.notFound('Groupe du fil de discussion introuvable');
    const isManager = group.isAdmin(userId);
    const isMember = group.isMember(userId);
    return {
      kind: 'group',
      group,
      isManager,
      isMember,
      canPost: isManager || (isMember && group.allowMembersToPost),
      canRead: group.type === 'public' || isMember
    };
  }
  const event = await Event.findById(thread.event);
  if (!event) throw ApiError.notFound('Événement du fil de discussion introuvable');
  const isManager = event.isOrganizer(userId);
  const isMember = event.isParticipant(userId);
  return {
    kind: 'event',
    event,
    isManager,
    isMember,
    canPost: isMember,
    canRead: event.visibility === 'public' || isMember
  };
}

/** Charge l'événement et vérifie que l'utilisateur y participe (organisateur inclus) */
async function requireParticipant(event, userId, message = 'Vous devez participer à l\'événement') {
  if (!event.isParticipant(userId)) throw ApiError.forbidden(message);
}

module.exports = { threadContext, requireParticipant };
