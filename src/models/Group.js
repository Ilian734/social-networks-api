const { Schema, model, Types } = require('mongoose');

const groupSchema = new Schema(
  {
    name: { type: String, required: [true, 'Le nom est obligatoire'], trim: true, maxlength: 100 },
    description: { type: String, default: '', maxlength: 5000 },
    icon: { type: String, trim: true }, // URL
    coverPhoto: { type: String, trim: true }, // URL
    type: {
      type: String,
      enum: { values: ['public', 'private', 'secret'], message: 'Le type doit être public, private ou secret' },
      default: 'public'
    },
    allowMembersToPost: { type: Boolean, default: true },
    allowMembersToCreateEvents: { type: Boolean, default: false },
    admins: {
      type: [{ type: Types.ObjectId, ref: 'User' }],
      validate: [(v) => v.length >= 1, 'Un groupe doit avoir au moins 1 administrateur']
    },
    members: [{ type: Types.ObjectId, ref: 'User' }]
  },
  { timestamps: true, versionKey: false }
);

groupSchema.index({ members: 1 });
groupSchema.index({ admins: 1 });

/** Un admin est aussi membre : on garantit qu'il est dans la liste des membres */
groupSchema.pre('validate', function syncMembers() {
  const ids = new Set(this.members.map(String));
  this.admins.forEach((a) => { if (!ids.has(String(a))) this.members.push(a); });
});

groupSchema.methods.isAdmin = function isAdmin(userId) {
  return this.admins.some((a) => String(a._id ?? a) === String(userId));
};
groupSchema.methods.isMember = function isMember(userId) {
  return this.members.some((m) => String(m._id ?? m) === String(userId)) || this.isAdmin(userId);
};

module.exports = model('Group', groupSchema);
