var fs = require('fs');
var exec = require('child_process').exec;
var CircularJSON = require('circular-json');

var { app, config, s } = require('./app');
var get = require('./tools/get');
var db = require('./database');

var lang = config.getLanguageFile();

if (config.mail) {
    var nodemailer = require('nodemailer').createTransport(config.mail);
}
if (config.productType === 'Pro') {
    var LdapAuth = require('ldapauth-fork');
}

//readme
app.get('/info', function(req, res) {
    res.sendFile(__dirname + '/index.html');
});
//main page
app.get(['/', '/:screen'], function(req, res) {
    res.render(
        'index',
        { lang: lang, config: config, screen: req.params.screen },
        function(err, html) {
            if (err) {
                s.systemLog(err);
            }
            res.end(html);
        }
    );
});
//update server
app.get('/:auth/update/:key', function(req, res) {
    req.ret = { ok: false };
    res.setHeader('Content-Type', 'application/json');
    req.fn = function(user) {
        if (!config.updateKey) {
            req.ret.msg = user.lang.updateKeyText1;
            return;
        }
        if (req.params.key === config.updateKey) {
            req.ret.ok = true;
            exec('chmod +x ' + __dirname + '/UPDATE.sh&&' + __dirname + '/./UPDATE.sh', {
                detached: true,
            });
        } else {
            req.ret.msg = user.lang.updateKeyText2;
        }
        res.end(s.s(req.ret, null, 3));
    };
    s.auth(req.params, req.fn, res, req);
});
//register function
app.post('/:auth/register/:ke/:uid', function(req, res) {
    req.resp = { ok: false };
    res.setHeader('Content-Type', 'application/json');
    s.auth(
        req.params,
        function(user) {
            db.UserManager
                .getUsers({
                    select: '*',
                    where: 'uid=? AND ke=? AND details NOT LIKE ? LIMIT 1',
                    value: [req.params.uid, req.params.ke, '%"sub"%'],
                })
                .then(function(u) {
                    if (u && u[0]) {
                        if (req.body.mail !== '' && req.body.pass !== '') {
                            if (req.body.pass === req.body.password_again) {
                                db.UserManager
                                    .getUsers({
                                        select: '*',
                                        where: 'mail=?',
                                        value: [req.body.mail],
                                    })
                                    .then(function(r) {
                                        if (r && r[0]) {
                                            //found one exist
                                            req.resp.msg = 'Email address is in use.';
                                        } else {
                                            //create new
                                            req.resp.msg = 'New Account Created';
                                            req.resp.ok = true;
                                            req.gid = get.gid();
                                            req.body.details =
                                                '{"sub":"1","allmonitors":"1"}';
                                            s.tx(
                                                {
                                                    f: 'add_sub_account',
                                                    details: req.body.details,
                                                    ke: req.params.ke,
                                                    uid: req.gid,
                                                    mail: req.body.mail,
                                                },
                                                'ADM_' + req.params.ke
                                            );
                                            db.UserManager.addNoAuthUser({
                                                value: [
                                                    req.params.ke,
                                                    req.gid,
                                                    req.body.mail,
                                                    get.md5(req.body.pass),
                                                    req.body.details,
                                                ],
                                            });
                                        }
                                        res.end(s.s(req.resp, null, 3));
                                    });
                            } else {
                                req.resp.msg = user.lang["Passwords Don't Match"];
                            }
                        } else {
                            req.resp.msg = user.lang['Fields cannot be empty'];
                        }
                    } else {
                        req.resp.msg = user.lang['Not an Administrator Account'];
                    }
                    if (req.resp.msg) {
                        res.end(s.s(req.resp, null, 3));
                    }
                });
        },
        res,
        req
    );
});
//login function
s.deleteFactorAuth = function(r) {
    delete s.factorAuth[r.ke][r.uid];
    if (Object.keys(s.factorAuth[r.ke]).length === 0) {
        delete s.factorAuth[r.ke];
    }
};
app.post(['/', '/:screen'], function(req, res) {
    req.ip =
        req.headers['cf-connecting-ip'] ||
        req.headers['CF-Connecting-IP'] ||
        req.headers["'x-forwarded-for"] ||
        req.connection.remoteAddress;
    if (req.query.json == 'true') {
        res.header('Access-Control-Allow-Origin', req.headers.origin);
    }
    req.renderFunction = function(focus, data) {
        if (req.query.json == 'true') {
            delete data.config;
            data.ok = true;
            res.setHeader('Content-Type', 'application/json');
            res.end(s.s(data, null, 3));
        } else {
            data.screen = req.params.screen;
            res.render(focus, data, function(err, html) {
                if (err) {
                    s.systemLog(err);
                }
                res.end(html);
            });
        }
    };
    req.failed = function(board) {
        if (req.query.json == 'true') {
            res.setHeader('Content-Type', 'application/json');
            res.end(s.s({ ok: false }, null, 3));
        } else {
            res.render(
                'index',
                {
                    failedLogin: true,
                    lang: lang,
                    config: config,
                    screen: req.params.screen,
                },
                function(err, html) {
                    if (err) {
                        s.systemLog(err);
                    }
                    res.end(html);
                }
            );
        }
        req.logTo = { ke: '$', mid: '$USER' };
        req.logData = {
            type: lang['Authentication Failed'],
            msg: { for: board, mail: req.body.mail, ip: req.ip },
        };
        if (board === 'super') {
            s.log(req.logTo, req.logData);
        } else {
            db.UserManager
                .getUsers({
                    select: 'ke,uid,details',
                    where: 'mail=?',
                    value: [req.body.mail],
                })
                .then(function(r) {
                    if (r && r[0]) {
                        r = r[0];
                        r.details = JSON.parse(r.details);
                        r.lang = config.getLanguageFile(r.details.lang);
                        req.logData.id = r.uid;
                        req.logData.type = r.lang['Authentication Failed'];
                        req.logTo.ke = r.ke;
                    }
                    s.log(req.logTo, req.logData);
                });
        }
    };
    req.fn = function(r) {
        switch (req.body.function) {
            case 'cam':
                db.MonitorManager
                    .getAllMonitorsLimit({
                        where: 'ke=? AND type=?',
                        value: [r.ke, 'dashcam'],
                    })
                    .then(function(rr) {
                        req.resp.mons = rr;
                        req.renderFunction('dashcam', {
                            $user: req.resp,
                            lang: r.lang,
                            define: config.getDefinitonFile(r.details.lang),
                        });
                    });
                break;
            case 'streamer':
                db.MonitorManager
                    .getAllMonitorsLimit({
                        where: 'ke=? AND type=?',
                        value: [r.ke, 'socket'],
                    })
                    .then(function(rr) {
                        req.resp.mons = rr;
                        req.renderFunction('streamer', {
                            $user: req.resp,
                            lang: r.lang,
                            define: config.getDefinitonFile(r.details.lang),
                        });
                    });
                break;
            case 'admin':
                if (!r.details.sub) {
                    db.UserManager
                        .getUsers({
                            select: 'uid,mail,details',
                            where: 'ke=? AND details LIKE \'%"sub"%\'',
                            value: [r.ke],
                        })
                        .then(function(rr) {
                            db.MonitorManager
                                .getAllMonitorsLimit({
                                    where: 'ke=?',
                                    value: [r.ke],
                                })
                                .then(function(rrr) {
                                    req.renderFunction('admin', {
                                        $user: req.resp,
                                        $subs: rr,
                                        $mons: rrr,
                                        lang: r.lang,
                                        define: config.getDefinitonFile(r.details.lang),
                                    });
                                });
                        });
                } else {
                    //not admin user
                    req.renderFunction('home', {
                        $user: req.resp,
                        config: config,
                        lang: r.lang,
                        define: config.getDefinitonFile(r.details.lang),
                        addStorage: s.dir.addStorage,
                        fs: fs,
                    });
                }
                break;
            default:
                req.renderFunction('home', {
                    $user: req.resp,
                    config: config,
                    lang: r.lang,
                    define: config.getDefinitonFile(r.details.lang),
                    addStorage: s.dir.addStorage,
                    fs: fs,
                });
                break;
        }
        s.log(
            { ke: r.ke, mid: '$USER' },
            {
                type: r.lang['New Authentication Token'],
                msg: { for: req.body.function, mail: r.mail, id: r.uid, ip: req.ip },
            }
        );
        //    res.end();
    };
    if (req.body.mail && req.body.pass) {
        req.default = function() {
            db.UserManager
                .getUsers({
                    select: '*',
                    where: 'mail=? AND pass=?',
                    value: [req.body.mail, get.md5(req.body.pass)],
                })
                .then(function(r) {
                    req.resp = { ok: false };
                    if (r && r[0]) {
                        r = r[0];
                        r.auth = get.md5(get.gid());
                        db.UserManager.updateUser({
                            set: 'auth=?',
                            where: 'ke=? AND uid=?',
                            value: [r.auth, r.ke, r.uid],
                        });
                        req.resp = {
                            ok: true,
                            auth_token: r.auth,
                            ke: r.ke,
                            uid: r.uid,
                            mail: r.mail,
                            details: r.details,
                        };
                        r.details = JSON.parse(r.details);
                        r.lang = config.getLanguageFile(r.details.lang);
                        req.factorAuth = function(cb) {
                            if (r.details.factorAuth === '1') {
                                if (
                                    !r.details.acceptedMachines ||
                                    !(r.details.acceptedMachines instanceof Object)
                                ) {
                                    r.details.acceptedMachines = {};
                                }
                                if (!r.details.acceptedMachines[req.body.machineID]) {
                                    req.complete = function() {
                                        s.factorAuth[r.ke][r.uid].info = req.resp;
                                        clearTimeout(
                                            s.factorAuth[r.ke][r.uid].expireAuth
                                        );
                                        s.factorAuth[r.ke][
                                            r.uid
                                        ].expireAuth = setTimeout(function() {
                                            s.deleteFactorAuth(r);
                                        }, 1000 * 60 * 15);
                                        req.renderFunction('factor', {
                                            $user: req.resp,
                                            lang: r.lang,
                                        });
                                    };
                                    if (!s.factorAuth[r.ke]) {
                                        s.factorAuth[r.ke] = {};
                                    }
                                    if (!s.factorAuth[r.ke][r.uid]) {
                                        s.factorAuth[r.ke][r.uid] = {
                                            key: s.nid(),
                                            user: r,
                                        };
                                        r.mailOptions = {
                                            from:
                                                '"ShinobiCCTV" <no-reply@shinobi.video>',
                                            to: r.mail,
                                            subject: r.lang['2-Factor Authentication'],
                                            html:
                                                r.lang['Enter this code to proceed'] +
                                                ' <b>' +
                                                s.factorAuth[r.ke][r.uid].key +
                                                '</b>. ' +
                                                r.lang.FactorAuthText1,
                                        };
                                        nodemailer.sendMail(
                                            r.mailOptions,
                                            (error, info) => {
                                                if (error) {
                                                    s.systemLog(r.lang.MailError, error);
                                                    req.fn(r);
                                                    return;
                                                }
                                                req.complete();
                                            }
                                        );
                                    } else {
                                        req.complete();
                                    }
                                } else {
                                    req.fn(r);
                                }
                            } else {
                                req.fn(r);
                            }
                        };
                        if (r.details.sub) {
                            db.UserManager
                                .getUsers({
                                    select: 'details',
                                    where: 'ke=? AND details NOT LIKE ?',
                                    value: [r.ke, '%"sub"%'],
                                })
                                .then(function(rr) {
                                    rr = rr[0];
                                    rr.details = JSON.parse(rr.details);
                                    r.details.mon_groups = rr.details.mon_groups;
                                    req.resp.details = JSON.stringify(r.details);
                                    req.factorAuth();
                                });
                        } else {
                            req.factorAuth();
                        }
                    } else {
                        req.failed(req.body.function);
                    }
                });
        };
        if (LdapAuth && req.body.function === 'ldap' && req.body.key !== '') {
            db.UserManager
                .getUsers({
                    select: '*',
                    where: 'ke=? AND details NOT LIKE ?',
                    value: [req.body.key, '%"sub"%'],
                })
                .then(function(r) {
                    if (r && r[0]) {
                        r = r[0];
                        r.details = JSON.parse(r.details);
                        r.lang = config.getLanguageFile(r.details.lang);
                        if (
                            r.details.use_ldap !== '0' &&
                            r.details.ldap_enable === '1' &&
                            r.details.ldap_url &&
                            r.details.ldap_url !== ''
                        ) {
                            req.mailArray = {};
                            req.body.mail.split(',').forEach(function(v) {
                                v = v.split('=');
                                req.mailArray[v[0]] = v[1];
                            });
                            if (!r.details.ldap_bindDN || r.details.ldap_bindDN === '') {
                                r.details.ldap_bindDN = req.body.mail;
                            }
                            if (
                                !r.details.ldap_bindCredentials ||
                                r.details.ldap_bindCredentials === ''
                            ) {
                                r.details.ldap_bindCredentials = req.body.pass;
                            }
                            if (
                                !r.details.ldap_searchFilter ||
                                r.details.ldap_searchFilter === ''
                            ) {
                                r.details.ldap_searchFilter = req.body.mail;
                                if (req.mailArray.cn) {
                                    r.details.ldap_searchFilter =
                                        'cn=' + req.mailArray.cn;
                                }
                                if (req.mailArray.uid) {
                                    r.details.ldap_searchFilter =
                                        'uid=' + req.mailArray.uid;
                                }
                            } else {
                                r.details.ldap_searchFilter = r.details.ldap_searchFilter.replace(
                                    '{{username}}',
                                    req.body.mail
                                );
                            }
                            if (
                                !r.details.ldap_searchBase ||
                                r.details.ldap_searchBase === ''
                            ) {
                                r.details.ldap_searchBase = 'dc=test,dc=com';
                            }
                            req.auth = new LdapAuth({
                                url: r.details.ldap_url,
                                bindDN: r.details.ldap_bindDN,
                                bindCredentials: r.details.ldap_bindCredentials,
                                searchBase: r.details.ldap_searchBase,
                                searchFilter: '(' + r.details.ldap_searchFilter + ')',
                                reconnect: true,
                            });
                            req.auth.on('error', function(err) {
                                console.error('LdapAuth: ', err);
                            });

                            req.auth.authenticate(req.body.mail, req.body.pass, function(
                                err,
                                user
                            ) {
                                if (user) {
                                    //found user
                                    if (!user.uid) {
                                        user.uid = get.gid();
                                    }
                                    req.resp = {
                                        ke: req.body.key,
                                        uid: user.uid,
                                        auth: get.md5(get.gid()),
                                        mail: user.cn,
                                        pass: get.md5(req.body.pass),
                                        details: JSON.stringify({
                                            sub: '1',
                                            ldap: '1',
                                            allmonitors: '1',
                                        }),
                                    };
                                    user.post = [];
                                    Object.keys(req.resp).forEach(function(v) {
                                        user.post.push(req.resp[v]);
                                    });
                                    s.log(
                                        { ke: req.body.key, mid: '$USER' },
                                        {
                                            type: r.lang['LDAP Success'],
                                            msg: { user: user },
                                        }
                                    );
                                    db.UserManager
                                        .getUsers({
                                            select: '*',
                                            where: 'ke=? AND mail=?',
                                            value: [req.body.key, user.cn],
                                        })
                                        .then(function(rr) {
                                            if (rr && rr[0]) {
                                                //already registered
                                                rr = rr[0];
                                                req.resp = rr;
                                                rr.details = JSON.parse(rr.details);
                                                req.resp.lang = config.getLanguageFile(
                                                    rr.details.lang
                                                );
                                                s.log(
                                                    { ke: req.body.key, mid: '$USER' },
                                                    {
                                                        type:
                                                            r.lang[
                                                                'LDAP User Authenticated'
                                                            ],
                                                        msg: {
                                                            user: user,
                                                            shinobiUID: rr.uid,
                                                        },
                                                    }
                                                );
                                                db.UserManager.updateUserAuth({
                                                    value: [
                                                        req.resp.auth,
                                                        req.resp.ke,
                                                        rr.uid,
                                                    ],
                                                });
                                            } else {
                                                //new ldap login
                                                s.log(
                                                    { ke: req.body.key, mid: '$USER' },
                                                    {
                                                        type: r.lang['LDAP User is New'],
                                                        msg: {
                                                            info:
                                                                r.lang[
                                                                    'Creating New Account'
                                                                ],
                                                            user: user,
                                                        },
                                                    }
                                                );
                                                req.resp.lang = r.lang;
                                                db.UserManager.addAuthUser({
                                                    value: user.post,
                                                });
                                            }
                                            req.resp.details = JSON.stringify(
                                                req.resp.details
                                            );
                                            req.resp.auth_token = req.resp.auth;
                                            req.resp.ok = true;
                                            req.fn(req.resp);
                                        });
                                    return;
                                }
                                s.log(
                                    { ke: req.body.key, mid: '$USER' },
                                    { type: r.lang['LDAP Failed'], msg: { err: err } }
                                );
                                //no user
                                req.default();
                            });

                            req.auth.close(function(err) {});
                        } else {
                            req.default();
                        }
                    } else {
                        req.default();
                    }
                });
        } else {
            if (req.body.function === 'super') {
                if (!fs.existsSync('./super.json')) {
                    res.end(lang.superAdminText);
                    return;
                }
                req.ok = s.superAuth(
                    { mail: req.body.mail, pass: req.body.pass, users: true, md5: true },
                    function(data) {
                        db.LogManager
                            .getLogByKe({
                                ke: '$',
                            })
                            .then(function(r) {
                                if (!r) {
                                    r = [];
                                }
                                data.Logs = r;
                                fs.readFile('./conf.json', 'utf8', function(err, file) {
                                    data.plainConfig = JSON.parse(file);
                                    req.renderFunction('super', data);
                                });
                            });
                    }
                );
                if (req.ok === false) {
                    req.failed(req.body.function);
                }
            } else {
                req.default();
            }
        }
    } else {
        if (req.body.machineID && req.body.factorAuthKey) {
            if (
                s.factorAuth[req.body.ke] &&
                s.factorAuth[req.body.ke][req.body.id] &&
                s.factorAuth[req.body.ke][req.body.id].key === req.body.factorAuthKey
            ) {
                if (
                    s.factorAuth[req.body.ke][req.body.id].key === req.body.factorAuthKey
                ) {
                    if (req.body.remember === '1') {
                        req.details = JSON.parse(
                            s.factorAuth[req.body.ke][req.body.id].info.details
                        );
                        req.lang = config.getLanguageFile(req.details.lang);
                        if (
                            !req.details.acceptedMachines ||
                            !(req.details.acceptedMachines instanceof Object)
                        ) {
                            req.details.acceptedMachines = {};
                        }
                        if (!req.details.acceptedMachines[req.body.machineID]) {
                            req.details.acceptedMachines[req.body.machineID] = {};
                            db.UserManager.updateUserDetails({
                                value: [s.s(req.details), req.body.ke, req.body.id],
                            });
                        }
                    }
                    req.resp = s.factorAuth[req.body.ke][req.body.id].info;
                    req.fn(s.factorAuth[req.body.ke][req.body.id].user);
                } else {
                    req.renderFunction('factor', {
                        $user: s.factorAuth[req.body.ke][req.body.id].info,
                        lang: req.lang,
                    });
                    res.end();
                }
            } else {
                req.failed(lang['2-Factor Authentication']);
            }
        } else {
            req.failed(lang['2-Factor Authentication']);
        }
    }
});
// Get HLS stream (m3u8)
app.get('/:auth/hls/:ke/:id/:file', function(req, res) {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    req.fn = function(user) {
        req.dir =
            s.dir.streams + req.params.ke + '/' + req.params.id + '/' + req.params.file;
        res.on('finish', function() {
            res.end();
        });
        if (fs.existsSync(req.dir)) {
            fs.createReadStream(req.dir).pipe(res);
        } else {
            res.end(user.lang['File Not Found']);
        }
    };
    s.auth(req.params, req.fn, res, req);
});
//Get JPEG snap
app.get('/:auth/jpeg/:ke/:id/s.jpg', function(req, res) {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    s.auth(
        req.params,
        function(user) {
            if (
                user.details.sub &&
                user.details.allmonitors !== '1' &&
                user.details.monitors.indexOf(req.params.id) === -1
            ) {
                res.end(user.lang['Not Permitted']);
                return;
            }
            req.dir = s.dir.streams + req.params.ke + '/' + req.params.id + '/s.jpg';
            res.writeHead(200, {
                'Content-Type': 'image/jpeg',
                'Cache-Control': 'no-cache',
                Pragma: 'no-cache',
            });
            res.on('finish', function() {
                res.end();
                res = null;
            });
            if (fs.existsSync(req.dir)) {
                fs.createReadStream(req.dir).pipe(res);
            } else {
                fs.createReadStream(config.defaultMjpeg).pipe(res);
            }
        },
        res,
        req
    );
});
//Get MJPEG stream
app.get(['/:auth/mjpeg/:ke/:id', '/:auth/mjpeg/:ke/:id/:addon'], function(req, res) {
    if (req.params.addon == 'full') {
        res.render('mjpeg', {
            url: '/' + req.params.auth + '/mjpeg/' + req.params.ke + '/' + req.params.id,
        });
        res.end();
    } else {
        s.auth(
            req.params,
            function(user) {
                if (
                    user.permissions.watch_stream === '0' ||
                    (user.details.sub &&
                        user.details.allmonitors !== '1' &&
                        user.details.monitors.indexOf(req.params.id) === -1)
                ) {
                    res.end(user.lang['Not Permitted']);
                    return;
                }
                res.writeHead(200, {
                    'Content-Type': 'multipart/x-mixed-replace; boundary=shinobi',
                    'Cache-Control': 'no-cache',
                    Connection: 'keep-alive',
                    Pragma: 'no-cache',
                });
                var contentWriter,
                    content = fs.readFileSync(config.defaultMjpeg, 'binary');
                res.write('--shinobi\r\n');
                res.write('Content-Type: image/jpeg\r\n');
                res.write('Content-Length: ' + content.length + '\r\n');
                res.write('\r\n');
                res.write(content, 'binary');
                res.write('\r\n');
                if (
                    s.group[req.params.ke] &&
                    s.group[req.params.ke].mon[req.params.id] &&
                    s.group[req.params.ke].mon[req.params.id].emitter
                ) {
                    s.group[req.params.ke].mon[req.params.id].emitter.on(
                        'data',
                        (contentWriter = function(d) {
                            content = d;
                            res.write(content, 'binary');
                        })
                    );
                    res.on('close', function() {
                        s.group[req.params.ke].mon[req.params.id].emitter.removeListener(
                            'data',
                            contentWriter
                        );
                    });
                } else {
                    res.end();
                }
            },
            res,
            req
        );
    }
});
//embed monitor
app.get(['/:auth/embed/:ke/:id', '/:auth/embed/:ke/:id/:addon'], function(req, res) {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    req.params.protocol = req.protocol;
    s.auth(
        req.params,
        function(user) {
            if (
                user.permissions.watch_stream === '0' ||
                (user.details.sub &&
                    user.details.allmonitors !== '1' &&
                    user.details.monitors.indexOf(req.params.id) === -1)
            ) {
                res.end(user.lang['Not Permitted']);
                return;
            }
            if (s.group[req.params.ke] && s.group[req.params.ke].mon[req.params.id]) {
                if (s.group[req.params.ke].mon[req.params.id].started === 1) {
                    res.render('embed', {
                        data: req.params,
                        baseUrl: req.protocol + '://' + req.hostname,
                        config: config,
                        lang: user.lang,
                        mon: CircularJSON.parse(
                            CircularJSON.stringify(
                                s.group[req.params.ke].mon_conf[req.params.id]
                            )
                        ),
                    });
                    res.end();
                } else {
                    res.end(user.lang["Cannot watch a monitor that isn't running."]);
                }
            } else {
                res.end(user.lang['No Monitor Exists with this ID.']);
            }
        },
        res,
        req
    );
});
// Get monitors json
app.get(['/:auth/monitor/:ke', '/:auth/monitor/:ke/:id'], function(req, res) {
    req.ret = { ok: false };
    res.setHeader('Content-Type', 'application/json');
    req.fn = function(user) {
        if (user.permissions.get_monitors === '0') {
            res.end(s.s([]));
            return;
        }
        req.sql = 'SELECT * FROM Monitors WHERE ke=?';
        req.ar = [req.params.ke];
        if (!req.params.id) {
            if (
                user.details.sub &&
                user.details.monitors &&
                user.details.allmonitors !== '1'
            ) {
                try {
                    user.details.monitors = JSON.parse(user.details.monitors);
                } catch (er) {}
                req.or = [];
                user.details.monitors.forEach(function(v, n) {
                    req.or.push('mid=?');
                    req.ar.push(v);
                });
                req.sql += ' AND (' + req.or.join(' OR ') + ')';
            }
        } else {
            if (
                !user.details.sub ||
                user.details.allmonitors !== '0' ||
                user.details.monitors.indexOf(req.params.id) > -1
            ) {
                req.sql += ' and mid=?';
                req.ar.push(req.params.id);
            } else {
                res.end('[]');
                return;
            }
        }
        db.DBManager.db.query(req.sql, req.ar).then(function(r) {
            if (r.length === 1) {
                r = r[0];
            }
            res.end(s.s(r, null, 3));
        });
    };
    s.auth(req.params, req.fn, res, req);
});
// Get videos json
app.get(['/:auth/videos/:ke', '/:auth/videos/:ke/:id'], function(req, res) {
    s.auth(
        req.params,
        function(user) {
            if (
                user.permissions.watch_videos === '0' ||
                (user.details.sub &&
                    user.details.allmonitors !== '1' &&
                    user.details.video_view.indexOf(req.params.id) === -1)
            ) {
                res.end(s.s([]));
                return;
            }
            req.sql = 'SELECT * FROM Videos WHERE ke=?';
            req.ar = [req.params.ke];
            req.count_sql = 'SELECT COUNT(*) FROM Videos WHERE ke=?';
            req.count_ar = [req.params.ke];
            if (!req.params.id) {
                if (
                    user.details.sub &&
                    user.details.monitors &&
                    user.details.allmonitors !== '1'
                ) {
                    try {
                        user.details.monitors = JSON.parse(user.details.monitors);
                    } catch (er) {}
                    req.or = [];
                    user.details.monitors.forEach(function(v, n) {
                        req.or.push('mid=?');
                        req.ar.push(v);
                    });
                    req.sql += ' AND (' + req.or.join(' OR ') + ')';
                    req.count_sql += ' AND (' + req.or.join(' OR ') + ')';
                }
            } else {
                if (
                    !user.details.sub ||
                    user.details.allmonitors !== '0' ||
                    user.details.monitors.indexOf(req.params.id) > -1
                ) {
                    req.sql += ' and mid=?';
                    req.ar.push(req.params.id);
                    req.count_sql += ' and mid=?';
                    req.count_ar.push(req.params.id);
                } else {
                    res.end('[]');
                    return;
                }
            }
            if (req.query.start || req.query.end) {
                if (!req.query.startOperator || req.query.startOperator == '') {
                    req.query.startOperator = '>=';
                }
                if (!req.query.endOperator || req.query.endOperator == '') {
                    req.query.endOperator = '<=';
                }
                switch (true) {
                    case req.query.start &&
                        req.query.start !== '' &&
                        req.query.end &&
                        req.query.end !== '':
                        req.query.start = req.query.start.replace('T', ' ');
                        req.query.end = req.query.end.replace('T', ' ');
                        req.sql +=
                            ' AND `time` ' +
                            req.query.startOperator +
                            ' ? AND `end` ' +
                            req.query.endOperator +
                            ' ?';
                        req.count_sql +=
                            ' AND `time` ' +
                            req.query.startOperator +
                            ' ? AND `end` ' +
                            req.query.endOperator +
                            ' ?';
                        req.ar.push(req.query.start);
                        req.ar.push(req.query.end);
                        req.count_ar.push(req.query.start);
                        req.count_ar.push(req.query.end);
                        break;
                    case req.query.start && req.query.start !== '':
                        req.query.start = req.query.start.replace('T', ' ');
                        req.sql += ' AND `time` ' + req.query.startOperator + ' ?';
                        req.count_sql += ' AND `time` ' + req.query.startOperator + ' ?';
                        req.ar.push(req.query.start);
                        req.count_ar.push(req.query.start);
                        break;
                    case req.query.end && req.query.end !== '':
                        req.query.end = req.query.end.replace('T', ' ');
                        req.sql += ' AND `end` ' + req.query.endOperator + ' ?';
                        req.count_sql += ' AND `end` ' + req.query.endOperator + ' ?';
                        req.ar.push(req.query.end);
                        req.count_ar.push(req.query.end);
                        break;
                }
            }
            req.sql += ' ORDER BY `time` DESC';
            if (!req.query.limit || req.query.limit == '') {
                req.query.limit = '100';
            }
            if (req.query.limit !== '0') {
                req.sql += ' LIMIT ' + req.query.limit;
            }
            db.DBManager.db.query(req.sql, req.ar).then(function(r) {
                if (!r) {
                    res.end(
                        s.s(
                            { total: 0, limit: req.query.limit, skip: 0, videos: [] },
                            null,
                            3
                        )
                    );
                    return;
                }
                db.DBManager.db.query(req.count_sql, req.count_ar).then(function(count) {
                    r.forEach(function(v) {
                        v.href =
                            '/' +
                            req.params.auth +
                            '/videos/' +
                            v.ke +
                            '/' +
                            v.mid +
                            '/' +
                            get.moment(v.time) +
                            '.' +
                            v.ext;
                    });
                    if (req.query.limit.indexOf(',') > -1) {
                        req.skip = parseInt(req.query.limit.split(',')[0]);
                        req.query.limit = parseInt(req.query.limit.split(',')[0]);
                    } else {
                        req.skip = 0;
                        req.query.limit = parseInt(req.query.limit);
                    }
                    res.end(
                        s.s(
                            {
                                total: count[0]['COUNT(*)'],
                                limit: req.query.limit,
                                skip: req.skip,
                                videos: r,
                            },
                            null,
                            3
                        )
                    );
                });
            });
        },
        res,
        req
    );
});
// Get events json (motion logs)
app.get(
    [
        '/:auth/events/:ke',
        '/:auth/events/:ke/:id',
        '/:auth/events/:ke/:id/:limit',
        '/:auth/events/:ke/:id/:limit/:start',
        '/:auth/events/:ke/:id/:limit/:start/:end',
    ],
    function(req, res) {
        req.ret = { ok: false };
        res.setHeader('Content-Type', 'application/json');
        s.auth(
            req.params,
            function(user) {
                if (
                    user.permissions.watch_videos === '0' ||
                    (user.details.sub &&
                        user.details.allmonitors !== '1' &&
                        user.details.video_view.indexOf(req.params.id) === -1)
                ) {
                    res.end(s.s([]));
                    return;
                }
                req.sql = 'SELECT * FROM Events WHERE ke=?';
                req.ar = [req.params.ke];
                if (!req.params.id) {
                    if (
                        user.details.sub &&
                        user.details.monitors &&
                        user.details.allmonitors !== '1'
                    ) {
                        try {
                            user.details.monitors = JSON.parse(user.details.monitors);
                        } catch (er) {}
                        req.or = [];
                        user.details.monitors.forEach(function(v, n) {
                            req.or.push('mid=?');
                            req.ar.push(v);
                        });
                        req.sql += ' AND (' + req.or.join(' OR ') + ')';
                    }
                } else {
                    if (
                        !user.details.sub ||
                        user.details.allmonitors !== '0' ||
                        user.details.monitors.indexOf(req.params.id) > -1
                    ) {
                        req.sql += ' and mid=?';
                        req.ar.push(req.params.id);
                    } else {
                        res.end('[]');
                        return;
                    }
                }
                if (req.params.start && req.params.start !== '') {
                    req.params.start = req.params.start.replace('T', ' ');
                    if (req.params.end && req.params.end !== '') {
                        req.params.end = req.params.end.replace('T', ' ');
                        req.sql += ' AND `time` >= ? AND `time` <= ?';
                        req.ar.push(decodeURIComponent(req.params.start));
                        req.ar.push(decodeURIComponent(req.params.end));
                    } else {
                        req.sql += ' AND `time` >= ?';
                        req.ar.push(decodeURIComponent(req.params.start));
                    }
                }
                if (!req.params.limit || req.params.limit == '') {
                    req.params.limit = 100;
                }
                req.sql += ' ORDER BY `time` DESC LIMIT ' + req.params.limit + '';
                db.DBManager.db
                    .query(req.sql, req.ar)
                    .then(function(r) {
                        if (!r) {
                            r = [];
                        }
                        r.forEach(function(v, n) {
                            r[n].details = JSON.parse(v.details);
                        });
                        res.end(s.s(r, null, 3));
                    })
                    .catch(function(err) {
                        err.sql = req.sql;
                        res.end(s.s(err, null, 3));
                    });
            },
            res,
            req
        );
    }
);
// Get logs json
app.get(
    [
        '/:auth/logs/:ke',
        '/:auth/logs/:ke/:id',
        '/:auth/logs/:ke/:limit',
        '/:auth/logs/:ke/:id/:limit',
    ],
    function(req, res) {
        req.ret = { ok: false };
        res.setHeader('Content-Type', 'application/json');
        s.auth(
            req.params,
            function(user) {
                if (user.permissions.get_logs === '0') {
                    res.end(s.s([]));
                    return;
                }
                req.sql = 'SELECT * FROM Logs WHERE ke=?';
                req.ar = [req.params.ke];
                if (!req.params.id) {
                    if (
                        user.details.sub &&
                        user.details.monitors &&
                        user.details.allmonitors !== '1'
                    ) {
                        try {
                            user.details.monitors = JSON.parse(user.details.monitors);
                        } catch (er) {}
                        req.or = [];
                        user.details.monitors.forEach(function(v, n) {
                            req.or.push('mid=?');
                            req.ar.push(v);
                        });
                        req.sql += ' AND (' + req.or.join(' OR ') + ')';
                    }
                } else {
                    if (
                        !user.details.sub ||
                        user.details.allmonitors !== '0' ||
                        user.details.monitors.indexOf(req.params.id) > -1 ||
                        req.params.id.indexOf('$') > -1
                    ) {
                        req.sql += ' and mid=?';
                        req.ar.push(req.params.id);
                    } else {
                        res.end('[]');
                        return;
                    }
                }
                if (!req.params.limit || req.params.limit == '') {
                    req.params.limit = 100;
                }
                req.sql += ' ORDER BY `time` DESC LIMIT ' + req.params.limit + '';
                db.DBManager.db
                    .query(req.sql, req.ar)
                    .then(function(r) {
                        if (!r) {
                            r = [];
                        }
                        r.forEach(function(v, n) {
                            r[n].info = JSON.parse(v.info);
                        });
                        res.end(s.s(r, null, 3));
                    })
                    .catch(function(err) {
                        err.sql = req.sql;
                        res.end(s.s(err, null, 3));
                    });
            },
            res,
            req
        );
    }
);
// Get monitors online json
app.get('/:auth/smonitor/:ke', function(req, res) {
    req.ret = { ok: false };
    res.setHeader('Content-Type', 'application/json');
    req.fn = function(user) {
        if (user.permissions.get_monitors === '0') {
            res.end(s.s([]));
            return;
        }
        req.sql = 'SELECT * FROM Monitors WHERE ke=?';
        req.ar = [req.params.ke];
        if (
            user.details.sub &&
            user.details.monitors &&
            user.details.allmonitors !== '1'
        ) {
            try {
                user.details.monitors = JSON.parse(user.details.monitors);
            } catch (er) {}
            req.or = [];
            user.details.monitors.forEach(function(v, n) {
                req.or.push('mid=?');
                req.ar.push(v);
            });
            req.sql += ' AND (' + req.or.join(' OR ') + ')';
        }
        db.DBManager.db.query(req.sql, req.ar).then(function(r) {
            if (r && r[0]) {
                req.ar = [];
                r.forEach(function(v) {
                    if (
                        s.group[req.params.ke] &&
                        s.group[req.params.ke].mon[v.mid] &&
                        s.group[req.params.ke].mon[v.mid].started === 1
                    ) {
                        req.ar.push(v);
                    }
                });
            } else {
                req.ar = [];
            }
            res.end(s.s(req.ar, null, 3));
        });
    };
    s.auth(req.params, req.fn, res, req);
});
// Monitor Add,Edit,Delete
app.all(
    ['/:auth/configureMonitor/:ke/:id', '/:auth/configureMonitor/:ke/:id/:f'],
    function(req, res) {
        req.ret = { ok: false };
        res.setHeader('Content-Type', 'application/json');
        s.auth(req.params, function(user) {
            if (req.params.f !== 'delete') {
                if (!req.body.data && !req.query.data) {
                    req.ret.msg = 'No Monitor Data found.';
                    res.end(s.s(req.ret, null, 3));
                    return;
                }
                try {
                    if (req.query.data) {
                        req.monitor = JSON.parse(req.query.data);
                    } else {
                        req.monitor = JSON.parse(req.body.data);
                    }
                } catch (er) {
                    req.monitor = req.body.data;
                    if (!req.monitor || !req.monitor.details) {
                        req.ret.msg = user.lang.monitorEditText1;
                        res.end(s.s(req.ret, null, 3));
                        return;
                    }
                }
                if (
                    !user.details.sub ||
                    user.details.allmonitors === '1' ||
                    user.details.monitor_edit.indexOf(req.monitor.mid) > -1
                ) {
                    if (req.monitor && req.monitor.mid && req.monitor.name) {
                        (req.set = []), (req.ar = []);
                        req.monitor.mid = req.monitor.mid
                            .replace(/[^\w\s]/gi, '')
                            .replace(/ /g, '');
                        try {
                            JSON.parse(req.monitor.details);
                        } catch (er) {
                            if (
                                !req.monitor.details ||
                                !req.monitor.details.stream_type
                            ) {
                                req.ret.msg = user.lang.monitorEditText2;
                                res.end(s.s(req.ret, null, 3));
                                return;
                            } else {
                                req.monitor.details = JSON.stringify(req.monitor.details);
                            }
                        }
                        req.monitor.ke = req.params.ke;
                        req.logObject = {
                            details: JSON.parse(req.monitor.details),
                            ke: req.params.ke,
                            mid: req.params.id,
                        };
                        db.MonitorManager
                            .getAllMonitorsLimit({
                                where: 'ke=? AND mid=?',
                                value: [req.monitor.ke, req.monitor.mid],
                            })
                            .then(function(r) {
                                req.tx = {
                                    f: 'monitor_edit',
                                    mid: req.monitor.mid,
                                    ke: req.monitor.ke,
                                    mon: req.monitor,
                                };
                                if (r && r[0]) {
                                    req.tx.new = false;
                                    Object.keys(req.monitor).forEach(function(v) {
                                        if (req.monitor[v] && req.monitor[v] !== '') {
                                            req.set.push(v + '=?'),
                                                req.ar.push(req.monitor[v]);
                                        }
                                    });
                                    req.set = req.set.join(',');
                                    req.ar.push(req.monitor.ke),
                                        req.ar.push(req.monitor.mid);
                                    s.log(req.monitor, {
                                        type: 'Monitor Updated',
                                        msg: 'by user : ' + user.uid,
                                    });
                                    req.ret.msg =
                                        user.lang['Monitor Updated by user'] +
                                        ' : ' +
                                        user.uid;
                                    db.MonitorManager.updateMonitorByWhere({
                                        set: req.set,
                                        value: req.ar,
                                    });
                                    req.finish = 1;
                                } else {
                                    if (
                                        !s.group[req.monitor.ke].init.max_camera ||
                                        s.group[req.monitor.ke].init.max_camera == '' ||
                                        Object.keys(s.group[req.monitor.ke].mon).length <=
                                            parseInt(
                                                s.group[req.monitor.ke].init.max_camera
                                            )
                                    ) {
                                        req.tx.new = true;
                                        req.st = [];
                                        Object.keys(req.monitor).forEach(function(v) {
                                            if (req.monitor[v] && req.monitor[v] !== '') {
                                                req.set.push(v),
                                                    req.st.push('?'),
                                                    req.ar.push(req.monitor[v]);
                                            }
                                        });
                                        // req.set.push('ke'),req.st.push('?'),req.ar.push(req.monitor.ke);
                                        (req.set = req.set.join(',')),
                                            (req.st = req.st.join(','));
                                        s.log(req.monitor, {
                                            type: 'Monitor Added',
                                            msg: 'by user : ' + user.uid,
                                        });
                                        req.ret.msg =
                                            user.lang['Monitor Added by user'] +
                                            ' : ' +
                                            user.uid;
                                        db.MonitorManager.addMonitor({
                                            key: req.set.split(','),
                                            value: req.ar,
                                        });
                                        req.finish = 1;
                                    } else {
                                        req.tx.f = 'monitor_edit_failed';
                                        req.tx.ff = 'max_reached';
                                        req.ret.msg =
                                            user.lang.monitorEditFailedMaxReached;
                                    }
                                }
                                if (req.finish === 1) {
                                    req.monitor.details = JSON.parse(req.monitor.details);
                                    req.ret.ok = true;
                                    s.init(0, {
                                        mid: req.monitor.mid,
                                        ke: req.monitor.ke,
                                    });
                                    s.group[req.monitor.ke].mon_conf[
                                        req.monitor.mid
                                    ] = s.init('noReference', req.monitor);
                                    if (req.monitor.mode === 'stop') {
                                        s.camera('stop', req.monitor);
                                    } else {
                                        s.camera('stop', req.monitor);
                                        setTimeout(function() {
                                            s.camera(req.monitor.mode, req.monitor);
                                        }, 5000);
                                    }
                                    s.tx(req.tx, 'STR_' + req.monitor.ke);
                                }
                                s.tx(req.tx, 'GRP_' + req.monitor.ke);
                                res.end(s.s(req.ret, null, 3));
                            });
                    } else {
                        req.ret.msg = user.lang.monitorEditText1;
                        res.end(s.s(req.ret, null, 3));
                    }
                } else {
                    req.ret.msg = user.lang['Not Permitted'];
                    res.end(s.s(req.ret, null, 3));
                }
            } else {
                if (
                    !user.details.sub ||
                    user.details.allmonitors === '1' ||
                    user.details.monitor_edit.indexOf(req.params.id) > -1
                ) {
                    s.log(s.group[req.params.ke].mon_conf[req.params.id], {
                        type: 'Monitor Deleted',
                        msg: 'by user : ' + user.uid,
                    });
                    req.params.delete = 1;
                    s.camera('stop', req.params);
                    s.tx(
                        {
                            f: 'monitor_delete',
                            uid: user.uid,
                            mid: req.params.id,
                            ke: req.params.ke,
                        },
                        'GRP_' + req.params.ke
                    );
                    db.MonitorManager.deleteMonitorByWhere({
                        value: [req.params.ke, req.params.id],
                    });
                    req.ret.ok = true;
                    req.ret.msg = 'Monitor Deleted by user : ' + user.uid;
                    res.end(s.s(req.ret, null, 3));
                }
            }
        });
    }
);
app.get(
    [
        '/:auth/monitor/:ke/:id/:f',
        '/:auth/monitor/:ke/:id/:f/:ff',
        '/:auth/monitor/:ke/:id/:f/:ff/:fff',
    ],
    function(req, res) {
        req.ret = { ok: false };
        res.setHeader('Content-Type', 'application/json');
        s.auth(
            req.params,
            function(user) {
                if (
                    user.permissions.control_monitors === '0' ||
                    (user.details.sub &&
                        user.details.allmonitors !== '1' &&
                        user.details.monitor_edit.indexOf(req.params.id) === -1)
                ) {
                    res.end(user.lang['Not Permitted']);
                    return;
                }
                if (req.params.f === '') {
                    req.ret.msg = user.lang.monitorGetText1;
                    res.end(s.s(req.ret, null, 3));
                    return;
                }
                if (
                    req.params.f !== 'stop' &&
                    req.params.f !== 'start' &&
                    req.params.f !== 'record'
                ) {
                    req.ret.msg = 'Mode not recognized.';
                    res.end(s.s(req.ret, null, 3));
                    return;
                }
                db.MonitorManager
                    .getAllMonitorsLimit({
                        where: 'ke=? AND mid=?',
                        value: [req.params.ke, req.params.id],
                    })
                    .then(function(r) {
                        if (r && r[0]) {
                            r = r[0];
                            if (
                                req.query.reset === '1' ||
                                (s.group[r.ke] &&
                                    s.group[r.ke].mon_conf[r.mid].mode !==
                                        req.params.f) ||
                                (req.query.fps &&
                                    (!s.group[r.ke].mon[r.mid].currentState ||
                                        !s.group[r.ke].mon[r.mid].currentState
                                            .trigger_on))
                            ) {
                                if (
                                    req.query.reset !== '1' ||
                                    !s.group[r.ke].mon[r.mid].trigger_timer
                                ) {
                                    if (!s.group[r.ke].mon[r.mid].currentState)
                                        s.group[r.ke].mon[r.mid].currentState = {};
                                    s.group[r.ke].mon[
                                        r.mid
                                    ].currentState.mode = r.mode.toString();
                                    s.group[r.ke].mon[
                                        r.mid
                                    ].currentState.fps = r.fps.toString();
                                    if (
                                        !s.group[r.ke].mon[r.mid].currentState.trigger_on
                                    ) {
                                        s.group[r.ke].mon[
                                            r.mid
                                        ].currentState.trigger_on = true;
                                    } else {
                                        s.group[r.ke].mon[
                                            r.mid
                                        ].currentState.trigger_on = false;
                                    }
                                    r.mode = req.params.f;
                                    try {
                                        r.details = JSON.parse(r.details);
                                    } catch (er) {}
                                    if (req.query.fps) {
                                        r.fps = parseFloat(
                                            r.details.detector_trigger_record_fps
                                        );
                                        s.group[r.ke].mon[
                                            r.mid
                                        ].currentState.detector_trigger_record_fps =
                                            r.fps;
                                    }
                                    r.id = r.mid;
                                    db.MonitorManager.updateMonitorByWhere({
                                        set: 'mode=?',
                                        value: [r.mode, r.ke, r.mid],
                                    });
                                    s.group[r.ke].mon_conf[r.mid] = r;
                                    s.tx(
                                        {
                                            f: 'monitor_edit',
                                            mid: r.mid,
                                            ke: r.ke,
                                            mon: r,
                                        },
                                        'GRP_' + r.ke
                                    );
                                    s.tx(
                                        {
                                            f: 'monitor_edit',
                                            mid: r.mid,
                                            ke: r.ke,
                                            mon: r,
                                        },
                                        'STR_' + r.ke
                                    );
                                    s.camera('stop', s.init('noReference', r));
                                    if (req.params.f !== 'stop') {
                                        s.camera(req.params.f, s.init('noReference', r));
                                    }
                                    req.ret.msg =
                                        user.lang['Monitor mode changed'] +
                                        ' : ' +
                                        req.params.f;
                                } else {
                                    req.ret.msg = user.lang['Reset Timer'];
                                }
                                req.ret.cmd_at = get.moment(
                                    new Date(),
                                    'YYYY-MM-DD HH:mm:ss'
                                );
                                req.ret.ok = true;
                                if (req.params.ff && req.params.f !== 'stop') {
                                    req.params.ff = parseFloat(req.params.ff);
                                    clearTimeout(s.group[r.ke].mon[r.mid].trigger_timer);
                                    switch (req.params.fff) {
                                        case 'day':
                                        case 'days':
                                            req.timeout =
                                                req.params.ff * 1000 * 60 * 60 * 24;
                                            break;
                                        case 'hr':
                                        case 'hour':
                                        case 'hours':
                                            req.timeout = req.params.ff * 1000 * 60 * 60;
                                            break;
                                        case 'min':
                                        case 'minute':
                                        case 'minutes':
                                            req.timeout = req.params.ff * 1000 * 60;
                                            break;
                                        default:
                                            //seconds
                                            req.timeout = req.params.ff * 1000;
                                            break;
                                    }
                                    s.group[r.ke].mon[
                                        r.mid
                                    ].trigger_timer = setTimeout(function() {
                                        delete s.group[r.ke].mon[r.mid].trigger_timer;
                                        db.MonitorManager.updateMonitorByWhere({
                                            set: 'mode=?',
                                            value: [
                                                s.group[r.ke].mon[r.mid].currentState
                                                    .mode,
                                                r.ke,
                                                r.mid,
                                            ],
                                        });
                                        r.neglectTriggerTimer = 1;
                                        r.mode =
                                            s.group[r.ke].mon[r.mid].currentState.mode;
                                        r.fps = s.group[r.ke].mon[r.mid].currentState.fps;
                                        s.camera(
                                            'stop',
                                            s.init('noReference', r),
                                            function() {
                                                if (
                                                    s.group[r.ke].mon[r.mid].currentState
                                                        .mode !== 'stop'
                                                ) {
                                                    s.camera(
                                                        s.group[r.ke].mon[r.mid]
                                                            .currentState.mode,
                                                        s.init('noReference', r)
                                                    );
                                                }
                                                s.group[r.ke].mon_conf[r.mid] = r;
                                            }
                                        );
                                        s.tx(
                                            {
                                                f: 'monitor_edit',
                                                mid: r.mid,
                                                ke: r.ke,
                                                mon: r,
                                            },
                                            'GRP_' + r.ke
                                        );
                                        s.tx(
                                            {
                                                f: 'monitor_edit',
                                                mid: r.mid,
                                                ke: r.ke,
                                                mon: r,
                                            },
                                            'STR_' + r.ke
                                        );
                                    }, req.timeout);
                                    // req.ret.end_at=get.moment(new Date,'YYYY-MM-DD HH:mm:ss').add(req.timeout,'milliseconds');
                                }
                            } else {
                                req.ret.msg =
                                    user.lang['Monitor mode is already'] +
                                    ' : ' +
                                    req.params.f;
                            }
                        } else {
                            req.ret.msg = user.lang['Monitor or Key does not exist.'];
                        }
                        res.end(s.s(req.ret, null, 3));
                    });
            },
            res,
            req
        );
    }
);

// Get video file
app.get('/:auth/videos/:ke/:id/:file', function(req, res) {
    s.auth(
        req.params,
        function(user) {
            if (
                user.permissions.watch_videos === '0' ||
                (user.details.sub &&
                    user.details.allmonitors !== '1' &&
                    user.details.monitors.indexOf(req.params.id) === -1)
            ) {
                res.end(user.lang['Not Permitted']);
                return;
            }
            db.VideoManager
                .getVideosByWhere({
                    ke: req.params.ke,
                    mid: req.params.id,
                    time: get.nameToTime(req.params.file),
                })
                .then(function(r) {
                    if (r && r[0]) {
                        req.dir = s.video('getDir', r[0]) + req.params.file;
                        if (fs.existsSync(req.dir)) {
                            req.ext = req.params.file.split('.')[1];
                            var total = fs.statSync(req.dir).size;
                            if (req.headers['range']) {
                                var range = req.headers.range;
                                var parts = range.replace(/bytes=/, '').split('-');
                                var partialstart = parts[0];
                                var partialend = parts[1];

                                var start = parseInt(partialstart, 10);
                                var end = partialend
                                    ? parseInt(partialend, 10)
                                    : total - 1;
                                var chunksize = end - start + 1;
                                var file = fs.createReadStream(req.dir, {
                                    start: start,
                                    end: end,
                                });
                                req.headerWrite = {
                                    'Content-Range':
                                        'bytes ' + start + '-' + end + '/' + total,
                                    'Accept-Ranges': 'bytes',
                                    'Content-Length': chunksize,
                                    'Content-Type': 'video/' + req.ext,
                                };
                                req.writeCode = 206;
                            } else {
                                req.headerWrite = {
                                    'Content-Length': total,
                                    'Content-Type': 'video/' + req.ext,
                                };
                                var file = fs.createReadStream(req.dir);
                                req.writeCode = 200;
                            }
                            if (req.query.downloadName) {
                                req.headerWrite['content-disposition'] =
                                    'attachment; filename="' +
                                    req.query.downloadName +
                                    '"';
                            }
                            res.writeHead(req.writeCode, req.headerWrite);
                            file.on('close', function() {
                                res.end();
                            });
                            file.pipe(res);
                        } else {
                            res.end(user.lang['File Not Found']);
                        }
                    } else {
                        res.end(user.lang['File Not Found']);
                    }
                });
        },
        res,
        req
    );
});
//motion trigger
app.get('/:auth/motion/:ke/:id', function(req, res) {
    s.auth(
        req.params,
        function(user) {
            if (req.query.data) {
                try {
                    var d = {
                        id: req.params.id,
                        ke: req.params.ke,
                        details: JSON.parse(req.query.data),
                    };
                } catch (err) {
                    res.end('Data Broken');
                    return;
                }
            } else {
                res.end('No Data');
                return;
            }
            if (!d.ke || !d.id || !s.group[d.ke]) {
                res.end(user.lang['No Group with this key exists']);
                return;
            }
            s.camera('motion', d, function() {
                res.end(user.lang['Trigger Successful']);
            });
        },
        res,
        req
    );
});
//modify video file
app.get(
    ['/:auth/videos/:ke/:id/:file/:mode', '/:auth/videos/:ke/:id/:file/:mode/:f'],
    function(req, res) {
        req.ret = { ok: false };
        res.setHeader('Content-Type', 'application/json');
        s.auth(
            req.params,
            function(user) {
                if (
                    user.permissions.watch_videos === '0' ||
                    (user.details.sub &&
                        user.details.allmonitors !== '1' &&
                        user.details.video_delete.indexOf(req.params.id) === -1)
                ) {
                    res.end(user.lang['Not Permitted']);
                    return;
                }
                req.sql = 'SELECT * FROM Videos WHERE ke=? AND mid=? AND time=?';
                req.ar = [req.params.ke, req.params.id, get.nameToTime(req.params.file)];
                db.DBManager.db.query(req.sql, req.ar).then(function(r) {
                    if (r && r[0]) {
                        r = r[0];
                        r.filename = get.moment(r.time) + '.' + r.ext;
                        switch (req.params.mode) {
                            case 'fix':
                                req.ret.ok = true;
                                s.video('fix', r);
                                break;
                            case 'status':
                                req.params.f = parseInt(req.params.f);
                                if (isNaN(req.params.f) || req.params.f === 0) {
                                    req.ret.msg = 'Not a valid value.';
                                } else {
                                    req.ret.ok = true;
                                    db.VideoManager.updateVideoStatus({
                                        value: [
                                            req.params.f,
                                            req.params.ke,
                                            req.params.id,
                                            get.nameToTime(req.params.file),
                                        ],
                                    });
                                    s.tx(
                                        {
                                            f: 'video_edit',
                                            status: req.params.f,
                                            filename: r.filename,
                                            mid: r.mid,
                                            ke: r.ke,
                                            time: get.nameToTime(r.filename),
                                            end: get.moment(
                                                new Date(),
                                                'YYYY-MM-DD HH:mm:ss'
                                            ),
                                        },
                                        'GRP_' + r.ke
                                    );
                                }
                                break;
                            case 'delete':
                                req.ret.ok = true;
                                s.video('delete', r);
                                break;
                            default:
                                req.ret.msg = user.lang.modifyVideoText1;
                                break;
                        }
                    } else {
                        req.ret.msg = user.lang['No such file'];
                    }
                    res.end(s.s(req.ret, null, 3));
                });
            },
            res,
            req
        );
    }
);
