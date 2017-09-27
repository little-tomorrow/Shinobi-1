var DBManager = require('./DBManager');

function getMonitors() {
    return DBManager.find({
        select: '*',
        from: 'Monitors',
    });
}

function getMonitorsLimit({ select, where, value }) {
    return DBManager.findLimit({
        select,
        from: 'Monitors',
        where,
        value,
    });
}

function addMonitor({ key, value }) {
    return DBManager.insertByValue({
        insert: 'Monitors',
        key,
        value,
    });
}

function updateMonitor({ set, where, value }) {
    return DBManager.update({
        update: 'Monitors',
        set,
        where,
        value,
    });
}

function deleteMonitor({ where, value }) {
    return DBManager.delete({
        deleteFrom: 'Monitors',
        where,
        value,
    });
}

module.exports = {
    getMonitors,
    getMonitorsLimit,
    addMonitor,
    updateMonitor,
    deleteMonitor,
    getAllMonitorsLimit({ where, value }) {
        return getMonitorsLimit({
            select: '*',
            where,
            value,
        });
    },
    updateMonitorByWhere({ set, value }) {
        return updateMonitor({
            where: 'ke=? AND mid=?',
            set,
            value,
        });
    },
    deleteMonitorByWhere({ value }) {
        return deleteMonitor({
            where: 'ke=? AND mid=?',
            value,
        });
    },
};
