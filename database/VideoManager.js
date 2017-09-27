var DBManager = require('./DBManager');

function getVideos({ where, value }) {
    return DBManager.findLimit({
        select: '*',
        from: 'Videos',
        where,
        value,
    });
}

function getVideosCount({ where, value }) {
    return DBManager.findLimit({
        select: 'COUNT(*)',
        from: 'Videos',
        where,
        value,
    });
}

function updateVideo({ set, where, value }) {
    return DBManager.update({
        update: 'Videos',
        set,
        where,
        value,
    });
}

function deleteVideos({ where, value }) {
    return DBManager.delete({
        deleteFrom: 'Videos',
        where,
        value,
    });
}

function addVideo({ key, value }) {
    return DBManager.insertByValue({
        insert: 'Videos',
        key,
        value,
    });
}

module.exports = {
    getVideos,
    getVideosCount,
    updateVideo,
    deleteVideos,
    addVideo,
    getVideosCountByKe({ ke }) {
        return getVideosCount({
            where: 'ke=?',
            value: [ke],
        });
    },

    getVideosByWhere(value = {}) {
        var values = [];
        var where = [];
        Object.keys(value).forEach(key => {
            where.push('`' + key + '`' + '=?');
            values.push(value[key]);
        });
        return getVideos({
            where: where.join(' AND '),
            value: values,
        });
    },

    updateVideoStatus({ value }) {
        return updateVideo({
            set: 'status=?',
            where: '`ke`=? AND `mid`=? AND `time`=?',
            value,
        });
    },
    addNewVideo({ value }) {
        return addVideo({
            key: ['mid', 'ke', 'time', 'ext', 'status', 'details'],
            value,
        });
    },
};
