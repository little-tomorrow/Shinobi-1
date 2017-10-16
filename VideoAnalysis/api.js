var request = require('request');

var config = require('../conf.json');

const videoAnalysisUrl = config.videoAnalysisUrl || 'http://localhost:5000';

var baseRequest = request.defaults({
    baseUrl: videoAnalysisUrl,
})

/**
 * Requests a URL, returning a promise.
 *
 * @param  {string} url       The URL we want to request
 * @param  {object} [options] The options we want to pass to "fetch"
 * @param  {function()} [callback]
 */
function fetch(options, callback) {
    return baseRequest(options, callback);
}

module.exports = {
    videoAnalysisUrl,
    getAnalysisResult(videoName, videoPath, callback) {
        return fetch(
            {
                url: '/monitor_videos/result',
                method: 'POST',
                form: { video_name: videoName, video_path: videoPath },
            },
            callback
        );
    },
};
