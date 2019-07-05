import { Browser as BrowserNative, Page, launch } from 'puppeteer';
import { existsSync, mkdirSync, rmdirSync } from 'fs';

export default class Browser {
  private _browser: BrowserNative;

  get browser() {
    return this._browser;
  }

  async launch() {
    this._browser = await launch({
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
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

    const unnecessaryPage = (await this._browser.pages())[0];
    await unnecessaryPage.close();
  }

  async newPage() {
    return this._browser.newPage();
  }

  async pages() {
    return this._browser.pages();
  }

  async close() {
    return this._browser.close();
  }

  async screenshot(page: Page, path: string) {
    if (!existsSync('./tmp')) {
      mkdirSync('./tmp');
    }

    await page.screenshot({
      path,
      type: 'jpeg',
      fullPage: true,
    });
  }

  clean() {
    if (existsSync('./chromium')) {
      rmdirSync('./chromium');
    }
  }
}
