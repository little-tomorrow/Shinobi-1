var DBManager = require('./DBManager');

function addLog({ ke, mid, info }) {
    return DBManager.insertByValue({
        insert: 'Logs',
        key: ['ke', 'mid', 'info'],
        value: [ke, mid, info],
    });
}

function deleteLog({where, value}) {
    return DBManager.delete({
        deleteFrom: 'Logs',
        where,
        value,
    })
}

function deleteLogByKe({ ke }) {
    return deleteLog({
        where: 'ke=?',
        value: [ke],
    });
}

function getLog({ where, value }) {
    return DBManager.findLimit({
        select: '*',
        from: 'Logs',
        where,
        value,
    });
}

function getLogByKe({ ke }) {
    return getLog({
        where: 'ke=? ORDER BY `time` DESC LIMIT 30',
        value: [ke],
    });
}

module.exports = {
    addLog,
    deleteLog,
    deleteLogByKe,
    getLog,
    getLogByKe,
};
