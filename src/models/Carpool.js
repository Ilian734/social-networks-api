const { Schema, model, Types } = require('mongoose');

const carpoolSchema = new Schema(
  {
    event: { type: Types.ObjectId, ref: 'Event', required: true },
    driver: { type: Types.ObjectId, ref: 'User', required: [true, 'Le conducteur est obligatoire'] },
    departurePlace: { type: String, required: [true, 'Le lieu de départ est obligatoire'], trim: true },
    departureTime: { type: Date, required: [true, "L'heure de départ est obligatoire"] },
    price: { type: Number, required: [true, 'Le prix est obligatoire'], min: [0, 'Le prix doit être positif'] },
    seats: {
      type: Number,
      required: [true, 'Le nombre de places est obligatoire'],
      min: [1, 'Il faut au moins 1 place disponible'],
      validate: [Number.isInteger, 'Le nombre de places doit être un entier']
    },
    // Temps maximum d'écart en minutes (ex : 30 => trajet de 2h30 peut durer 3h max)
    maxDetourMinutes: { type: Number, required: [true, "Le temps maximum d'écart est obligatoire"], min: 0 },
    passengers: [{ type: Types.ObjectId, ref: 'User' }]
  },
  { timestamps: true, versionKey: false, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

carpoolSchema.index({ event: 1 });

carpoolSchema.virtual('remainingSeats').get(function remainingSeats() {
  return Math.max(this.seats - (this.passengers?.length || 0), 0);
});

carpoolSchema.pre('validate', function checkSeats() {
  if (this.passengers && this.passengers.length > this.seats) {
    this.invalidate('seats', 'Le nombre de places ne peut pas être inférieur au nombre de passagers');
  }
});

module.exports = model('Carpool', carpoolSchema);
