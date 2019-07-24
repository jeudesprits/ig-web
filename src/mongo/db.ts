import { Maraquia } from 'maraquia';
import client, { MongoClient } from './client';

class Db {
    readonly Result: Promise<void>;

    IgDilnozochkaShodiyeva: Maraquia;

    IgLakrimoca: Maraquia;

    constructor(client: MongoClient) {
        this.Result = (async () => {
            await client.Ready;
            this.IgDilnozochkaShodiyeva = new Maraquia(client.db('ig_dilnozochka_shodiyeva'));
            this.IgLakrimoca = new Maraquia(client.db('ig_lakrimoca'));
        })();
    }
}

export default new Db(client);
