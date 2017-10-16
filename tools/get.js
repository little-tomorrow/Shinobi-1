var fs = require('fs');
var url = require('url');
var http = require('http');
var path = require('path');
var crypto = require('crypto');
var moment = require('moment');

var config = require('../Config');
var create = require('./create');

function toLong(ip) {
    var ipl = 0;
    ip.split('.').forEach(function(octet) {
        ipl <<= 8;
        ipl += parseInt(octet);
    });
    return ipl >>> 0;
}

function fromLong(ipl) {
    return (
        (ipl >>> 24) +
        '.' +
        ((ipl >> 16) & 255) +
        '.' +
        ((ipl >> 8) & 255) +
        '.' +
        (ipl & 255)
    );
}

module.exports = {
    toLong,
    fromLong,
    md5(x) {
        return crypto
            .createHash('md5')
            .update(x)
            .digest('hex');
    },
    nameToTime(x) {
        (x = x.split('.')[0].split('T')), (x[1] = x[1].replace(/-/g, ':'));
        x = x.join(' ');
        return x;
    },
    ratio(width, height, ratio) {
        ratio = width / height;
        return Math.abs(ratio - 4 / 3) < Math.abs(ratio - 16 / 9) ? '4:3' : '16:9';
    },
    gid(x) {
        if (!x) {
            x = 10;
        }
        var t = '';
        var p = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (var i = 0; i < x; i++) t += p.charAt(Math.floor(Math.random() * p.length));
        return t;
    },
    moment_withOffset(e, x) {
        if (!e) {
            e = new Date();
        }
        if (!x) {
            x = 'YYYY-MM-DDTHH-mm-ss';
        }
        e = moment(e);
        if (config.utcOffset) {
            e = e.utcOffset(config.utcOffset);
        }
        return e.format(x);
    },
    moment(e, x) {
        if (!e) {
            e = new Date();
        }
        if (!x) {
            x = 'YYYY-MM-DDTHH-mm-ss';
        }
        return moment(e).format(x);
    },
    ipRange(start_ip, end_ip) {
        var start_long = toLong(start_ip);
        var end_long = toLong(end_ip);
        if (start_long > end_long) {
            var tmp = start_long;
            start_long = end_long;
            end_long = tmp;
        }
        var range_array = [];
        var i;
        for (i = start_long; i <= end_long; i++) {
            range_array.push(fromLong(i));
        }
        return range_array;
    },
    portRange(lowEnd, highEnd) {
        var list = [];
        for (var i = lowEnd; i <= highEnd; i++) {
            list.push(i);
        }
        return list;
    },
    getKeAndMidByVideoPath(videoPath) {
        var pathSplit = videoPath.split(path.sep);
        var monitorId = pathSplit[pathSplit.length - 1];
        var groupKey = pathSplit[pathSplit.length - 2];
        if (!monitorId) {
            monitorId = pathSplit[pathSplit.length - 2];
            groupKey = pathSplit[pathSplit.length - 3];
        }

        return {
            monitorId,
            groupKey,
        };
    },
    downloadFile(fileUrl, downloadDir) {
        if (!fs.existsSync(downloadDir)) {
            create.mkdirParent(downloadDir);
        }

        var fileName = url
            .parse(fileUrl)
            .pathname.split('/')
            .pop();

        var options = {
            host: url.parse(fileUrl).hostname,
            port: url.parse(fileUrl).port,
            path: url.parse(fileUrl).pathname,
        };
        var file = fs.createWriteStream(path.join(downloadDir, fileName));

        http.get(options, function(res) {
            res
                .on('data', function(data) {
                    file.write(data);
                })
                .on('end', function() {
                    file.end();
                })
                .on('error', function(err) {
                    console.log(err);
                })
        });
    },
};
