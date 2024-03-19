const BaseClass = require('./BaseClass');
const crc32 = require('buffer-crc32');
const crypto = require('crypto')
const deviceList = require('./DeviceList');

module.exports = class TuyaLight extends BaseClass
{
    initialized = false;
    localKey = null;
    name = 'Tuya Light';

    constructor(data, controllerCrc)
    {
        super();
        this.ip         = data.ip;
        this.devId      = data.gwId;
        this.uuid       = data.uuid;
        this.productKey = data.productKey;

        // Here I inject the product id and local key
        // Somehow we need to get these
        this.productId  = (this.devId === 'bfc855c37fb4ab51e4n80d') ? "yrg6a649fkozp1hw" : "stmkcsykq3kheboa";                        // Battletron Ball : Battletron Light Bar
        this.localKey   = (this.devId === 'bfc855c37fb4ab51e4n80d') ? "&DmRC(A4M}Lp?q;Q" : '?VfCGt;/R1_CFVuf'                           // Battletron Ball : Battletron Light Bar

        this.token      = crypto.randomBytes(16);
        this.rnd        = crypto.randomBytes(16);
        
        this.crc = this.calculateCrc(controllerCrc);
        this.leds = this.getLeds();
    }

    calculateCrc(controllerCrc)
    {
        // Calculate crc
        const crcDeviceId = this.getByteDataFromLen(25, this.getHexFromString(this.devId), true);
        let crcId = crc32(
          Buffer.concat([Buffer.from(crcDeviceId + '00', 'hex'), controllerCrc])
        ).toString("hex");

        return crcId;
    }

    getLeds()
    {
        return deviceList[this.productId].leds;
    }

    getNegotiationData()
    {
        const negotiatonHeader = Buffer.from('00000000', 'hex');
        return Buffer.concat([negotiatonHeader, this.token, this.rnd]);
    }

    setKeys(negotiationKey, sessionKey)
    {
        this.negotiationKey = negotiationKey;
        this.sessionKey = sessionKey;
        this.initialized = true;
    }

    generateColorString(colors)
    {
        let spliceLength = this.leds.length;
        if (spliceLength === 1)
        {
            const [h1,s1,v1] = this.rgbToHsv(colors[0]);
            let color = this.getByteDataFromLen(2, h1.toString(16)) +
                        this.getByteDataFromLen(1, parseInt(s1 / 10).toString(16)) +
                        this.getByteDataFromLen(1, parseInt(v1 / 10).toString(16));

            return color + "00000100";
        } else
        {
            let colorArray = [];
            colors.forEach((color) => {
                const [h,s,v] = this.rgbToHsv(color);
                colorArray.push(
                    this.getByteDataFromLen(2, h.toString(16)) +
                    this.getByteDataFromLen(2, s.toString(16)) +
                    this.getByteDataFromLen(2, v.toString(16))
                );
            });
            let colorString = '';

            this.leds.forEach((i) => {
                // colorString += this.zeroPad(i, 2);
                if (i <= 4) {
                    colorString+= '01';
                } else if (i <= 8) {
                    colorString+= '02';
                } else if (i <= 12) {
                    colorString+= '03';
                } else if (i <= 16) {
                    colorString+= '04';
                }
            });
    
            let spliceNumHex = this.zeroPad(spliceLength.toString(16), 4);
            let colorValue = '0004' + colorArray.join('') + spliceNumHex + colorString;
    
            return colorValue;
        }
        
    }
}