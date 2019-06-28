import Browser from './browser';
import IGApi from './api/ig/login';

async function msleep(time: number): Promise<void> {
  return new Promise(resolve => setTimeout(_ => resolve(), time))
}

// tslint:disable-next-line: no-floating-promises
(async () => {
  await Browser.launch();

  const api = new IGApi();
  await api.prepare();
  await api.logIn('lakrimoca', 'Mynewpassword317');

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
      if (count > 15) {
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
