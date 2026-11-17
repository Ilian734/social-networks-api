const { Schema, model, Types } = require('mongoose');

const albumSchema = new Schema(
  {
    event: { type: Types.ObjectId, ref: 'Event', required: [true, "L'événement est obligatoire"] },
    name: { type: String, required: [true, 'Le nom est obligatoire'], trim: true, maxlength: 100 },
    description: { type: String, default: '', maxlength: 2000 },
    createdBy: { type: Types.ObjectId, ref: 'User', required: [true, 'createdBy est obligatoire'] }
  },
  { timestamps: true, versionKey: false }
);

albumSchema.index({ event: 1 });

module.exports = model('Album', albumSchema);
