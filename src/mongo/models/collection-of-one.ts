import { BaseModel, Model, Field } from 'maraquia';

@Model({ collectionName: 'collection_of_one' })
export default class CollectionOfOne extends BaseModel {
    @Field() discoverChainingPostShortcode: string;
    @Field() discoverChainingLastCursor: string | null;
}
