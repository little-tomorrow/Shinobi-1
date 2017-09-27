var fs = require('fs');
var conf = require('./conf.json');

class Config extends Object {
    constructor(confJson) {
        super();

        Object.keys(confJson).forEach(key => {
            if (typeof confJson[key] === 'object') {
                this[key] = JSON.parse(JSON.stringify(confJson[key]));
            } else {
                this[key] = confJson[key];
            }
        });

        if (!this.productType) {
            this.productType = 'CE';
        }

        if (!this.language) {
            this.language = 'en_CA';
        }
        try {
            this.lang = require('./languages/' + this.language + '.json');
        } catch (er) {
            console.error(er);
            console.log('There was an error loading your language file.');
            this.lang = require('./languages/en_CA.json');
        }
        try {
            this.definitions = require('./definitions/' + this.language + '.json');
        } catch (er) {
            console.error(er);
            console.log('There was an error loading your language file.');
            this.definitions = require('./definitions/en_CA.json');
        }

        this.loadedLanguages = {
            [this.language]: this.lang,
        };
        this.loadedDefinitons = {
            [this.language]: this.definitions,
        };

        if (this.cpuUsageMarker === undefined) {
            this.cpuUsageMarker = '%Cpu';
        }
        if (this.autoDropCache === undefined) {
            this.autoDropCache = true;
        }
        if (this.doSnapshot === undefined) {
            this.doSnapshot = true;
        }
        if (this.restart === undefined) {
            this.restart = {};
        }
        if (this.systemLog === undefined) {
            this.systemLog = true;
        }
        if (this.deleteCorruptFiles === undefined) {
            this.deleteCorruptFiles = true;
        }
        if (this.restart.onVideoNotExist === undefined) {
            this.restart.onVideoNotExist = true;
        }
        if (this.ip === undefined || this.ip === '' || this.ip.indexOf('0.0.0.0') > -1) {
            this.ip = 'localhost';
        } else {
            this.bindip = this.ip;
        }
        if (this.cron === undefined) this.cron = {};
        if (this.cron.deleteOverMax === undefined) this.cron.deleteOverMax = true;
        if (this.cron.deleteOverMaxOffset === undefined)
            this.cron.deleteOverMaxOffset = 0.9;
        if (this.pluginKeys === undefined) this.pluginKeys = {};

        if (!this.windowsTempDir && process.platform === 'win32') {
            this.windowsTempDir = 'C:/Windows/Temp';
        }
        if (!this.defaultMjpeg) {
            this.defaultMjpeg = __dirname + '/web/libs/img/bg.jpg';
        }

        //default stream folder check
        if (!this.streamDir) {
            if (process.platform !== 'win32') {
                this.streamDir = '/dev/shm';
            } else {
                this.streamDir = this.windowsTempDir;
            }
            if (!fs.existsSync(this.streamDir)) {
                this.streamDir = __dirname + '/streams/';
            } else {
                this.streamDir += '/streams/';
            }
        }
        if (!this.videosDir) {
            this.videosDir = __dirname + '/videos/';
        }
        if (!this.addStorage) {
            this.addStorage = [];
        }

        if (this.cron === undefined) this.cron = {};
        if (this.cron.deleteOld === undefined) this.cron.deleteOld = true;
        if (this.cron.deleteOrphans === undefined) this.cron.deleteOrphans = true; // default false
        if (this.cron.deleteNoVideo === undefined) this.cron.deleteNoVideo = true;
        if (this.cron.deleteOverMax === undefined) this.cron.deleteOverMax = true;
        if (this.cron.deleteLogs === undefined) this.cron.deleteLogs = true;
        if (this.cron.deleteEvents === undefined) this.cron.deleteEvents = true;
        if (this.cron.interval === undefined) this.cron.interval = 1;
    }

    getLanguageFile(rule) {
        if (rule && rule !== '') {
            var file = this.loadedLanguages[file];
            if (!file) {
                try {
                    this.loadedLanguages[rule] = require('./languages/' + rule + '.json');
                    file = this.loadedLanguages[rule];
                } catch (err) {
                    file = this.lang;
                }
            }
        } else {
            file = this.lang;
        }
        return file;
    }

    getDefinitonFile(rule) {
        if (rule && rule !== '') {
            var file = this.loadedDefinitons[file];
            if (!file) {
                try {
                    this.loadedDefinitons[rule] = require('./definitions/' +
                        rule +
                        '.json');
                    file = this.loadedDefinitons[rule];
                } catch (err) {
                    file = this.definitions;
                }
            }
        } else {
            file = this.definitions;
        }
        return file;
    }
}

var config = new Config(conf);

module.exports = config;
