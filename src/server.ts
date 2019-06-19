import Browser from './browser';
import IGApi from './api/ig/login';

// tslint:disable-next-line: no-floating-promises
(async () => {
  await Browser.launch();
  const api = new IGApi();
  await api.prepare();
  await api.logIn('meawira', 'mynewpassword');
  // console.log(await api.profileInfo('nude_yogagirl'));

  for await (const comments of api.profileMedia('arielhelwani')) {
    console.log(comments);
  }

  await Browser.close();
})();

// https://www.instagram.com/p/By0t8ooh4Gy/