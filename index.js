const request = require('request')
const url = require('url')
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
    return function(err, res) {
        if (err) {
            cb(...arguments)
        } else if (errors.hasOwnProperty(res.statusCode)) {
            cb(errors[res.statusCode], ...arguments.slice(1))
        } else {
            cb(...arguments)
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
    }}, this.handleError(function(err, res) {
        if (err || res.headers.hasOwnProperty('set-cookie')) {
            cb(...arguments)
        } else {
            cb(new Error('Invalid login'), ...Array.from(arguments).slice(1))
        }
    }, AUTH_ERRORS))
}

QBittorrent.prototype.getTorrents = function(cb) {
    this.getJson('api/v2/torrents/info', {}, (err, res, body) => {
        console.log(body)
        cb(arguments)
    })
}

QBittorrent.prototype.syncMaindata = function(cb) {
    this.getJson('api/v2/sync/maindata', {qs: {rid: this.rid}}, (err, res, body) => {
        this.rid = (body && body.rid || 0)
        cb(arguments)
    })
}

QBittorrent.prototype.addTorrentFile = function(filepath, options, cb) {
    let formData = {
        torrents: fs.createReadStream(filepath),
    }

    if (typeof options === 'object') {
        Object.assign(formData, options)
    }

    this.post('api/v2/torrents/add', {formData}, cb)
}

QBittorrent.prototype.addTorrentURL = function(magneturl, options, cb) {
    let formData = {
        urls: magneturl,
    }

    if (typeof options === 'object') {
        Object.assign(formData, options)
    }

    this.post('api/v2/torrents/add', {formData}, cb)
}

QBittorrent.prototype.performGetAction = function(action, hashes, queries, cb) {
    hashes = Array.isArray(hashes) ? hashes : [hashes]
    let qs = Object.assign({
        hashes: hashes.join('|')
    }, queries)
    this.get('api/v2/torrents/' + action, {qs}, this.handleError(cb, TORRENT_ERRORS))
}

QBittorrent.prototype.performPostAction = function(action, hashes, form, cb) {
    hashes = Array.isArray(hashes) ? hashes : [hashes]
    let formData = Object.assign({
        hashes: hashes.join('|')
    }, form)
    this.post('api/v2/torrents/' + action, {formData}, this.handleError(cb, TORRENT_ERRORS))
}

QBittorrent.prototype.pause = function(hashes, cb) {
    this.performGetAction('pause', hashes, {}, cb)
}

QBittorrent.prototype.resume = function(hashes, cb) {
    this.performGetAction('resume', hashes, {}, cb)
}

QBittorrent.prototype.delete = function(hashes, cb) {
    this.performGetAction('delete', hashes, {}, cb)
}

QBittorrent.prototype.deleteAndRemove = function(hashes, cb) {
    this.performGetAction('delete', hashes, {deleteFiles: 'true'}, cb)
}

QBittorrent.prototype.recheck = function(hashes, cb) {
    this.performGetAction('recheck', hashes, {}, cb)
}

QBittorrent.prototype.reannounce = function(hashes, cb) {
    this.performGetAction('reannounce', hashes, {}, cb)
}

QBittorrent.prototype.reannounce = function(hashes, cb) {
    this.performGetAction('reannounce', hashes, {}, cb)
}

QBittorrent.prototype.increasePrio = function(hashes, cb) {
    this.performGetAction('increasePrio', hashes, {}, cb)
}

QBittorrent.prototype.decreasePrio = function(hashes, cb) {
    this.performGetAction('decreasePrio', hashes, {}, cb)
}

QBittorrent.prototype.topPrio = function(hashes, cb) {
    this.performGetAction('topPrio', hashes, {}, cb)
}

QBittorrent.prototype.bottomPrio = function(hashes, cb) {
    this.performGetAction('bottomPrio', hashes, {}, cb)
}

QBittorrent.prototype.rename = function(hash, name, cb) {
    this.performPostAction('rename', hash, {name}, cb)
}

QBittorrent.prototype.setCategory = function(hashes, category, cb) {
    this.performPostAction('setCategory', hashes, {category}, cb)
}

QBittorrent.prototype.setLocation = function(hashes, location, cb) {
    this.performPostAction('setLocation', hashes, {location}, cb)
}

QBittorrent.prototype.createCategory = function(category, cb) {
    this.post('api/v2/torrents/createCategory', {formData: {category}}, cb)
}

QBittorrent.prototype.editCategory = function(category, savePath, cb) {
    this.post('api/v2/torrents/editCategory', {formData: {category, savePath}}, cb)
}

QBittorrent.prototype.removeCategories = function(categories, savePath, cb) {
    categories = Array.isArray(categories) ? categories : [categories]
    this.post('api/v2/torrents/removeCategories', {
        formData: {
            categories: categories.join('\n'),
            savePath: savePath
        }
    }, cb)
}

QBittorrent.prototype.setAutoManagement = function(hashes, enable, cb) {
    this.performPostAction('setAutoManagement', hashes, {enable}, cb)
}

QBittorrent.prototype.toggleSequentialDownload = function(hashes, cb) {
    this.performGetAction('toggleSequentialDownload', hashes, {}, cb)
}

QBittorrent.prototype.toggleFirstLastPiecePrio = function(hashes, cb) {
    this.performGetAction('toggleFirstLastPiecePrio', hashes, {}, cb)
}

QBittorrent.prototype.setForceStart = function(hashes, value, cb) {
    this.performPostAction('setForceStart', hashes, {value}, cb)
}

QBittorrent.prototype.setSuperSeeding = function(hashes, value, cb) {
    this.performPostAction('setSuperSeeding', hashes, {value}, cb)
}

module.exports = QBittorrent