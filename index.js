const request = require('request')
const url = require('url')
const path = require('path')
const fs = require('fs')


function QBittorrent(option) {
    this.host = (option && option['host']) || "127.0.0.1";
    this.port = (option && option['port']) || 8080;
    this.path = (option && option['path']) || "/";
    this.user = (option && option['user']) || null;
    this.pass = (option && option['pass']) || null;
    this.ssl  = (option && option['ssl'])  || false;
    this.ca   = (option && option['ca'])   || undefined;
    this.timeout = (option && option['timeout']) || 5000;

    this.baseurl = new url.URL(this.host, 'http://' + this.host)
    this.baseurl.port = this.port
    this.baseurl.pathname = this.path

    this.rid = 0 /* used for syncing data */

    this.jar = request.jar()

    this.options = {
        timeout: this.timeout,
        ca: this.ca,
        jar: this.jar,
        headers: {
            'Referer': this.baseurl.origin,
        },
    }
}

const AUTH_ERRORS = {
    403: new Error('User\'s IP is banned for too many failed login attempts'),
}

const TORRENT_ERRORS = {
    404: new Error('Torrent hash was not found'),  
}

QBittorrent.prototype.handleError = function(cb, errors) {
    return function(err, res, body) {
        if (err) {
            return cb(err, body)
        } else if (errors && errors.hasOwnProperty(res.statusCode)) {
            return cb(errors[res.statusCode], body)
        } else if (body && body === 'Fails.') {
            return cb(new Error('Request failed'))
        } else {
            return cb(err, body)
        }
    }
}

QBittorrent.prototype.url = function(path) {
    return url.resolve(this.baseurl.toString(), path)
}

QBittorrent.prototype.http = function(method, path, options, cb) {
    request(Object.assign({}, this.options, {
        method: method,
        uri: this.url(path),
    }, options), function(err, res, body) {
        if (err) {
            cb(...arguments)
        } else if (res && res.statusCode !== 200) {
            cb(new Error(res.statusCode), ...Array.from(arguments).slice(1))
        } else {
            cb(...arguments)
        }
    })
}

QBittorrent.prototype.get = function(path, options, cb) {
    this.http('GET', path, options, cb)
}

QBittorrent.prototype.getJson = function(path, options, cb) {
    this.get(path, Object.assign({json: true}, options), cb)
}

QBittorrent.prototype.post = function(path, options, cb) {
    this.http('POST', path, options, cb)
}

QBittorrent.prototype.login = function(cb) {
    this.post('login', {form: {
        username: this.user,
        password: this.pass,
    }}, function(err, res) {
        if (res && !res.headers.hasOwnProperty('set-cookie')) {
            err = new Error('Invalid login')
        }
        this.handleError(cb, AUTH_ERRORS)(...arguments)
    }.bind(this))
}

QBittorrent.prototype.reset = function(cb) {
    this.rid = 0
    cb()
}

QBittorrent.prototype.getTorrents = function(cb) {
    this.getJson('query/torrents', {}, this.handleError(cb))
}

QBittorrent.prototype.syncMaindata = function(cb) {
    this.getJson('sync/maindata', {qs: {rid: this.rid}}, this.handleError(function(err, body) {
        this.rid = (body && body.rid || 0)
        cb(...arguments)
    }.bind(this)))
}

QBittorrent.prototype.addTorrentFile = function(filepath, options, cb) {
    let data

    try {
        data = fs.readFileSync(filepath);
    } catch (err) {
        return cb(err)
    }

    let filename = path.basename(filepath)

    this.addTorrentFileContent(data, filename, options, cb)
}

QBittorrent.prototype.addTorrentFileContent = function(content, filename, options, cb) {
    if (!Buffer.isBuffer(content)) {
        content = Buffer.from(content)
    }

    let formData = {
        torrents: {
            value: content,
            options: {
                filename: filename,
                contentType: 'application/x-bittorrent',
            }
        },
    }

    if (typeof options === 'object') {
        Object.assign(formData, options)
    }

    this.post('command/upload', {formData}, this.handleError(cb))
}

QBittorrent.prototype.addTorrentURL = function(magneturl, options, cb) {
    let formData = {
        urls: magneturl,
    }

    if (typeof options === 'object') {
        Object.assign(formData, options)
    }

    this.post('command/download', {formData}, this.handleError(cb))
}

QBittorrent.prototype.performGetAction = function(action, hashes, qs, cb) {
    hashes = Array.isArray(hashes) ? hashes : [hashes]
    qs = Object.assign({
        hashes: hashes.join('|')
    }, queries)
    this.get('command/' + action, {qs}, this.handleError(cb, TORRENT_ERRORS))
}

QBittorrent.prototype.performPostAction = function(action, hashes, form, cb) {
    hashes = Array.isArray(hashes) ? hashes : [hashes]
    form = Object.assign({
        hashes: hashes.join('|')
    }, form)
    this.post('command/' + action, {form}, this.handleError(cb, TORRENT_ERRORS))
}

QBittorrent.prototype.performMultiPostAction = function(action, hashes, form, cb) {
    hashes = Array.isArray(hashes) ? hashes : [hashes]
    let counter = 0
    for (let hash of hashes) {
        let hashform = Object.assign({hash}, form)
        this.post('command/' + action, {form: hashform}, this.handleError(function() {
            counter++
            if (hashes.length === counter) {
                cb(...arguments)
            }
        }.bind(this), TORRENT_ERRORS))
    }
}

QBittorrent.prototype.pause = function(hashes, cb) {
    this.performMultiPostAction('pause', hashes, {}, cb)
}

QBittorrent.prototype.pauseAll = function(cb) {
    this.post('command/pauseAll', {}, cb)
}

QBittorrent.prototype.resume = function(hashes, cb) {
    this.performMultiPostAction('resume', hashes, {}, cb)
}

QBittorrent.prototype.resumeAll = function(cb) {
    this.post('command/resumeAll', {}, cb)
}

QBittorrent.prototype.delete = function(hashes, cb) {
    this.performPostAction('delete', hashes, {}, cb)
}

QBittorrent.prototype.deleteAndRemove = function(hashes, cb) {
    this.performPostAction('deletePerm', hashes, {}, cb)
}

QBittorrent.prototype.recheck = function(hashes, cb) {
    this.performMultiPostAction('recheck', hashes, {}, cb)
}

QBittorrent.prototype.increasePrio = function(hashes, cb) {
    this.performPostAction('increasePrio', hashes, {}, cb)
}

QBittorrent.prototype.decreasePrio = function(hashes, cb) {
    this.performPostAction('decreasePrio', hashes, {}, cb)
}

QBittorrent.prototype.topPrio = function(hashes, cb) {
    this.performPostAction('topPrio', hashes, {}, cb)
}

QBittorrent.prototype.bottomPrio = function(hashes, cb) {
    this.performPostAction('bottomPrio', hashes, {}, cb)
}

QBittorrent.prototype.rename = function(hash, name, cb) {
    this.performMultiPostAction('rename', hash, {name}, cb)
}

QBittorrent.prototype.setCategory = function(hashes, category, cb) {
    this.performPostAction('setCategory', hashes, {category}, cb)
}

QBittorrent.prototype.setLocation = function(hashes, location, cb) {
    this.performPostAction('setLocation', hashes, {location}, cb)
}

QBittorrent.prototype.createCategory = function(category, cb) {
    this.post('command/addCategory', {form: {category}}, cb)
}

QBittorrent.prototype.removeCategories = function(categories, savePath, cb) {
    categories = Array.isArray(categories) ? categories : [categories]
    this.post('command/removeCategories', {
        form: {
            categories: categories.join('\n'),
        }
    }, this.handleError(cb))
}

QBittorrent.prototype.setAutoManagement = function(hashes, enable, cb) {
    this.performPostAction('setAutoTMM', hashes, {enable}, cb)
}

QBittorrent.prototype.toggleSequentialDownload = function(hashes, cb) {
    this.performPostAction('toggleSequentialDownload', hashes, {}, cb)
}

QBittorrent.prototype.toggleFirstLastPiecePrio = function(hashes, cb) {
    this.performPostAction('toggleFirstLastPiecePrio', hashes, {}, cb)
}

QBittorrent.prototype.setForceStart = function(hashes, value, cb) {
    this.performPostAction('setForceStart', hashes, {value}, cb)
}

QBittorrent.prototype.setSuperSeeding = function(hashes, value, cb) {
    this.performPostAction('setSuperSeeding', hashes, {value}, cb)
}

module.exports = QBittorrent