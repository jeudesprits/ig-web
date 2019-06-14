import Browser from './browser';

// tslint:disable-next-line: no-floating-promises
(async () => {
  await Browser.launch();
  const page = (await Browser.browser.pages()).pop()!;
  await page.goto('https://www.instagram.com');
})();
