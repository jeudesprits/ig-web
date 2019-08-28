import { Maraquia } from 'maraquia';
import client, { MongoClient } from './client';

class Db {
    readonly Result: Promise<void>;

    igLakrimoca: Maraquia;

    constructor(client: MongoClient) {
        this.Result = (async () => {
            await client.Ready;
            this.igLakrimoca = new Maraquia(client.db('igLakrimocaDB'));
        })();
    }
}

export default new Db(client);
