const fs = require('fs')
const url = require('url')
const path = require('path')
const request = require('request')


function ApiV2(option) {
    this.path = option.path
    this.user = option.user
    this.pass = option.pass
    this.ca   = option.ca
    this.baseurl = option.baseurl
    this.timeout = option.timeout

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
    403: new Error("User's IP is banned for too many failed login attempts"),
}

const TORRENT_ERRORS = {
    404: new Error('Torrent hash was not found'),
}

ApiV2.prototype.handleError = function(cb, errors) {
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

ApiV2.prototype.url = function(name) {
    return url.resolve(this.baseurl.toString(), path.join(this.path, "api/v2", name))
}

ApiV2.prototype.http = function(method, path, options, cb) {
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

ApiV2.prototype.get = function(path, options, cb) {
    this.http('GET', path, options, cb)
}

ApiV2.prototype.getJson = function(path, options, cb) {
    this.get(path, Object.assign({json: true}, options), cb)
}

ApiV2.prototype.post = function(path, options, cb) {
    this.http('POST', path, options, cb)
}

ApiV2.prototype.apiVersion = function(cb) {
    this.get('app/version', {}, function(err, res) {
        if (res.statusCode === 200) {
            cb(null, res.body)
        } else {
            cb(new Error("Could not get api version"), null)
        }
    }.bind(this))
}

ApiV2.prototype.monkeyPatchApiVersion = function(cb) {
    this.apiVersion(function (err, versionStr) {
        if (err) {
            return cb(err, null)
        }
        const versionParts = versionStr.replace('v', '').split('.').map(Number)
        const versionMajor = versionParts[0]
        if (versionMajor >= 5) {
            // Apply patch for API v5.0.0 and above
            Object.assign(this, ApiV2MonkeyPatch5.prototype)
        }
        cb(null, versionStr)
    }.bind(this))
}

ApiV2.prototype.login = function(cb) {
    this.post('auth/login', {form: {
        username: this.user,
        password: this.pass,
    }}, function(err, res) {
        if (res && !res.headers.hasOwnProperty('set-cookie')) {
            err = new Error('Invalid login')
        }
        this.monkeyPatchApiVersion((err, version) => {
            this.handleError(cb, AUTH_ERRORS)(...arguments)
        })
    }.bind(this))
}

ApiV2.prototype.reset = function(cb) {
    this.rid = 0
    cb()
}

ApiV2.prototype.getTorrents = function(cb) {
    this.getJson('torrents/info', {}, this.handleError(cb))
}

ApiV2.prototype.syncMaindata = function(cb) {
    this.getJson('sync/maindata', {qs: {rid: this.rid}}, this.handleError(function(err, body) {
        this.rid = (body && body.rid || 0)
        cb(...arguments)
    }.bind(this)))
}

ApiV2.prototype.addTorrentFile = function(filepath, options, cb) {
    let data

    try {
        data = fs.readFileSync(filepath);
    } catch (err) {
        return cb(err)
    }

    let filename = path.basename(filepath)

    this.addTorrentFileContent(data, filename, options, cb)
}

ApiV2.prototype.addTorrentFileContent = function(content, filename, options, cb) {
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

    this.post('torrents/add', {formData}, this.handleError(cb))
}

ApiV2.prototype.addTorrentURL = function(magneturl, options, cb) {
    let formData = {
        urls: magneturl,
    }

    if (typeof options === 'object') {
        Object.assign(formData, options)
    }

    this.post('torrents/add', {formData}, this.handleError(cb))
}

ApiV2.prototype.performPostAction = function(action, hashes, form, cb) {
    hashes = Array.isArray(hashes) ? hashes : [hashes]
    form = Object.assign({
        hashes: hashes.join('|')
    }, form)
    this.post('torrents/' + action, {form}, this.handleError(cb, TORRENT_ERRORS))
}

ApiV2.prototype.pause = function(hashes, cb) {
    this.performPostAction('pause', hashes, {}, cb)
}

ApiV2.prototype.pauseAll = function(cb) {
    this.performPostAction('pause', 'all', {}, cb)
}

ApiV2.prototype.resume = function(hashes, cb) {
    this.performPostAction('resume', hashes, {}, cb)
}

ApiV2.prototype.resumeAll = function(cb) {
    this.performPostAction('resume', 'all', {}, cb)
}

ApiV2.prototype.delete = function(hashes, cb) {
    this.performPostAction('delete', hashes, { deleteFiles: false }, cb)
}

ApiV2.prototype.deleteAndRemove = function(hashes, cb) {
    this.performPostAction('delete', hashes, { deleteFiles: true }, cb)
}

ApiV2.prototype.recheck = function(hashes, cb) {
    this.performPostAction('recheck', hashes, {}, cb)
}

ApiV2.prototype.increasePrio = function(hashes, cb) {
    this.performPostAction('increasePrio', hashes, {}, cb)
}

ApiV2.prototype.decreasePrio = function(hashes, cb) {
    this.performPostAction('decreasePrio', hashes, {}, cb)
}

ApiV2.prototype.topPrio = function(hashes, cb) {
    this.performPostAction('topPrio', hashes, {}, cb)
}

ApiV2.prototype.bottomPrio = function(hashes, cb) {
    this.performPostAction('bottomPrio', hashes, {}, cb)
}

ApiV2.prototype.rename = function(hash, name, cb) {
    this.performPostAction('rename', hash, {name}, cb)
}

ApiV2.prototype.setCategory = function(hashes, category, cb) {
    this.performPostAction('setCategory', hashes, {category}, cb)
}

ApiV2.prototype.setLocation = function(hashes, location, cb) {
    this.performPostAction('setLocation', hashes, {location}, cb)
}

ApiV2.prototype.createCategory = function(category, savePath, cb) {
    this.post('torrents/createCategory', {form: {category, savePath}}, cb)
}

ApiV2.prototype.removeCategories = function(categories, cb) {
    categories = Array.isArray(categories) ? categories : [categories]
    this.post('torrents/removeCategories', {
        form: {
            categories: categories.join('\n'),
        }
    }, this.handleError(cb))
}

ApiV2.prototype.setAutoManagement = function(hashes, enable, cb) {
    this.performPostAction('setAutoManagement', hashes, {enable}, cb)
}

ApiV2.prototype.toggleSequentialDownload = function(hashes, cb) {
    this.performPostAction('toggleSequentialDownload', hashes, {}, cb)
}

ApiV2.prototype.toggleFirstLastPiecePrio = function(hashes, cb) {
    this.performPostAction('toggleFirstLastPiecePrio', hashes, {}, cb)
}

ApiV2.prototype.setForceStart = function(hashes, value, cb) {
    this.performPostAction('setForceStart', hashes, {value}, cb)
}

ApiV2.prototype.setSuperSeeding = function(hashes, value, cb) {
    this.performPostAction('setSuperSeeding', hashes, {value}, cb)
}


/**
 * This prototype patch adds support for qBittorrent v5.0.0 and above
 */
function ApiV2MonkeyPatch5() {}

ApiV2MonkeyPatch5.prototype.pause = function(hashes, cb) {
    this.performPostAction('stop', hashes, {}, cb)
}

ApiV2MonkeyPatch5.prototype.pauseAll = function(cb) {
    this.performPostAction('stop', 'all', {}, cb)
}

ApiV2MonkeyPatch5.prototype.resume = function(hashes, cb) {
    this.performPostAction('start', hashes, {}, cb)
}

ApiV2MonkeyPatch5.prototype.resumeAll = function(cb) {
    this.performPostAction('start', 'all', {}, cb)
}

module.exports = ApiV2
