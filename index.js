const config = require('./config.json');
const fs = require('fs');

let cache = {};

try {
    cache = JSON.parse(fs.readFileSync('./cache_usernames.json'));
} catch (_) {}

const { TwitterApi, ApiResponseError } = require('twitter-api-v2');
const { TwitterApiRateLimitPlugin } = require('@twitter-api-v2/plugin-rate-limit');

const rateLimitPlugin = new TwitterApiRateLimitPlugin();
const twitterClient = new TwitterApi(config.twitter.api.token, { plugins: [ rateLimitPlugin ] });

if (!fs.existsSync(`./data/${config.username}`))
    fs.mkdirSync(`./data/${config.username}`, { recursive: true });

console.log(`Archiving ${config.username}`);

const path = require('path');
const dataPath = `./data/${config.username}/`;

const roClient = twitterClient.readOnly;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let page = 0;
let tweetData = [];

(async () => {
    let id = '';

    if (!cache[config.username]) {
        const user = await roClient.v2.userByUsername(config.username);

        id = user.data.id;
        cache[config.username] = user.data;

        fs.writeFileSync('./cache_usernames.json', JSON.stringify(cache, null, 4));
    } else {
        id = cache[config.username].id;
    }

    await getTweets(id);
})();

async function getTweets(id, pageToken = null) {
    page++;

    if (fs.existsSync)

    try {
        console.log(`Saving page ${page}..`);
        const timeline = await roClient.v2.userTimeline(id, {
            expansions: [
                'attachments.media_keys',
                'referenced_tweets.id',
                'referenced_tweets.id.author_id',
                'in_reply_to_user_id'
            ],
            "media.fields": [
                'url',
                'type'
            ],
            "tweet.fields": [
                'entities'
            ]
        });

        while (!timeline.done) {
            await timeline.fetchNext();
        }

        for (const tweet of timeline.data.data) {
            let additionalData = {};

            if (!!tweet.referenced_tweets && tweet.referenced_tweets.length != 0) {
                let referenced = [];

                for (const ref of tweet.referenced_tweets) {
                    switch (ref.type) {
                        case 'replied_to':
                        case 'quoted': {
                            let tryAgain = false;

                            do {
                                try {
                                    const tweetData = await roClient.v2.singleTweet(ref.id, {
                                        expansions: [
                                            'referenced_tweets.id.author_id'
                                        ]
                                    });

                                    const data = {
                                        tweet: tweetData.data,
                                        type: ref.type
                                    };

                                    referenced.push(data);
                                    tryAgain = false;
                                } catch (e) {
                                    if (e instanceof ApiResponseError && e.rateLimitError && e.rateLimit) {
                                        const waitTime = (e.rateLimit.reset * 1000) - Date.now();

                                        console.log(`Pausing temporarily.. (${waitTime}ms)`);
                                        (await sleep(waitTime));
                                        tryAgain = true;
                                    } else {
                                        tryAgain = false;
                                    };
                                }
                            } while (tryAgain);

                            break;
                        }
                    }
                }

                additionalData.referenced = referenced;
            }

            tweetData.push({
                tweet: {
                    source: tweet.source,
                    id_str: tweet.id,
                    entities: tweet.entities,
                    in_reply_to_user_id: tweet.in_reply_to_user_id,
                    created_at: tweet.created_at,
                    full_text: tweet.text,
                    attachments: tweet.attachments,
                    referenced_tweets: tweet.referenced_tweets,
                    additionalData
                }
            });
        }

        fs.writeFileSync(`${dataPath}/tweets_${page}.json`, JSON.stringify(tweetData, null, 4));
    } catch (e) {
        if (e instanceof ApiResponseError && e.rateLimitError && e.rateLimit) {
            const waitTime = (e.rateLimit.reset * 1000) - Date.now();

            console.log(`Pausing temporarily.. (${waitTime}ms)`);
            (await sleep(waitTime));

            getTweets(id, pageToken);
        } else console.error(e.stack);

        fs.writeFileSync(`${dataPath}/tweets_${page}_err.json`, JSON.stringify(tweetData, null, 4));
    }
}

/*
{
    "tweet" : {
      "retweeted" : false,
      "source" : "<a href=\"http://twitter.com/download/android\" rel=\"nofollow\">Twitter for Android</a>",
      "entities" : {
        "hashtags" : [ ],
        "symbols" : [ ],
        "user_mentions" : [ ],
        "urls" : [ ]
      },
      "display_text_range" : [
        "0",
        "56"
      ],
      "favorite_count" : "0",
      "in_reply_to_status_id_str" : "1214466248697888768",
      "id_str" : "1214467676254269441",
      "in_reply_to_user_id" : "1123094716218785793",
      "truncated" : false,
      "retweet_count" : "0",
      "id" : "1214467676254269441",
      "in_reply_to_status_id" : "1214466248697888768",
      "created_at" : "Tue Jan 07 08:43:52 +0000 2020",
      "favorited" : false,
      "full_text" : "@Gh0stGalaxyYT @Kit_Kat2910 5 minutes later: still awake",
      "lang" : "en",
      "in_reply_to_screen_name" : "Gh0stInnit",
      "in_reply_to_user_id_str" : "1123094716218785793"
    }
  },
*/