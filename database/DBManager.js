var mysql = require('mysql');
var moment = require('moment');
var config = require('../Config');
var io = require('../io');

var lang = config.getLanguageFile();

class Database {
    constructor(config) {
        this.connection = mysql.createConnection(config);
        this.startConnect();
    }

    startConnect() {
        this.connect().catch(err => {
            if (err) {
                this.systemLog(lang['Error Connecting'] + ' : DB', err);
                setTimeout(() => {
                    // this.startConnect();
                }, 2000);
            }
        });
        this.on('error').catch(err => {
            this.systemLog(lang['DB Lost.. Retrying..']);
            this.systemLog(err);
            // this.startConnect();
            return;
        });
        this.on('connect').then(() => {
            this.query(
                'ALTER TABLE `Videos` ADD COLUMN `details` TEXT NULL DEFAULT NULL AFTER `status`;'
            ).catch(err => {
                if (err) {
                    this.systemLog('Already applied critical update.');
                }
            });
        });
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.connection.connect((err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    }

    query(sql, args) {
        return new Promise((resolve, reject) => {
            this.connection.query(sql, args, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    }

    close() {
        return new Promise((resolve, reject) => {
            this.connection.end((err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    }

    on(event) {
        if (event === 'error') {
            return new Promise((resolve, reject) => {
                this.connection.on(event, (err, data) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(data);
                    }
                });
            });
        }
        return new Promise((resolve, reject) => {
            this.connection.on(event, args => {
                resolve(args);
            });
        });
    }

    systemLog(q, w, e) {
        if (!w) {
            w = '';
        }
        if (!e) {
            e = '';
        }
        if (typeof q === 'string') {
            this.query('INSERT INTO Logs (ke,mid,info) VALUES (?,?,?)', [
                '$',
                '$SYSTEM',
                JSON.stringify({ type: q, msg: w }),
            ]);
            io.to('$').emit('f', {
                f: 'log',
                log: {
                    time: moment(),
                    ke: '$',
                    mid: '$SYSTEM',
                    info: JSON.stringify({ type: q, msg: w }),
                },
            });
        }
        return console.log(moment().format(), q, w, e);
    }
}

var db = new Database(config.db);

module.exports = {
    db,
    find({ select, from }) {
        return db.query(`SELECT ${select} FROM ${from}`);
    },
    findLimit({ select, from, where, value = [] }) {
        if (value && value.length > 0) {
            return db.query(`SELECT ${select} FROM ${from} WHERE ${where}`, value);
        }
        return db.query(`SELECT ${select} FROM ${from} WHERE ${where}`);
    },
    update({ update, set, where, value }) {
        return db.query(`UPDATE ${update} SET ${set} WHERE ${where}`, value);
    },
    insert({ insert, key, value }) {
        return db.query(
            `INSERT INTO ${insert} (${key.join(',')}) VALUES (${value.join(',')})`
        );
    },
    insertByValue({ insert, key, value, VALUES = key.map(e => '?') }) {
        return db.query(
            `INSERT INTO ${insert} (${key.join(',')}) VALUES (${VALUES.join(',')})`,
            value
        );
    },
    delete({ deleteFrom, where, value }) {
        return db.query(`DELETE FROM ${deleteFrom} WHERE ${where}`, value);
    },
};
