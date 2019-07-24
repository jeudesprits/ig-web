import client from './mongo/client';
import db from './mongo/db';
import { Profile, UsedPost, Hashtag } from './mongo/models';
import logger from './logger';
import secrets from './utils/secrets';
const { DS_USERNAME, DS_PASSWORD } = secrets;
import Browser from './browser';
import IGApi from './api/ig';
import fetch from 'node-fetch';
import { promisify } from 'util';
import { pipeline } from 'stream';
import { createWriteStream } from 'fs';
const asyncPipeline = promisify(pipeline);

async function downloadImage(uri: string, to: string) {
    const response = await fetch(uri);
    if (!response.ok) {
        throw new Error(`Unexpected response for image download ${response.statusText}`);
    }

    await asyncPipeline(response.body, createWriteStream(to));
}

async function preferredPost(igApi: IGApi, username: string) {
    for await (const { edges } of igApi.profileMedia(username)) {
        for (const edge of edges) {
            const {
                node: { is_video: isVideo, shortcode },
            } = edge;
            if (isVideo) {
                continue;
            }
            if (await UsedPost.findOne<UsedPost>({ uri: `https://www.instagram.com/p/${shortcode}/` })) {
                continue;
            }
            return igApi.mediaInfo(shortcode);
        }
    }
}

function removeUsernames(text: string) {
    return text.replace(/@[A-Za-z0-9\-\.\_]+(?:\s|$)/g, ' ');
}

function hashtagCount(text: string) {
    return (text.match(/#[A-Za-z0-9\-\.\_]+(?:\s|$)/g) || []).length;
}

async function addHashtags(text: string) {
    const count = hashtagCount(text);
    if (count < 30) {
        text += '\n.\n.\n.\n';
        const hashtags = await Hashtag.aggregate<Hashtag>([{ $sample: { size: 30 - count } }]);
        hashtags.forEach(hashtag => (text += `${hashtag.hashtag} `));
    } else if (count > 30) {
        text = '\n.\n.\n.\n';
        const hashtags = await Hashtag.aggregate<Hashtag>([{ $sample: { size: 30 } }]);
        hashtags.forEach(hashtag => (text += `${hashtag.hashtag} `));
    }
    return text;
}

// tslint:disable-next-line: no-floating-promises
(async () => {
    const browser = new Browser();
    await browser.launch();

    const igApi = new IGApi(browser);

    try {
        await igApi.Result;
        await igApi.logIn(DS_USERNAME, DS_PASSWORD);

        await db.Result;
        Profile.use(db.IgDilnozochkaShodiyeva);
        UsedPost.use(db.IgDilnozochkaShodiyeva);
        Hashtag.use(db.IgDilnozochkaShodiyeva);

        const [profile] = await Profile.aggregate<Profile>([{ $sample: { size: 1 } }]);
        const username = profile.uri.slice(26, -1);
        const {
            edge_media_to_caption: edgeMediaToCaption,
            display_resources: displayResources,
            shortcode,
        } = await preferredPost(igApi, username);

        const { src: imageUri } = displayResources[displayResources.length - 1];
        await downloadImage(imageUri, 'tmp/upload.jpg');

        let caption: string;
        try {
            // prettier-ignore
            const { edges: [{ node: { text } }] } = edgeMediaToCaption;
            caption = text;
        } catch {
            caption = '';
        }
        caption = removeUsernames(caption);
        caption = await addHashtags(caption);
        await igApi.uploadMedia(caption, 'tmp/upload.jpg');

        let usedPost = new UsedPost({ uri: `https://www.instagram.com/p/${shortcode}/` });
        await usedPost.save();
    } catch (error) {
        await browser.screenshot(igApi.sessionPage, 'tmp/screenshot.jpg');
        logger.error(error.stack, { label: 'ig-web @dilnozochka_shodiyeva' });
    } finally {
        await client.close();
        await browser.close();
    }
})();
