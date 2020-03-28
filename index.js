const url = require('url')
const path = require('path')
const request = require('request')
const ApiV1 = require('./api-v1')
const ApiV2 = require('./api-v2')


function QBittorrent(option) {
    this.host = (option && option['host']) || "127.0.0.1";
    this.port = (option && option['port']) || 8080;
    this.path = (option && option['path']) || "/";
    this.user = (option && option['user']) || null;
    this.pass = (option && option['pass']) || null;
    this.ssl  = (option && option['ssl'])  || false;
    this.ca   = (option && option['ca'])   || undefined;
    this.timeout = (option && option['timeout']) || 5000;

    this.baseurl = new url.URL(this.host, this.ssl ? 'https://' : 'http://' + this.host)
    this.baseurl.port = this.port

    this.options = {
        baseurl: this.baseurl,
        path: this.path,
        user: this.user,
        pass: this.pass,
        ca: this.ca,
        timeout: this.timeout,
    }
}

QBittorrent.prototype.url = function(name) {
    return url.resolve(this.baseurl.toString(), path.join(this.path, name))
}

QBittorrent.prototype.login = function(cb) {
    const self = this
    const req = {
        timeout: this.timeout,
        ca: this.ca,
        method: 'GET',
        headers: {
            'Referer': this.baseurl.origin,
        },
        uri: this.url('version/api'),
    }
    // Version selection based on assumption that `/version/api`
    // endpoint accessible without authorization in older versions.
    request(req, function(err, res, body) {
        if (err || res && res.statusCode !== 200) {
            self.api = new ApiV2(self.options)
        } else {
            self.api = new ApiV1(self.options)
        }
        self.api.login(cb)
    })
}

QBittorrent.prototype.reset = function(cb) {
    this.api.reset(cb)
}

QBittorrent.prototype.getTorrents = function(cb) {
    this.api.getTorrents(cb)
}

QBittorrent.prototype.syncMaindata = function(cb) {
    this.api.syncMaindata(cb)
}

QBittorrent.prototype.addTorrentFile = function(filepath, options, cb) {
    this.api.addTorrentFile(filepath, options, cb)
}

QBittorrent.prototype.addTorrentFileContent = function(content, filename, options, cb) {
    this.api.addTorrentFileContent(content, filename, options, cb)
}

QBittorrent.prototype.addTorrentURL = function(magneturl, options, cb) {
    this.api.addTorrentURL(magneturl, options, cb)
}

QBittorrent.prototype.pause = function(hashes, cb) {
    this.api.pause(hashes, cb)
}

QBittorrent.prototype.pauseAll = function(cb) {
    this.api.pauseAll(cb)
}

QBittorrent.prototype.resume = function(hashes, cb) {
    this.api.resume(hashes, cb)
}

QBittorrent.prototype.resumeAll = function(cb) {
    this.api.resumeAll(cb)
}

QBittorrent.prototype.delete = function(hashes, cb) {
    this.api.delete(hashes, cb)
}

QBittorrent.prototype.deleteAndRemove = function(hashes, cb) {
    this.api.deleteAndRemove(hashes, cb)
}

QBittorrent.prototype.recheck = function(hashes, cb) {
    this.api.recheck(hashes, cb)
}

QBittorrent.prototype.increasePrio = function(hashes, cb) {
    this.api.increasePrio(hashes, cb)
}

QBittorrent.prototype.decreasePrio = function(hashes, cb) {
    this.api.decreasePrio(hashes, cb)
}

QBittorrent.prototype.topPrio = function(hashes, cb) {
    this.api.topPrio(hashes, cb)
}

QBittorrent.prototype.bottomPrio = function(hashes, cb) {
    this.api.bottomPrio(hashes, cb)
}

QBittorrent.prototype.rename = function(hash, name, cb) {
    this.api.rename(hash, name, cb)
}

QBittorrent.prototype.setCategory = function(hashes, category, cb) {
    this.api.setCategory(hashes, category, cb)
}

QBittorrent.prototype.setLocation = function(hashes, location, cb) {
    this.api.setLocation(hashes, location, cb)
}

QBittorrent.prototype.createCategory = function(category, savePath, cb) {
    this.api.createCategory(category, savePath, cb)
}

QBittorrent.prototype.removeCategories = function(categories, cb) {
    this.api.removeCategories(categories, cb)
}

QBittorrent.prototype.setAutoManagement = function(hashes, enable, cb) {
    this.api.setAutoManagement(hashes, enable, cb)
}

QBittorrent.prototype.toggleSequentialDownload = function(hashes, cb) {
    this.api.toggleSequentialDownload(hashes, cb)
}

QBittorrent.prototype.toggleFirstLastPiecePrio = function(hashes, cb) {
    this.api.toggleFirstLastPiecePrio(hashes, cb)
}

QBittorrent.prototype.setForceStart = function(hashes, value, cb) {
    this.api.setForceStart(hashes, value, cb)
}

QBittorrent.prototype.setSuperSeeding = function(hashes, value, cb) {
    this.api.setSuperSeeding(hashes, value, cb)
}

module.exports = QBittorrent
