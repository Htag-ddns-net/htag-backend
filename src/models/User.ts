import mongoose, { } from 'mongoose';
const timestamp = require('mongoose-timestamp');
import bcrypt from 'bcrypt';

export interface ITimestamp { createdAt: Date, updatedAt: Date; };
export interface IUser extends mongoose.Document, ITimestamp {
  username: string;
  passwordHash: string;

  view(): object;

  setPassword(password: string): Promise<void>;
  checkPassword(password: string): Promise<boolean>;
};

const Schema = new mongoose.Schema<IUser>({
  username: { type: String, unique: true, required: true, trim: true },
  passwordHash: { type: String, required: true },
});

Schema.plugin(timestamp);

Schema.methods.view = function () {
  return {
    id: this.id,
    username: this.username,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

Schema.methods.checkPassword = async function (password: string) {
  return await bcrypt.compare(password, this.passwordHash);
};
Schema.methods.setPassword = async function (password: string) {
  this.passwordHash = await bcrypt.hash(password, await bcrypt.genSalt(10));
};

export default mongoose.model<IUser>('User', Schema);
