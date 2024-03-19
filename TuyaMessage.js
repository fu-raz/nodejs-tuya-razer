module.exports = class TuyaMessage
{
    validHeader = Buffer.from('00006699', 'hex');
    validTail = Buffer.from('00009966', 'hex');

    constructor(data)
    {
        if (data)
        {
            this.header = data.slice(0, 4);
            this.add = data.slice(4, 26);
            this.type = data.slice(10, 14);
            this.crc = data.slice(14, 18);
            
            this.nonce = data.slice(26, 38);
            this.length = data.slice(42, 46);
            this.encryptedData = data.slice(46, 46 + parseInt(this.length.toString("hex"), 16));
            this.tag = data.slice(46 + parseInt(this.length.toString("hex"), 16), data.length - 4);
            this.tail = data.slice(data.length - 4, data.length);
        }
    }

    isValid()
    {
        return (this.header.equals(this.validHeader) && this.tail.equals(this.validTail));
    }
}