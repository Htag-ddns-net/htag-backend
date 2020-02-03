import mongoose, { } from 'mongoose';
import { IUser } from './User';
import { IManga } from './Manga';
const timestamp = require('mongoose-timestamp');

export interface ITimestamp { createdAt: Date, updatedAt: Date; };
export interface IFavorite extends mongoose.Document, ITimestamp {
  userId: IUser | mongoose.Types.ObjectId | string;
  mangaId: IManga | mongoose.Types.ObjectId | string;
};

const Schema = new mongoose.Schema<IFavorite>({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  mangaId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Manga' }
});
Schema.plugin(timestamp);

export default mongoose.model<IFavorite>('Favorite', Schema);
