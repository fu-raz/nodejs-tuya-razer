const dgram = require('dgram');
const crypto = require('crypto');
const EventEmitter = require('./EventEmitter');
const TuyaLight = require('./TuyaLight');
const crc32 = require("buffer-crc32");
const TuyaMessage = require('./TuyaMessage');

module.exports = class Controller extends EventEmitter
{
    constructor(ip, port)
    {
        super();
        this.ip = ip;
        this.port = port ? port : '40001';
        this.broadcastIp = this.getBroadcastIp(ip);
        
        this.socket = dgram.createSocket('udp4');
        this.uuid = this.getUUID();
        this.crc = this.getCrc();

        console.log('Controller uuid', this.uuid);
        console.log('Controller crc', this.crc.toString('hex'));

        this.header = Buffer.from('00006699', 'hex');
        this.versionReserved = '00';
        this.reserved = '00';
        this.tail = Buffer.from('00009966', 'hex');
        this.key = Buffer.from('6f36045d84b042e01e29b7c819e37cf7', 'hex');

        this.currentSequence = 0x01;
        this.dataLength = 42;

        this.type = {
            negotiationRequest  : '00000005',
            negotiationResponse : '00000006',
            command             : '00000010'
        };

        this.devices = new Map();
        this.devicesNegotiationData = new Map();
        this.devicesIntialized = new Map();
        this.devicesCrcs = new Map();
        this.crcsDevices = new Map();

        this.negotiationTimer = 0;
        this.negotiationCount = 0;

        this.init();
    }

    init()
    {
        this.socket.bind(this.port, this.ip);
        this.socket.addListener('message', this.handleBroadcastMessage.bind(this));

        this.startNegotiationBroadcast();
    }

    getBroadcastIp(ip)
    {
        const parts = ip.split('.');
        parts[3] = '255';
        return parts.join('.');
    }

    handleBroadcastMessage(data)
    {
        if (data.length < 64) return;

        let message = new TuyaMessage(data);
        
        if (message.isValid())
        {
            const device = this.findDeviceByCrc(message.crc.toString("hex"));
            if (!device) return;

            console.log('Response from', device.devId, device.ip, message.type);

            if (message.type.equals(Buffer.from(this.type.negotiationResponse, 'hex')))
            {
                this.handleNegotiationReponse(device, message);
            }
        }
    }

    handleNegotiationReponse(device, message)
    {
        const currentLocalKey = Buffer.from(this.getByteDataFromLen(16, this.getHexFromString(device.localKey), true), 'hex');
        
        // Generate the negotiation key using the device's local key
        const [negotiationKey] = this.encodeGCM(
            device.token,
            device.token.slice(0, 12),
            null,
            currentLocalKey
        );

        // Decrypt the incoming data using the generated key
        const [decrypt, decryptedData] = this.decodeGCM(
            message.encryptedData,
            message.nonce,
            message.add,
            negotiationKey,
            message.tag
        );

        // Decryption failed
        if (decrypt < 0)
        {
            console.error('Could not decrypt data, local key is probably wrong');
            return;
        }

        // Decryption success, now generate session key
        // Get data from decrypted data
        const rndB = decryptedData.slice(0, 16);
        const rndHmac = decryptedData.slice(16, 48);
        const sessionKeyHmac = decryptedData.slice(48, decryptedData.length);

        // Local rndhmac should be same as decrypted
        const localRndHmac = this.hmac(device.rnd, negotiationKey);
        if (!localRndHmac.equals(rndHmac))
        {
            console.error('Local and external device rnd hmacs don\'t match');
            return;
        }

        // Generate new session token
        const rndToken = this.xor(device.rnd, rndB);
        // Generate session key
        const [sessionKey] = this.encodeGCM(
            rndToken,
            device.rnd.slice(0, 12),
            null,
            negotiationKey
        );

        // Generated session key hmac should be same as decrypted session key hmac
        const localSessionKeyHmac = this.hmac(sessionKey, negotiationKey);
        if (!localSessionKeyHmac.equals(sessionKeyHmac))
        {
            console.error('Local and external session keys don\'t match');
            console.log('loc session key', localSessionKeyHmac.toString('hex'));
            console.log('ext session key', sessionKeyHmac.toString('hex'));
            return;
        }

        // Session key succesfully established
        device.setKeys(negotiationKey, sessionKey);
        console.log('Negotiation successful with', device.devId, 'saving session key', sessionKey.toString('hex'));
    }

    findDeviceByCrc(crc)
    {
        let searchDevice = null;
        this.devices.forEach((device) => {
            if (device.crc == crc)
            {
                searchDevice = device;
                return searchDevice;
            }
        });
        return searchDevice;
    }

    getUUID()
    {
        // We could randomize this if needed
        return '420691337420b00b';
    }

    getCrc()
    {
        let uuid = this.getByteDataFromLen(25, this.getHexFromString(this.uuid), true);
        let crcId = crc32(Buffer.from(uuid + '00', 'hex'));
        return crcId;
    }

    addDevice(data)
    {
        if (!this.devices.has(data.gwId))
        {
            let device = new TuyaLight(data, this.crc);
            this.devices.set(data.gwId, device);

            console.log('New device added: ', device.devId, device.crc, device.ip);
            this.startNegotiationBroadcast();
        }
    }

    startNegotiationBroadcast()
    {
        clearInterval(this.negotiationTimer);
        this.broadcastNegotiation();

        // Broadcast every two seconds a maximum of 4 times
        this.negotiationTimer = setInterval(() => {
            this.broadcastNegotiation();
            this.negotiationCount++;

            if (this.negotiationCount >= 4)
            {
                clearInterval(this.negotiationTimer);
                this.negotiationCount = 0;
                this.negotiationTimer = 0;
            }
        }, 5000);
    }

    broadcastNegotiation()
    {
        let devices = [];
        this.devices.forEach((device) => {
            // Only negotiate with devices we don't already know
            if (!device.initialized && device.localKey)
            {
                devices.push(device);
            }
        });

        // If there are no devices, return
        if (devices.length === 0) return;

        // Split the devices in broadcasts of max 5 devices;
        let deviceSplit = Math.ceil(devices.length / 5);
        while (deviceSplit > 0)
        {
            let deviceBatch = devices.splice(0, 5);
            this.negotiateDevice(deviceBatch);
            deviceSplit--;
        }
    }

    negotiateDevice(deviceBatchData)
    {
        const nonce = crypto.randomBytes(12);
        // Data generated for each device is set to a fixed 36 byte length
        // In addition the device crc id (4byte) + length (4byte) + tag (16byte) = 24 bytes
        let dataLength = (36 + 24) * deviceBatchData.length;
        let add = this.createAdd(deviceBatchData, dataLength, this.type.negotiationRequest);

        let buffer = deviceBatchData.map((device) => {
            return this.createNegotiatonRequest(device, add, nonce);
        });

        let finalData = Buffer.concat([
            this.header,
            add,
            nonce,
            ...buffer,
            this.tail
        ]);

        console.log('Broadcast', finalData.toString('hex'), this.broadcastIp, this.port);
        this.socket.send(finalData, this.port, this.broadcastIp);
    }

    getSequenceNumber()
    {
        let sequenceNum = this.currentSequence.toString(16);
        if (this.currentSequence >= 0xffffffff)
        {
            this.currentSequence = 0x01;
        } else
        {
            this.currentSequence++;
        }
        return this.getByteDataFromLen(4, sequenceNum);
    }

    createAdd(data, length, type)
    {
        const sequence = this.getSequenceNumber();
        const totalLength = this.getByteDataFromLen(4, (this.dataLength + length).toString(16));
        const frameNum = this.getByteDataFromLen(4, data.length);

        let add = Buffer.concat([
            Buffer.from(this.versionReserved + this.reserved + sequence + type, 'hex'),
            this.crc,
            Buffer.from(totalLength + frameNum, 'hex')
        ]);

        return add;
    }

    createNegotiatonRequest(device, add, nonce)
    {
        
        let deviceData = device.getNegotiationData();
        const [encodedData, tag] = this.encodeGCM(deviceData, nonce, add, this.key);

        return Buffer.concat([
            Buffer.from(device.crc, 'hex'),
            Buffer.from(this.getByteDataFromLen(4, encodedData.length.toString(16)), 'hex'),
            encodedData,
            tag
        ]);
    }

    sendColorRequest(deviceColorData)
    {
        const nonce = crypto.randomBytes(12);
        let dataLength = 0;

        deviceColorData.forEach((item) => {
            dataLength += item.value.length / 2 + 24;
        });

        let add = this.createAdd(deviceColorData, dataLength, this.type.command);

        let buffer = deviceColorData.map((colorData) => {
            return this.createColorRequest(colorData, add, nonce);
        });

        let finalData = Buffer.concat([
            this.header,
            add,
            nonce,
            ...buffer,
            this.tail
        ]);

        this.socket.send(finalData, this.port, this.broadcastIp);
    }

    createColorRequest(colorData, add, nonce)
    {
        const device = this.devices.get(colorData.devId);
        const [encodedData, tag] = this.encodeGCM(
            Buffer.from(colorData.value, 'hex'),
            nonce,
            add,
            device.sessionKey
        );

        return Buffer.concat([
            Buffer.from(device.crc, 'hex'),
            Buffer.from(this.getByteDataFromLen(4, encodedData.length.toString(16)), 'hex'),
            encodedData,
            tag
        ]);
    }

    encodeGCM(sourceData, nonce, add, key)
    {
        const cipher = crypto.createCipheriv('aes-128-gcm', key, nonce);
      
        if (add)  cipher.setAAD(add);
      
        const data = cipher.update(sourceData);
        cipher.final();
      
        const tag = cipher.getAuthTag();
      
        return [data, tag];
    }

    decodeGCM(sourceData, nonce, add, key, tag)
    {
        try {
            const decipher = crypto.createDecipheriv('aes-128-gcm', key, nonce);
            decipher.setAuthTag(tag);
            decipher.setAAD(add);

            const data = decipher.update(sourceData);
            decipher.final();

            return [1, data];
        } catch (err) {
            console.error(err);
            return [-1];
        }
    }

    hmac(sourceData, key)
    {
        const hmacD = crypto.createHmac('sha256', key);
        const data = hmacD.update(sourceData);
        return data.digest();
    }

    xor(Buffer1, Buffer2)
    {
        const result = Buffer1.map((b, i) => {
          return b ^ Buffer2[i];
        });
        return result;
    }

    sendColors(colors)
    {
        let deviceColorData = [];
        let devicesInitialized = false;

        this.devices.forEach((device)=> {
            if (device.initialized)
            {
                devicesInitialized = true;
                let colorString = device.generateColorString(colors);
                deviceColorData.push( {devId: device.devId, value: colorString});
            }
        });

        if (devicesInitialized) this.sendColorRequest(deviceColorData);
    }
}