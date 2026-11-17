const { Schema, model } = require('mongoose');

const userSchema = new Schema(
  {
    firstname: { type: String, required: [true, 'Le prénom est obligatoire'], trim: true, maxlength: 50 },
    lastname: { type: String, required: [true, 'Le nom est obligatoire'], trim: true, maxlength: 50 },
    email: {
      type: String,
      required: [true, "L'email est obligatoire"],
      unique: true, // 2 utilisateurs ne peuvent pas avoir le même email
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email invalide']
    },
    password: { type: String, required: [true, 'Le mot de passe est obligatoire'], select: false },
    birthdate: { type: Date },
    phone: { type: String, trim: true },
    avatar: { type: String, trim: true }, // URL
    bio: { type: String, maxlength: 500 },
    address: {
      street: String,
      city: String,
      zipcode: String,
      country: String
    }
  },
  { timestamps: true, versionKey: false }
);

userSchema.set('toJSON', {
  transform: (_, ret) => {
    delete ret.password;
    return ret;
  }
});

module.exports = model('User', userSchema);
