const { Schema, model, Types } = require('mongoose');

const optionSchema = new Schema({
  text: { type: String, required: [true, "Le texte de la réponse est obligatoire"], trim: true }
});

const questionSchema = new Schema({
  text: { type: String, required: [true, 'Le texte de la question est obligatoire'], trim: true },
  options: {
    type: [optionSchema],
    validate: [(v) => v.length >= 2, 'Une question doit proposer au moins 2 réponses possibles']
  }
});

const pollSchema = new Schema(
  {
    event: { type: Types.ObjectId, ref: 'Event', required: [true, "L'événement est obligatoire"] },
    title: { type: String, required: [true, 'Le titre est obligatoire'], trim: true, maxlength: 150 },
    createdBy: { type: Types.ObjectId, ref: 'User', required: [true, 'createdBy est obligatoire'] },
    questions: {
      type: [questionSchema],
      validate: [(v) => v.length >= 1, 'Un sondage doit comporter au moins 1 question']
    }
  },
  { timestamps: true, versionKey: false }
);

pollSchema.index({ event: 1 });

module.exports = model('Poll', pollSchema);
