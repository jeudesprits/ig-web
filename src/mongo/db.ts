import { Maraquia } from 'maraquia';
import client, { MongoClient } from './client';

class Db {
  readonly Result: Promise<void>;

  IgDilnozochkaShodiyeva: Maraquia;

  constructor(client: MongoClient) {
    this.Result = (async () => {
      await client.Ready;
      this.IgDilnozochkaShodiyeva = new Maraquia(client.db('ig_dilnozochka_shodiyeva'));
    })();
  }
}

export default new Db(client);
