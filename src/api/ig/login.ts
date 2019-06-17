import { Page } from 'puppeteer';
import Browser from '../../browser';
import camelcase from 'camelcase-keys'

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
    await this.sessionPage.goto(`https://www.instagram.com/${username}/`);

    const {
      entry_data: {
        ProfilePage: [{
          graphql: {
            user
          }
        }]
      }
    } = await this.sessionPage.evaluate('window._sharedData');

    const {
      full_name,
      biography,
      business_category_name,
      followed_by_viewer,
      follows_viewer,
      has_blocked_viewer,
      has_requested_viewer,
      requested_by_viewer,
      profile_pic_url_hd,
      edge_follow: {
        count: followCount,
      },
      edge_followed_by: {
        count: followedByCount,
      },
      edge_mutual_followed_by: {
        count: mutualFollowedByCount,
      },
      edge_owner_to_timeline_media: {
        count: mediaCount,
      },
      is_business_account,
      is_joined_recently,
      is_private,
      is_verified,
    } = user;

    return camelcase({
      username,
      full_name,
      biography,
      business_category_name,
      followed_by_viewer,
      follows_viewer,
      has_blocked_viewer,
      has_requested_viewer,
      requested_by_viewer,
      profile_pic_url_hd,
      followCount,
      followedByCount,
      mutualFollowedByCount,
      mediaCount,
      is_business_account,
      is_joined_recently,
      is_private,
      is_verified,
    });
  }

  async *profileMedia(username: string) {
    let [curRes] = await Promise.all([
      this.sessionPage.waitForResponse(res =>
        res.request().resourceType() === 'xhr' &&
        res.url().includes('query_hash') &&
        res.url().includes('first%22%3A12')
      ),
      this.sessionPage.goto(`https://www.instagram.com/${username}/`),
    ]);

    do {
      const {
        data: {
          user: {
            edge_owner_to_timeline_media: {
              edges
            }
          }
        }
      } = await curRes.json();

      for (const edge of edges) {
        const {
          node: {
            display_resources,
            comments_disabled,
            edge_media_preview_like: {
              count: mediaPreviewLikeCount
            },
            edge_media_to_comment: {
              count: edgeMediaToCommentCount
            },
            is_video,
            location = {},
            taken_at_timestamp,
            viewer_can_reshare,
            viewer_has_liked,
            viewer_has_saved,
            viewer_has_saved_to_collection,
            viewer_in_photo_of_you,
          }
        } = edge;

        yield camelcase({
          display_resources,
          comments_disabled,
          mediaPreviewLikeCount,
          edgeMediaToCommentCount,
          is_video,
          location,
          taken_at_timestamp,
          viewer_can_reshare,
          viewer_has_liked,
          viewer_has_saved,
          viewer_has_saved_to_collection,
          viewer_in_photo_of_you,
        }, { deep: true });
      }

      [curRes] = await Promise.all([
        this.sessionPage.waitForResponse(res =>
          res.request().resourceType() === 'xhr' &&
          res.url().includes('query_hash') &&
          res.url().includes('first%22%3A12')
        ),
        this.sessionPage.evaluate(() => window.scrollTo(0, window.document.body.scrollHeight))
      ]);

      const {
        data: {
          user: {
            edge_owner_to_timeline_media: {
              page_info: {
                has_next_page: hasNext
              }
            }
          }
        }
      } = await curRes.json();

      if (!hasNext) {
        break;
      }
    } while (true);
  }
}
