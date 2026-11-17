const { Schema, model, Types } = require('mongoose');

const messageSchema = new Schema(
  {
    thread: { type: Types.ObjectId, ref: 'Thread', required: true },
    author: { type: Types.ObjectId, ref: 'User', required: [true, "L'auteur est obligatoire"] },
    content: { type: String, required: [true, 'Le contenu est obligatoire'], trim: true, maxlength: 5000 }
  },
  { timestamps: true, versionKey: false }
);

messageSchema.index({ thread: 1, createdAt: -1 });

module.exports = model('Message', messageSchema);
