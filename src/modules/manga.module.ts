import Hapi from '@hapi/hapi';
import Boom from '@hapi/boom';
import Joi from '@hapi/joi';
import Cryptiles from '@hapi/cryptiles';

import fs from 'fs';
import { promisify } from 'util';

import Manga, { IManga } from '../models/Manga';
import environment from '../environment';
import Favorite from '../models/Favorite';


//
// Utils
//
const JoiID = Joi.string().hex().length(24);

const toArray = <T>(v: T | T[]) => Array.isArray(v) ? v : [v];
const arraysEqual = <T>(a1: T[], a2: T[]) => {
  if (!Array.isArray(a1) || !Array.isArray(a2) || a1.length !== a2.length)
    return false;

  var arr1 = a1.concat().sort();
  var arr2 = a2.concat().sort();

  for (var i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i])
      return false;
  }

  return true;
};
const hexToBase64 = (hex: string) =>
  Buffer.from(hex
    .replace(/\-/gm, ''),
    'hex'
  )
    .toString('base64')
    .replace(/\//gm, '_')
    .replace(/\+/gm, '-')
    .replace(/\=/gm, '')
  ;

//
// Register
//

export default async (server: Hapi.Server) => {
  console.log(' - Loading Auth Module: ');

  //
  // Paths
  //
  console.log('   - Loading routes');

  server.route({
    method: 'GET',
    path: '/manga',
    handler: async (req, h) => {
      if (req.query.favorite) {
        if (!req.auth.isAuthenticated) { return Boom.unauthorized('You must be logged in'); }
        return (await Favorite.find({
          // tslint:disable-next-line: no-non-null-assertion
          userId: req.auth.credentials!.user!.id
        })
          .limit(+req.query.limit)
          .skip(+req.query.skip)
          .populate('mangaId')
        ).map((favorites) => (favorites.mangaId as IManga).view());
      }

      let query: any = {};
      if (req.query.created) {
        if (!req.auth.isAuthenticated) { return Boom.unauthorized('You must be logged in'); }
        // tslint:disable-next-line: no-non-null-assertion
        query.ownerID = req.auth.credentials!.user!.id;
      }
      return (await Manga.find(query).limit(+req.query.limit).skip(+req.query.skip)).map((manga) => manga.view());
    },
    options: {
      validate: {
        query: Joi.object({
          created: Joi.boolean().truthy(''),
          favorite: Joi.boolean().truthy(''),
          limit: Joi.number().integer().default(0),
          skip: Joi.number().integer().default(0)
        })
      }
    }
  });

  server.route({
    method: 'GET',
    path: '/manga/{id}',
    handler: async (req, h) => {
      // tslint:disable-next-line: no-non-null-assertion
      const manga = await Manga.findById(req.params!.id);
      if (manga === null) { return Boom.notFound('Manga not found'); }

      if (req.auth.isAuthenticated) {
        return {
          ...manga.view(), favorite: await Favorite.exists({
            // tslint:disable-next-line: no-non-null-assertion
            userId: req.auth.credentials!.user!.id,
            mangaId: manga.id
          })
        };
      } else {
        return manga.view();
      }
    },
    options: {
      auth: {
        mode: 'optional'
      },
      validate: {
        params: Joi.object({
          id: JoiID.required()
        }).required(),
      }
    }
  });

  server.route({
    method: 'POST',
    path: '/manga/{id}/favorite',
    handler: async (req, h) => {
      // tslint:disable-next-line: no-non-null-assertion
      const manga = await Manga.findById(req.params!.id);
      if (manga === null) { return Boom.notFound('Manga not found'); }

      if ((req.payload as any).favorite) {
        await Favorite.findOneAndUpdate({
          // tslint:disable-next-line: no-non-null-assertion
          userId: req.auth.credentials!.user!.id,
          mangaId: manga.id
        }, {
          // tslint:disable-next-line: no-non-null-assertion
          userId: req.auth.credentials!.user!.id,
          mangaId: manga.id
        }, { upsert: true });
        return true;
      } else {
        await Favorite.findOneAndDelete({
          // tslint:disable-next-line: no-non-null-assertion
          userId: req.auth.credentials!.user!.id,
          mangaId: manga.id
        });

        return false;
      }
    },
    options: {
      auth: {
        mode: 'required'
      },
      validate: {
        payload: Joi.object({
          favorite: Joi.boolean().required()
        }).required(),
        params: Joi.object({
          id: JoiID.required()
        }).required(),
      }
    }
  });

  server.route({
    method: 'POST',
    path: '/manga',
    handler: async (req, res) => {
      // TODO must be authenticated
      const data: any = req.payload; // TODO manga type

      const manga = await (new Manga({
        title: data.title,
        // tslint:disable-next-line: no-non-null-assertion
        ownerID: req.auth.credentials.user!.id
      })).save();

      return manga.view();
    },
    options: {
      auth: {
        mode: 'required'
      },
      validate: {
        payload: Joi.object({
          title: Joi.string().trim().required(),
        }).required()
      }
    }
  });

  server.route({
    method: 'POST',
    path: '/manga/{id}/upload',
    handler: async (req, h) => {
      const files = toArray((req.payload as any).file)
        .sort((a, b) => a.hapi.filename.localeCompare(b.hapi.filename));

      const exts: string[] = new Array(files.length);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Get file extension
        const ext = file.hapi.filename.substr(file.hapi.filename.lastIndexOf('.') + 1);
        if (ext !== 'png' && ext !== 'jpg' && ext !== 'jpeg' && ext !== 'gif') {
          return Boom.badData('Invalid file format' + ext);
        }
        exts[i] = ext;
      }

      // Get manga
      // tslint:disable-next-line: no-non-null-assertion
      const manga = await Manga.findById(req.params!.id);
      if (manga === null) { return Boom.notFound('Manga not found'); }

      // Is owner
      // tslint:disable-next-line: no-non-null-assertion
      if (manga.ownerID != req.auth.credentials.user!.id) { return Boom.forbidden('You do not own this manga'); }

      // Save file
      if (manga.pageURLs === undefined) { manga.pageURLs = []; }

      const container = environment.MANGA_DIR + '/' + manga?.id;
      await promisify(fs.mkdir)(container, { recursive: true });

      manga.pageURLs = manga.pageURLs.concat(await Promise.all(files.map(async (file, i) => {
        const ext = exts[i];

        const mangaPage = Cryptiles.randomString(22) + '.' + ext;
        await new Promise((res, rej) => {
          const write = fs.createWriteStream(container + '/' + mangaPage);
          write.on('error', rej);
          file.on('error', rej);

          file.pipe(write);
          file.on('end', res);
        });
        // await promisify(fs.copyFile)(file.path, container + '/' + mangaPage);
        return mangaPage;
      })));
      await manga.save();

      return manga.view();
    },
    options: {
      auth: {
        mode: 'required'
      },

      payload: {
        maxBytes: 1024 * 1024 * 100,
        multipart: {
          output: 'stream'
        }
      },

      validate: {
        params: Joi.object({
          id: JoiID.required()
        }).required(),
      }
    }
  });

  server.route({
    method: 'POST',
    path: '/manga/{id}',
    handler: async (req, h) => {
      const input: any = req.payload;

      // tslint:disable-next-line: no-non-null-assertion
      const manga = await Manga.findById(req.params!.id);
      if (manga === null) { return Boom.notFound('Manga not found'); }

      // Is owner
      // tslint:disable-next-line: no-non-null-assertion
      if (manga.ownerID != req.auth.credentials.user!.id) { return Boom.forbidden('You do not own this manga'); }

      let change = false;
      {
        if (input.title) { manga.title = input.title; change = true; }
        if (input.pageURLs) {
          if (!arraysEqual(input.pageURLs, manga.pageURLs)) {
            return Boom.badData('pageURLs contents do not match');
          }
          manga.pageURLs = input.pageURLs;
          change = true;
        }
      }
      if (change) { await manga.save(); }

      return manga.view();
    },
    options: {
      auth: {
        mode: 'required'
      },

      validate: {
        params: Joi.object({
          id: JoiID.required()
        }).required(),
        payload: Joi.object({
          title: Joi.string(),
          pageURLs: Joi.array().items(Joi.string().required()),
        }).required()
      }
    }
  });

  server.route({
    method: 'DELETE',
    path: '/manga/{id}',
    handler: async (req, h) => {
      // tslint:disable-next-line: no-non-null-assertion
      const manga = await Manga.findById(req.params!.id);
      if (manga === null) { return Boom.notFound('Manga not found'); }

      // Is owner
      // tslint:disable-next-line: no-non-null-assertion
      if (manga.ownerID != req.auth.credentials.user!.id) { return Boom.forbidden('You do not own this manga'); }

      await manga.remove();
      await promisify(fs.rmdir)(environment.MANGA_DIR + '/' + manga.id, { recursive: true });

      return manga.view();
    },
    options: {
      auth: {
        mode: 'required'
      },

      validate: {
        params: Joi.object({
          id: JoiID.required()
        }).required(),
      }
    }
  });

  server.route({
    method: 'DELETE',
    path: '/manga/{id}/{file}',
    handler: async (req, h) => {
      // tslint:disable-next-line: no-non-null-assertion
      const manga = await Manga.findById(req.params!.id);
      if (manga === null) { return Boom.notFound('Manga not found'); }

      const match = manga.pageURLs.indexOf(req.params.file);
      if (match === -1) { return Boom.notFound('Page not found'); }

      // Is owner
      // tslint:disable-next-line: no-non-null-assertion
      if (manga.ownerID != req.auth.credentials.user!.id) { return Boom.forbidden('You do not own this manga'); }

      manga.pageURLs.splice(match, 1);
      await manga.save();
      await promisify(fs.unlink)(environment.MANGA_DIR + '/' + req.params.id + '/' + req.params.file);

      return manga.view();
    },
    options: {
      auth: {
        mode: 'required'
      },

      validate: {
        params: Joi.object({
          id: JoiID.required(),
          file: Joi.string().regex(/^[a-z0-9-+]+\.[a-z]+$/i).required()
        }).required(),
      }
    }
  });
};
