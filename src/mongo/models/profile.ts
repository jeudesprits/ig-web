import { BaseModel, Model, Field } from 'maraquia';

@Model({ collectionName: 'profiles' })
export default class Profile extends BaseModel {
    @Field() uri: string;
}
