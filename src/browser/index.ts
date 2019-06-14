import puppeteer from 'puppeteer';

export default class Browser {

  static browser: puppeteer.Browser;

  static async launch() {
    return new Promise<puppeteer.Browser>((res, rej) => {
      puppeteer.launch({
        args: [
          '--user-agent=Mozilla/5.0 (iPhone; CPU iPhone OS 12_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.1 Mobile/15E148 Safari/604.1',
        ],
        headless: false,
        userDataDir: 'chromium',
        defaultViewport: {
          width: 414,
          height: 896,
          deviceScaleFactor: 3,
          isMobile: true,
          hasTouch: true,
          isLandscape: false,
        },
      }).then(val => {
        this.browser = val;
        res(this.browser);
      }).catch(e => {
        rej(e);
      })
    })
  }

  static async newPage() {
    return this.browser.newPage();
  }

  static async pages() {
    return this.browser.pages();
  }

  static async close() {
    return this.browser.close();
  }
}