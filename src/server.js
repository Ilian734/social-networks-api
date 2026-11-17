require('dotenv').config({ quiet: true });
const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 3000;

(async () => {
  await connectDB(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/social_networks');
  app.listen(PORT, () => {
    console.log(`API démarrée sur http://localhost:${PORT}/api`);
  });
})();
