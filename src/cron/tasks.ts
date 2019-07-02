import Browser from '../browser';
import IGApi from '../api/ig/login';

export async function lakrimocaUnfollow() {
  await Browser.launch();
  const api = new IGApi();
  await api.prepare();

  // await api.logIn('lakrimoca', 'CocoBagzLusy317');
  // for await (const data of await api.profileFollowing('lakrimoca')) {
  //   await api.profileUnfollow('');
  // }

  await Browser.close();
}
