import client from './mongo/client';
import db from './mongo';
import { UsedPost } from './mongo/models';

// tslint:disable-next-line: no-floating-promises
(async () => {
  await db.Result;
  const post = new UsedPost({ uri: 'https://www.instagram.com/p/Bzf9kjxFcp_/' }, db.IgDilnozochkaShodiyeva);
  console.log(await post.save());
  await client.close();
})();
