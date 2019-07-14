import Browser from './browser';
import IGApi from './api/ig';
import logger from './logger';
import secrets from './utils/secrets';
const { L_USERNAME, L_PASSWORD } = secrets;
import { msleep } from './utils/helpers';

const locationIds = ['1882782758637550', '236070306', '272469341', '231385413'];

// tslint:disable-next-line: no-floating-promises
(async () => {
  const browser = new Browser();
  await browser.launch();

  const igApi = new IGApi(browser);

  try {
    await igApi.Result;
    await igApi.logIn(L_USERNAME, L_PASSWORD);

    let count = 0;
    const randomLocationId = locationIds[Math.floor(Math.random() * locationIds.length)];

    outerLoop: for await (const data of igApi.locationFeed(randomLocationId)) {
      // prettier-ignore
      const { edge_location_to_media: { edges } } = data;

      // prettier-ignore
      for (const {node: { shortcode } } of edges) {
        if (count >= 15) {
          break outerLoop;
        }

        try {
          await igApi.mediaLike(shortcode);
        } catch {
          continue;
        }

        console.log(shortcode);
        
        ++count;
        await msleep(2000);
      }
    }
  } catch (error) {
    await browser.screenshot(igApi.sessionPage, 'tmp/screenshot.jpg');
    logger.error(error.stack, { label: 'ig-web @lakrimoca' });
  } finally {
    await browser.close();
  }
})();
