var fs = require('fs');
var path = require('path');

var mkdirParent = function(dirPath, mode) {
    //Call the standard fs.mkdirSync
    try {
        fs.mkdirSync(dirPath, mode)
    } catch (error) {
        if (error.code === 'ENOENT') {
            //Create all the parents recursively
            mkdirParent(path.dirname(dirPath), mode);
            //And then the directory
            mkdirParent(dirPath, mode);
        }
    }
};

module.exports = {
    mkdirParent,
}
