import Browser from './browser';
import IGApi from './api/ig';
import client from './mongo/client';
import logger from './logger';
import secrets from './utils/secrets';
const { L_USERNAME, L_PASSWORD } = secrets;
const TARGET = 'nargizjan_';

// tslint:disable-next-line: no-floating-promises
(async () => {
    const browser = new Browser();
    await browser.launch();

    await client.Ready

    // tslint:disable-next-line: variable-name
    const targetCL = client.db('analyticsDB').collection(TARGET);

    const igApi = new IGApi(browser);
    await igApi.Result;

    await igApi.logIn(L_USERNAME, L_PASSWORD);

    try {
        const profileInfoPage = await browser.newPage();
        for await (const followersPortion of igApi.profileFollowers(TARGET)) {
            const {
                data: {
                    user: {
                        edge_followed_by: {
                            edges,
                        },
                    },
                },
            } = followersPortion;

            for (const edge of edges) {
                const {
                    node: {
                        username,
                    }
                } = edge;

                const {
                    business_category_name = null,
                    connected_fb_page = null,
                    // tslint:disable-next-line: variable-name
                    edge_follow: { count: edge_follow_count },
                    // tslint:disable-next-line: variable-name
                    edge_followed_by: { count: edge_followed_by_count },
                    // tslint:disable-next-line: variable-name
                    edge_owner_to_timeline_media: { count: edge_owner_to_timeline_media_count = null },
                    highlight_reel_count = null,
                    id,
                    is_business_account,
                    is_joined_recently,
                    is_private,
                    is_verified,
                    profile_pic_url = null,
                    // tslint:disable-next-line: variable-name
                    username: username_,
                } = await igApi.profileInfo(username, profileInfoPage);


                await targetCL.insertOne({
                    business_category_name,
                    connected_fb_page,
                    edge_follow_count,
                    edge_followed_by_count,
                    edge_owner_to_timeline_media_count,
                    highlight_reel_count,
                    id,
                    is_business_account,
                    is_joined_recently,
                    is_private,
                    is_verified,
                    profile_pic_url,
                    username_,
                });
            }
        }
    } catch (error) {
        logger.error(error.stack, { label: 'ig-web Analitics' });
    } finally {
        await browser.close();
        await client.close();
    }
})();