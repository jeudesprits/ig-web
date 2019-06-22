fetch("https://www.instagram.com/graphql/query/?query_hash=51fdd02b67508306ad4484ff574a0b62&variables=%7B%22comment_id%22%3A%2217887308631360991%22%2C%22first%22%3A6%2C%22after%22%3A%22QVFERy1LcXNva2RaUWhyS3hkcHpycVRabUsyekczUFhGTG1CQ0FCWXlSY0dfRmd2MGtXOEc3aFhBZDNxWEV1LW5Oazd6ZThsV1dMdkFsYU5LMnVHV05GLQ%3D%3D%22%7D", 
{
  "credentials":"include",
  "headers":{
    "accept":"*/*",
    "accept-language":"en-US,en;q=0.9",
    "cache-control":"no-cache",
    "pragma":"no-cache",
    "sec-fetch-mode":"cors",
    "sec-fetch-site":"same-origin",
    "x-ig-app-id":"1217981644879628",
    "x-requested-with":"XMLHttpRequest"
  },
  "referrer":"https://www.instagram.com/p/By0-NYEJ786/comments/",
  "referrerPolicy":"no-referrer-when-downgrade",
  "body":null,
  "method":"GET",
  "mode":"cors"
});

__d(function(g,r,i,a,m,e,d){"use strict";function t(){return{type:a(d[0]).ACTIVITY_FEED_REQUESTED}}function n(t){return{type:a(d[0]).ACTIVITY_FEED_LOADED,payload:t}}function o(t){return{type:a(d[0]).ACTIVITY_FEED_FAILED,error:t}}function c(t){return{type:a(d[0]).ACTIVITY_FEED_CHECKED,payload:t}}function u(){return{type:a(d[0]).ACTIVITY_FEED_BANNER_IGNORED}}function f(){return{type:a(d[0]).ACTIVITY_COUNTS_REQUESTED}}function _(t){return{type:a(d[0]).ACTIVITY_COUNTS_LOADED,payload:t}}function s(t){return{type:a(d[0]).ACTIVITY_COUNTS_FAILED,error:t}}Object.defineProperty(e,'__esModule',{value:!0});const E="0f318e8cfff9cc9ef09f88479ff571fb";e.createFeedLoadedAction=n,e.loadActivityCounts=function(t){return n=>(n(f()),r(d[1]).query(E,{id:t}).then(({data:t})=>{const o=t.user,c=o&&o.edge_activity_count,u=c&&c.edges[0].node;u&&n(_({counts:u}))},t=>{n(s(t))}))},e.loadActivityFeed=function(){return c=>(c(t()),i(d[2])(r(d[1]).getActivityFeedData().then(({graphql:t})=>{const o=i(d[3])(t.user),u=i(d[3])(o.activity_feed);c(n({stories:u.edge_web_activity_feed.edges.map(t=>t.node),followRequests:i(d[3])(o.edge_follow_requests).edges.map(t=>t.node),timestamp:u.timestamp}))},t=>{c(o(t))})))},e.activityFeedChecked=function(){return(t,n)=>{const o=n(),u=r(d[4]).feedTimestamp(o);if(u<=r(d[4]).feedLastChecked(o))return Promise.resolve();const f=r(d[1]).markActivityFeedChecked(u).catch(()=>{});return t(c({timestamp:u})),f}},e.activityFeedBannerIgnored=function(){return t=>{t(u())}}},9961481,[14680142,9568362,9568361,9568264,9961479]);
