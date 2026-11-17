const { Schema, model, Types } = require('mongoose');

const ticketTypeSchema = new Schema(
  {
    event: { type: Types.ObjectId, ref: 'Event', required: true },
    name: { type: String, required: [true, 'Le nom est obligatoire'], trim: true, maxlength: 100 },
    amount: { type: Number, required: [true, 'Le montant est obligatoire'], min: [0, 'Le montant doit être positif'] },
    quantity: {
      type: Number,
      required: [true, 'La quantité est obligatoire'],
      min: [1, 'La quantité doit être au moins 1'],
      validate: [Number.isInteger, 'La quantité doit être un entier']
    },
    sold: { type: Number, default: 0, min: 0 },
    // Stocké (et non calculé) pour permettre une décrémentation atomique lors de l'achat
    remaining: { type: Number, min: 0 }
  },
  { timestamps: true, versionKey: false }
);

ticketTypeSchema.index({ event: 1, name: 1 }, { unique: true });

ticketTypeSchema.pre('validate', function syncRemaining() {
  if (this.quantity < this.sold) {
    this.invalidate('quantity', `La quantité ne peut pas être inférieure au nombre de billets déjà vendus (${this.sold})`);
  }
  this.remaining = Math.max(this.quantity - this.sold, 0);
});

module.exports = model('TicketType', ticketTypeSchema);
