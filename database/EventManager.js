var DBManager = require('./DBManager');

function addEvent({ key, value }) {
    return DBManager.insertByValue({
        insert: 'Events',
        key,
        value,
    });
}

function deleteEvent({where, value}) {
    return DBManager.delete({
        deleteFrom: 'Events',
        where,
        value,
    })
}

module.exports = {
    addEvent,
    deleteEvent,
    addNewEvent({ value }) {
        return addEvent({
            key: ['ke', 'mid', 'details'],
            value,
        });
    },
};
