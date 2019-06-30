import { Page, ElementHandle } from 'puppeteer';
import Browser from '../../browser';
import fetch from 'node-fetch';
import querystring from 'querystring';
import { question } from 'readline-sync';

export default class IGApi {

  readonly sessionPage: Page;

  async prepare() {
    this.sessionPage = await Browser.newPage();
  }

  // Login actions

  private async isLoggedIn() {
    const html = await this.sessionPage.$('html');
    const isNotLoggedIn: boolean = await this.sessionPage.evaluate(html => html.classList.contains('not-logged-in'), html);
    return !isNotLoggedIn
  }

  private isChallengeRequired() {
    return this.sessionPage.url().includes('challenge');
  }

  private async closeAnyHomeScreenDialogsIfNeeded() {
    if (await this.sessionPage.$('div.fPMEg')) {
      await this.sessionPage.tap('button.HoLwm');
    }
    if (await this.sessionPage.$('section.xZ2Xk button')) {
      await this.sessionPage.tap('section.xZ2Xk button');
    }
  }

  async logIn(username: string, password: string) {
    await this.sessionPage.goto('https://www.instagram.com/', { waitUntil: 'networkidle0' });

    if (await this.isLoggedIn()) {
      await this.closeAnyHomeScreenDialogsIfNeeded();
      return;
    }

    await this.sessionPage.tap('button.L3NKy');
    await this.sessionPage.waitFor(2000);

    const inputs = await this.sessionPage.$$('input.zyHYP');
    await inputs[0].type(username, { delay: 100 });
    await inputs[1].type(password, { delay: 100 });

    let $button: ElementHandle<Element> | null = null;
    for (const $element of (await this.sessionPage.$$('button.L3NKy'))) {
      const textContent: string = await this.sessionPage.evaluate(element => element.textContent, $element)
      if (textContent === 'Log In') {
        $button = $element;
        break;
      }
    }

    await Promise.all([
      this.sessionPage.waitForNavigation({ waitUntil: 'networkidle0' }),
      $button!.tap(),
    ]);

    if (this.isChallengeRequired()) {
      const $sendButton = await this.sessionPage.waitForSelector('form.JraEb  button');
      await $sendButton.tap();

      const $codeInput = await this.sessionPage.waitForSelector('input[name=security_code]');
      const code = question('Enter Your Security Code: ');
      await $codeInput.type(code, { delay: 100 });

      const $submitButton = await this.sessionPage.waitForSelector('form.JraEb  button');
      await $submitButton.tap();
    }
  }

  // Menu

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

    await this.sessionPage.waitFor(2000);
  }

  // Profile actions

  async profileInfo(username: string, page?: Page) {
    const currentPage = page ? page : this.sessionPage;

    await currentPage.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle0' });

    const {
      entry_data: {
        ProfilePage: [{
          graphql: {
            user
          }
        }]
      }
    } = await currentPage.evaluate('window._sharedData');

    return user;
  }

  async * profileMedia(username: string) {
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

  private async * _profileFollowersBase(type: 'after' | 'before', username: string, cursor: string) {
    let json;
    let currentCursor = cursor;

    const baseUriComponents = {
      'query_hash': await this.followersQueryHash(),
      'variables': `{"id":"${await this.profileIdFromUsername(username)}","include_reel":true,"fetch_mutual":true,"first":12,`,
    };
    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Csrftoken': await this.csrfToken(),
      'X-Ig-App-Id': await this.instagramWebFBAppId(),
      'X-Instagram-Ajax': await this.rolloutHash(),
      'X-Requested-With': 'XMLHttpRequest',
    };

    do {
      const uriComponents = {
        'query_hash': baseUriComponents.query_hash,
        'variables': baseUriComponents.variables + `"${type}":"${currentCursor}"}`,
      };
      const uri = `https://www.instagram.com/graphql/query/?${querystring.stringify(uriComponents)}`;
      json = await this.sessionPage.evaluate(async (uri, headers, username) => {
        const response = await window.fetch(uri, {
          method: 'GET',
          mode: 'cors',
          headers: new Headers(headers),
          credentials: 'include',
          referrer: `https://www.instagram.com/${username}/followers/`,
          referrerPolicy: 'no-referrer-when-downgrade',
        });
        if (response.status !== 200) {
          throw new Error(`Response code is ${response.statusText}. Something went wrong.`);
        }
        return response.json();
      }, uri, headers, username);

      if (json.status !== 'ok') {
        throw new Error(`Response status is ${json.status}. Something went wrong.`);
      }

      yield json;

      const {
        data: {
          user: {
            edge_followed_by: {
              page_info: {
                end_cursor: newCursor,
                has_next_page: hasNext,
              }
            }
          }
        }
      } = json;

      if (!hasNext) {
        break;
      }
      if (type === 'before') {
        break;
      }

      currentCursor = newCursor;

      await this.sessionPage.waitFor(2000);
    } while (true);
  }

  async * profileFollowersAfter(username: string, cursor: string) {
    if (this.sessionPage.url() !== `https://www.instagram.com/${username}/`) {
      await this.sessionPage.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle0' });
    }

    yield* this._profileFollowersBase('after', username, cursor);
  }

  async profileFollowersBefore(username: string, cursor: string) {
    if (this.sessionPage.url() !== `https://www.instagram.com/${username}/`) {
      await this.sessionPage.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle0' });
    }

    const { value } = await this._profileFollowersBase('before', username, cursor).next();
    return value;
  }

  async * profileFollowers(username: string) {
    await this.sessionPage.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle0' });

    const uriComponents = {
      'query_hash': await this.followersQueryHash(),
      'variables': `{"id":"${await this.profileIdFromUsername(username)}","include_reel":true,"fetch_mutual":true,"first":24}`,
    };
    const uri = `https://www.instagram.com/graphql/query/?${querystring.stringify(uriComponents)}`;
    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Csrftoken': await this.csrfToken(),
      'X-Ig-App-Id': await this.instagramWebFBAppId(),
      'X-Instagram-Ajax': await this.rolloutHash(),
      'X-Requested-With': 'XMLHttpRequest',
    };
    const json = await this.sessionPage.evaluate(async (uri, headers, username) => {
      const response = await window.fetch(uri, {
        method: 'GET',
        mode: 'cors',
        headers: new Headers(headers),
        credentials: 'include',
        referrer: `https://www.instagram.com/${username}/followers/`,
        referrerPolicy: 'no-referrer-when-downgrade',
      });
      if (response.status !== 200) {
        throw new Error(`Response code is ${response.statusText}. Something went wrong.`);
      }
      return response.json();
    }, uri, headers, username);

    if (json.status !== 'ok') {
      throw new Error(`Response status is ${json.status}. Something went wrong.`);
    }

    yield json;

    const {
      data: {
        user: {
          edge_followed_by: {
            page_info: {
              end_cursor: newCursor,
              has_next_page: hasNext,
            }
          }
        }
      }
    } = json;

    if (hasNext) {
      yield* this.profileFollowersAfter(username, newCursor);
    }
  }

  private async * _profileFollowingBase(type: 'after' | 'before', username: string, cursor: string) {
    let json;
    let currentCursor = cursor;

    const baseUriComponents = {
      'query_hash': await this.followingQueryHash(),
      'variables': `{"id":"${await this.profileIdFromUsername(username)}","include_reel":true,"fetch_mutual":false,"first":12,`,
    };
    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Csrftoken': await this.csrfToken(),
      'X-Ig-App-Id': await this.instagramWebFBAppId(),
      'X-Instagram-Ajax': await this.rolloutHash(),
      'X-Requested-With': 'XMLHttpRequest',
    };

    do {
      const uriComponents = {
        'query_hash': baseUriComponents.query_hash,
        'variables': baseUriComponents.variables + `"${type}":"${currentCursor}"}`,
      };
      const uri = `https://www.instagram.com/graphql/query/?${querystring.stringify(uriComponents)}`;
      json = await this.sessionPage.evaluate(async (uri, headers, username) => {
        const response = await window.fetch(uri, {
          method: 'GET',
          mode: 'cors',
          headers: new Headers(headers),
          credentials: 'include',
          referrer: `https://www.instagram.com/${username}/following/`,
          referrerPolicy: 'no-referrer-when-downgrade',
        });
        if (response.status !== 200) {
          throw new Error(`Response code is ${response.statusText}. Something went wrong.`);
        }
        return response.json();
      }, uri, headers, username);

      if (json.status !== 'ok') {
        throw new Error(`Response status is ${json.status}. Something went wrong.`);
      }

      yield json;

      const {
        data: {
          user: {
            edge_follow: {
              page_info: {
                end_cursor: newCursor,
                has_next_page: hasNext,
              }
            }
          }
        }
      } = json;

      if (!hasNext) {
        break;
      }
      if (type === 'before') {
        break;
      }

      currentCursor = newCursor;

      await this.sessionPage.waitFor(2000);
    } while (true);
  }

  async * profileFollowingAfter(username: string, cursor: string) {
    if (this.sessionPage.url() !== `https://www.instagram.com/${username}/`) {
      await this.sessionPage.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle0' });
    }

    yield* this._profileFollowingBase('after', username, cursor);
  }

  async profileFollowingBefore(username: string, cursor: string) {
    if (this.sessionPage.url() !== `https://www.instagram.com/${username}/`) {
      await this.sessionPage.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle0' });
    }

    const { value } = await this._profileFollowingBase('before', username, cursor).next();
    return value;
  }

  async * profileFollowing(username: string) {
    await this.sessionPage.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle0' });

    const uriComponents = {
      'query_hash': await this.followingQueryHash(),
      'variables': `{"id":"${await this.profileIdFromUsername(username)}","include_reel":true,"fetch_mutual":false,"first":24}`,
    };
    const uri = `https://www.instagram.com/graphql/query/?${querystring.stringify(uriComponents)}`;
    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Csrftoken': await this.csrfToken(),
      'X-Ig-App-Id': await this.instagramWebFBAppId(),
      'X-Instagram-Ajax': await this.rolloutHash(),
      'X-Requested-With': 'XMLHttpRequest',
    };
    const json = await this.sessionPage.evaluate(async (uri, headers, username) => {
      const response = await window.fetch(uri, {
        method: 'GET',
        mode: 'cors',
        headers: new Headers(headers),
        credentials: 'include',
        referrer: `https://www.instagram.com/${username}/following/`,
        referrerPolicy: 'no-referrer-when-downgrade',
      });
      if (response.status !== 200) {
        throw new Error(`Response code is ${response.statusText}. Something went wrong.`);
      }
      return response.json();
    }, uri, headers, username);

    if (json.status !== 'ok') {
      throw new Error(`Response status is ${json.status}. Something went wrong.`);
    }

    yield json;

    const {
      data: {
        user: {
          edge_follow: {
            page_info: {
              end_cursor: newCursor,
              has_next_page: hasNext,
            }
          }
        }
      }
    } = json;

    if (hasNext) {
      yield* this.profileFollowingAfter(username, newCursor);
    }
  }

  private async _profileFollowUnfollowBase(type: 'follow' | 'unfollow', username: string) {
    const {
      followed_by_viewer: followedByViewer,
      requested_by_viewer: requestedByViewer,
      id,
    } = await this.profileInfo(username);

    if (type === 'follow' && followedByViewer) {
      throw new Error(`You're already followed @${username}.`);
    }
    if (type === 'follow' && requestedByViewer) {
      throw new Error(`You're requsted @${username}.`);
    }
    if (type === 'unfollow' && !followedByViewer) {
      throw new Error(`You're already unfollowed @${username}.`);
    }

    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Csrftoken': await this.csrfToken(),
      'X-Ig-App-Id': await this.instagramWebFBAppId(),
      'X-Instagram-Ajax': await this.rolloutHash(),
      'X-Requested-With': 'XMLHttpRequest',
    };
    const uri = `https://www.instagram.com/web/friendships/${id}/${type}/`;
    const json = await this.sessionPage.evaluate(async (uri, headers, username) => {
      const response = await window.fetch(uri, {
        method: 'POST',
        mode: 'cors',
        headers: new Headers(headers),
        credentials: 'include',
        referrer: `https://www.instagram.com/${username}/`,
        referrerPolicy: 'no-referrer-when-downgrade',
      });
      if (response.status !== 200) {
        throw new Error(`Response code is ${response.statusText}. Something went wrong.`);
      }
      return response.json();
    }, uri, headers, username);

    if (json.status !== 'ok') {
      throw new Error(`Response status is ${json.status}. Something went wrong.`);
    }

    return json;
  }

  async profileFollow(username: string) {
    return this._profileFollowUnfollowBase('follow', username);
  }

  async profileUnfollow(username: string) {
    return this._profileFollowUnfollowBase('unfollow', username);
  }

  // Media actions

  async mediaInfo(shortcode: string, page?: Page) {
    const currentPage = page ? page : this.sessionPage;

    await currentPage.goto(`https://www.instagram.com/p/${shortcode}/`, { waitUntil: 'networkidle0' });

    const {
      entry_data: {
        PostPage: [{
          graphql: {
            shortcode_media
          }
        }]
      }
    } = await currentPage.evaluate('window._sharedData');

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

  async mediaComment(shortcode: string, text: string, commentId: string = '') {
    await this.sessionPage.goto(`https://www.instagram.com/p/${shortcode}/comments/`, { waitUntil: 'networkidle0' });

    const uri = `https://www.instagram.com/web/comments/${await this.mediaIdFromShortcode(shortcode)}/add/`;
    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Csrftoken': await this.csrfToken(),
      'X-Ig-App-Id': await this.instagramWebFBAppId(),
      'X-Instagram-Ajax': await this.rolloutHash(),
      'X-Requested-With': 'XMLHttpRequest',
    };
    const body = `comment_text=${text}&replied_to_comment_id=${commentId}`;
    const json = await this.sessionPage.evaluate(async (uri, headers, body, shortcode) => {
      const response = await window.fetch(uri, {
        method: 'POST',
        mode: 'cors',
        headers: new Headers(headers),
        body,
        credentials: 'include',
        referrer: `https://www.instagram.com/p/${shortcode}/comments/`,
        referrerPolicy: 'no-referrer-when-downgrade',
      });
      if (response.status !== 200) {
        throw new Error(`Response code is ${response.statusText}. Something went wrong.`);
      }
      return response.json();
    }, uri, headers, body, shortcode);

    if (json.status !== 'ok') {
      throw new Error(`Response status is ${json.status}. Something went wrong.`);
    }

    return json;
  }

  private async _mediaCommentLikeUnlikeBase(type: 'like' | 'unlike', shortcode: string, commentId: string) {
    await this.sessionPage.goto(`https://www.instagram.com/p/${shortcode}/comments/`, { waitUntil: 'networkidle0' });

    const uri = `https://www.instagram.com/web/comments/${type}/${commentId}/`;
    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Csrftoken': await this.csrfToken(),
      'X-Ig-App-Id': await this.instagramWebFBAppId(),
      'X-Instagram-Ajax': await this.rolloutHash(),
      'X-Requested-With': 'XMLHttpRequest',
    };
    const json = await this.sessionPage.evaluate(async (uri, headers, shortcode) => {
      const response = await window.fetch(uri, {
        method: 'POST',
        mode: 'cors',
        headers: new Headers(headers),
        credentials: 'include',
        referrer: `https://www.instagram.com/p/${shortcode}/comments/`,
        referrerPolicy: 'no-referrer-when-downgrade',
      });
      if (response.status !== 200) {
        throw new Error(`Response code is ${response.statusText}. Something went wrong.`);
      }
      return response.json();
    }, uri, headers, shortcode);

    if (json.status !== 'ok') {
      throw new Error(`Response status is ${json.status}. Something went wrong.`);
    }

    return json;
  }

  async mediaCommentLike(shortcode: string, commentId: string) {
    return this._mediaCommentLikeUnlikeBase('like', shortcode, commentId);
  }

  async mediaCommentUnlike(shortcode: string, commentId: string) {
    return this._mediaCommentLikeUnlikeBase('unlike', shortcode, commentId);
  }

  async mediaCommentSpamReport(shortcode: string, commentId: string) {
    await this.sessionPage.goto(`https://www.instagram.com/p/${shortcode}/comments/`, { waitUntil: 'networkidle0' });

    const uri = `https://www.instagram.com/media/${await this.mediaIdFromShortcode(shortcode)}/comment/${commentId}/flag/`;
    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Csrftoken': await this.csrfToken(),
      'X-Ig-App-Id': await this.instagramWebFBAppId(),
      'X-Instagram-Ajax': await this.rolloutHash(),
      'X-Requested-With': 'XMLHttpRequest',
    };
    const body = 'reason_id=1';
    const json = await this.sessionPage.evaluate(async (uri, headers, body, shortcode) => {
      const response = await window.fetch(uri, {
        method: 'POST',
        mode: 'cors',
        headers: new Headers(headers),
        body,
        credentials: 'include',
        referrer: `https://www.instagram.com/p/${shortcode}/comments/`,
        referrerPolicy: 'no-referrer-when-downgrade',
      });
      if (response.status !== 200) {
        throw new Error(`Response code is ${response.statusText}. Something went wrong.`);
      }
      return response.json();
    }, uri, headers, body, shortcode);

    if (json.status !== 'ok') {
      throw new Error(`Response status is ${json.status}. Something went wrong.`);
    }

    return json;
  }

  async mediaCommentDelete(shortcode: string, commentId: string) {
    await this.sessionPage.goto(`https://www.instagram.com/p/${shortcode}/comments/`, { waitUntil: 'networkidle0' });

    const uri = `https://www.instagram.com/web/comments/${await this.mediaIdFromShortcode(shortcode)}/delete/${commentId}/`;
    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Csrftoken': await this.csrfToken(),
      'X-Ig-App-Id': await this.instagramWebFBAppId(),
      'X-Instagram-Ajax': await this.rolloutHash(),
      'X-Requested-With': 'XMLHttpRequest',
    };
    const json = await this.sessionPage.evaluate(async (uri, headers, shortcode) => {
      const response = await window.fetch(uri, {
        method: 'POST',
        mode: 'cors',
        headers: new Headers(headers),
        credentials: 'include',
        referrer: `https://www.instagram.com/p/${shortcode}/comments/`,
        referrerPolicy: 'no-referrer-when-downgrade',
      });
      if (response.status !== 200) {
        throw new Error(`Response code is ${response.statusText}. Something went wrong.`);
      }
      return response.json();
    }, uri, headers, shortcode);

    if (json.status !== 'ok') {
      throw new Error(`Response status is ${json.status}. Something went wrong.`);
    }

    return json;
  }

  private async _mediaLikeUnlikeBase(type: 'like' | 'unlike', shortcode: string) {
    await this.sessionPage.goto(`https://www.instagram.com/p/${shortcode}/`, { waitUntil: 'networkidle0' });

    const $span = await this.sessionPage.$('span.fr66n > button.afkep > span');
    if (await this.sessionPage.evaluate((span, type) =>
      span.attributes['aria-label'].textContent !== `${type.charAt(0).toUpperCase()}${type.slice(1)}`
      , $span, type)) {
      throw new Error(`Can't ${type} ${type}d post.`);
    }

    const [response] = await Promise.all([
      this.sessionPage.waitForResponse(response =>
        response.url().includes('/like/') || response.url().includes('/unlike/')
      ),
      $span!.tap(),
    ]);
    if (response.status() === 400) {
      throw new Error('You’re Temporarily Blocked.');
    }
    if (response.status() !== 200) {
      throw new Error(`Response code is ${response.statusText}. Something went wrong.`)
    }

    return response.json();
  }

  async mediaLike(shortcode: string) {
    return this._mediaLikeUnlikeBase('like', shortcode);
  }

  async mediaUnlike(shortcode: string) {
    return this._mediaLikeUnlikeBase('unlike', shortcode);
  }

  // Report actions

  async profileSpamReport(username: string) {
    await this.sessionPage.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle0' });

    const uri = `https://www.instagram.com/users/${await this.profileIdFromUsername(username)}/report/`;
    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Csrftoken': await this.csrfToken(),
      'X-Ig-App-Id': await this.instagramWebFBAppId(),
      'X-Instagram-Ajax': await this.rolloutHash(),
      'X-Requested-With': 'XMLHttpRequest',
    };
    const body = 'source_name=profile&reason_id=1';
    const json = await this.sessionPage.evaluate(async (uri, headers, body, username) => {
      const response = await window.fetch(uri, {
        method: 'POST',
        mode: 'cors',
        headers: new Headers(headers),
        body,
        credentials: 'include',
        referrer: `https://www.instagram.com/${username}/`,
        referrerPolicy: 'no-referrer-when-downgrade',
      });
      if (response.status !== 200) {
        throw new Error(`Response code is ${response.statusText}. Something went wrong.`);
      }
      return response.json();
    }, uri, headers, body, username);

    if (json.status !== 'ok') {
      throw new Error(`Response status is ${json.status}. Something went wrong.`);
    }

    return json;
  }

  async mediaSpamReport(shortcode: string) {
    await this.sessionPage.goto(`https://www.instagram.com/p/${shortcode}/`, { waitUntil: 'networkidle0' });

    const uri = `https://www.instagram.com/media/${await this.mediaIdFromShortcode(shortcode)}/flag/`;
    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Csrftoken': await this.csrfToken(),
      'X-Ig-App-Id': await this.instagramWebFBAppId(),
      'X-Instagram-Ajax': await this.rolloutHash(),
      'X-Requested-With': 'XMLHttpRequest',
    };
    const body = 'reason_id=1';
    const json = await this.sessionPage.evaluate(async (uri, headers, body, shortcode) => {
      const response = await window.fetch(uri, {
        method: 'POST',
        mode: 'cors',
        headers: new Headers(headers),
        body,
        credentials: 'include',
        referrer: `https://www.instagram.com/p/${shortcode}/`,
        referrerPolicy: 'no-referrer-when-downgrade',
      });
      if (response.status !== 200) {
        throw new Error(`Response code is ${response.statusText}. Something went wrong.`);
      }
      return response.json();
    }, uri, headers, body, shortcode);

    if (json.status !== 'ok') {
      throw new Error(`Response status is ${json.status}. Something went wrong.`);
    }

    return json;
  }

  // Feed actions

  async feedReels() {
    await this.sessionPage.goto(`https://www.instagram.com/`, { waitUntil: 'networkidle0' });

    const uriComponents = {
      'query_hash': await this.feedReelsQueryHash(),
      'variables': '{"only_stories":true,"stories_prefetch":true,"stories_video_dash_manifest":false}',
    };
    const uri = `https://www.instagram.com/graphql/query/?${querystring.stringify(uriComponents)}`;
    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    const json = await this.sessionPage.evaluate(async (uri, headers) => {
      const response = await window.fetch(uri, {
        method: 'GET',
        mode: 'cors',
        headers: new Headers(headers),
        credentials: 'include',
        referrer: 'https://www.instagram.com/',
        referrerPolicy: 'no-referrer-when-downgrade',
      });
      if (response.status !== 200) {
        throw new Error(`Response code is ${response.statusText}. Something went wrong.`);
      }
      return response.json();
    }, uri, headers);

    if (json.status !== 'ok') {
      throw new Error(`Response status is ${json.status}. Something went wrong.`);
    }

    return json;
  }

  private async * _feedBase(cursor: string) {
    let json;
    let currentCursor = cursor;

    const baseUriComponents = {
      'query_hash': await this.feedQueryHash(),
      'variables': '{"cached_feed_item_ids":[],"fetch_media_item_count":12,',
      'variables_end': '"fetch_comment_count":4,"fetch_like":3,"has_stories":false,"has_threaded_comments":true}',
    };
    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Ig-App-Id': await this.instagramWebFBAppId(),
      'X-Requested-With': 'XMLHttpRequest',
    };

    do {
      const uriComponents = {
        'query_hash': baseUriComponents.query_hash,
        'variables': baseUriComponents.variables + `"fetch_media_item_cursor":"${currentCursor}",${baseUriComponents.variables_end}`,
      };
      const uri = `https://www.instagram.com/graphql/query/?${querystring.stringify(uriComponents)}`;
      json = await this.sessionPage.evaluate(async (uri, headers) => {
        const response = await window.fetch(uri, {
          method: 'GET',
          mode: 'cors',
          headers: new Headers(headers),
          credentials: 'include',
          referrer: `https://www.instagram.com/`,
          referrerPolicy: 'no-referrer-when-downgrade',
        });
        if (response.status !== 200) {
          throw new Error(`Response code is ${response.statusText}. Something went wrong.`);
        }
        return response.json();
      }, uri, headers);

      if (json.status !== 'ok') {
        throw new Error(`Response status is ${json.status}. Something went wrong.`);
      }

      yield json;

      const {
        data: {
          user: {
            edge_web_feed_timeline: {
              page_info: {
                end_cursor: newCursor,
                has_next_page: hasNext,
              }
            }
          }
        }
      } = json;

      if (!hasNext) {
        break;
      }

      currentCursor = newCursor;

      await this.sessionPage.waitFor(2000);
    } while (true);
  }

  async * feed() {
    await this.sessionPage.goto(`https://www.instagram.com/`, { waitUntil: 'networkidle0' });

    const { feed } = await this.sessionPage.evaluate('window.__additionalData');

    yield feed;

    const {
      data: {
        user: {
          edge_web_feed_timeline: {
            page_info: {
              end_cursor: cursor,
              has_next_page: hasNext,
            }
          }
        }
      }
    } = feed;

    if (hasNext) {
      yield* this._feedBase(cursor);
    }
  }

  private async * _discoverBase(cursor: string) {
    let json;
    let currentCursor = cursor;

    const baseUriComponents = {
      'query_hash': await this.discoverQueryHash(),
      'variables': `{"first":24,`,
    };
    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Ig-App-Id': await this.instagramWebFBAppId(),
      'X-Requested-With': 'XMLHttpRequest',
    };

    do {
      const uriComponents = {
        'query_hash': baseUriComponents.query_hash,
        'variables': baseUriComponents.variables + `"after":"${currentCursor}"}`,
      };
      const uri = `https://www.instagram.com/graphql/query/?${querystring.stringify(uriComponents)}`;
      json = await this.sessionPage.evaluate(async (uri, headers) => {
        const response = await window.fetch(uri, {
          method: 'GET',
          mode: 'cors',
          headers: new Headers(headers),
          credentials: 'include',
          referrer: 'https://www.instagram.com/explore/',
          referrerPolicy: 'no-referrer-when-downgrade',
        });
        if (response.status !== 200) {
          throw new Error(`Response code is ${response.statusText}. Something went wrong.`);
        }
        return response.json();
      }, uri, headers);

      if (json.status !== 'ok') {
        throw new Error(`Response status is ${json.status}. Something went wrong.`);
      }

      yield json;

      const {
        data: {
          user: {
            edge_web_discover_media: {
              page_info: {
                end_cursor: newCursor,
                has_next_page: hasNext,
              }
            }
          }
        }
      } = json;

      if (!hasNext) {
        break;
      }

      currentCursor = newCursor;

      await this.sessionPage.waitFor(2000);
    } while (true);
  }

  // Explore actions

  async * discoverFeed() {
    await this.sessionPage.goto('https://www.instagram.com/explore/', { waitUntil: 'networkidle0' });

    const uriComponents = {
      'query_hash': await this.discoverQueryHash(),
      'variables': `{"first":24}`,
    };
    const uri = `https://www.instagram.com/graphql/query/?${querystring.stringify(uriComponents)}`;
    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Ig-App-Id': await this.instagramWebFBAppId(),
      'X-Requested-With': 'XMLHttpRequest',
    };
    const json = await this.sessionPage.evaluate(async (uri, headers) => {
      const response = await window.fetch(uri, {
        method: 'GET',
        mode: 'cors',
        headers: new Headers(headers),
        credentials: 'include',
        referrer: 'https://www.instagram.com/explore/',
        referrerPolicy: 'no-referrer-when-downgrade',
      });
      if (response.status !== 200) {
        throw new Error(`Response code is ${response.statusText}. Something went wrong.`);
      }
      return response.json();
    }, uri, headers);

    if (json.status !== 'ok') {
      throw new Error(`Response status is ${json.status}. Something went wrong.`);
    }

    yield json;

    const {
      data: {
        user: {
          edge_web_discover_media: {
            page_info: {
              end_cursor: newCursor,
              has_next_page: hasNext,
            }
          }
        }
      }
    } = json;

    if (hasNext) {
      yield* this._discoverBase(newCursor);
    }
  }

  private async * _discoverChainingBase(shortcode: string, cursor: string) {
    let json;
    let currentCursor = cursor;

    const baseUriComponents = {
      'query_hash': await this.discoverChainingQueryHash(),
      'variables': `{"media_id":"${await this.mediaIdFromShortcode(shortcode)}","surface":"WEB_EXPLORE_MEDIA_GRID","first":11,`,
    };
    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Ig-App-Id': await this.instagramWebFBAppId(),
      'X-Requested-With': 'XMLHttpRequest',
    };

    do {
      const uriComponents = {
        'query_hash': baseUriComponents.query_hash,
        'variables': baseUriComponents.variables + `"after":"${currentCursor}"}`,
      };
      const uri = `https://www.instagram.com/graphql/query/?${querystring.stringify(uriComponents)}`;
      json = await this.sessionPage.evaluate(async (uri, headers, shortcode) => {
        const response = await window.fetch(uri, {
          method: 'GET',
          mode: 'cors',
          headers: new Headers(headers),
          credentials: 'include',
          referrer: `https://www.instagram.com/p/${shortcode}/?chaining=true`,
          referrerPolicy: 'no-referrer-when-downgrade',
        });
        if (response.status !== 200) {
          throw new Error(`Response code is ${response.statusText}. Something went wrong.`);
        }
        return response.json();
      }, uri, headers, shortcode);

      if (json.status !== 'ok') {
        throw new Error(`Response status is ${json.status}. Something went wrong.`);
      }

      yield json;

      const {
        data: {
          user: {
            edge_web_media_chaining: {
              page_info: {
                end_cursor: newCursor,
                has_next_page: hasNext,
              }
            }
          }
        }
      } = json;

      if (!hasNext) {
        break;
      }

      currentCursor = newCursor;

      await this.sessionPage.waitFor(2000);
    } while (true);
  }

  async * discoverChaining(shortcode: string) {
    await this.sessionPage.goto(`https://www.instagram.com/p/${shortcode}/?chaining=true`, { waitUntil: 'networkidle0' });

    const uriComponents = {
      'query_hash': await this.discoverChainingQueryHash(),
      'variables': `{"media_id":"${await this.mediaIdFromShortcode(shortcode)}","surface":"WEB_EXPLORE_MEDIA_GRID","first":12}`,
    };
    const uri = `https://www.instagram.com/graphql/query/?${querystring.stringify(uriComponents)}`;
    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Ig-App-Id': await this.instagramWebFBAppId(),
      'X-Requested-With': 'XMLHttpRequest',
    };
    const json = await this.sessionPage.evaluate(async (uri, headers, shortcode) => {
      const response = await window.fetch(uri, {
        method: 'GET',
        mode: 'cors',
        headers: new Headers(headers),
        credentials: 'include',
        referrer: `https://www.instagram.com/p/${shortcode}/?chaining=true`,
        referrerPolicy: 'no-referrer-when-downgrade',
      });
      if (response.status !== 200) {
        throw new Error(`Response code is ${response.statusText}. Something went wrong.`);
      }
      return response.json();
    }, uri, headers, shortcode);

    if (json.status !== 'ok') {
      throw new Error(`Response status is ${json.status}. Something went wrong.`);
    }

    yield json;

    const {
      data: {
        user: {
          edge_web_media_chaining: {
            page_info: {
              end_cursor: newCursor,
              has_next_page: hasNext,
            }
          }
        }
      }
    } = json;

    if (hasNext) {
      yield* this._discoverChainingBase(shortcode, newCursor);
    }
  }

  async search(text: string) {
    await this.sessionPage.goto('https://www.instagram.com/explore/search/', { waitUntil: 'networkidle0' });

    const uriComponents = {
      'context': 'blended',
      'query': text,
      'rank_token': Math.random().toString(),
      'include_reel': true,
    };
    const uri = `https://www.instagram.com/web/search/topsearch/?${querystring.stringify(uriComponents)}`;
    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Ig-App-Id': await this.instagramWebFBAppId(),
      'X-Requested-With': 'XMLHttpRequest',
    };
    const json = await this.sessionPage.evaluate(async (uri, headers) => {
      const response = await window.fetch(uri, {
        method: 'GET',
        mode: 'cors',
        headers: new Headers(headers),
        credentials: 'include',
        referrer: 'https://www.instagram.com/explore/search/',
        referrerPolicy: 'no-referrer-when-downgrade',
      });
      if (response.status !== 200) {
        throw new Error(`Response code is ${response.statusText}. Something went wrong.`);
      }
      return response.json();
    }, uri, headers);

    if (json.status !== 'ok') {
      throw new Error(`Response status is ${json.status}. Something went wrong.`);
    }

    return json;
  }

  // Upload action

  async uploadMedia(text: string, path: string) {
    await this.sessionPage.goto('https://www.instagram.com/', { waitUntil: 'networkidle0' });

    await this.menu('upload');
    await (await this.sessionPage.$('nav.NXc7H.f11OC input'))!.uploadFile(path)

    await this.sessionPage.waitForSelector('button.UP43G');
    const [fbUploadResponse] = await Promise.all([
      this.sessionPage.waitForResponse(response => response.url().includes('fb_uploader')),
      this.sessionPage.tap('button.UP43G'),
    ]);
    if (fbUploadResponse.status() !== 200) {
      throw new Error('...');
    }
    const { status: fbUploadStatus } = await fbUploadResponse.json();
    if (fbUploadStatus !== 'ok') {
      throw new Error('...');
    }

    await this.sessionPage.waitForSelector('button.UP43G');
    await this.sessionPage.type('textarea[placeholder="Write a caption…"]', text, { delay: 200 });
    const [configureResponse] = await Promise.all([
      this.sessionPage.waitForResponse(response => response.url().includes('configure')),
      this.sessionPage.tap('button.UP43G'),
    ]);
    if (configureResponse.status() !== 200) {
      throw new Error('...');
    }
    const json = await configureResponse.json();
    const { status: configureStatus } = json;
    if (configureStatus !== 'ok') {
      throw new Error('...');
    }

    return json;
  }

  // Utils

  async profileIdFromUsername(username: string): Promise<string> {
    const page = await Browser.newPage();
    const { id } = await this.profileInfo(username, page);
    await page.close();
    return id;
  }

  async mediaIdFromShortcode(shortcode: string): Promise<string> {
    const page = await Browser.newPage();
    const { id } = await this.mediaInfo(shortcode, page);
    await page.close();
    return id;
  }

  async csrfToken() {
    const cookies = await this.sessionPage.cookies('https://www.instagram.com');
    const { value } = cookies.find(value => value.name === 'csrftoken')!;
    return value;
  }

  async instagramWebFBAppId() {
    const page = await Browser.newPage();
    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle0' });
    const src = await page.evaluate(() => {
      const array = [...document.querySelectorAll('script')];
      return array.find(value => value.src.includes('ConsumerLibCommons.js'))!.src;
    });
    const response = await fetch(src);
    const [, id] = (await response.text()).match(/instagramWebFBAppId='(.+?)'/)!;
    return id;
  }

  async followersQueryHash() {
    const page = await Browser.newPage();
    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle0' });
    const src = await page.evaluate(() => {
      const array = [...document.querySelectorAll('script')];
      return array.find(value => value.src.includes('Consumer.js'))!.src;
    });
    const response = await fetch(src);
    const [, hash] = (await response.text()).match(/FOLLOW_LIST_REQUEST_FAILED.+?"(.+?)"/)!;
    return hash;
  }

  async followingQueryHash() {
    const page = await Browser.newPage();
    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle0' });
    const src = await page.evaluate(() => {
      const array = [...document.querySelectorAll('script')];
      return array.find(value => value.src.includes('Consumer.js'))!.src;
    });
    const response = await fetch(src);
    const [, hash] = (await response.text()).match(/FOLLOW_LIST_REQUEST_FAILED.+?".+?".+?"(.+?)"/)!;
    return hash;
  }

  async feedReelsQueryHash() {
    const page = await Browser.newPage();
    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle0' });
    const src = await page.evaluate(() => {
      const array = [...document.querySelectorAll('script')];
      return array.find(value => value.src.includes('Consumer.js'))!.src;
    });
    const response = await fetch(src);
    const [, hash] = (await response.text()).match(/FEED_PAGE_EXTRAS_QUERY_ID="(.+?)"/)!;
    return hash;
  }

  async feedQueryHash() {
    const page = await Browser.newPage();
    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle0' });
    const src = await page.evaluate(() => {
      const array = [...document.querySelectorAll('script')];
      return array.find(value => value.src.includes('Consumer.js'))!.src;
    });
    const response = await fetch(src);
    const [, hash] = (await response.text()).match(/graphql\/query\/.+?"(.+?)"/)!;
    return hash;
  }

  async discoverQueryHash() {
    const page = await Browser.newPage();
    await page.goto('https://www.instagram.com/explore/', { waitUntil: 'networkidle0' });
    const src = await page.evaluate(() => {
      const array = [...document.querySelectorAll('script')];
      return array.find(value => value.src.includes('DiscoverMediaPageContainer.js'))!.src;
    });
    const response = await fetch(src);
    const [, hash] = (await response.text()).match(/discover.pagination.+?"(.+?)"/)!;
    return hash;
  }

  async discoverChainingQueryHash() {
    const src = await this.sessionPage.evaluate(() => {
      const array = [...document.querySelectorAll('script')];
      return array.find(value => value.src.includes('MediaChainingPageContainer.js'))!.src;
    });
    const response = await fetch(src);
    const [, hash] = (await response.text()).match(/discoverChaining.+?"(.+?)"/)!;
    return hash;
  }

  async rolloutHash(): Promise<string> {
    const { rollout_hash } = await this.sessionPage.evaluate('window._sharedData');
    return rollout_hash;
  }
}