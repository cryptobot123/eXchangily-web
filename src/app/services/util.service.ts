import { Injectable } from '@angular/core';
import * as CryptoJS from 'crypto-js';
import { MyCoin } from '../models/mycoin';
import * as createHash from 'create-hash';

@Injectable()
export class UtilService {
    // The aesEncrypt method is use for encrypt the message, encrypted is bytes, you can use encrypted.toString() convert to string.
    aesEncrypt(messageToEnc: string, pwd: string) {
        const encrypted = CryptoJS.AES.encrypt(messageToEnc, pwd);
        return encrypted;
        // return encrypted.toString();
    }

    aesDecrypt(encryted: any, pwd: string) {
        return CryptoJS.AES.decrypt(encryted, pwd).toString(CryptoJS.enc.Utf8);
    }   
    
    aesEncryptSeed(seed: Buffer, pwd: string) {
        const seedString = seed.toString('base64');
        return this.aesEncrypt(seedString, pwd);
    }

    aesDecryptSeed(encryted: any, pwd: string) {
        const decrytedString = this.aesDecrypt(encryted, pwd);
        return Buffer.from(decrytedString, 'base64');
    }

    getDecimal(coin: MyCoin) {
        if (coin.decimals) {
            return coin.decimals;
        }
        if (coin.name === 'ETH') {
            return 18;
        }
        return 8;
    }

    getFormattedDate(date: Date) {
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hour = date.getHours();
        const min = date.getMinutes();
        const sec = date.getSeconds();
    
        const monthStr = (month < 10 ? '0' : '') + month;
        const dayStr = (day < 10 ? '0' : '') + day;
        const hourStr = (hour < 10 ? '0' : '') + hour;
        const minStr = (min < 10 ? '0' : '') + min;
        const secStr = (sec < 10 ? '0' : '') + sec;
    
        const str = date.getFullYear() + '-' + monthStr + '-' + dayStr + ' ' +  hourStr + ':' + minStr + ':' + secStr;

        console.log('monthStr=' + monthStr + ',month=' + month);
        console.log('str=');
        console.log(str);
        return str;
    }

    SHA256(data: string) {
        return CryptoJS.SHA256(data);
    }

    fixedLengh( obj: any, length: number) {
        let str = obj.toString();
        const strLength = str.length;
        if (strLength >= length) {
            str = str.substring(strLength - length);
            console.log(str);
            return str;
        }
        for (let i = 0; i < length - strLength; i++) {
            str = '0' + str;
        }   
        return str;     
    }  

    stripHexPrefix(str) {
        if (str.length > 2 && str[0] === '0' && str[1] === 'x') {
            return str.slice(2);
        }
        return str;
    }

    convertLiuToFabcoin(amount) {
        
        return Number(Number(amount * 1e-8).toFixed(8));
    }



    number2Buffer(num) {
        var buffer = [];
        var neg = (num < 0);
        num = Math.abs(num);
        while (num) {
            buffer[buffer.length] = num & 0xff;
            num = num >> 8;
        }
    
        var top = buffer[buffer.length - 1];
        if (top & 0x80) {
            buffer[buffer.length] = neg ? 0x80 : 0x00;
        }
        else if (neg) {
            buffer[buffer.length - 1] = top | 0x80;
        }
        return Buffer.from(buffer);
    }
    
    hex2Buffer(hexString) {
        var buffer = [];
        for (var i = 0; i < hexString.length; i += 2) {
            buffer[buffer.length] = (parseInt(hexString[i], 16) << 4) | parseInt(hexString[i + 1], 16);
        }
        return Buffer.from(buffer);
    }

    toKanbanAddress(publicKey: string) {
        console.log('publicKey for toKanbanAddress is:' + publicKey);
        /*
        if (typeof publicKey === 'string') {
          switch (publicKey.length) {
            case 128:
              publicKey = this.compressPublicKey(publicKey);
              break;
            case 130:
              publicKey = this.compressPublicKey(publicKey.slice(2));
              break;
            default:
          }
        }
        */
       /*
       if(publicKey.startsWith('0x')) {
          publicKey = publicKey.slice(2);
       }
       */

      publicKey = this.stripHexPrefix(publicKey);
       const hash1 = createHash('sha256').update(Buffer.from(publicKey, 'hex')).digest().toString('hex');
       const hash2 = createHash('ripemd160').update(Buffer.from(hash1, 'hex')).digest().toString('hex');

       return '0x' + hash2;
    }    
    /*
    compressPublicKey(publicKey) {
        let prefix;
        if (parseInt(publicKey, 16) % 2 === 0) {
          prefix = '02';
        } else {
          prefix = '03';
        }
        return prefix + publicKey.slice(0, publicKey.length / 2 );    
      }
    */  
}
