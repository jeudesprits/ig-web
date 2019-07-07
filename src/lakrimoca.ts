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

  const api = new IGApi(browser);
  await api.Result;

  try {
    await api.logIn(L_USERNAME, L_PASSWORD);
  } catch (error) {
    await browser.screenshot(api.sessionPage, 'tmp/screenshot.jpeg');
    logger.error(`IG Api login ${error.stack}`);
    await msleep(2000);
    await browser.close();
    return;
  }

  let count = 0;
  loop1: for await (const data of api.profileFollowing('lakrimoca')) {
    const {
      data: {
        user: {
          edge_follow: { edges },
        },
      },
    } = data;

    loop2: for (const {
      node: { username },
    } of edges) {
      if (count >= 15) {
        break loop1;
      }

      try {
        ++count;
        await api.profileUnfollow(username);
      } catch (error) {
        await browser.screenshot(api.sessionPage, 'tmp/screenshot.jpeg');
        logger.error(`IG Api profileUnfollow ${error.stack}`);
        await msleep(2000);
        break loop1;
      }

      await msleep(2000);
    }
  }

  await browser.close();
})();
