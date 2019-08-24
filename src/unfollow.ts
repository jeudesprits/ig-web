import Browser from './browser';
import IGApi from './api/ig';
import logger from './logger';
import secrets from './utils/secrets';
const { G_USERNAME, G_PASSWORD } = secrets;
import { msleep } from './utils/helpers';
import cron from 'node-cron';

cron.schedule('*/15 * * * *', async () => {
    const browser = new Browser();
    await browser.launch();

    const igApi = new IGApi(browser);

    await igApi.Result;
    await igApi.logIn(G_USERNAME, G_PASSWORD);

    try {
        let count = 0;
        loop: for await (const data of igApi.profileFollowing(G_USERNAME)) {
            // prettier-ignore
            const { data: { user: { edge_follow: { edges } } } } = data;

            // prettier-ignore
            for (const { node: { username } } of edges) {
                if (count >= 15) { break loop; }

                ++count;
                try {
                    await igApi.profileUnfollow(username);
                } catch (error) {
                    await browser.screenshot(igApi.sessionPage, './tmp/screenshot.jpg');
                    logger.error(error.stack, { label: `ig-web @${G_USERNAME}` });
                }
                await msleep(2000);
            }
        }
    } catch (error) {
        await browser.screenshot(igApi.sessionPage, './tmp/screenshot.jpg');
        logger.error(error.stack, { label: `ig-web @${G_USERNAME}` });
    } finally {
        await browser.close();
    }
});