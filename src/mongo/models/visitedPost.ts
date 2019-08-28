import { BaseModel, Model, Field } from 'maraquia';

@Model({ collectionName: 'visitedPosts' })
export default class VisitedPost extends BaseModel {
    @Field()
    shortcode: string;
    @Field()
    commentsHasNext: boolean;
}