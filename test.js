var request = require('request')
require('request-debug')(request)
require('dotenv').config()

const QBittorrent = require('./index.js')

var q = new QBittorrent({
    user: process.env.QBIT_USER,
    pass: process.env.QBIT_PASS,
})

q.login((err) => {
    q.syncMaindata(() => {
        q.syncMaindata(() => {})
    })
})
