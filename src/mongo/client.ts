import { MongoClient as MongoClientNative } from 'mongodb';
import secrets from '../utils/secrets';

export class MongoClient {
  Ready: Promise<void>;

  private _client: MongoClientNative;

  get client() {
    return this._client;
  }

  constructor() {
    this.Ready = (async () => this.connect())();
  }

  private async connect() {
    this._client = await MongoClientNative.connect(secrets!.MONGO_URI, { useNewUrlParser: true });
  }

  async close() {
    await this._client.close();
  }

  db(dbName: string) {
    return this._client.db(dbName);
  }
}

export default new MongoClient();
