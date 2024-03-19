const dgram = require('dgram');
const crypto = require('crypto');
const EventEmitter = require('./EventEmitter');

module.exports = class Broadcast extends EventEmitter
{
    constructor(ip, port)
    {
        super();
        this.port = port ? port : 6667;
        this.ip = ip;
        this.key = this.md5('yGAdlopoPVldABfn');
        this.socket = dgram.createSocket('udp4');
        this.init();
    }

    init()
    {
        this.socket.bind(this.port, this.ip);
        this.socket.addListener('message', this.handleBroadcast.bind(this));
    }

    md5(input) {
        const hash = crypto.createHash('md5');
        hash.update(input);
        return hash.digest();
    }

    handleBroadcast(data, rinfo)
    {
        
        if (typeof data !== Buffer)
        {
            data = Buffer.from(data);
        }
        const prefix = data.slice(0, 4);
        
        let decryptedData = false;

        if (prefix.equals(Buffer.from([0x00, 0x00, 0x55, 0xAA]))) // Protocol up to 3.3
        {
            decryptedData = this.decryptECB(data);
        } else if (prefix.equals(Buffer.from([0x00, 0x00, 0x66, 0x99]))) // Protocol 3.4+
        {
            decryptedData = this.decryptGCM(data);
        } else
        {
            console.error('Unknown protocol');
        }

        if (decryptedData)
        {
            // Here we should get the product id and compare it to the actual white list.
            // For now I added my own device product keys
            let whiteList = [
                'keyj3w8cmutjmwk5','keycs439tffj9cw5'
            ];

            if (whiteList.includes(decryptedData.productKey))
            {
                this.trigger('broadcast.device', decryptedData, rinfo);
            }
        }
    }

    decryptECB(data)
    {
        // Create a decipher object using AES algorithm and ECB mode
        const decipher = crypto.createDecipheriv('aes-128-ecb', this.key, '');
    
        // Decrypt the message
        let decrypted = decipher.update(data.slice(20, -8), undefined, 'utf8');
        decrypted += decipher.final('utf8');
    
        // Unpad the decrypted message
        return JSON.parse(decrypted);
    }

    decryptGCM(data)
    {
        const header = data.slice(4, 18);
        const iv = data.slice(18, 30);
        const payload = data.slice(30, -20);
        const tag = data.slice(-20,-4);
        const decipher = crypto.createDecipheriv('aes-128-gcm', this.key, iv);
        decipher.setAuthTag(tag);
        decipher.setAAD(header);
        const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);


        try {
            return JSON.parse(decrypted.slice(4).toString());
        } catch(ex)
        {
            console.error(decrypted);
            console.error(ex);
        }
    }
}