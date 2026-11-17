const express = require('express');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.use(express.json({ limit: '1mb' }));
// Express 5 : req.body est undefined quand la requête n'a pas de corps
app.use((req, res, next) => { req.body ??= {}; next(); });

app.get('/', (req, res) => {
  res.json({
    name: 'Social Networks API',
    version: '1.0.0',
    documentation: process.env.POSTMAN_DOC_URL || 'voir README.md',
    status: 'ok'
  });
});

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
