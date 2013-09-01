"use strict";

var libxmlext = require('libxmlext'),
    fs = require('fs'),
    util = require('util'),
    request = require('request'),
    DB = require('./lib/DB').DB,
    url_ = require('url'),
    undefined;

var PREFIX = /\/en-US\/docs\/(?:Web\/)?JavaScript\/Reference\//;

function Crawler() {
    this.db = new DB('docs.db');
    this.endpoint = "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference";
    this.queue = [];
    this.queue.push(this.endpoint);
    this.queueIndex = {};
    this.seen = {};
    var self = this;
    setTimeout(function () {
        console.log(self.queue.length);
    }, 1000);
}
Crawler.prototype = {
    run: function () {
        console.log('[queue] ' + this.queue.length);
        if (this.queue.length === 0) {
            // finish
            return;
        }

        var url = this.queue.shift();
        if (this.seen[url]) {
            // console.log('[seen] ' + url);
            this.run();
            return;
        }
        this.seen[url] = true;
        console.log('[url] ' + url);

        var self = this;
        if (this.db.exists(url)) {
            // console.log('[exist] ' + url);
            var src = this.db.fetch(url);
            this.processBody(url, src);
            self.run();
        } else {
            request(url, function (error, response, body) {
                console.log('[fetched] ' + url);
                if (error) {
                    console.log(url + " : " + error);
                    return;
                }
                if (response.statusCode === 404) {
                    console.log('[404] ' + url);
                } else if (response.statusCode !== 200) {
                    console.log(url + " : " + response.statusCode + " : " + body);
                } else {
                    self.db.insert(url, body);
                    self.processBody(url, body);
                }
                self.run();
            });
        }
    },
    processBody: function (url, body) {
        var self = this;
        var doc = libxmlext.parseHtmlString(body);
        doc.find('//a').forEach(function (a) {
            // console.log('a: ' + a.toString());
            var href = a.attr('href');
            if (!href) { return; }
            var nextlink = self.normalizeUrl(url, href.value());
            if (self.seen[nextlink]) {
                // console.log('[seen2] ' + nextlink);
                return;
            }
            if (PREFIX.test(nextlink)) {
                self.push(nextlink);
            } else {
                // console.log('skip: ' + nextlink);
            }
        });
    },
    push: function (url) {
        if (!this.queueIndex[url]) {
            console.log('[push] ' + url);
            this.queueIndex[url] = true;
            this.queue.unshift(url);
        }
    },
    normalizeUrl: function (url, href) {
        // remove param
        href = href.replace(/\?.*/, '').replace(/#.*/, '');
        // remove link to history
        href = href.replace(/\$.*/, '');
        // resolve
        href = url_.resolve(url, href).toString();
        // make method camel
        href = href.replace(/(\/(?:Array|Object|Error|Function)\/)([A-Z])/, function(str, p1, p2) {
            return p1 + p2.toLowerCase();
        });
        // be carefull Number const
        href = href.replace('/Number/To', '/Number/to');
        href = href.replace('/Reference/Operators/Special/', '/Reference/Operators/');
        // href = href.replace('/JavaScript_typed_arrays/', '/JavaScript/Typed_arrays');
        href = href.replace(/^http:/, 'https:');
        href = href.replace('/en/', '/en-US/');
        href = href.replace(/\/en-US(?:\/docs)?(?:\/Web)?\/JavaScript\//, '/en-US/docs/Web/JavaScript/');
        return href;
    }
};

var crawler = new Crawler();
crawler.run();

process.on('exit', function () {
    console.log(crawler.queue.length);
});
