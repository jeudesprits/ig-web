import { MongoClient as MongoClientNative } from 'mongodb';
import secrets from '../utils/secrets';
const { MONGO_URI } = secrets;

export class MongoClient {
    readonly Ready: Promise<void>;

    private _client: MongoClientNative;

    get client() {
        return this._client;
    }

    constructor() {
        this.Ready = (async () => this.connect())();
    }

    private async connect() {
        this._client = await MongoClientNative.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology:  true });
    }

    async close() {
        await this._client.close();
    }

    db(dbName: string) {
        return this._client.db(dbName);
    }
}

export default new MongoClient();
