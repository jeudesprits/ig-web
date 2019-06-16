import { Page } from 'puppeteer';
import Browser from '../../browser';
import axios from 'axios';

export const timeout = async (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

export default class IGApi {

  private sessionPage: Page;

  async prepare() {
    this.sessionPage = await Browser.newPage();
  }

  private async isLoggedIn() {
    const html = await this.sessionPage.$('html');
    const isNotLoggedIn: boolean = await this.sessionPage.evaluate(html => html.classList.contains('not-logged-in'), html);
    return !isNotLoggedIn
  }

  private isChallengeRequired() {
    return this.sessionPage.url().includes('challenge');
  }

  private async closeHomeScreenDialogIfNeeded() {
    if (await this.sessionPage.$('div.fPMEg')) {
      await this.sessionPage.tap('button.HoLwm');
    }
  }

  async logIn(username: string, password: string) {
    await this.sessionPage.goto('https://www.instagram.com', { waitUntil: 'networkidle0' });

    if (await this.isLoggedIn()) {
      await this.closeHomeScreenDialogIfNeeded();
      return;
    }

    await this.sessionPage.tap('button.L3NKy');
    await timeout(2000);

    const inputs = await this.sessionPage.$$('input.zyHYP');
    await inputs[0].type(username, { delay: 100 });
    await inputs[1].type(password, { delay: 100 });
    await Promise.all([
      this.sessionPage.waitForNavigation({ waitUntil: 'networkidle0' }),
      this.sessionPage.tap('button.L3NKy'),
    ]);

    if (this.isChallengeRequired()) {
      console.log('Boom!');
    }
  }

  async menu(section: 'home' | 'explore' | 'upload' | 'activity' | 'profile') {
    const menu = await this.sessionPage.$$('div.q02Nz');

    if (menu.length === 0) {
      return;
    }

    switch (section) {
      case 'home':
        await menu[0].tap();
        break;
      case 'explore':
        await menu[1].tap();
        break;
      case 'upload':
        await menu[2].tap();
        break;
      case 'activity':
        await menu[3].tap();
        break;
      case 'profile':
        await menu[4].tap();
        break;
    }

    await timeout(2000);
  }

  async profileInfo(username: string) {
    const { data } = await axios.get(`https://www.instagram.com/${username}/?__a=1`);
    return {
      'username': data.graphql.user.username,
      'fullName': data.graphql.user.full_name,
      'biography': data.graphql.user.biography,
      'businessCategoryName': data.graphql.user.business_category_name,
      'followCount': data.graphql.user.edge_follow.count,
      'followedByCount': data.graphql.user.edge_followed_by.count,
      'meidaCount': data.graphql.user.edge_owner_to_timeline_media.count,
      'followedByViewer': data.graphql.user.followed_by_viewer,
      'followsViewer': data.graphql.user.follows_viewer,
      'requestedByViewer': data.graphql.user.requested_by_viewer,
    }
  }

  async *profileMedia(username: string) {
    await this.sessionPage.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle0' });

    const { meidaCount } = await this.profileInfo(username);
    let curCount = 0;

    do {
      const rows = await this.sessionPage.$$('article.FyNDV > div > div > div:nth-last-child(-n+8)');

      for (const row of rows) {
        for (const item of (await row.$$('div._bz0w'))) {
          const a = await item.$('a');
          const href = await a!.getProperty('href');
          const img = await item.$('img');
          const srcset = await img!.getProperty('srcset');
          yield {
            href: await href.jsonValue(),
            images: await srcset.jsonValue(),
          };
        }
      }

      await this.sessionPage.evaluate(() => window.scrollTo(0, window.document.body.scrollHeight));
      await timeout(2000);

      curCount += rows.length;
    } while (curCount < meidaCount);
  }
}
