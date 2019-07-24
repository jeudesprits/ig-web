import Browser from './browser';
import IGApi from './api/ig';
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

        const obj = await igApi.discoverChaining('B0FLNJfn3ux', '13').next();
        console.log(JSON.stringify(obj));

        await msleep(2000);
    } catch (error) {
        await browser.screenshot(igApi.sessionPage, 'tmp/screenshot.jpg');
        logger.error(error.stack, { label: 'ig-web @lakrimoca' });
    } finally {
        await browser.close();
    }
})();
