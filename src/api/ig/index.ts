import { Page } from 'puppeteer';
import Browser from '../../browser';
import fetch from 'node-fetch';
import { stringify } from 'querystring';
import { question, keyInSelect } from 'readline-sync';

export default class IGApi {
    readonly Result: Promise<void>;

    private _sessionPage: Page;

    get sessionPage() {
        return this._sessionPage;
    }

    private cache: any = {};

    private browser: Browser;

    constructor(browser: Browser) {
        this.browser = browser;
        this.Result = (async () => this.prepare())();
    }

    private async prepare() {
        this._sessionPage = await this.browser.newPage();
    }

    // Login actions

    async isLoggedIn() {
        const $html = await this._sessionPage.$('html');
        const isNotLoggedIn: boolean = await this._sessionPage.evaluate(
            html => html.classList.contains('not-logged-in'),
            $html,
        );
        return !isNotLoggedIn;
    }

    private async closeAnyHomeScreenDialogsIfNeeded() {
        try {
            const $cancel = await this._sessionPage.waitForSelector('div.piCib button:last-of-type', { timeout: 2000 });
            await $cancel.tap();

            await this._sessionPage.evaluate(() => window.scrollTo(0, 300));

            const $notNow = await this._sessionPage.waitForSelector('div.piCib button:last-of-type', { timeout: 2000 });
            await $notNow.tap();
        } finally {
            return;
        }
    }

    private isChallengeRequired() {
        return this._sessionPage.url().includes('challenge');
    }

    private async challengeLogIn() {
        const $$chooses = await this._sessionPage.$$('div.QuiLu > div');
        let chooses = [];
        for (const $choose of $$chooses) {
            const $label = await $choose.$('label');
            const innerText: string = await this._sessionPage.evaluate(label => label.innerText, $label);
            chooses.push(innerText);
        }
        const key = keyInSelect(chooses, 'Which method you prefer to send a security code to verify your identity?', {
            cancel: false,
        });
        if ($$chooses.length > 1) {
            await $$chooses[key].tap();
        }
        const $sendButton = await this._sessionPage.$('form.JraEb  button');
        await $sendButton!.tap();

        const $codeInput = await this._sessionPage.waitForSelector('input[name=security_code]');
        const code = question('[Challenge] Enter your security code: ');
        await $codeInput.type(code, { delay: 100 });
        const $submitButton = await this._sessionPage.$('form.JraEb  button');
        const [response] = await Promise.all([
            this._sessionPage.waitForResponse(response => response.url().includes('challenge')),
            $submitButton!.tap(),
        ]);

        if (response.status() !== 200 && response.status() !== 400) {
            throw new Error(`Smth went wrong with challenge login request. Code: ${response.status()}`);
        }
        const { status } = await response.json();
        await this._sessionPage.waitFor(3000);
        if (status !== 'ok') {
            throw new Error(`Smth went wrong with challenge login response. Status: ${status}`);
        }
    }

    private isTwoFactor() {
        return this._sessionPage.url().includes('two_factor');
    }

    private async twoFactorLogIn() {
        const $input = await this._sessionPage.$('form._3GlM_ input');
        const code = question('[Two-factor] Enter a security code or backup code: ');
        await $input!.type(code, { delay: 100 });
        const $confirm = await this._sessionPage.$('form._3GlM_ button');
        const [response] = await Promise.all([
            this._sessionPage.waitForResponse(response => response.url().includes('login/ajax/two_factor')),
            $confirm!.tap(),
        ]);

        if (response.status() !== 200 && response.status() !== 400) {
            throw new Error(`Smth went wrong with two-factor login request. Code: ${response.status()}`);
        }
        const { status } = await response.json();
        await this._sessionPage.waitFor(3000);
        if (status !== 'ok') {
            throw new Error(`Smth went wrong with two-factor login response. Status: ${status}`);
        }

        const $saveInfo = await this._sessionPage.$('section.ABCxa button');
        await $saveInfo!.tap();
    }

    async logIn(username: string, password: string, cleanCookie: boolean = true) {
        await this._sessionPage.goto('https://www.instagram.com/', { waitUntil: 'networkidle0' });

        if (await this.isLoggedIn()) {
            await this.closeAnyHomeScreenDialogsIfNeeded();
            return;
        }

        if (cleanCookie) {
            for (const cookie of await this._sessionPage.cookies()) {
                await this._sessionPage.deleteCookie({
                    name: cookie.name,
                    domain: cookie.domain,
                });
            }
            await this._sessionPage.reload();
        }

        const $login = await this._sessionPage.waitForSelector('div.gr27e button.L3NKy');
        await $login.tap();

        await this._sessionPage.waitFor(1000);
        const [$input1, $input2] = await this._sessionPage.$$('form.HmktE input');
        await $input1.type(username, { delay: 100 });
        await $input2.type(password, { delay: 100 });
        const $submit = await this._sessionPage.$('div.gr27e button.L3NKy[type=submit]');
        const [response] = await Promise.all([
            this._sessionPage.waitForResponse(response => response.url().includes('accounts/login/ajax')),
            $submit!.tap(),
        ]);

        if (response.status() !== 200 && response.status() !== 400) {
            throw new Error(`Smth went wrong with login request. Code: ${response.status()}`);
        }
        const { status } = await response.json();
        await this._sessionPage.waitFor(3000);
        if (status !== 'ok') {
            if (this.isChallengeRequired()) {
                await this.challengeLogIn();
                if (this.isLoggedIn()) {
                    await this.closeAnyHomeScreenDialogsIfNeeded();
                } else {
                    await this.logIn(username, password, false);
                }
                return;
            }
            if (this.isTwoFactor()) {
                await this.twoFactorLogIn();
                await this.closeAnyHomeScreenDialogsIfNeeded();
                return;
            }
        }
    }

    async logOut() {
        await this.menu('profile');

        const uri = 'https://www.instagram.com/accounts/logout/ajax/';
        const headers = {
            Accept: '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-CSRFToken': await this.csrfToken(),
            'X-IG-App-ID': await this.instagramWebFBAppId(),
            'X-Instagram-AJAX': await this.rolloutHash(),
            'X-Requested-With': 'XMLHttpRequest',
        };
        const body = 'one_tap_app_login: 0';
        const json = await this._sessionPage.evaluate(
            async (uri, headers, body) => {
                const response = await window.fetch(uri, {
                    method: 'POST',
                    mode: 'cors',
                    headers: new Headers(headers),
                    body,
                    credentials: 'include',
                    referrerPolicy: 'no-referrer-when-downgrade',
                });
                if (response.status !== 200) {
                    throw new Error(`Response code is ${response.statusText}. Something went wrong.`);
                }
                return response.json();
            },
            uri,
            headers,
            body,
        );

        if (json.status !== 'ok') {
            throw new Error(`Response status is ${json.status}. Something went wrong.`);
        }

        return json;
    }

    // Menu

    async menu(section: 'home' | 'explore' | 'upload' | 'activity' | 'profile') {
        const $$menu = await this._sessionPage.$$('div.q02Nz');
        switch (section) {
            case 'home':
                await $$menu[0].tap();
                break;

            case 'explore':
                await $$menu[1].tap();
                break;

            case 'upload':
                await $$menu[2].tap();
                break;

            case 'activity':
                await $$menu[3].tap();
                break;

            case 'profile':
                await $$menu[4].tap();
                break;
        }

        await this._sessionPage.waitFor(2000);
    }

    // Profile actions

    async profileInfo(username: string, page?: Page) {
        const currentPage = page ? page : this._sessionPage;
        await currentPage.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle2' });

        const {
            entry_data: {
                ProfilePage: [
                    {
                        graphql: { user },
                    },
                ],
            },
        } = await currentPage.evaluate('window._sharedData');

        return user;
    }

    async *profileMedia(username: string, page?: Page) {
        const currentPage = page ? page : this._sessionPage;

        await currentPage.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle0' });

        const {
            entry_data: {
                ProfilePage: [
                    {
                        graphql: {
                            user: { edge_owner_to_timeline_media },
                        },
                    },
                ],
            },
        } = await currentPage.evaluate('window._sharedData');

        let media = edge_owner_to_timeline_media;

        const {
            page_info: { has_next_page: hasNext },
        } = media;

        if (!hasNext) {
            yield media;
            return;
        } else {
            yield media;
        }

        do {
            const [response] = await Promise.all([
                currentPage.waitForResponse(
                    response => response.request().resourceType() === 'xhr' && response.url().includes('query_hash'),
                ),
                currentPage.evaluate(() => window.scrollTo(0, window.document.body.scrollHeight)),
            ]);

            const {
                data: {
                    user: { edge_owner_to_timeline_media },
                },
            } = await response.json();

            media = edge_owner_to_timeline_media;

            const {
                page_info: { has_next_page: hasNext },
            } = media;

            if (!hasNext) {
                yield media;
                break;
            } else {
                yield media;
            }

            await currentPage.waitFor(2000);
        } while (true);
    }

    private async *_profileFollowersBase(type: 'after' | 'before', username: string, cursor: string) {
        let json;
        let currentCursor = cursor;

        const baseUriComponents = {
            query_hash: await this.followersQueryHash(),
            variables: `{"id":"${await this.profileIdFromUsername(
                username,
            )}","include_reel":true,"fetch_mutual":true,"first":12,`,
        };
        const headers = {
            Accept: '*/*',
            'Accept-Language': 'en-us',
            'X-Requested-With': 'XMLHttpRequest',
            'X-IG-App-ID': await this.instagramWebFBAppId(),
            'X-IG-WWW-Claim': await this.claim(),
            'X-CSRFToken': await this.csrfToken(),
        };

        do {
            const uriComponents = {
                query_hash: baseUriComponents.query_hash,
                variables: baseUriComponents.variables + `"${type}":"${currentCursor}"}`,
            };
            const uri = `https://www.instagram.com/graphql/query/?${stringify(uriComponents)}`;
            json = await this._sessionPage.evaluate(
                async (uri, headers, username) => {
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
                },
                uri,
                headers,
                username,
            );

            if (json.status !== 'ok') {
                throw new Error(`Response status is ${json.status}. Something went wrong.`);
            }

            yield json;

            const {
                data: {
                    user: {
                        edge_followed_by: {
                            page_info: { end_cursor: newCursor, has_next_page: hasNext },
                        },
                    },
                },
            } = json;

            if (!hasNext) {
                break;
            }
            if (type === 'before') {
                break;
            }

            currentCursor = newCursor;

            await this._sessionPage.waitFor(2000);
        } while (true);
    }

    async *profileFollowersAfter(username: string, cursor: string) {
        if (this._sessionPage.url() !== `https://www.instagram.com/${username}/`) {
            await this._sessionPage.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle0' });
        }

        yield* this._profileFollowersBase('after', username, cursor);
    }

    async profileFollowersBefore(username: string, cursor: string) {
        if (this._sessionPage.url() !== `https://www.instagram.com/${username}/`) {
            await this._sessionPage.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle0' });
        }

        const { value } = await this._profileFollowersBase('before', username, cursor).next();
        return value;
    }

    async *profileFollowers(username: string) {
        await this._sessionPage.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle0' });

        const uriComponents = {
            query_hash: await this.followersQueryHash(),
            variables: `{"id":"${await this.profileIdFromUsername(
                username,
            )}","include_reel":true,"fetch_mutual":true,"first":24}`,
        };
        const uri = `https://www.instagram.com/graphql/query/?${stringify(uriComponents)}`;
        const headers = {
            Accept: '*/*',
            'Accept-Language': 'en-us',
            'X-Requested-With': 'XMLHttpRequest',
            'X-IG-App-ID': await this.instagramWebFBAppId(),
            'X-IG-WWW-Claim': await this.claim(),
            'X-CSRFToken': await this.csrfToken(),
        };
        const json = await this._sessionPage.evaluate(
            async (uri, headers, username) => {
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
            },
            uri,
            headers,
            username,
        );

        if (json.status !== 'ok') {
            throw new Error(`Response status is ${json.status}. Something went wrong.`);
        }

        yield json;

        const {
            data: {
                user: {
                    edge_followed_by: {
                        page_info: { end_cursor: newCursor, has_next_page: hasNext },
                    },
                },
            },
        } = json;

        if (hasNext) {
            yield* this.profileFollowersAfter(username, newCursor);
        }
    }

    private async *_profileFollowingBase(type: 'after' | 'before', username: string, cursor: string) {
        let json;
        let currentCursor = cursor;

        const baseUriComponents = {
            query_hash: await this.followingQueryHash(),
            variables: `{"id":"${await this.profileIdFromUsername(
                username,
            )}","include_reel":true,"fetch_mutual":false,"first":12,`,
        };
        const headers = {
            Accept: '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-Csrftoken': await this.csrfToken(),
            'X-Ig-App-Id': await this.instagramWebFBAppId(),
            'X-Instagram-Ajax': await this.rolloutHash(),
            'X-Requested-With': 'XMLHttpRequest',
        };

        do {
            const uriComponents = {
                query_hash: baseUriComponents.query_hash,
                variables: baseUriComponents.variables + `"${type}":"${currentCursor}"}`,
            };
            const uri = `https://www.instagram.com/graphql/query/?${stringify(uriComponents)}`;
            json = await this._sessionPage.evaluate(
                async (uri, headers, username) => {
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
                },
                uri,
                headers,
                username,
            );

            if (json.status !== 'ok') {
                throw new Error(`Response status is ${json.status}. Something went wrong.`);
            }

            yield json;

            const {
                data: {
                    user: {
                        edge_follow: {
                            page_info: { end_cursor: newCursor, has_next_page: hasNext },
                        },
                    },
                },
            } = json;

            if (!hasNext) {
                break;
            }
            if (type === 'before') {
                break;
            }

            currentCursor = newCursor;

            await this._sessionPage.waitFor(2000);
        } while (true);
    }

    async *profileFollowingAfter(username: string, cursor: string) {
        if (this._sessionPage.url() !== `https://www.instagram.com/${username}/`) {
            await this._sessionPage.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle0' });
        }

        yield* this._profileFollowingBase('after', username, cursor);
    }

    async profileFollowingBefore(username: string, cursor: string) {
        if (this._sessionPage.url() !== `https://www.instagram.com/${username}/`) {
            await this._sessionPage.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle0' });
        }

        const { value } = await this._profileFollowingBase('before', username, cursor).next();
        return value;
    }

    async *profileFollowing(username: string) {
        await this._sessionPage.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle0' });

        const uriComponents = {
            query_hash: await this.followingQueryHash(),
            variables: `{"id":"${await this.profileIdFromUsername(
                username,
            )}","include_reel":true,"fetch_mutual":false,"first":24}`,
        };
        const uri = `https://www.instagram.com/graphql/query/?${stringify(uriComponents)}`;
        const headers = {
            Accept: '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-Csrftoken': await this.csrfToken(),
            'X-Ig-App-Id': await this.instagramWebFBAppId(),
            'X-Instagram-Ajax': await this.rolloutHash(),
            'X-Requested-With': 'XMLHttpRequest',
        };
        const json = await this._sessionPage.evaluate(
            async (uri, headers, username) => {
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
            },
            uri,
            headers,
            username,
        );

        if (json.status !== 'ok') {
            throw new Error(`Response status is ${json.status}. Something went wrong.`);
        }

        yield json;

        const {
            data: {
                user: {
                    edge_follow: {
                        page_info: { end_cursor: newCursor, has_next_page: hasNext },
                    },
                },
            },
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
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: '*/*',
            'Accept-Language': 'en-us',
            'X-Requested-With': 'XMLHttpRequest',
            'X-IG-App-ID': await this.instagramWebFBAppId(),
            'X-Instagram-AJAX': await this.rolloutHash(),
            'X-IG-WWW-Claim': await this.claim(),
            'X-CSRFToken': await this.csrfToken(),
        };
        const uri = `https://www.instagram.com/web/friendships/${id}/${type}/`;
        const json = await this._sessionPage.evaluate(
            async (uri, headers, username) => {
                const response = await window.fetch(uri, {
                    method: 'POST',
                    mode: 'cors',
                    headers: new Headers(headers),
                    credentials: 'include',
                    referrer: `https://www.instagram.com/${username}/`,
                    referrerPolicy: 'no-referrer-when-downgrade',
                });
                if (response.status !== 200) {
                    // tslint:disable-next-line: no-string-throw
                    throw `Response code is ${response.status}.\n${await response.text()}`;
                }
                return response.json();
            },
            uri,
            headers,
            username,
        );

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
        const currentPage = page ? page : this._sessionPage;

        await currentPage.goto(`https://www.instagram.com/p/${shortcode}/`, { waitUntil: 'networkidle0' });

        const {
            entry_data: {
                PostPage: [
                    {
                        graphql: { shortcode_media },
                    },
                ],
            },
        } = await currentPage.evaluate('window._sharedData');

        return shortcode_media;
    }

    async *mediaComments(shortcode: string, page?: Page) {
        const currentPage = page ? page : this._sessionPage;

        await currentPage.goto(`https://www.instagram.com/p/${shortcode}/comments/`, {
            waitUntil: 'networkidle0',
        });

        const {
            entry_data: {
                MobileAllCommentsPage: [
                    {
                        graphql: {
                            shortcode_media: { edge_media_to_parent_comment },
                        },
                    },
                ],
            },
        } = await currentPage.evaluate('window._sharedData');

        let comments = edge_media_to_parent_comment;

        const {
            page_info: { has_next_page: hasNext },
        } = comments;

        if (!hasNext) {
            yield comments;
            return;
        } else {
            yield comments;
        }

        do {
            const [response] = await Promise.all([
                currentPage.waitForResponse(
                    res =>
                        res.request().resourceType() === 'xhr' &&
                        res.url().includes('query_hash') &&
                        res.url().includes(`shortcode%22%3A%22${shortcode}`),
                ),
                currentPage.tap('button.afkep'),
            ]);

            const {
                data: {
                    shortcode_media: { edge_media_to_parent_comment },
                },
            } = await response.json();

            comments = edge_media_to_parent_comment;

            const {
                page_info: { has_next_page: hasNext },
            } = comments;

            if (!hasNext) {
                yield comments;
                break;
            } else {
                yield comments;
            }

            await currentPage.waitFor(2000);
        } while (true);
    }

    async mediaComment(shortcode: string, text: string, commentId: string = '') {
        await this._sessionPage.goto(`https://www.instagram.com/p/${shortcode}/comments/`, {
            waitUntil: 'networkidle0',
        });

        const uri = `https://www.instagram.com/web/comments/${await this.mediaIdFromShortcode(shortcode)}/add/`;
        const headers = {
            Accept: '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Csrftoken': await this.csrfToken(),
            'X-Ig-App-Id': await this.instagramWebFBAppId(),
            'X-Instagram-Ajax': await this.rolloutHash(),
            'X-Requested-With': 'XMLHttpRequest',
        };
        const body = `comment_text=${text}&replied_to_comment_id=${commentId}`;
        const json = await this._sessionPage.evaluate(
            async (uri, headers, body, shortcode) => {
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
                    // tslint:disable-next-line: no-string-throw
                    throw `Response code is ${response.status}. Something went wrong: ${await response.text()}`;
                }
                return response.json();
            },
            uri,
            headers,
            body,
            shortcode,
        );

        if (json.status !== 'ok') {
            throw new Error(`Response status is ${json.status}. Something went wrong.`);
        }

        return json;
    }

    private async _mediaCommentLikeUnlikeBase(type: 'like' | 'unlike', shortcode: string, commentId: string, page: Page) {
        await page.goto(`https://www.instagram.com/p/${shortcode}/comments/`, {
            waitUntil: 'networkidle0',
        });

        const uri = `https://www.instagram.com/web/comments/${type}/${commentId}/`;
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-Requested-With': 'XMLHttpRequest',
            'X-IG-App-ID': await this.instagramWebFBAppId(),
            'X-Instagram-AJAX': await this.rolloutHash(),
            'X-IG-WWW-Claim': await this.claim(),
            'X-CSRFToken': await this.csrfToken(),
        };
        const json = await page.evaluate(
            async (uri, headers, shortcode) => {
                const response = await window.fetch(uri, {
                    method: 'POST',
                    mode: 'cors',
                    headers: new Headers(headers),
                    credentials: 'include',
                    referrer: `https://www.instagram.com/p/${shortcode}/comments/`,
                    referrerPolicy: 'no-referrer-when-downgrade',
                });
                if (response.status !== 200) {
                    // tslint:disable-next-line: no-string-throw
                    throw `Response code is ${response.status}. Something went wrong.`;
                }
                return response.json();
            },
            uri,
            headers,
            shortcode,
        );

        if (json.status !== 'ok') {
            throw new Error(`Response status is ${json.status}. Something went wrong.`);
        }

        return json;
    }

    async mediaCommentLike(shortcode: string, commentId: string, page?: Page) {
        const currentPage = page ? page : this._sessionPage;
        return this._mediaCommentLikeUnlikeBase('like', shortcode, commentId, currentPage);
    }

    async mediaCommentUnlike(shortcode: string, commentId: string, page?: Page) {
        const currentPage = page ? page : this._sessionPage;
        return this._mediaCommentLikeUnlikeBase('unlike', shortcode, commentId, currentPage);
    }

    async mediaCommentSpamReport(shortcode: string, commentId: string) {
        await this._sessionPage.goto(`https://www.instagram.com/p/${shortcode}/comments/`, {
            waitUntil: 'networkidle0',
        });

        const uri = `https://www.instagram.com/media/${await this.mediaIdFromShortcode(
            shortcode,
        )}/comment/${commentId}/flag/`;
        const headers = {
            Accept: '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Csrftoken': await this.csrfToken(),
            'X-Ig-App-Id': await this.instagramWebFBAppId(),
            'X-Instagram-Ajax': await this.rolloutHash(),
            'X-Requested-With': 'XMLHttpRequest',
        };
        const body = 'reason_id=1';
        const json = await this._sessionPage.evaluate(
            async (uri, headers, body, shortcode) => {
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
            },
            uri,
            headers,
            body,
            shortcode,
        );

        if (json.status !== 'ok') {
            throw new Error(`Response status is ${json.status}. Something went wrong.`);
        }

        return json;
    }

    async mediaCommentDelete(shortcode: string, commentId: string) {
        await this._sessionPage.goto(`https://www.instagram.com/p/${shortcode}/comments/`, {
            waitUntil: 'networkidle0',
        });

        const uri = `https://www.instagram.com/web/comments/${await this.mediaIdFromShortcode(
            shortcode,
        )}/delete/${commentId}/`;
        const headers = {
            Accept: '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Csrftoken': await this.csrfToken(),
            'X-Ig-App-Id': await this.instagramWebFBAppId(),
            'X-Instagram-Ajax': await this.rolloutHash(),
            'X-Requested-With': 'XMLHttpRequest',
        };
        const json = await this._sessionPage.evaluate(
            async (uri, headers, shortcode) => {
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
            },
            uri,
            headers,
            shortcode,
        );

        if (json.status !== 'ok') {
            throw new Error(`Response status is ${json.status}. Something went wrong.`);
        }

        return json;
    }

    private async _mediaLikeUnlikeBase(type: 'like' | 'unlike', shortcode: string) {
        const page = await this.browser.newPage();
        await page.goto(`https://www.instagram.com/p/${shortcode}/`, { waitUntil: 'networkidle0' });

        const $span = await page.$('span.fr66n > button.afkep > span');
        if (
            await page.evaluate(
                (span, type) =>
                    span.attributes['aria-label'].textContent !== `${type.charAt(0).toUpperCase()}${type.slice(1)}`,
                $span,
                type,
            )
        ) {
            await page.close();
            throw new Error(`Can't ${type} ${type}d post.`);
        }

        const [response] = await Promise.all([
            page.waitForResponse(response => response.url().includes('/like/') || response.url().includes('/unlike/')),
            $span!.tap(),
        ]);
        if (response.status() === 400) {
            await page.close();
            throw new Error('You’re Temporarily Blocked.');
        }
        if (response.status() !== 200) {
            await page.close();
            throw new Error(`Response code is ${response.statusText}. Something went wrong.`);
        }

        const json = await response.json();
        await page.close();

        return json;
    }

    async mediaLike(shortcode: string) {
        return this._mediaLikeUnlikeBase('like', shortcode);
    }

    async mediaUnlike(shortcode: string) {
        return this._mediaLikeUnlikeBase('unlike', shortcode);
    }

    // Report actions

    async profileSpamReport(username: string) {
        await this._sessionPage.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle0' });

        const uri = `https://www.instagram.com/users/${await this.profileIdFromUsername(username)}/report/`;
        const headers = {
            Accept: '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Csrftoken': await this.csrfToken(),
            'X-Ig-App-Id': await this.instagramWebFBAppId(),
            'X-Instagram-Ajax': await this.rolloutHash(),
            'X-Requested-With': 'XMLHttpRequest',
        };
        const body = 'source_name=profile&reason_id=1';
        const json = await this._sessionPage.evaluate(
            async (uri, headers, body, username) => {
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
            },
            uri,
            headers,
            body,
            username,
        );

        if (json.status !== 'ok') {
            throw new Error(`Response status is ${json.status}. Something went wrong.`);
        }

        return json;
    }

    async mediaSpamReport(shortcode: string) {
        await this._sessionPage.goto(`https://www.instagram.com/p/${shortcode}/`, { waitUntil: 'networkidle0' });

        const uri = `https://www.instagram.com/media/${await this.mediaIdFromShortcode(shortcode)}/flag/`;
        const headers = {
            Accept: '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Csrftoken': await this.csrfToken(),
            'X-Ig-App-Id': await this.instagramWebFBAppId(),
            'X-Instagram-Ajax': await this.rolloutHash(),
            'X-Requested-With': 'XMLHttpRequest',
        };
        const body = 'reason_id=1';
        const json = await this._sessionPage.evaluate(
            async (uri, headers, body, shortcode) => {
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
            },
            uri,
            headers,
            body,
            shortcode,
        );

        if (json.status !== 'ok') {
            throw new Error(`Response status is ${json.status}. Something went wrong.`);
        }

        return json;
    }

    // Feed actions

    async feedReels() {
        await this._sessionPage.goto(`https://www.instagram.com/`, { waitUntil: 'networkidle0' });

        const uriComponents = {
            query_hash: await this.feedReelsQueryHash(),
            variables: '{"only_stories":true,"stories_prefetch":true,"stories_video_dash_manifest":false}',
        };
        const uri = `https://www.instagram.com/graphql/query/?${stringify(uriComponents)}`;
        const headers = {
            Accept: '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
        };
        const json = await this._sessionPage.evaluate(
            async (uri, headers) => {
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
            },
            uri,
            headers,
        );

        if (json.status !== 'ok') {
            throw new Error(`Response status is ${json.status}. Something went wrong.`);
        }

        return json;
    }

    private async *_feedBase(cursor: string) {
        let json;
        let currentCursor = cursor;

        const baseUriComponents = {
            query_hash: await this.feedQueryHash(),
            variables: '{"cached_feed_item_ids":[],"fetch_media_item_count":12,',
            variables_end: '"fetch_comment_count":4,"fetch_like":3,"has_stories":false,"has_threaded_comments":true}',
        };
        const headers = {
            Accept: '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-Ig-App-Id': await this.instagramWebFBAppId(),
            'X-Requested-With': 'XMLHttpRequest',
        };

        do {
            const uriComponents = {
                query_hash: baseUriComponents.query_hash,
                variables:
                    baseUriComponents.variables +
                    `"fetch_media_item_cursor":"${currentCursor}",${baseUriComponents.variables_end}`,
            };
            const uri = `https://www.instagram.com/graphql/query/?${stringify(uriComponents)}`;
            json = await this._sessionPage.evaluate(
                async (uri, headers) => {
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
                },
                uri,
                headers,
            );

            if (json.status !== 'ok') {
                throw new Error(`Response status is ${json.status}. Something went wrong.`);
            }

            yield json;

            const {
                data: {
                    user: {
                        edge_web_feed_timeline: {
                            page_info: { end_cursor: newCursor, has_next_page: hasNext },
                        },
                    },
                },
            } = json;

            if (!hasNext) {
                break;
            }

            currentCursor = newCursor;

            await this._sessionPage.waitFor(2000);
        } while (true);
    }

    async *feed() {
        await this._sessionPage.goto(`https://www.instagram.com/`, { waitUntil: 'networkidle0' });

        const { feed } = await this._sessionPage.evaluate('window.__additionalData');

        yield feed;

        const {
            data: {
                user: {
                    edge_web_feed_timeline: {
                        page_info: { end_cursor: cursor, has_next_page: hasNext },
                    },
                },
            },
        } = feed;

        if (hasNext) {
            yield* this._feedBase(cursor);
        }
    }

    private async *_discoverBase(cursor: string) {
        let json;
        let currentCursor = cursor;

        const baseUriComponents = {
            query_hash: await this.discoverQueryHash(),
            variables: `{"first":24,`,
        };
        const headers = {
            Accept: '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-Ig-App-Id': await this.instagramWebFBAppId(),
            'X-Requested-With': 'XMLHttpRequest',
        };

        do {
            const uriComponents = {
                query_hash: baseUriComponents.query_hash,
                variables: baseUriComponents.variables + `"after":"${currentCursor}"}`,
            };
            const uri = `https://www.instagram.com/graphql/query/?${stringify(uriComponents)}`;
            json = await this._sessionPage.evaluate(
                async (uri, headers) => {
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
                },
                uri,
                headers,
            );

            if (json.status !== 'ok') {
                throw new Error(`Response status is ${json.status}. Something went wrong.`);
            }

            yield json;

            const {
                data: {
                    user: {
                        edge_web_discover_media: {
                            page_info: { end_cursor: newCursor, has_next_page: hasNext },
                        },
                    },
                },
            } = json;

            if (!hasNext) {
                break;
            }

            currentCursor = newCursor;

            await this._sessionPage.waitFor(2000);
        } while (true);
    }

    // Explore actions

    async *discoverFeed() {
        await this._sessionPage.goto('https://www.instagram.com/explore/', { waitUntil: 'networkidle0' });

        const uriComponents = {
            query_hash: await this.discoverQueryHash(),
            variables: `{"first":24}`,
        };
        const uri = `https://www.instagram.com/graphql/query/?${stringify(uriComponents)}`;
        const headers = {
            Accept: '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-Ig-App-Id': await this.instagramWebFBAppId(),
            'X-Requested-With': 'XMLHttpRequest',
        };
        const json = await this._sessionPage.evaluate(
            async (uri, headers) => {
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
            },
            uri,
            headers,
        );

        if (json.status !== 'ok') {
            throw new Error(`Response status is ${json.status}. Something went wrong.`);
        }

        yield json;

        const {
            data: {
                user: {
                    edge_web_discover_media: {
                        page_info: { end_cursor: newCursor, has_next_page: hasNext },
                    },
                },
            },
        } = json;

        if (hasNext) {
            yield* this._discoverBase(newCursor);
        }
    }

    private async *_discoverChainingBase(shortcode: string, cursor: string) {
        let json;
        let currentCursor = cursor;

        const baseUriComponents = {
            query_hash: await this.discoverChainingQueryHash(),
            variables: `{"media_id":"${await this.mediaIdFromShortcode(
                shortcode,
            )}","surface":"WEB_EXPLORE_MEDIA_GRID","first":11,`,
        };
        const headers = {
            Accept: '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-Ig-App-Id': await this.instagramWebFBAppId(),
            'X-Requested-With': 'XMLHttpRequest',
        };

        do {
            const uriComponents = {
                query_hash: baseUriComponents.query_hash,
                variables: baseUriComponents.variables + `"after":"${currentCursor}"}`,
            };
            const uri = `https://www.instagram.com/graphql/query/?${stringify(uriComponents)}`;
            json = await this._sessionPage.evaluate(
                async (uri, headers, shortcode) => {
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
                },
                uri,
                headers,
                shortcode,
            );

            if (json.status !== 'ok') {
                throw new Error(`Response status is ${json.status}. Something went wrong.`);
            }

            yield json;

            const {
                data: {
                    user: {
                        edge_web_media_chaining: {
                            page_info: { end_cursor: newCursor, has_next_page: hasNext },
                        },
                    },
                },
            } = json;

            if (!hasNext) {
                break;
            }

            currentCursor = newCursor;

            await this._sessionPage.waitFor(2000);
        } while (true);
    }

    async *discoverChaining(shortcode: string, cursor?: string) {
        await this._sessionPage.goto(`https://www.instagram.com/p/${shortcode}/?chaining=true`, {
            waitUntil: 'networkidle0',
        });

        if (cursor !== undefined) {
            yield* this._discoverChainingBase(shortcode, cursor);
            return;
        }

        const uriComponents = {
            query_hash: await this.discoverChainingQueryHash(),
            variables: `{"media_id":"${await this.mediaIdFromShortcode(
                shortcode,
            )}","surface":"WEB_EXPLORE_MEDIA_GRID","first":12}`,
        };
        const uri = `https://www.instagram.com/graphql/query/?${stringify(uriComponents)}`;
        const headers = {
            Accept: '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-Ig-App-Id': await this.instagramWebFBAppId(),
            'X-Requested-With': 'XMLHttpRequest',
        };
        const json = await this._sessionPage.evaluate(
            async (uri, headers, shortcode) => {
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
            },
            uri,
            headers,
            shortcode,
        );

        if (json.status !== 'ok') {
            throw new Error(`Response status is ${json.status}. Something went wrong.`);
        }

        yield json;

        const {
            data: {
                user: {
                    edge_web_media_chaining: {
                        page_info: { end_cursor: newCursor, has_next_page: hasNext },
                    },
                },
            },
        } = json;

        if (hasNext) {
            yield* this._discoverChainingBase(shortcode, newCursor);
        }
    }

    async search(text: string) {
        await this._sessionPage.goto('https://www.instagram.com/explore/search/', { waitUntil: 'networkidle0' });

        const uriComponents = {
            context: 'blended',
            query: text,
            rank_token: Math.random().toString(),
            include_reel: true,
        };
        const uri = `https://www.instagram.com/web/search/topsearch/?${stringify(uriComponents)}`;
        const headers = {
            Accept: '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-Ig-App-Id': await this.instagramWebFBAppId(),
            'X-Requested-With': 'XMLHttpRequest',
        };
        const json = await this._sessionPage.evaluate(
            async (uri, headers) => {
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
            },
            uri,
            headers,
        );

        if (json.status !== 'ok') {
            throw new Error(`Response status is ${json.status}. Something went wrong.`);
        }

        return json;
    }

    private async *_hashtagFeedBase(tag: string, cursor: string) {
        let json;
        let currentCursor = cursor;

        const baseUriComponents = {
            query_hash: await this.hashtagFeedQueryHash(),
            variables: `{"tag_name":"${tag}","first":5,"after":`,
        };
        const headers = {
            Accept: '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-Ig-App-Id': await this.instagramWebFBAppId(),
            'X-Requested-With': 'XMLHttpRequest',
        };

        do {
            const uriComponents = {
                query_hash: baseUriComponents.query_hash,
                variables: baseUriComponents.variables + `"${currentCursor}"}`,
            };
            const uri = `https://www.instagram.com/graphql/query/?${stringify(uriComponents)}`;
            json = await this._sessionPage.evaluate(
                async (uri, headers, tag) => {
                    const response = await window.fetch(uri, {
                        method: 'GET',
                        mode: 'cors',
                        headers: new Headers(headers),
                        credentials: 'include',
                        referrer: `https://www.instagram.com/explore/tags/${tag}/`,
                        referrerPolicy: 'no-referrer-when-downgrade',
                    });
                    if (response.status !== 200) {
                        throw new Error(`Response code is ${response.statusText}. Something went wrong.`);
                    }
                    return response.json();
                },
                uri,
                headers,
                tag,
            );

            if (json.status !== 'ok') {
                throw new Error(`Response status is ${json.status}. Something went wrong.`);
            }

            const {
                data: { hashtag },
            } = json;

            yield hashtag;

            const {
                edge_hashtag_to_media: {
                    page_info: { end_cursor: newCursor, has_next_page: hasNext },
                },
            } = hashtag;

            if (!hasNext) {
                break;
            }

            currentCursor = newCursor;

            await this._sessionPage.waitFor(2000);
        } while (true);
    }

    async *hashtagFeed(tag: string) {
        await this._sessionPage.goto(`https://www.instagram.com/explore/tags/${tag}/`, { waitUntil: 'networkidle0' });

        const {
            entry_data: {
                TagPage: [
                    {
                        graphql: { hashtag },
                    },
                ],
            },
        } = await this._sessionPage.evaluate('window._sharedData');

        yield hashtag;

        const {
            edge_hashtag_to_media: {
                page_info: { end_cursor: newCursor, has_next_page: hasNext },
            },
        } = hashtag;

        if (hasNext) {
            yield* this._hashtagFeedBase(tag, newCursor);
        }
    }

    private async *_locationFeedBase(locationId: string, cursor: string) {
        let json;
        let currentCursor = cursor;

        const baseUriComponents = {
            query_hash: await this.locationFeedQueryHash(),
            variables: `{"id":"${locationId}","first":12,"after":`,
        };
        const headers = {
            Accept: '*/*',
            'Accept-Language': 'en-us',
            'X-IG-App-ID': await this.instagramWebFBAppId(),
            'X-Requested-With': 'XMLHttpRequest',
        };

        do {
            const uriComponents = {
                query_hash: baseUriComponents.query_hash,
                variables: baseUriComponents.variables + `"${currentCursor}"}`,
            };
            const uri = `https://www.instagram.com/graphql/query/?${stringify(uriComponents)}`;
            json = await this._sessionPage.evaluate(
                async (uri, headers, locationId) => {
                    let response;
                    try {
                        response = await window.fetch(uri, {
                            method: 'GET',
                            mode: 'cors',
                            headers: new Headers(headers),
                            credentials: 'include',
                            referrer: `https://www.instagram.com/explore/locations/${locationId}/`,
                            referrerPolicy: 'no-referrer-when-downgrade',
                        });
                    } catch (error) {
                        // tslint:disable-next-line: no-string-throw
                        throw error.message;
                    }
                    if (response.status !== 200) {
                        // tslint:disable-next-line: no-string-throw
                        throw `Response code is ${response.status}. Something went wrong.`;
                    }
                    return response.json();
                },
                uri,
                headers,
                locationId,
            );

            if (json.status !== 'ok') {
                throw new Error(`Response status is ${json.status}. Something went wrong.`);
            }

            const {
                data: { location },
            } = json;

            yield location;

            const {
                edge_location_to_media: {
                    page_info: { end_cursor: newCursor, has_next_page: hasNext },
                },
            } = location;

            if (!hasNext) {
                break;
            }

            currentCursor = newCursor;

            await this._sessionPage.waitFor(2000);
        } while (true);
    }

    async *locationFeed(locationId: string) {
        await this._sessionPage.goto(`https://www.instagram.com/explore/locations/${locationId}/`, {
            waitUntil: 'networkidle0',
        });

        const {
            entry_data: {
                LocationsPage: [
                    {
                        graphql: { location },
                    },
                ],
            },
        } = await this._sessionPage.evaluate('window._sharedData');

        yield location;

        const {
            edge_location_to_media: {
                page_info: { end_cursor: newCursor, has_next_page: hasNext },
            },
        } = location;

        if (hasNext) {
            yield* this._locationFeedBase(locationId, newCursor);
        }
    }

    // Upload action

    async uploadMedia(text: string, path: string, expand: boolean = true) {
        await this._sessionPage.goto('https://www.instagram.com/', { waitUntil: 'networkidle0' });

        await this.menu('upload');
        await (await this._sessionPage.$('nav.NXc7H.f11OC input'))!.uploadFile(path);

        await this._sessionPage.waitForSelector('button.UP43G');
        if (expand) {
            const $expandButton = await this._sessionPage.$('button.pHnkA');
            if ($expandButton) {
                await $expandButton.tap();
            }
        }
        const [fbUploadResponse] = await Promise.all([
            this._sessionPage.waitForResponse(response => response.url().includes('fb_uploader')),
            this._sessionPage.tap('button.UP43G'),
        ]);
        if (fbUploadResponse.status() !== 200) {
            throw new Error('...');
        }
        const { status: fbUploadStatus } = await fbUploadResponse.json();
        if (fbUploadStatus !== 'ok') {
            throw new Error('...');
        }

        await this._sessionPage.waitForSelector('button.UP43G');
        await this._sessionPage.type('textarea[placeholder="Write a caption…"]', text, { delay: 50 });
        const [configureResponse] = await Promise.all([
            this._sessionPage.waitForResponse(response => response.url().includes('configure')),
            this._sessionPage.tap('button.UP43G'),
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
        const page = await this.browser.newPage();
        const { id } = await this.profileInfo(username, page);
        await page.close();
        return id;
    }

    async mediaIdFromShortcode(shortcode: string): Promise<string> {
        const page = await this.browser.newPage();
        const { id } = await this.mediaInfo(shortcode, page);
        await page.close();
        return id;
    }

    async csrfToken() {
        const cookies = await this._sessionPage.cookies('https://www.instagram.com');
        const { value } = cookies.find(value => value.name === 'csrftoken')!;
        return value;
    }

    async instagramWebFBAppId() {
        if (this.cache.instagramWebFBAppId === undefined) {
            const page = await this.browser.newPage();
            await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle0' });
            const src = await page.evaluate(() => {
                const array = [...document.querySelectorAll('script')];
                return array.find(value => value.src.includes('ConsumerLibCommons.js'))!.src;
            });
            await page.close();
            const response = await fetch(src);
            const [, id] = (await response.text()).match(/instagramWebFBAppId='(.+?)'/)!;
            this.cache.instagramWebFBAppId = id;
        }

        return this.cache.instagramWebFBAppId;
    }

    async followersQueryHash() {
        if (this.cache.followersQueryHash === undefined) {
            const page = await this.browser.newPage();
            await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle0' });
            const src = await page.evaluate(() => {
                const array = [...document.querySelectorAll('script')];
                return array.find(value => value.src.includes('Consumer.js'))!.src;
            });
            await page.close();
            const response = await fetch(src);
            const [, hash] = (await response.text()).match(/FOLLOW_LIST_REQUEST_FAILED.+?"(.+?)"/)!;
            this.cache.followersQueryHash = hash;
        }

        return this.cache.followersQueryHash;
    }

    async followingQueryHash() {
        if (this.cache.followingQueryHash === undefined) {
            const page = await this.browser.newPage();
            await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle0' });
            const src = await page.evaluate(() => {
                const array = [...document.querySelectorAll('script')];
                return array.find(value => value.src.includes('Consumer.js'))!.src;
            });
            await page.close();
            const response = await fetch(src);
            const [, hash] = (await response.text()).match(/FOLLOW_LIST_REQUEST_FAILED.+?".+?".+?"(.+?)"/)!;
            this.cache.followingQueryHash = hash;
        }

        return this.cache.followingQueryHash;
    }

    async feedReelsQueryHash() {
        if (this.cache.feedReelsQueryHash === undefined) {
            const page = await this.browser.newPage();
            await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle0' });
            const src = await page.evaluate(() => {
                const array = [...document.querySelectorAll('script')];
                return array.find(value => value.src.includes('Consumer.js'))!.src;
            });
            await page.close();
            const response = await fetch(src);
            const [, hash] = (await response.text()).match(/FEED_PAGE_EXTRAS_QUERY_ID="(.+?)"/)!;
            this.cache.feedReelsQueryHash = hash;
        }

        return this.cache.feedReelsQueryHash;
    }

    async feedQueryHash() {
        if (this.cache.feedQueryHash === undefined) {
            const page = await this.browser.newPage();
            await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle0' });
            const src = await page.evaluate(() => {
                const array = [...document.querySelectorAll('script')];
                return array.find(value => value.src.includes('Consumer.js'))!.src;
            });
            await page.close();
            const response = await fetch(src);
            const [, hash] = (await response.text()).match(/graphql\/query\/.+?"(.+?)"/)!;
            this.cache.feedQueryHash = hash;
        }

        return this.cache.feedQueryHash;
    }

    async hashtagFeedQueryHash() {
        if (this.cache.hashtagFeedQueryHash === undefined) {
            const page = await this.browser.newPage();
            await page.goto('https://www.instagram.com/explore/tags/love/', { waitUntil: 'networkidle0' });
            const src = await page.evaluate(() => {
                const array = [...document.querySelectorAll('script')];
                return array.find(value => value.src.includes('TagPageContainer.js'))!.src;
            });
            await page.close();
            const response = await fetch(src);
            const [, hash] = (await response.text()).match(/tagMedia.+?"(.+?)"/)!;
            this.cache.hashtagFeedQueryHash = hash;
        }

        return this.cache.hashtagFeedQueryHash;
    }

    async locationFeedQueryHash() {
        if (this.cache.locationFeedQueryHash === undefined) {
            const page = await this.browser.newPage();
            await page.goto('https://www.instagram.com/explore/locations/3001373/', { waitUntil: 'networkidle0' });
            const src = await page.evaluate(() => {
                const array = [...document.querySelectorAll('script')];
                return array.find(value => value.src.includes('LocationPageContainer.js'))!.src;
            });
            await page.close();
            const response = await fetch(src);
            const [, hash] = (await response.text()).match(/byLocationId.+?"(.+?)"/)!;
            this.cache.locationFeedQueryHash = hash;
        }

        return this.cache.locationFeedQueryHash;
    }

    async discoverQueryHash() {
        if (this.cache.discoverQueryHash === undefined) {
            const page = await this.browser.newPage();
            await page.goto('https://www.instagram.com/explore/', { waitUntil: 'networkidle0' });
            const src = await page.evaluate(() => {
                const array = [...document.querySelectorAll('script')];
                return array.find(value => value.src.includes('DiscoverMediaPageContainer.js'))!.src;
            });
            await page.close();
            const response = await fetch(src);
            const [, hash] = (await response.text()).match(/discover.pagination.+?"(.+?)"/)!;
            this.cache.discoverQueryHash = hash;
        }

        return this.cache.discoverQueryHash;
    }

    async discoverChainingQueryHash() {
        if (this.cache.discoverChainingQueryHash === undefined) {
            const src = await this._sessionPage.evaluate(() => {
                const array = [...document.querySelectorAll('script')];
                return array.find(value => value.src.includes('MediaChainingPageContainer.js'))!.src;
            });
            const response = await fetch(src);
            const [, hash] = (await response.text()).match(/discoverChaining.+?"(.+?)"/)!;
            this.cache.discoverChainingQueryHash = hash;
        }

        return this.cache.discoverChainingQueryHash;
    }

    async rolloutHash(): Promise<string> {
        const { rollout_hash } = await this._sessionPage.evaluate('window._sharedData');
        return rollout_hash;
    }

    async claim(): Promise<string> {
        const { claim } = await this._sessionPage.evaluate(`window.sessionStorage['www-claim-v2']`);
        return claim;
    }
}