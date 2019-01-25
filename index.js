"use strict";
const credentials = require('./credentials');
const rp = require('request-promise');
const cheerio = require('cheerio');
const Parser = require('rss-parser');
const Agent = require('socks5-http-client/lib/Agent');
const Agent_s = require('socks5-https-client/lib/Agent');
const dayjs = require('dayjs');
const fs = require('fs');
const fileType = require('file-type');
const path = require('path');
const del = require('del');
const schedule = require('node-schedule');

const sendShuoshuo = require('./sendShuoshuo');

const log = (log) => {
    let date = dayjs(new Date()).format('YY年M月D日HH:mm:ss');
    console.log(`${date}: \n${log}\n`);
}

const downloadImg = (imgarr) => {
    return new Promise((resolve, reject) => {
        let promises = new Array();
        let files = new Array();
        imgarr.forEach(src => {
            let agentClass = /https/.test(src) ? Agent_s : Agent;
            let rpconfig = {
                method: 'GET',
                url: src,
                timeout: 1000 * 60,
                encoding: null
            }
            if(credentials.proxy){
                rpconfig.agentClass = agentClass;
                rpconfig.agentOptions = {
                    socksHost: '127.0.0.1',
                    socksPort: 1080
                }
            }
            promises.push(rp(rpconfig))
        });
        Promise.all(promises).then(e => {
            e.forEach(response => {
                const imgType = fileType(response).ext;
                const imgPath = path.relative(process.cwd(), __dirname + `/tmp/${dayjs().valueOf()}${~~(Math.random() * 10000)}.${imgType}`);
                fs.writeFileSync(imgPath, response);
                files.push(imgPath);
            });
            resolve(files);
        }).catch(err => {
            reject(err);
        })
    })
}

let upTime = new Object(); // 保存rss每次拉取的时间
const baseURL = 'https://rsshub.app';

function grss(config) {
    schedule.scheduleJob('*/2 * * * *', function(){
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
                    return false;
                }

                if (upTime[config.name] < date_published) { //有更新
                    log('发现更新' + config.name)

                    if (feed.items[0].title.search('Re') !== -1) { // 如果是回复类型的推文则不推送
                        log('回复推文，不推送');
                        return false;
                    }

                    // 过滤图片和视频前面的换行
                    let content = feed.items[0].content.replace(/<br><video.+?><\/video>|<br><img.+?>/g, e => {
                        return e.replace(/<br>/, '');
                    })

                    // 解析HTML
                    const $ = cheerio.load(content.replace(/<br>/g, '\n'));

                    let imgArr = new Array();
                    let posterArr = new Array();

                    if($('video').length){ // 如果有视频，尝试获取视频封面
                        let imgs = new Array();
                        $('video').each(function (){
                            let posterSrc = $(this).attr('poster');
                            if(posterSrc) imgs.push(posterSrc);
                        })
                        try {
                            posterArr = await downloadImg(imgs);
                        } catch (error) {
                            log(config.name + '：视频封面抓取失败' + error.stack);
                            return false;
                        }
                    }

                    if ($('img').length){ // 如果有图片，请求并转换为base64编码
                        let imgs = new Array();
                        $('img').each(function () {
                            let imgSrc = $(this).attr('src');
                            if(imgSrc) imgs.push(imgSrc);
                        })
                        try {
                            imgArr = await downloadImg(imgs);
                        } catch (error) {
                            log(config.name + '：图片抓取失败' + error.stack);
                            return false;
                        }
                    }
                    const  message = {
                        text: `${config.name}更新推送`,
                        content: posterArr.length ? `${$.text()}\n${$('video').length}个视频，点击原链接查看` : $.text(),
                        url: feed.items[0].link,
                        date: dayjs(feed.items[0].pubDate).format('YY年M月D日HH:mm:ss')
                    }

                    const msg = 
                        `${message.text}\n` + 
                        `内容：${message.content}\n` + 
                        `原链接：${message.url}\n` + 
                        `日期：${message.date}`

                    sendShuoshuo(msg, imgArr.concat(posterArr))
                        .then(() => {
                            log(config.name + '更新发送成功');
                            upTime[config.name] = date_published;
                            del.sync(imgArr);
                        }).catch(error => {
                            log(config.name + ' 更新发送失败：' + error.stack);
                            del.sync(imgArr);
                        })
                } else { //没有更新
                    log(config.name + ' 没有更新  最后更新于：' + dayjs(feed.items[0].pubDate).format('YY年M月D日HH:mm:ss'));
                }
            })
            .catch(error => {
                log(config.name + '请求RSSHub失败\n' + error.stack);
            })
    })
};

credentials.urls.forEach((config, index) => {
    setTimeout(() => {
        grss(config)
    }, 1000 * 10 * index);
})
