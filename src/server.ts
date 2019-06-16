import Browser from './browser';
import IGApi from './api/ig/login';

// tslint:disable-next-line: no-floating-promises
(async () => {
  await Browser.launch();
  const api = new IGApi();
  await api.prepare();
  await api.logIn('meawira', 'mynewpassword');
  await api.menu('activity');
  for await (const item of api.profileMedia('sosanimal.uz')) {
    console.log(item);
  }
})();

// https://www.instagram.com/