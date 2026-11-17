const { Schema, model, Types } = require('mongoose');

// Fil de discussion : lié à 1 groupe OU 1 événement, jamais les deux
const threadSchema = new Schema(
  {
    title: { type: String, trim: true, maxlength: 150, default: 'Discussion' },
    group: { type: Types.ObjectId, ref: 'Group', default: null },
    event: { type: Types.ObjectId, ref: 'Event', default: null },
    createdBy: { type: Types.ObjectId, ref: 'User', required: [true, 'createdBy est obligatoire'] }
  },
  { timestamps: true, versionKey: false }
);

threadSchema.index({ group: 1 });
threadSchema.index({ event: 1 });

threadSchema.pre('validate', function xor() {
  const hasGroup = !!this.group;
  const hasEvent = !!this.event;
  if (hasGroup === hasEvent) {
    this.invalidate('group', 'Un fil de discussion doit être lié à 1 groupe OU 1 événement (pas les deux, ni aucun)');
  }
});

module.exports = model('Thread', threadSchema);
