import puppeteer from 'puppeteer';

export default class Browser {

  static browser: puppeteer.Browser;

  static async launch() {
    this.browser = await puppeteer.launch({
      args: [
        // '--no-sandbox',
        // '--disable-setuid-sandbox',
        // '--disable-site-isolation-trials',
        '--disable-features=NetworkService',
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
    });

    const unnecessaryPage = (await this.browser.pages())[0];
    await unnecessaryPage.close();
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