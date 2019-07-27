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
        const collectionOfOne = (await CollectionOfOne.findOne<CollectionOfOne>({}))!;
        const { discoverChainingPostShortcode, discoverChainingLastCursor } = collectionOfOne;

        const {
            value: {
                data: {
                    user: {
                        edge_web_media_chaining: {
                            page_info: { end_cursor: endCursor },
                            edges,
                        },
                    },
                },
            },
        } = await igApi
            .discoverChaining(
                discoverChainingPostShortcode,
                discoverChainingLastCursor !== null ? discoverChainingLastCursor : undefined,
            )
            .next();

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

                await msleep(2000);

                try {
                    await igApi.mediaCommentLike(shortcode, id);
                } catch (error) {
                    logger.error(error.stack, { label: 'ig-web @lakrimoca' });
                    continue;
                }

                await msleep(2000);

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
                } catch(error) {
                    logger.error(error.stack, { label: 'ig-web @lakrimoca' });
                    continue;
                }

                await msleep(2000);

                if (commentsDisabled) {
                    continue;
                }

                try {
                    await igApi.mediaLike(likePostShortcode);
                } catch (error) {
                    logger.error(error.stack, { label: 'ig-web @lakrimoca' });
                    continue;
                }

                await msleep(2000);

                const [comment] = await Comment.find<Comment>({}, null, { limit: 1, skip: Math.random() * 9 });
                try {
                    await igApi.mediaComment(likePostShortcode, comment.text);
                } catch (error) {
                    logger.error(error.stack, { label: 'ig-web @lakrimoca' });
                    continue;
                }

                logger.info('Succes!', { label: 'ig-web @lakrimoca' });
            }

            await msleep(2000);
        }

        collectionOfOne.setField('discoverChainingLastCursor', endCursor);
        await collectionOfOne.save();
    } catch (error) {
        await browser.screenshot(igApi.sessionPage, 'tmp/screenshot.jpg');
        logger.error(error.stack, { label: 'ig-web @lakrimoca' });
    } finally {
        await browser.close();
        await client.close();
    }
})();
