import { BaseModel, Model, Field } from 'maraquia';

@Model({ collectionName: 'followings' })
export default class Following extends BaseModel {
    @Field()
    username: string;
    @Field()
    startedSince: Date;
}