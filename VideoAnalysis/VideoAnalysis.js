var fs = require('fs');
var os = require('os');
var path = require('path');
var mysql = require('mysql');
var moment = require('moment');

var tools = require('../tools');
var api = require('./api');
var config = require('../conf.json');

var video = {};

// init config
if (!config.videosDir) {
    video.videosDir = path.join(__dirname, '../videos/');
} else {
    video.videosDir = path.join(__dirname, '../', config.videosDir);
}
if (!config.imagesDir) {
    video.imagesDir = path.join(__dirname, '../images/');
} else {
    video.imagesDir = path.join(__dirname, '../', config.imagesDir);
}
video.language = config.language || 'en_CA';

try {
    var lang = require('../languages/' + video.language + '.json');
} catch (er) {
    console.error(er);
    console.log('There was an error loading your language file.');
    var lang = require('../languages/en_CA.json');
}

var disc = function() {
    var sql = mysql.createConnection(config.db);
    sql.connect(function(err) {
        if (err) {
            systemLog(lang['Error Connecting'] + ' : DB', err);
            // setTimeout(disc, 2000);
        }
    });
    sql.on('error', function(err) {
        systemLog(lang['DB Lost.. Retrying..']);
        systemLog(err);
        // disc();
        return;
    });
    sql.on('connect', function() {
        sql.query(
            'ALTER TABLE `Videos` ADD COLUMN `details` TEXT NULL DEFAULT NULL AFTER `status`;',
            function(err) {
                if (err) {
                    systemLog('Already applied critical update.');
                }
            }
        );
    });

    return sql;
};

var sql = disc();

function systemLog(q, w, e) {
    if (!w) {
        w = '';
    }
    if (!e) {
        e = '';
    }
    if (typeof q === 'string') {
        sql.query('INSERT INTO Logs (ke,mid,info) VALUES (?,?,?)', [
            '$',
            '$SYSTEM',
            JSON.stringify({ type: q, msg: w }),
        ]);
    }
    return console.log(moment().format(), q, w, e);
}

function getVideoAnalysis(videoName, videoPath) {
    return api.getAnalysisResult(videoName, videoPath, (err, res, body) => {
        if (err) {
            console.log(err);
            return;
        }
        body = JSON.parse(body);

        if (body.all_label_list.length > 0) {
            var { groupKey, monitorId } = tools.getKeAndMidByVideoPath(
                videoPath
            );
            // var imageFullDir = path.join(video.imagesDir, groupKey, monitorId);
            var imageFullDir = path.join(video.imagesDir);

            var allImageAddress = [body.bg.bg];

            var result = Object.keys(body.result).map(key => {
                if (body.result[key].length > 0) {
                    return body.result[key].map(e => {
                        var info = e.info.map(element => {
                            allImageAddress.push(element.address);

                            var name = path.basename(element.address);

                            return Object.assign(element, { name });
                        });

                        return Object.assign(e, { info });
                    });
                }

                return body.result[key];
            });

            body.result = result;

            // FIXME: 多个视频分析任务会阻塞图片下载，现在先改为从视频分析文件夹下的图片文件夹中读取文件，以后修复为下载
            // save analysis image
            // allImageAddress.forEach(address => {
            //     tools.downloadFile(`${api.videoAnalysisUrl}${address}`, imageFullDir);
            // });

            // save analysis result
            saveResult(
                path.parse(videoName).name,
                videoPath,
                JSON.stringify(body)
            );
        }
    });
}

function saveResult(videoName, videoPath, result) {
    var { groupKey, monitorId } = tools.getKeAndMidByVideoPath(videoPath);
    var videoTime = tools.nameToTime(videoName);
    sql.query(
        'SELECT * FROM Videos_analysis WHERE ke=? and mid=? and video_time=?',
        [groupKey, monitorId, videoTime],
        function(err, rows) {
            if (err) {
                return;
            }
            if (rows.length === 0) {
                sql.query(
                    'INSERT INTO Videos_analysis (ke,mid,video_time,details) VALUES (?,?,?,?)',
                    [groupKey, monitorId, videoTime, result]
                );
            } else {
                sql.query(
                    `UPDATE Videos_analysis SET details=? WHERE ke=? and mid=? and video_time=?`,
                    [result, groupKey, monitorId, videoTime]
                );
            }
        }
    );
}

function checkIsAnalysis(groupKey, monitorId, callback) {
    sql.query(
        'SELECT * FROM Monitors WHERE ke=? and mid=?',
        [groupKey, monitorId],
        function(err, rows) {
            if (rows && rows[0]) {
                var details = JSON.parse(rows[0].details);
                if (
                    rows[0].mode === 'record' &&
                    details.is_video_analysis === '1'
                ) {
                    callback();
                }
            }
        }
    );
}

var watchList = {};
var timer = {};

function walk(dir, callback, filter) {
    fs.readdirSync(dir).forEach(function(item) {
        var fullname = path.join(dir, item);

        if (fs.statSync(fullname).isDirectory()) {
            if (!filter(fullname)) {
                return;
            }

            watch(fullname, callback, filter);
            walk(fullname, callback, filter);
        }
    });
}

function watch(name, callback, filter) {
    if (watchList[name]) {
        watchList[name].close();
    }

    watchList[name] = fs.watch(name, function(event, filename) {
        if (filename === null) {
            return;
        }

        var fullname = path.join(name, filename);
        var type;
        var fstype;

        if (!filter(fullname)) {
            return;
        }

        // 检查文件、目录是否存在
        if (!fs.existsSync(fullname)) {
            // 如果目录被删除则关闭监视器
            if (watchList[fullname]) {
                fstype = 'directory';
                watchList[fullname].close();
                delete watchList[fullname];
            } else {
                fstype = 'file';
            }

            type = 'delete';
        } else {
            // 文件
            if (fs.statSync(fullname).isFile()) {
                fstype = 'file';
                type = event == 'rename' ? 'create' : 'updated';

                // 文件夹
            } else if (event === 'rename') {
                fstype = 'directory';
                type = 'create';

                watch(fullname, callback, filter);
                walk(fullname, callback, filter);
            }
        }

        var eventData = {
            type: type,
            parent: name,
            target: filename,
            fstype: fstype,
        };

        if (/windows/i.test(os.type())) {
            // window 下的兼容处理
            clearTimeout(timer[fullname]);
            timer[fullname] = setTimeout(function() {
                callback(eventData);
            }, 16);
        } else {
            callback(eventData);
        }
    });

    watchList[name].on('error', function(err) {
        if (!fs.existsSync(name)) {
            console.log('folder deleted');
        }
    });
}

/**
 * @param {String} dir 要监听的目录
 * @param {Function} callback 文件、目录改变后的回调函数
 * @param {Function} [filter] 过滤器（可选）
 */
function startWatch(dir, callback, filter) {
    // 排除“.”、“_”开头或者非英文命名的目录
    var FILTER_RE = /[^\w\.\-$]/;
    filter =
        filter ||
        function(name) {
            return FILTER_RE.test(name);
        };

    watch(dir, callback, filter);
    walk(dir, callback, filter);
}

startWatch(video.videosDir, data => {
    if (data.fstype === 'file' && data.type === 'create') {
        const { groupKey, monitorId } = tools.getKeAndMidByVideoPath(
            data.parent
        );
        checkIsAnalysis(groupKey, monitorId, function() {
            sql.query(
                'SELECT * FROM Videos WHERE ke=? AND mid=? ORDER BY `time` DESC',
                [groupKey, monitorId],
                function(err, rows) {
                    var video = rows.find(row => row.end);
                    if (video) {
                        fs.access(
                            path.join(
                                data.parent,
                                `${tools.moment(video.time)}.${video.ext}`
                            ),
                            err => {
                                if (err) {
                                    console.log('video no access');
                                    return;
                                }

                                getVideoAnalysis(
                                    `${tools.moment(video.time)}.${video.ext}`,
                                    data.parent
                                );
                            }
                        );
                    }
                }
            );
        });
    } else if (data.fstype === 'file' && data.type === 'delete') {
        const { groupKey, monitorId } = tools.getKeAndMidByVideoPath(
            data.parent
        );
        sql.query(
            'SELECT * FROM Videos_analysis WHERE ke=? and mid=? and video_time=?',
            [groupKey, monitorId, tools.nameToTime(data.target)],
            function(err, rows) {
                if (rows && rows[0]) {
                    const detail = JSON.parse(rows[0].details);

                    const imageNames = [path.basename(detail.bg.bg)];

                    Object.keys(detail.result).forEach(key => {
                        detail.result[key].forEach(e => {
                            var info = e.info.forEach(element => {
                                imageNames.push(element.name);
                            });
                        });
                    });

                    deleleLocalImages(imageNames);

                    api.deleleImages(imageNames);

                    sql.query(
                        'DELETE FROM Videos_analysis WHERE ke=? and mid=? and video_time=?',
                        [groupKey, monitorId, tools.nameToTime(data.target)]
                    );
                }
            }
        );
    }
});

function deleleLocalImages(imageNames) {
    imageNames.forEach(name => {
        const imagePath = path.join(video.imagesDir, name);
        if (fs.existsSync(imagePath)) {
            fs.unlink(imagePath, function(err) {
                if (err) {
                    console.log('image Delete Failed: ' + imagePath);
                }
            });
        }
    });
}

// delete old image
const clearImage = () => {
    sql.query('SELECT details FROM Videos_analysis', function(err, rows) {
        if (rows && rows[0]) {
            const currImages = [];
            rows.forEach(row => {
                const detail = JSON.parse(row.details);
                currImages.push(path.basename(detail.bg.bg));
                Object.keys(detail.result).forEach(key => {
                    detail.result[key].forEach(e => {
                        var info = e.info.forEach(element => {
                            currImages.push(element.name);
                        });
                    });
                });
            });

            fs.readdirSync(video.imagesDir).forEach(item => {
                var fullname = path.join(video.imagesDir, item);
                if (
                    !currImages.includes(item) &&
                    fs.statSync(fullname).isFile()
                ) {
                    fs.unlink(fullname, function(err) {
                        if (err) {
                            console.log('image Delete Failed: ' + fullname);
                        }
                    });
                }
            });
        }
    });

    setTimeout(clearImage, 1000 * 60 * 60 * 24);
};

clearImage();
