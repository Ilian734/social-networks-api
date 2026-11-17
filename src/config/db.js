const mongoose = require('mongoose');

module.exports = async function connectDB(uri) {
  try {
    await mongoose.connect(uri);
    console.log(`MongoDB connecté (${mongoose.connection.name})`);
  } catch (err) {
    console.error('Connexion MongoDB impossible :', err.message);
    process.exit(1);
  }
};
