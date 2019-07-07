import client from './mongo/client';
import db from './mongo/db';
import { Profile, UsedPost, Hashtag } from './mongo/models';
// import logger from './logger';
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
        node: { isVideo, shortcode },
      } = edge;
      if (isVideo) {
        continue;
      }
      if (await UsedPost.findOne<UsedPost>({ uri: `https://www.instagram.com/p/${shortcode}` })) {
        continue;
      }
      return edge;
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
  text += '\n.\n.\n.\n';
  const count = hashtagCount(text);
  if (count < 30) {
    const hashtags = await Hashtag.aggregate<Hashtag>([{ $sample: { size: 30 - count } }]);
    hashtags.forEach(hashtag => (text += `${hashtag.hashtag} `));
  }
  return text;
}

// tslint:disable-next-line: no-floating-promises
(async () => {
  const browser = new Browser();
  await browser.launch();

  const igApi = new IGApi(browser);
  await igApi.Result;

  await igApi.logIn(DS_USERNAME, DS_PASSWORD);

  await db.Result;
  Profile.use(db.IgDilnozochkaShodiyeva);
  UsedPost.use(db.IgDilnozochkaShodiyeva);
  Hashtag.use(db.IgDilnozochkaShodiyeva);

  const [profile] = await Profile.aggregate<Profile>([{ $sample: { size: 1 } }]);
  const username = profile.uri.slice(22);
  const {
    node: {
      edge_media_to_caption: { edges },
      thumbnail_resources: thumbnailResources,
      shortcode,
    },
  } = await preferredPost(igApi, username);

  const { src: imageUri } = thumbnailResources[thumbnailResources.length - 1];
  await downloadImage(imageUri, 'tmp/upload.jpg');

  let [
    {
      node: { text },
    },
  ] = edges;
  text = removeUsernames(text);
  text = await addHashtags(text);
  await igApi.uploadMedia(text, 'tmp/upload.jpg');

  let usedPost = new UsedPost({ uri: `https://www.instagram.com/p/${shortcode}` });
  await usedPost.save();

  await client.close();
  await browser.close();
})();
