const { Schema, model, Types } = require('mongoose');

const eventSchema = new Schema(
  {
    // Étape 1 : configuration de l'événement
    name: { type: String, required: [true, 'Le nom est obligatoire'], trim: true, maxlength: 150 },
    description: { type: String, default: '', maxlength: 10000 },
    startDate: { type: Date, required: [true, 'La date de début est obligatoire'] },
    endDate: { type: Date, required: [true, 'La date de fin est obligatoire'] },
    location: { type: String, required: [true, 'Le lieu est obligatoire'], trim: true },
    coverPhoto: { type: String, trim: true }, // URL
    visibility: {
      type: String,
      enum: { values: ['public', 'private'], message: 'La visibilité doit être public ou private' },
      default: 'public'
    },
    organizers: {
      type: [{ type: Types.ObjectId, ref: 'User' }],
      validate: [(v) => v.length >= 1, 'Un événement doit avoir au moins 1 organisateur']
    },
    participants: [{ type: Types.ObjectId, ref: 'User' }],

    // Rattachement optionnel à un groupe
    group: { type: Types.ObjectId, ref: 'Group', default: null },

    // Options
    ticketingEnabled: { type: Boolean, default: false },
    shoppingListEnabled: { type: Boolean, default: false },
    carpoolEnabled: { type: Boolean, default: false }
  },
  { timestamps: true, versionKey: false }
);

eventSchema.index({ startDate: 1 });
eventSchema.index({ group: 1 });
eventSchema.index({ participants: 1 });
eventSchema.index({ organizers: 1 });

eventSchema.pre('validate', function checkEvent() {
  if (this.startDate && this.endDate && this.endDate <= this.startDate) {
    this.invalidate('endDate', 'La date de fin doit être postérieure à la date de début');
  }
  // La billetterie n'existe que pour les événements publics
  if (this.ticketingEnabled && this.visibility !== 'public') {
    this.invalidate('ticketingEnabled', 'La billetterie est réservée aux événements publics');
  }
});

eventSchema.methods.isOrganizer = function isOrganizer(userId) {
  return this.organizers.some((o) => String(o._id ?? o) === String(userId));
};
eventSchema.methods.isParticipant = function isParticipant(userId) {
  return this.participants.some((p) => String(p._id ?? p) === String(userId)) || this.isOrganizer(userId);
};

module.exports = model('Event', eventSchema);
