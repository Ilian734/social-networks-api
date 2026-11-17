const { Schema, model, Types } = require('mongoose');

const photoSchema = new Schema(
  {
    album: { type: Types.ObjectId, ref: 'Album', required: true },
    author: { type: Types.ObjectId, ref: 'User', required: [true, "L'auteur est obligatoire"] },
    url: { type: String, required: [true, "L'URL de la photo est obligatoire"], trim: true },
    caption: { type: String, default: '', maxlength: 500 }
  },
  { timestamps: true, versionKey: false }
);

photoSchema.index({ album: 1, createdAt: -1 });

module.exports = model('Photo', photoSchema);
