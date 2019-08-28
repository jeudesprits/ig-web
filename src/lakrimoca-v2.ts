import Browser from './browser';
import IGApi from './api/ig';
import client from './mongo/client';
import db from './mongo/db';
import cron from 'node-cron';
import { PreferredProfile, VisitedPost, Following } from './mongo/models';
import logger from './logger';
import secrets from './utils/secrets';
const { L_USERNAME, L_PASSWORD } = secrets;
import { msleep } from './utils/helpers';

cron.schedule('*/15 * * * *', async () => {
    const browser = new Browser();
    await browser.launch();

    await db.Result;
    PreferredProfile.use(db.igLakrimoca);
    VisitedPost.use(db.igLakrimoca);
    Following.use(db.igLakrimoca);

    const igApi = new IGApi(browser);
    await igApi.Result;

    try {
        await igApi.logIn(L_USERNAME, L_PASSWORD);
    } catch (error) {
        logger.error(error.stack, { label: `ig-web ${L_USERNAME}` });
        await browser.close();
        await client.close();
    }

    const [randomProfile] = await PreferredProfile.find<PreferredProfile>({}, null, {
        limit: 1,
        skip: Math.random() * (await PreferredProfile.find<PreferredProfile>({})).length,
    });

    const FOLLOW_LIMIT = 30;
    let currentFollows = 0;
    try {
        outerLoop: for await (const postsPortion of igApi.profileMedia(randomProfile.username)) {

            const { edges } = postsPortion;
            for (const edge of edges) {
                const {
                    node: {
                        comments_disabled: commentsDisabled,
                        shortcode,
                    }
                } = edge;

                if (commentsDisabled) { continue; }

                const visitedPost = await VisitedPost.findOne<VisitedPost>({ shortcode });
                if (visitedPost && !visitedPost.commentsHasNext) { continue; }

                for await (const commentsPortion of igApi.mediaComments(shortcode)) {

                    const { edges, page_info: pageInfo } = commentsPortion;
                    for (const edge of edges) {

                        const {
                            node: {
                                viewer_has_liked: viewerHasLiked,
                                id: commentId,
                                owner: { username },
                            }
                        } = edge;

                        if (currentFollows >= FOLLOW_LIMIT) {
                            const { has_next_page: hasNextPage } = pageInfo;

                            const visitedPost = new VisitedPost({
                                shortcode,
                                commentsHasNext: hasNextPage,
                            });
                            await visitedPost.save();

                            break outerLoop;
                        }

                        if (viewerHasLiked) {
                            await msleep(2000);
                            continue;
                        }

                        try {
                            await igApi.mediaCommentLike(shortcode, commentId);
                            await msleep(2000);
                            await igApi.profileFollow(username);
                            await msleep(2000);
                        } catch {
                            await msleep(2000);
                            continue;
                        }

                        const following = new Following({
                            username,
                            startedSince: new Date(),
                        });
                        await following.save();

                        ++currentFollows;
                    }

                    const { has_next_page: hasNextPage } = pageInfo;

                    const visitedPost = new VisitedPost({
                        shortcode,
                        commentsHasNext: hasNextPage,
                    });
                    await visitedPost.save();
                }
            }
        }
    } catch (error) {
        logger.error(error.stack);
    } finally {
        await browser.close();
        await client.close();
    }
}, { timezone: 'Asia/Tashkent' });

cron.schedule('50 23 * * *', async () => {
    const browser = new Browser();
    await browser.launch();

    await db.Result;
    Following.use(db.igLakrimoca);

    const igApi = new IGApi(browser);
    await igApi.Result;

    try {
        await igApi.logIn(L_USERNAME, L_PASSWORD);
    } catch (error) {
        logger.error(error.stack, { label: `ig-web ${L_USERNAME}` });
        await browser.close();
        await client.close();
    }

    const lastDayFollowings = await Following.find<Following>({
        startedSince: {
            $lt: new Date(),
            $gte: new Date(new Date().setDate(new Date().getDate() - 1)),
        }
    });

    let followBackCount = 0;
    try {
        for (const { username } of lastDayFollowings) {
            const { follows_viewer: followsViewer } = await igApi.profileInfo(username);
            if (followsViewer) { ++followBackCount };
            await msleep(2000);
        }
    } catch (error) {
        logger.error(error.stack, { label: `ig-web ${L_USERNAME}` });
        await browser.close();
        await client.close();
    }

    logger.info(
        `✳️️️️️️️️✳️️️️️️️️✳️️️️️️️️✳️️️️️️️️✳️️️️️️️️✳️️️️️️️️✳️️️️️️️️✳️️️️️️️️✳️️️️️️️️✳️️️️️️️️
        Статистика дня:
        📌 ${lastDayFollowings.length} подписок
        📌 ${followBackCount} подписок в ответ
        Итоговая эффективность:
        📈 ${followBackCount * 100 / lastDayFollowings.length}%`,
        { label: `ig-web ${L_USERNAME}`, withScreenshot: false }
    );

    await browser.close();
    await client.close();
}, { timezone: 'Asia/Tashkent' });