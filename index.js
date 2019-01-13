"use strict";
const credentials = require('./credentials');
const rp = require('request-promise');
const cheerio = require('cheerio');
const Parser = require('rss-parser');
const Agent = require('socks5-https-client/lib/Agent');
const dayjs = require('dayjs');
const fs = require('fs');
const fileType = require('file-type');
const path = require('path');
const del = require('del');

const sendShuoshuo = require('./sendShuoshuo');

const log = (log) => {
    let date = dayjs(new Date()).format('YY年M月D日HH:mm:ss');
    console.log(`${date}: \n${log}\n`);
}

let upTime = new Object(); // 保存rss每次拉取的时间
const baseURL = 'https://rsshub.app';

function grss(config, timeout) {
    if (!timeout) timeout = 1000 * 60 * 5;
    if (!upTime[config.name]) timeout = 1000 * 60 * 1;
    setTimeout(() => {
        rp.get(baseURL + config.url, {
            timeout: 1000 * 60,
            qs: {
                limit: 1
            }
        })
            .then(async e => {
                // 解析RSS
                const parser = new Parser();
                let feed = await parser.parseString(e);

                const date_published = dayjs(feed.items[0].pubDate).unix();
                if (!upTime[config.name]) { // 如果不存在说明是第一次请求
                    log('首次请求' + config.name);
                    upTime[config.name] = date_published;
                    grss(config);
                    return false;
                }

                if (upTime[config.name] < date_published) { //有更新
                    log('发现更新' + config.name)

                    if (feed.items[0].title.search('Re') !== -1) { // 如果是回复类型的推文则不推送
                        log('回复推文，不推送');
                        grss(config);
                        return false;
                    }

                    // 解析HTML
                    const $ = cheerio.load(feed.items[0].content.replace(/<br>/g, '\n'));

                    let imgArr = new Array();

                    if ($('img').length > 0){ // 如果有图片，请求并转换为base64编码
                        let promises = new Array();
                        $('img').each(function () {
                            let src = $(this).attr('src');

                            // 把http链接转换成https
                            if(/https?/.test(src)){
                                src = src.replace(/https?/, 'https');
                            }
                            
                            promises.push(rp({
                                method: 'GET',
                                url: src,
                                timeout: 1000 * 60,
                                agentClass: Agent,
                                agentOptions: {
                                    socksHost: '127.0.0.1',
                                    socksPort: 1080
                                },
                                encoding: null
                            }))
                        })
                        try {
                            let images = await Promise.all(promises);
                            images.forEach(response => {
                                const imgType = fileType(response).ext;
                                const imgPath = path.relative(process.cwd(), __dirname + `/tmp/${dayjs().valueOf()}${~~(Math.random() * 10000)}.${imgType}`);
                                fs.writeFileSync(imgPath, response);
                                imgArr.push(imgPath);
                            });
                        } catch (error) {
                            log(config.name + '：图片抓取失败' + error);
                            grss(config, 1000 * 60 * 1);
                            return false;
                        }
                    }
                    const message = {
                        text: `${config.name}更新推送`,
                        content: feed.items[0].contentSnippet,
                        url: feed.items[0].link,
                        date: dayjs(feed.items[0].pubDate).format('YY年M月D日HH:mm:ss')
                    }

                    const msg = 
                        `${message.text}\n` + 
                        `内容：${message.content}\n` + 
                        `原链接：${message.url}\n` + 
                        `日期：${message.date}`

                    sendShuoshuo(msg, imgArr)
                        .then(() => {
                            log(config.name + '更新发送成功');
                            upTime[config.name] = date_published;
                            grss(config);
                            del.sync(imgArr);
                        }).catch(error => {
                            log(config.name + ' 更新发送失败：' + error);
                            grss(config, 1000 * 60 * 1);
                            del.sync(imgArr);
                        })
                } else { //没有更新
                    log(config.name + ' 没有更新  最后更新于：' + dayjs(feed.items[0].pubDate).format('YY年M月D日HH:mm:ss'));
                    grss(config);
                }
            })
            .catch(error => {
                log(config.name + '请求RSSHub失败' + error);
                grss(config, 1000 * 60 * 1);
            })
    }, timeout);
};

credentials.urls.forEach((config, index) => {
    setTimeout(() => {
        grss(config)
    }, 1000 * 10 * index);
})
