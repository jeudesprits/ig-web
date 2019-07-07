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
  await igApi.Result;

  try {
    await igApi.logIn(L_USERNAME, L_PASSWORD);

    let count = 0;
    loop: for await (const data of igApi.profileFollowing('lakrimoca')) {
      const {
        data: {
          user: {
            edge_follow: { edges },
          },
        },
      } = data;

      // prettier-ignore
      for (const {node: { username } } of edges) {
        if (count >= 15) {
          break loop;
        }

        ++count;
        await igApi.profileUnfollow(username);
        await msleep(2000);
      }
    }
  } catch (error) {
    await browser.screenshot(igApi.sessionPage, 'tmp/screenshot.jpg');
    logger.error(error.stack, { label: '@lakrimoca' });
  } finally {
    await browser.close();
  }
})();
