const { Schema, model, Types } = require('mongoose');

const ticketSchema = new Schema(
  {
    event: { type: Types.ObjectId, ref: 'Event', required: true },
    ticketType: { type: Types.ObjectId, ref: 'TicketType', required: [true, 'Le type de billet est obligatoire'] },
    buyer: {
      firstname: { type: String, required: [true, 'Le prénom est obligatoire'], trim: true },
      lastname: { type: String, required: [true, 'Le nom est obligatoire'], trim: true },
      email: {
        type: String,
        required: [true, "L'email est obligatoire"],
        lowercase: true,
        trim: true,
        match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email invalide']
      },
      address: {
        street: { type: String, required: [true, 'La rue est obligatoire'] },
        zipcode: { type: String, required: [true, 'Le code postal est obligatoire'] },
        city: { type: String, required: [true, 'La ville est obligatoire'] },
        country: { type: String, required: [true, 'Le pays est obligatoire'] }
      }
    },
    purchaseDate: { type: Date, default: Date.now }
  },
  { timestamps: true, versionKey: false }
);

// Une personne extérieure ne peut obtenir qu'1 seul billet par événement
ticketSchema.index({ event: 1, 'buyer.email': 1 }, { unique: true });

module.exports = model('Ticket', ticketSchema);
