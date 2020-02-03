import Hapi from '@hapi/hapi';
import Boom from '@hapi/boom';
import Joi from '@hapi/joi';

import User, { IUser } from '../models/User';
import environment from '../environment';

declare module '@hapi/hapi' {
  // tslint:disable-next-line: interface-name
  interface UserCredentials extends IUser { }
}

export default async (server: Hapi.Server) => {
  console.log('- Loading Auth Module: ');

  //
  // Plugins
  //
  console.log('   - Loading plugins');

  await server.register({
    plugin: require('@hapi/cookie')
  });

  //
  // Auth strategy
  //
  console.log('   - Loading strategy');

  server.auth.strategy('session', 'cookie', {
    cookie: {
      name: 'PASSID',
      isSecure: server.info.uri.startsWith('https'),
      password: environment.COOKIE_SECRET
    },
    validateFunc: async (_: any, session: any) => {
      const account = await User.findById(session.id);
      if (!account) {
        return { valid: false };
      }
      return { valid: true, credentials: { user: account } };
    }
  });
  server.auth.default({
    strategies: ['session'],
    mode: 'try'
  });

  //
  // Paths
  //
  console.log('   - Loading routes');

  server.route({
    method: 'POST',
    path: '/register',
    handler: async (req, h) => {
      if ((await User.findOne({ username: (req.payload as any).username })) !== null) { return Boom.conflict('Username taken'); }

      const user = new User({
        username: (req.payload as any).username,
        // passwordHash: 'invalid'
      });
      await user.setPassword((req.payload as any).password);
      await user.save();

      return user.view();
    },
    options: {
      auth: { mode: 'try' },
      validate: {
        payload: Joi.object({
          username: Joi.string().min(3).required().trim(),
          password: Joi.string().min(3).required()
        }).required()
      }
    }
  });

  server.route({
    method: 'POST',
    path: '/login',
    handler: async (req, h) => {
      // tslint:disable-next-line: no-non-null-assertion
      const user = await User.findOne({ username: (req.payload as any).username });
      if (user === null) { return Boom.unauthorized('Username not found'); }

      if (!(await user.checkPassword((req.payload as any).password))) { return Boom.unauthorized('Bad password'); }
      req.cookieAuth.set({ id: user.id });

      return user.view();
    },
    options: {
      auth: { mode: 'try' },
      validate: {
        payload: Joi.object({
          username: Joi.string().min(1).required().trim(),
          password: Joi.string().min(1).required()
        }).required()
      }
    }
  });

  server.route({
    method: 'POST',
    path: '/logout',
    handler: async (req, h) => {
      req.cookieAuth.clear();
      return { success: true };
    },
    options: {
      auth: {
        mode: 'required'
      },
      validate: {}
    }
  });

  server.route({
    method: 'GET',
    path: '/userinfo',
    handler: async (req, h) => {
      // tslint:disable-next-line: no-non-null-assertion
      const user = req.auth.credentials.user!;
      return user.view();
    },
    options: {
      auth: {
        mode: 'required'
      },
      validate: {}
    }
  });
};
