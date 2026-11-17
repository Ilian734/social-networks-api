const { Schema, model, Types } = require('mongoose');

// Réponse d'un participant à un sondage : 1 seule option choisie par question
const pollAnswerSchema = new Schema(
  {
    poll: { type: Types.ObjectId, ref: 'Poll', required: true },
    user: { type: Types.ObjectId, ref: 'User', required: [true, "L'utilisateur est obligatoire"] },
    answers: [
      {
        _id: false,
        question: { type: Types.ObjectId, required: true },
        option: { type: Types.ObjectId, required: true }
      }
    ]
  },
  { timestamps: true, versionKey: false }
);

// Un participant ne répond qu'une fois à un sondage (il peut ensuite modifier sa réponse)
pollAnswerSchema.index({ poll: 1, user: 1 }, { unique: true });

module.exports = model('PollAnswer', pollAnswerSchema);
