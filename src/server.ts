import Browser from './browser';
import IGApi from './api/ig/login';
import logger from './logger';
import { msleep } from './utils/helpers';

// tslint:disable-next-line: no-floating-promises
(async () => {
  await Browser.launch();

  const api = new IGApi();
  await api.prepare();

  try {
    await api.logIn('lakrimoca', 'Mynewpassword317');
  } catch (error) {
    await Browser.screenshot(api.sessionPage, './tmp/screenshot.jpeg');
    logger.error(`IG Api login error: ${error}`);
  }

  let count = 0;
  loop1: for await (const data of api.profileFollowing('lakrimoca')) {
    const {
      data: {
        user: {
          edge_follow: {
            edges
          }
        }
      }
    } = data;

    loop2: for (const { node: { username } } of edges) {
      if (count >= 15) {
        break loop1;
      }

      try {
        ++count;
        console.log(await api.profileUnfollow(username));
      } catch {
        console.log("Oops...");
      }

      await msleep(2000);
    }
  }

  await Browser.close();
})();
