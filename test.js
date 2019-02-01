const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const credentials = require('./credentials');
const shuoshuo = '测试说说';
const photos = ['./tmp/1.jpg', './tmp/2.jpg', './tmp/3.jpg'];

(async () => {
    const timeout = function (delay) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                try {
                    resolve(1)
                } catch (e) {
                    reject(0)
                }
            }, delay);
        })
    }

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // 设置宽高
    await page.setViewport({
        height: 736,
        width: 414
    });

    // 设置UA
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1');

    // 设置拦截器，在无头浏览器内运行时不加载图片和视频资源
    await page.setRequestInterception(true);
    page.on('request', interceptedRequest => {
        if (interceptedRequest.resourceType() === 'image' || interceptedRequest.resourceType() === 'media') {
            interceptedRequest.respond({
                status: 200,
                contentType: 'image/gif',
                body: Buffer.from('R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=', 'base64')
            })
        } else {
            interceptedRequest.continue();
        }
    });

    await page.goto('https://i.qq.com');

    try {
        await page.type('#u', credentials.qq_number, {
            delay: 100
        });
        await page.type('#p', credentials.password, {
            delay: 100
        });

        await page.click('#go');

        await timeout(5000);

        let loginStatus = await page.content();
        let $ = cheerio.load(loginStatus);
        if($('#feed_list_cot_all > .feed').length){
            console.log('登陆成功');
        }else{
            console.log('登陆失败');
            return false;
        }
        await page.screenshot({path: './登陆成功.jpg'})

        await page.click('#page-content .tweet-txt button');

        await timeout(500);

        await page.type('.write-text.J_textareaWrapper textarea', shuoshuo);

        // 如果有图片
        if (photos.length > 0) {
            // 上传高清图片
            await page.click('.ui-switch');
            const input = await page.$('#addphoto');

            // 最多只能上传9张照片
            if (photos.length > 9) {
                photos.splice(0, 9)
            }
            await input.uploadFile(...photos);
        }

        await page.click('#form-0-submit');

        let time = 0;
        let verifySS = setInterval(async () => {
            let html = await page.content();
            if(html.indexOf('说说发表成功') !== -1){
                clearInterval(verifySS);
                await browser.close();
                console.log('说说发表成功')
                await page.screenshot({path: './发送成功.jpg'})
            }else{
                if(time>15){
                    clearInterval(verifySS);
                    await browser.close();
                    console.log('说说发送超时');
                    await page.screenshot({path: './发送失败.jpg'})
                    return false;
                }else{
                    time++;
                }
            }
        }, 1000)
    } catch (error) {
        console.log(error.stack)
        await browser.close();
    }
})()