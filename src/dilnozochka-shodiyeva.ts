import client from './mongo/client';
import db from './mongo/db';
import { UsedPost } from './mongo/models';
import Browser from './browser';
import IGApi from './api/ig';

// tslint:disable-next-line: no-floating-promises
(async () => {
  const browser = new Browser();
  await browser.launch();

  const igApi = new IGApi(browser);
  await igApi.Result;

  await db.Result;
  const post = new UsedPost({ uri: 'https://www.instagram.com/p/Bzf9kjxFcp_/' }, db.IgDilnozochkaShodiyeva);
  console.log(await post.save());

  await client.close();
  await browser.close();
})();
