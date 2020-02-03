import Joi from '@hapi/joi';

export interface IEnv {
  ENV: string;
  DEBUG: boolean;

  PORT: number;
  BASE_URL: string;

  MONGODB_URI: string;

  MANGA_DIR: string;

  COOKIE_SECRET: string[];
};

export const Schema = Joi.object<IEnv, IEnv>({
  ENV: Joi.string().allow('development', 'production').default('development'),
  DEBUG: Joi.boolean().default(false),

  PORT: Joi.number().port().default(3000),
  BASE_URL: Joi.string().uri({ scheme: ['http', 'https'] }),

  MONGODB_URI: Joi.string().uri({ scheme: ['mongodb', 'mongodb+srv'] }).required(),

  MANGA_DIR: Joi.string().default(process.cwd() + '/../MANGA'),


  COOKIE_SECRET: Joi.string().min(32).required(),
}).required();

// Validation
const { error, value } = Schema.validate(process.env, { stripUnknown: true, allowUnknown: true });
if (error) throw error;

// Post presets
if (!value.BASE_URL) { value.BASE_URL = `http://localhost:${value.PORT}`; }

// DEBUG
if (value.DEBUG) {
  console.log('Environment settings are:');
  console.log(JSON.stringify(value, null, 2));
}

export default value as IEnv;
