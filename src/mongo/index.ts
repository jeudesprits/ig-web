import { MongoClient } from 'mongodb';

export default class MongoDB {
  static client: MongoClient;

  static async connect() {
    this.client = await MongoClient.connect('secrets.MONGO_URI', { useNewUrlParser: true });
  }

  static db(dbName: string) {
    return this.client.db(dbName);
  }

  static async close() {
    await this.client.close();
  }
}
