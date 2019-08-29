import Browser from './browser';
import IGApi from './api/ig';
import client from './mongo/client';
import cron from 'node-cron';
import { PreferredProfile, VisitedPost, Following } from './mongo/models';
import logger from './logger';
import secrets from './utils/secrets';
const { L_USERNAME, L_PASSWORD } = secrets;
import { msleep } from './utils/helpers';

cron.schedule('*/15 * * * *', async () => {
    const browser = new Browser();
    await browser.launch();

    await client.Ready

    const FollowingCl = client.db('igLakrimocaDB').collection<Following>('followings');
    const PreferredProfileCl = client.db('igLakrimocaDB').collection<PreferredProfile>('preferredProfiles');
    const VisitedPostCl = client.db('igLakrimocaDB').collection<VisitedPost>('visitedPosts');

    const igApi = new IGApi(browser);
    await igApi.Result;

    try {
        await igApi.logIn(L_USERNAME, L_PASSWORD);
    } catch (error) {
        await browser.screenshot(igApi.sessionPage, './tmp/screenshot.jpg');
        logger.error(error.stack, { label: `ig-web @${L_USERNAME}` });
        await browser.close();
        await client.close();
    }

    const [randomProfile] = await PreferredProfileCl.find({}, {
        limit: 1,
        skip: Math.random() * await PreferredProfileCl.countDocuments()
    }).toArray();

    const FOLLOW_LIMIT = 30;
    let currentFollows = 0;
    try {
        const profileMediaPage = await browser.newPage();
        outerLoop: for await (const postsPortion of igApi.profileMedia(randomProfile.username, profileMediaPage)) {

            const { edges } = postsPortion;
            for (const edge of edges) {
                const {
                    node: {
                        comments_disabled: commentsDisabled,
                        shortcode,
                    }
                } = edge;

                if (commentsDisabled) { continue; }

                let visitedPost = await VisitedPostCl.findOne({ shortcode });
                if (visitedPost) {
                    if (!visitedPost.commentsHasNext) { continue };
                } else {
                    visitedPost = {
                        shortcode,
                        commentsHasNext: true
                    };
                }


                const mediaCommentsPage = await browser.newPage();
                for await (const commentsPortion of igApi.mediaComments(shortcode, mediaCommentsPage)) {

                    const { edges, page_info: pageInfo } = commentsPortion;
                    const { has_next_page: hasNextPage } = pageInfo;

                    for (const edge of edges) {

                        const {
                            node: {
                                viewer_has_liked: viewerHasLiked,
                                id: commentId,
                                owner: { username },
                            }
                        } = edge;

                        if (currentFollows >= FOLLOW_LIMIT) {
                            visitedPost.commentsHasNext = hasNextPage;
                            console.log('If ', visitedPost);
                            await VisitedPostCl.updateOne({ shortcode }, { $set: visitedPost }, { upsert: true });

                            break outerLoop;
                        }

                        if (viewerHasLiked) {
                            await msleep(2000);
                            continue;
                        }

                        try {
                            await igApi.mediaCommentLike(shortcode, commentId, mediaCommentsPage);
                            await msleep(2000);
                            await igApi.profileFollow(username);
                            await msleep(2000);
                        } catch {
                            await msleep(2000);
                            continue;
                        }


                        await FollowingCl.insertOne({
                            username,
                            startedSince: new Date(),
                        });

                        console.log(username);
                        ++currentFollows;

                        await msleep(2000);
                    }

                    visitedPost.commentsHasNext = hasNextPage;
                    console.log('End ', visitedPost);
                    await VisitedPostCl.updateOne({ shortcode }, { $set: visitedPost }, { upsert: true });
                }
            }
        }
    } catch (error) {
        await browser.screenshot(igApi.sessionPage, './tmp/screenshot.jpg');
        logger.error(error.stack, { label: `ig-web @${L_USERNAME}` });
    } finally {
        await browser.close();
        await client.close();
    }
}, { timezone: 'Asia/Tashkent' });

cron.schedule('50 23 * * *', async () => {
    const browser = new Browser();
    await browser.launch();

    await client.Ready

    const FollowingCl = client.db('igLakrimocaDB').collection<Following>('followings');

    const igApi = new IGApi(browser);
    await igApi.Result;

    try {
        await igApi.logIn(L_USERNAME, L_PASSWORD);
    } catch (error) {
        await browser.screenshot(igApi.sessionPage, './tmp/screenshot.jpg');
        logger.error(error.stack, { label: `ig-web @${L_USERNAME}` });
        await browser.close();
        await client.close();
    }

    const lastDayFollowings = await FollowingCl.find({
        startedSince: {
            $lt: new Date(),
            $gte: new Date(new Date().setDate(new Date().getDate() - 1)),
        }
    }).toArray();

    let followBackCount = 0;
    try {
        for (const { username } of lastDayFollowings) {
            const { follows_viewer: followsViewer } = await igApi.profileInfo(username);
            if (followsViewer) { ++followBackCount };
            await msleep(2000);
        }
    } catch (error) {
        await browser.screenshot(igApi.sessionPage, './tmp/screenshot.jpg');
        logger.error(error.stack, { label: `ig-web @${L_USERNAME}` });
        await browser.close();
        await client.close();
    }

    logger.info(
        `
✳️️️️️️️️✳️️️️️️️️✳️️️️️️️️✳️️️️️️️️✳️️️️️️️️✳️️️️️️️️✳️️️️️️️️✳️️️️️️️️✳️️️️️️️️✳️️️️️️️️
Статистика дня:
📌 ${lastDayFollowings.length} подписок
📌 ${followBackCount} подписок в ответ
Итоговая эффективность:
📈 ~${(followBackCount * 100 / lastDayFollowings.length).toPrecision(1)}%`,
        { label: `ig-web ${L_USERNAME}`, withScreenshot: false }
    );

    await browser.close();
    await client.close();
}, { timezone: 'Asia/Tashkent' });