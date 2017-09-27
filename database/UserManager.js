var DBManager = require('./DBManager');

function getUsers({ select, where, value = [] }) {
    return DBManager.findLimit({
        from: 'Users',
        select,
        where,
        value,
    });
}

function updateUser({ set, where, value }) {
    return DBManager.update({
        update: 'Users',
        set,
        where,
        value,
    });
}

function deleteUser({ where, value }) {
    return DBManager.delete({
        deleteFrom: 'Users',
        where,
        value,
    });
}

function addUser({ key, value }) {
    return DBManager.insertByValue({
        insert: 'Users',
        key,
        value,
    });
}

module.exports = {
    getUsers,
    updateUser,
    deleteUser,
    addUser,
    updateUserDetails({ value }) {
        return updateUser({
            set: 'details=?',
            where: 'ke=? AND uid=?',
            value,
        });
    },
    updateUserAuth({ value }) {
        return updateUser({
            set: 'auth=?',
            where: 'ke=? AND uid=?',
            value,
        });
    },
    deleteUserWhere({ value }) {
        return deleteUser({
            where: 'uid=? AND ke=? AND mail=?',
            value,
        });
    },
    addNoAuthUser({ value }) {
        return addUser({
            key: ['ke', 'uid', 'mail', 'pass', 'details'],
            value,
        });
    },
    addAuthUser({ value }) {
        return addUser({
            key: ['ke', 'uid', 'auth', 'mail', 'pass', 'details'],
            value,
        });
    },
};
