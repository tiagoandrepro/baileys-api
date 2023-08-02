import fs from 'fs'

const compareAndFilter = (array1, array2) => {
    return array1.filter(function (item) {
        return array2.includes(item);
    });
}

const isUrlValid = (url) => {
    return /^(?:(?:(?:https?|ftp):)\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})))(?::\d{2,5})?(?:[/?#]\S*)?$/i.test(url) ? true : false;

}

const fileExists = (path) => {
    return fs.existsSync(path) ? true : false;
}

const deleteFile = async (path) => {
    return new Promise((resolve, reject) => {
        fs.unlink(path, (err) => {
            (err) ? reject(err) : resolve(true);
        });
    });
}

export { compareAndFilter, isUrlValid, fileExists, deleteFile }

