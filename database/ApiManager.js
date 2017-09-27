var DBManager = require('./DBManager');

function getAPI({ select, where, value }) {
    return DBManager.findLimit({
        from: 'API',
        select,
        where,
        value,
    });
}

function addAPI({ key, value }) {
    return DBManager.insertByValue({
        insert: 'API',
        key,
        value,
    });
}

function deleteAPI({ where, value }) {
    return DBManager.delete({
        deleteFrom: 'API',
        where,
        value,
    });
}

module.exports = {
    getAPI,
    addAPI,
    deleteAPI,
    getAllAPI({ where, value }) {
        return getAPI({
            select: '*',
            where,
            value,
        });
    },
    deleteAPIByWhere({ value }) {
        return deleteAPI({
            where: 'uid=? AND ke=?',
            value,
        });
    },
};
