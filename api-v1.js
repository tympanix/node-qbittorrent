const fs = require('fs')
const url = require('url')
const path = require('path')
const request = require('request')


function ApiV1(option) {
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
    403: new Error('User\'s IP is banned for too many failed login attempts'),
}

const TORRENT_ERRORS = {
    404: new Error('Torrent hash was not found'),  
}

ApiV1.prototype.handleError = function(cb, errors) {
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

ApiV1.prototype.url = function(name) {
    return url.resolve(this.baseurl.toString(), path.join(this.path, name))
}

ApiV1.prototype.http = function(method, path, options, cb) {
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

ApiV1.prototype.get = function(path, options, cb) {
    this.http('GET', path, options, cb)
}

ApiV1.prototype.getJson = function(path, options, cb) {
    this.get(path, Object.assign({json: true}, options), cb)
}

ApiV1.prototype.post = function(path, options, cb) {
    this.http('POST', path, options, cb)
}

ApiV1.prototype.login = function(cb) {
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

ApiV1.prototype.reset = function(cb) {
    this.rid = 0
    cb()
}

ApiV1.prototype.getTorrents = function(cb) {
    this.getJson('query/torrents', {}, this.handleError(cb))
}

ApiV1.prototype.syncMaindata = function(cb) {
    this.getJson('sync/maindata', {qs: {rid: this.rid}}, this.handleError(function(err, body) {
        this.rid = (body && body.rid || 0)
        cb(...arguments)
    }.bind(this)))
}

ApiV1.prototype.addTorrentFile = function(filepath, options, cb) {
    let data

    try {
        data = fs.readFileSync(filepath);
    } catch (err) {
        return cb(err)
    }

    let filename = path.basename(filepath)

    this.addTorrentFileContent(data, filename, options, cb)
}

ApiV1.prototype.addTorrentFileContent = function(content, filename, options, cb) {
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

ApiV1.prototype.addTorrentURL = function(magneturl, options, cb) {
    let formData = {
        urls: magneturl,
    }

    if (typeof options === 'object') {
        Object.assign(formData, options)
    }

    this.post('command/download', {formData}, this.handleError(cb))
}

ApiV1.prototype.performPostAction = function(action, hashes, form, cb) {
    hashes = Array.isArray(hashes) ? hashes : [hashes]
    form = Object.assign({
        hashes: hashes.join('|')
    }, form)
    this.post('command/' + action, {form}, this.handleError(cb, TORRENT_ERRORS))
}

ApiV1.prototype.performMultiPostAction = function(action, hashes, form, cb) {
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

ApiV1.prototype.pause = function(hashes, cb) {
    this.performMultiPostAction('pause', hashes, {}, cb)
}

ApiV1.prototype.pauseAll = function(cb) {
    this.post('command/pauseAll', {}, cb)
}

ApiV1.prototype.resume = function(hashes, cb) {
    this.performMultiPostAction('resume', hashes, {}, cb)
}

ApiV1.prototype.resumeAll = function(cb) {
    this.post('command/resumeAll', {}, cb)
}

ApiV1.prototype.delete = function(hashes, cb) {
    this.performPostAction('delete', hashes, {}, cb)
}

ApiV1.prototype.deleteAndRemove = function(hashes, cb) {
    this.performPostAction('deletePerm', hashes, {}, cb)
}

ApiV1.prototype.recheck = function(hashes, cb) {
    this.performMultiPostAction('recheck', hashes, {}, cb)
}

ApiV1.prototype.increasePrio = function(hashes, cb) {
    this.performPostAction('increasePrio', hashes, {}, cb)
}

ApiV1.prototype.decreasePrio = function(hashes, cb) {
    this.performPostAction('decreasePrio', hashes, {}, cb)
}

ApiV1.prototype.topPrio = function(hashes, cb) {
    this.performPostAction('topPrio', hashes, {}, cb)
}

ApiV1.prototype.bottomPrio = function(hashes, cb) {
    this.performPostAction('bottomPrio', hashes, {}, cb)
}

ApiV1.prototype.rename = function(hash, name, cb) {
    this.performMultiPostAction('rename', hash, {name}, cb)
}

ApiV1.prototype.setCategory = function(hashes, category, cb) {
    this.performPostAction('setCategory', hashes, {category}, cb)
}

ApiV1.prototype.setLocation = function(hashes, location, cb) {
    this.performPostAction('setLocation', hashes, {location}, cb)
}

ApiV1.prototype.createCategory = function(category, savePath, cb) {
    this.post('command/addCategory', {form: {category}}, cb)
}

ApiV1.prototype.removeCategories = function(categories, cb) {
    categories = Array.isArray(categories) ? categories : [categories]
    this.post('command/removeCategories', {
        form: {
            categories: categories.join('\n'),
        }
    }, this.handleError(cb))
}

ApiV1.prototype.setAutoManagement = function(hashes, enable, cb) {
    this.performPostAction('setAutoTMM', hashes, {enable}, cb)
}

ApiV1.prototype.toggleSequentialDownload = function(hashes, cb) {
    this.performPostAction('toggleSequentialDownload', hashes, {}, cb)
}

ApiV1.prototype.toggleFirstLastPiecePrio = function(hashes, cb) {
    this.performPostAction('toggleFirstLastPiecePrio', hashes, {}, cb)
}

ApiV1.prototype.setForceStart = function(hashes, value, cb) {
    this.performPostAction('setForceStart', hashes, {value}, cb)
}

ApiV1.prototype.setSuperSeeding = function(hashes, value, cb) {
    this.performPostAction('setSuperSeeding', hashes, {value}, cb)
}

module.exports = ApiV1
