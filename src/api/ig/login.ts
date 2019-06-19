import { Page } from 'puppeteer';
import Browser from '../../browser';

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
    await this.sessionPage.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle0' });

    const {
      entry_data: {
        ProfilePage: [{
          graphql: {
            user
          }
        }]
      }
    } = await this.sessionPage.evaluate('window._sharedData');

    return user;
  }

  async *profileMedia(username: string) {
    await this.sessionPage.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle0' });

    const {
      entry_data: {
        ProfilePage: [{
          graphql: {
            user: {
              edge_owner_to_timeline_media
            }
          }
        }]
      }
    } = await this.sessionPage.evaluate('window._sharedData');

    let media = edge_owner_to_timeline_media;
    do {
      yield media;

      const [res] = await Promise.all([
        this.sessionPage.waitForResponse(res =>
          res.request().resourceType() === 'xhr' &&
          res.url().includes('query_hash')
        ),
        this.sessionPage.evaluate(() => window.scrollTo(0, window.document.body.scrollHeight))
      ]);

      const {
        data: {
          user: {
            edge_owner_to_timeline_media
          }
        }
      } = await res.json();

      media = edge_owner_to_timeline_media;

      const {
        page_info: {
          has_next_page: hasNext
        }
      } = media;

      if (!hasNext) {
        yield media;
        break;
      }

      await this.sessionPage.waitFor(2000);
    } while (true);
  }

  async mediaInfo(shortcode: string) {
    await this.sessionPage.goto(`https://www.instagram.com/p/${shortcode}/`, { waitUntil: 'networkidle0' });

    const {
      entry_data: {
        PostPage: [{
          graphql: {
            shortcode_media
          }
        }]
      }
    } = await this.sessionPage.evaluate('window._sharedData');

    return shortcode_media;
  }

  async * mediaComments(shortcode: string) {
    await this.sessionPage.goto(`https://www.instagram.com/p/${shortcode}/comments/`, { waitUntil: 'networkidle0' });

    const {
      entry_data: {
        MobileAllCommentsPage: [{
          graphql: {
            shortcode_media: {
              edge_media_to_parent_comment
            }
          }
        }]
      }
    } = await this.sessionPage.evaluate('window._sharedData');

    let comments = edge_media_to_parent_comment;
    do {
      yield comments;

      const [res] = await Promise.all([
        this.sessionPage.waitForResponse(res =>
          res.request().resourceType() === 'xhr' &&
          res.url().includes('query_hash') &&
          res.url().includes(`shortcode%22%3A%22${shortcode}`),
        ),
        this.sessionPage.tap('button.afkep'),
      ]);

      const {
        data: {
          shortcode_media: {
            edge_media_to_parent_comment
          }
        }
      } = await res.json();

      comments = edge_media_to_parent_comment;

      const {
        page_info: {
          has_next_page: hasNext
        }
      } = comments;

      if (!hasNext) {
        yield comments;
        break;
      }

      await this.sessionPage.waitFor(2000);
    } while (true);
  }
}
