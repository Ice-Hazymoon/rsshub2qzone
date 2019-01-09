# RSSHub2qzone

> 将 rsshub 的订阅推送到QQ空间

## 使用

在项目根目录新建一个 `credentials.js` 文件，内容为：

```javascript
module.exports = {
    qq_number: 'QQ号',
    username: 'QQ空间用户名',
    password: 'QQ密码',
    urls: [
        { name: 'Twitter-Ice_Hayzmoon', url: '/twitter/user/Ice_Hayzmoon'} //RSSHub链接
    ]
}
```

安装并运行

```bash
npm install
node index
```

## 其他

[https://imiku.me/2019/01/10/1260.html](https://imiku.me/2019/01/10/1260.html)