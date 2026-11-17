const { Schema, model, Types } = require('mongoose');

const shoppingItemSchema = new Schema(
  {
    event: { type: Types.ObjectId, ref: 'Event', required: true },
    user: { type: Types.ObjectId, ref: 'User', required: [true, "L'utilisateur est obligatoire"] },
    name: { type: String, required: [true, 'Le nom est obligatoire'], trim: true, maxlength: 100 },
    // Version normalisée du nom pour garantir l'unicité ("Chips" == "chips ")
    normalizedName: { type: String, select: false },
    quantity: {
      type: Number,
      required: [true, 'La quantité est obligatoire'],
      min: [1, 'La quantité doit être au moins 1']
    },
    arrivalTime: { type: Date, required: [true, "L'heure d'arrivée est obligatoire"] }
  },
  { timestamps: true, versionKey: false }
);

shoppingItemSchema.pre('validate', function normalize() {
  if (this.name) this.normalizedName = this.name.trim().toLowerCase();
});

// Chaque chose apportée doit être unique par événement
shoppingItemSchema.index({ event: 1, normalizedName: 1 }, { unique: true });

shoppingItemSchema.set('toJSON', { transform: (_, ret) => { delete ret.normalizedName; return ret; } });

module.exports = model('ShoppingItem', shoppingItemSchema);
