require('dotenv').config();
import Hapi from '@hapi/hapi';

import mongoose, { mongo } from 'mongoose';

import environment from './environment';
import authModule from './modules/auth.module';
import mangaModule from './modules/manga.module';

const server = new Hapi.Server({
  port: environment.PORT,
  uri: environment.BASE_URL,
  // Nginx
  compression: false,
  debug: {
    log: environment.DEBUG ? ['error', 'database', 'read'] : false,
    request: environment.DEBUG ? ['error', 'database', 'read'] : false
  }
});

//
// Handlers
//

const start = async () => {
  console.log(`Registering modules: `);
  await authModule(server);
  await mangaModule(server);

  console.log(`Connecting to DB`);
  await mongoose.connect(environment.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  console.log(`Starting server: `);
  await server.start();
  console.log(` - Listening on port ${server.settings.port}`);
  console.log(` - Connect on ${environment.BASE_URL}`);

  console.log(`Server started`);
  console.log(`Ctrl-C to exit`);
};
const stop = async () => {
  console.log(`Stopping server...`);

  await server.stop();
  await mongoose.disconnect();

  process.exit();
};

//
// Environment
//

process.on('unhandledRejection', (err) => {
  console.log(err);
  stop();
});

process.on('SIGINT', () => {
  console.log('Caught interrupt signal');
  stop();
});

start();
