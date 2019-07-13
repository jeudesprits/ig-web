import Browser from './browser';
import IGApi from './api/ig';
import logger from './logger';
import secrets from './utils/secrets';
const { L_USERNAME, L_PASSWORD } = secrets;

// tslint:disable-next-line: no-floating-promises
(async () => {
  const browser = new Browser();
  await browser.launch();

  const igApi = new IGApi(browser);

  try {
    await igApi.Result;
    await igApi.logIn(L_USERNAME, L_PASSWORD);
    let i = 0;
    for await (const portion of igApi.locationFeed('3001373')) {
      if (i > 3) {
        break;
      }
      console.log(portion);
      ++i;
    }
  } catch (error) {
    await browser.screenshot(igApi.sessionPage, 'tmp/screenshot.jpg');
    logger.error(error.stack, { label: 'ig-web @lakrimoca' });
  } finally {
    await browser.close();
  }
})();
