import mongoose, { } from 'mongoose';
const timestamp = require('mongoose-timestamp');

export interface ITimestamp { createdAt: Date, updatedAt: Date; };
export interface IManga extends mongoose.Document, ITimestamp {
  title: string;
  ownerID: string;
  pageURLs: string[];

  view(): object;

  // TODO extra data artist, parody, character, tags, group, language, altName, favoritesCount
};

const Schema = new mongoose.Schema<IManga>({
  title: { type: String, required: true, trim: true },

  ownerID: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  pageURLs: [{ type: String, require: true, trim: true }],

  // TODO extra data
});
Schema.plugin(timestamp);

Schema.methods.view = function () {
  return {
    id: this.id,
    title: this.title,
    owner: this.ownerID,
    pageURLs: this.pageURLs,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

export default mongoose.model<IManga>('Manga', Schema);
