import { BaseModel, Model, Field } from 'maraquia';

@Model({ collectionName: 'comments' })
export default class Comment extends BaseModel {
    @Field() text: string;
}
