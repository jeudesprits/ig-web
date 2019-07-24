import Browser from './browser';
import IGApi from './api/ig';
import client from './mongo/client';
import db from './mongo/db';
import { CollectionOfOne, Comment } from './mongo/models';
import logger from './logger';
import secrets from './utils/secrets';
const { L_USERNAME, L_PASSWORD } = secrets;
import { msleep } from './utils/helpers';

// tslint:disable-next-line: no-floating-promises
(async () => {
    const browser = new Browser();
    await browser.launch();

    const igApi = new IGApi(browser);

    try {
        await igApi.Result;
        await igApi.logIn(L_USERNAME, L_PASSWORD);

        await db.Result;
        CollectionOfOne.use(db.IgLakrimoca);
        Comment.use(db.IgLakrimoca);

        // prettier-ignore
        const { 
            discoverChainingPostShortcode, 
            discoverChainingLastCursor, 
        } = (await CollectionOfOne.findOne<CollectionOfOne>({}))!;

        const {
            value: {
                data: {
                    user: {
                        edge_web_media_chaining: { page_info: pageInfo, edges },
                    },
                },
            },
        } = await igApi
            .discoverChaining(
                discoverChainingPostShortcode,
                discoverChainingLastCursor !== null ? discoverChainingLastCursor : undefined,
            )
            .next();

        console.log(pageInfo);

        for (const {
            node: {
                comments_disabled: commentsDisabled,
                edge_media_to_comment: { edges: commentEdges },
                shortcode,
            },
        } of edges) {
            if (commentsDisabled) {
                continue;
            }

            for (const {
                node: {
                    id,
                    owner: { username },
                    viewer_has_liked: viewerHasLiked,
                },
            } of commentEdges) {
                if (viewerHasLiked) {
                    continue;
                }

                await igApi.mediaCommentLike(shortcode, id);

                let likePostShortcode;
                let commentsDisabled;
                try {
                    const {
                        value: {
                            edges: [
                                {
                                    node: { shortcode, comments_disabled },
                                },
                            ],
                        },
                    } = await igApi.profileMedia(username).next();
                    likePostShortcode = shortcode;
                    commentsDisabled = comments_disabled;
                } catch {
                    continue;
                }

                if (commentsDisabled) {
                    continue;
                }

                try {
                    await igApi.mediaLike(likePostShortcode);
                } catch {
                    continue;
                }

                const [comment] = await Comment.find<Comment>({}, null, { limit: -1, skip: Math.random() * 9 });
                await igApi.mediaComment(likePostShortcode, comment.text);
            }
        }

        await msleep(2000);
    } catch (error) {
        await browser.screenshot(igApi.sessionPage, 'tmp/screenshot.jpg');
        logger.error(error.stack, { label: 'ig-web @lakrimoca' });
    } finally {
        await browser.close();
        await client.close();
    }
})();
