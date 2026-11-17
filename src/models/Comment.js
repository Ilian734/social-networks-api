const { Schema, model, Types } = require('mongoose');

// Commentaire générique : sur un message de fil de discussion OU sur une photo d'album
const commentSchema = new Schema(
  {
    targetType: { type: String, enum: ['Message', 'Photo'], required: true },
    target: { type: Types.ObjectId, refPath: 'targetType', required: true },
    author: { type: Types.ObjectId, ref: 'User', required: [true, "L'auteur est obligatoire"] },
    content: { type: String, required: [true, 'Le contenu est obligatoire'], trim: true, maxlength: 2000 }
  },
  { timestamps: true, versionKey: false }
);

commentSchema.index({ targetType: 1, target: 1, createdAt: 1 });

module.exports = model('Comment', commentSchema);
