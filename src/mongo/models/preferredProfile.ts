import { BaseModel, Model, Field } from 'maraquia';

@Model({ collectionName: 'preferredProfiles' })
export default class PreferredProfile extends BaseModel {
    @Field()
    username: string;
}