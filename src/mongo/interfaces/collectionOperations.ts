export interface MongoCollectionWrite<T> {
  create(item: T): Promise<boolean>;
  update(id: string, item: T): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}

export interface MongoCollectioRead<T> {
  find(item: T): Promise<T[]>;
  findOne(id: string): Promise<T>;
}