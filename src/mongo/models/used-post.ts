import { BaseModel, Model, Field } from 'maraquia';

@Model({ collectionName: 'used_posts' })
export default class UsedPost extends BaseModel {
    @Field() uri: string;
}
