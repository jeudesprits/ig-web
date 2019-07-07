import { BaseModel, Model, Field } from 'maraquia';

@Model({ collectionName: 'hashtags' })
export default class Hashtag extends BaseModel {
  @Field() hashtag: string;
}
