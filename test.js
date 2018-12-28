var request = require('request');
require('request-debug')(request);

const QBittorrent = require('./index.js')

var q = new QBittorrent({})

q.login((err) => {
    q.syncMaindata(() => {
        q.syncMaindata(() => {})
    })
})
