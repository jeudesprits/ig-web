import Browser from './browser';
import IGApi from './api/ig/login';

// tslint:disable-next-line: no-floating-promises
(async () => {
  await Browser.launch();
  const api = new IGApi();
  await api.prepare();
  await api.logIn('jeudesprits', 'rj2119942104sl');
  console.log(await api.uploadMedia('test test', '/Users/jeudesprits/Downloads/D8KyZwOWsAAlkUa.jpg-large.jpeg'));

  // await Browser.close();
})();
