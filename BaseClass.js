module.exports = class BaseClass
{
    getHexFromString(str) {
        return Buffer.from(str, 'utf-8').toString('hex');
    }

    getByteDataFromLen(len, data, atEnd = false)
    {
        // Zero pad or append
        data = data.toString();
        const stringLength = len * 2;
        const padding = '0'.repeat(stringLength - data.length);
        return atEnd ? data + padding : padding + data;
    }

    zeroPad(string, len)
    {
        let zeroPadded = "0".repeat(len) + string;
        return zeroPadded.slice(-len);
    }

    rgbToHsv(arr)
    {
        let h = 0;
        let s = 0;
        let v = 0;
        let r = arr[0];
        let g = arr[1];
        let b = arr[2];
        arr.sort(function (a, b) {
          return a - b;
        });
        var max = arr[2];
        var min = arr[0];
        v = max / 255;
        if (max === 0) {
          s = 0;
        } else {
          s = 1 - min / max;
        }
        if (max === min) {
          h = 0;
        } else if (max === r && g >= b) {
          h = 60 * ((g - b) / (max - min)) + 0;
        } else if (max === r && g < b) {
          h = 60 * ((g - b) / (max - min)) + 360;
        } else if (max === g) {
          h = 60 * ((b - r) / (max - min)) + 120;
        } else if (max === b) {
          h = 60 * ((r - g) / (max - min)) + 240;
        }
      
        h = parseInt(h);
        s = parseInt(s * 1000);
        v = parseInt(v * 1000);
        return [h, s, v];
    }
}