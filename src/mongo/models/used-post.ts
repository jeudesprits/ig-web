import { BaseModel, Model, Field } from 'maraquia';

@Model({ collectionName: 'used-posts' })
export default class UsedPost extends BaseModel {
  @Field() uri: string;
}
