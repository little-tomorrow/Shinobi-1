#!/usr/bin/env node

/**
 * Module dependencies.
 */

var fs = require('fs');
var exec = require('child_process').exec;
var debug = require('debug')('node-server:server');
var app = require('./app');
var { ffmpegKill } = require('./tools/ffmpeg');
var get = require('./tools/get');
var db = require('./database');
var io = require('./io');
require('./api');

var s = app.s;
var lang = app.config.getLanguageFile();

if (!app.s.isOldFFmpeg) {
    process.on('uncaughtException', err => {
        console.error('uncaughtException', err);
    });

    process.send = process.send || function() {};
    process.on('exit', ffmpegKill.bind(null));
    process.on('SIGINT', shutDown);

    function shutDown() {
        console.log('Received kill signal, shutting down gracefully');
        ffmpegKill.call(null, (err) => {
            if (err) {
                console.error(`exec error: ${err}`);
                return;
            }
            app.server.close(() => {
                console.log('Closed out remaining connections');
                process.exit(0);
            });
            
            setTimeout(() => {
                console.error('Could not close connections in time, forcefully shutting down');
                process.exit(1);
            }, 10000);
        })
    }

    /**
     * Listen on provided port, on all network interfaces.
     */

    //start server
    app.server.listen(app.port, app.bindip, function() {
        onListening();
        console.log('Shinobi - PORT : ' + app.port);
    });
    app.server.on('error', onError);

    // setInterval
    try {
        setInterval(function() {
            app.s.cpuUsage(function(cpu) {
                app.s.ramUsage(function(ram) {
                    app.s.tx({ f: 'os', cpu: cpu, ram: ram }, 'CPU');
                });
            });
        }, 10000);
    } catch (err) {
        app.s.systemLog(lang['CPU indicator will not work. Continuing...']);
    }
    //check disk space every 20 minutes
    if (app.config.autoDropCache === true) {
        setInterval(function() {
            exec('echo 3 > /proc/sys/vm/drop_caches', { detached: true });
        }, 60000 * 20);
    }
    function beat() {
        setTimeout(beat, 8000);
        io.sockets.emit('ping', { beat: 1 });
    }
    beat();
    setTimeout(function() {
        //get current disk used for each isolated account (admin user) on startup
        db.UserManager
            .getUsers({
                select: '*',
                where: 'details NOT LIKE ?',
                value: ['%"sub"%'],
            })
            .then(function(r) {
                if (r && r[0]) {
                    var count = r.length;
                    var countFinished = 0;
                    r.forEach(function(v, n) {
                        (function(v) {
                            v.size = 0;
                            v.limit = JSON.parse(v.details).size;
                            db.VideoManager
                                .getVideos({
                                    where: 'ke=? AND status!=?',
                                    value: [v.ke, 0],
                                })
                                .then(function(rr) {
                                    ++countFinished;
                                    if (r && r[0]) {
                                        rr.forEach(function(b) {
                                            v.size += b.size;
                                        });
                                    }
                                    s.systemLog(
                                        v.mail +
                                            ' : ' +
                                            lang.startUpText0 +
                                            ' : ' +
                                            rr.length,
                                        v.size
                                    );
                                    if (!s.group[v.ke]) {
                                        s.group[v.ke] = {};
                                    }
                                    if (!s.group[v.ke].init) {
                                        s.group[v.ke].init = {};
                                    }
                                    if (!v.limit || v.limit === '') {
                                        v.limit = 10000;
                                    } else {
                                        v.limit = parseFloat(v.limit);
                                    }
                                    //save global space limit for group key (mb)
                                    s.group[v.ke].init.size = v.limit;
                                    //save global used space as megabyte value
                                    s.group[v.ke].init.used_space =
                                        v.size / 1000000;
                                    //emit the changes to connected users
                                    s.init('diskUsed', v);
                                    s.systemLog(
                                        v.mail + ' : ' + lang.startUpText1,
                                        countFinished + '/' + count
                                    );
                                    if (countFinished === count) {
                                        s.systemLog(lang.startUpText2);
                                        ////close open videos
                                        return db.VideoManager.getVideosByWhere(
                                            {
                                                status: 0,
                                            }
                                        );
                                    }
                                })
                                .then(function(r) {
                                    if (r) {
                                        if (r && r[0]) {
                                            r.forEach(function(v) {
                                                s.init(0, v);
                                                v.filename = get.moment(v.time);
                                                s.video('close', v);
                                            });
                                        }
                                        s.systemLog(lang.startUpText3);
                                        setTimeout(function() {
                                            s.systemLog(lang.startUpText4);
                                            //preliminary monitor start
                                            db.MonitorManager
                                                .getMonitors()
                                                .then(function(r) {
                                                    if (r && r[0]) {
                                                        r.forEach(function(v) {
                                                            s.init(0, v);
                                                            r.ar = {};
                                                            r.ar.id = v.mid;
                                                            Object.keys(v).forEach(function(b) {
                                                                r.ar[b] = v[b];
                                                            });
                                                            if (!s.group[v.ke]) {
                                                                s.group[v.ke] = {};
                                                                s.group[v.ke].mon_conf = {};
                                                            }
                                                            v.details = JSON.parse(v.details);
                                                            s.group[v.ke].mon_conf[v.mid] = v;
                                                            s.camera(v.mode, r.ar);
                                                        });
                                                    }
                                                    s.systemLog(lang.startUpText5);
                                                    process.send('ready');
                                                })
                                                .catch(function(err) {
                                                    s.systemLog(err);
                                                    s.systemLog(lang.startUpText5);
                                                    process.send('ready');
                                                });
                                        }, 3000);
                                    }
                                })
                        })(v);
                    });
                }
            });
    }, 1500);

    /**
     * Event listener for HTTP server "error" event.
     */

    function onError(error) {
        if (error.syscall !== 'listen') {
            throw error;
        }

        var bind =
            typeof app.port === 'string'
                ? 'Pipe ' + app.port
                : 'Port ' + app.port;

        // handle specific listen errors with friendly messages
        switch (error.code) {
            case 'EACCES':
                console.error(bind + ' requires elevated privileges');
                process.exit(1);
                break;
            case 'EADDRINUSE':
                console.error(bind + ' is already in use');
                process.exit(1);
                break;
            default:
                throw error;
        }
    }

    /**
     * Event listener for HTTP server "listening" event.
     */

    function onListening() {
        var addr = app.server.address();
        var bind =
            typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port;
        debug('Listening on ' + bind);
    }
}
