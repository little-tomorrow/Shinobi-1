var request = require('request');

var config = require('../conf.json');

let baseUrl = '';
if (config.ssl&&config.ssl.key&&config.ssl.cert) {
    baseUrl += 'https://';
} else {
    baseUrl += 'http://';
}
if (
    config.ip === undefined ||
    config.ip === '' ||
    config.ip.indexOf('0.0.0.0') > -1
) {
    baseUrl += 'localhost';
} else {
    baseUrl += config.ip;
}
const videoAnalysisUrl = config.videoAnalysisUrl || `${baseUrl}:5000`;
console.log(videoAnalysisUrl);

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
    deleleImages(imageNames, callback) {
        return fetch(
            {
                url: '/images/delete',
                method: 'POST',
                json: true,
                body: { image_names: imageNames }
            },
            callback
        );
    },
};
